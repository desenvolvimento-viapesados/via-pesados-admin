import { useEffect, useState } from 'react';
import { Check, Loader2, Plug } from 'lucide-react';
import { getCompanyChannels, setCompanyChannels } from '@/hooks/useAdmin';

/**
 * Quais canais esta loja trabalha.
 *
 * A decisão é comercial, não do lojista: define o que ele consegue conectar
 * e sobre o que o sistema dele reclama quando cai. Enquanto isso não
 * existia, toda loja via a lista inteira e levava alarme de canal que nunca
 * pretendeu usar — o tipo de aviso que ensina a ignorar o aviso.
 */

const ROTULOS: Record<string, { nome: string; sub: string }> = {
  mercadolivre: { nome: 'Mercado Livre', sub: 'Anúncios de veículo, com atualização automática de preço' },
  facebook:     { nome: 'Facebook, Instagram e WhatsApp', sub: 'Um login libera catálogo, Página e Instagram' },
};

export function CanaisDoCliente({ companyId }: { companyId: string }) {
  const [canais, setCanais] = useState<string[]>([]);
  const [disponiveis, setDisponiveis] = useState<string[]>([]);
  const [conectados, setConectados] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    getCompanyChannels(companyId)
      .then(d => { if (!vivo) return; setCanais(d.canais); setDisponiveis(d.disponiveis); setConectados(d.conectados); })
      .catch(e => vivo && setErro(e.message))
      .finally(() => vivo && setCarregando(false));
    return () => { vivo = false; };
  }, [companyId]);

  const alternar = async (id: string) => {
    const proximo = canais.includes(id) ? canais.filter(c => c !== id) : [...canais, id];
    setCanais(proximo);            // otimista: o clique responde na hora
    setSalvando(true); setErro(null);
    try {
      await setCompanyChannels(companyId, proximo);
    } catch (e) {
      setCanais(canais);           // desfaz se o servidor recusou
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return <p className="text-[12px] text-foreground/40 flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> carregando canais…</p>;
  }

  return (
    <div className="space-y-2">
      {disponiveis.map(id => {
        const ligado = canais.includes(id);
        const emUso = conectados.includes(id);
        const r = ROTULOS[id] ?? { nome: id, sub: '' };
        return (
          <button
            key={id}
            type="button"
            onClick={() => alternar(id)}
            disabled={salvando}
            className={[
              'w-full flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
              ligado
                ? 'border-primary/30 bg-primary/[0.06]'
                : 'border-black/[0.08] dark:border-white/[0.08] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]',
              salvando && 'opacity-60',
            ].filter(Boolean).join(' ')}
          >
            <span className={[
              'mt-0.5 h-4 w-4 rounded-[5px] border grid place-items-center shrink-0',
              ligado ? 'bg-primary border-primary' : 'border-black/20 dark:border-white/20',
            ].join(' ')}>
              {ligado && <Check className="h-3 w-3 text-white" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-[12.5px] font-semibold text-foreground">{r.nome}</span>
                {emUso && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Plug className="h-2.5 w-2.5" /> conectado
                  </span>
                )}
              </span>
              <span className="block text-[11px] text-foreground/40 mt-0.5">{r.sub}</span>
              {/* desligar algo em uso não derruba a conexão — só some da tela
                  do lojista. Avisar evita a suposição contrária. */}
              {emUso && !ligado && (
                <span className="block text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                  Está conectado. Desligado aqui, continua funcionando, mas some da tela dele.
                </span>
              )}
            </span>
          </button>
        );
      })}
      {canais.length === 0 && (
        <p className="text-[11px] text-foreground/40 pt-1">
          Sem canal liberado, a tela de Conexões do lojista aparece vazia com um aviso para falar com a Via Pesados.
        </p>
      )}
      {erro && <p className="text-[11px] text-red-500">{erro}</p>}
    </div>
  );
}
