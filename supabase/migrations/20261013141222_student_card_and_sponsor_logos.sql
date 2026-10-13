begin;
alter table public.media_assets add column purpose text not null default 'portfolio' check(purpose in ('portfolio','student_card'));
alter table public.media_assets add constraint media_assets_owner_edition_key unique(edition_id,user_id,id);
alter table public.contestant_private add column student_card_media_id uuid;
alter table public.contestant_private add constraint student_card_owner_edition_fkey foreign key(edition_id,user_id,student_card_media_id) references public.media_assets(edition_id,user_id,id);
create index contestant_private_student_card on public.contestant_private(edition_id,user_id,student_card_media_id) where student_card_media_id is not null;
alter table public.sponsors add column logo_url text check(logo_url is null or logo_url='' or logo_url ~ '^/images/sponsors/[a-zA-Z0-9_-]+\.(webp|png|jpe?g|avif)$');
-- Historical university data remains intact. New applications set FTU on the server.
-- Student cards are referenced only from the private application, never public portraits.
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
revoke all on function public.apply_contestant(uuid,jsonb,uuid,text),public.admin_save(uuid,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.apply_contestant(uuid,jsonb,uuid,text),public.admin_save(uuid,text,text,uuid,jsonb) to service_role;
commit;
