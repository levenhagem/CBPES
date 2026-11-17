-- CBPES: cole este arquivo inteiro no Supabase > SQL Editor > Run.
create extension if not exists pgcrypto;

create table participants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz default now()
);
create unique index participants_name_uq on participants (lower(name));

create table rounds (
  id uuid primary key default gen_random_uuid(),
  number int not null unique check (number > 0),
  date date,
  created_at timestamptz default now()
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  home_id uuid not null references participants(id) on delete restrict,
  away_id uuid not null references participants(id) on delete restrict,
  home_score int check (home_score between 0 and 99),
  away_score int check (away_score between 0 and 99),
  played_on date,
  created_at timestamptz default now(),
  check (home_id <> away_id),
  check ((home_score is null) = (away_score is null)),
  unique (round_id, home_id, away_id)
);

create table admins (user_id uuid primary key references auth.users(id) on delete cascade);

create table history (
  id bigint generated always as identity primary key,
  at timestamptz default now(),
  user_email text,
  action text,
  table_name text,
  detail jsonb
);

create function is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from admins where user_id = auth.uid()) $$;

create function log_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into history (user_email, action, table_name, detail)
  values (auth.jwt() ->> 'email', TG_OP, TG_TABLE_NAME, to_jsonb(coalesce(new, old)));
  return coalesce(new, old);
end $$;
create trigger t_log_p after insert or update or delete on participants for each row execute function log_change();
create trigger t_log_r after insert or update or delete on rounds for each row execute function log_change();
create trigger t_log_m after insert or update or delete on matches for each row execute function log_change();

-- Segurança: visitantes só leem; só administradores escrevem.
alter table participants enable row level security;
alter table rounds enable row level security;
alter table matches enable row level security;
alter table admins enable row level security;
alter table history enable row level security;

create policy "leitura publica" on participants for select using (true);
create policy "leitura publica" on rounds for select using (true);
create policy "leitura publica" on matches for select using (true);
create policy "admin escreve" on participants for all using (is_admin()) with check (is_admin());
create policy "admin escreve" on rounds for all using (is_admin()) with check (is_admin());
create policy "admin escreve" on matches for all using (is_admin()) with check (is_admin());
create policy "ve a propria linha" on admins for select using (user_id = auth.uid());
create policy "admin le historico" on history for select using (is_admin());

-- CBPES v2: formatos de campeonato + jogadores, gols e assistências.
-- (Quem já rodou o schema.sql antigo executa SÓ este arquivo. Instalação nova: use schema.sql, que já inclui tudo.)
create table settings (
  id int primary key default 1 check (id = 1),
  name text not null default 'CBPES',
  season text not null default '2026',
  format text not null default 'liga1',
  config jsonb not null default '{}'::jsonb
);
insert into settings (id) values (1);

alter table rounds add column stage text not null default 'liga' check (stage in ('liga','grupos','mata'));
alter table rounds add column name text;
alter table matches add column group_name text;
alter table matches add column leg int not null default 1 check (leg in (1,2));
alter table matches add column home_pen int check (home_pen between 0 and 99);
alter table matches add column away_pen int check (away_pen between 0 and 99);
alter table matches add column seq bigint generated always as identity;
alter table matches add constraint pen_pair check ((home_pen is null) = (away_pen is null));

create table players (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  participant_id uuid not null references participants(id) on delete restrict,
  created_at timestamptz default now()
);
create unique index players_uq on players (participant_id, lower(name));

create table match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  scorer_id uuid not null references players(id) on delete restrict,
  assist_id uuid references players(id) on delete restrict,
  created_at timestamptz default now()
);

create function check_event() returns trigger language plpgsql as $$
declare hid uuid; aid uuid; sp uuid; ap uuid;
begin
  select home_id, away_id into hid, aid from matches where id = new.match_id;
  select participant_id into sp from players where id = new.scorer_id;
  if sp not in (hid, aid) then raise exception 'O autor do gol não pertence a nenhum dos times da partida.'; end if;
  if new.assist_id is not null then
    if new.assist_id = new.scorer_id then raise exception 'Autor do gol e assistente devem ser jogadores diferentes.'; end if;
    select participant_id into ap from players where id = new.assist_id;
    if ap <> sp then raise exception 'O assistente deve ser do mesmo time do autor do gol.'; end if;
  end if;
  return new;
end $$;
create trigger t_event_chk before insert or update on match_events for each row execute function check_event();

create trigger t_log_pl after insert or update or delete on players for each row execute function log_change();
create trigger t_log_ev after insert or update or delete on match_events for each row execute function log_change();
create trigger t_log_set after update on settings for each row execute function log_change();

alter table settings enable row level security;
alter table players enable row level security;
alter table match_events enable row level security;
create policy "leitura publica" on settings for select using (true);
create policy "admin altera" on settings for update using (is_admin()) with check (is_admin());
create policy "leitura publica" on players for select using (true);
create policy "leitura publica" on match_events for select using (true);
create policy "admin escreve" on players for all using (is_admin()) with check (is_admin());
create policy "admin escreve" on match_events for all using (is_admin()) with check (is_admin());
