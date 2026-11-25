/**
 * O motor do gestor do dono (dono, 25/11/2026): o dono escreve (ou manda áudio) para o
 * número oficial e quem responde é o assistente dele. As regras puras estão em
 * gestor-regras.ts; a função que recebe é a gestor-responder.
 *
 * O que ele pode: contar os números da prospecção, listar quem respondeu, achar e ler
 * conversas, mostrar a agenda, remarcar e cancelar reunião, ligar e desligar o Davi
 * numa conversa e, só quando o dono pede com todas as letras, mandar mensagem a um lead.
 */
import {
  type Conversa, type Db, type Instancia, type Mensagem, REMETENTE,
  atualizarEtapaECard, carregarConversa, chamarClaude, lerConfig, linhaDaConversa, transcreverAudios,
} from './assistente.ts';
import { ROTULO_DA_ETAPA, dentroDoHorario, type Etapa } from './assistente-regras.ts';
import { configYCloud, enviarTextoPorYCloud } from './ycloud.ts';
import {
  STATUS_DA_LOJA, conflitosDaAgenda, conversaDaChave, horaCurta, inicioDoDiaBRT, lerHorario, nomeDoEnvio,
  partirMensagem, quandoFalado, taxa,
} from './gestor-regras.ts';

/** Como as respostas do gestor aparecem na caixa do CRM. */
export const REMETENTE_GESTOR = 'Gestor';
const MODELO_PADRAO = 'claude-opus-5-5';
const MAX_VOLTAS = 10;

const agoraISO = () => new Date().toISOString();
const corta = (t: unknown, n = 300) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/* ── ferramentas ─────────────────────────────────────────────────── */

const FERRAMENTAS = [
  {
    name: 'numeros_da_prospeccao',
    description: 'Os números da prospecção num período: mensagens enviadas por etapa da sequência, quantas lojas responderam depois de cada uma, quem disse não, quem foi para o CRM, reuniões marcadas. Use para "como tá hoje", "teve resposta", "o criativo tá ruim".',
    input_schema: {
      type: 'object',
      properties: {
        desde_dias: { type: 'integer', description: '0 = só hoje (padrão), 1 = ontem e hoje, 7 = últimos 7 dias…' },
      },
    },
  },
  {
    name: 'quem_respondeu',
    description: 'As lojas que responderam no período, com o que escreveram, em que pé está a conversa e o id da conversa.',
    input_schema: {
      type: 'object',
      properties: { desde_dias: { type: 'integer', description: '0 = hoje (padrão)' } },
    },
  },
  {
    name: 'buscar_conversa',
    description: 'Acha conversas pelo nome da loja, da pessoa, cidade ou pelos dígitos do telefone. Devolve id, nome, etapa e a última mensagem.',
    input_schema: {
      type: 'object',
      properties: { texto: { type: 'string' } },
      required: ['texto'],
    },
  },
  {
    name: 'ler_conversa',
    description: 'As últimas mensagens de uma conversa (com quem falou cada uma) e o estado dela: etapa, Davi ligado ou não, reunião, card do funil.',
    input_schema: {
      type: 'object',
      properties: {
        conversa_id: { type: 'string' },
        ultimas: { type: 'integer', description: 'quantas mensagens (padrão 30, máximo 80)' },
      },
      required: ['conversa_id'],
    },
  },
  {
    name: 'agenda',
    description: 'As reuniões marcadas daqui para a frente (ou nos próximos N dias), com id, horário, loja e a conversa ligada.',
    input_schema: {
      type: 'object',
      properties: { proximos_dias: { type: 'integer', description: 'padrão 7' } },
    },
  },
  {
    name: 'remarcar_reuniao',
    description: 'Muda o horário de uma reunião na agenda do sistema. Não avisa o lead (para isso, enviar_mensagem_ao_lead, só se o dono pedir). Se bater com outra reunião a menos de 1 hora, devolve o conflito e só remarca com forcar=true depois que o dono confirmar.',
    input_schema: {
      type: 'object',
      properties: {
        reuniao_id: { type: 'string' },
        novo_inicio: { type: 'string', description: 'horário de Brasília, "AAAA-MM-DDTHH:MM"' },
        forcar: { type: 'boolean' },
      },
      required: ['reuniao_id', 'novo_inicio'],
    },
  },
  {
    name: 'cancelar_reuniao',
    description: 'Cancela uma reunião na agenda do sistema. Não avisa o lead.',
    input_schema: {
      type: 'object',
      properties: { reuniao_id: { type: 'string' }, motivo: { type: 'string' } },
      required: ['reuniao_id'],
    },
  },
  {
    name: 'davi_na_conversa',
    description: 'Liga (o Davi volta a responder sozinho) ou desliga (o Davi para e a conversa fica para o dono) o Davi numa conversa.',
    input_schema: {
      type: 'object',
      properties: { conversa_id: { type: 'string' }, ligado: { type: 'boolean' } },
      required: ['conversa_id', 'ligado'],
    },
  },
  {
    name: 'enviar_mensagem_ao_lead',
    description: 'Manda uma mensagem de texto a um lead pelo número oficial. SÓ quando o dono pediu com todas as letras para mandar (ex.: "manda pra ele o site", "avisa que mudou pra 15h"). Só funciona se o lead escreveu nas últimas 24 h e entre 08h e 20h.',
    input_schema: {
      type: 'object',
      properties: { conversa_id: { type: 'string' }, texto: { type: 'string' } },
      required: ['conversa_id', 'texto'],
    },
  },
] as const;

type Entrada = Record<string, unknown>;

async function nomeDaConversa(db: Db, ids: string[]): Promise<Record<string, { nome: string; telefone: string }>> {
  if (!ids.length) return {};
  const { data } = await db.from('wa_conversas').select('id, nome, telefone').in('id', ids);
  return Object.fromEntries((data ?? []).map((c: { id: string; nome: string | null; telefone: string }) => [c.id, { nome: c.nome ?? c.telefone, telefone: c.telefone }]));
}

async function numerosDaProspeccao(db: Db, e: Entrada) {
  const dias = Math.max(0, Math.min(60, Number(e.desde_dias ?? 0) || 0));
  const desde = inicioDoDiaBRT(new Date(), dias).toISOString();
  const { data: envios } = await db.from('prospeccao_envios')
    .select('loja_id, tipo, numero, erro, enviada_em').gte('enviada_em', desde).limit(5000);
  const ids = [...new Set((envios ?? []).map((x: { loja_id: string }) => x.loja_id))];
  const lojas: Record<string, { respondeu_em: string | null; status: string }> = {};
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await db.from('prospeccao_lojas').select('id, respondeu_em, status').in('id', ids.slice(i, i + 300));
    for (const l of data ?? []) lojas[l.id] = l;
  }
  const porEtapa: Record<string, { enviadas: number; erros: number; responderam: number }> = {};
  for (const x of envios ?? []) {
    const k = nomeDoEnvio(x.tipo, Number(x.numero));
    porEtapa[k] ??= { enviadas: 0, erros: 0, responderam: 0 };
    if (x.erro) { porEtapa[k].erros++; continue; }
    porEtapa[k].enviadas++;
    const l = lojas[x.loja_id];
    if (l?.respondeu_em && l.respondeu_em >= x.enviada_em) porEtapa[k].responderam++;
  }
  const { data: responderam } = await db.from('prospeccao_lojas').select('status').gte('respondeu_em', desde).limit(2000);
  const statusDasQueResponderam: Record<string, number> = {};
  for (const l of responderam ?? []) statusDasQueResponderam[STATUS_DA_LOJA[l.status] ?? l.status] = (statusDasQueResponderam[STATUS_DA_LOJA[l.status] ?? l.status] ?? 0) + 1;
  const { count: semInteresse } = await db.from('prospeccao_lojas').select('id', { count: 'exact', head: true })
    .eq('status', 'sem_interesse').gte('atualizada_em', desde);
  const { data: avisos } = await db.from('wa_envios').select('chave').like('template', 'aviso_lead%').gte('created_at', desde).limit(500);
  const leadsNoCrm = new Set((avisos ?? []).map((a: { chave: string }) => conversaDaChave(a.chave)).filter(Boolean)).size;
  const { count: reunioes } = await db.from('meetings').select('id', { count: 'exact', head: true }).gte('created_at', desde).neq('status', 'cancelada');
  const { count: naFila } = await db.from('prospeccao_lojas').select('id', { count: 'exact', head: true }).eq('status', 'pronta');
  return {
    periodo: dias === 0 ? 'hoje (desde 00h)' : `desde ${horaCurta(desde).slice(0, 5)} (${dias + 1} dias)`,
    por_mensagem_da_sequencia: Object.fromEntries(Object.entries(porEtapa).map(([k, v]) => [k, {
      enviadas: v.enviadas, falharam: v.erros, lojas_que_responderam_depois: taxa(v.responderam, v.enviadas),
    }])),
    lojas_diferentes_que_receberam: ids.length,
    lojas_que_responderam_no_periodo: (responderam ?? []).length,
    em_que_pe_estao_as_que_responderam: statusDasQueResponderam,
    disseram_que_nao_tem_interesse: semInteresse ?? 0,
    leads_levados_ao_crm: leadsNoCrm,
    reunioes_marcadas: reunioes ?? 0,
    lojas_ainda_na_fila: naFila ?? 0,
  };
}

async function quemRespondeu(db: Db, e: Entrada) {
  const dias = Math.max(0, Math.min(30, Number(e.desde_dias ?? 0) || 0));
  const desde = inicioDoDiaBRT(new Date(), dias).toISOString();
  const { data: lojas } = await db.from('prospeccao_lojas')
    .select('id, nome, cidade, uf, status, motivo, conversa_id, respondeu_em, dor')
    .gte('respondeu_em', desde).order('respondeu_em', { ascending: false }).limit(40);
  const convIds = (lojas ?? []).map((l: { conversa_id: string | null }) => l.conversa_id).filter(Boolean) as string[];
  const { data: estados } = convIds.length
    ? await db.from('assistente_conversas').select('conversa_id, etapa, modo, reuniao_id').in('conversa_id', convIds)
    : { data: [] };
  const est = Object.fromEntries((estados ?? []).map((x: { conversa_id: string }) => [x.conversa_id, x]));
  const saida: Record<string, unknown>[] = [];
  for (const l of lojas ?? []) {
    let falas: string[] = [];
    if (l.conversa_id) {
      const { data: msgs } = await db.from('wa_mensagens').select('conteudo, transcricao, tipo, created_at')
        .eq('conversa_id', l.conversa_id).eq('direcao', 'entrada').gte('created_at', desde)
        .order('created_at', { ascending: true }).limit(6);
      falas = (msgs ?? []).map((m: { conteudo: string | null; transcricao: string | null; tipo: string; created_at: string }) =>
        `${horaCurta(m.created_at).slice(6)} ${m.tipo === 'audio' ? `(áudio) ${corta(m.transcricao ?? '', 160)}` : corta(m.conteudo, 160)}`);
    }
    // deno-lint-ignore no-explicit-any
    const s: any = l.conversa_id ? est[l.conversa_id] : null;
    saida.push({
      loja: `${l.nome}${l.cidade ? `, ${l.cidade}${l.uf ? `/${l.uf}` : ''}` : ''}`,
      conversa_id: l.conversa_id,
      situacao: STATUS_DA_LOJA[l.status] ?? l.status,
      etapa_com_o_davi: s ? (ROTULO_DA_ETAPA[s.etapa as Etapa] ?? s.etapa) : null,
      davi_ligado: s ? s.modo !== 'desligado' : null,
      tem_reuniao: !!s?.reuniao_id,
      dor: l.dor ?? null,
      motivo: l.motivo ?? null,
      o_que_escreveu: falas,
    });
  }
  return { periodo: dias === 0 ? 'hoje' : `últimos ${dias + 1} dias`, total: saida.length, lojas: saida };
}

async function buscarConversa(db: Db, e: Entrada) {
  const texto = corta(e.texto, 80);
  if (!texto) return { erro: 'diga o que procurar' };
  const digitos = texto.replace(/\D/g, '');
  const termo = texto.replace(/[%_,()]/g, ' ').trim();
  const { data: oficial } = await db.from('wa_instancias').select('id').eq('origem', 'ycloud');
  const inst = (oficial ?? []).map((i: { id: string }) => i.id);
  let q = db.from('wa_conversas').select('id, nome, telefone, ultima_mensagem, ultima_mensagem_em, instancia_id');
  q = digitos.length >= 6 ? q.like('telefone', `%${digitos.slice(-8)}%`) : q.ilike('nome', `%${termo}%`);
  const { data: porConversa } = await q.order('ultima_mensagem_em', { ascending: false }).limit(10);
  const { data: porLoja } = digitos.length >= 6 ? { data: [] } : await db.from('prospeccao_lojas')
    .select('nome, cidade, uf, status, conversa_id').or(`nome.ilike.%${termo}%,cidade.ilike.%${termo}%`)
    .not('conversa_id', 'is', null).limit(10);
  const { data: porCard } = digitos.length >= 6 ? { data: [] } : await db.from('prospects')
    .select('id, company_name, contact_name, city, stage').or(`company_name.ilike.%${termo}%,contact_name.ilike.%${termo}%`).limit(8);
  const ids = new Set<string>((porConversa ?? []).map((c: { id: string }) => c.id));
  for (const l of porLoja ?? []) if (l.conversa_id) ids.add(l.conversa_id);
  if ((porCard ?? []).length) {
    const { data: conv } = await db.from('wa_conversas').select('id').in('prospect_id', porCard.map((p: { id: string }) => p.id));
    for (const c of conv ?? []) ids.add(c.id);
  }
  if (!ids.size) return { achadas: 0, cards_do_funil_sem_conversa: porCard ?? [] };
  const { data: convs } = await db.from('wa_conversas')
    .select('id, nome, telefone, ultima_mensagem, ultima_mensagem_em, instancia_id').in('id', [...ids]).limit(15);
  const { data: estados } = await db.from('assistente_conversas').select('conversa_id, etapa, modo').in('conversa_id', [...ids]);
  const est = Object.fromEntries((estados ?? []).map((x: { conversa_id: string }) => [x.conversa_id, x]));
  return {
    achadas: (convs ?? []).length,
    conversas: (convs ?? []).map((c: { id: string; nome: string | null; telefone: string; ultima_mensagem: string | null; ultima_mensagem_em: string | null; instancia_id: string }) => ({
      conversa_id: c.id,
      nome: c.nome ?? c.telefone,
      telefone: c.telefone,
      numero_oficial: inst.includes(c.instancia_id),
      // deno-lint-ignore no-explicit-any
      etapa_com_o_davi: est[c.id] ? (ROTULO_DA_ETAPA[(est[c.id] as any).etapa as Etapa] ?? null) : null,
      ultima: c.ultima_mensagem_em ? `${horaCurta(c.ultima_mensagem_em)}: ${corta(c.ultima_mensagem, 120)}` : null,
    })),
  };
}

async function lerUmaConversa(db: Db, e: Entrada) {
  const id = String(e.conversa_id ?? '');
  const n = Math.max(5, Math.min(80, Number(e.ultimas ?? 30) || 30));
  const c = await carregarConversa(db, id);
  if (!c) return { erro: 'conversa não encontrada' };
  await transcreverAudios(db, c.msgs.slice(-n), c.inst, Date.now() + 20_000).catch(() => []);
  const { data: s } = await db.from('assistente_conversas')
    .select('etapa, modo, reuniao_id, prospect_id, situacao, dores, pausado_motivo').eq('conversa_id', id).maybeSingle();
  const { data: reuniao } = s?.reuniao_id
    ? await db.from('meetings').select('id, scheduled_at, status').eq('id', s.reuniao_id).maybeSingle()
    : { data: null };
  const { data: card } = s?.prospect_id
    ? await db.from('prospects').select('company_name, contact_name, stage, city').eq('id', s.prospect_id).maybeSingle()
    : { data: null };
  const { data: loja } = await db.from('prospeccao_lojas').select('nome, cidade, uf, status, dor, quem_atende').eq('conversa_id', id).maybeSingle();
  return {
    conversa_id: id,
    nome: c.conversa.nome ?? c.conversa.telefone,
    telefone: c.conversa.telefone,
    loja: loja ? { nome: loja.nome, cidade: loja.cidade, uf: loja.uf, situacao: STATUS_DA_LOJA[loja.status] ?? loja.status, dor: loja.dor, quem_atende: loja.quem_atende } : null,
    etapa_com_o_davi: s ? (ROTULO_DA_ETAPA[s.etapa as Etapa] ?? s.etapa) : 'o Davi não está nesta conversa',
    davi_ligado: s ? s.modo !== 'desligado' : false,
    por_que_o_davi_parou: s?.pausado_motivo ?? null,
    reuniao: reuniao ? { id: reuniao.id, quando: quandoFalado(reuniao.scheduled_at), status: reuniao.status } : null,
    card_do_funil: card ?? null,
    quem_fala: s?.situacao?.quem_fala ?? null,
    mensagens: c.msgs.slice(-n).map((m: Mensagem) => linhaDaConversa(m).replace('] ASSISTENTE:', '] DAVI:')),
  };
}

async function agenda(db: Db, e: Entrada) {
  const dias = Math.max(1, Math.min(60, Number(e.proximos_dias ?? 7) || 7));
  const { data } = await db.from('meetings').select('id, title, scheduled_at, status, prospect_id, duration_min')
    .gte('scheduled_at', new Date(Date.now() - 2 * 3_600_000).toISOString())
    .lte('scheduled_at', new Date(Date.now() + dias * 86_400_000).toISOString())
    .neq('status', 'cancelada').order('scheduled_at', { ascending: true }).limit(40);
  const ids = (data ?? []).map((m: { id: string }) => m.id);
  const { data: est } = ids.length
    ? await db.from('assistente_conversas').select('conversa_id, reuniao_id').in('reuniao_id', ids)
    : { data: [] };
  const conv = Object.fromEntries((est ?? []).map((x: { reuniao_id: string; conversa_id: string }) => [x.reuniao_id, x.conversa_id]));
  return {
    reunioes: (data ?? []).map((m: { id: string; title: string; scheduled_at: string; status: string }) => ({
      reuniao_id: m.id, quando: quandoFalado(m.scheduled_at), titulo: m.title, status: m.status, conversa_id: conv[m.id] ?? null,
    })),
  };
}

async function remarcar(db: Db, e: Entrada) {
  const id = String(e.reuniao_id ?? '');
  const inicio = lerHorario(String(e.novo_inicio ?? ''));
  if (!inicio) return { erro: 'horário inválido: use AAAA-MM-DDTHH:MM (Brasília)' };
  if (inicio.getTime() < Date.now()) return { erro: 'esse horário já passou' };
  const { data: r } = await db.from('meetings').select('id, title, scheduled_at, status').eq('id', id).maybeSingle();
  if (!r) return { erro: 'reunião não encontrada' };
  if (r.status === 'cancelada') return { erro: 'essa reunião está cancelada' };
  const { data: perto } = await db.from('meetings').select('id, title, scheduled_at, status')
    .gte('scheduled_at', new Date(inicio.getTime() - 3 * 3_600_000).toISOString())
    .lte('scheduled_at', new Date(inicio.getTime() + 3 * 3_600_000).toISOString());
  const conflitos = conflitosDaAgenda(inicio, perto ?? [], id);
  if (conflitos.length && e.forcar !== true) {
    return {
      feito: false,
      conflito: conflitos.map((c) => `${c.title ?? 'reunião'} ${quandoFalado(c.scheduled_at)}`),
      instrucao: 'Conte ao dono e só remarque com forcar=true se ele confirmar.',
    };
  }
  const { error } = await db.from('meetings').update({ scheduled_at: inicio.toISOString(), status: 'agendada' }).eq('id', id);
  if (error) return { erro: `a agenda não aceitou: ${error.message}` };
  return { feito: true, reuniao: r.title, antes: quandoFalado(r.scheduled_at), agora: quandoFalado(inicio), lead_avisado: false };
}

async function cancelar(db: Db, e: Entrada) {
  const id = String(e.reuniao_id ?? '');
  const { data: r } = await db.from('meetings').select('id, title, scheduled_at, status, notes').eq('id', id).maybeSingle();
  if (!r) return { erro: 'reunião não encontrada' };
  const nota = [r.notes, `Cancelada pelo dono pelo WhatsApp${e.motivo ? `: ${corta(e.motivo, 200)}` : ''}.`].filter(Boolean).join('\n');
  const { error } = await db.from('meetings').update({ status: 'cancelada', notes: nota }).eq('id', id);
  if (error) return { erro: `a agenda não aceitou: ${error.message}` };
  const { data: est } = await db.from('assistente_conversas').select('conversa_id').eq('reuniao_id', id).maybeSingle();
  if (est?.conversa_id) await atualizarEtapaECard(db, est.conversa_id).catch(() => null);
  return { feito: true, reuniao: r.title, era: quandoFalado(r.scheduled_at), lead_avisado: false };
}

async function daviNaConversa(db: Db, e: Entrada) {
  const id = String(e.conversa_id ?? '');
  const ligado = e.ligado === true;
  const { data: s } = await db.from('assistente_conversas').select('modo, loja_id').eq('conversa_id', id).maybeSingle();
  if (!s && !ligado) return { feito: true, observacao: 'o Davi já não estava nessa conversa' };
  if (!s) {
    const { error } = await db.from('assistente_conversas').insert({ conversa_id: id, modo: 'sozinho' });
    if (error) return { erro: error.message };
  } else {
    const { error } = await db.from('assistente_conversas')
      .update({ modo: ligado ? 'sozinho' : 'desligado', pausado_motivo: ligado ? null : 'O dono pediu pelo WhatsApp para assumir.' })
      .eq('conversa_id', id);
    if (error) return { erro: error.message };
  }
  if (!ligado) await db.from('wa_conversas').update({ fixada: true }).eq('id', id);
  return { feito: true, davi_ligado: ligado };
}

async function enviarAoLead(db: Db, e: Entrada) {
  const id = String(e.conversa_id ?? '');
  const texto = String(e.texto ?? '').trim();
  if (!texto) return { erro: 'mensagem vazia' };
  if (!dentroDoHorario()) return { feito: false, motivo: 'Fora das 08h–20h: mensagem a lead só sai nesse horário.' };
  const c = await carregarConversa(db, id);
  if (!c) return { erro: 'conversa não encontrada' };
  if (c.inst.origem !== 'ycloud') return { feito: false, motivo: 'Essa conversa é de outro número, não do oficial.' };
  const ultima = [...c.msgs].reverse().find((m) => m.direcao === 'entrada');
  if (!ultima || Date.now() - new Date(ultima.created_at).getTime() > 23.5 * 3_600_000) {
    return { feito: false, motivo: 'O lead não escreveu nas últimas 24 h: o WhatsApp só deixa mandar modelo aprovado.' };
  }
  const cfg = configYCloud();
  if (!cfg) return { erro: 'o número oficial está sem credenciais' };
  const { id: pid } = await enviarTextoPorYCloud(cfg, { para: c.conversa.telefone, texto });
  await gravarSaida(db, c.conversa, c.inst, texto, pid, 'Xavier (pelo gestor)');
  return { feito: true, enviado: texto, para: c.conversa.nome ?? c.conversa.telefone };
}

async function rodarFerramenta(db: Db, nome: string, e: Entrada): Promise<unknown> {
  switch (nome) {
    case 'numeros_da_prospeccao': return await numerosDaProspeccao(db, e);
    case 'quem_respondeu': return await quemRespondeu(db, e);
    case 'buscar_conversa': return await buscarConversa(db, e);
    case 'ler_conversa': return await lerUmaConversa(db, e);
    case 'agenda': return await agenda(db, e);
    case 'remarcar_reuniao': return await remarcar(db, e);
    case 'cancelar_reuniao': return await cancelar(db, e);
    case 'davi_na_conversa': return await daviNaConversa(db, e);
    case 'enviar_mensagem_ao_lead': return await enviarAoLead(db, e);
    default: return { erro: `ferramenta desconhecida: ${nome}` };
  }
}

/* ── gravar e mandar ─────────────────────────────────────────────── */

async function gravarSaida(db: Db, conversa: Pick<Conversa, 'id'>, inst: Pick<Instancia, 'id'>, texto: string, providerId: string | null, remetente: string) {
  const agora = agoraISO();
  const { error } = await db.from('wa_mensagens').insert({
    conversa_id: conversa.id, instancia_id: inst.id, direcao: 'saida', tipo: 'texto', conteudo: texto,
    provider_message_id: providerId || null, status: 'enviada', enviada_por_nome: remetente, created_at: agora,
  });
  if (error && error.code !== '23505') console.warn('gestor: mensagem enviada mas não gravada', error.message);
  await db.from('wa_conversas').update({ ultima_mensagem: texto, ultima_mensagem_em: agora, ultima_direcao: 'saida', updated_at: agora }).eq('id', conversa.id);
}

/* ── o turno ─────────────────────────────────────────────────────── */

function instrucoes(agora: Date): string {
  return [
    'Você é o gestor comercial do Xavier (Kauã Xavier Franco), dono do Via Pesados, e fala com ele pelo WhatsApp, no número oficial da empresa.',
    'O Via Pesados é o sistema de gestão e vendas para lojas de caminhões, carretas e máquinas (estoque, site da loja, publicação no Mercado Livre, Instagram, Facebook e WhatsApp). Não é loja de caminhão.',
    'No mesmo número trabalha o Davi, o atendente virtual que prospecta lojas: manda a sequência de mensagens (pergunta de abertura, vídeo, acompanhamentos), conversa com quem responde, encontra a dor, marca a demonstração de 15 minutos e leva o lead ao CRM. Você supervisiona o Davi e presta contas ao dono. O dono às vezes te chama de "Davi": responda do mesmo jeito.',
    '',
    `Agora: ${quandoFalado(agora)} (horário de Brasília).`,
    '',
    'Como trabalhar:',
    '- Responda o que ele perguntou, primeiro a resposta, depois o detalhe. Mensagem de WhatsApp: curta, frases diretas, *negrito* com um asterisco, listas com "•". Nada de títulos com #.',
    '- Números e fatos só das ferramentas. Nunca invente loja, conversa, número ou horário. Se não achou, diga que não achou.',
    '- Na língua do dono: o efeito no negócio, nunca nome de tabela, de função ou de status interno.',
    '- "Ele", "esse cliente", "o último": é o lead do aviso ou da conversa mais recente aqui no histórico. Se houver dúvida real entre dois, pergunte qual.',
    '- Quando ele pede para mudar algo no sistema (remarcar, cancelar, tirar o Davi), faça e confirme em uma linha o que mudou. Se faltar dado (qual reunião, que dia), pergunte antes.',
    '- Remarcar ou cancelar NÃO avisa o lead. Diga isso e ofereça avisar. Mensagem ao lead só quando ele pedir com todas as letras; mostre o texto que saiu.',
    '- Na análise ("o criativo tá ruim?", "por que ninguém responde?"), use os números de resposta por mensagem da sequência, compare períodos se ajudar, e diga com honestidade o que dá e o que não dá para concluir com o volume que tem. Recomende uma coisa, não uma lista.',
    '- Viu algo errado do Davi numa conversa (respondeu mal, parou quando o lead quis ver), aponte com a citação e diga o que você faria.',
    '- Nunca fale de senha, token ou chave.',
  ].join('\n');
}

/**
 * Um turno: lê a conversa do dono (últimas 48 h), transcreve os áudios, pensa com as
 * ferramentas e responde. Devolve o que mandou (ou o motivo de não ter mandado).
 */
export async function turnoDoGestor(db: Db, conversaId: string): Promise<{ ok: boolean; motivo?: string; resposta?: string }> {
  const c = await carregarConversa(db, conversaId);
  if (!c) return { ok: false, motivo: 'conversa não encontrada' };
  const desde = Date.now() - 48 * 3_600_000;
  const msgs = c.msgs.filter((m) => new Date(m.created_at).getTime() >= desde).slice(-40);
  await transcreverAudios(db, msgs, c.inst, Date.now() + 40_000).catch(() => []);

  /* Os avisos de lead que saíram para este número e ainda não estão gravados na conversa. */
  const fim = c.conversa.telefone.replace(/\D/g, '').slice(-8);
  const { data: avisos } = await db.from('wa_envios').select('template, chave, created_at')
    .like('destino', `%${fim}`).like('template', 'aviso%').gte('created_at', new Date(desde).toISOString())
    .order('created_at', { ascending: true }).limit(20);
  const idsAviso = [...new Set((avisos ?? []).map((a: { chave: string }) => conversaDaChave(a.chave)).filter(Boolean))] as string[];
  const nomes = await nomeDaConversa(db, idsAviso);
  const linhasAviso = (avisos ?? []).map((a: { template: string; chave: string; created_at: string }) => {
    const cid = conversaDaChave(a.chave);
    const n = cid ? nomes[cid] : null;
    const oque = a.template.startsWith('aviso_reuniao') ? 'aviso de reunião' : 'aviso de lead no CRM';
    return `[${horaCurta(a.created_at)}] AVISO ENVIADO AO DONO: ${oque}${n ? `: ${n.nome} (conversa_id ${cid})` : ''}`;
  });

  const linhas = msgs.map((m) => {
    const quem = m.direcao === 'entrada' ? 'DONO' : m.enviada_por_nome === REMETENTE_GESTOR ? 'VOCÊ' : 'AVISO AUTOMÁTICO';
    const corpo = m.tipo === 'audio' ? `(áudio) ${m.transcricao ?? '(não deu para ouvir)'}` : (m.conteudo ?? `(${m.tipo})`);
    return { quando: m.created_at, linha: `[${horaCurta(m.created_at)}] ${quem}: ${corpo}` };
  });
  const historico = [...linhas, ...(avisos ?? []).map((a: { created_at: string }, i: number) => ({ quando: a.created_at, linha: linhasAviso[i] }))]
    .sort((a, b) => a.quando.localeCompare(b.quando)).map((x) => x.linha).join('\n');

  const ultimaDoDono = [...msgs].reverse().find((m) => m.direcao === 'entrada');
  if (!ultimaDoDono) return { ok: false, motivo: 'nada novo do dono' };

  const cfg = await lerConfig(db);
  const modelo = cfg?.modelo || MODELO_PADRAO;
  // deno-lint-ignore no-explicit-any
  const mensagens: any[] = [{
    role: 'user',
    content: `A conversa com o dono (últimas 48 h, a mais nova embaixo):\n\n${historico}\n\nResponda à(s) última(s) mensagem(ns) do DONO.`,
  }];

  let resposta = '';
  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    const r = await chamarClaude({
      model: modelo, max_tokens: 4000, system: instrucoes(new Date()), tools: FERRAMENTAS,
      thinking: { type: 'adaptive' }, messages: mensagens,
    }, { timeoutMs: 90_000 });
    mensagens.push({ role: 'assistant', content: r.content });
    // deno-lint-ignore no-explicit-any
    const usos = (r.content ?? []).filter((b: any) => b.type === 'tool_use');
    if (r.stop_reason !== 'tool_use' || !usos.length) {
      // deno-lint-ignore no-explicit-any
      resposta = (r.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
      break;
    }
    const resultados: { type: string; tool_use_id: string; content: string }[] = [];
    for (const u of usos) {
      let saida: unknown;
      try { saida = await rodarFerramenta(db, u.name, (u.input ?? {}) as Entrada); }
      catch (err) { saida = { erro: err instanceof Error ? err.message : String(err) }; }
      resultados.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(saida).slice(0, 60_000) });
    }
    mensagens.push({ role: 'user', content: resultados });
  }
  if (!resposta) resposta = 'Não consegui fechar a resposta agora. Me pergunta de novo em uma frase?';

  const cfgY = configYCloud();
  if (!cfgY) return { ok: false, motivo: 'número oficial sem credenciais' };
  for (const parte of partirMensagem(resposta)) {
    const { id } = await enviarTextoPorYCloud(cfgY, { para: c.conversa.telefone, texto: parte });
    await gravarSaida(db, c.conversa, c.inst, parte, id, REMETENTE_GESTOR);
  }
  return { ok: true, resposta };
}
