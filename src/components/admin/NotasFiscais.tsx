import { FileText, Download, AlertTriangle } from 'lucide-react';
import { useNotasFiscais, brlFull, type NotaFiscal } from '@/hooks/useAdmin';
import { SectionHeader, Panel, StatusBadge } from '@/components/admin/ui';

/**
 * As NFS-e de um cliente.
 *
 * Só leitura. A tabela é escrita pelo webhook `asaas-nota` e por mais
 * ninguém: uma nota alterada aqui divergiria do documento que a prefeitura
 * registrou, e o que vale é o da prefeitura.
 *
 * O painel mostra o estado real da nota, e não um "emitida / não emitida".
 * A diferença importa: entre pedir a nota e a prefeitura autorizar existe
 * uma janela em que ela ainda não tem número — e é justamente nessa janela
 * que uma falha passa despercebida se a tela fingir que já acabou.
 */

const dataBR = (iso: string | null) =>
  iso ? new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR') : null;

function Linha({ n }: { n: NotaFiscal }) {
  /* Número só existe depois de autorizada — antes disso a nota é um pedido,
     não um documento. Mostrar "—" seria mais honesto que inventar um. */
  const titulo = n.numero ? `NFS-e nº ${n.numero}` : 'Aguardando número';
  const quando = dataBR(n.emitida_em) ?? dataBR(n.competencia) ?? dataBR(n.created_at);

  return (
    <div className="px-3.5 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-foreground truncate">{titulo}</p>
          <p className="text-[10.5px] text-foreground/35">
            {quando}
            {n.serie && ` · série ${n.serie}`}
          </p>
        </div>
        <p className="text-[12px] font-bold text-foreground tabular-nums">{brlFull(n.valor)}</p>
        <StatusBadge status={n.status} />
      </div>

      {/* O motivo da falha fica na própria linha. Erro escondido atrás de um
          clique é erro que ninguém lê — e nota que falhou não sai sozinha. */}
      {n.status === 'erro' && n.erro && (
        <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-red-400">
          <AlertTriangle className="h-3 w-3 mt-[1px] shrink-0" />
          <span className="min-w-0">{n.erro}</span>
        </p>
      )}

      {(n.pdf_url || n.xml_url) && (
        <div className="mt-1.5 flex items-center gap-3">
          {n.pdf_url && <Baixar href={n.pdf_url}>PDF</Baixar>}
          {/* O XML é o que o contador precisa; o PDF é o que o cliente lê. */}
          {n.xml_url && <Baixar href={n.xml_url}>XML</Baixar>}
          {n.codigo_verificacao && (
            <span className="text-[10px] text-foreground/25 tabular-nums truncate">
              cód. {n.codigo_verificacao}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const Baixar = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
  >
    <Download className="h-3 w-3" /> {children}
  </a>
);

/* Separado de quem busca os dados: a mesma lista serve a uma tela global
   de notas mais tarde, e permite ver o desenho sem depender do banco. */
export function ListaDeNotas({ notas, isLoading }: { notas: NotaFiscal[]; isLoading?: boolean }) {

  /* Uma falha no meio da lista se perde entre as autorizadas. No cabeçalho,
     não. */
  const comErro = notas.filter((n) => n.status === 'erro').length;

  return (
    <div>
      <SectionHeader
        title="Notas fiscais"
        right={
          comErro > 0 ? (
            <span className="text-[11px] font-semibold text-red-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {comErro} com erro
            </span>
          ) : undefined
        }
      />
      <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
        {isLoading ? (
          <p className="text-[11.5px] text-foreground/30 text-center py-6">Carregando…</p>
        ) : notas.length === 0 ? (
          <div className="py-6 px-4 text-center">
            <FileText className="h-6 w-6 mx-auto text-foreground/15" />
            <p className="text-[11.5px] text-foreground/30 mt-1.5">Nenhuma nota emitida</p>
            <p className="text-[10.5px] text-foreground/20 mt-0.5">
              Elas aparecem aqui sozinhas quando o Asaas emitir.
            </p>
          </div>
        ) : (
          notas.map((n) => <Linha key={n.id} n={n} />)
        )}
      </Panel>
    </div>
  );
}

export function NotasFiscais({ clientId }: { clientId?: string }) {
  const { data: notas = [], isLoading } = useNotasFiscais(clientId);
  return <ListaDeNotas notas={notas} isLoading={isLoading} />;
}
