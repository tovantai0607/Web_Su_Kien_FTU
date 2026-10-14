begin;

-- Additive changes: historical profiles remain unknown until explicitly completed.
alter table public.contestants
  add column cohort text check (cohort is null or length(trim(cohort)) between 1 and 30),
  add column class_name text check (class_name is null or length(trim(class_name)) between 1 and 80),
  add column height_cm numeric(4,1) check (height_cm between 100 and 250),
  add column gender text check (gender in ('male','female'));
grant select(cohort,class_name,height_cm,gender) on public.contestants to anon,authenticated;
alter table public.vote_categories add column gender text check (gender in ('male','female'));
create unique index vote_categories_gender on public.vote_categories(round_id,gender) where gender is not null;

-- Archive the news feature without destroying historical content.
revoke select on public.news_posts,public.news_categories from anon,authenticated;

create function ftu_sales_private.guard_contestant_gender() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.gender is distinct from old.gender and (
    exists(select 1 from public.vote_eligible_contestants where contestant_id=old.id)
    or exists(select 1 from public.votes where contestant_id=old.id)
  ) then raise exception 'VOTING_HAS_STARTED'; end if;
  return new;
end $$;
create trigger guard_contestant_gender before update of gender on public.contestants
for each row execute function ftu_sales_private.guard_contestant_gender();

create function ftu_sales_private.guard_category_gender() returns trigger
language plpgsql security definer set search_path='' as $$
declare g text; cg text;
begin
  select gender into g from public.vote_categories where id=new.category_id for share;
  select gender into cg from public.contestants where id=new.contestant_id for share;
  if g is not null and g is distinct from cg then raise exception 'CONTESTANT_CATEGORY_MISMATCH'; end if;
  return new;
end $$;
create trigger guard_eligible_gender before insert or update on public.vote_eligible_contestants
for each row execute function ftu_sales_private.guard_category_gender();
create trigger guard_vote_gender before insert or update on public.votes
for each row execute function ftu_sales_private.guard_category_gender();

create function ftu_sales_private.guard_category_assignment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.gender is not null and exists(
    select 1 from public.vote_eligible_contestants e join public.contestants c on c.id=e.contestant_id
    where e.category_id=new.id and c.gender is distinct from new.gender
  ) then raise exception 'CONTESTANT_CATEGORY_MISMATCH'; end if;
  return new;
end $$;
create trigger guard_category_assignment before update of gender on public.vote_categories
for each row execute function ftu_sales_private.guard_category_assignment();

drop policy public_vote_categories on public.vote_categories;
create policy public_vote_categories on public.vote_categories for select to anon,authenticated
using (exists(select 1 from public.contest_rounds r where r.id=vote_categories.round_id and r.published));

create function public.update_contestant_details(p_actor uuid,p_aal text,p_id uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; e uuid;
begin
  if p_aal<>'aal2' or not public.has_role(p_actor,array['CONTEST_REVIEWER']) then raise exception 'FORBIDDEN'; end if;
  update public.contestants set display_name=p_data->>'display_name',number=(p_data->>'number')::integer,
    cohort=p_data->>'cohort',class_name=p_data->>'class_name',height_cm=(p_data->>'height_cm')::numeric,gender=p_data->>'gender'
    where id=p_id returning to_jsonb(contestants.*),edition_id into result,e;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into public.audit_logs(edition_id,actor_id,action,target_id) values(e,p_actor,'update_contestant_details',p_id);
  return result;
end $$;

-- Explicit preparation for an existing final: never convert an active/legacy ballot silently.
create function public.prepare_gender_voting(p_actor uuid,p_aal text,p_round uuid)
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

create function public.cast_category_vote(p_user uuid,p_round uuid,p_ticket uuid,p_contestant uuid,p_category uuid,p_session uuid)
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

-- Seed a draft 2027 season if one does not exist. Never publish or open it in a migration.
do $$
declare e uuid; r uuid;
begin
  select id into e from public.contest_editions where year=2027 order by published desc,created_at desc limit 1;
  if e is null then
    insert into public.contest_editions(slug,title,year) values('ftucharm-2027','FTUCharm (2027)',2027) returning id into e;
  end if;
  select id into r from public.contest_rounds where edition_id=e and kind='final' order by position desc limit 1;
  if r is null then
    insert into public.contest_rounds(edition_id,title,kind,position,cutoff)
      values(e,'Chung kết FTUCharm (2027)','final',(select coalesce(max(position),-1)+1 from public.contest_rounds where edition_id=e),50) returning id into r;
  end if;
  if not exists(select 1 from public.votes where round_id=r)
    and not exists(select 1 from public.vote_sessions where round_id=r and state<>'DRAFT')
    and not exists(select 1 from public.contest_rounds where id=r and vote_open_at is not null) then
    insert into public.vote_categories(round_id,code,name,gender) values
      (r,'male','Nam được yêu thích nhất','male'),(r,'female','Nữ được yêu thích nhất','female')
      on conflict(round_id,code) do nothing;
  else
    raise exception 'VOTING_HAS_STARTED: prepare categories after reviewing existing 2027 ballots';
  end if;
end $$;

revoke all on function public.update_contestant_details(uuid,text,uuid,jsonb),public.prepare_gender_voting(uuid,text,uuid),public.cast_category_vote(uuid,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.update_contestant_details(uuid,text,uuid,jsonb),public.prepare_gender_voting(uuid,text,uuid),public.cast_category_vote(uuid,uuid,uuid,uuid,uuid,uuid) to service_role;
revoke all on function ftu_sales_private.guard_contestant_gender(),ftu_sales_private.guard_category_gender(),ftu_sales_private.guard_category_assignment() from public,anon,authenticated;

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
 insert into public.contestants(id,edition_id,user_id,slug,display_name,faculty,bio,talents,cohort,class_name,height_cm,gender) values(cid,e.id,p_user,cid::text,p_data->>'full_name',p_data->>'faculty',p_data->>'bio',p_data->>'talents',p_data->>'cohort',p_data->>'class_name',(p_data->>'height_cm')::numeric,p_data->>'gender');
 insert into public.contestant_private(id,edition_id,user_id,full_name,email,phone,university,code,student_card_media_id) values(cid,e.id,p_user,p_data->>'full_name',lower(p_data->>'email'),p_data->>'phone','Đại học Ngoại thương',code,card_id);
 insert into public.contestant_media select cid,value::uuid,(array['portrait','half','full'])[ordinality] from jsonb_array_elements_text(p_data->'media_ids') with ordinality;
 update public.media_assets set state='attached' where id=card_id or id in(select value::uuid from jsonb_array_elements_text(p_data->'media_ids'));
 insert into public.consent_records(edition_id,user_id,version) values(e.id,p_user,'2026-10-v2-student-card');
 insert into public.email_outbox(edition_id,to_email,template,payload,dedupe_key) values(e.id,lower(p_data->>'email'),'received',jsonb_build_object('code',code),'apply:'||cid);
 result=jsonb_build_object('id',cid,'code',code,'status','pending');
 insert into public.api_idempotency values(p_user,p_key,'apply',p_hash,result,now());return result;
end$$;
create or replace function public.update_application(p_user uuid,p_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.contestant_private where id=p_id and user_id=p_user and status='needs_changes' for update;
 if not found then raise exception 'FORBIDDEN';end if;
 update public.contestants set faculty=p_data->>'faculty',bio=p_data->>'bio',talents=p_data->>'talents',cohort=coalesce(p_data->>'cohort',cohort),class_name=coalesce(p_data->>'class_name',class_name),height_cm=coalesce((p_data->>'height_cm')::numeric,height_cm),gender=coalesce(p_data->>'gender',gender) where id=p_id;
 update public.contestant_private set status='pending',note=null where id=p_id;
 return jsonb_build_object('id',p_id,'status','pending');
end$$;
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

create function public.open_gender_voting(p_actor uuid,p_aal text,p_round uuid)
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
revoke all on function public.open_gender_voting(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.open_gender_voting(uuid,text,uuid) to service_role;

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
commit;
