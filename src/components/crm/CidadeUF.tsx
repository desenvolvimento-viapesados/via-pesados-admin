import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Cidade e UF selecionáveis de verdade.
 *
 * Campo livre de cidade produz "Belo Horizonte", "belo horizonte", "BH" e
 * "Bh/MG" na mesma base — e aí relatório por região vira ficção. Aqui a UF
 * é lista fechada e a cidade vem do IBGE, que é a fonte oficial e não pede
 * chave nem cadastro.
 *
 * Ainda aceita texto livre: distrito pequeno que o IBGE não lista não pode
 * travar o cadastro de um prospecto.
 */

const UFS = [
  ['AC','Acre'],['AL','Alagoas'],['AP','Amapá'],['AM','Amazonas'],['BA','Bahia'],
  ['CE','Ceará'],['DF','Distrito Federal'],['ES','Espírito Santo'],['GO','Goiás'],
  ['MA','Maranhão'],['MT','Mato Grosso'],['MS','Mato Grosso do Sul'],['MG','Minas Gerais'],
  ['PA','Pará'],['PB','Paraíba'],['PR','Paraná'],['PE','Pernambuco'],['PI','Piauí'],
  ['RJ','Rio de Janeiro'],['RN','Rio Grande do Norte'],['RS','Rio Grande do Sul'],
  ['RO','Rondônia'],['RR','Roraima'],['SC','Santa Catarina'],['SP','São Paulo'],
  ['SE','Sergipe'],['TO','Tocantins'],
] as const;

const campo =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground focus:outline-none focus:border-primary/50 transition-colors flex items-center justify-between gap-2';

/* Cache por UF: trocar de estado e voltar não deve bater no IBGE de novo. */
const cache = new Map<string, string[]>();

export function CidadeUF({
  uf, cidade, onChange,
}: {
  uf: string;
  cidade: string;
  onChange: (v: { uf: string; cidade: string }) => void;
}) {
  const [abertoUf, setAbertoUf] = useState(false);
  const [abertaCidade, setAbertaCidade] = useState(false);
  const [busca, setBusca] = useState('');
  const [cidades, setCidades] = useState<string[]>(cache.get(uf) ?? []);
  const [carregando, setCarregando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!uf) { setCidades([]); return; }
    if (cache.has(uf)) { setCidades(cache.get(uf)!); return; }
    setCarregando(true);
    fetch(`https://servicosdados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`)
      .then((r) => r.json())
      .then((d: Array<{ nome: string }>) => {
        const nomes = d.map((m) => m.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'));
        cache.set(uf, nomes);
        setCidades(nomes);
      })
      // Sem internet ou IBGE fora do ar, o campo continua aceitando digitação.
      .catch(() => setCidades([]))
      .finally(() => setCarregando(false));
  }, [uf]);

  // Clique fora fecha; sem isso os dois menus ficam abertos por cima do resto.
  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) {
        setAbertoUf(false); setAbertaCidade(false);
      }
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return cidades.slice(0, 200);
    return cidades.filter((c) => c.toLowerCase().includes(q)).slice(0, 200);
  }, [busca, cidades]);

  return (
    <div ref={caixa} className="grid grid-cols-[1fr_110px] gap-2.5">
      {/* Cidade */}
      <div className="relative">
        <button
          type="button"
          disabled={!uf}
          onClick={() => { setAbertaCidade((v) => !v); setAbertoUf(false); }}
          className={cn(campo, !uf && 'opacity-45 cursor-not-allowed')}
        >
          <span className={cn('truncate', !cidade && 'text-foreground/30')}>
            {cidade || (uf ? 'Cidade' : 'Escolha a UF primeiro')}
          </span>
          {carregando ? <Loader2 className="h-3.5 w-3.5 animate-spin opacity-50 shrink-0" />
                      : <ChevronDown className="h-3.5 w-3.5 opacity-40 shrink-0" />}
        </button>
        {abertaCidade && (
          <div className="absolute z-50 mt-1 w-full rounded-xl border border-black/[0.1] dark:border-white/[0.12] bg-background shadow-xl overflow-hidden">
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cidade…"
              className="w-full h-9 px-3 bg-transparent border-b border-black/[0.08] dark:border-white/[0.08] text-[12.5px] focus:outline-none"
            />
            <div className="max-h-52 overflow-y-auto">
              {busca.trim() && !filtradas.some((c) => c.toLowerCase() === busca.trim().toLowerCase()) && (
                <button
                  type="button"
                  onClick={() => { onChange({ uf, cidade: busca.trim() }); setBusca(''); setAbertaCidade(false); }}
                  className="w-full text-left px-3 py-2 text-[12.5px] text-primary hover:bg-primary/10"
                >
                  Usar "{busca.trim()}"
                </button>
              )}
              {filtradas.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { onChange({ uf, cidade: c }); setBusca(''); setAbertaCidade(false); }}
                  className="w-full text-left px-3 py-2 text-[12.5px] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] flex items-center gap-2"
                >
                  <Check className={cn('h-3 w-3 shrink-0', cidade === c ? 'opacity-100 text-primary' : 'opacity-0')} />
                  <span className="truncate">{c}</span>
                </button>
              ))}
              {!filtradas.length && !busca.trim() && (
                <p className="px-3 py-3 text-[12px] text-foreground/40">Nenhuma cidade carregada.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* UF */}
      <div className="relative">
        <button
          type="button"
          onClick={() => { setAbertoUf((v) => !v); setAbertaCidade(false); }}
          className={campo}
        >
          <span className={cn(!uf && 'text-foreground/30')}>{uf || 'UF'}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-40 shrink-0" />
        </button>
        {abertoUf && (
          <div className="absolute z-50 mt-1 right-0 w-56 rounded-xl border border-black/[0.1] dark:border-white/[0.12] bg-background shadow-xl overflow-hidden">
            <div className="max-h-52 overflow-y-auto">
              {UFS.map(([sigla, nome]) => (
                <button
                  key={sigla}
                  type="button"
                  /* Trocar de UF limpa a cidade: manter 'Contagem' com UF 'SP'
                     é o tipo de dado que ninguém confere e todo relatório usa. */
                  onClick={() => { onChange({ uf: sigla, cidade: sigla === uf ? cidade : '' }); setAbertoUf(false); }}
                  className="w-full text-left px-3 py-2 text-[12.5px] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] flex items-center gap-2"
                >
                  <Check className={cn('h-3 w-3 shrink-0', uf === sigla ? 'opacity-100 text-primary' : 'opacity-0')} />
                  <span className="font-mono w-6">{sigla}</span>
                  <span className="truncate text-foreground/50">{nome}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
