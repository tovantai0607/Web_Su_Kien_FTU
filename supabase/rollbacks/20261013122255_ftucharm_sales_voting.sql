-- Reviewed rollback for an EMPTY stage-02 rollout only. Never run against an unknown environment.
-- Any new sales/voting records or mapped legacy data abort this transaction.
-- After real writes, use a reviewed forward/compensating migration and code rollback instead.
begin;
set local lock_timeout = '5s';
do $$ declare t text; populated boolean; begin
  foreach t in array array['events','ticket_categories','event_seats','orders','order_items','order_reservations','seat_holds','payments','payment_events','checkins','ticket_delivery_secrets','vote_sessions','vote_categories','vote_eligible_contestants','vote_result_snapshots','vote_incident_logs'] loop
    execute format('select exists(select 1 from public.%I)',t) into populated;
    if populated then raise exception 'ROLLBACK_HAS_DATA: %',t; end if;
  end loop;
  if exists(select 1 from public.tickets where event_id is not null or category_id is not null or seat_id is not null or order_item_id is not null or source <> 'LEGACY')
    or exists(select 1 from public.votes where category_id is not null or session_id is not null or vote_format <> 'LEGACY') then raise exception 'ROLLBACK_HAS_MAPPED_DATA'; end if;
end $$;
drop view public.ticket_inventory;
drop trigger guard_ticket on public.tickets;
drop trigger mirror_checkin on public.tickets;
drop trigger immutable_ticket_history on public.tickets;
drop trigger guard_vote on public.votes;
drop trigger guard_round_entries on public.round_entries;
drop table public.checkins,public.ticket_delivery_secrets;
drop table public.vote_incident_logs,public.vote_result_snapshots,public.vote_eligible_contestants;
alter table public.votes drop column category_id,drop column session_id,drop column vote_format,drop column classified_by,drop column classified_at;
alter table public.votes add constraint votes_round_id_ticket_id_key unique(round_id,ticket_id);
grant select on public.votes to authenticated;
alter table public.tickets drop constraint tickets_owner_scope;
alter table public.tickets drop column event_id,drop column category_id,drop column seat_id,drop column order_item_id,drop column source;
alter table public.tickets add constraint tickets_round_id_seat_label_key unique(round_id,seat_label);
drop table public.vote_categories,public.vote_sessions;
drop table public.payment_events,public.payments,public.seat_holds,public.order_reservations;
drop table public.order_items,public.orders;
drop table public.event_seats,public.ticket_categories,public.events;
create or replace function public.cast_vote(p_user uuid,p_round uuid,p_ticket uuid,p_contestant uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.contest_rounds;t public.tickets;existing public.votes;vid uuid;
begin
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
drop function ftu_sales_private.guard_order(),ftu_sales_private.guard_order_item(),ftu_sales_private.guard_hold(),ftu_sales_private.guard_ticket(),ftu_sales_private.check_order_consistency(),ftu_sales_private.guard_payment(),ftu_sales_private.guard_payment_event(),ftu_sales_private.guard_event_publication(),ftu_sales_private.guard_seat_edit(),ftu_sales_private.guard_reservation(),ftu_sales_private.mirror_checkin(),ftu_sales_private.guard_vote(),ftu_sales_private.guard_vote_session(),ftu_sales_private.guard_vote_configuration(),ftu_sales_private.guard_snapshot(),ftu_sales_private.immutable_record();
drop function ftu_sales_private.check_checkin_consistency();
drop schema ftu_sales_private;
commit;
