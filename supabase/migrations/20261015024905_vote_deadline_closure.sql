begin;
-- Scheduled sessions are accepted by cast_category_vote directly when their
-- server window starts. They can remain SCHEDULED until the deadline, so close
-- both states without finalizing, publishing or granting new votes.
create or replace function public.close_due_vote_sessions(p_limit integer default 100) returns integer
language plpgsql security definer set search_path='' as $$
declare session public.vote_sessions; affected integer=0;
begin
  if p_limit is null or p_limit not between 1 and 1000 then raise exception 'INVALID_LIMIT'; end if;
  for session in select * from public.vote_sessions
    where state in ('OPEN','SCHEDULED') and close_at<=clock_timestamp()
    order by close_at,id limit p_limit for update skip locked loop
    update public.vote_sessions set state='CLOSED' where id=session.id;
    if session.updated_by is not null then
      insert into public.audit_logs(edition_id,actor_id,action,target_id,detail)
        values(session.edition_id,session.updated_by,'vote_auto_closed',session.id,
          jsonb_build_object('source','server_deadline','close_at',session.close_at));
    end if;
    affected=affected+1;
  end loop;
  return affected;
end $$;
revoke all on function public.close_due_vote_sessions(integer) from public,anon,authenticated;
grant execute on function public.close_due_vote_sessions(integer) to service_role;
commit;
