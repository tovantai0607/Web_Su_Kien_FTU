-- Additive migration. Existing DEMO and legacy offers keep their existing behavior.
alter table public.purchase_offers
  add column total_quota integer check(total_quota > 0),
  add column early_quota integer check(early_quota >= 0 and early_quota <= total_quota),
  add column early_open_at timestamptz,
  add column early_close_at timestamptz,
  add column normal_close_at timestamptz,
  add column event_date date,
  add constraint purchase_phase_dates check(
    total_quota is null or (early_quota is not null and early_open_at is not null
    and early_close_at is not null and normal_close_at is not null and early_close_at > early_open_at and normal_close_at > early_close_at));
-- Publication of information is independent of readiness to accept purchases.
alter table public.purchase_offers drop constraint purchase_offers_check;
create unique index one_program_offer_per_round on public.purchase_offers(round_id) where total_quota is not null;
create function ftu_sales_private.official_offer_policy() returns trigger language plpgsql set search_path='' as $$
declare kind text;existing public.purchase_offers;
begin
 if new.mode='LIVE' and exists(select 1 from public.contest_editions where id=new.edition_id and slug='ftucharm-2027') then
  if tg_op='INSERT' and new.total_quota is null then
   select * into existing from public.purchase_offers where id=new.id;
   if found then
    new.total_quota=existing.total_quota;new.early_quota=existing.early_quota;
    new.early_open_at=existing.early_open_at;new.early_close_at=existing.early_close_at;new.normal_close_at=existing.normal_close_at;
   end if;
  end if;
  select r.kind into kind from public.contest_rounds r where r.id=new.round_id;
  if new.total_quota is distinct from 700 or new.early_quota is distinct from 100
   or (kind='semifinal' and (new.early_open_at is distinct from '2027-03-29T00:00:00+07:00'::timestamptz or new.early_close_at is distinct from '2027-03-31T00:00:00+07:00'::timestamptz or new.normal_close_at is distinct from '2027-04-25T00:00:00+07:00'::timestamptz))
   or (kind='final' and (new.early_open_at is distinct from '2027-04-26T09:00:00+07:00'::timestamptz or new.early_close_at is distinct from '2027-04-26T11:00:00+07:00'::timestamptz or new.normal_close_at is distinct from '2027-05-23T00:00:00+07:00'::timestamptz))
   or kind not in ('semifinal','final') then raise exception 'PROGRAM_CAPACITY_FIXED';end if;
 end if;
 return new;
end $$;
create trigger official_offer_policy before insert or update on public.purchase_offers for each row execute function ftu_sales_private.official_offer_policy();
alter table public.purchase_products add column base_quota integer check(base_quota >= 0);
update public.purchase_products set base_quota=quota;
create function ftu_sales_private.product_base_quota() returns trigger language plpgsql set search_path='' as $$
begin new.base_quota=coalesce(new.base_quota,new.quota);return new;end $$;
create trigger product_base_quota before insert on public.purchase_products for each row execute function ftu_sales_private.product_base_quota();

create function ftu_sales_private.offer_phase(p_offer uuid,p_now timestamptz) returns text language sql stable set search_path='' as $$
 select case when p_now<o.early_open_at then 'UPCOMING'
 when p_now>=o.normal_close_at then 'CLOSED'
 when p_now>=o.early_close_at or (select coalesce(sum(sold_quantity),0) from public.purchase_products where offer_id=o.id and tier='EARLY')>=o.early_quota then 'NORMAL'
 else 'EARLY' end from public.purchase_offers o where id=p_offer
$$;
create function ftu_sales_private.offer_ready(p_offer uuid) returns boolean language sql stable set search_path='' as $$
 select o.total_quota is null or (
   (select coalesce(sum(base_quota),0) from public.purchase_products where offer_id=o.id and tier='EARLY' and enabled)=o.early_quota
   and (select coalesce(sum(base_quota),0) from public.purchase_products where offer_id=o.id and tier='NORMAL' and enabled)=o.total_quota-o.early_quota
   and not exists(select 1 from public.purchase_products e where e.offer_id=o.id and e.tier='EARLY' and e.enabled and e.base_quota>0
    and not exists(select 1 from public.purchase_products n where n.offer_id=o.id and n.tier='NORMAL' and n.name=e.name and n.enabled))
 ) from public.purchase_offers o where id=p_offer
$$;
create function ftu_sales_private.product_stock(p_product uuid,p_now timestamptz) returns jsonb language plpgsql stable set search_path='' as $$
declare p public.purchase_products;o public.purchase_offers;held bigint;early_used bigint;bonus bigint=0;phase text;available bigint;total_used bigint;is_open boolean;
begin
 select * into p from public.purchase_products where id=p_product;
 select * into o from public.purchase_offers where id=p.offer_id;
 select coalesce(sum(a.quantity),0) into held from public.purchase_allocations a join public.purchase_requests r on r.id=a.request_id where a.product_id=p.id and r.status='HELD' and r.expires_at>p_now;
 phase=case when o.total_quota is null then null else ftu_sales_private.offer_phase(o.id,p_now) end;
 if phase='NORMAL' and p.tier='NORMAL' then
  select coalesce(sum(greatest(e.base_quota-e.sold_quantity-coalesce((select sum(a.quantity) from public.purchase_allocations a join public.purchase_requests r on r.id=a.request_id where a.product_id=e.id and r.status='HELD' and r.expires_at>p_now),0),0)),0)
  into bonus from public.purchase_products e where e.offer_id=o.id and e.name=p.name and e.tier='EARLY';
 end if;
 available=greatest(p.base_quota+bonus-p.sold_quantity-held,0);
 if o.total_quota is not null then
  select coalesce(sum(sold_quantity),0)+(select coalesce(sum(quantity),0) from public.purchase_requests where offer_id=o.id and status='HELD' and expires_at>p_now) into total_used from public.purchase_products where offer_id=o.id;
  available=least(available,greatest(o.total_quota-total_used,0));
  if p.tier='EARLY' then
   select coalesce(sum(sold_quantity),0)+(select coalesce(sum(a.quantity),0) from public.purchase_allocations a join public.purchase_requests r on r.id=a.request_id join public.purchase_products e on e.id=a.product_id where e.offer_id=o.id and e.tier='EARLY' and r.status='HELD' and r.expires_at>p_now) into early_used from public.purchase_products where offer_id=o.id and tier='EARLY';
   available=least(available,greatest(o.early_quota-early_used,0));
  end if;
 end if;
 is_open=p.enabled and ftu_sales_private.offer_ready(o.id) and case when o.total_quota is null then p_now>=p.opens_at and p_now<p.closes_at else phase=p.tier end;
 return jsonb_build_object('quota',p.base_quota+bonus,'base_quota',p.base_quota,'sold',p.sold_quantity,'held',held,'available',available,
  'state',case when not p.enabled or phase='CLOSED' or (phase='NORMAL' and p.tier='EARLY') or (o.total_quota is null and p_now>=p.closes_at) then 'CLOSED'
    when not is_open then 'UPCOMING' when available=0 then 'SOLD_OUT' else 'OPEN' end);
end $$;

alter function public.purchase_catalog(text) rename to purchase_catalog_before_2027;
create function public.purchase_catalog(p_slug text default null) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('server_time',clock_timestamp(),'offers',coalesce(jsonb_agg(
   (to_jsonb(o)-array['payment_instructions','qr_path'])||jsonb_build_object(
    'payment_instructions',case when o.mode='DEMO' then 'DEMO — không chuyển tiền thật.' else o.payment_instructions end,
    'qr_path',null,'phase',case when o.total_quota is null then null else ftu_sales_private.offer_phase(o.id,clock_timestamp()) end,
    'checkout_enabled',(o.mode='DEMO' or (o.qr_path is not null and length(trim(o.payment_instructions))>0)) and ftu_sales_private.offer_ready(o.id) and exists(select 1 from public.purchase_products p where p.offer_id=o.id and p.enabled),
    'products',(select coalesce(jsonb_agg(to_jsonb(p)||ftu_sales_private.product_stock(p.id,clock_timestamp()) order by p.name,p.tier),'[]') from public.purchase_products p where p.offer_id=o.id and p.enabled)
   ) order by o.event_date nulls last,o.slug),'[]'))
 from public.purchase_offers o join public.contest_editions e on e.id=o.edition_id join public.contest_rounds r on r.id=o.round_id
 where o.published and e.published and r.published and (p_slug is null or o.slug=p_slug)
$$;

alter function public.reserve_purchase(uuid,jsonb,uuid,text) rename to reserve_purchase_before_2027;
create function public.reserve_purchase(p_user uuid,p_data jsonb,p_key uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.purchase_offers;p public.purchase_products;l jsonb;stock jsonb;tick timestamptz;requested bigint;used bigint;existing public.purchase_requests;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text||p_key::text,0));
 select * into existing from public.purchase_requests where user_id=p_user and key=p_key;
 if found then
  if existing.request_hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return public.read_purchase(p_user,existing.id);
 end if;
 select * into o from public.purchase_offers where id=(p_data->>'offer_id')::uuid for update;
 if not found then raise exception 'SALE_CLOSED';end if;
 if o.total_quota is not null then
  perform 1 from public.purchase_products where offer_id=o.id order by id for update;
  tick=clock_timestamp();
  if not ftu_sales_private.offer_ready(o.id) then raise exception 'SALE_NOT_CONFIGURED';end if;
  if jsonb_typeof(p_data->'lines') is distinct from 'array' then raise exception 'INVALID_SELECTION';end if;
  for l in select value from jsonb_array_elements(p_data->'lines') loop
   select * into p from public.purchase_products where id=(l->>'product_id')::uuid and offer_id=o.id;
   if not found then raise exception 'SALE_CLOSED';end if;
   stock=ftu_sales_private.product_stock(p.id,tick);
   if stock->>'state' not in ('OPEN','SOLD_OUT') then raise exception 'SALE_CLOSED';end if;
  end loop;
  select coalesce(sum((x->>'quantity')::bigint*(x->>'bundle_size')::bigint),0) into requested from jsonb_array_elements(p_data->'lines') x;
  select coalesce(sum(sold_quantity),0)+(select coalesce(sum(quantity),0) from public.purchase_requests where offer_id=o.id and status='HELD' and expires_at>tick) into used from public.purchase_products where offer_id=o.id;
  if requested>o.total_quota-used then raise exception 'QUOTA_UNAVAILABLE';end if;
  for p in select * from public.purchase_products where offer_id=o.id and tier='NORMAL' order by id loop
   stock=ftu_sales_private.product_stock(p.id,tick);
   update public.purchase_products set quota=(stock->>'quota')::integer where id=p.id;
  end loop;
 end if;
 return public.reserve_purchase_before_2027(p_user,p_data,p_key,p_hash);
end $$;
alter function public.complete_purchase(uuid,uuid,uuid) rename to complete_purchase_before_2027;
create function public.complete_purchase(p_user uuid,p_request uuid,p_evidence uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 -- Common offer -> request -> product lock order also covers the last early ticket.
 perform 1 from public.purchase_offers where id=(select offer_id from public.purchase_requests where id=p_request and user_id=p_user) for update;
 return public.complete_purchase_before_2027(p_user,p_request,p_evidence);
end $$;
alter function public.save_purchase_offer(uuid,text,jsonb) rename to save_purchase_offer_before_2027;
create function public.save_purchase_offer(p_actor uuid,p_aal text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; o public.purchase_offers; x jsonb;revised jsonb;products jsonb='[]';effective bigint;p public.purchase_products;stock jsonb;
begin
 if not public.has_role(p_actor,array['TICKET_STAFF']) or (p_aal is distinct from 'aal2' and (p_aal is distinct from 'aal1' or not public.has_role(p_actor,array['SUPER_ADMIN']))) then raise exception 'FORBIDDEN';end if;
 select * into o from public.purchase_offers where id=(p_data->>'id')::uuid for update;
 if o.total_quota is not null and ((p_data->>'total_quota')::integer is distinct from o.total_quota or (p_data->>'early_quota')::integer is distinct from o.early_quota) then raise exception 'PROGRAM_CAPACITY_FIXED';end if;
 if (p_data->>'total_quota')::integer is not null then
  if (select coalesce(sum((v->>'quota')::bigint),0) from jsonb_array_elements(p_data->'products') v where v->>'tier'='EARLY')>(p_data->>'early_quota')::integer
   or (select coalesce(sum((v->>'quota')::bigint),0) from jsonb_array_elements(p_data->'products') v where v->>'tier'='NORMAL')>(p_data->>'total_quota')::integer-(p_data->>'early_quota')::integer then raise exception 'PROGRAM_QUOTA_EXCEEDED';end if;
  for x in select value from jsonb_array_elements(p_data->'products') loop
   if exists(select 1 from public.purchase_products p join public.purchase_allocations a on a.product_id=p.id where p.id=(x->>'id')::uuid and (p.name<>x->>'name' or p.tier<>x->>'tier')) then raise exception 'IMMUTABLE_PURCHASE_SCOPE';end if;
   effective=(x->>'quota')::bigint;
   if o.id is not null and x->>'tier'='NORMAL' and ftu_sales_private.offer_phase(o.id,clock_timestamp())='NORMAL' then
    effective=effective+coalesce((select (ftu_sales_private.product_stock(id,clock_timestamp())->>'quota')::bigint-base_quota from public.purchase_products where id=(x->>'id')::uuid),0);
   end if;
   products=products||jsonb_build_array(x||jsonb_build_object('quota',effective,'opens_at',p_data->>'early_open_at','closes_at',case when x->>'tier'='EARLY' then p_data->>'early_close_at' else p_data->>'normal_close_at' end));
  end loop;
  revised=p_data||jsonb_build_object('products',products);
 else revised=p_data;end if;
 result=public.save_purchase_offer_before_2027(p_actor,p_aal,revised);
 update public.purchase_offers set total_quota=(p_data->>'total_quota')::integer,early_quota=(p_data->>'early_quota')::integer,early_open_at=(p_data->>'early_open_at')::timestamptz,early_close_at=(p_data->>'early_close_at')::timestamptz,normal_close_at=(p_data->>'normal_close_at')::timestamptz where id=(p_data->>'id')::uuid;
 for x in select value from jsonb_array_elements(p_data->'products') loop
  update public.purchase_products set base_quota=(x->>'quota')::integer where id=(x->>'id')::uuid;
 end loop;
 if (p_data->>'total_quota')::integer is not null then
  for p in select * from public.purchase_products where offer_id=(p_data->>'id')::uuid and tier='NORMAL' order by id loop
   stock=ftu_sales_private.product_stock(p.id,clock_timestamp());
   if (stock->>'quota')::bigint<p.sold_quantity+(stock->>'held')::bigint then raise exception 'QUOTA_BELOW_ALLOCATED';end if;
   update public.purchase_products set quota=(stock->>'quota')::integer where id=p.id;
  end loop;
 end if;
 return result;
end $$;
revoke all on function public.purchase_catalog_before_2027(text),public.reserve_purchase_before_2027(uuid,jsonb,uuid,text),public.complete_purchase_before_2027(uuid,uuid,uuid),public.save_purchase_offer_before_2027(uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.purchase_catalog(text),public.reserve_purchase(uuid,jsonb,uuid,text),public.complete_purchase(uuid,uuid,uuid),public.save_purchase_offer(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.purchase_catalog(text),public.reserve_purchase(uuid,jsonb,uuid,text),public.complete_purchase(uuid,uuid,uuid),public.save_purchase_offer(uuid,text,jsonb) to service_role;

create table public.program_publications (
 id uuid primary key default gen_random_uuid(),edition_id uuid not null references public.contest_editions,
 contestant_id uuid not null,round_id uuid,award_name text not null default '' check(length(award_name)<=160),
 photo_url text check(photo_url ~ '^/api/public-images/[a-f0-9-]{36}\.webp$|^/images/[a-zA-Z0-9_/-]+\.(webp|png|jpg)$'),published boolean not null default false,
 foreign key(edition_id,contestant_id) references public.contestants(edition_id,id),
 foreign key(edition_id,round_id) references public.contest_rounds(edition_id,id),
 foreign key(round_id,contestant_id) references public.round_entries(round_id,contestant_id),
 check(round_id is not null or length(trim(award_name))>0)
);
create unique index publication_round_person on public.program_publications(round_id,contestant_id) where round_id is not null;
create unique index publication_award on public.program_publications(edition_id,award_name) where round_id is null;
create index publication_public on public.program_publications(edition_id,round_id) where published;
alter table public.program_publications enable row level security;
revoke all on public.program_publications from anon,authenticated;
grant all on public.program_publications to service_role;
create function public.save_program_publication(p_actor uuid,p_aal text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid=(p_data->>'contestant_id')::uuid;eid uuid=(p_data->>'edition_id')::uuid;
begin
 if not public.has_role(p_actor,array['CONTENT_EDITOR']) or (p_aal is distinct from 'aal2' and (p_aal is distinct from 'aal1' or not public.has_role(p_actor,array['SUPER_ADMIN']))) then raise exception 'FORBIDDEN';end if;
 if not exists(select 1 from public.contestants where id=cid and edition_id=eid and published) then raise exception 'CONTESTANT_NOT_ELIGIBLE';end if;
 if (p_data->>'published')::boolean and nullif(p_data->>'photo_url','') is null then raise exception 'PUBLICATION_PHOTO_REQUIRED';end if;
 insert into public.program_publications(id,edition_id,contestant_id,round_id,award_name,photo_url,published)
 values((p_data->>'id')::uuid,eid,cid,(p_data->>'round_id')::uuid,p_data->>'award_name',p_data->>'photo_url',(p_data->>'published')::boolean)
 on conflict(id) do update set edition_id=excluded.edition_id,contestant_id=excluded.contestant_id,round_id=excluded.round_id,award_name=excluded.award_name,photo_url=excluded.photo_url,published=excluded.published;
 insert into public.audit_logs(edition_id,actor_id,action,target_id) values(eid,p_actor,'save_program_publication',(p_data->>'id')::uuid);
 return p_data;
end $$;
revoke all on function public.save_program_publication(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_program_publication(uuid,text,jsonb) to service_role;

-- Enforce the official semifinal date and ten minute window even through direct RPC calls.
create function ftu_sales_private.official_vote_window() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.contest_rounds r join public.contest_editions e on e.id=r.edition_id where r.id=new.round_id and r.kind='semifinal' and e.slug='ftucharm-2027') and new.open_at is not null then
  if new.open_at<'2027-04-25T00:00:00+07:00'::timestamptz or new.close_at>'2027-04-26T00:00:00+07:00'::timestamptz
   or new.close_at>new.open_at+interval '10 minutes' or (tg_op='INSERT' or new.open_at>clock_timestamp() or (old.open_at is distinct from new.open_at)) and new.close_at<>new.open_at+interval '10 minutes' then raise exception 'INVALID_VOTE_WINDOW';end if;
 end if;
 return new;
end $$;
create trigger official_vote_window before insert or update on public.vote_sessions for each row execute function ftu_sales_private.official_vote_window();
revoke all on all functions in schema ftu_sales_private from public,anon,authenticated;

-- Selection cutoff is a contestant count, not the number of tickets. Leave it unconfigured.
alter table public.contest_rounds alter column cutoff drop not null;
do $$ declare f record;definition text;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' loop
  definition=pg_get_functiondef(f.oid);
  if position('n>r.cutoff' in definition)>0 then execute replace(definition,'n>r.cutoff','r.cutoff is null or n>r.cutoff');end if;
 end loop;
end $$;
