import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Ban, Copy, KeyRound, Loader2, Lock, LockOpen, Power, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useUpdateClient, type Client } from '@/hooks/useAdmin';
import {
  bloquearTransportadora, criarSistemaTransportadora, desligarTransportadora, gerarLinkDeAcesso,
  type FichaTransportadora, type LinkDeAcesso,
} from '@/hooks/useTransportadoras';
import { TRANSPORTES_APP_URL } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Panel, SectionHeader } from '@/components/admin/ui';

/* O sistema da transportadora, visto da ficha do cliente: criar, gerar o
   link de acesso, bloquear pela mensalidade e desligar. Tudo acontece no
   projeto das transportadoras (hooks/useTransportadoras.ts). Domínio,
   canais, estoque e anúncio são do lojista e não aparecem aqui. */

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors';

const copiar = (texto: string) => {
  navigator.clipboard.writeText(texto).then(
    () => toast.success('Link copiado'),
    () => toast.error('Não consegui copiar — selecione o link e copie.'),
  );
};

const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : null;

/**
 * O link de acesso, pronto para copiar. Vale 24 horas e funciona uma vez:
 * quem abre define a própria senha. Por enquanto a entrega é à mão — o
 * envio automático pelo WhatsApp fica para depois (pedido do dono, 29/10).
 */
export function LinkGerado({ link }: { link: LinkDeAcesso }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] px-3 py-2.5">
        <KeyRound className="h-3.5 w-3.5 text-foreground/40 shrink-0" />
        <p className="text-[12px] font-mono text-foreground flex-1 min-w-0 truncate select-all" title={link.url}>{link.url}</p>
        <button
          onClick={() => copiar(link.url)}
          className="h-7 px-2.5 rounded-lg bg-primary/10 text-primary text-[11.5px] font-semibold hover:bg-primary/20 flex items-center gap-1.5 shrink-0"
        >
          <Copy className="h-3 w-3" /> Copiar
        </button>
      </div>
      <p className="text-[10.5px] text-foreground/35">Vale 24 horas e funciona uma vez: quem abre define a própria senha.</p>
    </div>
  );
}

/* ── Criar o sistema ──────────────────────────────────────────── */
export function CriarSistemaDialog({ client, onDone, onClose }: {
  client: Client;
  onDone: () => void;
  onClose: () => void;
}) {
  const update = useUpdateClient();
  const [email, setEmail] = useState(client.admin_email || client.email || '');
  const [nome, setNome] = useState(client.contact_name || '');
  const [carregando, setCarregando] = useState(false);
  const [link, setLink] = useState<LinkDeAcesso | null>(null);

  const criar = async () => {
    if (!email.trim()) { toast.error('Informe o e-mail de quem vai entrar primeiro'); return; }
    setCarregando(true);
    try {
      const r = await criarSistemaTransportadora({
        nome: client.legal_name || client.company_name,
        nome_fantasia: client.company_name,
        cnpj: client.cnpj ?? undefined,
        uf: client.state ?? undefined,
        cidade: client.city ?? undefined,
        whatsapp: client.whatsapp ?? undefined,
        admin_email: email.trim(),
        admin_full_name: nome.trim() || undefined,
      });
      await update.mutateAsync({ id: client.id, transportes_empresa_id: r.empresa_id, admin_email: r.admin_email });
      setLink({ token: r.token, url: r.url });
      toast.success('Sistema da transportadora criado');
      onDone();
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível criar o sistema');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">
            {link ? 'Sistema criado' : 'Criar sistema da transportadora'}
          </DialogTitle>
        </DialogHeader>
        {link ? (
          <div className="space-y-3 pt-1">
            <p className="text-[12px] text-foreground/50 leading-snug">
              Envie este link para {nome.trim() || 'a transportadora'}. É por ele que o primeiro acesso acontece.
            </p>
            <LinkGerado link={link} />
            <button onClick={onClose}
              className="w-full h-10 rounded-xl border border-black/[0.1] dark:border-white/[0.1] text-[13px] font-medium text-foreground/70 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
              Pronto
            </button>
          </div>
        ) : (
          <>
            <p className="text-[11.5px] text-foreground/40 -mt-1">
              Cria a transportadora no sistema, com a conta de quem entra primeiro e o link de acesso.
            </p>
            <div className="space-y-2.5 pt-1">
              <input className={inputCls} type="email" placeholder="E-mail de quem entra primeiro *" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input className={inputCls} placeholder="Nome dessa pessoa" value={nome} onChange={(e) => setNome(e.target.value)} />
              <button
                onClick={criar}
                disabled={carregando}
                className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                Criar sistema
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Link de acesso para quem já é da transportadora ──────────── */
export function LinkDeAcessoDialog({ client, ficha, onClose }: {
  client: Client;
  ficha: FichaTransportadora | null;
  onClose: () => void;
}) {
  const pessoas = ficha?.pessoas ?? [];
  const [email, setEmail] = useState(client.admin_email || pessoas[0]?.email || '');
  const [motivo, setMotivo] = useState<'convite' | 'redefinir'>('convite');
  const [carregando, setCarregando] = useState(false);
  const [link, setLink] = useState<LinkDeAcesso | null>(null);

  const gerar = async () => {
    if (!client.transportes_empresa_id || !email.trim()) return;
    setCarregando(true);
    try {
      const pessoa = pessoas.find((p) => p.email === email.trim());
      setLink(await gerarLinkDeAcesso({
        empresa_id: client.transportes_empresa_id,
        admin_email: email.trim(),
        admin_full_name: pessoa?.nome ?? undefined,
        motivo,
      }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-black/[0.1] dark:border-white/[0.1] rounded-2xl">
        <DialogHeader><DialogTitle className="text-[15px] font-semibold">Link de acesso</DialogTitle></DialogHeader>
        <div className="space-y-2.5 pt-1">
          {pessoas.length > 1 ? (
            <select className={inputCls} value={email} onChange={(e) => { setEmail(e.target.value); setLink(null); }}>
              {pessoas.map((p) => <option key={p.email} value={p.email}>{p.nome ? `${p.nome} · ${p.email}` : p.email}</option>)}
            </select>
          ) : (
            <input className={inputCls} type="email" placeholder="E-mail de quem vai entrar" value={email}
              onChange={(e) => { setEmail(e.target.value); setLink(null); }} />
          )}
          {/* Primeiro acesso ou esqueceu a senha: a tela que a pessoa abre muda o texto. */}
          <div className="flex p-1 rounded-xl bg-black/[0.04] dark:bg-white/[0.05]">
            {([['convite', 'Primeiro acesso'], ['redefinir', 'Esqueceu a senha']] as const).map(([k, rotulo]) => (
              <button key={k} onClick={() => { setMotivo(k); setLink(null); }}
                className={cn('flex-1 h-8 rounded-lg text-[12.5px] font-medium transition-colors',
                  motivo === k ? 'bg-background text-foreground shadow-sm' : 'text-foreground/40')}>
                {rotulo}
              </button>
            ))}
          </div>
          {link ? <LinkGerado link={link} /> : (
            <button onClick={gerar} disabled={carregando || !email.trim()}
              className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
              {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Gerar link
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── A aba Sistema ────────────────────────────────────────────── */
const Numero = ({ rotulo, valor, sub, tom }: { rotulo: string; valor: string | number; sub?: string; tom?: 'ruim' | 'bom' }) => (
  <div className="rounded-2xl border border-black/[0.07] dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.03] px-4 py-3">
    <p className="text-[10px] font-semibold tracking-widest uppercase text-foreground/35">{rotulo}</p>
    <p className={cn('text-[19px] font-bold tabular-nums mt-1',
      tom === 'ruim' ? 'text-red-400' : tom === 'bom' ? 'text-emerald-500' : 'text-foreground')}>{valor}</p>
    {sub && <p className="text-[10.5px] text-foreground/35 mt-0.5">{sub}</p>}
  </div>
);

export function SistemaDaTransportadora({ client, ficha, carregando, onLink }: {
  client: Client;
  ficha: FichaTransportadora | null;
  carregando: boolean;
  onLink: () => void;
}) {
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const empresa = client.transportes_empresa_id;

  const agir = async (qual: string, fazer: () => Promise<unknown>, ok: string) => {
    setOcupado(qual);
    try {
      await fazer();
      toast.success(ok);
      qc.invalidateQueries({ queryKey: ['ficha-transportadora', empresa] });
      qc.invalidateQueries({ queryKey: ['carteira-transportadoras'] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  if (!empresa) {
    return (
      <Panel className="p-5">
        <p className="text-[12.5px] text-foreground/45">
          Sistema ainda não criado — crie no Resumo para acompanhar o uso.
        </p>
      </Panel>
    );
  }

  const bloqueada = !!ficha?.bloqueada_em;
  const desligada = ficha ? !ficha.ativo : false;

  return (
    <div className="flex flex-col gap-5">
      <Panel className="p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold text-foreground">{TRANSPORTES_APP_URL.replace('https://', '')}</p>
            <p className="text-[11px] text-foreground/40">
              {desligada ? 'Desligado: ninguém da transportadora entra'
                : bloqueada ? `Bloqueado pela mensalidade desde ${quando(ficha!.bloqueada_em)}`
                : 'endereço do sistema desta transportadora'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button onClick={onLink}
              className="h-8 px-2.5 rounded-lg border border-primary/40 text-[11.5px] font-medium text-primary hover:bg-primary/10 flex items-center gap-1.5">
              <KeyRound className="h-3 w-3" /> Link de acesso
            </button>
            <button
              onClick={() => agir('bloqueio', () => bloquearTransportadora(empresa, !bloqueada, 'mensalidade'),
                bloqueada ? 'Acesso liberado' : 'Acesso bloqueado pela mensalidade')}
              disabled={!!ocupado || !ficha || desligada}
              title={bloqueada ? 'Volta a abrir as telas' : 'A transportadora vê o aviso de mensalidade no lugar das telas'}
              className="h-8 px-2.5 rounded-lg border border-black/[0.1] dark:border-white/[0.1] text-[11.5px] font-medium text-foreground/60 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] disabled:opacity-50 flex items-center gap-1.5"
            >
              {ocupado === 'bloqueio' ? <Loader2 className="h-3 w-3 animate-spin" /> : bloqueada ? <LockOpen className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
              {bloqueada ? 'Liberar' : 'Bloquear'}
            </button>
            <button
              onClick={() => {
                if (!desligada && !confirm(`Desligar o sistema de ${client.company_name}? Ninguém da transportadora vai conseguir entrar.`)) return;
                agir('ligar', () => desligarTransportadora(empresa, !desligada), desligada ? 'Sistema religado' : 'Sistema desligado');
              }}
              disabled={!!ocupado || !ficha}
              className={cn('h-8 px-2.5 rounded-lg border text-[11.5px] font-medium disabled:opacity-50 flex items-center gap-1.5',
                desligada
                  ? 'border-black/[0.1] dark:border-white/[0.1] text-foreground/60 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                  : 'border-red-500/30 text-red-400 hover:bg-red-500/10')}
            >
              {ocupado === 'ligar' ? <Loader2 className="h-3 w-3 animate-spin" /> : desligada ? <Power className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
              {desligada ? 'Religar' : 'Desligar'}
            </button>
          </div>
        </div>
      </Panel>

      <div>
        <SectionHeader title="Uso do sistema" right={carregando ? <Loader2 className="h-3 w-3 animate-spin text-foreground/30" /> : undefined} />
        {ficha ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
            <Numero rotulo="Caminhões" valor={ficha.caminhoes} sub={`${ficha.veiculos} veículos com as carretas`} />
            <Numero rotulo="Motoristas" valor={ficha.motoristas} />
            <Numero rotulo="Clientes" valor={ficha.clientes} sub="quem contrata o frete" />
            <Numero rotulo="Viagens · 30 dias" valor={ficha.viagens_30d} sub={`${ficha.viagens} no total`} />
            <Numero rotulo="Documentos · 30 dias" valor={ficha.documentos_30d} sub="CT-e, MDF-e e os outros emitidos" />
            <Numero rotulo="Certificado digital" valor={ficha.certificado_ok ? 'ok' : 'falta'}
              tom={ficha.certificado_ok ? 'bom' : 'ruim'}
              sub={ficha.certificado_validade ? `vence em ${quando(ficha.certificado_validade)}` : 'sem ele não sai CT-e'} />
          </div>
        ) : (
          <Panel className="p-5">
            <p className="text-[12.5px] text-foreground/45">
              {carregando ? 'Lendo o sistema da transportadora…' : 'O sistema da transportadora não respondeu agora.'}
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}

/* ── A aba Pessoas ────────────────────────────────────────────── */
const PAPEL: Record<string, string> = { dono: 'Dono', operacao: 'Operação', financeiro: 'Financeiro', motorista: 'Motorista' };

export function PessoasDaTransportadora({ ficha }: { ficha: FichaTransportadora | null }) {
  if (!ficha) {
    return (
      <Panel className="p-5">
        <p className="text-[12.5px] text-foreground/45">Sem sistema criado não há contas de acesso para mostrar.</p>
      </Panel>
    );
  }
  return (
    <div>
      <SectionHeader title={`Quem usa · ${ficha.pessoas.length}`} />
      <Panel className="divide-y divide-black/[0.05] dark:divide-white/[0.05] overflow-hidden">
        {ficha.pessoas.map((p) => (
          <div key={p.email} className="px-4 py-2.5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium text-foreground truncate">{p.nome || p.email}</p>
              <p className="text-[11px] text-foreground/40 truncate">{p.nome ? `${p.email} · ` : ''}{PAPEL[p.papel] ?? p.papel}</p>
            </div>
            <p className={cn('text-[11px] shrink-0 text-right', p.ultimo_acesso || p.definiu_senha_em ? 'text-foreground/45' : 'text-amber-500')}>
              {p.ultimo_acesso ? `entrou em ${quando(p.ultimo_acesso)}`
                : p.definiu_senha_em ? `senha criada em ${quando(p.definiu_senha_em)}`
                : 'ainda não entrou'}
            </p>
          </div>
        ))}
      </Panel>
    </div>
  );
}
