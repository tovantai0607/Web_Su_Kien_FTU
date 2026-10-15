begin;
-- Validate the entire projected offer after replacing this completed order.
-- Caller serializes on offer -> request -> all products -> tickets, matching
-- reserve/complete/configuration. Held quota is measured after these locks.
create function ftu_sales_private.validate_sheet_offer_quota(p_request uuid,p_lines jsonb,p_now timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare o public.purchase_offers; p record; projected jsonb; phase text;
  total_used bigint=0; early_used bigint=0; bonus bigint; capacity bigint;
begin
  select offer.* into o from public.purchase_offers offer
    join public.purchase_requests r on r.offer_id=offer.id where r.id=p_request;
  if not found then raise exception 'PURCHASE_NOT_FOUND';end if;
  select jsonb_agg(to_jsonb(products)||jsonb_build_object(
      'projected_sold',products.sold_quantity
        -coalesce((select sum(a.quantity) from public.purchase_allocations a where a.request_id=p_request and a.product_id=products.id),0)
        +coalesce((select sum((x->>'ticket_quantity')::bigint) from jsonb_array_elements(p_lines) x where (x->>'product_id')::uuid=products.id),0),
      'active_held',coalesce((select sum(a.quantity) from public.purchase_allocations a join public.purchase_requests r on r.id=a.request_id
        where a.product_id=products.id and r.status='HELD' and r.expires_at>p_now),0)))
    into projected from public.purchase_products products where products.offer_id=o.id;
  for p in select * from jsonb_to_recordset(projected) as x(id uuid,name text,tier text,base_quota bigint,quota bigint,projected_sold bigint,active_held bigint) loop
    if p.projected_sold<0 then raise exception 'INVALID_SHEET_EDIT';end if;
    total_used=total_used+p.projected_sold+p.active_held;
    if p.tier='EARLY' then early_used=early_used+p.projected_sold+p.active_held;end if;
  end loop;
  if o.total_quota is not null and (total_used>o.total_quota or early_used>o.early_quota) then
    raise exception 'QUOTA_UNAVAILABLE';end if;
  phase=case when o.total_quota is null then null else ftu_sales_private.offer_phase(o.id,p_now) end;
  for p in select * from jsonb_to_recordset(projected) as x(id uuid,name text,tier text,base_quota bigint,quota bigint,projected_sold bigint,active_held bigint) loop
    capacity=coalesce(p.base_quota,p.quota);bonus=0;
    if o.total_quota is not null and phase in ('NORMAL','CLOSED') and p.tier='NORMAL' then
      select coalesce(sum(greatest(coalesce(x.base_quota,x.quota)-x.projected_sold-x.active_held,0)),0)
        into bonus from jsonb_to_recordset(projected) as x(name text,tier text,base_quota bigint,quota bigint,projected_sold bigint,active_held bigint)
        where x.name=p.name and x.tier='EARLY';
    end if;
    if p.projected_sold+p.active_held>capacity+bonus then raise exception 'QUOTA_UNAVAILABLE';end if;
  end loop;
end $$;
revoke all on function ftu_sales_private.validate_sheet_offer_quota(uuid,jsonb,timestamptz) from public,anon,authenticated,service_role;

-- Keep the existing ownership/revision/vote/proof/audit implementation intact.
-- Refuse installation if the expected source is different rather than patching blindly.
create table ftu_sales_private.sheet_quota_original(definition text not null);
insert into ftu_sales_private.sheet_quota_original values(pg_get_functiondef('public.edit_sheet_purchase(uuid,text,uuid,jsonb)'::regprocedure));
revoke all on ftu_sales_private.sheet_quota_original from public,anon,authenticated,service_role;
do $patch$
declare source text; updated text; old_locks text; old_check text;
begin
  select definition into source from ftu_sales_private.sheet_quota_original;
  old_locks=$old$  perform 1 from public.purchase_products where id in (
    select product_id from public.purchase_allocations where request_id=r.id
    union select (x->>'product_id')::uuid from jsonb_array_elements(p_data->'lines') x
  ) order by id for update;$old$;
  old_check=$old$  for product in select * from public.purchase_products where id in (
    select product_id from public.purchase_allocations where request_id=r.id
    union select (x->>'product_id')::uuid from jsonb_array_elements(new_lines) x) order by id loop
    select coalesce(sum(a.quantity),0) into old_count from public.purchase_allocations a where request_id=r.id and product_id=product.id;
    select coalesce(sum((x->>'ticket_quantity')::bigint),0) into new_count from jsonb_array_elements(new_lines) x where (x->>'product_id')::uuid=product.id;
    select coalesce(sum(a.quantity),0) into held from public.purchase_allocations a join public.purchase_requests q on q.id=a.request_id
      where a.product_id=product.id and q.status='HELD' and q.expires_at>clock_timestamp();
    if product.sold_quantity-old_count+new_count+held>product.quota then raise exception 'QUOTA_UNAVAILABLE'; end if;
  end loop;$old$;
  source=replace(source,E'\r\n',E'\n');
  if position(old_locks in source)=0 or position(old_check in source)=0 or position('  select * into r from public.purchase_requests where id=p_request for update;' in source)=0 then
    raise exception 'EXPECTED_SHEET_QUOTA_SOURCE_NOT_FOUND';end if;
  updated=replace(source,'  select * into r from public.purchase_requests where id=p_request for update;',
    '  perform 1 from public.purchase_offers where id=(select offer_id from public.purchase_requests where id=p_request) for update;'
    ||E'\n  select * into r from public.purchase_requests where id=p_request for update;');
  updated=replace(updated,old_locks,'  perform 1 from public.purchase_products where offer_id=r.offer_id order by id for update;');
  updated=replace(updated,old_check,'  perform ftu_sales_private.validate_sheet_offer_quota(r.id,new_lines,clock_timestamp());');
  execute updated;
end $patch$;
commit;
