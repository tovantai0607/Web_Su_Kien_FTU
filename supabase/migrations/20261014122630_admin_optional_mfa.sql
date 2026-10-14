-- SUPER_ADMIN may administer at AAL1. Other staff roles retain their policy.
-- Every affected function keeps its role check and existing execution grants.
do $migration$
declare f record; definition text; revised text;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prokind='f' and p.proargnames @> array['p_aal','p_actor']::text[]
 loop
  definition=pg_get_functiondef(f.oid);
  revised=regexp_replace(definition,
   'p_aal\s*(<>\s*''aal2''|is\s+distinct\s+from\s+''aal2'')',
   '(p_aal is distinct from ''aal2'' and (p_aal is distinct from ''aal1'' or not public.has_role(p_actor,array[''SUPER_ADMIN''])))','gi');
  if revised<>definition then execute revised;end if;
 end loop;
end $migration$;
