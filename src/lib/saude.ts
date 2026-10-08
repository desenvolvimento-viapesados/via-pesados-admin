/* Saúde da plataforma: cada peça que mantém a Via Pesados no ar vira um
   estado simples — ok, atenção, erro ou sem resposta — com uma frase do que
   o painel viu. Sem resposta é diferente de erro: não saber não é ter caído. */

export type EstadoDeSaude = 'ok' | 'atencao' | 'erro' | 'sem_resposta';

export interface Verificacao {
  chave: string;
  titulo: string;
  estado: EstadoDeSaude;
  detalhe: string;
  /** Onde se resolve, dentro do painel. */
  rota?: string;
}

const semResposta = (chave: string, titulo: string, rota?: string): Verificacao =>
  ({ chave, titulo, estado: 'sem_resposta', detalhe: 'O diagnóstico não respondeu agora.', rota });

const QUALIDADE: Record<string, string> = { GREEN: 'verde', YELLOW: 'amarela', RED: 'vermelha' };

/** wa-diagnostico: o número oficial (YCloud) e os modelos. */
export function avaliarCanalOficial(d: any): Verificacao {
  const base = { chave: 'canal-oficial', titulo: 'Canal oficial do WhatsApp', rota: '/whatsapp' };
  if (!d || d.error || !d.numero) return d?.numero === null || d?.erro_numero ? { ...base, estado: 'erro', detalhe: `Não consegui ler o número: ${d?.erro_numero ?? 'sem dados'}` } : semResposta(base.chave, base.titulo, base.rota);
  const n = d.numero;
  const total = Number(d.total ?? 0);
  const aprovados = Number(d.por_status?.APPROVED ?? 0);
  const partes = [
    n.situacao === 'CONNECTED' ? 'conectado' : `situação ${n.situacao ?? 'desconhecida'}`,
    `qualidade ${QUALIDADE[n.qualidade] ?? (n.qualidade ?? '?')}`,
    `${aprovados} de ${total} modelos aprovados`,
  ];
  let estado: EstadoDeSaude = 'ok';
  if (n.situacao !== 'CONNECTED' || n.qualidade === 'RED') estado = 'erro';
  else if (n.qualidade === 'YELLOW' || aprovados < total || d.entrega?.segredo_guardado === false || d.entrega?.combinando === false) estado = 'atencao';
  if (d.entrega && d.entrega.combinando === false) partes.push('recebimento de mensagens desligado');
  return { ...base, estado, detalhe: partes.join(' · ') };
}

/** asaas-diagnostico?so=webhooks: o Asaas avisando cobranças e notas. */
export function avaliarAsaas(d: any): Verificacao {
  const base = { chave: 'asaas', titulo: 'Avisos do Asaas', rota: '/pagamentos' };
  if (!d) return semResposta(base.chave, base.titulo, base.rota);
  if (!d.ok) return { ...base, estado: 'erro', detalhe: 'O Asaas recusou a consulta dos webhooks.' };
  const hooks: any[] = d.webhooks ?? [];
  if (!hooks.length) return { ...base, estado: 'erro', detalhe: 'Nenhum webhook registrado: pagamentos não chegam ao painel.' };
  const parados = hooks.filter((h) => !h.ativo || h.interrompido);
  if (parados.length) return { ...base, estado: 'erro', detalhe: `${parados.map((h) => h.nome).join(', ')} ${parados.length === 1 ? 'está parado' : 'estão parados'} no Asaas.` };
  const semSegredo = hooks.filter((h) => h.tem_autenticacao === false);
  const falhas = hooks.reduce((s, h) => s + (Number(h.falhas_penalizadas) || 0), 0);
  if (semSegredo.length || falhas > 0) {
    return { ...base, estado: 'atencao', detalhe: semSegredo.length ? 'Webhook sem segredo de autenticação.' : `${falhas} entregas falharam e foram penalizadas.` };
  }
  return { ...base, estado: 'ok', detalhe: `${hooks.length} webhooks ativos (${d.ambiente === 'producao' ? 'produção' : d.ambiente})` };
}

/** asaas-fiscal: emissão de nota fiscal configurada. */
export function avaliarNotaFiscal(d: any): Verificacao {
  const base = { chave: 'nota-fiscal', titulo: 'Nota fiscal', rota: '/clientes' };
  if (!d?.configuracao_fiscal) return semResposta(base.chave, base.titulo, base.rota);
  return d.configuracao_fiscal.ja_configurada
    ? { ...base, estado: 'ok', detalhe: 'Emissão automática configurada no Asaas.' }
    : { ...base, estado: 'atencao', detalhe: 'A conta do Asaas ainda não tem a configuração fiscal.' };
}

/** vercel-diagnostico: o site e o sistema publicados. */
export function avaliarVercel(d: any): Verificacao {
  const base = { chave: 'vercel', titulo: 'Publicação (Vercel)' };
  if (!d) return semResposta(base.chave, base.titulo);
  if (d.token !== 'válido') return { ...base, estado: 'atencao', detalhe: 'Sem acesso à Vercel: domínios novos ficam manuais.' };
  const ultimo = Array.isArray(d.deploys) ? d.deploys[0] : null;
  if (!ultimo) return { ...base, estado: 'ok', detalhe: 'Acesso à Vercel funcionando.' };
  if (ultimo.estado === 'ERROR') return { ...base, estado: 'erro', detalhe: `Última publicação falhou: ${ultimo.mensagem || ultimo.commit || ''}` };
  return { ...base, estado: 'ok', detalhe: `Última publicação: ${ultimo.estado === 'READY' ? 'no ar' : String(ultimo.estado ?? '').toLowerCase()}` };
}

/** wa_instancias: os números da equipe (Evolution e oficial). */
export function avaliarNumerosDaEquipe(numeros: { nome: string; origem: string; connection_state: string | null; precisa_qr?: boolean }[] | null): Verificacao {
  const base = { chave: 'numeros', titulo: 'WhatsApp da equipe', rota: '/crm?tab=whatsapp' };
  if (!numeros) return semResposta(base.chave, base.titulo, base.rota);
  if (!numeros.length) return { ...base, estado: 'atencao', detalhe: 'Nenhum número da equipe cadastrado.' };
  const caidos = numeros.filter((n) => n.origem !== 'cloud_api' && (n.connection_state !== 'open' || n.precisa_qr));
  if (!caidos.length) return { ...base, estado: 'ok', detalhe: `${numeros.length} ${numeros.length === 1 ? 'número conectado' : 'números conectados'}` };
  return { ...base, estado: caidos.length === numeros.length ? 'erro' : 'atencao', detalhe: `Desconectado: ${caidos.map((n) => n.nome).join(', ')}` };
}

/** Resumo do topo da tela. */
export function resumoDaSaude(lista: Verificacao[]): { estado: EstadoDeSaude; texto: string } {
  const erros = lista.filter((v) => v.estado === 'erro').length;
  const atencao = lista.filter((v) => v.estado === 'atencao').length;
  const sem = lista.filter((v) => v.estado === 'sem_resposta').length;
  if (erros) return { estado: 'erro', texto: `${erros} ${erros === 1 ? 'ponto parado' : 'pontos parados'}${atencao ? ` e ${atencao} pedindo atenção` : ''}` };
  if (atencao) return { estado: 'atencao', texto: `${atencao} ${atencao === 1 ? 'ponto pede' : 'pontos pedem'} atenção` };
  if (sem) return { estado: 'sem_resposta', texto: `Tudo o que respondeu está funcionando (${sem} sem resposta)` };
  return { estado: 'ok', texto: 'Tudo funcionando' };
}
