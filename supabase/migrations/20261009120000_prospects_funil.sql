/* Três funis no CRM: Prospecção fria, Anúncios e Indicação, cada um com o
   seu quadro, e um "Todos" que junta os três. O funil é escolhido na
   entrada do prospect; o canal de aquisição (mais detalhado) continua.
   Os que já existiam vão para o funil do canal deles. */

alter table public.prospects add column if not exists funil text not null default 'fria';
alter table public.prospects drop constraint if exists prospects_funil_check;
alter table public.prospects add constraint prospects_funil_check
  check (funil = any (array['fria', 'anuncios', 'indicacao']));

update public.prospects p
   set funil = case c.slug
                 when 'indicacao' then 'indicacao'
                 when 'instagram' then 'anuncios'
                 when 'google' then 'anuncios'
                 when 'site' then 'anuncios'
                 else 'fria'
               end
  from public.acquisition_channels c
 where c.id = p.channel_id;
