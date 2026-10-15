begin;
-- Restore the previous filter only. Keep any CLOSED session and its audit trail.
do $$
declare definition text; revised text;
begin
  definition=pg_get_functiondef('public.close_due_vote_sessions(integer)'::regprocedure);
  revised=replace(definition,'state in (''OPEN'',''SCHEDULED'')','state=''OPEN''');
  if revised=definition then raise exception 'EXPECTED_DEADLINE_FUNCTION_NOT_FOUND'; end if;
  execute revised;
end $$;
commit;
