begin;

alter table public.purchase_requests add column revision bigint not null default 0 check(revision>=0);
alter table public.purchase_evidence add column current_version boolean not null default true;
alter table public.purchase_evidence add column content_sha256 text check(content_sha256 ~ '^[a-f0-9]{64}$');
alter table public.purchase_evidence drop constraint purchase_evidence_request_id_key;
create unique index purchase_evidence_current on public.purchase_evidence(request_id) where current_version;
drop index public.supplement_ticket_ordinal;
create unique index supplement_ticket_ordinal on public.tickets(purchase_id,purchase_ordinal)
  where purchase_id is not null and status='issued';

-- A private transaction permit, never a caller-set GUC. Ordinary table writes retain the old guards.
create table ftu_sales_private.sheet_edit_context (
  transaction_id bigint not null, purchase_id uuid not null,
  primary key(transaction_id,purchase_id)
);
create table ftu_sales_private.sheet_edit_operations (
  operation_id uuid primary key, actor_id uuid not null references auth.users,
  purchase_id uuid not null references public.purchase_requests,
  payload jsonb not null, result jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create table ftu_sales_private.sheet_original_functions(name text primary key,definition text not null);
insert into ftu_sales_private.sheet_original_functions select p.oid::regprocedure::text,pg_get_functiondef(p.oid)
  from pg_proc p where p.oid in ('ftu_sales_private.guard_purchase()'::regprocedure,
    'ftu_sales_private.guard_ticket()'::regprocedure,'public.read_purchase(uuid,uuid)'::regprocedure,
    'public.attach_purchase_evidence(uuid,uuid,uuid,text,integer)'::regprocedure);
revoke all on ftu_sales_private.sheet_original_functions from public,anon,authenticated,service_role;
revoke all on ftu_sales_private.sheet_edit_context,ftu_sales_private.sheet_edit_operations from public,anon,authenticated,service_role;

create function ftu_sales_private.sheet_edit_allowed(p_request uuid) returns boolean
language sql security definer set search_path='' as $$
  select exists(select 1 from ftu_sales_private.sheet_edit_context
    where transaction_id=txid_current() and purchase_id=p_request);
$$;
revoke all on function ftu_sales_private.sheet_edit_allowed(uuid) from public,anon,authenticated,service_role;

-- Insert a narrow exception into the existing guards without replacing legacy behavior.
do $guard$
declare definition text; exception text;
begin
  definition=pg_get_functiondef('ftu_sales_private.guard_purchase()'::regprocedure);
  exception=$body$
  if tg_op='UPDATE' and ftu_sales_private.sheet_edit_allowed(old.id) then
    if old.status<>'COMPLETED' or new.status<>'COMPLETED'
      or (to_jsonb(new)-array['code','buyer','lines','quantity','total_vnd','evidence_id','revision'])
        is distinct from (to_jsonb(old)-array['code','buyer','lines','quantity','total_vnd','evidence_id','revision'])
      or new.revision<>old.revision+1 then raise exception 'INVALID_SHEET_EDIT'; end if;
    return new;
  end if;
  $body$;
  execute regexp_replace(definition,E'\\mbegin\\s*\\n',E'begin\n'||exception,'i');
  definition=pg_get_functiondef('ftu_sales_private.guard_ticket()'::regprocedure);
  exception=$body$
  if new.source='SUPPLEMENT' and ftu_sales_private.sheet_edit_allowed(new.purchase_id) then
    if tg_op='UPDATE' and (to_jsonb(new)-array['status','ticket_code','seat_label','purchase_ordinal'])
      is distinct from (to_jsonb(old)-array['status','ticket_code','seat_label','purchase_ordinal']) then
      raise exception 'INVALID_SHEET_TICKET_EDIT'; end if;
    if new.status='void' and exists(select 1 from public.votes where ticket_id=new.id) then
      raise exception 'VOTED_TICKET_IMMUTABLE'; end if;
    return new;
  end if;
  $body$;
  execute regexp_replace(definition,E'\\mbegin\\s*\\n',E'begin\n'||exception,'i');
  definition=pg_get_functiondef('public.read_purchase(uuid,uuid)'::regprocedure);
  execute replace(definition,'where request_id=r.id)','where request_id=r.id and current_version)');
  definition=pg_get_functiondef('public.attach_purchase_evidence(uuid,uuid,uuid,text,integer)'::regprocedure);
  execute replace(definition,'where request_id=r.id;','where request_id=r.id and current_version;');
end $guard$;

create function ftu_sales_private.guard_sheet_allocation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not ftu_sales_private.sheet_edit_allowed(old.request_id) then raise exception 'IMMUTABLE_RECORD'; end if;
  if tg_op='DELETE' then return old; end if;
  if new.request_id<>old.request_id then raise exception 'INVALID_SHEET_EDIT'; end if;
  return new;
end $$;
drop trigger immutable_purchase_allocations on public.purchase_allocations;
create trigger immutable_purchase_allocations before update or delete on public.purchase_allocations
  for each row execute function ftu_sales_private.guard_sheet_allocation();

create function ftu_sales_private.guard_sheet_evidence() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'IMMUTABLE_RECORD'; end if;
  if not ftu_sales_private.sheet_edit_allowed(old.request_id)
    or (to_jsonb(new)-'current_version') is distinct from (to_jsonb(old)-'current_version')
    or old.current_version=new.current_version then raise exception 'IMMUTABLE_RECORD'; end if;
  return new;
end $$;
drop trigger immutable_purchase_evidence on public.purchase_evidence;
create trigger immutable_purchase_evidence before update or delete on public.purchase_evidence
  for each row execute function ftu_sales_private.guard_sheet_evidence();
revoke all on function ftu_sales_private.guard_sheet_allocation(),ftu_sales_private.guard_sheet_evidence()
  from public,anon,authenticated,service_role;

create function public.edit_sheet_purchase(p_actor uuid,p_aal text,p_request uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.purchase_requests; product public.purchase_products; line jsonb; old_line jsonb;
  operation uuid=(p_data->>'operation_id')::uuid; prior ftu_sales_private.sheet_edit_operations;
  desired_quantity bigint=0; amount bigint=0; size integer; count_bundles bigint; price bigint;
  used bigint; old_count bigint; new_count bigint; held bigint; new_lines jsonb='[]';
  voted uuid[]; retained uuid[]; ticket record; ordinal bigint=0; result jsonb; old_tickets jsonb;
begin
  if not public.has_role(p_actor,array['TICKET_STAFF']) or
    (p_aal is distinct from 'aal2' and (p_aal is distinct from 'aal1' or not public.has_role(p_actor,array['SUPER_ADMIN']))) then
    raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('sheet:'||operation::text,0));
  select * into prior from ftu_sales_private.sheet_edit_operations where operation_id=operation;
  if found then
    if prior.actor_id<>p_actor or prior.purchase_id<>p_request or prior.payload<>p_data then
      raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return prior.result;
  end if;
  select * into r from public.purchase_requests where id=p_request for update;
  if not found then raise exception 'PURCHASE_NOT_FOUND'; end if;
  if r.status<>'COMPLETED' then raise exception 'INVALID_SHEET_EDIT'; end if;
  if r.revision<>(p_data->>'expected_revision')::bigint then raise exception 'SHEET_REVISION_CONFLICT'; end if;
  if nullif(trim(p_data->>'code'),'') is null or length(p_data->>'code')>160 then raise exception 'INVALID_SHEET_EDIT'; end if;
  if jsonb_typeof(p_data->'buyer') is distinct from 'object' or
    exists(select 1 from unnest(array['name','school','cohort_class','student_id','email','phone','facebook']) k
      where nullif(trim(p_data->'buyer'->>k),'') is null) then raise exception 'INVALID_BUYER'; end if;
  if jsonb_typeof(p_data->'lines') is distinct from 'array' or jsonb_array_length(p_data->'lines') not between 1 and 100 then
    raise exception 'INVALID_SELECTION'; end if;
  if exists(select 1 from jsonb_array_elements(p_data->'lines') x group by x->>'product_id',x->>'bundle_size' having count(*)>1) then
    raise exception 'INVALID_SELECTION'; end if;
  if not exists(select 1 from public.purchase_evidence where id=(p_data->>'evidence_id')::uuid
    and request_id=r.id and user_id=r.user_id) then raise exception 'INVALID_EVIDENCE'; end if;

  -- Same request->products->tickets order as purchase completion; votes serialize on ticket locks.
  perform 1 from public.purchase_products where id in (
    select product_id from public.purchase_allocations where request_id=r.id
    union select (x->>'product_id')::uuid from jsonb_array_elements(p_data->'lines') x
  ) order by id for update;
  perform 1 from public.tickets where purchase_id=r.id order by id for update;
  select coalesce(array_agg(distinct t.id),'{}'::uuid[]) into voted from public.tickets t
    join public.votes v on v.ticket_id=t.id where t.purchase_id=r.id;

  for line in select value from jsonb_array_elements(p_data->'lines') loop
    select * into product from public.purchase_products where id=(line->>'product_id')::uuid and offer_id=r.offer_id;
    if not found then raise exception 'INVALID_SELECTION'; end if;
    size=(line->>'bundle_size')::integer; count_bundles=(line->>'quantity')::bigint;
    if size not in (1,2,3) or count_bundles not between 1 and 2147483647 or count_bundles*size>2147483647 then
      raise exception 'INVALID_SELECTION'; end if;
    select value into old_line from jsonb_array_elements(r.lines) x where (x->>'product_id')::uuid=product.id
      and (x->>'bundle_size')::integer=size;
    price=coalesce((old_line->>'unit_price_vnd')::bigint,
      case size when 1 then product.price_vnd when 2 then product.combo2_vnd else product.combo3_vnd end);
    if price is null then raise exception 'COMBO_NOT_CONFIGURED'; end if;
    desired_quantity=desired_quantity+count_bundles*size; amount=amount+count_bundles*price;
    new_lines=new_lines||jsonb_build_array(jsonb_build_object('product_id',product.id,'name',product.name,'tier',product.tier,
      'bundle_size',size,'quantity',count_bundles,'ticket_quantity',count_bundles*size,'unit_price_vnd',price));
  end loop;
  if desired_quantity<cardinality(voted) then raise exception 'SHEET_BELOW_VOTED_TICKETS'; end if;
  if amount not between 1 and 9007199254740991 then raise exception 'INVALID_SELECTION'; end if;
  for product in select * from public.purchase_products where id in (
    select product_id from public.purchase_allocations where request_id=r.id
    union select (x->>'product_id')::uuid from jsonb_array_elements(new_lines) x) order by id loop
    select coalesce(sum(a.quantity),0) into old_count from public.purchase_allocations a where request_id=r.id and product_id=product.id;
    select coalesce(sum((x->>'ticket_quantity')::bigint),0) into new_count from jsonb_array_elements(new_lines) x where (x->>'product_id')::uuid=product.id;
    select coalesce(sum(a.quantity),0) into held from public.purchase_allocations a join public.purchase_requests q on q.id=a.request_id
      where a.product_id=product.id and q.status='HELD' and q.expires_at>clock_timestamp();
    if product.sold_quantity-old_count+new_count+held>product.quota then raise exception 'QUOTA_UNAVAILABLE'; end if;
  end loop;

  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into old_tickets from public.tickets t where purchase_id=r.id;
  insert into ftu_sales_private.sheet_edit_context values(txid_current(),r.id);
  if r.evidence_id<>(p_data->>'evidence_id')::uuid then
    update public.purchase_evidence set current_version=false where request_id=r.id and current_version;
    update public.purchase_evidence set current_version=true where id=(p_data->>'evidence_id')::uuid;
  end if;
  update public.purchase_requests set code=trim(p_data->>'code'),buyer=p_data->'buyer',lines=new_lines,
    quantity=desired_quantity,total_vnd=amount,evidence_id=(p_data->>'evidence_id')::uuid,revision=revision+1 where id=r.id;
  for product in select * from public.purchase_products where id in (
    select product_id from public.purchase_allocations where request_id=r.id
    union select (x->>'product_id')::uuid from jsonb_array_elements(new_lines) x) order by id loop
    select coalesce(sum(a.quantity),0) into old_count from public.purchase_allocations a where request_id=r.id and product_id=product.id;
    select coalesce(sum((x->>'ticket_quantity')::bigint),0) into new_count from jsonb_array_elements(new_lines) x where (x->>'product_id')::uuid=product.id;
    update public.purchase_products set sold_quantity=sold_quantity-old_count+new_count where id=product.id;
  end loop;
  delete from public.purchase_allocations where request_id=r.id;
  insert into public.purchase_allocations select r.id,(x->>'product_id')::uuid,sum((x->>'ticket_quantity')::integer)
    from jsonb_array_elements(new_lines) x group by x->>'product_id';
  if desired_quantity<>r.quantity or trim(p_data->>'code')<>r.code then
  select coalesce(array_agg(id),'{}'::uuid[]) into retained from (
    select t.id from public.tickets t where t.purchase_id=r.id and t.status='issued'
    order by (t.id=any(voted)) desc,t.purchase_ordinal,t.id limit desired_quantity
  ) chosen;
  update public.tickets set status='void',ticket_code='ARCH-'||id::text,seat_label='ARCH-'||id::text
    where purchase_id=r.id and status='issued' and not(id=any(retained));
  -- Free the visible code/ordinal namespace before renumbering, retaining UUIDs and vote history.
  update public.tickets set ticket_code='EDIT-'||id::text,seat_label='EDIT-'||id::text,
    purchase_ordinal=r.quantity+desired_quantity+purchase_ordinal where id=any(retained);
  for ticket in select id from public.tickets where id=any(retained) order by purchase_ordinal,id loop
    ordinal=ordinal+1;
    update public.tickets set purchase_ordinal=ordinal,ticket_code=trim(p_data->>'code')||'-'||ordinal,
      seat_label=trim(p_data->>'code')||'-'||ordinal where id=ticket.id;
  end loop;
  insert into public.tickets(edition_id,round_id,user_id,seat_label,token_hash,source,purchase_id,purchase_ordinal,ticket_code)
    select r.edition_id,r.round_id,r.user_id,trim(p_data->>'code')||'-'||n,replace(gen_random_uuid()::text,'-',''),
      'SUPPLEMENT',r.id,n,trim(p_data->>'code')||'-'||n from generate_series(ordinal+1,desired_quantity) n;
  end if;
  delete from ftu_sales_private.sheet_edit_context where transaction_id=txid_current() and purchase_id=r.id;
  result=public.read_purchase(r.user_id,r.id);
  insert into public.audit_logs(edition_id,actor_id,action,target_id,detail)
    values(r.edition_id,p_actor,'sheet_purchase_edited',r.id,jsonb_build_object('operation_id',operation,'before',to_jsonb(r),'before_tickets',old_tickets,'after',result));
  insert into ftu_sales_private.sheet_edit_operations(operation_id,actor_id,purchase_id,payload,result)
    values(operation,p_actor,r.id,p_data,result);
  return result;
end $$;
revoke all on function public.edit_sheet_purchase(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.edit_sheet_purchase(uuid,text,uuid,jsonb) to service_role;

create function public.register_sheet_purchase_evidence(p_actor uuid,p_aal text,p_request uuid,p_id uuid,p_object text,p_bytes integer,p_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.purchase_requests; existing public.purchase_evidence;
begin
  if not public.has_role(p_actor,array['TICKET_STAFF']) or
    (p_aal is distinct from 'aal2' and (p_aal is distinct from 'aal1' or not public.has_role(p_actor,array['SUPER_ADMIN']))) then
    raise exception 'FORBIDDEN'; end if;
  select * into r from public.purchase_requests where id=p_request and status='COMPLETED' for update;
  if not found then raise exception 'PURCHASE_NOT_FOUND'; end if;
  if p_object<>'private/purchases/'||r.user_id::text||'/'||r.id::text||'/'||p_id::text||'.webp' then raise exception 'INVALID_EVIDENCE'; end if;
  if p_sha256 is null or p_sha256!~'^[a-f0-9]{64}$' then raise exception 'INVALID_EVIDENCE'; end if;
  select * into existing from public.purchase_evidence where id=p_id;
  if found then
    if existing.request_id<>r.id or existing.content_sha256<>p_sha256 then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('id',existing.id);
  end if;
  insert into public.purchase_evidence(id,request_id,user_id,object_key,mime,bytes,current_version,content_sha256)
    values(p_id,r.id,r.user_id,p_object,'image/webp',p_bytes,false,p_sha256);
  insert into public.audit_logs(edition_id,actor_id,action,target_id,detail)
    values(r.edition_id,p_actor,'sheet_evidence_staged',r.id,jsonb_build_object('evidence_id',p_id));
  return jsonb_build_object('id',p_id);
end $$;
revoke all on function public.register_sheet_purchase_evidence(uuid,text,uuid,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.register_sheet_purchase_evidence(uuid,text,uuid,uuid,text,integer,text) to service_role;

create function public.read_vote_participation(p_round uuid) returns jsonb
language sql security definer set search_path='' as $$
  select jsonb_build_object('participants',count(distinct v.user_id),'votes',count(v.id))
  from public.contest_rounds r join public.contest_editions e on e.id=r.edition_id
  left join public.votes v on v.round_id=r.id
  where r.id=p_round and r.published and e.published and r.kind in ('semifinal','final')
  group by r.id;
$$;
create function public.close_due_vote_sessions(p_limit integer default 100) returns integer
language plpgsql security definer set search_path='' as $$
declare session public.vote_sessions; affected integer=0;
begin
  if p_limit not between 1 and 1000 then raise exception 'INVALID_LIMIT'; end if;
  for session in select * from public.vote_sessions where state='OPEN' and close_at<=clock_timestamp()
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
revoke all on function public.read_vote_participation(uuid),public.close_due_vote_sessions(integer) from public,anon,authenticated;
grant execute on function public.read_vote_participation(uuid),public.close_due_vote_sessions(integer) to service_role;
commit;
