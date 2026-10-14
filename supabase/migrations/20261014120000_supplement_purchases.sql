begin;
-- Additive supplement model. Old seats/orders/payments remain untouched for historical data.
create table public.purchase_offers (
  id uuid primary key default gen_random_uuid(), edition_id uuid not null,
  round_id uuid not null, slug text not null unique check(slug ~ '^[a-z0-9-]{1,100}$'),
  title text not null check(length(title) between 1 and 160), venue text not null default '',
  starts_at timestamptz, published boolean not null default false,
  mode text not null default 'DEMO' check(mode in ('DEMO','LIVE')),
  payment_instructions text not null default '' check(length(payment_instructions)<=2000),
  qr_path text check(qr_path ~ '^/images/[a-zA-Z0-9_/-]+\.(png|webp|jpg)$'),
  unique(id,edition_id,round_id),
  foreign key(edition_id,round_id) references public.contest_rounds(edition_id,id),
  check(not published or mode='DEMO' or (qr_path is not null and length(trim(payment_instructions))>0))
);
create index purchase_offers_round on public.purchase_offers(round_id);
create index purchase_offers_edition on public.purchase_offers(edition_id);
create table public.purchase_products (
  id uuid primary key default gen_random_uuid(), offer_id uuid not null references public.purchase_offers,
  name text not null check(length(name) between 1 and 160), tier text not null check(tier in ('EARLY','NORMAL')),
  quota integer not null check(quota>=0), price_vnd integer not null check(price_vnd>0),
  sold_quantity integer not null default 0 check(sold_quantity>=0 and sold_quantity<=quota),
  combo2_vnd integer check(combo2_vnd>0), combo3_vnd integer check(combo3_vnd>0),
  opens_at timestamptz not null, closes_at timestamptz not null, enabled boolean not null default true,
  unique(offer_id,name,tier), unique(id,offer_id), check(closes_at>opens_at)
);
create table public.purchase_requests (
  id uuid primary key default gen_random_uuid(), code text not null unique,
  user_id uuid not null references auth.users, offer_id uuid not null, edition_id uuid not null, round_id uuid not null,
  key uuid not null, request_hash text not null, buyer jsonb not null check(jsonb_typeof(buyer)='object'),
  lines jsonb not null check(jsonb_typeof(lines)='array' and jsonb_array_length(lines)>0),
  quantity bigint not null check(quantity>0), total_vnd bigint not null check(total_vnd>0 and total_vnd<=9007199254740991),
  payment jsonb not null check(jsonb_typeof(payment)='object'),
  created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null,
  status text not null default 'HELD' check(status in ('HELD','EXPIRED','COMPLETED')),
  completed_at timestamptz, evidence_id uuid,
  unique(user_id,key), unique(id,user_id),
  foreign key(offer_id,edition_id,round_id) references public.purchase_offers(id,edition_id,round_id),
  check(expires_at=created_at+interval '30 minutes'),
  check((status='COMPLETED')=(completed_at is not null and evidence_id is not null))
);
create index purchase_requests_owner on public.purchase_requests(user_id,created_at desc);
create index purchase_requests_offer on public.purchase_requests(offer_id,status,expires_at);
create index purchase_requests_active on public.purchase_requests(offer_id,expires_at,id) where status='HELD';
create table public.purchase_allocations (
  request_id uuid not null references public.purchase_requests, product_id uuid not null references public.purchase_products,
  quantity integer not null check(quantity>0), primary key(request_id,product_id)
);
create index purchase_allocations_product on public.purchase_allocations(product_id,request_id);
create table public.purchase_evidence (
  id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
  user_id uuid not null, object_key text not null unique, mime text not null check(mime='image/webp'),
  bytes integer not null check(bytes between 1 and 5242880), created_at timestamptz not null default clock_timestamp(),
  unique(id,request_id), foreign key(request_id,user_id) references public.purchase_requests(id,user_id)
);
create index purchase_evidence_owner on public.purchase_evidence(user_id);
alter table public.purchase_requests add constraint purchase_evidence_scope foreign key(evidence_id,id) references public.purchase_evidence(id,request_id);
alter table public.tickets drop constraint tickets_source_check;
alter table public.tickets add constraint tickets_source_check check(source in ('LEGACY','PAID','SUPPLEMENT'));
alter table public.tickets add column purchase_id uuid references public.purchase_requests;
alter table public.tickets add column purchase_ordinal bigint;
alter table public.tickets add column ticket_code text unique;
alter table public.tickets add constraint supplement_ticket_scope check(
  (source='SUPPLEMENT' and purchase_id is not null and purchase_ordinal is not null and purchase_ordinal>0 and ticket_code is not null
    and event_id is null and category_id is null and seat_id is null and order_item_id is null and checked_in_at is null)
  or (source<>'SUPPLEMENT' and purchase_id is null and purchase_ordinal is null and ticket_code is null)
);
create unique index supplement_ticket_ordinal on public.tickets(purchase_id,purchase_ordinal) where purchase_id is not null;

create function ftu_sales_private.guard_purchase() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'IMMUTABLE_PURCHASE'; end if;
  if tg_op='UPDATE' then
    if (to_jsonb(new)-array['status','completed_at','evidence_id']) is distinct from (to_jsonb(old)-array['status','completed_at','evidence_id'])
      or old.status<>'HELD' or new.status not in ('COMPLETED','EXPIRED') then raise exception 'IMMUTABLE_PURCHASE'; end if;
    if new.status='COMPLETED' and clock_timestamp()>=new.expires_at then raise exception 'PURCHASE_EXPIRED'; end if;
    if new.status='EXPIRED' and clock_timestamp()<new.expires_at then raise exception 'PURCHASE_NOT_EXPIRED'; end if;
  elsif new.status<>'HELD' then raise exception 'INVALID_PURCHASE_STATE'; end if;
  return new;
end $$;
create trigger guard_purchase before insert or update or delete on public.purchase_requests for each row execute function ftu_sales_private.guard_purchase();
create trigger immutable_purchase_allocations before update or delete on public.purchase_allocations for each row execute function ftu_sales_private.immutable_record();
create trigger immutable_purchase_evidence before update or delete on public.purchase_evidence for each row execute function ftu_sales_private.immutable_record();

create function public.purchase_catalog(p_slug text default null) returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object('server_time',clock_timestamp(),'offers',coalesce(jsonb_agg(
    (to_jsonb(o)-array['payment_instructions','qr_path']) || jsonb_build_object(
      'payment_instructions',case when o.mode='DEMO' then 'DEMO — không chuyển tiền thật.' else o.payment_instructions end,
      'qr_path',null,'checkout_enabled',o.mode='DEMO' or (o.qr_path is not null and length(trim(o.payment_instructions))>0),
      'products',(select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object(
        'sold',counts.sold,'held',counts.held,'available',greatest(p.quota-counts.sold-counts.held,0),
        'state',case when clock_timestamp()<p.opens_at then 'UPCOMING' when clock_timestamp()>=p.closes_at then 'CLOSED'
          when p.quota<=counts.sold+counts.held then 'SOLD_OUT' else 'OPEN' end) order by p.name,p.tier),'[]'::jsonb)
        from public.purchase_products p cross join lateral (
          select p.sold_quantity sold, coalesce(sum(a.quantity),0) held
          from public.purchase_requests req join public.purchase_allocations a on a.request_id=req.id and a.product_id=p.id
          where req.offer_id=o.id and req.status='HELD' and req.expires_at>statement_timestamp()
        ) counts where p.offer_id=o.id and p.enabled)) order by o.slug),'[]'::jsonb))
  from public.purchase_offers o join public.contest_editions e on e.id=o.edition_id
  join public.contest_rounds r on r.id=o.round_id
  where o.published and e.published and r.published and (p_slug is null or o.slug=p_slug);
$$;
create function public.read_purchase(p_user uuid,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.purchase_requests;
begin
  select * into r from public.purchase_requests where id=p_request and user_id=p_user;
  if not found then raise exception 'PURCHASE_NOT_FOUND'; end if;
  return (to_jsonb(r)-array['user_id','key','request_hash'])||jsonb_build_object('server_time',clock_timestamp(),
    'evidence_id',coalesce(r.evidence_id,(select id from public.purchase_evidence where request_id=r.id)),
    'status',case when r.status='HELD' and clock_timestamp()>=r.expires_at then 'EXPIRED' else r.status end);
end $$;
create function public.reserve_purchase(p_user uuid,p_data jsonb,p_key uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.purchase_offers; r public.purchase_requests; p public.purchase_products; l jsonb;
  rid uuid=gen_random_uuid(); created timestamptz; lines jsonb='[]'; count_tickets bigint=0; amount bigint=0;
  n bigint; size integer; price integer; used bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text||p_key::text,0));
  select * into r from public.purchase_requests where user_id=p_user and key=p_key;
  if found then
    if r.request_hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return public.read_purchase(p_user,r.id);
  end if;
  select * into o from public.purchase_offers where id=(p_data->>'offer_id')::uuid for share;
  if not found or not o.published or not exists(select 1 from public.contest_editions where id=o.edition_id and published)
    or not exists(select 1 from public.contest_rounds where id=o.round_id and published) then raise exception 'SALE_CLOSED'; end if;
  if o.mode='LIVE' and (o.qr_path is null or length(trim(o.payment_instructions))=0) then raise exception 'PAYMENT_NOT_CONFIGURED'; end if;
  if jsonb_typeof(p_data->'buyer')<>'object' or exists(select 1 from unnest(array['name','school','cohort_class','student_id','email','phone','facebook']) k where nullif(trim(p_data->'buyer'->>k),'') is null) then raise exception 'INVALID_BUYER'; end if;
  if jsonb_typeof(p_data->'lines')<>'array' or jsonb_array_length(p_data->'lines')=0
    or jsonb_array_length(p_data->'lines')>100 then raise exception 'INVALID_SELECTION'; end if;
  if exists(select 1 from jsonb_array_elements(p_data->'lines') x group by x->>'product_id',x->>'bundle_size' having count(*)>1) then raise exception 'INVALID_SELECTION'; end if;
  -- Same lock order for every request/configuration; no network call inside this transaction.
  perform 1 from public.purchase_products where id in(select (x->>'product_id')::uuid from jsonb_array_elements(p_data->'lines') x) order by id for update;
  for l in select value from jsonb_array_elements(p_data->'lines') order by value->>'product_id',value->>'bundle_size' loop
    select * into p from public.purchase_products where id=(l->>'product_id')::uuid and offer_id=o.id;
    if not found or not p.enabled or clock_timestamp()<p.opens_at or clock_timestamp()>=p.closes_at then raise exception 'SALE_CLOSED'; end if;
    n=(l->>'quantity')::bigint; size=(l->>'bundle_size')::integer;
    if n<=0 or size not in (1,2,3) then raise exception 'INVALID_SELECTION'; end if;
    price=case size when 1 then p.price_vnd when 2 then p.combo2_vnd else p.combo3_vnd end;
    if price is null then raise exception 'COMBO_NOT_CONFIGURED'; end if;
    count_tickets=count_tickets+n*size; amount=amount+n*price;
    lines=lines||jsonb_build_array(jsonb_build_object('product_id',p.id,'name',p.name,'tier',p.tier,'bundle_size',size,'quantity',n,'ticket_quantity',n*size,'unit_price_vnd',price));
  end loop;
  for p in select * from public.purchase_products where id in(select (x->>'product_id')::uuid from jsonb_array_elements(lines) x) order by id loop
    created=clock_timestamp();
    select p.sold_quantity+coalesce(sum(a.quantity),0) into used from public.purchase_requests req join public.purchase_allocations a on a.request_id=req.id and a.product_id=p.id
      where req.offer_id=o.id and req.status='HELD' and req.expires_at>created;
    select sum((x->>'ticket_quantity')::bigint) into n from jsonb_array_elements(lines) x where (x->>'product_id')::uuid=p.id;
    if n>p.quota-used then raise exception 'QUOTA_UNAVAILABLE'; end if;
  end loop;
  created=clock_timestamp();
  insert into public.purchase_requests(id,code,user_id,offer_id,edition_id,round_id,key,request_hash,buyer,lines,quantity,total_vnd,payment,created_at,expires_at)
    values(rid,'FTC-'||upper(replace(rid::text,'-','')),p_user,o.id,o.edition_id,o.round_id,p_key,p_hash,p_data->'buyer',lines,count_tickets,amount,
      jsonb_build_object('mode',o.mode,'instructions',case when o.mode='DEMO' then 'DEMO — không chuyển tiền thật.' else o.payment_instructions end,'qr_path',o.qr_path),created,created+interval '30 minutes');
  insert into public.purchase_allocations select rid,(x->>'product_id')::uuid,sum((x->>'ticket_quantity')::integer)
    from jsonb_array_elements(lines) x group by x->>'product_id';
  return public.read_purchase(p_user,rid);
end $$;
create function public.attach_purchase_evidence(p_user uuid,p_request uuid,p_id uuid,p_object text,p_bytes integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.purchase_requests; existing public.purchase_evidence;
begin
  select * into r from public.purchase_requests where id=p_request and user_id=p_user for update;
  if not found then raise exception 'PURCHASE_NOT_FOUND'; end if;
  select * into existing from public.purchase_evidence where request_id=r.id;
  if found then return jsonb_build_object('id',existing.id); end if;
  if r.status<>'HELD' or clock_timestamp()>=r.expires_at then raise exception 'PURCHASE_EXPIRED'; end if;
  if p_object<>'private/purchases/'||p_user::text||'/'||p_request::text||'/'||p_id::text||'.webp' then raise exception 'INVALID_EVIDENCE'; end if;
  insert into public.purchase_evidence(id,request_id,user_id,object_key,mime,bytes) values(p_id,p_request,p_user,p_object,'image/webp',p_bytes);
  return jsonb_build_object('id',p_id);
end $$;
create function public.complete_purchase(p_user uuid,p_request uuid,p_evidence uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.purchase_requests; i integer;
begin
  select * into r from public.purchase_requests where id=p_request and user_id=p_user for update;
  if not found then raise exception 'PURCHASE_NOT_FOUND'; end if;
  if r.status='COMPLETED' then
    if r.evidence_id<>p_evidence then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return public.read_purchase(p_user,r.id);
  end if;
  -- Product locks also serialize completion against expiry/reallocation/config changes.
  perform 1 from public.purchase_products where id in(select product_id from public.purchase_allocations where request_id=r.id) order by id for update;
  if r.status<>'HELD' or clock_timestamp()>=r.expires_at then raise exception 'PURCHASE_EXPIRED'; end if;
  if not exists(select 1 from public.purchase_evidence where id=p_evidence and request_id=r.id and user_id=p_user) then raise exception 'INVALID_EVIDENCE'; end if;
  update public.purchase_requests set status='COMPLETED',evidence_id=p_evidence,completed_at=clock_timestamp() where id=r.id;
  update public.purchase_products p set sold_quantity=p.sold_quantity+a.quantity
    from public.purchase_allocations a where a.request_id=r.id and a.product_id=p.id;
  insert into public.tickets(edition_id,round_id,user_id,seat_label,token_hash,source,purchase_id,purchase_ordinal,ticket_code)
    select r.edition_id,r.round_id,p_user,r.code||'-'||n,replace(gen_random_uuid()::text,'-',''),'SUPPLEMENT',r.id,n,r.code||'-'||n
    from generate_series(1,r.quantity) n;
  insert into public.audit_logs(edition_id,actor_id,action,target_id,detail) values(r.edition_id,p_user,'purchase_completed',r.id,jsonb_build_object('quantity',r.quantity,'evidence_id',p_evidence));
  return public.read_purchase(p_user,r.id);
end $$;

create function public.expire_purchase_holds(p_limit integer default 100) returns integer language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  if p_limit not between 1 and 1000 then raise exception 'INVALID_LIMIT'; end if;
  update public.purchase_requests set status='EXPIRED' where id in(
    select id from public.purchase_requests where status='HELD' and expires_at<=clock_timestamp()
    order by expires_at,id limit p_limit for update skip locked);
  get diagnostics affected=row_count; return affected;
end $$;
revoke all on function public.expire_purchase_holds(integer) from public,anon,authenticated;
grant execute on function public.expire_purchase_holds(integer) to service_role;

create function public.save_purchase_offer(p_actor uuid,p_aal text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.purchase_offers; x jsonb; used bigint; pid uuid;
begin
  if p_aal<>'aal2' or not public.has_role(p_actor,array['TICKET_STAFF']) then raise exception 'FORBIDDEN'; end if;
  select * into o from public.purchase_offers where id=(p_data->>'id')::uuid for update;
  if found and exists(select 1 from public.purchase_requests where offer_id=o.id) and row(o.edition_id,o.round_id,o.mode) is distinct from row((p_data->>'edition_id')::uuid,(p_data->>'round_id')::uuid,p_data->>'mode') then raise exception 'IMMUTABLE_PURCHASE_SCOPE'; end if;
  insert into public.purchase_offers(id,edition_id,round_id,slug,title,venue,starts_at,published,mode,payment_instructions,qr_path)
    values((p_data->>'id')::uuid,(p_data->>'edition_id')::uuid,(p_data->>'round_id')::uuid,p_data->>'slug',p_data->>'title',p_data->>'venue',(p_data->>'starts_at')::timestamptz,(p_data->>'published')::boolean,p_data->>'mode',p_data->>'payment_instructions',p_data->>'qr_path')
    on conflict(id) do update set edition_id=excluded.edition_id,round_id=excluded.round_id,mode=excluded.mode,slug=excluded.slug,title=excluded.title,venue=excluded.venue,starts_at=excluded.starts_at,published=excluded.published,payment_instructions=excluded.payment_instructions,qr_path=excluded.qr_path;
  perform 1 from public.purchase_products where offer_id=(p_data->>'id')::uuid order by id for update;
  for x in select value from jsonb_array_elements(p_data->'products') order by value->>'id' loop
    pid=(x->>'id')::uuid;
    if exists(select 1 from public.purchase_products where id=pid and offer_id<>(p_data->>'id')::uuid) then raise exception 'FORBIDDEN'; end if;
    select coalesce((select sold_quantity from public.purchase_products where id=pid),0)+coalesce(sum(a.quantity),0) into used
      from public.purchase_requests req join public.purchase_allocations a on a.request_id=req.id and a.product_id=pid
      where req.offer_id=(p_data->>'id')::uuid and req.status='HELD' and req.expires_at>clock_timestamp();
    if (x->>'quota')::integer<used then raise exception 'QUOTA_BELOW_ALLOCATED'; end if;
    insert into public.purchase_products(id,offer_id,name,tier,quota,price_vnd,combo2_vnd,combo3_vnd,opens_at,closes_at,enabled)
      values(pid,(p_data->>'id')::uuid,x->>'name',x->>'tier',(x->>'quota')::integer,(x->>'price_vnd')::integer,(x->>'combo2_vnd')::integer,(x->>'combo3_vnd')::integer,(x->>'opens_at')::timestamptz,(x->>'closes_at')::timestamptz,(x->>'enabled')::boolean)
      on conflict(id) do update set name=excluded.name,tier=excluded.tier,quota=excluded.quota,price_vnd=excluded.price_vnd,combo2_vnd=excluded.combo2_vnd,combo3_vnd=excluded.combo3_vnd,opens_at=excluded.opens_at,closes_at=excluded.closes_at,enabled=excluded.enabled;
  end loop;
  -- Disabling omitted products retains history and active reservations.
  update public.purchase_products set enabled=false where offer_id=(p_data->>'id')::uuid and id not in(select (v->>'id')::uuid from jsonb_array_elements(p_data->'products') v);
  insert into public.audit_logs(edition_id,actor_id,action,target_id) values((p_data->>'edition_id')::uuid,p_actor,'save_purchase_offer',(p_data->>'id')::uuid);
  return jsonb_build_object('id',p_data->>'id');
end $$;

do $$ declare t text; begin
  foreach t in array array['purchase_offers','purchase_products','purchase_requests','purchase_allocations','purchase_evidence'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
-- No direct client writes or PII reads. Public catalog is a filtered server-only RPC.
revoke all on function public.purchase_catalog(text),public.read_purchase(uuid,uuid),public.reserve_purchase(uuid,jsonb,uuid,text),public.attach_purchase_evidence(uuid,uuid,uuid,text,integer),public.complete_purchase(uuid,uuid,uuid),public.save_purchase_offer(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.purchase_catalog(text),public.read_purchase(uuid,uuid),public.reserve_purchase(uuid,jsonb,uuid,text),public.attach_purchase_evidence(uuid,uuid,uuid,text,integer),public.complete_purchase(uuid,uuid,uuid),public.save_purchase_offer(uuid,text,jsonb) to service_role;
revoke all on function ftu_sales_private.guard_purchase() from public,anon,authenticated;

-- Retain the old guards, with an explicit immutable supplement branch.
create or replace function ftu_sales_private.guard_ticket() returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.purchase_requests; i public.order_items; o public.orders; s public.event_seats;
begin
  if new.source='SUPPLEMENT' then
    if tg_op='UPDATE' and new is distinct from old then raise exception 'IMMUTABLE_TICKET'; end if;
    select * into r from public.purchase_requests where id=new.purchase_id for share;
    if not found or r.status<>'COMPLETED' or row(r.user_id,r.edition_id,r.round_id) is distinct from row(new.user_id,new.edition_id,new.round_id)
      or new.purchase_ordinal not between 1 and r.quantity or new.ticket_code<>r.code||'-'||new.purchase_ordinal
      or new.seat_label<>new.ticket_code or new.status<>'issued' then raise exception 'INVALID_PURCHASE_TICKET'; end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if row(new.edition_id,new.round_id,new.user_id,new.seat_label,new.token_hash,new.source,new.order_item_id)
      is distinct from row(old.edition_id,old.round_id,old.user_id,old.seat_label,old.token_hash,old.source,old.order_item_id) then raise exception 'IMMUTABLE_TICKET'; end if;
    if old.event_id is not null and row(new.event_id,new.category_id,new.seat_id) is distinct from row(old.event_id,old.category_id,old.seat_id) then raise exception 'IMMUTABLE_TICKET'; end if;
    if old.checked_in_at is not null and row(new.checked_in_at,new.checked_in_by) is distinct from row(old.checked_in_at,old.checked_in_by) then raise exception 'ALREADY_CHECKED_IN'; end if;
    if old.status = 'void' and new.status <> 'void' then raise exception 'INVALID_TICKET_TRANSITION'; end if;
  end if;
  if new.event_id is null then
    if tg_op = 'INSERT' and exists(select 1 from public.events where round_id = new.round_id) then raise exception 'LEGACY_TICKET_MAPPING_REQUIRED'; end if;
    return new;
  end if;
  if new.source = 'PAID' then
    select * into i from public.order_items where id = new.order_item_id;
    select * into o from public.orders where id = i.order_id for update;
    if o.status <> 'PAID' or o.user_id <> new.user_id then raise exception 'UNPAID_ORDER'; end if;
    if row(i.event_id,i.category_id,i.seat_id,i.seat_label) is distinct from row(new.event_id,new.category_id,new.seat_id,new.seat_label) then raise exception 'TICKET_ITEM_MISMATCH'; end if;
  elsif tg_op = 'INSERT' then raise exception 'MANUAL_ISSUE_DISABLED'; end if;
  select * into s from public.event_seats where id = new.seat_id for update;
  if not found or s.label <> new.seat_label then raise exception 'TICKET_SEAT_MISMATCH'; end if;
  if new.status = 'issued' then
    if not s.enabled then raise exception 'SEAT_UNAVAILABLE'; end if;
    if new.source = 'PAID' and not exists(select 1 from public.seat_holds where order_item_id = new.order_item_id and state = 'CONSUMED') then raise exception 'HOLD_NOT_CONSUMED'; end if;
    if exists(select 1 from public.seat_holds where seat_id = new.seat_id and state in ('HELD','CONSUMED') and order_item_id is distinct from new.order_item_id) then raise exception 'SEAT_UNAVAILABLE'; end if;
  end if;
  return new;
end $$;

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
  if s.state <> 'OPEN' or not s.published or clock_timestamp() < s.open_at or clock_timestamp() >= s.close_at then raise exception 'VOTE_CLOSED'; end if;
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
  if s.state<>'OPEN' or not s.published or s.open_at is null or s.close_at is null or clock_timestamp()<s.open_at or clock_timestamp()>=s.close_at then raise exception 'VOTE_CLOSED'; end if;
  insert into public.votes(edition_id,round_id,ticket_id,contestant_id,user_id,category_id,session_id,vote_format)
    values(r.edition_id,p_round,p_ticket,p_contestant,p_user,p_category,p_session,'CATEGORY') returning id into vid;
  return jsonb_build_object('id',vid,'already_recorded',false);
end $$;

create or replace function public.prepare_gender_voting(p_actor uuid,p_aal text,p_round uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.contest_rounds;
begin
  if p_aal<>'aal2' or not public.has_role(p_actor,array['VOTE_MANAGER']) then raise exception 'FORBIDDEN'; end if;
  select * into r from public.contest_rounds where id=p_round for update;
  if not found or r.kind not in ('semifinal','final') then raise exception 'NOT_FOUND'; end if;
  if exists(select 1 from public.votes where round_id=p_round) or r.vote_open_at is not null
    or exists(select 1 from public.vote_sessions where round_id=p_round and state<>'DRAFT') then raise exception 'VOTING_HAS_STARTED'; end if;
  insert into public.vote_categories(round_id,code,name,gender) values
    (p_round,'male','Nam được yêu thích nhất','male'),(p_round,'female','Nữ được yêu thích nhất','female')
    on conflict(round_id,code) do nothing;
  if (select count(*) from public.vote_categories where round_id=p_round and code=gender and gender in ('male','female'))<>2 then raise exception 'VOTING_NOT_CONFIGURED'; end if;
  insert into public.audit_logs(edition_id,actor_id,action,target_id) values(r.edition_id,p_actor,'prepare_gender_voting',p_round);
  return jsonb_build_object('id',p_round);
end $$;

create or replace function public.open_gender_voting(p_actor uuid,p_aal text,p_round uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.contest_rounds; sid uuid; opened timestamptz;
begin
  if p_aal<>'aal2' or not public.has_role(p_actor,array['VOTE_MANAGER']) then raise exception 'FORBIDDEN'; end if;
  select * into r from public.contest_rounds where id=p_round for update;
  if not found or r.kind not in ('semifinal','final') or not r.published then raise exception 'VOTE_CLOSED'; end if;
  if r.vote_open_at is not null or exists(select 1 from public.votes where round_id=p_round)
    or exists(select 1 from public.vote_sessions where round_id=p_round and state<>'DRAFT') then raise exception 'VOTING_HAS_STARTED'; end if;
  if (select count(*) from public.vote_categories where round_id=p_round and gender in ('male','female'))<>2 then raise exception 'VOTING_NOT_CONFIGURED'; end if;
  select id into sid from public.vote_sessions where round_id=p_round and state='DRAFT' order by id limit 1 for update;
  if sid is null then
    insert into public.vote_sessions(edition_id,round_id,title,updated_by)
      values(r.edition_id,p_round,r.title,p_actor) returning id into sid;
  end if;
  delete from public.vote_eligible_contestants where session_id=sid;
  insert into public.vote_eligible_contestants(session_id,category_id,round_id,contestant_id)
    select sid,c.id,p_round,p.id from public.vote_categories c
    join public.contestants p on p.edition_id=r.edition_id and p.gender=c.gender and p.published
    join public.round_entries e on e.round_id=p_round and e.contestant_id=p.id and e.eligible
    where c.round_id=p_round;
  opened=clock_timestamp();
  update public.vote_sessions set state='OPEN',published=true,open_at=opened,close_at=opened+interval '10 minutes',updated_by=p_actor where id=sid;
  update public.contest_rounds set vote_open_at=opened,vote_close_at=opened+interval '10 minutes' where id=p_round;
  insert into public.audit_logs(edition_id,actor_id,action,target_id,detail)
    values(r.edition_id,p_actor,'open_gender_voting',sid,jsonb_build_object('round_id',p_round));
  return jsonb_build_object('id',sid,'vote_open_at',opened,'vote_close_at',opened+interval '10 minutes');
end $$;

create function public.manage_purchase_voting(p_actor uuid,p_aal text,p_session uuid,p_action text,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
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
end $$;
create function public.purchase_statistics(p_actor uuid,p_aal text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_aal<>'aal2' or not public.has_role(p_actor,array['TICKET_STAFF']) then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object('completed_orders',(select count(*) from public.purchase_requests where status='COMPLETED'),
    'ticket_quantity',(select coalesce(sum(quantity),0) from public.purchase_requests where status='COMPLETED'),
    'requested_amount_vnd',(select coalesce(sum(total_vnd),0) from public.purchase_requests where status='COMPLETED'),
    'groups',(select coalesce(jsonb_agg(to_jsonb(g)),'[]'::jsonb) from (
      select r.round_id,l->>'name' name,l->>'tier' tier,(l->>'bundle_size')::int bundle_size,
        sum((l->>'quantity')::int) bundle_quantity,sum((l->>'ticket_quantity')::int) ticket_quantity
      from public.purchase_requests r cross join lateral jsonb_array_elements(r.lines) l
      where r.status='COMPLETED' group by r.round_id,l->>'name',l->>'tier',l->>'bundle_size'
    ) g));
end $$;
create function public.classify_purchase_legacy_vote(p_actor uuid,p_aal text,p_vote uuid,p_category uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.votes;
begin
  if p_aal<>'aal2' or not public.has_role(p_actor,array['VOTE_MANAGER']) then raise exception 'FORBIDDEN'; end if;
  select * into v from public.votes where id=p_vote for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v.vote_format='LEGACY_CLASSIFIED' and v.category_id=p_category then return jsonb_build_object('id',v.id); end if;
  if v.vote_format<>'LEGACY' then raise exception 'IMMUTABLE_VOTE'; end if;
  update public.votes set vote_format='LEGACY_CLASSIFIED',category_id=p_category,classified_by=p_actor where id=v.id;
  return jsonb_build_object('id',v.id);
end $$;
revoke all on function public.classify_purchase_legacy_vote(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.classify_purchase_legacy_vote(uuid,text,uuid,uuid) to service_role;
revoke all on function public.purchase_statistics(uuid,text) from public,anon,authenticated;
grant execute on function public.purchase_statistics(uuid,text) to service_role;
revoke all on function public.manage_purchase_voting(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.manage_purchase_voting(uuid,text,uuid,text,text) to service_role;
create or replace function public.open_voting(p_actor uuid,p_aal text,p_round uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.contest_rounds;opened timestamptz;
begin
 if exists(select 1 from public.purchase_offers where round_id=p_round) then return public.open_gender_voting(p_actor,p_aal,p_round);end if;
 if exists(select 1 from public.vote_categories where round_id=p_round and gender is not null) then return public.open_gender_voting(p_actor,p_aal,p_round);end if;
 if exists(select 1 from public.vote_categories where round_id=p_round) then raise exception 'VOTING_SESSION_REQUIRED';end if;
 if exists(select 1 from public.vote_sessions where round_id=p_round) then raise exception 'VOTING_SESSION_REQUIRED';end if;
 if p_aal<>'aal2' or not public.has_role(p_actor,array['VOTE_MANAGER']) then raise exception 'FORBIDDEN';end if;
 select * into r from public.contest_rounds where id=p_round for update;
 if not found or r.kind<>'final' or not r.published then raise exception 'VOTE_CLOSED';end if;
 if r.vote_open_at is not null or exists(select 1 from public.votes where round_id=p_round) then raise exception 'VOTING_HAS_STARTED';end if;
 if not exists(select 1 from public.round_entries where round_id=p_round and eligible) then raise exception 'CONTESTANT_NOT_ELIGIBLE';end if;
 opened=clock_timestamp();
 update public.contest_rounds set vote_open_at=opened,vote_close_at=opened+interval '10 minutes' where id=p_round;
 insert into public.audit_logs(edition_id,actor_id,action,target_id,detail) values(r.edition_id,p_actor,'open_voting',p_round,jsonb_build_object('open',opened,'close',opened+interval '10 minutes'));
 return jsonb_build_object('id',r.id,'vote_open_at',opened,'vote_close_at',opened+interval '10 minutes');
end$$;
commit;;
