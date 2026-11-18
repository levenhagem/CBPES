-- CBPES v5 — perfis de times e técnicos, histórico de vínculos e técnico por partida.
-- Compatível com instalações que já executaram as atualizações v2/v3/v4.
-- Pode ser executado novamente sem duplicar os registros estruturais.

-- Garante os campos introduzidos nas versões anteriores.
alter table public.participants add column if not exists coach_name text;
alter table public.matches add column if not exists category text not null default 'official';
update public.matches set category = 'official' where category is null;
alter table public.matches alter column category set default 'official';
alter table public.matches alter column category set not null;
alter table public.matches alter column round_id drop not null;
alter table public.matches drop constraint if exists matches_category_check;
alter table public.matches add constraint matches_category_check check (category in ('official','friendly'));
update public.matches set round_id = null where category = 'friendly';

-- Histórico dos técnicos que passaram por cada time.
create table if not exists public.team_coach_history (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete restrict,
  coach_name text not null check (length(trim(coach_name)) > 0),
  started_on date not null default current_date,
  ended_on date,
  created_at timestamptz not null default now(),
  constraint team_coach_history_dates check (ended_on is null or ended_on >= started_on)
);

create index if not exists team_coach_history_team_idx
  on public.team_coach_history (participant_id, started_on desc);
create index if not exists team_coach_history_coach_idx
  on public.team_coach_history (lower(coach_name));
create unique index if not exists team_coach_one_current_idx
  on public.team_coach_history (participant_id) where ended_on is null;
create unique index if not exists coach_one_current_team_idx
  on public.team_coach_history (lower(coach_name)) where ended_on is null;

-- Impede períodos simultâneos do mesmo técnico em times diferentes.
create or replace function public.check_coach_assignment_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from public.team_coach_history h
    where h.id is distinct from new.id
      and lower(h.coach_name) = lower(new.coach_name)
      and new.started_on < coalesce(h.ended_on, 'infinity'::date)
      and h.started_on < coalesce(new.ended_on, 'infinity'::date)
  ) then
    raise exception 'Este técnico já possui vínculo com outro time nesse período.';
  end if;
  return new;
end;
$$;
drop trigger if exists t_check_coach_assignment_overlap on public.team_coach_history;
create trigger t_check_coach_assignment_overlap
before insert or update on public.team_coach_history
for each row execute function public.check_coach_assignment_overlap();

-- Registra os técnicos atuais a partir da data de implantação do histórico.
-- Passagens anteriores devem ser cadastradas manualmente no painel Times.
insert into public.team_coach_history (participant_id, coach_name, started_on)
select distinct on (lower(trim(p.coach_name))) p.id, trim(p.coach_name), current_date
from public.participants p
where nullif(trim(p.coach_name), '') is not null
  and not exists (
    select 1 from public.team_coach_history h
    where h.participant_id = p.id and h.ended_on is null
  )
  and not exists (
    select 1 from public.team_coach_history h
    where lower(h.coach_name) = lower(trim(p.coach_name)) and h.ended_on is null
  )
order by lower(trim(p.coach_name)), p.created_at desc nulls last, p.id;

-- Snapshot do técnico no momento em que o resultado da partida é registrado.
alter table public.matches add column if not exists home_coach_name text;
alter table public.matches add column if not exists away_coach_name text;

-- Para partidas já existentes, o técnico atual é a melhor informação disponível.
-- Alterações futuras de técnico não sobrescreverão estes snapshots.
update public.matches m
set home_coach_name = coalesce(m.home_coach_name, nullif(trim(h.coach_name), '')),
    away_coach_name = coalesce(m.away_coach_name, nullif(trim(a.coach_name), ''))
from public.participants h, public.participants a
where h.id = m.home_id and a.id = m.away_id
  and m.home_score is not null and m.away_score is not null
  and (m.home_coach_name is null or m.away_coach_name is null);

create or replace function public.snapshot_match_coaches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.home_score is not null and new.away_score is not null then
    if tg_op = 'INSERT' then
      select nullif(trim(coach_name), '') into new.home_coach_name from public.participants where id = new.home_id;
      select nullif(trim(coach_name), '') into new.away_coach_name from public.participants where id = new.away_id;
    else
      if new.home_id is distinct from old.home_id or new.home_coach_name is null then
        select nullif(trim(coach_name), '') into new.home_coach_name from public.participants where id = new.home_id;
      end if;
      if new.away_id is distinct from old.away_id or new.away_coach_name is null then
        select nullif(trim(coach_name), '') into new.away_coach_name from public.participants where id = new.away_id;
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists t_snapshot_match_coaches on public.matches;
create trigger t_snapshot_match_coaches
before insert or update on public.matches
for each row execute function public.snapshot_match_coaches();

-- Atualiza o técnico atual e mantém o histórico. Um técnico só pode estar em um time atual.
create or replace function public.assign_team_coach(
  p_participant_id uuid,
  p_coach_name text,
  p_start_date date default current_date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(trim(p_coach_name), '');
  v_old text;
  v_start date := coalesce(p_start_date, current_date);
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem alterar técnicos.';
  end if;

  select coach_name into v_old
  from public.participants
  where id = p_participant_id
  for update;
  if not found then raise exception 'Time não encontrado.'; end if;

  -- Fecha o vínculo atual deste time.
  update public.team_coach_history
  set ended_on = greatest(v_start, started_on)
  where participant_id = p_participant_id and ended_on is null
    and (v_name is null or lower(coach_name) <> lower(v_name));

  -- Se o técnico já estiver em outro time, encerra a passagem anterior.
  if v_name is not null then
    -- Limpa qualquer registro atual duplicado, inclusive legado sem linha de histórico.
    update public.participants
    set coach_name = null
    where id <> p_participant_id and lower(coalesce(coach_name, '')) = lower(v_name);

    update public.team_coach_history
    set ended_on = greatest(v_start, started_on)
    where lower(coach_name) = lower(v_name)
      and participant_id <> p_participant_id
      and ended_on is null;
  end if;

  update public.participants set coach_name = v_name where id = p_participant_id;

  if v_name is not null and not exists (
    select 1 from public.team_coach_history
    where participant_id = p_participant_id and ended_on is null
      and lower(coach_name) = lower(v_name)
  ) then
    insert into public.team_coach_history (participant_id, coach_name, started_on)
    values (p_participant_id, v_name, v_start);
  end if;
end;
$$;

-- Acesso público somente para leitura do histórico; alterações via painel/RPC de administrador.
alter table public.team_coach_history enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='team_coach_history' and policyname='leitura publica') then
    create policy "leitura publica" on public.team_coach_history for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='team_coach_history' and policyname='admin escreve') then
    create policy "admin escreve" on public.team_coach_history for all using (public.is_admin()) with check (public.is_admin());
  end if;
end;
$$;
grant select on public.team_coach_history to anon, authenticated;
grant insert, update, delete on public.team_coach_history to authenticated;
revoke all on function public.assign_team_coach(uuid, text, date) from public;
grant execute on function public.assign_team_coach(uuid, text, date) to authenticated;

-- Registra uma passagem anterior e corrige os snapshots das partidas desse período.
-- p_end_date é exclusivo: representa o dia em que o próximo vínculo começou.
create or replace function public.register_past_team_coach(
  p_participant_id uuid,
  p_coach_name text,
  p_start_date date,
  p_end_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(trim(p_coach_name), '');
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem alterar o histórico de técnicos.';
  end if;
  if v_name is null or p_start_date is null or p_end_date is null or p_end_date <= p_start_date then
    raise exception 'Informe técnico e período válido. A data final deve ser posterior à inicial.';
  end if;
  if not exists (select 1 from public.participants where id = p_participant_id) then
    raise exception 'Time não encontrado.';
  end if;

  insert into public.team_coach_history (participant_id, coach_name, started_on, ended_on)
  values (p_participant_id, v_name, p_start_date, p_end_date);

  -- O fim do vínculo é exclusivo. Partidas sem data não podem ser atribuídas automaticamente.
  update public.matches m
  set home_coach_name = case when m.home_id = p_participant_id then v_name else m.home_coach_name end,
      away_coach_name = case when m.away_id = p_participant_id then v_name else m.away_coach_name end
  where (m.home_id = p_participant_id or m.away_id = p_participant_id)
    and m.home_score is not null and m.away_score is not null
    and coalesce(m.played_on, (select r.date from public.rounds r where r.id = m.round_id)) >= p_start_date
    and coalesce(m.played_on, (select r.date from public.rounds r where r.id = m.round_id)) < p_end_date;
end;
$$;
revoke all on function public.register_past_team_coach(uuid, text, date, date) from public;
grant execute on function public.register_past_team_coach(uuid, text, date, date) to authenticated;

-- Registra mudanças no histórico administrativo, se a função já estiver instalada.
do $$
begin
  if to_regprocedure('public.log_change()') is not null
     and not exists (select 1 from pg_trigger where tgname='t_log_team_coach_history') then
    create trigger t_log_team_coach_history
    after insert or update or delete on public.team_coach_history
    for each row execute function public.log_change();
  end if;
end;
$$;
