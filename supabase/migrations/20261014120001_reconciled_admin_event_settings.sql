-- Configurable voting windows and price snapshots. Only the trusted API can mutate settings.
-- The Supabase migration runner owns the transaction and migration history.

-- Requires the fetched supplement_purchases baseline; preserves its ticket eligibility.
alter table public.events add column sales_revision bigint not null default 0 check (sales_revision>=0);
create table public.ticket_sale_phases (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events,
 kind text not null check(kind in ('EARLY','REGULAR')), enabled boolean not null default true,
 open_at timestamptz not null, close_at timestamptz not null,
 unique(event_id,kind), unique(id,event_id), check(close_at>open_at)
);
create table public.ticket_phase_prices (
 phase_id uuid not null, event_id uuid not null, category_id uuid not null,
 price_vnd bigint not null check(price_vnd between 0 and 9007199254740991),
 primary key(phase_id,category_id),
 foreign key(phase_id,event_id) references public.ticket_sale_phases(id,event_id),
 foreign key(category_id,event_id) references public.ticket_categories(id,event_id)
);
create index ticket_phase_prices_category on public.ticket_phase_prices(category_id);
alter table public.orders add column sale_phase_id uuid references public.ticket_sale_phases;
create index orders_sale_phase on public.orders(sale_phase_id);
alter table public.ticket_sale_phases enable row level security;
alter table public.ticket_phase_prices enable row level security;
revoke all on public.ticket_sale_phases,public.ticket_phase_prices from public,anon,authenticated;
grant select,insert,update,delete on public.ticket_sale_phases,public.ticket_phase_prices to service_role;

-- Existing sale windows become a regular phase, preserving all existing prices.
insert into public.ticket_sale_phases(event_id,kind,open_at,close_at)
 select id,'REGULAR',sale_open_at,sale_close_at from public.events where sale_open_at is not null;
insert into public.ticket_phase_prices(phase_id,event_id,category_id,price_vnd)
 select p.id,p.event_id,c.id,c.price_vnd from public.ticket_sale_phases p join public.ticket_categories c on c.event_id=p.event_id;

create function ftu_sales_private.price_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.events set sales_revision=sales_revision+1 where id=coalesce(new.event_id,old.event_id);
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger phase_revision after insert or update or delete on public.ticket_sale_phases for each row execute function ftu_sales_private.price_revision();
create trigger phase_price_revision after insert or update or delete on public.ticket_phase_prices for each row execute function ftu_sales_private.price_revision();
create trigger category_price_revision after update of price_vnd on public.ticket_categories for each row execute function ftu_sales_private.price_revision();

create function ftu_sales_private.validate_sale_phases() returns trigger language plpgsql security definer set search_path='' as $$
declare eid uuid;
begin
 eid=coalesce(new.event_id,old.event_id);
 perform 1 from public.events where id=eid for update;
 if exists(select 1 from public.ticket_sale_phases a join public.ticket_sale_phases b on a.event_id=b.event_id and a.kind='EARLY' and b.kind='REGULAR'
  where a.event_id=eid and a.enabled and b.enabled and a.close_at>b.open_at) then raise exception 'SALE_PHASE_OVERLAP';end if;
 if exists(select 1 from public.ticket_sale_phases p where p.event_id=eid and p.enabled and
   (select count(*) from public.ticket_phase_prices pr join public.ticket_categories c on c.id=pr.category_id where pr.phase_id=p.id and c.enabled)<>2)
  or (exists(select 1 from public.ticket_sale_phases where event_id=eid and enabled) and not exists(select 1 from public.ticket_sale_phases where event_id=eid and enabled and kind='REGULAR'))
 then raise exception 'SALE_PHASE_NOT_CONFIGURED';end if;
 return null;
end $$;
create constraint trigger phase_settings_valid after insert or update or delete on public.ticket_sale_phases deferrable initially deferred for each row execute function ftu_sales_private.validate_sale_phases();
create constraint trigger phase_prices_valid after insert or update or delete on public.ticket_phase_prices deferrable initially deferred for each row execute function ftu_sales_private.validate_sale_phases();

create function public.save_sale_settings(p_actor uuid,p_aal text,p_event uuid,p_revision bigint,p_phases jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events;phase jsonb;pr jsonb;pid uuid;prior jsonb;seen text[]='{}';
begin
 if p_aal is distinct from 'aal2' or not public.has_role(p_actor,array['SUPER_ADMIN']) then raise exception 'FORBIDDEN';end if;
 select * into e from public.events where id=p_event for update;
 if not found then raise exception 'NOT_FOUND';end if;
 if e.sales_revision is distinct from p_revision then raise exception 'SETTINGS_CHANGED';end if;
 if jsonb_typeof(p_phases)<>'array' or jsonb_array_length(p_phases) not between 1 and 2 then raise exception 'INVALID_DATA';end if;
 select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('prices',(select jsonb_agg(to_jsonb(price_row)) from public.ticket_phase_prices price_row where price_row.phase_id=p.id))),'[]') into prior from public.ticket_sale_phases p where p.event_id=p_event;
 update public.ticket_sale_phases set enabled=false where event_id=p_event;
 for phase in select value from jsonb_array_elements(p_phases) loop
  if phase->>'kind' not in ('EARLY','REGULAR') or phase->>'kind'=any(seen) or (phase->>'close_at')::timestamptz<=(phase->>'open_at')::timestamptz then raise exception 'INVALID_DATA';end if;
  seen=array_append(seen,phase->>'kind');
  if jsonb_array_length(phase->'prices')<>2 or (select count(distinct x->>'category_id') from jsonb_array_elements(phase->'prices') x)<>2 then raise exception 'SALE_PHASE_NOT_CONFIGURED';end if;
  insert into public.ticket_sale_phases(event_id,kind,open_at,close_at,enabled) values(p_event,phase->>'kind',(phase->>'open_at')::timestamptz,(phase->>'close_at')::timestamptz,true)
   on conflict(event_id,kind) do update set open_at=excluded.open_at,close_at=excluded.close_at,enabled=true returning id into pid;
  for pr in select value from jsonb_array_elements(phase->'prices') loop
   if not exists(select 1 from public.ticket_categories where id=(pr->>'category_id')::uuid and event_id=p_event and enabled) then raise exception 'SALE_PHASE_NOT_CONFIGURED';end if;
   insert into public.ticket_phase_prices(phase_id,event_id,category_id,price_vnd) values(pid,p_event,(pr->>'category_id')::uuid,(pr->>'price_vnd')::bigint)
    on conflict(phase_id,category_id) do update set price_vnd=excluded.price_vnd;
  end loop;
 end loop;
 if not 'REGULAR'=any(seen) then raise exception 'SALE_PHASE_NOT_CONFIGURED';end if;
 update public.events set sale_open_at=(select min(open_at) from public.ticket_sale_phases where event_id=p_event and enabled),sale_close_at=(select max(close_at) from public.ticket_sale_phases where event_id=p_event and enabled),sales_revision=sales_revision+1 where id=p_event;
 insert into public.audit_logs(edition_id,actor_id,action,target_id,detail) values(e.edition_id,p_actor,'save_sale_settings',p_event,jsonb_build_object('before',prior,'after',p_phases));
 return jsonb_build_object('saved',true,'revision',(select sales_revision from public.events where id=p_event));
end $$;

create function ftu_sales_private.effective_vote_state(p public.vote_sessions) returns text language sql volatile set search_path='' as $$
 select case when p.state in ('SCHEDULED','OPEN') and p.published then
  case when clock_timestamp()<p.open_at then 'SCHEDULED' when clock_timestamp()<p.close_at then 'OPEN' else 'CLOSED' end
 else p.state end
$$;

create function public.save_voting_settings(p_actor uuid,p_aal text,p_round uuid,p_open timestamptz,p_close timestamptz,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.contest_rounds;s public.vote_sessions;prior jsonb;tick timestamptz=clock_timestamp();started boolean;
begin
 if p_aal is distinct from 'aal2' or not public.has_role(p_actor,array['SUPER_ADMIN']) then raise exception 'FORBIDDEN';end if;
 select * into r from public.contest_rounds where id=p_round for update;
 if not found then raise exception 'NOT_FOUND';end if;
 if r.kind not in ('semifinal','final') or not r.published or not exists(select 1 from public.contest_editions where id=r.edition_id and published) then raise exception 'VOTING_NOT_CONFIGURED';end if;
 if p_open is null or p_close is null or p_close<=p_open then raise exception 'INVALID_VOTE_WINDOW';end if;
 select * into s from public.vote_sessions where round_id=p_round order by open_at desc nulls last,id limit 1 for update;
 tick=clock_timestamp();
 prior=jsonb_build_object('open_at',r.vote_open_at,'close_at',r.vote_close_at,'session',to_jsonb(s));
 if s.id is not null and (s.state in ('CLOSED','FINALIZED') or (s.open_at is not null and s.close_at<=tick)) then raise exception 'VOTE_ALREADY_CLOSED';end if;
 started=(s.id is not null and s.open_at<=tick) or exists(select 1 from public.votes where round_id=p_round);
 if started then
  if p_open is distinct from s.open_at or nullif(trim(p_reason),'') is null then raise exception 'VOTE_REASON_REQUIRED';end if;
  if p_close<=tick then p_close=tick;end if;
 else
  if p_open<tick-interval '5 seconds' or p_close<=tick then raise exception 'INVALID_VOTE_WINDOW';end if;
  if (select count(*) from public.vote_categories where round_id=p_round and gender in ('male','female'))<>2 then raise exception 'VOTING_NOT_CONFIGURED';end if;
  if s.id is null then
   insert into public.vote_sessions(edition_id,round_id,title,updated_by) values(r.edition_id,p_round,r.title,p_actor) returning * into s;
  end if;
  delete from public.vote_eligible_contestants where session_id=s.id;
  insert into public.vote_eligible_contestants(session_id,category_id,round_id,contestant_id)
   select s.id,c.id,p_round,p.id from public.vote_categories c join public.contestants p on p.edition_id=r.edition_id and p.gender=c.gender and p.published
    join public.round_entries en on en.round_id=p_round and en.contestant_id=p.id and en.eligible where c.round_id=p_round;
 end if;
 update public.vote_sessions set open_at=p_open,close_at=p_close,duration_seconds=greatest(1,ceil(extract(epoch from p_close-p_open))::int),published=true,updated_by=p_actor,reopen_reason=p_reason,
  state=case when p_close<=tick then 'CLOSED' when p_open>tick then 'SCHEDULED' else 'OPEN' end where id=s.id;
 update public.contest_rounds set vote_open_at=p_open,vote_close_at=p_close where id=p_round;
 insert into public.audit_logs(edition_id,actor_id,action,target_id,detail) values(r.edition_id,p_actor,'save_voting_settings',p_round,jsonb_build_object('before',prior,'after',jsonb_build_object('open_at',p_open,'close_at',p_close),'reason',p_reason));
 if started then insert into public.vote_incident_logs(session_id,actor_id,action,reason) values(s.id,p_actor,'change_close_time',p_reason);end if;
 return jsonb_build_object('saved',true,'session_id',s.id,'open_at',p_open,'close_at',p_close);
end $$;

create function public.admin_event_settings(p_actor uuid,p_aal text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_aal is distinct from 'aal2' or not public.has_role(p_actor,array['SUPER_ADMIN']) then raise exception 'FORBIDDEN';end if;
 return jsonb_build_object('server_time',clock_timestamp(),
  'editions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'year',year) order by year desc),'[]') from public.contest_editions),
  'rounds',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('session_state',(select ftu_sales_private.effective_vote_state(s) from public.vote_sessions s where s.round_id=r.id order by s.open_at desc nulls last,s.id limit 1)) order by r.position),'[]') from public.contest_rounds r where r.kind in ('semifinal','final')),
  'events',(select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object(
   'categories',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'position',position,'price_vnd',price_vnd) order by position),'[]') from public.ticket_categories where event_id=e.id and enabled),
   'phases',(select coalesce(jsonb_agg(jsonb_build_object('kind',p.kind,'open_at',p.open_at,'close_at',p.close_at,'prices',(select jsonb_agg(jsonb_build_object('category_id',category_id,'price_vnd',price_vnd)) from public.ticket_phase_prices where phase_id=p.id)) order by p.open_at),'[]') from public.ticket_sale_phases p where p.event_id=e.id and p.enabled)
  ) order by e.starts_at),'[]') from public.events e));
end $$;

revoke all on function public.save_sale_settings(uuid,text,uuid,bigint,jsonb),public.save_voting_settings(uuid,text,uuid,timestamptz,timestamptz,text),public.admin_event_settings(uuid,text) from public,anon,authenticated;
grant execute on function public.save_sale_settings(uuid,text,uuid,bigint,jsonb),public.save_voting_settings(uuid,text,uuid,timestamptz,timestamptz,text),public.admin_event_settings(uuid,text) to service_role;
revoke all on function ftu_sales_private.price_revision(),ftu_sales_private.validate_sale_phases(),ftu_sales_private.effective_vote_state(public.vote_sessions) from public,anon,authenticated,service_role;



create or replace function ftu_sales_private.guard_order() returns trigger language plpgsql security definer set search_path = '' as $$
declare e public.events;
begin
  if tg_op = 'INSERT' then
    select * into e from public.events where id = new.event_id for share;
    if not found or not e.published or clock_timestamp() < e.sale_open_at or clock_timestamp() >= e.sale_close_at then raise exception 'SALE_CLOSED'; end if;
    if new.status <> 'PENDING_PAYMENT' or new.expires_at <> new.created_at + make_interval(secs => e.hold_ttl_seconds) then raise exception 'INVALID_ORDER_EXPIRY'; end if;
    if exists(select 1 from public.ticket_sale_phases where event_id=new.event_id and enabled) and not exists(select 1 from public.ticket_sale_phases where id=new.sale_phase_id and event_id=new.event_id and enabled and new.created_at>=open_at and new.created_at<close_at) then raise exception 'SALE_CLOSED';end if;
  else
    if row(new.sale_phase_id, new.event_id, new.user_id, new.reference, new.idempotency_key, new.request_hash, new.quantity, new.total_vnd, new.currency, new.created_at, new.expires_at)
      is distinct from row(old.sale_phase_id, old.event_id, old.user_id, old.reference, old.idempotency_key, old.request_hash, old.quantity, old.total_vnd, old.currency, old.created_at, old.expires_at) then raise exception 'IMMUTABLE_ORDER'; end if;
    if new.status <> old.status and old.status <> 'PENDING_PAYMENT' then raise exception 'INVALID_ORDER_TRANSITION'; end if;
    if new.status = 'PAID' and old.status <> 'PAID' and clock_timestamp() >= new.expires_at then raise exception 'ORDER_EXPIRED'; end if;
    if new.status = 'EXPIRED' and old.status <> 'EXPIRED' and clock_timestamp() < new.expires_at then raise exception 'ORDER_NOT_EXPIRED'; end if;
  end if;
  return new;
end $$;

create or replace function ftu_sales_private.guard_order_item() returns trigger language plpgsql security definer set search_path = '' as $$
declare o public.orders; s public.event_seats; c public.ticket_categories;
begin
  select * into o from public.orders where id = new.order_id for update;
  select * into s from public.event_seats where id = new.seat_id for update;
  select * into c from public.ticket_categories where id = new.category_id for share;
  if o.status <> 'PENDING_PAYMENT' or clock_timestamp() >= o.expires_at then raise exception 'ORDER_EXPIRED'; end if;
  if not s.enabled or not c.enabled then raise exception 'SEAT_UNAVAILABLE'; end if;
  if new.unit_price_vnd is distinct from (case when o.sale_phase_id is null then c.price_vnd else (select price_vnd from public.ticket_phase_prices where phase_id=o.sale_phase_id and category_id=new.category_id) end) or new.category_name <> c.name or new.seat_label <> s.label then raise exception 'PRICE_SNAPSHOT_MISMATCH'; end if;
  return new;
end $$;

create or replace function public.sales_catalog(p_edition uuid default null, p_event uuid default null, p_slug text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare edition uuid; tick timestamptz := clock_timestamp(); result jsonb;
begin
  select id into edition from public.contest_editions
  where published and (p_edition is null or id = p_edition)
  order by year desc,created_at desc,id limit 1;
  select coalesce(jsonb_agg(data order by starts_at,id),'[]'::jsonb) into result from (
    select e.id,e.starts_at,jsonb_build_object(
      'id',e.id,'edition_id',e.edition_id,'round_id',e.round_id,'slug',e.slug,'title',e.title,
      'venue',e.venue,'starts_at',e.starts_at,'sale_open_at',coalesce(phase.open_at,e.sale_open_at),'sale_close_at',coalesce(phase.close_at,e.sale_close_at),
      'phases',(select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'open_at',open_at,'close_at',close_at) order by open_at),'[]') from public.ticket_sale_phases where event_id=e.id and enabled),
      'active_phase',case when tick>=phase.open_at and tick<phase.close_at then phase.kind else null end,
      'pricing_version',case when tick>=phase.open_at and tick<phase.close_at then phase.id::text||':'||e.sales_revision::text else null end,
      'hold_ttl_seconds',e.hold_ttl_seconds,'max_tickets',10,
      'sale_state',case when phase.id is not null and tick<phase.open_at then 'UPCOMING'
        when phase.id is not null and tick>=phase.close_at then 'CLOSED'
        when phase.id is null and tick < e.sale_open_at then 'UPCOMING'
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
    left join lateral (select * from public.ticket_sale_phases p where p.event_id=e.id and p.enabled order by
      case when tick>=p.open_at and tick<p.close_at then 0 when tick<p.open_at then 1 else 2 end,
      case when tick<p.open_at then p.open_at end asc,p.open_at desc limit 1) phase on true
    cross join lateral (
      select coalesce(sum(i.available),0)::integer as available,
        coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'position',c.position,
          'price_vnd',coalesce((select price_vnd from public.ticket_phase_prices where phase_id=phase.id and category_id=c.id),c.price_vnd),'capacity',i.capacity,'held',i.held,'sold',i.sold,'available',i.available)
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

create or replace function public.reserve_sales_seats(p_user uuid, p_event uuid, p_seats uuid[], p_key uuid, p_hash text,p_quote text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare eid uuid; oid uuid; old_order public.orders; seat public.event_seats; cat public.ticket_categories;
  selected uuid[]; tick timestamptz; expiry timestamptz; amount bigint; item uuid; event public.events; phase public.ticket_sale_phases;
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
  select * into phase from public.ticket_sale_phases where event_id=p_event and enabled and tick>=open_at and tick<close_at for share;
  if exists(select 1 from public.ticket_sale_phases where event_id=p_event and enabled) then
    if phase.id is null then raise exception 'SALE_CLOSED';end if;
    if p_quote is distinct from phase.id::text||':'||event.sales_revision::text then raise exception 'PRICE_CHANGED';end if;
  end if;
  select sum(case when phase.id is null then c.price_vnd else (select price_vnd from public.ticket_phase_prices where phase_id=phase.id and category_id=c.id) end) into amount from public.event_seats s join public.ticket_categories c on c.id = s.category_id where s.id = any(selected);
  expiry := tick + make_interval(secs => event.hold_ttl_seconds); oid := gen_random_uuid();
  insert into public.orders(id,event_id,user_id,reference,idempotency_key,request_hash,quantity,total_vnd,created_at,expires_at,sale_phase_id)
    values(oid,p_event,p_user,'FTU'||replace(oid::text,'-',''),p_key,p_hash,cardinality(selected),amount,tick,expiry,phase.id);
  foreach eid in array selected loop
    select * into seat from public.event_seats where id = eid;
    select * into cat from public.ticket_categories where id = seat.category_id;
    if phase.id is not null then select price_vnd into cat.price_vnd from public.ticket_phase_prices where phase_id=phase.id and category_id=cat.id;end if;
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

create or replace function public.reserve_sales_seats(p_user uuid,p_event uuid,p_seats uuid[],p_key uuid,p_hash text)
returns jsonb language sql security definer set search_path='' as $$
 select public.reserve_sales_seats(p_user,p_event,p_seats,p_key,p_hash,null::text)
$$;
revoke all on function public.reserve_sales_seats(uuid,uuid,uuid[],uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_sales_seats(uuid,uuid,uuid[],uuid,text,text) to service_role;

create or replace function ftu_sales_private.guard_vote() returns trigger language plpgsql security definer set search_path = '' as $$
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
  if s.state not in ('OPEN','SCHEDULED') or not s.published or clock_timestamp() < s.open_at or clock_timestamp() >= s.close_at then raise exception 'VOTE_CLOSED'; end if;
  if not exists(select 1 from public.vote_eligible_contestants e join public.round_entries r on r.round_id = e.round_id and r.contestant_id = e.contestant_id join public.contestants c on c.id = e.contestant_id
    where e.session_id = new.session_id and e.category_id = new.category_id and e.round_id = new.round_id and e.contestant_id = new.contestant_id and r.eligible and c.published and c.edition_id = new.edition_id) then raise exception 'CONTESTANT_NOT_ELIGIBLE'; end if;
  return new;
end $$;

create or replace function public.cast_category_vote(p_user uuid,p_round uuid,p_ticket uuid,p_contestant uuid,p_category uuid,p_session uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
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
  if s.state not in ('OPEN','SCHEDULED') or not s.published or s.open_at is null or s.close_at is null or clock_timestamp()<s.open_at or clock_timestamp()>=s.close_at then raise exception 'VOTE_CLOSED'; end if;
  insert into public.votes(edition_id,round_id,ticket_id,contestant_id,user_id,category_id,session_id,vote_format)
    values(r.edition_id,p_round,p_ticket,p_contestant,p_user,p_category,p_session,'CATEGORY') returning id into vid;
  return jsonb_build_object('id',vid,'already_recorded',false);
end $$;

create or replace function ftu_sales_private.guard_vote_session() returns trigger language plpgsql security definer set search_path = '' as $$
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
    if old.state in ('SCHEDULED','OPEN') and old.open_at<=clock_timestamp() and row(new.open_at,new.close_at) is distinct from row(old.open_at,old.close_at) then
      if old.close_at<=clock_timestamp() then raise exception 'VOTE_ALREADY_CLOSED';end if;
      if new.open_at is distinct from old.open_at or not public.has_role(new.updated_by,array['SUPER_ADMIN']) or nullif(trim(new.reopen_reason),'') is null then raise exception 'VOTE_REASON_REQUIRED';end if;
    end if;
    if old.state='CLOSED' and row(new.open_at,new.close_at) is distinct from row(old.open_at,old.close_at) and new.state<>'OPEN' then raise exception 'VOTING_HAS_STARTED';end if;
    if old.state = 'CLOSED' and new.state = 'OPEN' then
      if new.reopen_approved_by is distinct from new.updated_by or not public.has_role(new.updated_by,array['SUPER_ADMIN']) or nullif(trim(new.reopen_reason),'') is null then raise exception 'REOPEN_APPROVAL_REQUIRED'; end if;
      insert into public.vote_incident_logs(session_id,actor_id,action,reason) values(new.id,new.reopen_approved_by,'reopen',new.reopen_reason);
    end if;
  elsif new.state <> 'DRAFT' then raise exception 'INVALID_SESSION_TRANSITION'; end if;
  if new.state in ('OPEN','SCHEDULED') then
    if not new.published or new.open_at is null or (new.state='OPEN' and clock_timestamp() < new.open_at) or clock_timestamp() >= new.close_at then raise exception 'INVALID_VOTE_WINDOW'; end if;
    if not exists(select 1 from public.contest_rounds r join public.contest_editions e on e.id = r.edition_id where r.id = new.round_id and r.published and e.published)
      or not exists(select 1 from public.vote_categories where round_id = new.round_id)
      or exists(select 1 from public.vote_categories c where c.round_id = new.round_id and not exists(
        select 1 from public.vote_eligible_contestants v join public.round_entries r on r.round_id = v.round_id and r.contestant_id = v.contestant_id join public.contestants p on p.id = v.contestant_id
        where v.session_id = new.id and v.category_id = c.id and r.eligible and p.published
      )) then raise exception 'VOTING_NOT_CONFIGURED'; end if;
  end if;
  if new.state = 'FINALIZED' and exists(select 1 from public.votes where round_id = new.round_id and vote_format = 'LEGACY') then raise exception 'LEGACY_VOTE_RECONCILIATION_REQUIRED'; end if;
  return new;
end $$;

create or replace function ftu_sales_private.guard_vote_configuration() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.vote_sessions where round_id = any(array[new.round_id,old.round_id]) order by id for update;
  if exists(select 1 from public.vote_sessions where round_id = any(array[new.round_id,old.round_id]) and (state in ('OPEN','CLOSED','FINALIZED') or (state='SCHEDULED' and open_at<=clock_timestamp()))) then raise exception 'VOTING_HAS_STARTED'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create or replace function public.admin_save(p_actor uuid,p_aal text,p_table text,p_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  if exists(select 1 from public.contest_rounds where id=p_id and (vote_open_at is distinct from (p_data->>'vote_open_at')::timestamptz or vote_close_at is distinct from (p_data->>'vote_close_at')::timestamptz))
    or (not exists(select 1 from public.contest_rounds where id=p_id) and ((p_data->>'vote_open_at') is not null or (p_data->>'vote_close_at') is not null)) then raise exception 'VOTE_SETTINGS_REQUIRED';end if;
 end if;
 for k in select jsonb_object_keys(p_data) loop
  if not k=any(allowed) then raise exception 'FORBIDDEN';end if;
  cols=cols||','||quote_ident(k);vals=vals||format(',(jsonb_populate_record(null::public.%I,$2)).%I',p_table,k);updates=updates||case when updates='' then '' else ',' end||format('%I=excluded.%I',k,k);
 end loop;
 if cols='' then raise exception 'INVALID_DATA';end if;
 execute format('insert into public.%I(id%s) select $1%s on conflict(id) do update set %s returning to_jsonb(%I.*)',p_table,cols,vals,updates,p_table) into result using p_id,p_data;
 insert into public.audit_logs(edition_id,actor_id,action,target_id,detail) values(case when p_table='contest_editions' then p_id else (p_data->>'edition_id')::uuid end,p_actor,'save_'||p_table,p_id,jsonb_build_object('fields',to_jsonb(allowed)));
 return result;
end$$;

revoke execute on function public.open_voting(uuid,text,uuid),public.open_gender_voting(uuid,text,uuid) from service_role;

-- Used only by the explicit server-side bootstrap script, after Google verification.
create function public.bootstrap_admin_role(p_user uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null)
  or not exists(select 1 from auth.identities where user_id=p_user and provider='google') then raise exception 'ADMIN_EMAIL_NOT_VERIFIED';end if;
 if exists(select 1 from public.user_roles where user_id=p_user and role='SUPER_ADMIN') then return false;end if;
 insert into public.user_roles(user_id,role) values(p_user,'SUPER_ADMIN');
 insert into public.audit_logs(actor_id,action,target_id,detail) values(p_user,'bootstrap_admin',p_user,'{}');
 return true;
end $$;
revoke all on function public.bootstrap_admin_role(uuid) from public,anon,authenticated;
grant execute on function public.bootstrap_admin_role(uuid) to service_role;

update public.contest_editions set title=regexp_replace(title,'ftucharm','FTUCHARM','gi') where title~*'ftucharm';
update public.contest_rounds set title=regexp_replace(title,'ftucharm','FTUCHARM','gi') where title~*'ftucharm';
update public.events set title=regexp_replace(title,'ftucharm','FTUCHARM','gi') where title~*'ftucharm';

-- Legacy purchase vote controls share the new scheduling rules.
create or replace function public.manage_purchase_voting(p_actor uuid,p_aal text,p_session uuid,p_action text,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.vote_sessions; result jsonb;
begin
  if p_aal<>'aal2' or not public.has_role(p_actor,array['VOTE_MANAGER']) then raise exception 'FORBIDDEN'; end if;
  select * into s from public.vote_sessions where id=p_session;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_action='reopen' then raise exception 'VOTE_ALREADY_CLOSED'; end if;
  if p_action='close' then
    return public.save_voting_settings(p_actor,p_aal,s.round_id,s.open_at,clock_timestamp(),p_reason);
  end if;
  select * into s from public.vote_sessions where id=p_session for update;
  if p_action='finalize' and s.state='CLOSED' then
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
end $$;
