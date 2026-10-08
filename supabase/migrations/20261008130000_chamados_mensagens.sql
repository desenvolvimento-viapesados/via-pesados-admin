/* Chamados com conversa: cada chamado guarda o histórico do atendimento —
   o que a equipe respondeu, combinou ou anotou. Antes o chamado só tinha
   assunto e descrição, e o status avançava num ciclo, sem registro. */

create table if not exists public.ticket_mensagens (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  author_id uuid references public.team_members(id) on delete set null,
  content text not null check (length(trim(content)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists ticket_mensagens_ticket_idx on public.ticket_mensagens (ticket_id, created_at);

alter table public.ticket_mensagens enable row level security;
drop policy if exists ticket_mensagens_equipe on public.ticket_mensagens;
create policy ticket_mensagens_equipe on public.ticket_mensagens
  for all to authenticated
  using (is_team_member()) with check (is_team_member());
