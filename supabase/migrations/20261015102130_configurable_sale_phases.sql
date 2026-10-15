begin;

-- Preserve function bodies for a guarded, data-preserving rollback.
create table ftu_sales_private.sale_phase_original (name text primary key, definition text not null);
alter table ftu_sales_private.sale_phase_original enable row level security;
revoke all on ftu_sales_private.sale_phase_original from public,anon,authenticated,service_role;
insert into ftu_sales_private.sale_phase_original
select p.oid::regprocedure::text,pg_get_functiondef(p.oid) from pg_proc p
where p.oid in ('ftu_sales_private.official_offer_policy()'::regprocedure,
  'public.save_purchase_offer(uuid,text,jsonb)'::regprocedure);

-- The 700-ticket venue capacity remains fixed. Early allocation and sale times are now admin settings.
create or replace function ftu_sales_private.official_offer_policy() returns trigger
language plpgsql set search_path='' as $$
declare existing public.purchase_offers; kind text;
begin
  if new.mode='LIVE' and exists(select 1 from public.contest_editions where id=new.edition_id and slug='ftucharm-2027') then
    -- The original upsert omits phase columns on INSERT; preserve the existing settings.
    if tg_op='INSERT' and new.total_quota is null then
      select * into existing from public.purchase_offers where id=new.id;
      if found then
        new.total_quota=existing.total_quota;new.early_quota=existing.early_quota;
        new.early_open_at=existing.early_open_at;new.early_close_at=existing.early_close_at;
        new.normal_close_at=existing.normal_close_at;
      end if;
    end if;
    select r.kind into kind from public.contest_rounds r where r.id=new.round_id;
    if new.total_quota is distinct from 700 or kind is null or kind not in ('semifinal','final') then
      raise exception 'PROGRAM_CAPACITY_FIXED';
    end if;
  end if;
  return new;
end $$;

create or replace function public.save_purchase_offer(p_actor uuid,p_aal text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.purchase_offers; x jsonb; result jsonb; products jsonb='[]';
  target uuid=(p_data->>'id')::uuid; capacity integer=(p_data->>'total_quota')::integer;
  early_capacity integer=(p_data->>'early_quota')::integer;
  early_open timestamptz=(p_data->>'early_open_at')::timestamptz;
  early_close timestamptz=(p_data->>'early_close_at')::timestamptz;
  normal_close timestamptz=(p_data->>'normal_close_at')::timestamptz;
  tick timestamptz; used bigint; early_used bigint; early_sold bigint; effective bigint; bonus bigint;
  normal_phase boolean; normal_product public.purchase_products; stock jsonb;
begin
  if not public.has_role(p_actor,array['TICKET_STAFF']) or
    (p_aal is distinct from 'aal2' and (p_aal is distinct from 'aal1' or not public.has_role(p_actor,array['SUPER_ADMIN']))) then
    raise exception 'FORBIDDEN';
  end if;
  select * into o from public.purchase_offers where id=target for update;
  -- Do not remove or resize an established offer capacity through this settings screen.
  if o.total_quota is not null and capacity is distinct from o.total_quota then
    raise exception 'PROGRAM_CAPACITY_FIXED';
  end if;
  perform 1 from public.purchase_products where offer_id=target order by id for update;
  tick=clock_timestamp();
  if capacity is not null then
    if capacity<1 or early_capacity is null or early_capacity not between 0 and capacity
      or early_open is null or early_close is null or normal_close is null
      or early_close<=early_open or normal_close<=early_close then
      raise exception 'INVALID_SALE_PHASES';
    end if;
    if (select coalesce(sum((v->>'quota')::bigint),0) from jsonb_array_elements(p_data->'products') v where v->>'tier'='EARLY')>early_capacity
      or (select coalesce(sum((v->>'quota')::bigint),0) from jsonb_array_elements(p_data->'products') v where v->>'tier'='NORMAL')>capacity-early_capacity then
      raise exception 'PROGRAM_QUOTA_EXCEEDED';
    end if;
    select coalesce(sum(sold_quantity),0) into early_sold from public.purchase_products where offer_id=target and tier='EARLY';
    select early_sold+coalesce(sum(a.quantity),0) into early_used
      from public.purchase_allocations a join public.purchase_requests r on r.id=a.request_id
      join public.purchase_products p on p.id=a.product_id
      where r.offer_id=target and p.tier='EARLY' and r.status='HELD' and r.expires_at>tick;
    select coalesce(sum(sold_quantity),0)+(select coalesce(sum(quantity),0) from public.purchase_requests
      where offer_id=target and status='HELD' and expires_at>tick) into used from public.purchase_products where offer_id=target;
    if early_used>early_capacity or used>capacity then raise exception 'QUOTA_BELOW_ALLOCATED';end if;

    -- Only phase metadata is updated here. The original RPC still enforces ownership,
    -- immutable edition/round/mode, product IDs, held stock, audit and product validation.
    if o.id is null then
      insert into public.purchase_offers(id,edition_id,round_id,slug,title,venue,starts_at,published,mode,payment_instructions,qr_path,
        total_quota,early_quota,early_open_at,early_close_at,normal_close_at)
      values(target,(p_data->>'edition_id')::uuid,(p_data->>'round_id')::uuid,p_data->>'slug',p_data->>'title',p_data->>'venue',
        (p_data->>'starts_at')::timestamptz,(p_data->>'published')::boolean,p_data->>'mode',p_data->>'payment_instructions',p_data->>'qr_path',
        capacity,early_capacity,early_open,early_close,normal_close);
    else
      update public.purchase_offers set early_quota=early_capacity,early_open_at=early_open,
        early_close_at=early_close,normal_close_at=normal_close,total_quota=capacity where id=target;
    end if;
    normal_phase=tick>=early_close or early_sold>=early_capacity;
    for x in select value from jsonb_array_elements(p_data->'products') loop
      if exists(select 1 from public.purchase_products p join public.purchase_allocations a on a.product_id=p.id
        where p.id=(x->>'id')::uuid and (p.name<>x->>'name' or p.tier<>x->>'tier')) then
        raise exception 'IMMUTABLE_PURCHASE_SCOPE';
      end if;
      effective=(x->>'quota')::bigint;
      if x->>'tier'='NORMAL' and normal_phase then
        -- Compute rollover from the submitted allocation, not stale quotas from the old schedule.
        select coalesce(sum(greatest((e->>'quota')::bigint-coalesce(p.sold_quantity,0)-coalesce((
          select sum(a.quantity) from public.purchase_allocations a join public.purchase_requests r on r.id=a.request_id
          where a.product_id=p.id and r.status='HELD' and r.expires_at>tick),0),0)),0) into bonus
          from jsonb_array_elements(p_data->'products') e left join public.purchase_products p on p.id=(e->>'id')::uuid
          where e->>'tier'='EARLY' and e->>'name'=x->>'name';
        effective=effective+bonus;
      end if;
      products=products||jsonb_build_array(x||jsonb_build_object('quota',effective,'opens_at',early_open,
        'closes_at',case when x->>'tier'='EARLY' then early_close else normal_close end));
    end loop;
  else
    products=p_data->'products';
  end if;
  result=public.save_purchase_offer_before_2027(p_actor,p_aal,p_data||jsonb_build_object('products',products));
  for x in select value from jsonb_array_elements(p_data->'products') loop
    update public.purchase_products set base_quota=(x->>'quota')::integer where id=(x->>'id')::uuid;
  end loop;
  if capacity is not null then
    for normal_product in select * from public.purchase_products where offer_id=target and tier='NORMAL' order by id loop
      stock=ftu_sales_private.product_stock(normal_product.id,tick);
      if (stock->>'quota')::bigint<normal_product.sold_quantity+(stock->>'held')::bigint then
        raise exception 'QUOTA_BELOW_ALLOCATED';
      end if;
      update public.purchase_products set quota=(stock->>'quota')::integer where id=normal_product.id;
    end loop;
  end if;
  return result;
end $$;
revoke all on function ftu_sales_private.official_offer_policy() from public,anon,authenticated,service_role;
revoke all on function public.save_purchase_offer(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_purchase_offer(uuid,text,jsonb) to service_role;
commit;
