-- CBPES V12 — participação dos times + rodadas próprias para os semanais
-- Consolida o SQL anterior da V11 com a nova estrutura de rodadas semanais.
-- Execute uma única vez no Supabase > SQL Editor, antes de publicar os arquivos V12.
-- Não apaga partidas, resultados, gols, participantes ou históricos.

begin;

-- 0) Base de técnicos e sala de troféus (V10), incluída para tornar a atualização consolidada.
-- A função purge_test_participant é apenas criada/atualizada aqui; ela NÃO é executada.
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

-- 1) Participação atual em competições oficiais.
-- Times já existentes recebem TRUE automaticamente.
alter table public.participants
  add column if not exists participates_in_competition boolean not null default true;

comment on column public.participants.participates_in_competition is
  'Indica se o time participa atualmente da competição oficial ativa do CBPES.';

-- 2) Rodadas independentes para cada edição semanal.
create table if not exists public.weekly_rounds (
  id uuid primary key default gen_random_uuid(),
  weekly_id uuid not null references public.weekly_editions(id) on delete cascade,
  number integer not null check (number > 0),
  name text,
  date date,
  created_at timestamptz not null default now(),
  constraint weekly_rounds_edition_number_unique unique (weekly_id, number)
);

create index if not exists weekly_rounds_weekly_id_number_idx
  on public.weekly_rounds (weekly_id, number);

-- Cada partida semanal pode apontar para uma rodada da sua própria edição.
-- A coluna round_id existente continua reservada aos jogos oficiais.
alter table public.matches
  add column if not exists weekly_round_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'matches_weekly_round_id_fkey'
      and conrelid = 'public.matches'::regclass
  ) then
    alter table public.matches
      add constraint matches_weekly_round_id_fkey
      foreign key (weekly_round_id)
      references public.weekly_rounds(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists matches_weekly_round_id_idx
  on public.matches (weekly_round_id);

-- 3) Migração de segurança para partidas semanais antigas sem rodada.
-- Cria Rodada 1 em cada edição que já tenha partidas sem vínculo e as associa.
do $$
declare
  edition record;
  target_round uuid;
begin
  for edition in
    select distinct weekly_id
    from public.matches
    where category = 'weekly'
      and weekly_id is not null
      and weekly_round_id is null
  loop
    select id into target_round
    from public.weekly_rounds
    where weekly_id = edition.weekly_id
    order by number, created_at
    limit 1;

    if target_round is null then
      insert into public.weekly_rounds (weekly_id, number, name, date)
      select edition.weekly_id, 1, 'Rodada 1', event_date
      from public.weekly_editions
      where id = edition.weekly_id
      returning id into target_round;
    end if;

    update public.matches
    set weekly_round_id = target_round
    where category = 'weekly'
      and weekly_id = edition.weekly_id
      and weekly_round_id is null;
  end loop;
end;
$$;

-- 4) Segurança: leitura pública e escrita somente por administradores.
alter table public.weekly_rounds enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'weekly_rounds'
      and policyname = 'leitura publica'
  ) then
    create policy "leitura publica"
      on public.weekly_rounds for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'weekly_rounds'
      and policyname = 'admin escreve'
  ) then
    create policy "admin escreve"
      on public.weekly_rounds for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end;
$$;

grant select on public.weekly_rounds to anon, authenticated;
grant insert, update, delete on public.weekly_rounds to authenticated;

-- Registra alterações de rodadas semanais no histórico, se a auditoria existir.
do $$
begin
  if to_regprocedure('public.log_change()') is not null
     and not exists (
       select 1 from pg_trigger
       where tgname = 't_log_weekly_rounds'
         and tgrelid = 'public.weekly_rounds'::regclass
     ) then
    create trigger t_log_weekly_rounds
      after insert or update or delete on public.weekly_rounds
      for each row execute function public.log_change();
  end if;
end;
$$;

commit;
