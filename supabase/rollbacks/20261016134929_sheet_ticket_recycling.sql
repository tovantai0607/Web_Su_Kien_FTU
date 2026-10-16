begin;
-- A rollback must never resurrect a previous owner or erase a reused-code generation.
do $$begin
  if exists(select 1 from ftu_sales_private.ticket_code_history where released_at is not null)
    or exists(select 1 from public.purchase_requests where status='CLEARED'
      or (status='COMPLETED' and (evidence_id is null or exists(
        select 1 from jsonb_each_text(buyer) where length(trim(value))=0)))) then
    raise exception 'ROLLBACK_BLOCKED_RETAIN_RECYCLED_TICKETS';
  end if;
end $$;
drop trigger track_ticket_assignment on ftu_sales_private.ticket_code_slots;
drop function public.edit_sheet_purchase(uuid,text,uuid,jsonb),public.edit_sheet_purchase_before_recycling(uuid,text,uuid,jsonb),
  public.edit_ticket_code_row(uuid,text,uuid,jsonb),public.read_purchase_ticket_codes(uuid,text,uuid);
drop function ftu_sales_private.clear_sheet_purchase(uuid,text,uuid,jsonb),ftu_sales_private.free_retired_ticket_codes(uuid),
  ftu_sales_private.track_ticket_assignment();
do $$declare r record;begin
  for r in select definition from ftu_sales_private.recycling_original_functions loop execute r.definition;end loop;
end $$;
revoke all on function public.edit_sheet_purchase(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.edit_sheet_purchase(uuid,text,uuid,jsonb) to service_role;
alter table public.purchase_requests drop constraint purchase_lifecycle_state,
  drop constraint purchase_lifecycle_payload,drop constraint purchase_lifecycle_completion;
do $$declare r record;begin
  for r in select name,definition from ftu_sales_private.recycling_original_constraints loop
    execute format('alter table public.purchase_requests add constraint %I %s',r.name,r.definition);
  end loop;
end $$;
drop table ftu_sales_private.ticket_code_history,ftu_sales_private.ticket_line_history,
  ftu_sales_private.ticket_release_context,ftu_sales_private.recycling_original_constraints,
  ftu_sales_private.recycling_original_functions;
commit;
