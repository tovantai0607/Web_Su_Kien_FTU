begin;

-- An empty slot may be sold again; its former ticket identity is never reused.
create table ftu_sales_private.ticket_code_history (
  ticket_id uuid primary key references public.tickets,
  code text not null references ftu_sales_private.ticket_code_slots,
  assigned_at timestamptz not null,
  released_at timestamptz
);
create index ticket_code_history_code on ftu_sales_private.ticket_code_history(code,assigned_at);
create table ftu_sales_private.ticket_line_history (
  ticket_id uuid primary key references public.tickets,
  line jsonb not null check(jsonb_typeof(line)='object')
);
create table ftu_sales_private.ticket_release_context (
  transaction_id bigint not null, ticket_id uuid not null,
  primary key(transaction_id,ticket_id)
);
alter table ftu_sales_private.ticket_code_history enable row level security;
alter table ftu_sales_private.ticket_line_history enable row level security;
alter table ftu_sales_private.ticket_release_context enable row level security;
revoke all on ftu_sales_private.ticket_code_history,ftu_sales_private.ticket_line_history,
  ftu_sales_private.ticket_release_context from public,anon,authenticated,service_role;
insert into ftu_sales_private.ticket_code_history select ticket_id,code,linked_at,null
  from ftu_sales_private.ticket_code_slots where ticket_id is not null;
insert into ftu_sales_private.ticket_line_history
  select t.id,coalesce(ftu_sales_private.ticket_code_line(t.purchase_id,t.purchase_ordinal),s.line_snapshot)
  from public.tickets t left join ftu_sales_private.ticket_code_slots s on s.ticket_id=t.id
  where t.source='SUPPLEMENT' and coalesce(ftu_sales_private.ticket_code_line(t.purchase_id,t.purchase_ordinal),s.line_snapshot) is not null;

create function ftu_sales_private.track_ticket_assignment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.ticket_id is not null and (tg_op='INSERT' or new.ticket_id is distinct from old.ticket_id) then
    insert into ftu_sales_private.ticket_code_history values(new.ticket_id,new.code,new.linked_at,null);
    insert into ftu_sales_private.ticket_line_history values(new.ticket_id,new.line_snapshot)
      on conflict(ticket_id) do update set line=excluded.line;
  end if;
  return new;
end $$;
create trigger track_ticket_assignment after insert or update on ftu_sales_private.ticket_code_slots
  for each row execute function ftu_sales_private.track_ticket_assignment();

create or replace function ftu_sales_private.protect_ticket_code() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'IMMUTABLE_TICKET_CODE';end if;
  if row(new.round_id,new.prefix,new.sequence) is distinct from row(old.round_id,old.prefix,old.sequence)
    then raise exception 'IMMUTABLE_TICKET_CODE';end if;
  if old.ticket_id is not null then
    if new.ticket_id is not null or new.linked_at is not null or new.line_snapshot is not null
      or not exists(select 1 from ftu_sales_private.ticket_release_context c
        join public.tickets t on t.id=c.ticket_id where c.transaction_id=txid_current()
        and c.ticket_id=old.ticket_id and t.status='void') then raise exception 'IMMUTABLE_TICKET_CODE';end if;
  end if;
  return new;
end $$;

-- Preserve the completed timestamp for audit, but distinguish an emptied purchase.
create table ftu_sales_private.recycling_original_constraints(name text primary key,definition text not null);
insert into ftu_sales_private.recycling_original_constraints select conname,pg_get_constraintdef(oid)
  from pg_constraint where conrelid='public.purchase_requests'::regclass and contype='c'
  and pg_get_constraintdef(oid) ~ '\m(status|lines|quantity|total_vnd)\M';
revoke all on ftu_sales_private.recycling_original_constraints from public,anon,authenticated,service_role;
do $$declare c record;begin
  for c in select conname from pg_constraint where conrelid='public.purchase_requests'::regclass
    and contype='c' and pg_get_constraintdef(oid) ~ '\m(status|lines|quantity|total_vnd)\M'
  loop execute format('alter table public.purchase_requests drop constraint %I',c.conname);end loop;
end $$;
alter table public.purchase_requests
  add constraint purchase_lifecycle_state check(status in ('HELD','EXPIRED','COMPLETED','CLEARED')),
  add constraint purchase_lifecycle_payload check(
    jsonb_typeof(lines)='array' and total_vnd<=9007199254740991 and
    ((status='CLEARED' and quantity=0 and total_vnd=0 and lines='[]'::jsonb and evidence_id is null)
     or (status<>'CLEARED' and quantity>0 and total_vnd>0 and jsonb_array_length(lines)>0))),
  add constraint purchase_lifecycle_completion check(
    (status in ('COMPLETED','CLEARED'))=(completed_at is not null)
    and (status in ('COMPLETED','CLEARED') or evidence_id is null));

-- Patch only reviewed definitions, retaining prior Auth, quota, idempotency and audit.
create table ftu_sales_private.recycling_original_functions(name text primary key,definition text not null);
insert into ftu_sales_private.recycling_original_functions
  select p.oid::regprocedure::text,pg_get_functiondef(p.oid) from pg_proc p where p.oid in (
    'ftu_sales_private.guard_purchase()'::regprocedure,'ftu_sales_private.protect_ticket_code()'::regprocedure,
    'public.edit_sheet_purchase(uuid,text,uuid,jsonb)'::regprocedure,
    'public.read_purchase(uuid,uuid)'::regprocedure,'public.read_ticket_code_register(uuid,text,text,integer)'::regprocedure);
revoke all on ftu_sales_private.recycling_original_functions from public,anon,authenticated,service_role;
do $patch$declare s text;begin
  s=pg_get_functiondef('ftu_sales_private.guard_purchase()'::regprocedure);
  if position('old.status<>''COMPLETED'' or new.status<>''COMPLETED''' in s)=0 then raise exception 'EXPECTED_GUARD_NOT_FOUND';end if;
  s=replace(s,'old.status<>''COMPLETED'' or new.status<>''COMPLETED''','old.status<>''COMPLETED'' or new.status not in (''COMPLETED'',''CLEARED'')');
  s=replace(s,'''evidence_id'',''revision''','''evidence_id'',''revision'',''status''');
  execute s;
  s=pg_get_functiondef('public.read_purchase(uuid,uuid)'::regprocedure);
  s=replace(s,'coalesce(r.evidence_id,','case when r.status=''HELD'' then coalesce(r.evidence_id,');
  s=replace(s,'and current_version)),','and current_version)) else r.evidence_id end,');
  execute s;
  s=pg_get_functiondef('public.edit_sheet_purchase(uuid,text,uuid,jsonb)'::regprocedure);
  if position('where nullif(trim(p_data->''buyer''->>k),'''') is null' in s)=0 then raise exception 'EXPECTED_BUYER_NOT_FOUND';end if;
  s=replace(s,'where nullif(trim(p_data->''buyer''->>k),'''') is null',
    'where jsonb_typeof(p_data->''buyer''->k) is distinct from ''string'' or length(p_data->''buyer''->>k)>300');
  s=replace(s,'if not exists(select 1 from public.purchase_evidence where id=(p_data->>''evidence_id'')::uuid',
    'if p_data->>''evidence_id'' is not null and not exists(select 1 from public.purchase_evidence where id=(p_data->>''evidence_id'')::uuid');
  s=replace(s,'if r.evidence_id<>(p_data->>''evidence_id'')::uuid then',
    'if r.evidence_id is distinct from (p_data->>''evidence_id'')::uuid then');
  execute s;
  -- Stable per-ticket line metadata prevents a released first line from reclassifying remaining tickets.
  s=pg_get_functiondef('public.read_ticket_code_register(uuid,text,text,integer)'::regprocedure);
  s=replace(s,'jsonb_build_object(''count'',','jsonb_build_object(''editing_version'',1,''count'',');
  s=replace(s,'r.completed_at,t.ticket_code legacy_code,','r.completed_at,r.revision,t.ticket_code legacy_code,');
  s=replace(s,'ftu_sales_private.ticket_code_line(r.id,t.purchase_ordinal)',
    'coalesce((select h.line from ftu_sales_private.ticket_line_history h where h.ticket_id=t.id),ftu_sales_private.ticket_code_line(r.id,t.purchase_ordinal))');
  execute s;
end $patch$;

create function ftu_sales_private.free_retired_ticket_codes(p_request uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  insert into ftu_sales_private.ticket_release_context
    select txid_current(),t.id from public.tickets t join ftu_sales_private.ticket_code_slots s on s.ticket_id=t.id
    where t.purchase_id=p_request and t.status='void' and not exists(select 1 from public.votes v where v.ticket_id=t.id)
    on conflict do nothing;
  update ftu_sales_private.ticket_code_history h set released_at=clock_timestamp()
    from ftu_sales_private.ticket_release_context c where c.transaction_id=txid_current() and c.ticket_id=h.ticket_id;
  update ftu_sales_private.ticket_code_slots s set ticket_id=null,linked_at=null,line_snapshot=null
    from ftu_sales_private.ticket_release_context c where c.transaction_id=txid_current() and c.ticket_id=s.ticket_id;
  delete from ftu_sales_private.ticket_release_context where transaction_id=txid_current();
end $$;

alter function public.edit_sheet_purchase(uuid,text,uuid,jsonb) rename to edit_sheet_purchase_before_recycling;
create function public.edit_sheet_purchase(p_actor uuid,p_aal text,p_request uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; old_lines jsonb; replay boolean;begin
  if p_data->>'evidence_id' is null and jsonb_typeof(p_data->'buyer')='object'
    and not exists(select 1 from jsonb_each_text(p_data->'buyer') where length(trim(value))>0) then
    return ftu_sales_private.clear_sheet_purchase(p_actor,p_aal,p_request,p_data);
  end if;
  select exists(select 1 from ftu_sales_private.sheet_edit_operations where operation_id=(p_data->>'operation_id')::uuid) into replay;
  select jsonb_agg(jsonb_build_object('product_id',x->>'product_id','bundle_size',(x->>'bundle_size')::int,'quantity',(x->>'quantity')::int) order by x->>'product_id',x->>'bundle_size')
    into old_lines from public.purchase_requests r cross join lateral jsonb_array_elements(r.lines) x where r.id=p_request;
  result=public.edit_sheet_purchase_before_recycling(p_actor,p_aal,p_request,p_data);
  if replay then return result;end if;
  -- Recompute only after a normal quantity/type edit has finished renumbering.
  if old_lines is distinct from (select jsonb_agg(x order by x->>'product_id',x->>'bundle_size') from jsonb_array_elements(p_data->'lines') x) then
  insert into ftu_sales_private.ticket_line_history
    select t.id,ftu_sales_private.ticket_code_line(t.purchase_id,t.purchase_ordinal)
    from public.tickets t where t.purchase_id=p_request and t.status='issued'
    on conflict(ticket_id) do update set line=excluded.line;
  end if;
  perform ftu_sales_private.free_retired_ticket_codes(p_request);
  return result;
end $$;

create function public.edit_ticket_code_row(p_actor uuid,p_aal text,p_request uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.purchase_requests; prior ftu_sales_private.sheet_edit_operations; operation uuid=(p_data->>'operation_id')::uuid;
  ids uuid[]; codes text[]; actual uuid[]; group_ids uuid[]; l jsonb; kept jsonb; result jsonb; n bigint; amount bigint;
  clearing boolean; new_evidence uuid=(p_data->>'evidence_id')::uuid; old_tickets jsonb;
begin
  if not public.has_role(p_actor,array['TICKET_STAFF']) or
    (p_aal is distinct from 'aal2' and (p_aal is distinct from 'aal1' or not public.has_role(p_actor,array['SUPER_ADMIN'])))
    then raise exception 'FORBIDDEN';end if;
  if operation is null then raise exception 'INVALID_SHEET_EDIT';end if;
  perform pg_advisory_xact_lock(hashtextextended('sheet:'||operation::text,0));
  select * into prior from ftu_sales_private.sheet_edit_operations where operation_id=operation;
  if found then
    if prior.actor_id<>p_actor or prior.purchase_id<>p_request or prior.payload<>p_data then raise exception 'IDEMPOTENCY_CONFLICT';end if;
    return prior.result;
  end if;
  -- Same offer -> request -> products -> tickets -> code batch order as completion.
  perform 1 from public.purchase_offers where id=(select offer_id from public.purchase_requests where id=p_request) for update;
  select * into r from public.purchase_requests where id=p_request for update;
  if not found or r.status<>'COMPLETED' then raise exception 'PURCHASE_NOT_FOUND';end if;
  if r.revision is distinct from (p_data->>'expected_revision')::bigint then raise exception 'SHEET_REVISION_CONFLICT';end if;
  select array_agg(value::uuid order by value::uuid) into ids from jsonb_array_elements_text(p_data->'ticket_ids');
  select array_agg(value order by value) into codes from jsonb_array_elements_text(p_data->'codes');
  if cardinality(ids) is null or cardinality(ids)<>cardinality(codes)
    or (select count(distinct x) from unnest(ids) x)<>cardinality(ids)
    or (select count(distinct x) from unnest(codes) x)<>cardinality(codes) then raise exception 'INVALID_TICKET_GROUP';end if;
  perform 1 from public.purchase_products where offer_id=r.offer_id order by id for update;
  perform 1 from public.tickets where purchase_id=r.id order by id for update;
  perform 1 from ftu_sales_private.ticket_code_batches where offer_id=r.offer_id for update;
  select array_agg(t.id order by t.id) into actual from public.tickets t
    join ftu_sales_private.ticket_code_slots s on s.ticket_id=t.id
    where t.id=any(ids) and s.code=any(codes) and t.purchase_id=r.id and t.status='issued';
  if actual is distinct from ids then raise exception 'STALE_TICKET_ASSIGNMENT';end if;
  select h.line into l from ftu_sales_private.ticket_line_history h where ticket_id=ids[1];
  if (l->>'bundle_size')::int=1 then
    if cardinality(ids)<>1 then raise exception 'INVALID_TICKET_GROUP';end if;
  else
    select array_agg(t.id order by t.id) into group_ids from public.tickets t
      join ftu_sales_private.ticket_line_history h on h.ticket_id=t.id
      where t.purchase_id=r.id and t.status='issued' and h.line->>'product_id'=l->>'product_id'
      and h.line->>'bundle_size'=l->>'bundle_size';
    if group_ids is distinct from ids then raise exception 'INVALID_TICKET_GROUP';end if;
  end if;
  if jsonb_typeof(p_data->'buyer') is distinct from 'object' or exists(
    select 1 from unnest(array['name','school','cohort_class','student_id','email','phone','facebook']) k
    where jsonb_typeof(p_data->'buyer'->k) is distinct from 'string' or length(p_data->'buyer'->>k)>300)
    then raise exception 'INVALID_BUYER';end if;
  if new_evidence is not null and not exists(select 1 from public.purchase_evidence
    where id=new_evidence and request_id=r.id and user_id=r.user_id) then raise exception 'INVALID_EVIDENCE';end if;
  clearing=new_evidence is null and not exists(select 1 from jsonb_each_text(p_data->'buyer') where length(trim(value))>0);
  if clearing and exists(select 1 from public.votes where ticket_id=any(ids)) then raise exception 'VOTED_TICKET_IMMUTABLE';end if;
  insert into ftu_sales_private.sheet_edit_context values(txid_current(),r.id);
  if clearing then
    select jsonb_agg(to_jsonb(t)) into old_tickets from public.tickets t where id=any(ids);
    update public.tickets set status='void' where id=any(ids);
    perform ftu_sales_private.free_retired_ticket_codes(r.id);
    -- Remove only the selected single/group; other lines and their shared contact/proof stay intact.
    select coalesce(jsonb_agg(case when x->>'product_id'=l->>'product_id' and x->>'bundle_size'=l->>'bundle_size'
      then x||jsonb_build_object('ticket_quantity',(x->>'ticket_quantity')::bigint-cardinality(ids),
        'quantity',(x->>'quantity')::bigint-cardinality(ids)/(x->>'bundle_size')::int) else x end order by ord),'[]') into kept
      from jsonb_array_elements(r.lines) with ordinality a(x,ord)
      where not(x->>'product_id'=l->>'product_id' and x->>'bundle_size'=l->>'bundle_size'
        and (x->>'ticket_quantity')::bigint=cardinality(ids));
    select coalesce(sum((x->>'ticket_quantity')::bigint),0),coalesce(sum((x->>'quantity')::bigint*(x->>'unit_price_vnd')::bigint),0)
      into n,amount from jsonb_array_elements(kept) x;
    update public.purchase_products set sold_quantity=sold_quantity-cardinality(ids) where id=(l->>'product_id')::uuid;
    delete from public.purchase_allocations where request_id=r.id and product_id=(l->>'product_id')::uuid
      and quantity=cardinality(ids);
    update public.purchase_allocations set quantity=quantity-cardinality(ids)
      where request_id=r.id and product_id=(l->>'product_id')::uuid;
    if n=0 then update public.purchase_evidence set current_version=false where request_id=r.id and current_version;end if;
    update public.purchase_requests set quantity=n,total_vnd=amount,lines=kept,revision=revision+1,
      status=case when n=0 then 'CLEARED' else status end,
      buyer=case when n=0 then p_data->'buyer' else buyer end,
      evidence_id=case when n=0 then null else evidence_id end where id=r.id;
  else
    if r.evidence_id is distinct from new_evidence then
      update public.purchase_evidence set current_version=false where request_id=r.id and current_version;
      update public.purchase_evidence set current_version=true where id=new_evidence;
    end if;
    update public.purchase_requests set buyer=p_data->'buyer',evidence_id=new_evidence,revision=revision+1 where id=r.id;
  end if;
  delete from ftu_sales_private.sheet_edit_context where transaction_id=txid_current() and purchase_id=r.id;
  result=public.read_purchase(r.user_id,r.id);
  insert into public.audit_logs(edition_id,actor_id,action,target_id,detail)
    values(r.edition_id,p_actor,case when clearing then 'ticket_group_released' else 'ticket_buyer_edited' end,r.id,
      jsonb_build_object('operation_id',operation,'codes',codes,'ticket_ids',ids,'before',to_jsonb(r),'before_tickets',old_tickets,'after',result));
  insert into ftu_sales_private.sheet_edit_operations(operation_id,actor_id,purchase_id,payload,result)
    values(operation,p_actor,r.id,p_data,result);
  return result;
end $$;
create function ftu_sales_private.clear_sheet_purchase(p_actor uuid,p_aal text,p_request uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.purchase_requests; group_row record; payload jsonb; result jsonb; prior ftu_sales_private.sheet_edit_operations;
  operation uuid=(p_data->>'operation_id')::uuid;
begin
  if not public.has_role(p_actor,array['TICKET_STAFF']) or
    (p_aal is distinct from 'aal2' and (p_aal is distinct from 'aal1' or not public.has_role(p_actor,array['SUPER_ADMIN'])))
    then raise exception 'FORBIDDEN';end if;
  perform pg_advisory_xact_lock(hashtextextended('sheet:'||operation::text,0));
  select * into prior from ftu_sales_private.sheet_edit_operations where operation_id=operation;
  if found then
    if prior.actor_id<>p_actor or prior.purchase_id<>p_request or prior.payload<>p_data then raise exception 'IDEMPOTENCY_CONFLICT';end if;
    return prior.result;
  end if;
  perform 1 from public.purchase_offers where id=(select offer_id from public.purchase_requests where id=p_request) for update;
  select * into r from public.purchase_requests where id=p_request for update;
  if not found or r.status<>'COMPLETED' then raise exception 'PURCHASE_NOT_FOUND';end if;
  if r.revision is distinct from (p_data->>'expected_revision')::bigint then raise exception 'SHEET_REVISION_CONFLICT';end if;
  for group_row in select array_agg(s.code order by s.code) codes,array_agg(t.id order by s.code) ids,
    case when (h.line->>'bundle_size')::int=1 then s.code else (h.line->>'product_id')||':'||(h.line->>'bundle_size') end group_key
    from public.tickets t join ftu_sales_private.ticket_code_slots s on s.ticket_id=t.id
    join ftu_sales_private.ticket_line_history h on h.ticket_id=t.id where t.purchase_id=r.id and t.status='issued'
    group by group_key order by group_key
  loop
    payload=jsonb_build_object('operation_id',md5(operation::text||':'||group_row.group_key)::uuid,
      'expected_revision',r.revision,'codes',group_row.codes,'ticket_ids',group_row.ids,'buyer',p_data->'buyer','evidence_id',null);
    result=public.edit_ticket_code_row(p_actor,p_aal,r.id,payload);
    r.revision=(result->>'revision')::bigint;
  end loop;
  if result is null then raise exception 'INVALID_TICKET_GROUP';end if;
  insert into ftu_sales_private.sheet_edit_operations(operation_id,actor_id,purchase_id,payload,result)
    values(operation,p_actor,r.id,p_data,result);
  return result;
end $$;

create function public.read_purchase_ticket_codes(p_actor uuid,p_aal text,p_request uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.has_role(p_actor,array['TICKET_STAFF']) or
    (p_aal is distinct from 'aal2' and (p_aal is distinct from 'aal1' or not public.has_role(p_actor,array['SUPER_ADMIN'])))
    then raise exception 'FORBIDDEN';end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('code',s.code,'ticket_id',t.id,
    'request_id',r.id,'revision',r.revision,'buyer',r.buyer,'evidence_id',r.evidence_id,
    'line',h.line) order by s.code),'[]'::jsonb)
    from public.purchase_requests r join public.tickets t on t.purchase_id=r.id and t.status='issued'
    join ftu_sales_private.ticket_code_slots s on s.ticket_id=t.id
    join ftu_sales_private.ticket_line_history h on h.ticket_id=t.id where r.id=p_request and r.status='COMPLETED');
end $$;

revoke all on function ftu_sales_private.track_ticket_assignment(),ftu_sales_private.free_retired_ticket_codes(uuid),
  ftu_sales_private.clear_sheet_purchase(uuid,text,uuid,jsonb),
  public.edit_sheet_purchase_before_recycling(uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.edit_sheet_purchase(uuid,text,uuid,jsonb),public.edit_ticket_code_row(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.edit_sheet_purchase(uuid,text,uuid,jsonb),public.edit_ticket_code_row(uuid,text,uuid,jsonb) to service_role;
revoke all on function public.read_purchase_ticket_codes(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.read_purchase_ticket_codes(uuid,text,uuid) to service_role;
commit;
