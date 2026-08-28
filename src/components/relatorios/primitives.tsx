import type { ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

/* ══════════════════════════════════════════════════════════════════
   Vocabulário visual do Relatórios — o mesmo do sistema-lojista.

   Densidade é bem-vinda; desordem não. O que segura isso são três
   regras: laranja é escasso (exatamente um KPI accent por grade),
   a hierarquia vem de opacidade e não de cinza sólido, e todo bloco
   declara no título se é FILME (· {período}) ou FOTO (· hoje).
   ══════════════════════════════════════════════════════════════════ */

export const brl = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });

export const brlFull = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Guarda de divisão: sem base, travessão — nunca 0%, nunca NaN. */
export const razao = (num: number, den: number, fmt: (n: number) => string) =>
  den > 0 ? fmt(num / den) : '—';

export const pct = (num: number, den: number, casas = 1) =>
  den > 0 ? `${((num / den) * 100).toFixed(casas)}%` : '—';

/** Cor por índice, para dimensões de texto livre (plano, origem, UF).
 *  Ordenação determinística no chamador, senão a cor troca ao crescer a base. */
export const TYPE_COLORS = [
  'hsl(25,95%,53%)',   // laranja da marca
  'hsl(220,70%,55%)',  // azul
  'hsl(152,60%,45%)',  // verde
  'hsl(280,60%,60%)',  // violeta
  'hsl(45,90%,50%)',   // âmbar
  'hsl(190,70%,50%)',  // ciano
];

/** As cinco fases do contrato — o equivalente às "áreas" do lojista. */
export const STATUS_COLORS: Record<string, string> = {
  onboarding: 'hsl(45,90%,50%)',
  ativo: 'hsl(152,60%,45%)',
  inadimplente: 'hsl(0,70%,50%)',
  pausado: 'hsl(280,60%,60%)',
  cancelado: 'hsl(220,10%,45%)',
};

export const STATUS_LABEL: Record<string, string> = {
  onboarding: 'Onboarding',
  ativo: 'Ativo',
  inadimplente: 'Inadimplente',
  pausado: 'Pausado',
  cancelado: 'Cancelado',
};

/* ── Cartão de vidro ─────────────────────────────────────────────── */
export function GCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn(
      'rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.10] dark:border-white/[0.08] p-5',
      className,
    )}>
      {children}
    </div>
  );
}

/* ── Cabeçalho de painel ─────────────────────────────────────────── */
export function SectionTitle({ icon, title, sub }: { icon: ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex items-start gap-2 mb-4">
      <span className="text-foreground/40 mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-foreground leading-tight">{title}</p>
        {sub && <p className="text-[11px] text-foreground/40 mt-0.5 leading-snug">{sub}</p>}
      </div>
    </div>
  );
}

/* ── KPI ─────────────────────────────────────────────────────────── */
export interface Kpi {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
  negative?: boolean;
}

export function KpiGrid({ items, cols = 4 }: { items: Kpi[]; cols?: 3 | 4 | 5 }) {
  return (
    <div className={cn(
      'grid grid-cols-2 gap-3',
      cols === 3 ? 'lg:grid-cols-3' : cols === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4',
    )}>
      {items.map((k, i) => (
        <div key={i} className={cn(
          'flex flex-col gap-2 p-4 rounded-2xl border transition-all',
          k.accent
            ? 'bg-primary/[0.06] border-primary/[0.14]'
            : 'bg-black/[0.03] dark:bg-white/[0.04] border-black/[0.10] dark:border-white/[0.08]',
        )}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] text-foreground/40 leading-none">{k.label}</p>
            <span className={cn('opacity-40 shrink-0', k.accent && 'text-primary opacity-70')}>{k.icon}</span>
          </div>
          <p className={cn(
            'text-2xl font-bold leading-none tracking-tight tabular-nums',
            k.accent ? 'text-primary' : k.negative ? 'text-red-400' : 'text-foreground',
          )}>
            {k.value}
          </p>
          <p className="text-[11px] text-foreground/30 leading-snug">{k.sub}</p>
        </div>
      ))}
    </div>
  );
}

/* ── Cartão de fase, com borda colorida à esquerda ───────────────── */
export function AreaCard({
  nome, cor, valor, sub,
}: { nome: string; cor: string; valor: string; sub: string }) {
  return (
    <div
      className="flex flex-col gap-2 p-4 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.10] dark:border-white/[0.08]"
      style={{ borderLeftColor: cor, borderLeftWidth: 2 }}
    >
      <p className="text-[12px] font-semibold" style={{ color: cor }}>{nome}</p>
      <p className="text-xl font-bold text-foreground leading-none tabular-nums">{valor}</p>
      <p className="text-[11px] text-foreground/30 leading-snug">{sub}</p>
    </div>
  );
}

/* ── Gráfico ─────────────────────────────────────────────────────── */
export function Chart({ h = 280, children }: { h?: number; children: React.ReactElement }) {
  return (
    <div style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    </div>
  );
}

/** Tooltip próprio — sem components/ui/chart.tsx no painel. */
export function CTip({ active, payload, label, fmt }: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; payload?: Record<string, unknown> }[];
  label?: string;
  fmt?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const f = fmt ?? ((v: number) => String(v));
  return (
    <div className="rounded-xl border border-black/[0.10] dark:border-white/[0.10] bg-background/95 backdrop-blur px-3 py-2 shadow-xl">
      {label && <p className="text-[11px] text-foreground/50 mb-1">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-[12px]">
          {p.color && <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />}
          {p.name && <span className="text-foreground/60">{p.name}</span>}
          <span className="font-semibold text-foreground tabular-nums ml-auto">{f(Number(p.value ?? 0))}</span>
        </div>
      ))}
    </div>
  );
}

export const EIXO = {
  tick: { fill: 'rgba(148,163,184,0.55)', fontSize: 11 },
  axisLine: false as const,
  tickLine: false as const,
};

export const GRADE = 'rgba(148,163,184,0.10)';
export const CURSOR = { fill: 'rgba(148,163,184,0.06)' };

/* ── Vazio ───────────────────────────────────────────────────────── */
/** A frase sempre nomeia o insumo que falta — nunca "sem dados". */
export function Empty({ h = 280, children }: { h?: number; children: ReactNode }) {
  return (
    <div className="flex items-center justify-center text-center px-4" style={{ height: h }}>
      <p className="text-[13px] text-foreground/30">{children}</p>
    </div>
  );
}

/* ── Linha de ranking ────────────────────────────────────────────── */
export function RankRow({
  pos, nome, meta, valor, cor, onClick,
}: {
  pos: number;
  nome: string;
  meta?: string;
  valor: string;
  cor?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/[0.05]',
        onClick && 'cursor-pointer hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors',
      )}
    >
      <span
        className="h-6 w-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0"
        style={{ background: `${cor ?? 'hsl(25,95%,53%)'}22`, color: cor ?? 'hsl(25,95%,53%)' }}
      >
        {pos}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] text-foreground/80 truncate leading-tight">{nome}</p>
        {meta && <p className="text-[11px] text-foreground/30 truncate leading-tight mt-0.5">{meta}</p>}
      </div>
      <p className="text-[12.5px] font-semibold text-foreground tabular-nums shrink-0">{valor}</p>
    </div>
  );
}

/* ── Tabela ──────────────────────────────────────────────────────── */
export function ZebraTable({
  head, children, sticky,
}: { head: ReactNode[]; children: ReactNode; sticky?: boolean }) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="border-b border-black/[0.08] dark:border-white/[0.08]">
            {head.map((h, i) => (
              <th
                key={i}
                className={cn(
                  'text-left font-medium text-foreground/40 text-[11px] py-2 px-2 whitespace-nowrap',
                  i > 0 && 'text-right',
                  sticky && i === 0 && 'sticky left-0 bg-background z-10',
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Tr({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'border-b border-black/[0.04] dark:border-white/[0.04] last:border-b-0',
        onClick && 'cursor-pointer hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors',
      )}
    >
      {children}
    </tr>
  );
}

export function Td({ children, className, sticky }: { children: ReactNode; className?: string; sticky?: boolean }) {
  return (
    <td className={cn(
      'py-2 px-2 text-foreground/70 tabular-nums text-right whitespace-nowrap',
      sticky && 'sticky left-0 bg-background z-10 text-left',
      className,
    )}>
      {children}
    </td>
  );
}

/* ── Bloco tintado, para aging e faixas ──────────────────────────── */
export function TintedBlock({
  titulo, valor, sub, cor,
}: { titulo: string; valor: string; sub: string; cor: string }) {
  return (
    <div className="rounded-xl p-3 border" style={{ background: `${cor}12`, borderColor: `${cor}33` }}>
      <p className="text-[11px] font-medium" style={{ color: cor }}>{titulo}</p>
      <p className="text-[17px] font-bold text-foreground leading-none mt-1.5 tabular-nums">{valor}</p>
      <p className="text-[10.5px] text-foreground/30 mt-1">{sub}</p>
    </div>
  );
}

/* ── Barra proporcional simples ──────────────────────────────────── */
export function BarRow({
  label, valor, total, cor, right,
}: { label: string; valor: number; total: number; cor?: string; right: string }) {
  return (
    <div className="flex items-center gap-3">
      <p className="text-[12px] text-foreground/60 w-28 shrink-0 truncate">{label}</p>
      <div className="flex-1 h-2 rounded-full bg-black/[0.05] dark:bg-white/[0.06] overflow-hidden">
        {/* Barra de zero tem largura zero — toco mínimo sugere movimento que não houve. */}
        <div
          className="h-full rounded-full transition-all"
          style={{ width: total > 0 ? `${(valor / total) * 100}%` : '0%', background: cor ?? 'hsl(25,95%,53%)' }}
        />
      </div>
      <p className="text-[12px] font-medium text-foreground/80 tabular-nums w-20 text-right shrink-0">{right}</p>
    </div>
  );
}

/* ── Sub-abas ────────────────────────────────────────────────────── */
export function SubTabs({
  opcoes, valor, onChange, cor,
}: {
  opcoes: string[];
  valor: string;
  onChange: (v: string) => void;
  cor: 'primary' | 'blue' | 'emerald' | 'violet';
}) {
  const ativo = {
    primary: 'bg-primary/10 text-primary border-primary/30',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    violet: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
  }[cor];

  return (
    <div className="flex flex-wrap gap-2">
      {opcoes.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={cn(
            'px-4 py-1.5 rounded-full text-sm font-medium border transition-all',
            valor === o ? ativo : 'bg-muted/30 text-muted-foreground border-transparent hover:bg-muted/60',
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
