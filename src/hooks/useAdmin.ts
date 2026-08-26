import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, LOJISTA_FUNCTIONS_URL } from '@/integrations/supabase/client';

/* ═══ Tipos ═══════════════════════════════════════════════════ */

export type ProspectStage = 'novo' | 'contato' | 'reuniao' | 'amostra' | 'proposta' | 'fechamento' | 'ganho' | 'perdido';

export interface Prospect {
  id: string;
  company_name: string;
  contact_name: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  source: string | null;
  stage: ProspectStage;
  proposal_value: number | null;
  plan: string | null;
  notes: string | null;
  lost_reason: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Demo {
  id: string;
  prospect_id: string | null;
  company_name: string;
  /** Quem vai receber a amostra — aparece na abertura do sistema. */
  contact_name: string | null;
  slug: string;
  logo_url: string | null;
  site_logo_url: string | null;
  brand_icon_url: string | null;
  banner_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
  hero_subtitle: string | null;
  hero_title: string | null;
  hero_description: string | null;
  status: 'rascunho' | 'provisionada' | 'apresentada' | 'convertida' | 'descartada';
  lojista_company_id: string | null;
  admin_email: string | null;
  admin_password: string | null;
  demo_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Meeting {
  id: string;
  prospect_id: string | null;
  demo_id: string | null;
  title: string;
  scheduled_at: string;
  duration_min: number;
  kind: 'descoberta' | 'demo' | 'proposta' | 'fechamento' | 'onboarding' | 'outro';
  status: 'agendada' | 'realizada' | 'cancelada' | 'remarcada';
  meet_link: string | null;
  notes: string | null;
  outcome: string | null;
  owner_id: string | null;
  created_at: string;
  prospect?: Pick<Prospect, 'id' | 'company_name' | 'contact_name'> | null;
  demo?: Pick<Demo, 'id' | 'company_name' | 'status'> | null;
}

export interface Client {
  id: string;
  prospect_id: string | null;
  company_name: string;
  cnpj: string | null;
  contact_name: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  plan: string | null;
  mrr: number | null;
  status: 'onboarding' | 'ativo' | 'inadimplente' | 'pausado' | 'cancelado';
  lojista_company_id: string | null;
  domain: string | null;
  logo_url: string | null;
  admin_email: string | null;
  admin_password: string | null;
  legal_name: string | null;
  address: string | null;
  legal_rep_name: string | null;
  legal_rep_cpf: string | null;
  contract_signed_at: string | null;
  activated_at: string | null;
  canceled_at: string | null;
  notes: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnboardingTask {
  id: string;
  client_id: string;
  task_key: string;
  label: string;
  done: boolean;
  done_at: string | null;
  done_by: string | null;
  sort: number;
}

export interface Contract {
  id: string;
  client_id: string | null;
  prospect_id: string | null;
  title: string;
  value: number;
  recurrence: 'mensal' | 'anual' | 'unico';
  status: 'rascunho' | 'enviado' | 'assinado' | 'cancelado';
  file_url: string | null;
  sent_at: string | null;
  signed_at: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  client_id: string;
  description: string;
  amount: number;
  due_date: string;
  paid_at: string | null;
  status: 'pendente' | 'pago' | 'atrasado' | 'cancelado';
  method: 'pix' | 'boleto' | 'cartao' | 'transferencia' | 'outro' | null;
  invoice_url: string | null;
  created_at: string;
  client?: Pick<Client, 'id' | 'company_name'> | null;
}

export interface Ticket {
  id: string;
  client_id: string | null;
  subject: string;
  description: string | null;
  priority: 'baixa' | 'media' | 'alta' | 'urgente';
  status: 'aberto' | 'em_andamento' | 'aguardando' | 'resolvido';
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  client?: Pick<Client, 'id' | 'company_name'> | null;
}

export interface TeamMemberRow {
  id: string;
  full_name: string;
  email: string;
  role: 'admin' | 'vendedor' | 'suporte' | 'financeiro';
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Activity {
  id: string;
  prospect_id: string | null;
  client_id: string | null;
  kind: string;
  content: string;
  author_id: string | null;
  created_at: string;
}

/* ═══ Prospects ═══════════════════════════════════════════════ */

export const useProspects = () =>
  useQuery({
    queryKey: ['prospects'],
    queryFn: async () => {
      const { data, error } = await supabase.from('prospects').select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      return data as Prospect[];
    },
  });

export const useCreateProspect = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Prospect>) => {
      const { data, error } = await supabase.from('prospects').insert(input).select().single();
      if (error) throw error;
      return data as Prospect;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prospects'] }),
  });
};

export const useUpdateProspect = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Prospect> & { id: string }) => {
      const { error } = await supabase.from('prospects').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prospects'] }),
  });
};

/** Marca prospect como ganho e cria o cliente correspondente */
export const useWinProspect = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: Prospect) => {
      const { error: upErr } = await supabase.from('prospects').update({ stage: 'ganho' }).eq('id', p.id);
      if (upErr) throw upErr;
      const { data: client, error } = await supabase
        .from('clients')
        .insert({
          prospect_id: p.id,
          company_name: p.company_name,
          contact_name: p.contact_name,
          whatsapp: p.whatsapp,
          email: p.email,
          city: p.city,
          state: p.state,
          plan: p.plan,
          mrr: p.proposal_value ?? 0,
          owner_id: p.owner_id,
        })
        .select()
        .single();
      if (error) throw error;
      return client as Client;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prospects'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
  });
};

/* ═══ Esteira — o estágio do prospect governa as abas ═════════ */

/** Ordem da esteira. Ações só empurram para frente, nunca para trás. */
export const STAGE_RANK: Record<ProspectStage, number> = {
  novo: 0, contato: 1, reuniao: 2, amostra: 3, proposta: 4, fechamento: 5, ganho: 6, perdido: 99,
};

/** Avança o prospect ao executar a ação da etapa (agendar, criar amostra...). */
export const useAdvanceProspect = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, from, to }: { id: string; from: ProspectStage; to: ProspectStage }) => {
      if (from === 'ganho' || from === 'perdido') return;
      if (STAGE_RANK[from] >= STAGE_RANK[to]) return;
      const { error } = await supabase.from('prospects').update({ stage: to }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prospects'] }),
  });
};

export interface SaleInput {
  company_name: string;
  legal_name?: string | null;
  cnpj?: string | null;
  address?: string | null;
  legal_rep_name?: string | null;
  legal_rep_cpf?: string | null;
  contact_name?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  plan?: string | null;
  mrr?: number | null;
  recurrence?: 'mensal' | 'anual' | 'unico';
  owner_id?: string | null;
}

/**
 * Registra a venda: cria o cliente, emite o contrato em rascunho,
 * marca a etapa "Contrato gerado" e fecha o prospect como ganho.
 */
export const useRegisterSale = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ input, prospectId }: { input: SaleInput; prospectId?: string | null }) => {
      const { recurrence = 'mensal', ...clientFields } = input;

      const { data: client, error } = await supabase
        .from('clients')
        .insert({ ...clientFields, prospect_id: prospectId ?? null, mrr: input.mrr ?? 0 })
        .select()
        .single();
      if (error) throw error;

      const value = input.mrr ?? 0;
      const { error: contractErr } = await supabase.from('contracts').insert({
        client_id: client.id,
        prospect_id: prospectId ?? null,
        title: `Contrato de licença de uso — ${input.company_name}`,
        value,
        recurrence,
        status: 'rascunho',
      });
      if (contractErr) throw contractErr;

      // o trigger já semeou o checklist; contrato emitido = etapa cumprida
      await supabase
        .from('onboarding_tasks')
        .update({ done: true, done_at: new Date().toISOString(), done_by: input.owner_id ?? null })
        .eq('client_id', client.id)
        .eq('task_key', 'contrato_gerado');

      if (prospectId) {
        await supabase.from('prospects').update({ stage: 'ganho' }).eq('id', prospectId);
      }

      return client as Client;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['prospects'] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['onboarding-progress'] });
    },
  });
};

/* ═══ Reuniões ════════════════════════════════════════════════ */

const meetingSelect = '*, prospect:prospects(id, company_name, contact_name), demo:demos(id, company_name, status)';

export const useMeetings = () =>
  useQuery({
    queryKey: ['meetings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('meetings').select(meetingSelect).order('scheduled_at', { ascending: true });
      if (error) throw error;
      return data as Meeting[];
    },
  });

export const useCreateMeeting = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Meeting>) => {
      const { prospect: _p, demo: _d, ...row } = input as Meeting;
      const { error } = await supabase.from('meetings').insert(row);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meetings'] }),
  });
};

export const useUpdateMeeting = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Meeting> & { id: string }) => {
      const { prospect: _p, demo: _d, ...row } = patch as Meeting;
      const { error } = await supabase.from('meetings').update(row).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meetings'] }),
  });
};

/* ═══ Amostras ════════════════════════════════════════════════ */

export const useDemos = () =>
  useQuery({
    queryKey: ['demos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('demos').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Demo[];
    },
  });

export const useCreateDemo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Demo>) => {
      const { data, error } = await supabase.from('demos').insert(input).select().single();
      if (error) throw error;
      return data as Demo;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['demos'] }),
  });
};

export const useUpdateDemo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Demo> & { id: string }) => {
      const { error } = await supabase.from('demos').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['demos'] }),
  });
};

/* ═══ Provisionamento no sistema lojista ══════════════════════ */

interface ProvisionInput {
  company_name: string;
  company_slug: string;
  admin_email: string;
  admin_password: string;
  admin_full_name?: string;
  domains?: string[];
  logo_url?: string;
  site_logo_url?: string;
  brand_icon_url?: string;
  banner_url?: string;
  favicon_url?: string;
  hero_subtitle?: string;
  hero_title?: string;
  hero_description?: string;
  /** Nome de quem recebe — a amostra abre com "Bem-vindo, <nome>". */
  contact_name?: string;
}

export const provisionCompany = async (
  input: ProvisionInput,
): Promise<{ company_id: string; company_slug: string; admin_email: string }> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sessão expirada');
  const res = await fetch(`${LOJISTA_FUNCTIONS_URL}/admin-provision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action: 'create_company', ...input }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'Erro ao provisionar sistema');
  return data;
};

export const updateCompanyBranding = async (input: {
  company_id: string;
  company_name?: string;
  logo_url?: string;
  site_logo_url?: string;
  brand_icon_url?: string;
  banner_url?: string;
  favicon_url?: string;
  contact_name?: string;
  hero_subtitle?: string;
  hero_title?: string;
  hero_description?: string;
  primary_color?: string;
  domains?: string[];
}): Promise<void> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sessão expirada');
  const res = await fetch(`${LOJISTA_FUNCTIONS_URL}/admin-provision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action: 'update_branding', ...input }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'Erro ao atualizar identidade');
};

/** Tira do ar a empresa provisionada — a amostra descartada para de abrir. */
export const deactivateCompany = async (company_id: string): Promise<void> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sessão expirada');
  const res = await fetch(`${LOJISTA_FUNCTIONS_URL}/admin-provision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action: 'deactivate_company', company_id }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'Erro ao desativar empresa');
};

/* ═══ Clientes ════════════════════════════════════════════════ */

export const useClients = () =>
  useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Client[];
    },
  });

export const useClient = (id: string | undefined) =>
  useQuery({
    queryKey: ['clients', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').eq('id', id!).single();
      if (error) throw error;
      return data as Client;
    },
    enabled: !!id,
  });

export const useCreateClient = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Client>) => {
      const { data, error } = await supabase.from('clients').insert(input).select().single();
      if (error) throw error;
      return data as Client;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
};

export const useUpdateClient = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Client> & { id: string }) => {
      const { error } = await supabase.from('clients').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['clients', id] });
    },
  });
};

/* ═══ Onboarding ══════════════════════════════════════════════ */

export const useOnboardingTasks = (clientId: string | undefined) =>
  useQuery({
    queryKey: ['onboarding', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboarding_tasks')
        .select('*')
        .eq('client_id', clientId!)
        .order('sort');
      if (error) throw error;
      return data as OnboardingTask[];
    },
    enabled: !!clientId,
  });

export const useToggleTask = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done, userId }: { id: string; done: boolean; userId: string }) => {
      const { error } = await supabase
        .from('onboarding_tasks')
        .update({ done, done_at: done ? new Date().toISOString() : null, done_by: done ? userId : null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding'] }),
  });
};

export const useOnboardingProgress = () =>
  useQuery({
    queryKey: ['onboarding-progress'],
    queryFn: async () => {
      const { data, error } = await supabase.from('onboarding_tasks').select('client_id, done');
      if (error) throw error;
      const map: Record<string, { total: number; done: number }> = {};
      (data as { client_id: string; done: boolean }[]).forEach((t) => {
        map[t.client_id] ??= { total: 0, done: 0 };
        map[t.client_id].total += 1;
        if (t.done) map[t.client_id].done += 1;
      });
      return map;
    },
  });

/* ═══ Contratos ═══════════════════════════════════════════════ */

export const useContracts = (clientId?: string) =>
  useQuery({
    queryKey: ['contracts', clientId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('contracts').select('*').order('created_at', { ascending: false });
      if (clientId) q = q.eq('client_id', clientId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Contract[];
    },
  });

export const useCreateContract = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Contract>) => {
      const { error } = await supabase.from('contracts').insert(input);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contracts'] }),
  });
};

export const useUpdateContract = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Contract> & { id: string }) => {
      const { error } = await supabase.from('contracts').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contracts'] }),
  });
};

/* ═══ Pagamentos ══════════════════════════════════════════════ */

export const usePayments = (clientId?: string) =>
  useQuery({
    queryKey: ['payments', clientId ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('payments')
        .select('*, client:clients(id, company_name)')
        .order('due_date', { ascending: false });
      if (clientId) q = q.eq('client_id', clientId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Payment[];
    },
  });

export const useCreatePayment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Payment>) => {
      const { client: _c, ...row } = input as Payment;
      const { error } = await supabase.from('payments').insert(row);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payments'] }),
  });
};

export const useUpdatePayment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Payment> & { id: string }) => {
      const { client: _c, ...row } = patch as Payment;
      const { error } = await supabase.from('payments').update(row).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payments'] }),
  });
};

/* ═══ Tickets ═════════════════════════════════════════════════ */

export const useTickets = () =>
  useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('*, client:clients(id, company_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Ticket[];
    },
  });

export const useCreateTicket = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Ticket>) => {
      const { client: _c, ...row } = input as Ticket;
      const { error } = await supabase.from('tickets').insert(row);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });
};

export const useUpdateTicket = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Ticket> & { id: string }) => {
      const { client: _c, ...row } = patch as Ticket;
      const { error } = await supabase.from('tickets').update(row).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });
};

/* ═══ Equipe ══════════════════════════════════════════════════ */

export const useTeam = () =>
  useQuery({
    queryKey: ['team'],
    queryFn: async () => {
      const { data, error } = await supabase.from('team_members').select('*').order('created_at');
      if (error) throw error;
      return data as TeamMemberRow[];
    },
  });

export const useUpdateTeamMember = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<TeamMemberRow> & { id: string }) => {
      const { error } = await supabase.from('team_members').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }),
  });
};

export const inviteTeamMember = async (input: {
  email: string;
  password: string;
  full_name: string;
  role: string;
}): Promise<void> => {
  const { data, error } = await supabase.functions.invoke('team-invite', { body: input });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
};

/* ═══ Atividades ══════════════════════════════════════════════ */

export const useActivities = (opts: { prospectId?: string; clientId?: string }) =>
  useQuery({
    queryKey: ['activities', opts.prospectId ?? '', opts.clientId ?? ''],
    queryFn: async () => {
      let q = supabase.from('activities').select('*').order('created_at', { ascending: false }).limit(50);
      if (opts.prospectId) q = q.eq('prospect_id', opts.prospectId);
      if (opts.clientId) q = q.eq('client_id', opts.clientId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Activity[];
    },
    enabled: !!(opts.prospectId || opts.clientId),
  });

export const useCreateActivity = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Activity>) => {
      const { error } = await supabase.from('activities').insert(input);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activities'] }),
  });
};

/* ═══ Storage — upload de logo ════════════════════════════════ */

export const uploadLogo = async (file: File, prefix: string): Promise<string> => {
  const ext = file.name.split('.').pop() ?? 'png';
  const path = `${prefix}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from('logos').getPublicUrl(path);
  return data.publicUrl;
};

/* ═══ Contadores da esteira ═══════════════════════════════════ */

/**
 * O que está esperando ação em cada etapa do CRM.
 * Home e CRM leem daqui para nunca mostrarem números diferentes.
 */
export const useCrmCounts = () => {
  const { data: prospects = [] } = useProspects();
  const { data: meetings = [] } = useMeetings();
  const { data: demos = [] } = useDemos();
  const { data: clients = [] } = useClients();

  return useMemo(() => {
    const activeStages = new Set<ProspectStage>(['novo', 'contato', 'reuniao', 'amostra', 'proposta', 'fechamento']);
    const active = prospects.filter((p) => activeStages.has(p.stage));

    const scheduled = new Set(
      meetings.filter((m) => m.status === 'agendada' || m.status === 'realizada')
        .map((m) => m.prospect_id).filter(Boolean) as string[],
    );
    const withDemo = new Set(demos.map((d) => d.prospect_id).filter(Boolean) as string[]);
    const converted = new Set(clients.map((c) => c.prospect_id).filter(Boolean) as string[]);

    const today = new Date();
    const sameDay = (iso: string) => {
      const d = new Date(iso);
      return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    };

    return {
      funil: active.length,
      reunioes:
        prospects.filter((p) => p.stage === 'reuniao' && !scheduled.has(p.id)).length +
        meetings.filter((m) => m.status === 'agendada' && sameDay(m.scheduled_at)).length,
      amostras: prospects.filter((p) => p.stage === 'amostra' && !withDemo.has(p.id)).length,
      conexao:
        prospects.filter((p) => p.stage === 'fechamento' && !converted.has(p.id)).length +
        clients.filter((c) => c.status === 'onboarding').length,
      pipeline: active.reduce((s, p) => s + (p.proposal_value ?? 0), 0),
      mrr: clients.filter((c) => c.status === 'ativo' || c.status === 'onboarding')
        .reduce((s, c) => s + (c.mrr ?? 0), 0),
    };
  }, [prospects, meetings, demos, clients]);
};

/* ═══ Utilidades ══════════════════════════════════════════════ */

export const brl = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });

export const brlFull = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export const genPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};
