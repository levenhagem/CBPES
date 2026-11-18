-- CBPES V15 — Fases configuráveis para competições oficiais e semanais
-- Execute integralmente no Supabase SQL Editor antes de publicar os arquivos.
begin;

create table if not exists public.competition_phases (
  id uuid primary key default gen_random_uuid(),
  competition_type text not null check (competition_type in ('official','weekly')),
  weekly_id uuid null references public.weekly_editions(id) on delete cascade,
  name text not null,
  phase_type text not null default 'groups' check (phase_type in ('groups','knockout','final','third_place','other')),
  sort_order integer not null default 1 check (sort_order > 0),
  counts_in_standings boolean not null default false,
  created_at timestamptz not null default now(),
  constraint competition_phases_scope_check check (
    (competition_type='official' and weekly_id is null) or
    (competition_type='weekly' and weekly_id is not null)
  )
);
create unique index if not exists competition_phases_official_order_uq
  on public.competition_phases(sort_order) where competition_type='official';
create unique index if not exists competition_phases_weekly_order_uq
  on public.competition_phases(weekly_id, sort_order) where competition_type='weekly';

alter table public.rounds add column if not exists phase_id uuid;
alter table public.weekly_rounds add column if not exists phase_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='rounds_phase_id_fkey' and conrelid='public.rounds'::regclass) then
    alter table public.rounds add constraint rounds_phase_id_fkey foreign key (phase_id) references public.competition_phases(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='weekly_rounds_phase_id_fkey' and conrelid='public.weekly_rounds'::regclass) then
    alter table public.weekly_rounds add constraint weekly_rounds_phase_id_fkey foreign key (phase_id) references public.competition_phases(id) on delete set null;
  end if;
end $$;

-- Fase oficial padrão. Rodadas antigas são preservadas e classificadas conforme o estágio já registrado.
insert into public.competition_phases(competition_type,weekly_id,name,phase_type,sort_order,counts_in_standings)
select 'official',null,'Fase de grupos','groups',1,true
where not exists(select 1 from public.competition_phases where competition_type='official');
insert into public.competition_phases(competition_type,weekly_id,name,phase_type,sort_order,counts_in_standings)
select 'official',null,'Mata-mata','knockout',2,false
where not exists(select 1 from public.competition_phases where competition_type='official' and phase_type='knockout');
update public.rounds r set phase_id=p.id
from public.competition_phases p
where r.phase_id is null and p.competition_type='official'
  and ((r.stage in ('grupos','liga') and p.phase_type='groups') or (r.stage='mata' and p.phase_type='knockout'));

-- Cada edição semanal recebe sua própria fase de grupos; rodadas existentes permanecem nela.
insert into public.competition_phases(competition_type,weekly_id,name,phase_type,sort_order,counts_in_standings)
select 'weekly',w.id,'Fase de grupos','groups',1,true
from public.weekly_editions w
where not exists(select 1 from public.competition_phases p where p.competition_type='weekly' and p.weekly_id=w.id);
update public.weekly_rounds r set phase_id=p.id
from public.competition_phases p
where r.phase_id is null and p.competition_type='weekly' and p.weekly_id=r.weekly_id and p.phase_type='groups';

create index if not exists rounds_phase_id_idx on public.rounds(phase_id);
create index if not exists weekly_rounds_phase_id_idx on public.weekly_rounds(phase_id);

alter table public.competition_phases enable row level security;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='competition_phases' and policyname='leitura publica') then
    create policy "leitura publica" on public.competition_phases for select using(true);
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='competition_phases' and policyname='admin escreve') then
    create policy "admin escreve" on public.competition_phases for all using(public.is_admin()) with check(public.is_admin());
  end if;
end $$;
grant select on public.competition_phases to anon, authenticated;
grant insert,update,delete on public.competition_phases to authenticated;
commit;
