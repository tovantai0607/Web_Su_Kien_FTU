-- Stage 03: catalog and atomic inventory operations. Server-only RPCs, no payment calls.
begin;

create function public.sales_catalog(p_edition uuid default null, p_event uuid default null, p_slug text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare edition uuid; tick timestamptz := clock_timestamp(); result jsonb;
begin
  select id into edition from public.contest_editions
  where published and (p_edition is null or id = p_edition)
  order by year desc,created_at desc,id limit 1;
  select coalesce(jsonb_agg(data order by starts_at,id),'[]'::jsonb) into result from (
    select e.id,e.starts_at,jsonb_build_object(
      'id',e.id,'edition_id',e.edition_id,'round_id',e.round_id,'slug',e.slug,'title',e.title,
      'venue',e.venue,'starts_at',e.starts_at,'sale_open_at',e.sale_open_at,'sale_close_at',e.sale_close_at,
      'hold_ttl_seconds',e.hold_ttl_seconds,'max_tickets',10,
      'sale_state',case when tick < e.sale_open_at then 'UPCOMING'
        when tick >= e.sale_close_at then 'CLOSED'
        when stock.available = 0 then 'SOLD_OUT' else 'OPEN' end,
      'available',stock.available,'categories',stock.categories,
      'seats',case when p_event is not null or p_slug is not null then (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id',s.id,'category_id',s.category_id,'row_label',s.row_label,'seat_number',s.seat_number,'label',s.label,
          'state',case when not s.enabled or not c.enabled then 'UNAVAILABLE'
            when h.state = 'CONSUMED' or t.id is not null then 'SOLD'
            when h.state = 'HELD' then 'HELD' else 'AVAILABLE' end
        ) order by c.position,s.row_label,s.seat_number,s.id),'[]'::jsonb)
        from public.event_seats s join public.ticket_categories c on c.id = s.category_id
        left join public.seat_holds h on h.seat_id = s.id and h.state in ('HELD','CONSUMED')
        left join public.tickets t on t.seat_id = s.id and t.status = 'issued' where s.event_id = e.id
      ) else '[]'::jsonb end
    ) as data
    from public.events e join public.contest_rounds r on r.id = e.round_id
    cross join lateral (
      select coalesce(sum(i.available),0)::integer as available,
        coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'position',c.position,
          'price_vnd',c.price_vnd,'capacity',i.capacity,'held',i.held,'sold',i.sold,'available',i.available)
          order by c.position),'[]'::jsonb) as categories
      from public.ticket_categories c join public.ticket_inventory i on i.category_id = c.id
      where c.event_id = e.id and c.enabled
    ) stock
    where e.edition_id = edition and e.published and r.published
      and (p_event is null or e.id = p_event) and (p_slug is null or e.slug = p_slug)
    order by e.starts_at,e.id limit 100
  ) catalog;
  return jsonb_build_object('server_time',tick,'events',result);
end $$;

-- One order lock serializes cancellation/expiry and future payment confirmation.
create function ftu_sales_private.release_order_hold(p_order uuid, p_expiry_only boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare o public.orders; next_state text;
begin
  select * into o from public.orders where id = p_order for update;
  if not found or o.status <> 'PENDING_PAYMENT' then return false; end if;
  if p_expiry_only and clock_timestamp() < o.expires_at then return false; end if;
  next_state := case when clock_timestamp() >= o.expires_at then 'EXPIRED' else 'CANCELLED' end;
  perform s.id from public.event_seats s join public.seat_holds h on h.seat_id = s.id
    where h.order_id = o.id order by s.id for update of s;
  update public.orders set status = next_state where id = o.id;
  update public.order_reservations set state = 'RELEASED' where order_id = o.id and state = 'HELD';
  update public.seat_holds set state = 'RELEASED' where order_id = o.id and state = 'HELD';
  return true;
end $$;

create function public.expire_sales_holds(p_event uuid default null, p_limit integer default 100)
returns integer language plpgsql security definer set search_path = '' as $$
declare oid uuid; released integer := 0;
begin
  if p_limit is null or p_limit not between 1 and 200 then raise exception 'INVALID_BATCH_LIMIT'; end if;
  for oid in select id from public.orders
    where status = 'PENDING_PAYMENT' and expires_at <= clock_timestamp() and (p_event is null or event_id = p_event)
    order by id for update skip locked limit p_limit
  loop
    if ftu_sales_private.release_order_hold(oid,true) then released := released + 1; end if;
  end loop;
  return released;
end $$;

create function public.read_sales_hold(p_user uuid, p_order uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if exists(select 1 from public.orders where id = p_order and user_id = p_user) then
    perform ftu_sales_private.release_order_hold(p_order,true);
  end if;
  select jsonb_build_object('id',o.id,'event_id',o.event_id,'status',o.status,'quantity',o.quantity,
    'total_vnd',o.total_vnd,'expires_at',o.expires_at,'server_time',clock_timestamp(),
    'items',(select jsonb_agg(jsonb_build_object('seat_id',i.seat_id,'seat_label',i.seat_label,
      'category_id',i.category_id,'category_name',i.category_name,'unit_price_vnd',i.unit_price_vnd)
      order by i.seat_label,i.id) from public.order_items i where i.order_id = o.id)) into result
  from public.orders o where o.id = p_order and o.user_id = p_user;
  if result is null then raise exception 'HOLD_NOT_FOUND'; end if;
  return result;
end $$;

create function public.reserve_sales_seats(p_user uuid, p_event uuid, p_seats uuid[], p_key uuid, p_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare eid uuid; oid uuid; old_order public.orders; seat public.event_seats; cat public.ticket_categories;
  selected uuid[]; tick timestamptz; expiry timestamptz; amount bigint; item uuid; event public.events;
begin
  if p_user is null or not exists(select 1 from auth.users where id = p_user) then raise exception 'FORBIDDEN'; end if;
  if p_key is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;
  if p_seats is null or cardinality(p_seats) not between 1 and 10 or array_position(p_seats,null) is not null
    or cardinality(p_seats) <> (select count(distinct s) from unnest(p_seats) s) then raise exception 'INVALID_SEAT_SELECTION'; end if;
  select array_agg(s order by s) into selected from unnest(p_seats) s;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_key::text,0));
  select * into old_order from public.orders where user_id = p_user and idempotency_key = p_key for update;
  if found then
    if old_order.event_id is distinct from p_event or old_order.request_hash <> p_hash
      or selected is distinct from (select array_agg(seat_id order by seat_id) from public.order_items where order_id = old_order.id)
      then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    perform ftu_sales_private.release_order_hold(old_order.id,true);
    return public.read_sales_hold(p_user,old_order.id);
  end if;
  select * into event from public.events e where e.id = p_event and e.published
    and exists(select 1 from public.contest_editions ce where ce.id = e.edition_id and ce.published)
    and exists(select 1 from public.contest_rounds r where r.id = e.round_id and r.published) for share;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if clock_timestamp() < event.sale_open_at or clock_timestamp() >= event.sale_close_at then raise exception 'SALE_CLOSED'; end if;
  -- Release expired claims touching these seats before obtaining any new order/seat locks.
  for eid in select distinct order_id from public.seat_holds
    where seat_id = any(selected) and state = 'HELD' and expires_at <= clock_timestamp() order by order_id
  loop perform ftu_sales_private.release_order_hold(eid,true); end loop;
  -- Price/category reads and seat locks share a deterministic order with release operations.
  perform id from public.event_seats where id = any(selected) order by id for update;
  if (select count(*) from public.event_seats where id = any(selected) and event_id = p_event and enabled) <> cardinality(selected)
    then raise exception 'SEAT_UNAVAILABLE'; end if;
  perform c.id from public.ticket_categories c where c.id in
    (select category_id from public.event_seats where id = any(selected)) order by c.id for share;
  if exists(select 1 from public.event_seats s join public.ticket_categories c on c.id = s.category_id
    where s.id = any(selected) and (not c.enabled or exists(select 1 from public.seat_holds h where h.seat_id = s.id and h.state in ('HELD','CONSUMED'))
      or exists(select 1 from public.tickets t where t.seat_id = s.id and t.status = 'issued'))) then raise exception 'SEAT_UNAVAILABLE'; end if;
  tick := clock_timestamp();
  if tick < event.sale_open_at or tick >= event.sale_close_at then raise exception 'SALE_CLOSED'; end if;
  select sum(c.price_vnd) into amount from public.event_seats s join public.ticket_categories c on c.id = s.category_id where s.id = any(selected);
  expiry := tick + make_interval(secs => event.hold_ttl_seconds); oid := gen_random_uuid();
  insert into public.orders(id,event_id,user_id,reference,idempotency_key,request_hash,quantity,total_vnd,created_at,expires_at)
    values(oid,p_event,p_user,'FTU'||replace(oid::text,'-',''),p_key,p_hash,cardinality(selected),amount,tick,expiry);
  foreach eid in array selected loop
    select * into seat from public.event_seats where id = eid;
    select * into cat from public.ticket_categories where id = seat.category_id;
    item := gen_random_uuid();
    insert into public.order_items(id,order_id,event_id,category_id,seat_id,unit_price_vnd,category_name,seat_label)
      values(item,oid,p_event,cat.id,seat.id,cat.price_vnd,cat.name,seat.label);
    insert into public.seat_holds(order_item_id,order_id,event_id,category_id,seat_id,expires_at)
      values(item,oid,p_event,cat.id,seat.id,expiry);
  end loop;
  insert into public.order_reservations(order_id,event_id,category_id,quantity,expires_at)
    select oid,p_event,category_id,count(*)::integer,expiry from public.order_items where order_id = oid group by category_id;
  return public.read_sales_hold(p_user,oid);
end $$;

create function public.release_sales_hold(p_user uuid, p_order uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.orders where id = p_order and user_id = p_user for update;
  if not found then raise exception 'HOLD_NOT_FOUND'; end if;
  perform ftu_sales_private.release_order_hold(p_order,false);
  return public.read_sales_hold(p_user,p_order);
end $$;

revoke all on function ftu_sales_private.release_order_hold(uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.sales_catalog(uuid,uuid,text),public.expire_sales_holds(uuid,integer),
  public.read_sales_hold(uuid,uuid),public.reserve_sales_seats(uuid,uuid,uuid[],uuid,text),public.release_sales_hold(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.sales_catalog(uuid,uuid,text),public.expire_sales_holds(uuid,integer),
  public.read_sales_hold(uuid,uuid),public.reserve_sales_seats(uuid,uuid,uuid[],uuid,text),public.release_sales_hold(uuid,uuid)
  to service_role;
commit;
