-- CBPES V10 — gestão de técnicos, perfis e sala de troféus
-- Execute uma única vez no Supabase > SQL Editor, antes de publicar os arquivos V10.
-- Inclui também a função de exclusão de participantes de teste da V9, caso ela ainda não tenha sido instalada.

-- V9: exclusão definitiva e controlada de participante de teste e dados dependentes.
create or replace function public.purge_test_participant(p_participant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem excluir participantes.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.participants where id = p_participant_id) then
    raise exception 'Participante não encontrado.' using errcode = 'P0002';
  end if;

  delete from public.match_events e
  where e.match_id in (
    select m.id from public.matches m
    where m.home_id = p_participant_id or m.away_id = p_participant_id
  )
  or e.scorer_id in (select p.id from public.players p where p.participant_id = p_participant_id)
  or e.assist_id in (select p.id from public.players p where p.participant_id = p_participant_id);

  delete from public.matches where home_id = p_participant_id or away_id = p_participant_id;
  delete from public.weekly_participants where participant_id = p_participant_id;
  delete from public.team_coach_history where participant_id = p_participant_id;
  delete from public.players where participant_id = p_participant_id;
  -- Se as tabelas da V10 já existirem, remove títulos automáticos vinculados ao time de teste.
  if to_regclass('public.coach_trophies') is not null then
    delete from public.coach_trophies
    where team_name = (select name from public.participants where id = p_participant_id)
      and source_type in ('official', 'weekly');
  end if;
  delete from public.participants where id = p_participant_id;
end;
$$;
revoke all on function public.purge_test_participant(uuid) from public;
grant execute on function public.purge_test_participant(uuid) to authenticated;

-- Cadastro editorial do técnico (nome e apresentação pública).
create table if not exists public.coach_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  bio text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sala de troféus: títulos automáticos e conquistas cadastradas manualmente.
create table if not exists public.coach_trophies (
  id uuid primary key default gen_random_uuid(),
  coach_name text not null check (length(trim(coach_name)) > 0),
  title text not null check (length(trim(title)) > 0),
  competition_name text not null default '',
  source_type text not null check (source_type in ('official', 'weekly', 'manual')),
  source_key text unique,
  team_name text not null default '',
  awarded_on date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint coach_trophies_source_key_check check (
    (source_type = 'manual' and source_key is null)
    or (source_type in ('official', 'weekly') and source_key is not null)
  )
);

create index if not exists coach_trophies_coach_name_idx
  on public.coach_trophies (lower(coach_name));
create index if not exists coach_trophies_awarded_on_idx
  on public.coach_trophies (awarded_on desc);

alter table public.coach_profiles enable row level security;
alter table public.coach_trophies enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='coach_profiles' and policyname='leitura publica') then
    create policy "leitura publica" on public.coach_profiles for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='coach_profiles' and policyname='admin escreve') then
    create policy "admin escreve" on public.coach_profiles for all using (public.is_admin()) with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='coach_trophies' and policyname='leitura publica') then
    create policy "leitura publica" on public.coach_trophies for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='coach_trophies' and policyname='admin escreve') then
    create policy "admin escreve" on public.coach_trophies for all using (public.is_admin()) with check (public.is_admin());
  end if;
end;
$$;

grant select on public.coach_profiles, public.coach_trophies to anon, authenticated;
grant insert, update, delete on public.coach_profiles, public.coach_trophies to authenticated;

-- Inclui as novas tabelas no histórico administrativo quando a auditoria já está instalada.
do $$
begin
  if to_regprocedure('public.log_change()') is not null then
    if not exists (select 1 from pg_trigger where tgname='t_log_coach_profiles') then
      create trigger t_log_coach_profiles after insert or update or delete on public.coach_profiles
      for each row execute function public.log_change();
    end if;
    if not exists (select 1 from pg_trigger where tgname='t_log_coach_trophies') then
      create trigger t_log_coach_trophies after insert or update or delete on public.coach_trophies
      for each row execute function public.log_change();
    end if;
  end if;
end;
$$;
