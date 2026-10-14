-- Only for an unused release. Preserve all receipts, proofs and votes; use a forward fix after use.
begin;
do $$begin
  if exists(select 1 from public.purchase_offers) or exists(select 1 from public.purchase_requests)
    or exists(select 1 from public.tickets where source='SUPPLEMENT') then
    raise exception 'ROLLBACK_BLOCKED_RETAIN_PURCHASE_DATA';
  end if;
end $$;
create or replace function ftu_sales_private.guard_ticket() returns trigger language plpgsql security definer set search_path = '' as $$
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
  if not found or t.user_id <> new.user_id or t.status <> 'issued' or (t.checked_in_at is null and exists(select 1 from public.vote_categories where id=new.category_id and gender is not null)) or t.round_id <> new.round_id or t.edition_id <> new.edition_id then raise exception 'TICKET_NOT_ELIGIBLE'; end if;
  if t.event_id is null and exists(select 1 from public.events where round_id = new.round_id) then raise exception 'LEGACY_TICKET_MAPPING_REQUIRED'; end if;
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
  if not found or not r.published or r.kind<>'final' or not exists(select 1 from public.contest_editions where id=r.edition_id and published) then raise exception 'VOTE_CLOSED'; end if;
  select * into s from public.vote_sessions where id=p_session and round_id=p_round for share;
  if not found then raise exception 'VOTE_CLOSED'; end if;
  select * into t from public.tickets where id=p_ticket and round_id=p_round and user_id=p_user and status='issued' and checked_in_at is not null for update;
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
  if not found or r.kind<>'final' then raise exception 'NOT_FOUND'; end if;
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
  if not found or r.kind<>'final' or not r.published then raise exception 'VOTE_CLOSED'; end if;
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

create or replace function public.open_voting(p_actor uuid,p_aal text,p_round uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.contest_rounds;opened timestamptz;
begin
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
drop function public.classify_purchase_legacy_vote(uuid,text,uuid,uuid);
drop function public.purchase_statistics(uuid,text);
drop function public.manage_purchase_voting(uuid,text,uuid,text,text);
drop function public.expire_purchase_holds(integer);
drop function public.complete_purchase(uuid,uuid,uuid);
drop function public.attach_purchase_evidence(uuid,uuid,uuid,text,integer);
drop function public.reserve_purchase(uuid,jsonb,uuid,text);
drop function public.read_purchase(uuid,uuid);
drop function public.purchase_catalog(text);
drop function public.save_purchase_offer(uuid,text,jsonb);
alter table public.tickets drop constraint supplement_ticket_scope;
drop index public.supplement_ticket_ordinal;
alter table public.tickets drop column ticket_code,drop column purchase_ordinal,drop column purchase_id;
alter table public.tickets drop constraint tickets_source_check;
alter table public.tickets add constraint tickets_source_check check(source in ('LEGACY','PAID'));
alter table public.purchase_requests drop constraint purchase_evidence_scope;
drop table public.purchase_evidence;
drop table public.purchase_allocations;
drop table public.purchase_requests;
drop function ftu_sales_private.guard_purchase();
drop table public.purchase_products;
drop table public.purchase_offers;
commit;
