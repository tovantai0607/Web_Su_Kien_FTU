begin;

-- A stock of management codes, not pre-issued tickets. Legacy ticket UUIDs and
-- codes remain unchanged; each registry code has a permanent one-to-one link.
create table ftu_sales_private.ticket_code_batches (
  round_id uuid primary key references public.contest_rounds,
  offer_id uuid not null unique references public.purchase_offers,
  prefix text not null unique check(prefix in ('BK','CK','DM')),
  mode text not null check(mode in ('LIVE','DEMO')),
  capacity integer not null check(capacity between 1 and 99999),
  unique(round_id,prefix),
  check((mode='DEMO' and prefix='DM') or (mode='LIVE' and prefix in ('BK','CK')))
);
create table ftu_sales_private.ticket_code_slots (
  round_id uuid not null,
  prefix text not null,
  sequence integer not null check(sequence between 1 and 99999),
  code text generated always as (prefix||lpad(sequence::text,5,'0')) stored primary key,
  ticket_id uuid unique references public.tickets,
  linked_at timestamptz,
  line_snapshot jsonb,
  foreign key(round_id,prefix) references ftu_sales_private.ticket_code_batches(round_id,prefix),
  unique(round_id,sequence),
  check((ticket_id is null and linked_at is null and line_snapshot is null) or (ticket_id is not null and linked_at is not null and line_snapshot is not null))
);
create index ticket_code_slots_free on ftu_sales_private.ticket_code_slots(round_id,sequence) where ticket_id is null;
alter table ftu_sales_private.ticket_code_batches enable row level security;
alter table ftu_sales_private.ticket_code_slots enable row level security;
revoke all on ftu_sales_private.ticket_code_batches,ftu_sales_private.ticket_code_slots from public,anon,authenticated,service_role;

create function ftu_sales_private.protect_ticket_code() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'IMMUTABLE_TICKET_CODE';end if;
  if row(new.round_id,new.prefix,new.sequence) is distinct from row(old.round_id,old.prefix,old.sequence)
    or old.ticket_id is not null then raise exception 'IMMUTABLE_TICKET_CODE';end if;
  return new;
end $$;
create trigger protect_ticket_code before update or delete on ftu_sales_private.ticket_code_slots
for each row execute function ftu_sales_private.protect_ticket_code();

create function ftu_sales_private.assign_ticket_code(p_ticket uuid) returns text
language plpgsql security definer set search_path='' as $$
declare t public.tickets; r public.purchase_requests; b ftu_sales_private.ticket_code_batches;
  found_code text; next_sequence integer;
begin
  select * into t from public.tickets where id=p_ticket;
  if not found or t.source<>'SUPPLEMENT' or t.status<>'issued' then return null;end if;
  select * into r from public.purchase_requests where id=t.purchase_id;
  if r.status<>'COMPLETED' or row(r.user_id,r.round_id,r.edition_id) is distinct from row(t.user_id,t.round_id,t.edition_id)
    then raise exception 'INVALID_PURCHASE_TICKET';end if;
  -- Completion and Sheet edits already hold offer -> request -> products -> tickets.
  -- All allocators then serialize on this batch; a combo's ascending ordinals stay together.
  select * into b from ftu_sales_private.ticket_code_batches where offer_id=r.offer_id for update;
  if not found then return null;end if;
  if b.round_id<>t.round_id then raise exception 'INVALID_TICKET_CODE_SCOPE';end if;
  select code into found_code from ftu_sales_private.ticket_code_slots where ticket_id=t.id;
  if found then return found_code;end if;
  select code into found_code from ftu_sales_private.ticket_code_slots
    where round_id=b.round_id and ticket_id is null order by sequence limit 1 for update;
  if not found then
    select coalesce(max(sequence),0)+1 into next_sequence from ftu_sales_private.ticket_code_slots where round_id=b.round_id;
    if next_sequence>b.capacity then raise exception 'TICKET_CODE_STOCK_EXHAUSTED';end if;
    insert into ftu_sales_private.ticket_code_slots(round_id,prefix,sequence) values(b.round_id,b.prefix,next_sequence) returning code into found_code;
  end if;
  update ftu_sales_private.ticket_code_slots set ticket_id=t.id,linked_at=clock_timestamp(),
    line_snapshot=ftu_sales_private.ticket_code_line(r.id,t.purchase_ordinal) where code=found_code;
  return found_code;
end $$;
create function ftu_sales_private.assign_inserted_ticket_code() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform ftu_sales_private.assign_ticket_code(new.id);return new;end $$;
create trigger assign_inserted_ticket_code after insert on public.tickets
for each row execute function ftu_sales_private.assign_inserted_ticket_code();

create function public.configure_ticket_code_stock(p_offer uuid,p_prefix text,p_initial integer,p_capacity integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.purchase_offers; kind text; b ftu_sales_private.ticket_code_batches; t record;
begin
  select * into o from public.purchase_offers where id=p_offer for update;
  if not found then raise exception 'PURCHASE_NOT_FOUND';end if;
  select r.kind into kind from public.contest_rounds r where r.id=o.round_id;
  if not ((o.mode='DEMO' and p_prefix='DM') or (o.mode='LIVE' and p_prefix=case kind when 'semifinal' then 'BK' when 'final' then 'CK' else '' end))
    or p_initial is null or p_capacity is null or p_initial not between 1 and 99999 or p_capacity not between p_initial and 99999
    then raise exception 'INVALID_TICKET_CODE_SCOPE';end if;
  if o.mode='LIVE' and (o.total_quota is distinct from 700 or p_capacity<>700) then raise exception 'PROGRAM_CAPACITY_FIXED';end if;
  select * into b from ftu_sales_private.ticket_code_batches where round_id=o.round_id for update;
  if found then
    if row(b.offer_id,b.prefix,b.mode,b.capacity) is distinct from row(o.id,p_prefix,o.mode,p_capacity) then raise exception 'IMMUTABLE_TICKET_CODE_SCOPE';end if;
  else
    insert into ftu_sales_private.ticket_code_batches values(o.round_id,o.id,p_prefix,o.mode,p_capacity);
  end if;
  insert into ftu_sales_private.ticket_code_slots(round_id,prefix,sequence)
    select o.round_id,p_prefix,n from generate_series(1,p_initial) n
    on conflict(round_id,sequence) do nothing;
  -- Map existing completed tickets without changing their historical code/UUID/votes.
  -- The stock count includes these assigned slots, not an extra set of issued tickets.
  for t in select ticket.id from public.tickets ticket join public.purchase_requests r on r.id=ticket.purchase_id
    where r.offer_id=o.id and r.status='COMPLETED' and ticket.source='SUPPLEMENT' and ticket.status='issued'
    order by r.completed_at,r.id,ticket.purchase_ordinal,ticket.id
  loop perform ftu_sales_private.assign_ticket_code(t.id);end loop;
  return (select jsonb_build_object('prefix',p_prefix,'count',count(*),'assigned',count(ticket_id),'available',count(*)-count(ticket_id))
    from ftu_sales_private.ticket_code_slots where round_id=o.round_id);
end $$;

create function ftu_sales_private.ticket_code_line(p_request uuid,p_ordinal bigint)
returns jsonb language sql stable security definer set search_path='' as $$
  with lines as (
    select value,ordinality,line_end,coalesce(lag(line_end) over(order by ordinality),0) line_start from (
      select value,ordinality,sum((value->>'ticket_quantity')::bigint) over(order by ordinality) line_end
      from public.purchase_requests r cross join lateral jsonb_array_elements(r.lines) with ordinality where r.id=p_request
    ) x
  ) select value||jsonb_build_object('group_code',p_request::text||':'||ordinality||':'||(floor((p_ordinal-line_start-1)/(value->>'bundle_size')::integer)::bigint+1))
    from lines where p_ordinal>line_start and p_ordinal<=line_end;
$$;

create function public.read_ticket_code_register(p_actor uuid,p_aal text,p_mode text,p_page integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.has_role(p_actor,array['TICKET_STAFF']) or
    (p_aal is distinct from 'aal2' and (p_aal is distinct from 'aal1' or not public.has_role(p_actor,array['SUPER_ADMIN'])))
    then raise exception 'FORBIDDEN';end if;
  if p_mode not in ('LIVE','DEMO') or p_mode is null or p_page is null or p_page not between 0 and 10000 then raise exception 'INVALID_LIMIT';end if;
  select jsonb_build_object('count',(select count(*) from ftu_sales_private.ticket_code_slots s join ftu_sales_private.ticket_code_batches b using(round_id,prefix) where b.mode=p_mode),
    'rows',coalesce(jsonb_agg(to_jsonb(page) order by page.prefix,page.sequence),'[]'::jsonb)) into result from (
    select s.code,s.prefix,s.sequence,s.round_id,s.ticket_id,b.mode,b.offer_id,
      case when s.ticket_id is null then 'AVAILABLE' when t.status='issued' then 'ISSUED' else 'RETIRED' end status,
      r.id request_id,r.code order_code,r.buyer,r.evidence_id,r.completed_at,t.ticket_code legacy_code,
      case when t.status='issued' then ftu_sales_private.ticket_code_line(r.id,t.purchase_ordinal) else s.line_snapshot end line
    from ftu_sales_private.ticket_code_slots s join ftu_sales_private.ticket_code_batches b using(round_id,prefix)
      left join public.tickets t on t.id=s.ticket_id left join public.purchase_requests r on r.id=t.purchase_id
    where b.mode=p_mode order by s.prefix,s.sequence limit 200 offset p_page*200
  ) page;
  return result;
end $$;
create function public.read_own_ticket_codes(p_user uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('ticket_id',t.id,'display_code',s.code,'group_code',ftu_sales_private.ticket_code_line(t.purchase_id,t.purchase_ordinal)->>'group_code')),'[]'::jsonb)
  from public.tickets t join ftu_sales_private.ticket_code_slots s on s.ticket_id=t.id where t.user_id=p_user;
$$;
revoke all on function public.configure_ticket_code_stock(uuid,text,integer,integer),public.read_ticket_code_register(uuid,text,text,integer),public.read_own_ticket_codes(uuid) from public,anon,authenticated;
grant execute on function public.configure_ticket_code_stock(uuid,text,integer,integer),public.read_ticket_code_register(uuid,text,text,integer),public.read_own_ticket_codes(uuid) to service_role;
revoke all on function ftu_sales_private.protect_ticket_code(),ftu_sales_private.assign_ticket_code(uuid),ftu_sales_private.assign_inserted_ticket_code(),ftu_sales_private.ticket_code_line(uuid,bigint) from public,anon,authenticated,service_role;
commit;
