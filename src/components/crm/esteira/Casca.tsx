import type { ReactNode } from 'react';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A casca da esteira de uma loja: uma coisa de cada vez, em tela cheia.
 *
 * É a mesma casca do "Nova compra" do sistema do lojista (CascaDoAssistente), a pedido do dono
 * (18/11/2026: "nova compra é muito organizado, uma coisa de cada vez; eu quero exatamente
 * aquilo no CRM"): a barra de progresso em cima, a etapa em letra pequena, a pergunta grande,
 * o conteúdo e, embaixo, voltar à esquerda e a ação à direita.
 */
export function Casca({ legenda, indice, total, etapa, pergunta, dica, children, onVoltar, rotuloVoltar = 'Esteira', acao }: {
  legenda: string; indice: number; total: number; etapa: string; pergunta: string; dica?: ReactNode; children?: ReactNode;
  onVoltar: () => void; rotuloVoltar?: string;
  acao?: { rotulo: string; onClick: () => void; ocupado?: boolean; desabilitado?: boolean; calma?: boolean } | null;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:pt-[7vh] sm:pb-10">
        <div className="rounded-3xl border border-black/[0.07] dark:border-white/[0.08] bg-background p-5 sm:p-10 flex flex-col">
          <div className="pb-4 border-b border-black/[0.06] dark:border-foreground/[0.06]">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-semibold text-foreground/60 truncate">{legenda}</span>
              <span className="text-[11px] text-foreground/40 shrink-0 ml-3 tabular-nums">{indice + 1} / {total}</span>
            </div>
            <div className="flex gap-0.5">
              {Array.from({ length: total }).map((_, i) => (
                <div key={i} className={cn('h-[3px] flex-1 rounded-full transition-all duration-300',
                  i < indice ? 'bg-primary' : i === indice ? 'bg-primary/60' : 'bg-black/[0.06] dark:bg-foreground/[0.08]')} />
              ))}
            </div>
          </div>
          <div className="pt-7 pb-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2">{etapa}</p>
            <h1 className="text-[28px] sm:text-[36px] leading-[1.12] font-bold text-foreground tracking-tight">{pergunta}</h1>
            {dica && <p className="text-[16px] sm:text-[17px] text-foreground/55 mt-3 leading-relaxed">{dica}</p>}
          </div>
          <div className="pb-2 space-y-4">{children}</div>
          <div className="pt-4 mt-3 border-t border-black/[0.06] dark:border-foreground/[0.06] flex items-center justify-between gap-2">
            <button onClick={onVoltar} className="h-9 px-2 -ml-2 rounded-xl text-[13px] text-foreground/50 hover:text-foreground flex items-center gap-1 transition-colors">
              <ChevronLeft className="h-4 w-4" /> {rotuloVoltar}
            </button>
            {acao && (
              <button onClick={acao.onClick} disabled={acao.ocupado || acao.desabilitado}
                className={cn('min-w-[170px] h-12 px-6 rounded-2xl text-[15px] font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50',
                  acao.calma ? 'border border-black/[0.1] dark:border-white/[0.12] text-foreground/80 hover:text-foreground' : 'bg-primary text-primary-foreground hover:opacity-90')}>
                {acao.ocupado && <Loader2 className="h-4 w-4 animate-spin" />} {acao.rotulo}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Uma escolha grande, como as do "Nova compra": o rótulo e, embaixo, o que acontece ao tocar. */
export function Opcao({ rotulo, sub, onClick, disabled, destaque, href }: {
  rotulo: string; sub?: string; onClick?: () => void; disabled?: boolean; destaque?: boolean; href?: string;
}) {
  const cls = cn(
    'w-full text-left px-6 py-5 rounded-2xl border-2 transition-all disabled:opacity-50 block',
    destaque ? 'border-primary bg-primary/10' : 'border-black/[0.09] dark:border-white/[0.1] hover:border-primary/40 hover:bg-black/[0.02] dark:hover:bg-white/[0.03]',
  );
  const dentro = (
    <>
      <span className={cn('block text-[18px] font-semibold', destaque ? 'text-primary' : 'text-foreground')}>{rotulo}</span>
      {sub && <span className="block text-[14px] text-foreground/50 mt-0.5 font-normal">{sub}</span>}
    </>
  );
  return href
    ? <a href={href} target="_blank" rel="noreferrer" className={cls}>{dentro}</a>
    : <button type="button" onClick={onClick} disabled={disabled} className={cls}>{dentro}</button>;
}

/** Botão pequeno de apoio (abrir conversa, ligar, entrar na chamada). */
export const APOIO = 'h-10 px-4 rounded-xl text-[13px] font-semibold border border-black/[0.1] dark:border-white/[0.12] text-foreground/75 hover:text-foreground hover:border-black/20 dark:hover:border-white/25 inline-flex items-center gap-1.5 transition-colors';
export const CAMPO = 'w-full h-12 px-4 rounded-xl bg-background border border-black/[0.12] dark:border-white/[0.12] text-[15px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/60';
