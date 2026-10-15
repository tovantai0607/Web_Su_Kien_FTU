-- Local/test rollback only. Do not discard a history of edits or proof versions.
begin;
do $$
begin
  if exists(select 1 from ftu_sales_private.sheet_edit_operations)
    or exists(select 1 from public.purchase_evidence where not current_version) then
    raise exception 'SHEET_HISTORY_PREVENTS_ROLLBACK'; end if;
end $$;
do $$ declare r record;
begin
  for r in select definition from ftu_sales_private.sheet_original_functions loop execute r.definition; end loop;
end $$;
drop function public.edit_sheet_purchase(uuid,text,uuid,jsonb);
drop function public.read_vote_participation(uuid);
drop function public.close_due_vote_sessions(integer);
drop function public.register_sheet_purchase_evidence(uuid,text,uuid,uuid,text,integer,text);
drop trigger immutable_purchase_allocations on public.purchase_allocations;
create trigger immutable_purchase_allocations before update or delete on public.purchase_allocations
  for each row execute function ftu_sales_private.immutable_record();
drop trigger immutable_purchase_evidence on public.purchase_evidence;
create trigger immutable_purchase_evidence before update or delete on public.purchase_evidence
  for each row execute function ftu_sales_private.immutable_record();
drop function ftu_sales_private.guard_sheet_allocation();
drop function ftu_sales_private.guard_sheet_evidence();
drop function ftu_sales_private.sheet_edit_allowed(uuid);
drop table ftu_sales_private.sheet_edit_context,ftu_sales_private.sheet_edit_operations,ftu_sales_private.sheet_original_functions;
drop index public.purchase_evidence_current;
alter table public.purchase_evidence drop column current_version;
alter table public.purchase_evidence drop column content_sha256;
alter table public.purchase_evidence add unique(request_id);
drop index public.supplement_ticket_ordinal;
create unique index supplement_ticket_ordinal on public.tickets(purchase_id,purchase_ordinal) where purchase_id is not null;
alter table public.purchase_requests drop column revision;
commit;
