/**
 * O que muda no banco quando o teste grátis começa, converte ou acaba.
 * As regras de data moram em teste.ts; aqui só se grava.
 */
import { DIAS_DE_TESTE, fimDoTeste, tarefasDoTeste, as10h, type TarefaDoTeste } from './teste.ts';

// deno-lint-ignore no-explicit-any
type Db = { from: (t: string) => any };

export type TesteGratis = {
  id: string; client_id: string; owner_id: string | null; status: string;
  inicio: string | null; fim: string | null; dias_extras: number;
};

/** O teste da loja, se houver um. */
export async function testeDoCliente(db: Db, clientId: string): Promise<TesteGratis | null> {
  const { data } = await db.from('testes_gratis')
    .select('id, client_id, owner_id, status, inicio, fim, dias_extras')
    .eq('client_id', clientId).maybeSingle();
  return data ?? null;
}

/** Põe as tarefas na agenda — de novo, se a data mudou (prorrogação). */
export async function agendarTarefas(db: Db, teste: TesteGratis, tarefas: TarefaDoTeste[], prospectId: string | null) {
  for (const t of tarefas) {
    // Tarefa já feita não volta para a agenda; a que está por fazer anda junto com a data.
    const { data: existente } = await db.from('tarefas')
      .select('id, feito_em').eq('client_id', teste.client_id).eq('marco', t.marco).maybeSingle();
    if (existente?.feito_em) continue;
    if (existente) {
      await db.from('tarefas').update({ quando: as10h(t.dia), titulo: t.titulo, detalhe: t.detalhe }).eq('id', existente.id);
    } else {
      await db.from('tarefas').insert({
        client_id: teste.client_id, prospect_id: prospectId, owner_id: teste.owner_id,
        titulo: t.titulo, detalhe: t.detalhe, quando: as10h(t.dia), origem: 'teste_gratis', marco: t.marco,
      });
    }
  }
}

/** Implantou: o relógio do teste começa hoje. */
export async function comecarTeste(db: Db, teste: TesteGratis, inicio: string) {
  /* Assinou antes da implantação: continua tendo o mês grátis. Ganha as
     datas (é delas que a primeira mensalidade conta), sem tarefas — quem
     já assinou não precisa de ligação de fechamento. */
  if (teste.status === 'convertido' && !teste.inicio) {
    const { data } = await db.from('testes_gratis')
      .update({ inicio, fim: fimDoTeste(inicio, teste.dias_extras ?? 0), atualizado_em: new Date().toISOString() })
      .eq('id', teste.id).is('inicio', null)
      .select('id, client_id, owner_id, status, inicio, fim, dias_extras').maybeSingle();
    return (data as TesteGratis) ?? teste;
  }
  if (teste.status !== 'aguardando_implantacao') return teste;
  const fim = fimDoTeste(inicio, teste.dias_extras ?? 0);
  const { data: atualizado } = await db.from('testes_gratis')
    .update({ status: 'em_teste', inicio, fim, atualizado_em: new Date().toISOString() })
    .eq('id', teste.id).eq('status', 'aguardando_implantacao')
    .select('id, client_id, owner_id, status, inicio, fim, dias_extras').maybeSingle();
  if (!atualizado) return teste; // outra chamada começou antes
  const { data: c } = await db.from('clients').select('prospect_id').eq('id', teste.client_id).maybeSingle();
  await agendarTarefas(db, atualizado, tarefasDoTeste(inicio, fim), c?.prospect_id ?? null);
  await db.from('activities').insert({
    client_id: teste.client_id, kind: 'nota',
    content: `Teste grátis começou na implantação: ${DIAS_DE_TESTE} dias, até ${fim.split('-').reverse().join('/')}.`,
  });
  return atualizado as TesteGratis;
}

/**
 * A data de implantação foi corrigida à mão: o teste anda junto — novo
 * início, novo fim e as tarefas por fazer remarcadas. Só antes do corte.
 */
export async function moverTeste(db: Db, teste: TesteGratis, inicio: string) {
  if (teste.status === 'aguardando_implantacao') return comecarTeste(db, teste, inicio);
  if (teste.status !== 'em_teste') return teste;
  const fim = fimDoTeste(inicio, teste.dias_extras ?? 0);
  const { data: atualizado } = await db.from('testes_gratis')
    .update({ inicio, fim, atualizado_em: new Date().toISOString() })
    .eq('id', teste.id)
    .select('id, client_id, owner_id, status, inicio, fim, dias_extras').maybeSingle();
  if (!atualizado) return teste;
  const { data: c } = await db.from('clients').select('prospect_id').eq('id', teste.client_id).maybeSingle();
  await agendarTarefas(db, atualizado, tarefasDoTeste(inicio, fim), c?.prospect_id ?? null);
  return atualizado as TesteGratis;
}

/**
 * Assinou: o teste virou cliente. As tarefas do teste ainda abertas saem da
 * agenda — as que vêm e as que ficaram para trás: ligar para "fechar" ou
 * para perguntar por que não assinou quem já assinou é ruído. Rodar duas
 * vezes não faz nada na segunda.
 */
export async function converterTeste(db: Db, clientId: string, como: string) {
  const { data: t } = await db.from('testes_gratis')
    .update({ status: 'convertido', convertido_em: new Date().toISOString(), atualizado_em: new Date().toISOString() })
    .eq('client_id', clientId).in('status', ['aguardando_implantacao', 'em_teste', 'encerrado'])
    .select('id').maybeSingle();
  if (!t) return false;
  // No funil, sai de "Teste grátis" e vai para Fechado — só se ainda estiver lá.
  const { data: c } = await db.from('clients').select('prospect_id').eq('id', clientId).maybeSingle();
  if (c?.prospect_id) await db.from('prospects').update({ stage: 'vendido' }).eq('id', c.prospect_id).eq('stage', 'teste');
  await db.from('tarefas').delete()
    .eq('client_id', clientId).eq('origem', 'teste_gratis').is('feito_em', null);
  await db.from('activities').insert({ client_id: clientId, kind: 'nota', content: `Teste grátis convertido: ${como}.` });
  return true;
}
