-- Stage 02 only: additive schema and database invariants. No provider/network calls.
begin;
create schema ftu_sales_private;
revoke all on schema ftu_sales_private from public, anon, authenticated;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null,
  round_id uuid not null,
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  title text not null check (length(trim(title)) between 1 and 160),
  venue text,
  starts_at timestamptz,
  sale_open_at timestamptz,
  sale_close_at timestamptz,
  hold_ttl_seconds integer not null default 300 check (hold_ttl_seconds > 0),
  published boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  unique (edition_id, slug), unique (id, edition_id, round_id),
  foreign key (edition_id, round_id) references public.contest_rounds(edition_id, id),
  check ((sale_open_at is null) = (sale_close_at is null)),
  check (sale_close_at > sale_open_at),
  check (not published or (sale_open_at is not null and starts_at is not null and venue is not null and length(trim(venue)) > 0))
);
create index events_round on public.events(round_id);
create index events_sale on public.events(edition_id, sale_open_at) where published;

create table public.ticket_categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events,
  name text not null check (length(trim(name)) between 1 and 100),
  position integer not null check (position between 1 and 2),
  price_vnd bigint not null default 100000 check (price_vnd between 0 and 9007199254740991),
  enabled boolean not null default true,
  unique (event_id, position), unique (id, event_id)
);
create table public.event_seats (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events,
  category_id uuid not null,
  row_label text not null check (length(trim(row_label)) between 1 and 16),
  seat_number integer not null check (seat_number > 0),
  label text not null check (length(trim(label)) between 1 and 32),
  enabled boolean not null default true,
  unique (event_id, row_label, seat_number), unique (event_id, label),
  unique (id, event_id, category_id),
  foreign key (category_id, event_id) references public.ticket_categories(id, event_id)
);
create index event_seats_category on public.event_seats(category_id, seat_number);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events,
  user_id uuid not null references auth.users,
  reference text not null unique check (length(reference) between 6 and 64),
  idempotency_key uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  quantity integer not null check (quantity between 1 and 10),
  total_vnd bigint not null check (total_vnd between 0 and 9007199254740991),
  currency text not null default 'VND' check (currency = 'VND'),
  status text not null default 'PENDING_PAYMENT' check (status in ('PENDING_PAYMENT', 'PAID', 'CANCELLED', 'EXPIRED')),
  reconciliation_status text not null default 'CLEAR' check (reconciliation_status in ('CLEAR', 'REQUIRES_REVIEW')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  paid_at timestamptz,
  unique (user_id, idempotency_key), unique (id, event_id),
  check (expires_at > created_at), check ((status = 'PAID') = (paid_at is not null))
);
create index orders_owner on public.orders(user_id, created_at desc, id);
create index orders_event_state on public.orders(event_id, status, created_at);
create index orders_expiry on public.orders(expires_at) where status = 'PENDING_PAYMENT';

-- One immutable snapshot row per selected seat, quantity derived from row count.
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  event_id uuid not null,
  category_id uuid not null,
  seat_id uuid not null,
  unit_price_vnd bigint not null check (unit_price_vnd between 0 and 9007199254740991),
  category_name text not null,
  seat_label text not null,
  unique (order_id, seat_id), unique (id, order_id, event_id, category_id, seat_id),
  foreign key (order_id, event_id) references public.orders(id, event_id),
  foreign key (seat_id, event_id, category_id) references public.event_seats(id, event_id, category_id)
);
create index order_items_category on public.order_items(category_id);
create index order_items_seat on public.order_items(seat_id);
create table public.order_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  event_id uuid not null,
  category_id uuid not null,
  quantity integer not null check (quantity between 1 and 10),
  expires_at timestamptz not null,
  state text not null default 'HELD' check (state in ('HELD', 'CONSUMED', 'RELEASED')),
  unique (order_id, category_id),
  foreign key (order_id, event_id) references public.orders(id, event_id),
  foreign key (category_id, event_id) references public.ticket_categories(id, event_id)
);
create index order_reservations_category on public.order_reservations(category_id);
create index order_reservations_expiry on public.order_reservations(expires_at) where state = 'HELD';
create table public.seat_holds (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null unique,
  order_id uuid not null,
  event_id uuid not null,
  category_id uuid not null,
  seat_id uuid not null,
  expires_at timestamptz not null,
  state text not null default 'HELD' check (state in ('HELD', 'CONSUMED', 'RELEASED')),
  foreign key (order_item_id, order_id, event_id, category_id, seat_id)
    references public.order_items(id, order_id, event_id, category_id, seat_id)
);
-- Expiry is a server transition, never now() in an index predicate.
create unique index seat_holds_one_claim on public.seat_holds(seat_id) where state in ('HELD', 'CONSUMED');
create index seat_holds_order on public.seat_holds(order_id);
create index seat_holds_category on public.seat_holds(category_id);
create index seat_holds_event on public.seat_holds(event_id);
create index seat_holds_expiry on public.seat_holds(expires_at) where state = 'HELD';

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders,
  provider text not null check (length(provider) between 1 and 40),
  mode text not null check (mode in ('TEST', 'LIVE')),
  reference text not null,
  transaction_id text,
  expected_amount_vnd bigint not null check (expected_amount_vnd between 0 and 9007199254740991),
  received_amount_vnd bigint check (received_amount_vnd between 0 and 9007199254740991),
  currency text not null default 'VND' check (currency = 'VND'),
  status text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'REQUIRES_REVIEW', 'FAILED')),
  created_at timestamptz not null default clock_timestamp(),
  confirmed_at timestamptz,
  unique (provider, mode, reference), unique (provider, mode, transaction_id), unique (id, order_id),
  check (status <> 'CONFIRMED' or (transaction_id is not null and received_amount_vnd is not null and received_amount_vnd = expected_amount_vnd and confirmed_at is not null))
);
create unique index payments_one_confirmation on public.payments(order_id) where status = 'CONFIRMED';
create index payments_order on public.payments(order_id, created_at);
create index payments_review on public.payments(created_at) where status = 'REQUIRES_REVIEW';
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  mode text not null check (mode in ('TEST', 'LIVE')),
  transaction_id text not null,
  provider_event_id text,
  payment_id uuid,
  order_id uuid,
  reference text not null,
  amount_vnd bigint not null check (amount_vnd between 0 and 9007199254740991),
  currency text not null default 'VND' check (currency = 'VND'),
  direction text not null check (direction in ('IN', 'OUT')),
  signature_verified boolean not null default false,
  beneficiary_verified boolean not null default false,
  state text not null default 'RECEIVED' check (state in ('RECEIVED', 'APPLIED', 'REQUIRES_REVIEW', 'IGNORED')),
  reason_code text,
  received_at timestamptz not null default clock_timestamp(),
  replay_count integer not null default 0 check (replay_count >= 0),
  -- Sanitized metadata only, never raw payload, HMAC header or QR token.
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  unique (provider, mode, transaction_id), unique (provider, mode, provider_event_id),
  foreign key (payment_id, order_id) references public.payments(id, order_id),
  foreign key (order_id) references public.orders,
  check (payment_id is null or order_id is not null),
  check (state <> 'APPLIED' or (signature_verified and beneficiary_verified and direction = 'IN' and payment_id is not null))
);
create index payment_events_payment on public.payment_events(payment_id);
create index payment_events_order on public.payment_events(order_id, received_at);
create index payment_events_review on public.payment_events(received_at) where state = 'REQUIRES_REVIEW';

alter table public.tickets
  add column event_id uuid,
  add column category_id uuid,
  add column seat_id uuid,
  add column order_item_id uuid unique references public.order_items,
  add column source text not null default 'LEGACY' check (source in ('LEGACY', 'PAID')),
  add constraint tickets_event_scope foreign key (event_id, edition_id, round_id) references public.events(id, edition_id, round_id),
  add constraint tickets_seat_scope foreign key (seat_id, event_id, category_id) references public.event_seats(id, event_id, category_id),
  add constraint tickets_mapping_complete check ((event_id is null and category_id is null and seat_id is null) or (event_id is not null and category_id is not null and seat_id is not null)),
  add constraint tickets_paid_source check (source <> 'PAID' or (event_id is not null and order_item_id is not null)),
  add constraint tickets_legacy_no_order check (source <> 'LEGACY' or order_item_id is null),
  add constraint tickets_owner_scope unique (id, user_id, round_id),
  add constraint tickets_checkin_scope unique (id, event_id);
alter table public.tickets drop constraint tickets_round_id_seat_label_key;
create unique index tickets_legacy_seat on public.tickets(round_id, seat_label) where event_id is null;
create unique index tickets_issued_seat on public.tickets(seat_id) where status = 'issued' and seat_id is not null;
create index tickets_event on public.tickets(event_id, status);
create index tickets_category on public.tickets(category_id);
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique,
  event_id uuid not null,
  actor_id uuid references auth.users,
  checked_in_at timestamptz not null,
  source text not null check (source in ('LEGACY', 'STAFF')),
  foreign key (ticket_id, event_id) references public.tickets(id, event_id),
  check (source = 'LEGACY' or actor_id is not null)
);
create index checkins_event on public.checkins(event_id, checked_in_at);
create index checkins_actor on public.checkins(actor_id);
create table public.ticket_delivery_secrets (
  ticket_id uuid primary key references public.tickets,
  token_ciphertext bytea not null check (octet_length(token_ciphertext) > 0),
  key_version text not null check (length(key_version) between 1 and 64),
  created_at timestamptz not null default clock_timestamp()
);
-- Encryption and key management are implemented in stage 06, not simulated here.

-- Computed stock: no independently writable capacity/held/sold counters.
create view public.ticket_inventory with (security_invoker = true) as
select c.id as category_id, c.event_id,
  count(s.id) filter (where s.enabled)::integer as capacity,
  count(s.id) filter (where s.enabled and h.state = 'HELD')::integer as held,
  count(s.id) filter (where s.enabled and (h.state = 'CONSUMED' or t.id is not null))::integer as sold,
  count(s.id) filter (where s.enabled and h.id is null and t.id is null)::integer as available
from public.ticket_categories c
left join public.event_seats s on s.category_id = c.id
left join public.seat_holds h on h.seat_id = s.id and h.state in ('HELD', 'CONSUMED')
left join public.tickets t on t.seat_id = s.id and t.status = 'issued'
group by c.id, c.event_id;

create table public.vote_sessions (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null,
  round_id uuid not null,
  title text not null,
  state text not null default 'DRAFT' check (state in ('DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED', 'FINALIZED')),
  duration_seconds integer not null default 600 check (duration_seconds > 0),
  open_at timestamptz,
  close_at timestamptz,
  published boolean not null default false,
  results_published boolean not null default false,
  updated_by uuid not null references auth.users,
  reopen_approved_by uuid references auth.users,
  reopen_reason text,
  finalized_at timestamptz,
  unique (id, round_id),
  foreign key (edition_id, round_id) references public.contest_rounds(edition_id, id),
  check ((open_at is null) = (close_at is null)), check (close_at > open_at),
  check (state = 'DRAFT' or open_at is not null),
  check ((state = 'FINALIZED') = (finalized_at is not null)),
  check (not results_published or state = 'FINALIZED')
);
create index vote_sessions_round on public.vote_sessions(round_id, state);
create index vote_sessions_editor on public.vote_sessions(updated_by);
create index vote_sessions_reopener on public.vote_sessions(reopen_approved_by);
create table public.vote_categories (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.contest_rounds,
  code text not null check (length(code) between 1 and 64),
  name text not null check (length(trim(name)) between 1 and 160),
  unique (round_id, code), unique (id, round_id)
);
create table public.vote_eligible_contestants (
  session_id uuid not null,
  category_id uuid not null,
  round_id uuid not null,
  contestant_id uuid not null,
  primary key (session_id, category_id, contestant_id),
  foreign key (session_id, round_id) references public.vote_sessions(id, round_id),
  foreign key (category_id, round_id) references public.vote_categories(id, round_id),
  foreign key (round_id, contestant_id) references public.round_entries(round_id, contestant_id)
);
create index vote_eligible_category on public.vote_eligible_contestants(category_id);
create index vote_eligible_candidate on public.vote_eligible_contestants(contestant_id);
create index vote_eligible_round on public.vote_eligible_contestants(round_id, contestant_id);
alter table public.votes
  add column category_id uuid,
  add column session_id uuid,
  add column vote_format text not null default 'LEGACY' check (vote_format in ('LEGACY', 'CATEGORY', 'LEGACY_CLASSIFIED')),
  add column classified_by uuid references auth.users,
  add column classified_at timestamptz,
  add constraint votes_category_scope foreign key (category_id, round_id) references public.vote_categories(id, round_id),
  add constraint votes_session_scope foreign key (session_id, round_id) references public.vote_sessions(id, round_id),
  add constraint votes_format_fields check (
    (vote_format = 'LEGACY' and category_id is null and session_id is null and classified_by is null and classified_at is null)
    or (vote_format = 'CATEGORY' and category_id is not null and session_id is not null and classified_by is null and classified_at is null)
    or (vote_format = 'LEGACY_CLASSIFIED' and category_id is not null and classified_by is not null and classified_at is not null)
  );
alter table public.votes drop constraint votes_round_id_ticket_id_key;
create unique index votes_legacy_quota on public.votes(round_id, ticket_id) where category_id is null;
create unique index votes_category_quota on public.votes(round_id, ticket_id, category_id) where category_id is not null;
create index votes_category_results on public.votes(category_id, contestant_id);
create index votes_session on public.votes(session_id);
create index votes_classifier on public.votes(classified_by);
create table public.vote_result_snapshots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  round_id uuid not null,
  category_id uuid not null,
  results jsonb not null check (jsonb_typeof(results) = 'array'),
  created_by uuid not null references auth.users,
  created_at timestamptz not null default clock_timestamp(),
  unique (session_id, category_id),
  foreign key (session_id, round_id) references public.vote_sessions(id, round_id),
  foreign key (category_id, round_id) references public.vote_categories(id, round_id)
);
create index vote_snapshots_category on public.vote_result_snapshots(category_id);
create index vote_snapshots_author on public.vote_result_snapshots(created_by);
create table public.vote_incident_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.vote_sessions,
  actor_id uuid not null references auth.users,
  action text not null,
  reason text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index vote_incidents_session on public.vote_incident_logs(session_id, created_at);
create index vote_incidents_actor on public.vote_incident_logs(actor_id);

create function ftu_sales_private.guard_order() returns trigger language plpgsql security definer set search_path = '' as $$
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
end $$;
create trigger guard_order before insert or update on public.orders for each row execute function ftu_sales_private.guard_order();

create function ftu_sales_private.guard_order_item() returns trigger language plpgsql security definer set search_path = '' as $$
declare o public.orders; s public.event_seats; c public.ticket_categories;
begin
  select * into o from public.orders where id = new.order_id for update;
  select * into s from public.event_seats where id = new.seat_id for update;
  select * into c from public.ticket_categories where id = new.category_id for share;
  if o.status <> 'PENDING_PAYMENT' or clock_timestamp() >= o.expires_at then raise exception 'ORDER_EXPIRED'; end if;
  if not s.enabled or not c.enabled then raise exception 'SEAT_UNAVAILABLE'; end if;
  if new.unit_price_vnd <> c.price_vnd or new.category_name <> c.name or new.seat_label <> s.label then raise exception 'PRICE_SNAPSHOT_MISMATCH'; end if;
  return new;
end $$;
create trigger guard_order_item before insert on public.order_items for each row execute function ftu_sales_private.guard_order_item();

create function ftu_sales_private.guard_hold() returns trigger language plpgsql security definer set search_path = '' as $$
declare o public.orders; s public.event_seats;
begin
  select * into o from public.orders where id = new.order_id for update;
  select * into s from public.event_seats where id = new.seat_id for update;
  if tg_op = 'UPDATE' then
    if row(new.order_item_id,new.order_id,new.event_id,new.category_id,new.seat_id,new.expires_at)
      is distinct from row(old.order_item_id,old.order_id,old.event_id,old.category_id,old.seat_id,old.expires_at) then raise exception 'IMMUTABLE_HOLD'; end if;
    if new.state <> old.state and old.state <> 'HELD' then raise exception 'INVALID_HOLD_TRANSITION'; end if;
  elsif new.state <> 'HELD' then raise exception 'INVALID_HOLD_TRANSITION'; end if;
  if new.expires_at <> o.expires_at then raise exception 'INVALID_ORDER_EXPIRY'; end if;
  if new.state = 'HELD' and (o.status <> 'PENDING_PAYMENT' or clock_timestamp() >= o.expires_at) then raise exception 'ORDER_EXPIRED'; end if;
  if new.state = 'CONSUMED' and o.status <> 'PAID' then raise exception 'UNPAID_ORDER'; end if;
  if new.state in ('HELD','CONSUMED') then
    if not s.enabled or exists(select 1 from public.tickets t where t.seat_id = new.seat_id and t.status = 'issued' and t.order_item_id is distinct from new.order_item_id) then raise exception 'SEAT_UNAVAILABLE'; end if;
  end if;
  return new;
end $$;
create trigger guard_hold before insert or update on public.seat_holds for each row execute function ftu_sales_private.guard_hold();

create function ftu_sales_private.guard_ticket() returns trigger language plpgsql security definer set search_path = '' as $$
declare i public.order_items; o public.orders; s public.event_seats;
begin
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
create trigger guard_ticket before insert or update on public.tickets for each row execute function ftu_sales_private.guard_ticket();

create function ftu_sales_private.check_order_consistency() returns trigger language plpgsql security definer set search_path = '' as $$
declare oid uuid; o public.orders; n bigint; amount numeric;
begin
  if tg_table_name = 'orders' then oid = new.id; else oid = new.order_id; end if;
  if oid is null then return null; end if;
  select * into o from public.orders where id = oid;
  select count(*),coalesce(sum(unit_price_vnd),0) into n,amount from public.order_items where order_id = oid;
  if n <> o.quantity or amount <> o.total_vnd then raise exception 'ORDER_TOTAL_MISMATCH'; end if;
  if exists(select 1 from public.order_reservations r where r.order_id = oid and (r.expires_at <> o.expires_at or r.quantity <> (select count(*) from public.order_items i where i.order_id = oid and i.category_id = r.category_id))) then raise exception 'RESERVATION_MISMATCH'; end if;
  if (select coalesce(sum(quantity),0) from public.order_reservations where order_id = oid) <> o.quantity then raise exception 'RESERVATION_MISMATCH'; end if;
  if (select count(*) from public.seat_holds where order_id = oid) <> o.quantity then raise exception 'RESERVATION_MISMATCH'; end if;
  if exists(select 1 from public.seat_holds where order_id = oid and state <> case o.status when 'PAID' then 'CONSUMED' when 'PENDING_PAYMENT' then 'HELD' else 'RELEASED' end)
    or exists(select 1 from public.order_reservations where order_id = oid and state <> case o.status when 'PAID' then 'CONSUMED' when 'PENDING_PAYMENT' then 'HELD' else 'RELEASED' end) then raise exception 'RESERVATION_STATE_MISMATCH'; end if;
  if o.status = 'PAID' and not exists(
    select 1 from public.payments p join public.payment_events e on e.payment_id = p.id and e.order_id = p.order_id
    where p.order_id = oid and p.status = 'CONFIRMED' and p.expected_amount_vnd = o.total_vnd and p.received_amount_vnd = o.total_vnd
      and e.state = 'APPLIED' and e.signature_verified and e.beneficiary_verified and e.direction = 'IN'
      and e.provider = p.provider and e.mode = p.mode and e.transaction_id = p.transaction_id and e.reference = o.reference and e.amount_vnd = o.total_vnd
  ) then raise exception 'PAYMENT_NOT_VERIFIED'; end if;
  return null;
end $$;
create constraint trigger order_consistency after insert or update on public.orders deferrable initially deferred for each row execute function ftu_sales_private.check_order_consistency();
create constraint trigger item_consistency after insert on public.order_items deferrable initially deferred for each row execute function ftu_sales_private.check_order_consistency();
create constraint trigger reservation_consistency after insert or update on public.order_reservations deferrable initially deferred for each row execute function ftu_sales_private.check_order_consistency();
create constraint trigger hold_consistency after insert or update on public.seat_holds deferrable initially deferred for each row execute function ftu_sales_private.check_order_consistency();
create constraint trigger payment_consistency after insert or update on public.payments deferrable initially deferred for each row execute function ftu_sales_private.check_order_consistency();
create constraint trigger payment_event_consistency after insert or update on public.payment_events deferrable initially deferred for each row execute function ftu_sales_private.check_order_consistency();

create function ftu_sales_private.guard_payment() returns trigger language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where id = new.order_id for update;
  if new.expected_amount_vnd <> o.total_vnd or new.reference <> o.reference then raise exception 'PAYMENT_ORDER_MISMATCH'; end if;
  if tg_op = 'UPDATE' then
    if row(new.order_id,new.provider,new.mode,new.reference,new.expected_amount_vnd,new.currency) is distinct from row(old.order_id,old.provider,old.mode,old.reference,old.expected_amount_vnd,old.currency) then raise exception 'IMMUTABLE_PAYMENT'; end if;
    if old.status = 'CONFIRMED' and new is distinct from old then raise exception 'IMMUTABLE_PAYMENT'; end if;
    if new.status <> old.status and old.status not in ('PENDING','REQUIRES_REVIEW') then raise exception 'INVALID_PAYMENT_TRANSITION'; end if;
  end if;
  return new;
end $$;
create trigger guard_payment before insert or update on public.payments for each row execute function ftu_sales_private.guard_payment();

create function ftu_sales_private.guard_payment_event() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if row(new.provider,new.mode,new.transaction_id,new.reference,new.amount_vnd,new.currency,new.direction,new.received_at)
    is distinct from row(old.provider,old.mode,old.transaction_id,old.reference,old.amount_vnd,old.currency,old.direction,old.received_at) then raise exception 'IMMUTABLE_PAYMENT_EVENT'; end if;
  if (old.order_id is not null and new.order_id is distinct from old.order_id) or (old.payment_id is not null and new.payment_id is distinct from old.payment_id) then raise exception 'IMMUTABLE_PAYMENT_EVENT'; end if;
  if old.state = 'APPLIED' and (to_jsonb(new)-'replay_count') is distinct from (to_jsonb(old)-'replay_count') then raise exception 'IMMUTABLE_PAYMENT_EVENT'; end if;
  if new.replay_count < old.replay_count then raise exception 'INVALID_REPLAY_COUNT'; end if;
  return new;
end $$;
create trigger guard_payment_event before update on public.payment_events for each row execute function ftu_sales_private.guard_payment_event();

create function ftu_sales_private.guard_event_publication() returns trigger language plpgsql security definer set search_path = '' as $$
declare eid uuid; e public.events;
begin
  if tg_table_name = 'events' then eid = new.id; else eid = coalesce(new.event_id,old.event_id); end if;
  select * into e from public.events where id = eid;
  if e.published then
    if (select count(*) from public.ticket_categories where event_id = eid and enabled) <> 2 or not exists(select 1 from public.event_seats where event_id = eid and enabled) then raise exception 'EVENT_NOT_CONFIGURED'; end if;
    if exists(select 1 from public.tickets where round_id = e.round_id and event_id is null) then raise exception 'LEGACY_TICKET_MAPPING_REQUIRED'; end if;
  end if;
  return null;
end $$;
create constraint trigger event_publication after insert or update on public.events deferrable initially deferred for each row execute function ftu_sales_private.guard_event_publication();
create constraint trigger category_publication after insert or update or delete on public.ticket_categories deferrable initially deferred for each row execute function ftu_sales_private.guard_event_publication();
create constraint trigger seat_publication after insert or update or delete on public.event_seats deferrable initially deferred for each row execute function ftu_sales_private.guard_event_publication();

create function ftu_sales_private.guard_seat_edit() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and row(new.event_id,new.category_id,new.label,new.enabled) is distinct from row(old.event_id,old.category_id,old.label,old.enabled)
    and (exists(select 1 from public.order_items where seat_id = old.id) or exists(select 1 from public.tickets where seat_id = old.id)) then raise exception 'IMMUTABLE_SEAT'; end if;
  return new;
end $$;
create trigger guard_seat_edit before update on public.event_seats for each row execute function ftu_sales_private.guard_seat_edit();

create function ftu_sales_private.guard_reservation() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if row(new.order_id,new.event_id,new.category_id,new.quantity,new.expires_at) is distinct from row(old.order_id,old.event_id,old.category_id,old.quantity,old.expires_at) then raise exception 'IMMUTABLE_RESERVATION'; end if;
  if new.state <> old.state and old.state <> 'HELD' then raise exception 'INVALID_HOLD_TRANSITION'; end if;
  return new;
end $$;
create trigger guard_reservation before update on public.order_reservations for each row execute function ftu_sales_private.guard_reservation();

create function ftu_sales_private.mirror_checkin() returns trigger language plpgsql security definer set search_path = '' as $$
declare origin text;
begin
  if new.event_id is not null and new.checked_in_at is not null then
    if tg_op = 'UPDATE' and old.event_id is null and old.checked_in_at is not null then origin = 'LEGACY'; else origin = 'STAFF'; end if;
    if origin = 'STAFF' and (new.status <> 'issued' or not public.has_role(new.checked_in_by,array['CHECKIN_STAFF'])) then raise exception 'FORBIDDEN'; end if;
    insert into public.checkins(ticket_id,event_id,actor_id,checked_in_at,source) values(new.id,new.event_id,new.checked_in_by,new.checked_in_at,origin) on conflict(ticket_id) do nothing;
    if exists(select 1 from public.checkins where ticket_id = new.id and (event_id <> new.event_id or checked_in_at <> new.checked_in_at or actor_id is distinct from new.checked_in_by)) then raise exception 'CHECKIN_MISMATCH'; end if;
  end if;
  return null;
end $$;
create trigger mirror_checkin after insert or update on public.tickets for each row execute function ftu_sales_private.mirror_checkin();

create function ftu_sales_private.check_checkin_consistency() returns trigger language plpgsql security definer set search_path = '' as $$
declare t public.tickets;
begin
  select * into t from public.tickets where id = new.ticket_id;
  if row(new.event_id,new.actor_id,new.checked_in_at) is distinct from row(t.event_id,t.checked_in_by,t.checked_in_at) then raise exception 'CHECKIN_MISMATCH'; end if;
  if new.source = 'STAFF' and not public.has_role(new.actor_id,array['CHECKIN_STAFF']) then raise exception 'FORBIDDEN'; end if;
  return null;
end $$;
create constraint trigger checkin_consistency after insert on public.checkins deferrable initially deferred for each row execute function ftu_sales_private.check_checkin_consistency();

create function ftu_sales_private.guard_vote() returns trigger language plpgsql security definer set search_path = '' as $$
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
  if t.event_id is null and exists(select 1 from public.events where round_id = new.round_id) then raise exception 'LEGACY_TICKET_MAPPING_REQUIRED'; end if;
  if exists(select 1 from public.votes where round_id = new.round_id and ticket_id = new.ticket_id and vote_format = 'LEGACY') then raise exception 'LEGACY_VOTE_RECONCILIATION_REQUIRED'; end if;
  if s.state <> 'OPEN' or not s.published or clock_timestamp() < s.open_at or clock_timestamp() >= s.close_at then raise exception 'VOTE_CLOSED'; end if;
  if not exists(select 1 from public.vote_eligible_contestants e join public.round_entries r on r.round_id = e.round_id and r.contestant_id = e.contestant_id join public.contestants c on c.id = e.contestant_id
    where e.session_id = new.session_id and e.category_id = new.category_id and e.round_id = new.round_id and e.contestant_id = new.contestant_id and r.eligible and c.published and c.edition_id = new.edition_id) then raise exception 'CONTESTANT_NOT_ELIGIBLE'; end if;
  return new;
end $$;
create trigger guard_vote before insert or update or delete on public.votes for each row execute function ftu_sales_private.guard_vote();

create function ftu_sales_private.guard_vote_session() returns trigger language plpgsql security definer set search_path = '' as $$
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
end $$;
create trigger guard_vote_session before insert or update on public.vote_sessions for each row execute function ftu_sales_private.guard_vote_session();

create function ftu_sales_private.guard_vote_configuration() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.vote_sessions where round_id = any(array[new.round_id,old.round_id]) order by id for update;
  if exists(select 1 from public.vote_sessions where round_id = any(array[new.round_id,old.round_id]) and state in ('OPEN','CLOSED','FINALIZED')) then raise exception 'VOTING_HAS_STARTED'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger guard_vote_categories before insert or update or delete on public.vote_categories for each row execute function ftu_sales_private.guard_vote_configuration();
create trigger guard_vote_eligible before insert or update or delete on public.vote_eligible_contestants for each row execute function ftu_sales_private.guard_vote_configuration();
create trigger guard_round_entries before insert or update or delete on public.round_entries for each row execute function ftu_sales_private.guard_vote_configuration();

create function ftu_sales_private.guard_snapshot() returns trigger language plpgsql security definer set search_path = '' as $$
declare expected jsonb;
begin
  if not public.has_role(new.created_by,array['VOTE_MANAGER']) then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from public.vote_sessions where id = new.session_id and state = 'FINALIZED') then raise exception 'VOTING_NOT_FINALIZED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('contestant_id',e.contestant_id,'votes',(select count(*) from public.votes v where v.round_id = new.round_id and v.category_id = new.category_id and v.contestant_id = e.contestant_id)) order by e.contestant_id),'[]'::jsonb)
    into expected from public.vote_eligible_contestants e where e.session_id = new.session_id and e.category_id = new.category_id;
  if new.results <> expected then raise exception 'SNAPSHOT_COUNT_MISMATCH'; end if;
  return new;
end $$;
create trigger guard_snapshot before insert on public.vote_result_snapshots for each row execute function ftu_sales_private.guard_snapshot();

create function ftu_sales_private.immutable_record() returns trigger language plpgsql security definer set search_path = '' as $$
begin raise exception 'IMMUTABLE_RECORD'; end $$;
create trigger immutable_order_items before update or delete on public.order_items for each row execute function ftu_sales_private.immutable_record();
create trigger immutable_checkins before update or delete on public.checkins for each row execute function ftu_sales_private.immutable_record();
create trigger immutable_snapshots before update or delete on public.vote_result_snapshots for each row execute function ftu_sales_private.immutable_record();
create trigger immutable_incidents before update or delete on public.vote_incident_logs for each row execute function ftu_sales_private.immutable_record();
create trigger immutable_ticket_history before delete on public.tickets for each row execute function ftu_sales_private.immutable_record();
create trigger immutable_orders before delete on public.orders for each row execute function ftu_sales_private.immutable_record();
create trigger immutable_reservations before delete on public.order_reservations for each row execute function ftu_sales_private.immutable_record();
create trigger immutable_holds before delete on public.seat_holds for each row execute function ftu_sales_private.immutable_record();
create trigger immutable_payments before delete on public.payments for each row execute function ftu_sales_private.immutable_record();
create trigger immutable_payment_events before delete on public.payment_events for each row execute function ftu_sales_private.immutable_record();

-- Legacy RPC compatibility boundaries: category/session rounds must use the new contracts.
create or replace function public.cast_vote(p_user uuid,p_round uuid,p_ticket uuid,p_contestant uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.contest_rounds;t public.tickets;existing public.votes;vid uuid;
begin
 if exists(select 1 from public.vote_categories where round_id=p_round) or exists(select 1 from public.vote_sessions where round_id=p_round) then raise exception 'VOTING_CATEGORY_REQUIRED';end if;
 select * into r from public.contest_rounds where id=p_round for share;
 if not found or not r.published or r.kind<>'final' then raise exception 'VOTE_CLOSED';end if;
 select * into t from public.tickets where id=p_ticket and round_id=p_round and user_id=p_user and status='issued' and checked_in_at is not null for update;
 if not found then raise exception 'TICKET_NOT_ELIGIBLE';end if;
 select * into existing from public.votes where round_id=p_round and ticket_id=p_ticket;
 if found then if existing.contestant_id=p_contestant then return jsonb_build_object('id',existing.id,'already_recorded',true);else raise exception 'ALREADY_VOTED';end if;end if;
 -- Check DB clock after waiting for locks; a queued request cannot sneak past the closing time.
 if r.vote_open_at is null or r.vote_close_at is null or clock_timestamp()<r.vote_open_at or clock_timestamp()>=r.vote_close_at then raise exception 'VOTE_CLOSED';end if;
 perform 1 from public.round_entries re join public.contestants c on c.id=re.contestant_id where re.round_id=p_round and re.contestant_id=p_contestant and re.eligible and c.published and c.edition_id=r.edition_id;
 if not found then raise exception 'CONTESTANT_NOT_ELIGIBLE';end if;
 insert into public.votes(edition_id,round_id,ticket_id,contestant_id,user_id) values(r.edition_id,p_round,p_ticket,p_contestant,p_user) returning id into vid;
 return jsonb_build_object('id',vid,'already_recorded',false);
end$$;
create or replace function public.open_voting(p_actor uuid,p_aal text,p_round uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.contest_rounds;opened timestamptz;
begin
 if exists(select 1 from public.vote_sessions where round_id=p_round) or exists(select 1 from public.vote_categories where round_id=p_round) then raise exception 'VOTING_SESSION_REQUIRED';end if;
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

-- Explicit access policy: catalog is public only when published; private writes are server-only.
do $$ declare t text; begin
  foreach t in array array['events','ticket_categories','event_seats','orders','order_items','order_reservations','seat_holds','payments','payment_events','checkins','ticket_delivery_secrets','vote_sessions','vote_categories','vote_eligible_contestants','vote_result_snapshots','vote_incident_logs'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update on table public.%I to service_role',t);
  end loop;
end $$;
revoke all on public.ticket_inventory from public,anon,authenticated;
grant select on public.ticket_inventory to service_role;
grant select on public.events,public.ticket_categories,public.event_seats to anon,authenticated;
create policy public_events on public.events for select to anon,authenticated using (published and exists(select 1 from public.contest_editions e where e.id = edition_id and e.published));
create policy public_categories on public.ticket_categories for select to anon,authenticated using (enabled and exists(select 1 from public.events e where e.id = event_id and e.published));
create policy public_seats on public.event_seats for select to anon,authenticated using (exists(select 1 from public.events e where e.id = event_id and e.published));
grant select on public.orders,public.order_items,public.order_reservations to authenticated;
create policy own_orders on public.orders for select to authenticated using (user_id = (select auth.uid()));
create policy own_order_items on public.order_items for select to authenticated using (exists(select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));
create policy own_reservations on public.order_reservations for select to authenticated using (exists(select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));
grant select(id,order_id,provider,mode,expected_amount_vnd,received_amount_vnd,currency,status,created_at,confirmed_at) on public.payments to authenticated;
create policy own_payments on public.payments for select to authenticated using (exists(select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));
grant select(id,event_id,category_id,seat_id,order_item_id,source) on public.tickets to authenticated;
revoke select on public.votes from authenticated;
grant select(id,edition_id,round_id,ticket_id,contestant_id,user_id,created_at,category_id,session_id,vote_format) on public.votes to authenticated;
-- Keep existing ownership policies on tickets and votes, no new direct writes.
grant select(id,edition_id,round_id,title,state,duration_seconds,open_at,close_at,published,results_published) on public.vote_sessions to anon,authenticated;
grant select on public.vote_categories,public.vote_eligible_contestants to anon,authenticated;
create policy public_vote_sessions on public.vote_sessions for select to anon,authenticated using (published and state <> 'DRAFT' and exists(select 1 from public.contest_rounds r where r.id = round_id and r.published));
create policy public_vote_categories on public.vote_categories for select to anon,authenticated using (exists(select 1 from public.vote_sessions s where s.round_id = vote_categories.round_id and s.published));
create policy public_vote_eligible on public.vote_eligible_contestants for select to anon,authenticated using (exists(select 1 from public.vote_sessions s where s.id = session_id and s.published) and exists(select 1 from public.contestants c where c.id = contestant_id and c.published));
-- Snapshots, incidents, payment_events, raw token hashes and holds stay inaccessible to clients.
revoke all on all functions in schema ftu_sales_private from public,anon,authenticated,service_role;
commit;
