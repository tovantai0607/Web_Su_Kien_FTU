begin;
create extension if not exists pgcrypto;
create table public.contest_editions (
 id uuid primary key default gen_random_uuid(),slug text unique not null,title text not null,theme text not null default '',year integer not null,
 registration_open_at timestamptz,registration_close_at timestamptz,published boolean not null default false,
 created_at timestamptz not null default now(),check(registration_close_at is null or registration_close_at>registration_open_at)
);
create table public.profiles(id uuid primary key references auth.users on delete cascade,display_name text,created_at timestamptz not null default now());
create table public.roles(name text primary key);
insert into public.roles values ('CONTESTANT'),('AUDIENCE'),('CONTENT_EDITOR'),('CONTEST_REVIEWER'),('TICKET_STAFF'),('CHECKIN_STAFF'),('VOTE_MANAGER'),('SUPER_ADMIN');
create table public.user_roles(user_id uuid references auth.users on delete cascade,role text references public.roles,primary key(user_id,role));
create table public.contestants(
 id uuid primary key default gen_random_uuid(),edition_id uuid not null references public.contest_editions,user_id uuid not null references auth.users,
 slug text not null,display_name text not null,number integer,faculty text not null,bio text not null,talents text not null default '',stage text not null default 'Đăng ký',photo_url text,
 published boolean not null default false,created_at timestamptz not null default now(),unique(edition_id,user_id),unique(edition_id,slug),unique(edition_id,number),unique(edition_id,id)
);
create table public.contestant_private(
 id uuid primary key references public.contestants on delete cascade,edition_id uuid not null references public.contest_editions,user_id uuid not null references auth.users,
 full_name text not null,email text not null,phone text not null,university text not null,code text not null unique,
 status text not null default 'pending' check(status in ('pending','needs_changes','approved','rejected')),note text,reviewed_by uuid references auth.users,created_at timestamptz not null default now(),
 unique(edition_id,email),foreign key(edition_id,id) references public.contestants(edition_id,id)
);
create table public.media_assets(id uuid primary key default gen_random_uuid(),edition_id uuid not null references public.contest_editions,user_id uuid not null references auth.users,object_key text not null unique,mime text not null check(mime in ('image/jpeg','image/png','image/webp')),bytes integer not null check(bytes between 1 and 5242880),state text not null default 'ready' check(state in ('ready','attached')),created_at timestamptz not null default now());
create table public.contestant_media(contestant_id uuid references public.contestants on delete cascade,media_id uuid unique references public.media_assets,kind text not null check(kind in ('portrait','half','full')),primary key(contestant_id,kind));
create table public.contest_rounds(id uuid primary key default gen_random_uuid(),edition_id uuid not null references public.contest_editions,title text not null,kind text not null check(kind in ('preliminary','semifinal','final')),position integer not null,cutoff integer not null check(cutoff>0),published boolean not null default false,vote_open_at timestamptz,vote_close_at timestamptz,unique(edition_id,position),unique(edition_id,id),check(vote_close_at is null or vote_close_at>vote_open_at));
create table public.round_entries(edition_id uuid not null,round_id uuid not null,contestant_id uuid not null,eligible boolean not null default false,primary key(round_id,contestant_id),foreign key(edition_id,round_id) references public.contest_rounds(edition_id,id),foreign key(edition_id,contestant_id) references public.contestants(edition_id,id));
create table public.timeline_events(id uuid primary key default gen_random_uuid(),edition_id uuid not null references public.contest_editions,title text not null,description text not null default '',position integer not null,starts_at timestamptz,ends_at timestamptz,published boolean not null default false,unique(edition_id,position),check(ends_at is null or ends_at>=starts_at));
create table public.news_categories(id uuid primary key default gen_random_uuid(),name text unique not null);
create table public.news_posts(id uuid primary key default gen_random_uuid(),edition_id uuid not null references public.contest_editions,title text not null,slug text not null,excerpt text not null default '',body text not null,category text not null default 'Tin tức',published boolean not null default false,created_at timestamptz not null default now(),unique(edition_id,slug));
create table public.sponsors(id uuid primary key default gen_random_uuid(),edition_id uuid not null references public.contest_editions,name text not null,tier text not null check(tier in ('diamond','gold','silver','partner')),url text not null check(url like 'https://%'),published boolean not null default false);
create table public.edition_sponsors(edition_id uuid references public.contest_editions,sponsor_id uuid references public.sponsors,primary key(edition_id,sponsor_id));
create table public.consent_records(id uuid primary key default gen_random_uuid(),edition_id uuid not null references public.contest_editions,user_id uuid not null references auth.users,version text not null,accepted_at timestamptz not null default now());
create table public.email_templates(id uuid primary key default gen_random_uuid(),edition_id uuid references public.contest_editions,name text not null,subject text not null,body text not null);
create table public.email_outbox(id uuid primary key default gen_random_uuid(),edition_id uuid not null references public.contest_editions,to_email text not null,template text not null,payload jsonb not null,dedupe_key text unique not null,status text not null default 'pending' check(status in ('pending','sending','sent','failed')),attempts integer not null default 0,next_attempt_at timestamptz not null default now(),locked_at timestamptz,created_at timestamptz not null default now());
create table public.notifications(id uuid primary key default gen_random_uuid(),edition_id uuid references public.contest_editions,user_id uuid not null references auth.users,title text not null,body text not null,created_at timestamptz not null default now());
create table public.audit_logs(id bigint generated always as identity primary key,edition_id uuid references public.contest_editions,actor_id uuid not null references auth.users,action text not null,target_id uuid,detail jsonb not null default '{}',created_at timestamptz not null default now());
create table public.tickets(id uuid primary key default gen_random_uuid(),edition_id uuid not null references public.contest_editions,round_id uuid not null,user_id uuid not null references auth.users,seat_label text not null,status text not null default 'issued' check(status in ('issued','void')),token_hash text not null unique,checked_in_at timestamptz,checked_in_by uuid references auth.users,unique(round_id,seat_label),unique(edition_id,round_id,id),foreign key(edition_id,round_id) references public.contest_rounds(edition_id,id));
create table public.votes(id uuid primary key default gen_random_uuid(),edition_id uuid not null,round_id uuid not null,ticket_id uuid not null,contestant_id uuid not null,user_id uuid not null references auth.users,created_at timestamptz not null default clock_timestamp(),unique(round_id,ticket_id),foreign key(edition_id,round_id,ticket_id) references public.tickets(edition_id,round_id,id),foreign key(round_id,contestant_id) references public.round_entries(round_id,contestant_id));
create table public.api_idempotency(user_id uuid not null references auth.users,key uuid not null,operation text not null,request_hash text not null,result jsonb not null,created_at timestamptz not null default now(),primary key(user_id,key,operation));
create index contestants_public on public.contestants(edition_id,number) where published;
create index contestant_private_owner on public.contestant_private(user_id,edition_id);
create index contestant_review on public.contestant_private(edition_id,status,created_at);
create index tickets_owner on public.tickets(user_id,round_id);
create index vote_results on public.votes(round_id,contestant_id);
create index outbox_pending on public.email_outbox(next_attempt_at) where status in ('pending','sending');
create index user_role_lookup on public.user_roles(role,user_id);

create function public.has_role(p_user uuid,p_roles text[]) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.user_roles where user_id=p_user and role=any(p_roles||array['SUPER_ADMIN']))$$;
revoke all on function public.has_role(uuid,text[]) from public;
grant execute on function public.has_role(uuid,text[]) to service_role;
-- Every exposed table has RLS. Clients receive SELECT only; writes are through server-only RPCs.
do $$declare t text;begin
 foreach t in array array['contest_editions','profiles','roles','user_roles','contestants','contestant_private','media_assets','contestant_media','contest_rounds','round_entries','timeline_events','news_categories','news_posts','sponsors','edition_sponsors','consent_records','email_templates','email_outbox','notifications','audit_logs','tickets','votes','api_idempotency'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on table public.%I from anon,authenticated',t);
 execute format('grant all on table public.%I to service_role',t);
 end loop;
end$$;
grant usage on schema public to anon,authenticated,service_role;
grant usage,select on all sequences in schema public to service_role;
grant select on public.contest_editions,public.contest_rounds,public.timeline_events,public.news_posts,public.sponsors to anon,authenticated;
grant select on public.round_entries to anon,authenticated;
create policy public_entries on public.round_entries for select using(eligible and exists(select 1 from public.contest_rounds r where r.id=round_id and r.published) and exists(select 1 from public.contestants c where c.id=contestant_id and c.published));
create policy public_editions on public.contest_editions for select using(published);
create policy public_rounds on public.contest_rounds for select using(published and exists(select 1 from public.contest_editions e where e.id=edition_id and e.published));
create policy public_timeline on public.timeline_events for select using(published and exists(select 1 from public.contest_editions e where e.id=edition_id and e.published));
create policy public_news on public.news_posts for select using(published and exists(select 1 from public.contest_editions e where e.id=edition_id and e.published));
create policy public_sponsors on public.sponsors for select using(published and exists(select 1 from public.contest_editions e where e.id=edition_id and e.published));
-- Column privileges prevent exposure of user_id even for published contestants.
grant select(id,edition_id,slug,display_name,number,faculty,bio,talents,stage,photo_url,published) on public.contestants to anon,authenticated;
create policy public_contestants on public.contestants for select using(published and exists(select 1 from public.contest_editions e where e.id=edition_id and e.published));
grant select on public.profiles,public.user_roles,public.contestant_private,public.votes,public.notifications,public.media_assets to authenticated;
grant select(id,edition_id,round_id,user_id,seat_label,status,checked_in_at) on public.tickets to authenticated;
create policy own_profile on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy own_roles on public.user_roles for select to authenticated using(user_id=(select auth.uid()));
create policy own_application on public.contestant_private for select to authenticated using(user_id=(select auth.uid()));
create policy own_tickets on public.tickets for select to authenticated using(user_id=(select auth.uid()));
create policy own_votes on public.votes for select to authenticated using(user_id=(select auth.uid()));
create policy own_notifications on public.notifications for select to authenticated using(user_id=(select auth.uid()));
create policy own_media on public.media_assets for select to authenticated using(user_id=(select auth.uid()));

create function public.apply_contestant(p_user uuid,p_data jsonb,p_key uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.contest_editions; cid uuid; code text; result jsonb; cached public.api_idempotency;mid uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text||p_key::text,0));
 select * into cached from public.api_idempotency where user_id=p_user and key=p_key and operation='apply';
 if found then if cached.request_hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT';end if;return cached.result;end if;
 select * into e from public.contest_editions where id=(p_data->>'edition_id')::uuid for share;
 if not found or not e.published or e.registration_open_at is null or clock_timestamp()<e.registration_open_at or e.registration_close_at is null or clock_timestamp()>=e.registration_close_at then raise exception 'REGISTRATION_CLOSED';end if;
 if (select count(*) from jsonb_array_elements_text(p_data->'media_ids'))<>3 then raise exception 'INVALID_MEDIA';end if;
 for mid in select value::uuid from jsonb_array_elements_text(p_data->'media_ids') loop
  perform 1 from public.media_assets where id=mid and user_id=p_user and edition_id=e.id and state='ready' for update;
  if not found then raise exception 'INVALID_MEDIA';end if;
 end loop;
 if (select count(distinct value) from jsonb_array_elements_text(p_data->'media_ids'))<>3 then raise exception 'INVALID_MEDIA';end if;
 cid=gen_random_uuid();code='FTC-'||upper(substr(replace(cid::text,'-',''),1,12));
 insert into public.contestants(id,edition_id,user_id,slug,display_name,faculty,bio,talents) values(cid,e.id,p_user,cid::text,p_data->>'full_name',p_data->>'faculty',p_data->>'bio',p_data->>'talents');
 insert into public.contestant_private(id,edition_id,user_id,full_name,email,phone,university,code) values(cid,e.id,p_user,p_data->>'full_name',lower(p_data->>'email'),p_data->>'phone',p_data->>'university',code);
 insert into public.contestant_media select cid,value::uuid,(array['portrait','half','full'])[ordinality] from jsonb_array_elements_text(p_data->'media_ids') with ordinality;
 update public.media_assets set state='attached' where id in(select value::uuid from jsonb_array_elements_text(p_data->'media_ids'));
 insert into public.consent_records(edition_id,user_id,version) values(e.id,p_user,'2026-10-v1');
 insert into public.email_outbox(edition_id,to_email,template,payload,dedupe_key) values(e.id,lower(p_data->>'email'),'received',jsonb_build_object('code',code),'apply:'||cid);
 result=jsonb_build_object('id',cid,'code',code,'status','pending');
 insert into public.api_idempotency values(p_user,p_key,'apply',p_hash,result,now());return result;
end$$;
create function public.cast_vote(p_user uuid,p_round uuid,p_ticket uuid,p_contestant uuid) returns jsonb language plpgsql security definer set search_path='' as $$
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
create function public.review_application(p_actor uuid,p_aal text,p_id uuid,p_status text,p_note text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.contestant_private;
begin
 if p_aal<>'aal2' or not public.has_role(p_actor,array['CONTEST_REVIEWER']) then raise exception 'FORBIDDEN';end if;
 if p_status not in('approved','rejected','needs_changes') then raise exception 'INVALID_STATUS';end if;
 select * into a from public.contestant_private where id=p_id for update;if not found then raise exception 'NOT_FOUND';end if;
 update public.contestant_private set status=p_status,note=p_note,reviewed_by=p_actor where id=p_id;
 -- Approval never silently publishes private or contestant data.
 insert into public.notifications(edition_id,user_id,title,body) values(a.edition_id,a.user_id,'Cập nhật hồ sơ',p_note);
 insert into public.email_outbox(edition_id,to_email,template,payload,dedupe_key) values(a.edition_id,a.email,p_status,jsonb_build_object('code',a.code,'note',p_note),'review:'||gen_random_uuid());
 insert into public.audit_logs(edition_id,actor_id,action,target_id,detail) values(a.edition_id,p_actor,'review_application',p_id,jsonb_build_object('status',p_status));
 return jsonb_build_object('id',p_id,'status',p_status);
end$$;
create function public.check_in(p_actor uuid,p_aal text,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tickets;
begin
 if p_aal<>'aal2' or not public.has_role(p_actor,array['CHECKIN_STAFF']) then raise exception 'FORBIDDEN';end if;
 select * into t from public.tickets where token_hash=p_hash and status='issued' for update;
 if not found then raise exception 'TICKET_NOT_FOUND';end if;
 if t.checked_in_at is not null then raise exception 'ALREADY_CHECKED_IN';end if;
 update public.tickets set checked_in_at=clock_timestamp(),checked_in_by=p_actor where id=t.id;
 insert into public.audit_logs(edition_id,actor_id,action,target_id) values(t.edition_id,p_actor,'check_in',t.id);
 return jsonb_build_object('id',t.id,'seat_label',t.seat_label,'status','checked_in');
end$$;
create function public.claim_emails() returns setof public.email_outbox language sql security definer set search_path='' as $$
 update public.email_outbox set status='sending',locked_at=now(),attempts=attempts+1 where id in(select id from public.email_outbox where attempts<6 and next_attempt_at<=now() and (status='pending' or (status='sending' and locked_at<now()-interval '5 minutes')) order by created_at for update skip locked limit 20) returning *;
$$;
-- Do not expose privileged RPCs via Data API to users. Only the authenticated Worker service calls these.
revoke all on function public.apply_contestant(uuid,jsonb,uuid,text),public.cast_vote(uuid,uuid,uuid,uuid),public.review_application(uuid,text,uuid,text,text),public.check_in(uuid,text,text),public.claim_emails() from public,anon,authenticated;
grant execute on function public.apply_contestant(uuid,jsonb,uuid,text),public.cast_vote(uuid,uuid,uuid,uuid),public.review_application(uuid,text,uuid,text,text),public.check_in(uuid,text,text),public.claim_emails() to service_role;
commit;
