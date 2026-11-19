import { useState } from 'react';
import { toast } from 'sonner';
import { HojeView } from '@/components/crm/HojeTab';
import { Caminho, FunilView } from '@/components/crm/FunilTab';
import type { AcoesDaVenda } from '@/components/crm/AcoesDaVenda';
import { posicaoNoFunil } from '@/lib/funilDaProspeccao';
import { conversasSoltas, montarOportunidades, type FonteLoja, type ReuniaoDaOportunidade } from '@/lib/oportunidades';

/**
 * Bancada do CRM (só em desenvolvimento): Hoje e Funil com lojas inventadas, para ver as telas
 * sem entrar na conta de ninguém. Não lê o banco.
 */

const AGORA = new Date();
const atras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000).toISOString();
const daqui = (h: number) => new Date(AGORA.getTime() + h * 3_600_000).toISOString();

/** Dia relativo a hoje, numa hora cheia (para a bancada não depender da hora em que é aberta). */
const dia = (offset: number, hora: number) => { const d = new Date(AGORA); d.setDate(d.getDate() + offset); d.setHours(hora, 0, 0, 0); return d.toISOString(); };

const reuniao = (id: string, scheduled_at: string, status = 'agendada', x: Partial<ReuniaoDaOportunidade> = {}) =>
  ({ id, scheduled_at, status, meet_link: 'https://meet.google.com/exemplo', outcome: null, prospect_id: null, title: 'Demonstração', ...x });

function loja(id: string, nome: string, cidade: string, x: Partial<FonteLoja> = {}): FonteLoja {
  const base = {
    lojaId: id, nome, cidade, uf: 'MG', telefone: `55319${String(id.length * 1234567 + nome.length * 7654321).padStart(8, '0').slice(0, 8)}`,
    status: 'conversando', motivo: null, atualizadaEm: atras(30), contatos: 1, ligacoes: 0, conversaId: `c-${id}`,
    primeiroContatoEm: atras(160), mexeuEm: atras(20), reuniao: null, cardId: null, davi: { etapa: 'conversa', modo: 'sozinho' },
    sabe: [] as string[], teste: false, ...x,
  };
  const posicao = posicaoNoFunil({
    loja: { status: base.status as never, nome, respondeu_em: atras(40), primeiro_contato_em: base.primeiroContatoEm, contatos: base.contatos, ligacoes: base.ligacoes },
    conversa: base.davi ? { etapa: base.davi.etapa as never, situacao: {} } : null, reuniao: base.reuniao, card: null,
  }, AGORA);
  return { ...base, posicao };
}

const R = {
  passou: reuniao('r1', dia(-1, 13)),
  hoje: reuniao('r2', daqui(1.5)),
  amanha: reuniao('r3', dia(1, 10)),
  feita: reuniao('r4', dia(-3, 15), 'realizada'),
  faltou: reuniao('r5', dia(-2, 9), 'cancelada', { outcome: 'Não apareceu' }),
};

const FONTES = {
  lojas: [
    loja('a', 'Pátio Norte Caminhões', 'Uberlândia', { status: 'com_voce', motivo: 'Assistente chamou você: o Lucas tentou entrar na reunião e não achou ninguém.', atualizadaEm: atras(22), mexeuEm: atras(22), reuniao: R.passou, davi: { etapa: 'com_xavier', modo: 'sozinho' }, sabe: ['35 no estoque', 'Dono'] }),
    loja('bb', 'Rota Sul Pesados', 'Betim', { status: 'com_voce', motivo: 'Assistente chamou você: responde só com áudio e pediu para falar com uma pessoa.', atualizadaEm: atras(3), mexeuEm: atras(3), davi: { etapa: 'com_xavier', modo: 'sozinho' } }),
    loja('ccc', 'Serra Azul Caminhões', 'Contagem', { reuniao: R.hoje, sabe: ['18 no estoque', 'Gerente'] }),
    loja('dddd', 'Trevo Implementos', 'Divinópolis', { reuniao: R.amanha, sabe: ['60 no estoque', 'Sócio'] }),
    loja('eeeee', 'Estrada Real Seminovos', 'Conselheiro Lafaiete', { reuniao: R.feita, mexeuEm: atras(75), sabe: ['22 no estoque', 'Dono'] }),
    loja('ffffff', 'Vale Verde Caminhões', 'Araxá', { reuniao: R.faltou, mexeuEm: atras(50) }),
    loja('ggggggg', 'Bandeirante Truck Center', 'Araras', { mexeuEm: atras(120), sabe: ['12 no estoque'] }),
    loja('hhhhhhhh', 'Minas Diesel Caminhões', 'Sete Lagoas', { mexeuEm: atras(2), sabe: ['40 no estoque', 'Vendedor'] }),
    loja('iiiiiiiii', 'Auto Pesados Triângulo', 'Uberaba', { status: 'sem_interesse', motivo: 'Pediu para não receber mais mensagens.', davi: { etapa: 'saiu', modo: 'sozinho' } }),
  ],
  cards: [
    { id: 'p1', company_name: 'Caminhões do Vale', contact_name: 'Rogério', whatsapp: '(33) 99812-0000', city: 'Governador Valadares', state: 'MG', stage: 'contato', notes: 'Estoque: 45 veículos\nCargo: dono\nO que mais toma tempo: anunciar em cada lugar', lost_reason: null, created_at: atras(0.1), updated_at: atras(0.1), canalSlug: 'site', canalNome: 'Site / inbound' },
    { id: 'p2', company_name: 'Rodovia Implementos', contact_name: null, whatsapp: '(31) 99700-0000', city: 'Itaúna', state: 'MG', stage: 'teste', notes: null, lost_reason: null, created_at: atras(400), updated_at: atras(100), canalSlug: 'indicacao', canalNome: 'Indicação' },
  ],
  reunioes: Object.values(R),
  conversas: [
    { id: 'c-hhhhhhhh', prospect_id: null, nao_lidas: 0, ultima_direcao: 'saida', ultima_mensagem: 'Show!', ultima_mensagem_em: atras(2), telefone: '5531900000000' },
    { id: 'solta', prospect_id: null, nao_lidas: 2, ultima_direcao: 'entrada', ultima_mensagem: 'Boa tarde, vi o anúncio de vocês. Como funciona?', ultima_mensagem_em: atras(0.4), telefone: '5527998880000', nome: 'Marcelo' },
  ],
  atividades: [],
  respostasDaEquipe: {},
};

export default function DevCrm() {
  const [tela, setTela] = useState<'hoje' | 'funil'>(new URLSearchParams(window.location.search).get('tela') === 'funil' ? 'funil' : 'hoje');
  const ops = montarOportunidades(FONTES, AGORA);
  const diz = (o: string) => () => toast.message(o);
  const acoes: AcoesDaVenda = {
    conversa: diz('Abre a conversa ao lado'), conversaDa: diz('Abre a conversa ao lado'), ficha: diz('Abre a ficha'),
    marcarReuniao: diz('Pede o dia e a hora'), comoFoi: diz('Pergunta como foi a reunião'), primeiroContato: diz('Pergunta como foi o contato'), jaRespondi: diz('Anota que você já respondeu'),
    venda: diz('Registra a venda'), teste: diz('Começa o teste'),
  };
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex gap-2 px-6 pt-4">
        {(['hoje', 'funil'] as const).map((t) => (
          <button key={t} onClick={() => setTela(t)} className={`h-8 px-3 rounded-lg text-[12.5px] font-medium ${tela === t ? 'bg-primary/10 text-primary' : 'text-foreground/50'}`}>{t === 'hoje' ? 'Hoje' : 'Funil'}</button>
        ))}
      </div>
      <main className="px-4 sm:px-6 py-5">
        {tela === 'hoje' ? (
          <HojeView agora={AGORA} oportunidades={ops} soltas={conversasSoltas(FONTES.conversas, ops)} reunioes={FONTES.reunioes} acoes={acoes} ligacoesFaltam={20}
            ligacoes={<p className="max-w-4xl text-[13px] text-foreground/40">(aqui entra a lista de ligações do dia)</p>} />
        ) : (
          <FunilView agora={AGORA} oportunidades={ops} acoes={acoes}
            caminho={<Caminho passos={[{ rotulo: 'lojas na fila', valor: 1118 }, { rotulo: 'já receberam', valor: 125 }, { rotulo: 'responderam', valor: 9, de: '7,2%' }, { rotulo: 'reuniões', valor: 2 }, { rotulo: 'clientes', valor: 0 }]} />} />
        )}
      </main>
    </div>
  );
}
