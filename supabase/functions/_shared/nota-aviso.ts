import { enviarTemplate, mesDe, brl, primeiroNome } from './wa.ts';

/**
 * Manda a nota fiscal em PDF para o lojista — se for a hora.
 *
 * "Se for a hora" é o coração deste arquivo. A nota fica pronta no momento
 * em que o pagamento confirma, e chegar sozinha nesse instante seria a
 * primeira coisa que o lojista vê da Via Pesados. Então ela espera:
 *
 *   PRIMEIRA COMPRA → só depois que o sistema estiver liberado para acesso.
 *     Nota fiscal antes de o produto existir é cobrança sem entrega.
 *
 *   DEMAIS MESES → só depois do aviso de pagamento confirmado.
 *     A ordem importa: primeiro "recebemos", depois o documento. Invertido,
 *     o lojista recebe um PDF fiscal sem saber a que se refere.
 *
 * Chamado de TRÊS lugares — quando a nota é autorizada, quando o aviso de
 * pagamento sai, e quando o acesso é liberado. Qualquer um dos três pode
 * ser o último a acontecer, e é o último que destrava. A trava de repetição
 * do `wa_envios` garante que só um deles manda de fato.
 */

type Db = { from: (t: string) => any };

export type ResultadoAviso =
  | { enviado: true; message_id?: string }
  | { enviado: false; motivo: string; aguardando?: boolean };

/** Já saiu, com sucesso, um envio com um destes templates e esta chave? */
async function jaSaiu(db: Db, templates: string[], chaves: string[]): Promise<boolean> {
  const { data } = await db.from('wa_envios')
    .select('id').in('template', templates).in('chave', chaves)
    .not('enviado_em', 'is', null).limit(1);
  return !!data?.length;
}

export async function enviarNotaFiscal(
  db: Db,
  notaId: string,
  /* Ignora os portões. Só para envio manual pelo painel, quando alguém
     decidiu conscientemente mandar fora de ordem. */
  forcar = false,
): Promise<ResultadoAviso> {
  const { data: nota } = await db.from('notas_fiscais')
    .select('id, client_id, asaas_payment_id, asaas_invoice_id, numero, valor, pdf_url, status, emitida_em, competencia')
    .eq('id', notaId).maybeSingle();
  if (!nota) return { enviado: false, motivo: 'nota não encontrada' };

  /* Só nota autorizada vira mensagem. Agendada, com erro ou cancelada não
     é documento — mandar seria anexar um PDF que a prefeitura não validou. */
  if (nota.status !== 'autorizada') return { enviado: false, motivo: `nota está "${nota.status}"` };
  if (!nota.pdf_url) return { enviado: false, motivo: 'nota sem PDF', aguardando: true };
  if (!nota.client_id) return { enviado: false, motivo: 'nota sem cliente' };

  const { data: cli } = await db.from('clients')
    .select('id, contact_name, company_name, whatsapp').eq('id', nota.client_id).maybeSingle();
  if (!cli) return { enviado: false, motivo: 'cliente não encontrado' };

  /* "Já entregue" vem ANTES dos portões, e não depois. Testando na ordem
     inversa, uma nota já enviada respondia "aviso de pagamento ainda não
     saiu" — bloqueava certo e explicava errado, que é o tipo de mensagem
     que faz alguém sair caçando um problema que não existe. */
  const { data: entregue } = await db.from('wa_envios')
    .select('enviado_em').eq('template', 'nota_fiscal_emitida')
    .eq('chave', `nota:${nota.asaas_invoice_id}`)
    .not('enviado_em', 'is', null).maybeSingle();
  if (entregue) return { enviado: false, motivo: 'nota já entregue ao lojista' };

  if (!forcar) {
    /* Primeira nota do cliente? Conta os ENVIOS anteriores, não as notas:
       o que define "primeira compra" aqui é o lojista nunca ter recebido
       nota nossa, e não quantas foram emitidas. */
    const { data: anteriores } = await db.from('wa_envios')
      .select('id').eq('template', 'nota_fiscal_emitida').eq('client_id', cli.id)
      .not('enviado_em', 'is', null).limit(1);
    const primeira = !anteriores?.length;

    if (primeira) {
      /* Dois nomes para o mesmo evento. O aviso de acesso saía como
         'acesso_liberado', cujo botão tem URL fixa; passou a sair como
         'acesso_equipe', que carrega o token do primeiro acesso. Clientes
         avisados antes da troca têm o nome antigo gravado, e derrubá-los
         aqui seguraria a nota deles para sempre. */
      if (!(await jaSaiu(db, ['acesso_liberado', 'acesso_equipe'], [`acesso_liberado:${cli.id}`]))) {
        return { enviado: false, motivo: 'sistema ainda não liberado para o lojista', aguardando: true };
      }
    } else {
      const pay = nota.asaas_payment_id;
      if (!pay) return { enviado: false, motivo: 'nota sem cobrança vinculada', aguardando: true };
      /* O mesmo template sai por dois eventos do Asaas — o que confirma e o
         que recebe. Qualquer um dos dois serve como "já avisamos". */
      const ok = await jaSaiu(db, ['pagamento_confirmado'], [`PAYMENT_RECEIVED:${pay}`, `PAYMENT_CONFIRMED:${pay}`]);
      if (!ok) return { enviado: false, motivo: 'aviso de pagamento ainda não saiu', aguardando: true };
    }
  }

  const mes = mesDe(nota.emitida_em ?? nota.competencia);
  const r = await enviarTemplate(db, {
    para: cli.whatsapp,
    template: 'nota_fiscal_emitida',
    client_id: cli.id,
    // Uma nota, um envio — para sempre.
    chave: `nota:${nota.asaas_invoice_id}`,
    params: {
      documento: {
        link: nota.pdf_url,
        filename: `NFS-e ${nota.numero ?? ''} — Via Pesados.pdf`.replace(/\s+/g, ' ').trim(),
      },
      body: [
        primeiroNome(cli.contact_name),
        mes,
        nota.numero ?? '—',
        brl(Number(nota.valor) || 0),
      ],
    },
  });

  return r.ok
    ? { enviado: true, message_id: r.message_id }
    : { enviado: false, motivo: r.motivo };
}

/** Tenta mandar a nota autorizada mais recente ainda não enviada do cliente. */
export async function tentarNotasPendentes(db: Db, clientId: string): Promise<unknown[]> {
  const { data: notas } = await db.from('notas_fiscais')
    .select('id').eq('client_id', clientId).eq('status', 'autorizada')
    .order('created_at', { ascending: true }).limit(12);
  const saida: unknown[] = [];
  for (const n of notas ?? []) saida.push(await enviarNotaFiscal(db, n.id));
  return saida;
}
