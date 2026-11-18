-- CBPES V9 — exclusão definitiva de participantes de teste e seus dados dependentes
-- Execute uma única vez no Supabase > SQL Editor.
-- A função só pode ser executada por administrador.

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

  -- Apaga eventos de partidas do participante e eventos feitos por seus jogadores.
  delete from public.match_events e
  where e.match_id in (
    select m.id from public.matches m
    where m.home_id = p_participant_id or m.away_id = p_participant_id
  )
  or e.scorer_id in (
    select p.id from public.players p where p.participant_id = p_participant_id
  )
  or e.assist_id in (
    select p.id from public.players p where p.participant_id = p_participant_id
  );

  -- Remove partidas de teste em que o participante aparece.
  delete from public.matches
  where home_id = p_participant_id or away_id = p_participant_id;

  -- Remove vínculos auxiliares antes do participante.
  delete from public.weekly_participants where participant_id = p_participant_id;
  delete from public.team_coach_history where participant_id = p_participant_id;
  delete from public.players where participant_id = p_participant_id;

  -- weekly_editions.champion_id usa ON DELETE SET NULL: o título não fica atribuído
  -- ao participante removido, mas a edição semanal permanece cadastrada.
  delete from public.participants where id = p_participant_id;
end;
$$;

revoke all on function public.purge_test_participant(uuid) from public;
grant execute on function public.purge_test_participant(uuid) to authenticated;
