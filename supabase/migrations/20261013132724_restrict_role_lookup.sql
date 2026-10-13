begin;
-- Supabase default privileges can grant EXECUTE directly to client roles.
revoke all on function public.has_role(uuid,text[]) from public,anon,authenticated;
grant execute on function public.has_role(uuid,text[]) to service_role;
commit;
