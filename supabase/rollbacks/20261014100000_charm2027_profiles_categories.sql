-- Operational rollback for review only. Stop application writes first.
-- Keeps new profile columns/data and the draft edition. Does NOT reset migration history.
-- Once gender voting has started, use a reviewed forward fix; never discard ballots.
begin;
do $$ begin
 if exists(select 1 from public.vote_categories c join public.vote_sessions s on s.round_id=c.round_id where c.gender is not null and s.state<>'DRAFT')
   or exists(select 1 from public.votes v join public.vote_categories c on c.id=v.category_id where c.gender is not null)
 then raise exception 'ROLLBACK_BLOCKED: gender voting has started; use a forward fix'; end if;
end $$;
delete from public.vote_eligible_contestants where category_id in(select id from public.vote_categories where gender is not null);
delete from public.vote_categories where gender is not null;
drop trigger guard_contestant_gender on public.contestants;
drop trigger guard_eligible_gender on public.vote_eligible_contestants;
drop trigger guard_vote_gender on public.votes;
drop trigger guard_category_assignment on public.vote_categories;
drop function ftu_sales_private.guard_contestant_gender(),ftu_sales_private.guard_category_gender(),ftu_sales_private.guard_category_assignment();
drop function public.cast_category_vote(uuid,uuid,uuid,uuid,uuid,uuid),public.update_contestant_details(uuid,text,uuid,jsonb),public.prepare_gender_voting(uuid,text,uuid);
drop policy public_vote_categories on public.vote_categories;
create policy public_vote_categories on public.vote_categories for select to anon,authenticated using (exists(select 1 from public.vote_sessions s where s.round_id=vote_categories.round_id and s.published));
grant select on public.news_posts to anon,authenticated;
create or replace function public.apply_contestant(p_user uuid,p_data jsonb,p_key uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.contest_editions; cid uuid; code text; result jsonb; cached public.api_idempotency;mid uuid; card_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text||p_key::text,0));
 select * into cached from public.api_idempotency where user_id=p_user and key=p_key and operation='apply';
 if found then if cached.request_hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT';end if;return cached.result;end if;
 select * into e from public.contest_editions where id=(p_data->>'edition_id')::uuid for share;
 if not found or not e.published or e.registration_open_at is null or clock_timestamp()<e.registration_open_at or e.registration_close_at is null or clock_timestamp()>=e.registration_close_at then raise exception 'REGISTRATION_CLOSED';end if;
 if p_data->>'student_card_media_id' is null then raise exception 'INVALID_STUDENT_CARD';end if;
 card_id=(p_data->>'student_card_media_id')::uuid;
 if (select count(*) from jsonb_array_elements_text(p_data->'media_ids'))<>3 then raise exception 'INVALID_MEDIA';end if;
 for mid in select value::uuid from jsonb_array_elements_text(p_data->'media_ids') loop
  perform 1 from public.media_assets where id=mid and user_id=p_user and edition_id=e.id and state='ready' and purpose='portfolio' for update;
  if not found then raise exception 'INVALID_MEDIA';end if;
 end loop;
 if (select count(distinct value) from jsonb_array_elements_text(p_data->'media_ids'))<>3 then raise exception 'INVALID_MEDIA';end if;
 if exists(select 1 from jsonb_array_elements_text(p_data->'media_ids') where value::uuid=card_id) then raise exception 'INVALID_STUDENT_CARD';end if;
 perform 1 from public.media_assets where id=card_id and user_id=p_user and edition_id=e.id and state='ready' and purpose='student_card' for update;
 if not found then raise exception 'INVALID_STUDENT_CARD';end if;
 cid=gen_random_uuid();code='FTC-'||upper(substr(replace(cid::text,'-',''),1,12));
 insert into public.contestants(id,edition_id,user_id,slug,display_name,faculty,bio,talents) values(cid,e.id,p_user,cid::text,p_data->>'full_name',p_data->>'faculty',p_data->>'bio',p_data->>'talents');
 insert into public.contestant_private(id,edition_id,user_id,full_name,email,phone,university,code,student_card_media_id) values(cid,e.id,p_user,p_data->>'full_name',lower(p_data->>'email'),p_data->>'phone','Đại học Ngoại thương',code,card_id);
 insert into public.contestant_media select cid,value::uuid,(array['portrait','half','full'])[ordinality] from jsonb_array_elements_text(p_data->'media_ids') with ordinality;
 update public.media_assets set state='attached' where id=card_id or id in(select value::uuid from jsonb_array_elements_text(p_data->'media_ids'));
 insert into public.consent_records(edition_id,user_id,version) values(e.id,p_user,'2026-10-v2-student-card');
 insert into public.email_outbox(edition_id,to_email,template,payload,dedupe_key) values(e.id,lower(p_data->>'email'),'received',jsonb_build_object('code',code),'apply:'||cid);
 result=jsonb_build_object('id',cid,'code',code,'status','pending');
 insert into public.api_idempotency values(p_user,p_key,'apply',p_hash,result,now());return result;
end$$;
create or replace function public.admin_save(p_actor uuid,p_aal text,p_table text,p_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare required_role text;cols text='';vals text='';updates text='';k text;result jsonb;allowed text[];
begin
 case p_table
 when 'contest_editions' then required_role='CONTENT_EDITOR';allowed=array['slug','title','theme','year','registration_open_at','registration_close_at','published'];
 when 'contest_rounds' then required_role='VOTE_MANAGER';allowed=array['edition_id','title','kind','position','cutoff','published','vote_open_at','vote_close_at'];
 when 'timeline_events' then required_role='CONTENT_EDITOR';allowed=array['edition_id','title','description','position','starts_at','ends_at','published'];
 when 'news_posts' then required_role='CONTENT_EDITOR';allowed=array['edition_id','title','slug','excerpt','body','category','published'];
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
end$$;
create or replace function public.update_application(p_user uuid,p_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.contestant_private where id=p_id and user_id=p_user and status='needs_changes' for update;
 if not found then raise exception 'FORBIDDEN';end if;
 update public.contestants set faculty=p_data->>'faculty',bio=p_data->>'bio',talents=p_data->>'talents' where id=p_id;
 update public.contestant_private set status='pending',note=null where id=p_id;
 return jsonb_build_object('id',p_id,'status','pending');
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
  if t.event_id is null and exists(select 1 from public.events where round_id = new.round_id) then raise exception 'LEGACY_TICKET_MAPPING_REQUIRED'; end if;
  if exists(select 1 from public.votes where round_id = new.round_id and ticket_id = new.ticket_id and vote_format = 'LEGACY') then raise exception 'LEGACY_VOTE_RECONCILIATION_REQUIRED'; end if;
  if s.state <> 'OPEN' or not s.published or clock_timestamp() < s.open_at or clock_timestamp() >= s.close_at then raise exception 'VOTE_CLOSED'; end if;
  if not exists(select 1 from public.vote_eligible_contestants e join public.round_entries r on r.round_id = e.round_id and r.contestant_id = e.contestant_id join public.contestants c on c.id = e.contestant_id
    where e.session_id = new.session_id and e.category_id = new.category_id and e.round_id = new.round_id and e.contestant_id = new.contestant_id and r.eligible and c.published and c.edition_id = new.edition_id) then raise exception 'CONTESTANT_NOT_ELIGIBLE'; end if;
  return new;
end $$;
drop function public.open_gender_voting(uuid,text,uuid);
commit;
