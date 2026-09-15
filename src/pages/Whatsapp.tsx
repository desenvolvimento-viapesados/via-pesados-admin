import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, FUNCTIONS_URL } from '@/integrations/supabase/client';

/**
 * O canal oficial, numa tela.
 *
 * Existia só na linha de comando: para saber se o número estava de pé, se a
 * conta estava inscrita no app ou se os modelos tinham aprovado, era curl.
 * Deu no que deu — a conta foi desabilitada em 14/09/2026 e ninguém viu, e o
 * painel seguiu registrando "enviado" para mensagem que não era entregue.
 *
 * Trocar de conta do WhatsApp é a operação que esta tela precisa aguentar:
 * conta nova nasce sem modelo nenhum e sem inscrição no app, e as duas
 * coisas são um botão aqui.
 */

const OK = 'CONNECTED';

type Diag = {
  ok?: boolean;
  token?: string;
  error?: string;
  numero?: { telefone?: string; nome?: string; situacao?: string; qualidade?: string; nome_status?: string };
  conta_waba?: { nome?: string; revisao_da_conta?: string; verificacao_do_negocio?: string };
  total?: number;
};
type Inscricao = { apps_inscritos?: { id?: string; nome?: string }[]; erro?: string };
type Modelos = {
  waba?: string;
  error?: string;
  na_conta?: { nome: string; status: string }[];
  faltando?: string[];
  resumo?: Record<string, number>;
  relatorio?: { nome: string; resultado: string; detalhe?: string }[];
};

const chamar = async (caminho: string, corpo?: unknown) => {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`${FUNCTIONS_URL}/${caminho}`, {
    method: corpo === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return r.json();
};

export default function Whatsapp() {
  const [diag, setDiag] = useState<Diag | null>(null);
  const [insc, setInsc] = useState<Inscricao | null>(null);
  const [mod, setMod] = useState<Modelos | null>(null);
  const [lendo, setLendo] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const ler = useCallback(async () => {
    setLendo(true);
    const [d, i, m] = await Promise.all([
      fetch(`${FUNCTIONS_URL}/wa-diagnostico`).then((r) => r.json()).catch(() => ({ error: 'sem resposta' })),
      fetch(`${FUNCTIONS_URL}/wa-inscricao`).then((r) => r.json()).catch(() => ({ erro: 'sem resposta' })),
      chamar('wa-templates', { action: 'listar' }).catch(() => ({ error: 'sem resposta' })),
    ]);
    setDiag(d); setInsc(i); setMod(m);
    setLendo(false);
  }, []);

  useEffect(() => { ler(); }, [ler]);

  const inscrever = async () => {
    setOcupado('webhook');
    try {
      const d = await fetch(`${FUNCTIONS_URL}/wa-inscricao`, { method: 'POST' }).then((r) => r.json());
      if (d?.ok) { toast.success('Conta inscrita no app'); await ler(); }
      else toast.error(d?.erro?.message ?? d?.error ?? 'Não consegui inscrever');
    } finally { setOcupado(null); }
  };

  const recriar = async () => {
    setOcupado('modelos');
    try {
      const d: Modelos = await chamar('wa-templates', { action: 'criar' });
      if (d?.error) { toast.error(d.error); return; }
      setMod(d);
      const r = d.resumo ?? {};
      toast[r.erros || r.pulados ? 'warning' : 'success'](
        `${r.criados ?? 0} criados · ${r.ja_existiam ?? 0} já existiam · ${r.erros ?? 0} com erro`,
      );
      await ler();
    } finally { setOcupado(null); }
  };

  const numeroOk = diag?.numero?.situacao === OK;
  const faltando = mod?.faltando ?? [];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-light tracking-[0.22em] uppercase text-primary mb-3">Canal oficial</p>
        <h1 className="text-[28px] sm:text-[34px] leading-[1.1] tracking-tight">
          <span className="block font-extralight text-foreground/45">A conta que fala</span>
          <span className="block font-bold text-foreground">com os clientes</span>
        </h1>
        <div className="h-[3px] w-14 bg-primary rounded-full mt-5" />
      </header>

      <button
        onClick={ler}
        disabled={lendo}
        className="inline-flex items-center gap-1.5 text-[12.5px] text-foreground/45 hover:text-foreground transition-colors disabled:opacity-40"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${lendo ? 'animate-spin' : ''}`} /> Reler da Meta
      </button>

      {/* ── Número e conta ─────────────────────────────────────── */}
      <Bloco titulo="Número e conta">
        {lendo && !diag ? <Esqueleto /> : diag?.error ? (
          <Aviso tom="ruim">{diag.error}</Aviso>
        ) : (
          <>
            <div
              className={`flex items-center gap-3 rounded-xl px-4 py-3 ${
                numeroOk ? 'bg-emerald-500/[0.07] border border-emerald-500/25'
                         : 'bg-red-500/[0.06] border border-red-500/30'
              }`}
            >
              {numeroOk
                ? <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" />
                : <ShieldAlert className="h-5 w-5 shrink-0 text-red-400" />}
              <div className="min-w-0">
                <p className={`text-[13px] font-semibold ${numeroOk ? 'text-emerald-400' : 'text-red-400'}`}>
                  {numeroOk ? 'Número operando' : `Número em ${diag?.numero?.situacao ?? 'estado desconhecido'}`}
                </p>
                <p className="text-[11.5px] text-foreground/50 leading-snug mt-0.5">
                  {numeroOk
                    ? 'A Meta aceita e entrega as mensagens.'
                    : 'A Meta aceita o envio e devolve protocolo, mas não entrega. O painel registra sucesso e nada chega.'}
                </p>
              </div>
            </div>
            <Linhas itens={[
              ['Telefone', diag?.numero?.telefone],
              ['Nome de exibição', diag?.numero?.nome],
              ['Situação do nome', diag?.numero?.nome_status],
              ['Qualidade', diag?.numero?.qualidade],
              ['Conta (WABA)', diag?.conta_waba?.nome],
              ['Revisão da conta', diag?.conta_waba?.revisao_da_conta],
              ['Token', diag?.token],
            ]} />
          </>
        )}
      </Bloco>

      {/* ── Webhook ────────────────────────────────────────────── */}
      <Bloco titulo="Inscrição no app">
        <p className="text-[12px] text-foreground/45 leading-snug">
          São dois passos que parecem um: o webhook diz para onde mandar, a inscrição diz de quem.
          Sem a inscrição, o webhook fica verde e nenhuma mensagem chega.
        </p>
        {lendo && !insc ? <Esqueleto /> : (insc?.apps_inscritos?.length ?? 0) > 0 ? (
          <Aviso tom="bom">Inscrita em {insc!.apps_inscritos!.map((a) => a.nome || a.id).join(', ')}</Aviso>
        ) : (
          <Aviso tom="ruim">{insc?.erro ?? 'Nenhum app inscrito nesta conta.'}</Aviso>
        )}
        <Botao onClick={inscrever} carregando={ocupado === 'webhook'}>Inscrever esta conta no app</Botao>
      </Bloco>

      {/* ── Modelos ────────────────────────────────────────────── */}
      <Bloco titulo="Modelos de mensagem">
        <p className="text-[12px] text-foreground/45 leading-snug">
          Modelo pertence à conta, não ao número: conta nova nasce sem nenhum, e cada um passa por
          aprovação da Meta de novo. Os onze textos aprovados estão guardados no código.
        </p>
        {lendo && !mod ? <Esqueleto /> : mod?.error ? (
          <Aviso tom="ruim">{mod.error}</Aviso>
        ) : (
          <>
            <Linhas itens={[
              ['Na conta', `${mod?.na_conta?.length ?? 0} de 11`],
              ['Faltando', faltando.length ? faltando.join(', ') : 'nenhum'],
            ]} />
            {(mod?.na_conta?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {mod!.na_conta!.map((t) => (
                  <span
                    key={t.nome}
                    title={t.status}
                    className={`text-[11px] px-2 py-1 rounded-lg border ${
                      t.status === 'APPROVED'
                        ? 'border-emerald-500/25 text-emerald-400/90 bg-emerald-500/[0.06]'
                        : 'border-amber-500/30 text-amber-400/90 bg-amber-500/[0.06]'
                    }`}
                  >
                    {t.nome}
                  </span>
                ))}
              </div>
            )}
            {mod?.relatorio && (
              <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.08] divide-y divide-black/[0.06] dark:divide-white/[0.06]">
                {mod.relatorio.map((l) => (
                  <div key={l.nome} className="flex items-baseline gap-3 px-3.5 py-2">
                    <span className="text-[12px] text-foreground/75 flex-1 truncate">{l.nome}</span>
                    <span className={`text-[11.5px] ${
                      l.resultado === 'criado' ? 'text-emerald-400'
                        : l.resultado === 'erro' ? 'text-red-400'
                        : 'text-foreground/40'
                    }`}>
                      {l.resultado}{l.detalhe ? ` · ${l.detalhe}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <Botao onClick={recriar} carregando={ocupado === 'modelos'} desabilitado={!faltando.length}>
          {faltando.length ? `Criar os ${faltando.length} que faltam` : 'Todos os modelos já estão na conta'}
        </Botao>
      </Bloco>
    </div>
  );
}

/* ── peças ─────────────────────────────────────────────────────── */

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.02] p-5 sm:p-6 space-y-3.5">
      <h2 className="text-[13px] font-semibold text-foreground">{titulo}</h2>
      {children}
    </section>
  );
}

function Linhas({ itens }: { itens: [string, string | undefined][] }) {
  return (
    <div className="space-y-1.5">
      {itens.map(([r, v]) => (
        <div key={r} className="flex items-baseline gap-3 min-w-0">
          <span className="text-[11px] text-foreground/35 w-36 shrink-0">{r}</span>
          <span className="text-[12.5px] text-foreground/85 truncate">{v ?? '—'}</span>
        </div>
      ))}
    </div>
  );
}

function Aviso({ tom, children }: { tom: 'bom' | 'ruim'; children: React.ReactNode }) {
  return (
    <p className={`text-[12px] rounded-xl px-3.5 py-2.5 leading-snug border ${
      tom === 'bom'
        ? 'text-emerald-400 bg-emerald-500/[0.06] border-emerald-500/25'
        : 'text-red-400 bg-red-500/[0.06] border-red-500/30'
    }`}>
      {children}
    </p>
  );
}

function Botao({ onClick, carregando, desabilitado, children }: {
  onClick: () => void; carregando?: boolean; desabilitado?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={carregando || desabilitado}
      className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-35 flex items-center justify-center gap-2"
    >
      {carregando && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

function Esqueleto() {
  return <div className="h-16 rounded-xl bg-black/[0.03] dark:bg-white/[0.03] animate-pulse" />;
}
