-- Restore only after reviewing settings and orders. Never discard phase-linked sales.
begin;
do $$begin
 if exists(select 1 from public.orders where sale_phase_id is not null) or exists(select 1 from public.audit_logs where action in ('save_sale_settings','save_voting_settings')) then raise exception 'ROLLBACK_REQUIRES_REVIEW';end if;
end $$;
CREATE OR REPLACE FUNCTION ftu_sales_private.guard_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.events;
begin
  if tg_op = 'INSERT' then
    select * into e from public.events where id = new.event_id for share;
    if not found or not e.published or clock_timestamp() < e.sale_open_at or clock_timestamp() >= e.sale_close_at then raise exception 'SALE_CLOSED'; end if;
    if new.status <> 'PENDING_PAYMENT' or new.expires_at <> new.created_at + make_interval(secs => e.hold_ttl_seconds) then raise exception 'INVALID_ORDER_EXPIRY'; end if;
  else
    if row(new.event_id, new.user_id, new.reference, new.idempotency_key, new.request_hash, new.quantity, new.total_vnd, new.currency, new.created_at, new.expires_at)
      is distinct from row(old.event_id, old.user_id, old.reference, old.idempotency_key, old.request_hash, old.quantity, old.total_vnd, old.currency, old.created_at, old.expires_at) then raise exception 'IMMUTABLE_ORDER'; end if;
    if new.status <> old.status and old.status <> 'PENDING_PAYMENT' then raise exception 'INVALID_ORDER_TRANSITION'; end if;
    if new.status = 'PAID' and old.status <> 'PAID' and clock_timestamp() >= new.expires_at then raise exception 'ORDER_EXPIRED'; end if;
    if new.status = 'EXPIRED' and old.status <> 'EXPIRED' and clock_timestamp() < new.expires_at then raise exception 'ORDER_NOT_EXPIRED'; end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION ftu_sales_private.guard_order_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.orders; s public.event_seats; c public.ticket_categories;
begin
  select * into o from public.orders where id = new.order_id for update;
  select * into s from public.event_seats where id = new.seat_id for update;
  select * into c from public.ticket_categories where id = new.category_id for share;
  if o.status <> 'PENDING_PAYMENT' or clock_timestamp() >= o.expires_at then raise exception 'ORDER_EXPIRED'; end if;
  if not s.enabled or not c.enabled then raise exception 'SEAT_UNAVAILABLE'; end if;
  if new.unit_price_vnd <> c.price_vnd or new.category_name <> c.name or new.seat_label <> s.label then raise exception 'PRICE_SNAPSHOT_MISMATCH'; end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.sales_catalog(p_edition uuid DEFAULT NULL::uuid, p_event uuid DEFAULT NULL::uuid, p_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.reserve_sales_seats(p_user uuid, p_event uuid, p_seats uuid[], p_key uuid, p_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION ftu_sales_private.guard_vote()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.vote_sessions; t public.tickets;
begin
  if tg_op = 'DELETE' then raise exception 'IMMUTABLE_VOTE'; end if;
  if tg_op = 'UPDATE' then
    if old.vote_format <> 'LEGACY' or new.vote_format <> 'LEGACY_CLASSIFIED'
      or row(new.id,new.edition_id,new.round_id,new.ticket_id,new.contestant_id,new.user_id,new.created_at)
        is distinct from row(old.id,old.edition_id,old.round_id,old.ticket_id,old.contestant_id,old.user_id,old.created_at) then raise exception 'IMMUTABLE_VOTE'; end if;
    if not public.has_role(new.classified_by,array['VOTE_MANAGER']) then raise exception 'FORBIDDEN'; end if;
    if exists(select 1 from public.vote_sessions where round_id = new.round_id and state = 'FINALIZED') then raise exception 'VOTING_FINALIZED'; end if;
    new.classified_at = clock_timestamp();
    insert into public.audit_logs(edition_id,actor_id,action,target_id,detail) values(new.edition_id,new.classified_by,'classify_legacy_vote',new.id,jsonb_build_object('category_id',new.category_id));
    return new;
  end if;
  if new.vote_format = 'LEGACY' then
    if exists(select 1 from public.vote_categories where round_id = new.round_id) or exists(select 1 from public.vote_sessions where round_id = new.round_id) then raise exception 'VOTING_CATEGORY_REQUIRED'; end if;
    return new;
  end if;
  if new.vote_format <> 'CATEGORY' then raise exception 'INVALID_VOTE_FORMAT'; end if;
  select * into s from public.vote_sessions where id = new.session_id for share;
  select * into t from public.tickets where id = new.ticket_id for update;
  if not found or t.user_id <> new.user_id or t.status <> 'issued' or t.round_id <> new.round_id or t.edition_id <> new.edition_id then raise exception 'TICKET_NOT_ELIGIBLE'; end if;
  if t.source<>'SUPPLEMENT' and t.event_id is null and exists(select 1 from public.events where round_id = new.round_id) then raise exception 'LEGACY_TICKET_MAPPING_REQUIRED'; end if;
  if exists(select 1 from public.votes where round_id = new.round_id and ticket_id = new.ticket_id and vote_format = 'LEGACY') then raise exception 'LEGACY_VOTE_RECONCILIATION_REQUIRED'; end if;
  if s.state <> 'OPEN' or not s.published or clock_timestamp() < s.open_at or clock_timestamp() >= s.close_at then raise exception 'VOTE_CLOSED'; end if;
  if not exists(select 1 from public.vote_eligible_contestants e join public.round_entries r on r.round_id = e.round_id and r.contestant_id = e.contestant_id join public.contestants c on c.id = e.contestant_id
    where e.session_id = new.session_id and e.category_id = new.category_id and e.round_id = new.round_id and e.contestant_id = new.contestant_id and r.eligible and c.published and c.edition_id = new.edition_id) then raise exception 'CONTESTANT_NOT_ELIGIBLE'; end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.cast_category_vote(p_user uuid, p_round uuid, p_ticket uuid, p_contestant uuid, p_category uuid, p_session uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.contest_rounds; s public.vote_sessions; t public.tickets; previous public.votes; vid uuid;
begin
  select * into r from public.contest_rounds where id=p_round for share;
  if not found or not r.published or r.kind not in ('semifinal','final') or not exists(select 1 from public.contest_editions where id=r.edition_id and published) then raise exception 'VOTE_CLOSED'; end if;
  select * into s from public.vote_sessions where id=p_session and round_id=p_round for share;
  if not found then raise exception 'VOTE_CLOSED'; end if;
  select * into t from public.tickets where id=p_ticket and round_id=p_round and user_id=p_user and status='issued' for update;
  if not found then raise exception 'TICKET_NOT_ELIGIBLE'; end if;
  select * into previous from public.votes where round_id=p_round and ticket_id=p_ticket and category_id=p_category;
  if found then
    if previous.contestant_id=p_contestant and previous.session_id=p_session then return jsonb_build_object('id',previous.id,'already_recorded',true); end if;
    raise exception 'ALREADY_VOTED';
  end if;
  -- Recheck the database clock after acquiring locks. Trigger checks category, gender and eligibility.
  if s.state<>'OPEN' or not s.published or s.open_at is null or s.close_at is null or clock_timestamp()<s.open_at or clock_timestamp()>=s.close_at then raise exception 'VOTE_CLOSED'; end if;
  insert into public.votes(edition_id,round_id,ticket_id,contestant_id,user_id,category_id,session_id,vote_format)
    values(r.edition_id,p_round,p_ticket,p_contestant,p_user,p_category,p_session,'CATEGORY') returning id into vid;
  return jsonb_build_object('id',vid,'already_recorded',false);
end $function$;

CREATE OR REPLACE FUNCTION ftu_sales_private.guard_vote_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.has_role(new.updated_by,array['VOTE_MANAGER']) then raise exception 'FORBIDDEN'; end if;
  if tg_op = 'UPDATE' then
    if old.state = 'FINALIZED' and row(new.state,new.open_at,new.close_at,new.round_id,new.edition_id,new.finalized_at) is distinct from row(old.state,old.open_at,old.close_at,old.round_id,old.edition_id,old.finalized_at) then raise exception 'VOTING_FINALIZED'; end if;
    if new.round_id <> old.round_id or new.edition_id <> old.edition_id then raise exception 'IMMUTABLE_SESSION_SCOPE'; end if;
    if new.state <> old.state and not (
      (old.state = 'DRAFT' and new.state in ('SCHEDULED','OPEN'))
      or (old.state = 'SCHEDULED' and new.state in ('OPEN','CLOSED'))
      or (old.state = 'OPEN' and new.state = 'CLOSED')
      or (old.state = 'CLOSED' and new.state in ('OPEN','FINALIZED'))
    ) then raise exception 'INVALID_SESSION_TRANSITION'; end if;
    if old.state in ('OPEN','CLOSED') and row(new.open_at,new.close_at) is distinct from row(old.open_at,old.close_at) and not (old.state = 'CLOSED' and new.state = 'OPEN') then raise exception 'VOTING_HAS_STARTED'; end if;
    if old.state = 'CLOSED' and new.state = 'OPEN' then
      if new.reopen_approved_by is distinct from new.updated_by or not public.has_role(new.updated_by,array['SUPER_ADMIN']) or nullif(trim(new.reopen_reason),'') is null then raise exception 'REOPEN_APPROVAL_REQUIRED'; end if;
      insert into public.vote_incident_logs(session_id,actor_id,action,reason) values(new.id,new.reopen_approved_by,'reopen',new.reopen_reason);
    end if;
  elsif new.state <> 'DRAFT' then raise exception 'INVALID_SESSION_TRANSITION'; end if;
  if new.state = 'OPEN' then
    if not new.published or new.open_at is null or clock_timestamp() < new.open_at or clock_timestamp() >= new.close_at then raise exception 'INVALID_VOTE_WINDOW'; end if;
    if not exists(select 1 from public.contest_rounds r join public.contest_editions e on e.id = r.edition_id where r.id = new.round_id and r.published and e.published)
      or not exists(select 1 from public.vote_categories where round_id = new.round_id)
      or exists(select 1 from public.vote_categories c where c.round_id = new.round_id and not exists(
        select 1 from public.vote_eligible_contestants v join public.round_entries r on r.round_id = v.round_id and r.contestant_id = v.contestant_id join public.contestants p on p.id = v.contestant_id
        where v.session_id = new.id and v.category_id = c.id and r.eligible and p.published
      )) then raise exception 'VOTING_NOT_CONFIGURED'; end if;
  end if;
  if new.state = 'FINALIZED' and exists(select 1 from public.votes where round_id = new.round_id and vote_format = 'LEGACY') then raise exception 'LEGACY_VOTE_RECONCILIATION_REQUIRED'; end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION ftu_sales_private.guard_vote_configuration()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform 1 from public.vote_sessions where round_id = any(array[new.round_id,old.round_id]) order by id for update;
  if exists(select 1 from public.vote_sessions where round_id = any(array[new.round_id,old.round_id]) and state in ('OPEN','CLOSED','FINALIZED')) then raise exception 'VOTING_HAS_STARTED'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_save(p_actor uuid, p_aal text, p_table text, p_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare required_role text;cols text='';vals text='';updates text='';k text;result jsonb;allowed text[];
begin
 case p_table
 when 'contest_editions' then required_role='CONTENT_EDITOR';allowed=array['slug','title','theme','year','registration_open_at','registration_close_at','published'];
 when 'contest_rounds' then required_role='VOTE_MANAGER';allowed=array['edition_id','title','kind','position','cutoff','published','vote_open_at','vote_close_at'];
 when 'timeline_events' then required_role='CONTENT_EDITOR';allowed=array['edition_id','title','description','position','starts_at','ends_at','published'];
 when 'sponsors' then required_role='CONTENT_EDITOR';allowed=array['edition_id','name','tier','url','logo_url','published'];
 else raise exception 'FORBIDDEN';end case;
 if p_aal<>'aal2' or not public.has_role(p_actor,array[required_role]) then raise exception 'FORBIDDEN';end if;
 if p_table='contest_rounds' then
  perform 1 from public.contest_rounds where id=p_id for update;
  if exists(select 1 from public.votes where round_id=p_id) and exists(select 1 from public.contest_rounds r where r.id=p_id and (r.vote_open_at is distinct from (p_data->>'vote_open_at')::timestamptz or r.vote_close_at is distinct from (p_data->>'vote_close_at')::timestamptz)) then raise exception 'VOTING_HAS_STARTED';end if;
 end if;
 for k in select jsonb_object_keys(p_data) loop
  if not k=any(allowed) then raise exception 'FORBIDDEN';end if;
  cols=cols||','||quote_ident(k);vals=vals||format(',(jsonb_populate_record(null::public.%I,$2)).%I',p_table,k);updates=updates||case when updates='' then '' else ',' end||format('%I=excluded.%I',k,k);
 end loop;
 if cols='' then raise exception 'INVALID_DATA';end if;
 execute format('insert into public.%I(id%s) select $1%s on conflict(id) do update set %s returning to_jsonb(%I.*)',p_table,cols,vals,updates,p_table) into result using p_id,p_data;
 insert into public.audit_logs(edition_id,actor_id,action,target_id,detail) values(case when p_table='contest_editions' then p_id else (p_data->>'edition_id')::uuid end,p_actor,'save_'||p_table,p_id,jsonb_build_object('fields',to_jsonb(allowed)));
 return result;
end$function$;
drop function public.reserve_sales_seats(uuid,uuid,uuid[],uuid,text,text);
drop function public.save_sale_settings(uuid,text,uuid,bigint,jsonb);
drop function public.save_voting_settings(uuid,text,uuid,timestamptz,timestamptz,text);
drop function public.admin_event_settings(uuid,text);
drop function public.bootstrap_admin_role(uuid);
drop function ftu_sales_private.effective_vote_state(public.vote_sessions);
drop trigger category_price_revision on public.ticket_categories;
alter table public.orders drop column sale_phase_id;
drop table public.ticket_phase_prices;
drop table public.ticket_sale_phases;
drop function ftu_sales_private.price_revision();
drop function ftu_sales_private.validate_sale_phases();
alter table public.events drop column sales_revision;
grant execute on function public.open_voting(uuid,text,uuid),public.open_gender_voting(uuid,text,uuid) to service_role;

CREATE OR REPLACE FUNCTION public.manage_purchase_voting(p_actor uuid, p_aal text, p_session uuid, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.vote_sessions; result jsonb;
begin
  if p_aal<>'aal2' or not public.has_role(p_actor,array['VOTE_MANAGER']) then raise exception 'FORBIDDEN'; end if;
  select * into s from public.vote_sessions where id=p_session for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_action='close' and s.state='OPEN' then
    update public.vote_sessions set state='CLOSED',updated_by=p_actor where id=s.id;
  elsif p_action='reopen' and s.state='CLOSED' then
    if not public.has_role(p_actor,array['SUPER_ADMIN']) or nullif(trim(p_reason),'') is null then raise exception 'REOPEN_APPROVAL_REQUIRED'; end if;
    update public.vote_sessions set state='OPEN',open_at=clock_timestamp(),close_at=clock_timestamp()+interval '10 minutes',updated_by=p_actor,reopen_approved_by=p_actor,reopen_reason=p_reason where id=s.id;
  elsif p_action='finalize' and s.state='CLOSED' then
    update public.vote_sessions set state='FINALIZED',finalized_at=clock_timestamp(),updated_by=p_actor where id=s.id;
    insert into public.vote_result_snapshots(session_id,round_id,category_id,results,created_by)
      select s.id,s.round_id,c.id,coalesce((select jsonb_agg(jsonb_build_object('contestant_id',e.contestant_id,'votes',
        (select count(*) from public.votes v where v.round_id=s.round_id and v.category_id=c.id and v.contestant_id=e.contestant_id)) order by e.contestant_id)
        from public.vote_eligible_contestants e where e.session_id=s.id and e.category_id=c.id),'[]'::jsonb),p_actor
      from public.vote_categories c where c.round_id=s.round_id;
  elsif p_action='publish' and s.state='FINALIZED' then
    update public.vote_sessions set results_published=true,updated_by=p_actor where id=s.id;
  else raise exception 'INVALID_SESSION_TRANSITION'; end if;
  insert into public.audit_logs(edition_id,actor_id,action,target_id) values(s.edition_id,p_actor,'vote_'||p_action,s.id);
  return jsonb_build_object('id',s.id,'action',p_action);
end $function$;
commit;
