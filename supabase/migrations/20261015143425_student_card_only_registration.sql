-- Student card is required. Portfolio images remain optional for legacy clients.
create or replace function public.apply_contestant(p_user uuid,p_data jsonb,p_key uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.contest_editions; cid uuid; code text; result jsonb; cached public.api_idempotency;mid uuid; card_id uuid; portfolio_ids jsonb := coalesce(p_data->'media_ids','[]'::jsonb);
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text||p_key::text,0));
 select * into cached from public.api_idempotency where user_id=p_user and key=p_key and operation='apply';
 if found then if cached.request_hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT';end if;return cached.result;end if;
 select * into e from public.contest_editions where id=(p_data->>'edition_id')::uuid for share;
 if not found or not e.published or e.registration_open_at is null or clock_timestamp()<e.registration_open_at or e.registration_close_at is null or clock_timestamp()>=e.registration_close_at then raise exception 'REGISTRATION_CLOSED';end if;
 if p_data->>'student_card_media_id' is null then raise exception 'INVALID_STUDENT_CARD';end if;
 card_id=(p_data->>'student_card_media_id')::uuid;
 if jsonb_typeof(portfolio_ids) <> 'array' then raise exception 'INVALID_MEDIA';end if;
 if jsonb_array_length(portfolio_ids) not in (0,3) then raise exception 'INVALID_MEDIA';end if;
 for mid in select value::uuid from jsonb_array_elements_text(portfolio_ids) loop
  perform 1 from public.media_assets where id=mid and user_id=p_user and edition_id=e.id and state='ready' and purpose='portfolio' for update;
  if not found then raise exception 'INVALID_MEDIA';end if;
 end loop;
 if (select count(distinct value) from jsonb_array_elements_text(portfolio_ids))<>jsonb_array_length(portfolio_ids) then raise exception 'INVALID_MEDIA';end if;
 if exists(select 1 from jsonb_array_elements_text(portfolio_ids) where value::uuid=card_id) then raise exception 'INVALID_STUDENT_CARD';end if;
 perform 1 from public.media_assets where id=card_id and user_id=p_user and edition_id=e.id and state='ready' and purpose='student_card' for update;
 if not found then raise exception 'INVALID_STUDENT_CARD';end if;
 cid=gen_random_uuid();code='FTC-'||upper(substr(replace(cid::text,'-',''),1,12));
 insert into public.contestants(id,edition_id,user_id,slug,display_name,faculty,bio,talents,cohort,class_name,height_cm,gender) values(cid,e.id,p_user,cid::text,p_data->>'full_name',p_data->>'faculty',p_data->>'bio',p_data->>'talents',p_data->>'cohort',p_data->>'class_name',(p_data->>'height_cm')::numeric,p_data->>'gender');
 insert into public.contestant_private(id,edition_id,user_id,full_name,email,phone,university,code,student_card_media_id) values(cid,e.id,p_user,p_data->>'full_name',lower(p_data->>'email'),p_data->>'phone','Đại học Ngoại thương',code,card_id);
 insert into public.contestant_media select cid,value::uuid,(array['portrait','half','full'])[ordinality] from jsonb_array_elements_text(portfolio_ids) with ordinality;
 update public.media_assets set state='attached' where id=card_id or id in(select value::uuid from jsonb_array_elements_text(portfolio_ids));
 insert into public.consent_records(edition_id,user_id,version) values(e.id,p_user,'2026-10-v3-student-card-only');
 insert into public.email_outbox(edition_id,to_email,template,payload,dedupe_key) values(e.id,lower(p_data->>'email'),'received',jsonb_build_object('code',code),'apply:'||cid);
 result=jsonb_build_object('id',cid,'code',code,'status','pending');
 insert into public.api_idempotency values(p_user,p_key,'apply',p_hash,result,now());return result;
end$$;

revoke all on function public.apply_contestant(uuid,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.apply_contestant(uuid,jsonb,uuid,text) to service_role;
