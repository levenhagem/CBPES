-- CBPES V11 — participação atual dos times em competições oficiais
-- Não remove nem altera partidas, históricos, amistosos ou edições semanais.
alter table public.participants
  add column if not exists participates_in_competition boolean not null default true;

comment on column public.participants.participates_in_competition is
  'Indica se o time participa atualmente da competição oficial ativa do CBPES.';
