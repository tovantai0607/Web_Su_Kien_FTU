-- Restore the previous admin MFA policy. Existing factors are never deleted.
begin;
CREATE OR REPLACE FUNCTION public.set_user_role(p_actor uuid, p_aal text, p_user uuid, p_role text, p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if p_aal<>'aal2' or not public.has_role(p_actor,array['SUPER_ADMIN']) then raise exception 'FORBIDDEN';end if;
 perform pg_advisory_xact_lock(77102026);
 if not p_enabled and p_role='SUPER_ADMIN' and (select count(*) from public.user_roles where role='SUPER_ADMIN')<=1 then raise exception 'LAST_ADMIN';end if;
 if p_enabled then insert into public.user_roles values(p_user,p_role) on conflict do nothing;else delete from public.user_roles where user_id=p_user and role=p_role;end if;
 insert into public.audit_logs(actor_id,action,target_id,detail) values(p_actor,'set_role',p_user,jsonb_build_object('role',p_role,'enabled',p_enabled));
end$function$;
CREATE OR REPLACE FUNCTION public.review_application(p_actor uuid, p_aal text, p_id uuid, p_status text, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end$function$;
CREATE OR REPLACE FUNCTION public.check_in(p_actor uuid, p_aal text, p_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.tickets;
begin
 if p_aal<>'aal2' or not public.has_role(p_actor,array['CHECKIN_STAFF']) then raise exception 'FORBIDDEN';end if;
 select * into t from public.tickets where token_hash=p_hash and status='issued' for update;
 if not found then raise exception 'TICKET_NOT_FOUND';end if;
 if t.checked_in_at is not null then raise exception 'ALREADY_CHECKED_IN';end if;
 update public.tickets set checked_in_at=clock_timestamp(),checked_in_by=p_actor where id=t.id;
 insert into public.audit_logs(edition_id,actor_id,action,target_id) values(t.edition_id,p_actor,'check_in',t.id);
 return jsonb_build_object('id',t.id,'seat_label',t.seat_label,'status','checked_in');
end$function$;
CREATE OR REPLACE FUNCTION public.classify_purchase_legacy_vote(p_actor uuid, p_aal text, p_vote uuid, p_category uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.votes;
begin
  if p_aal<>'aal2' or not public.has_role(p_actor,array['VOTE_MANAGER']) then raise exception 'FORBIDDEN'; end if;
  select * into v from public.votes where id=p_vote for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v.vote_format='LEGACY_CLASSIFIED' and v.category_id=p_category then return jsonb_build_object('id',v.id); end if;
  if v.vote_format<>'LEGACY' then raise exception 'IMMUTABLE_VOTE'; end if;
  update public.votes set vote_format='LEGACY_CLASSIFIED',category_id=p_category,classified_by=p_actor where id=v.id;
  return jsonb_build_object('id',v.id);
end $function$;
CREATE OR REPLACE FUNCTION public.publish_round(p_actor uuid, p_aal text, p_round uuid, p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.contest_rounds;n integer;
begin
 if p_aal<>'aal2' or not public.has_role(p_actor,array['VOTE_MANAGER']) then raise exception 'FORBIDDEN';end if;
 select * into r from public.contest_rounds where id=p_round for update;if not found then raise exception 'NOT_FOUND';end if;
 if exists(select 1 from public.votes where round_id=p_round) then raise exception 'VOTING_HAS_STARTED';end if;
 select count(distinct x) into n from unnest(p_ids) x;if n<>array_length(p_ids,1) or n>r.cutoff or n=0 then raise exception 'INVALID_CUTOFF';end if;
 if (select count(*) from public.contestant_private where id=any(p_ids) and edition_id=r.edition_id and status='approved')<>n then raise exception 'CONTESTANT_NOT_ELIGIBLE';end if;
 update public.round_entries set eligible=false where round_id=p_round;
 insert into public.round_entries(edition_id,round_id,contestant_id,eligible) select r.edition_id,p_round,x,true from unnest(p_ids) x on conflict(round_id,contestant_id) do update set eligible=true;
 update public.contestants set published=true,stage=r.title where id=any(p_ids);
 update public.contest_rounds set published=true where id=p_round;
 insert into public.audit_logs(edition_id,actor_id,action,target_id,detail) values(r.edition_id,p_actor,'publish_round',p_round,jsonb_build_object('contestant_ids',p_ids));
 return jsonb_build_object('id',p_round,'count',n);
end$function$;
CREATE OR REPLACE FUNCTION public.issue_ticket(p_actor uuid, p_aal text, p_user uuid, p_round uuid, p_seat text, p_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.contest_rounds;tid uuid;
begin
 if p_aal<>'aal2' or not public.has_role(p_actor,array['TICKET_STAFF']) then raise exception 'FORBIDDEN';end if;
 select * into r from public.contest_rounds where id=p_round;if not found then raise exception 'NOT_FOUND';end if;
 insert into public.tickets(edition_id,round_id,user_id,seat_label,token_hash) values(r.edition_id,r.id,p_user,p_seat,p_hash) returning id into tid;
 insert into public.audit_logs(edition_id,actor_id,action,target_id) values(r.edition_id,p_actor,'issue_ticket',tid);
 return jsonb_build_object('id',tid,'seat_label',p_seat);
end$function$;
CREATE OR REPLACE FUNCTION public.manage_purchase_voting(p_actor uuid, p_aal text, p_session uuid, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.vote_sessions; result jsonb;
begin
  if p_aal<>'aal2' or not public.has_role(p_actor,array['VOTE_MANAGER']) then raise exception 'FORBIDDEN'; end if;
  select * into s from public.vote_sessions where id=p_session;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_action='reopen' then raise exception 'VOTE_ALREADY_CLOSED'; end if;
  if p_action='close' then
    return public.save_voting_settings(p_actor,p_aal,s.round_id,s.open_at,clock_timestamp(),p_reason);
  end if;
  select * into s from public.vote_sessions where id=p_session for update;
  if p_action='finalize' and s.state='CLOSED' then
    update public.vote_sessions set state='FINALIZED',finalized_at=clock_timestamp(),updated_by=p_actor where id=s.id;
    insert into public.vote_result_snapshots(session_id,round_id,category_id,results,created_by)
      select s.id,s.round_id,c.id,coalesce((select jsonb_agg(jsonb_build_object('contestant_id',e.contestant_id,'votes',
        (select count(*) from public.votes v where v.round_id=s.round_id and v.category_id=c.id and v.contestant_id=e.contestant_id)) order by e.contestant_id)
        from public.vote_eligible_contestants e where e.session_id=s.id and e.category_id=c.id),'[]'::jsonb),p_actor
      from public.vote_categories c where c.round_id=s.round_id;
  elsif p_action='publish' and s.state='FINALIZED' then
    update public.vote_sessions set results_published=true,updated_by=p_actor where id=s.id;
  else raise exception 'INVALID_SESSION_TRANSITION'; end if;
  insert into public.audit_logs(edition_id,actor_id,action,target_id) values(s.edition_id,p_actor,'vote_'||p_action,s.id);
  return jsonb_build_object('id',s.id,'action',p_action);
end $function$;
CREATE OR REPLACE FUNCTION public.prepare_gender_voting(p_actor uuid, p_aal text, p_round uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.contest_rounds;
begin
  if p_aal<>'aal2' or not public.has_role(p_actor,array['VOTE_MANAGER']) then raise exception 'FORBIDDEN'; end if;
  select * into r from public.contest_rounds where id=p_round for update;
  if not found or r.kind not in ('semifinal','final') then raise exception 'NOT_FOUND'; end if;
  if exists(select 1 from public.votes where round_id=p_round) or r.vote_open_at is not null
    or exists(select 1 from public.vote_sessions where round_id=p_round and state<>'DRAFT') then raise exception 'VOTING_HAS_STARTED'; end if;
  insert into public.vote_categories(round_id,code,name,gender) values
    (p_round,'male','Nam được yêu thích nhất','male'),(p_round,'female','Nữ được yêu thích nhất','female')
    on conflict(round_id,code) do nothing;
  if (select count(*) from public.vote_categories where round_id=p_round and code=gender and gender in ('male','female'))<>2 then raise exception 'VOTING_NOT_CONFIGURED'; end if;
  insert into public.audit_logs(edition_id,actor_id,action,target_id) values(r.edition_id,p_actor,'prepare_gender_voting',p_round);
  return jsonb_build_object('id',p_round);
end $function$;
CREATE OR REPLACE FUNCTION public.update_contestant_details(p_actor uuid, p_aal text, p_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb; e uuid;
begin
  if p_aal<>'aal2' or not public.has_role(p_actor,array['CONTEST_REVIEWER']) then raise exception 'FORBIDDEN'; end if;
  update public.contestants set display_name=p_data->>'display_name',number=(p_data->>'number')::integer,
    cohort=p_data->>'cohort',class_name=p_data->>'class_name',height_cm=(p_data->>'height_cm')::numeric,gender=p_data->>'gender'
    where id=p_id returning to_jsonb(contestants.*),edition_id into result,e;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into public.audit_logs(edition_id,actor_id,action,target_id) values(e,p_actor,'update_contestant_details',p_id);
  return result;
end $function$;
CREATE OR REPLACE FUNCTION public.admin_save(p_actor uuid, p_aal text, p_table text, p_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if exists(select 1 from public.contest_rounds where id=p_id and (vote_open_at is distinct from (p_data->>'vote_open_at')::timestamptz or vote_close_at is distinct from (p_data->>'vote_close_at')::timestamptz))
    or (not exists(select 1 from public.contest_rounds where id=p_id) and ((p_data->>'vote_open_at') is not null or (p_data->>'vote_close_at') is not null)) then raise exception 'VOTE_SETTINGS_REQUIRED';end if;
 end if;
 for k in select jsonb_object_keys(p_data) loop
  if not k=any(allowed) then raise exception 'FORBIDDEN';end if;
  cols=cols||','||quote_ident(k);vals=vals||format(',(jsonb_populate_record(null::public.%I,$2)).%I',p_table,k);updates=updates||case when updates='' then '' else ',' end||format('%I=excluded.%I',k,k);
 end loop;
 if cols='' then raise exception 'INVALID_DATA';end if;
 execute format('insert into public.%I(id%s) select $1%s on conflict(id) do update set %s returning to_jsonb(%I.*)',p_table,cols,vals,updates,p_table) into result using p_id,p_data;
 insert into public.audit_logs(edition_id,actor_id,action,target_id,detail) values(case when p_table='contest_editions' then p_id else (p_data->>'edition_id')::uuid end,p_actor,'save_'||p_table,p_id,jsonb_build_object('fields',to_jsonb(allowed)));
 return result;
end$function$;
CREATE OR REPLACE FUNCTION public.save_purchase_offer(p_actor uuid, p_aal text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.purchase_offers; x jsonb; used bigint; pid uuid;
begin
  if p_aal<>'aal2' or not public.has_role(p_actor,array['TICKET_STAFF']) then raise exception 'FORBIDDEN'; end if;
  select * into o from public.purchase_offers where id=(p_data->>'id')::uuid for update;
  if found and exists(select 1 from public.purchase_requests where offer_id=o.id) and row(o.edition_id,o.round_id,o.mode) is distinct from row((p_data->>'edition_id')::uuid,(p_data->>'round_id')::uuid,p_data->>'mode') then raise exception 'IMMUTABLE_PURCHASE_SCOPE'; end if;
  insert into public.purchase_offers(id,edition_id,round_id,slug,title,venue,starts_at,published,mode,payment_instructions,qr_path)
    values((p_data->>'id')::uuid,(p_data->>'edition_id')::uuid,(p_data->>'round_id')::uuid,p_data->>'slug',p_data->>'title',p_data->>'venue',(p_data->>'starts_at')::timestamptz,(p_data->>'published')::boolean,p_data->>'mode',p_data->>'payment_instructions',p_data->>'qr_path')
    on conflict(id) do update set edition_id=excluded.edition_id,round_id=excluded.round_id,mode=excluded.mode,slug=excluded.slug,title=excluded.title,venue=excluded.venue,starts_at=excluded.starts_at,published=excluded.published,payment_instructions=excluded.payment_instructions,qr_path=excluded.qr_path;
  perform 1 from public.purchase_products where offer_id=(p_data->>'id')::uuid order by id for update;
  for x in select value from jsonb_array_elements(p_data->'products') order by value->>'id' loop
    pid=(x->>'id')::uuid;
    if exists(select 1 from public.purchase_products where id=pid and offer_id<>(p_data->>'id')::uuid) then raise exception 'FORBIDDEN'; end if;
    select coalesce((select sold_quantity from public.purchase_products where id=pid),0)+coalesce(sum(a.quantity),0) into used
      from public.purchase_requests req join public.purchase_allocations a on a.request_id=req.id and a.product_id=pid
      where req.offer_id=(p_data->>'id')::uuid and req.status='HELD' and req.expires_at>clock_timestamp();
    if (x->>'quota')::integer<used then raise exception 'QUOTA_BELOW_ALLOCATED'; end if;
    insert into public.purchase_products(id,offer_id,name,tier,quota,price_vnd,combo2_vnd,combo3_vnd,opens_at,closes_at,enabled)
      values(pid,(p_data->>'id')::uuid,x->>'name',x->>'tier',(x->>'quota')::integer,(x->>'price_vnd')::integer,(x->>'combo2_vnd')::integer,(x->>'combo3_vnd')::integer,(x->>'opens_at')::timestamptz,(x->>'closes_at')::timestamptz,(x->>'enabled')::boolean)
      on conflict(id) do update set name=excluded.name,tier=excluded.tier,quota=excluded.quota,price_vnd=excluded.price_vnd,combo2_vnd=excluded.combo2_vnd,combo3_vnd=excluded.combo3_vnd,opens_at=excluded.opens_at,closes_at=excluded.closes_at,enabled=excluded.enabled;
  end loop;
  -- Disabling omitted products retains history and active reservations.
  update public.purchase_products set enabled=false where offer_id=(p_data->>'id')::uuid and id not in(select (v->>'id')::uuid from jsonb_array_elements(p_data->'products') v);
  insert into public.audit_logs(edition_id,actor_id,action,target_id) values((p_data->>'edition_id')::uuid,p_actor,'save_purchase_offer',(p_data->>'id')::uuid);
  return jsonb_build_object('id',p_data->>'id');
end $function$;
CREATE OR REPLACE FUNCTION public.open_gender_voting(p_actor uuid, p_aal text, p_round uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.contest_rounds; sid uuid; opened timestamptz;
begin
  if p_aal<>'aal2' or not public.has_role(p_actor,array['VOTE_MANAGER']) then raise exception 'FORBIDDEN'; end if;
  select * into r from public.contest_rounds where id=p_round for update;
  if not found or r.kind not in ('semifinal','final') or not r.published then raise exception 'VOTE_CLOSED'; end if;
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
end $function$;
CREATE OR REPLACE FUNCTION public.purchase_statistics(p_actor uuid, p_aal text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_aal<>'aal2' or not public.has_role(p_actor,array['TICKET_STAFF']) then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object('completed_orders',(select count(*) from public.purchase_requests where status='COMPLETED'),
    'ticket_quantity',(select coalesce(sum(quantity),0) from public.purchase_requests where status='COMPLETED'),
    'requested_amount_vnd',(select coalesce(sum(total_vnd),0) from public.purchase_requests where status='COMPLETED'),
    'groups',(select coalesce(jsonb_agg(to_jsonb(g)),'[]'::jsonb) from (
      select r.round_id,l->>'name' name,l->>'tier' tier,(l->>'bundle_size')::int bundle_size,
        sum((l->>'quantity')::int) bundle_quantity,sum((l->>'ticket_quantity')::int) ticket_quantity
      from public.purchase_requests r cross join lateral jsonb_array_elements(r.lines) l
      where r.status='COMPLETED' group by r.round_id,l->>'name',l->>'tier',l->>'bundle_size'
    ) g));
end $function$;
CREATE OR REPLACE FUNCTION public.save_sale_settings(p_actor uuid, p_aal text, p_event uuid, p_revision bigint, p_phases jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.events;phase jsonb;pr jsonb;pid uuid;prior jsonb;seen text[]='{}';
begin
 if p_aal is distinct from 'aal2' or not public.has_role(p_actor,array['SUPER_ADMIN']) then raise exception 'FORBIDDEN';end if;
 select * into e from public.events where id=p_event for update;
 if not found then raise exception 'NOT_FOUND';end if;
 if e.sales_revision is distinct from p_revision then raise exception 'SETTINGS_CHANGED';end if;
 if jsonb_typeof(p_phases)<>'array' or jsonb_array_length(p_phases) not between 1 and 2 then raise exception 'INVALID_DATA';end if;
 select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('prices',(select jsonb_agg(to_jsonb(price_row)) from public.ticket_phase_prices price_row where price_row.phase_id=p.id))),'[]') into prior from public.ticket_sale_phases p where p.event_id=p_event;
 update public.ticket_sale_phases set enabled=false where event_id=p_event;
 for phase in select value from jsonb_array_elements(p_phases) loop
  if phase->>'kind' not in ('EARLY','REGULAR') or phase->>'kind'=any(seen) or (phase->>'close_at')::timestamptz<=(phase->>'open_at')::timestamptz then raise exception 'INVALID_DATA';end if;
  seen=array_append(seen,phase->>'kind');
  if jsonb_array_length(phase->'prices')<>2 or (select count(distinct x->>'category_id') from jsonb_array_elements(phase->'prices') x)<>2 then raise exception 'SALE_PHASE_NOT_CONFIGURED';end if;
  insert into public.ticket_sale_phases(event_id,kind,open_at,close_at,enabled) values(p_event,phase->>'kind',(phase->>'open_at')::timestamptz,(phase->>'close_at')::timestamptz,true)
   on conflict(event_id,kind) do update set open_at=excluded.open_at,close_at=excluded.close_at,enabled=true returning id into pid;
  for pr in select value from jsonb_array_elements(phase->'prices') loop
   if not exists(select 1 from public.ticket_categories where id=(pr->>'category_id')::uuid and event_id=p_event and enabled) then raise exception 'SALE_PHASE_NOT_CONFIGURED';end if;
   insert into public.ticket_phase_prices(phase_id,event_id,category_id,price_vnd) values(pid,p_event,(pr->>'category_id')::uuid,(pr->>'price_vnd')::bigint)
    on conflict(phase_id,category_id) do update set price_vnd=excluded.price_vnd;
  end loop;
 end loop;
 if not 'REGULAR'=any(seen) then raise exception 'SALE_PHASE_NOT_CONFIGURED';end if;
 update public.events set sale_open_at=(select min(open_at) from public.ticket_sale_phases where event_id=p_event and enabled),sale_close_at=(select max(close_at) from public.ticket_sale_phases where event_id=p_event and enabled),sales_revision=sales_revision+1 where id=p_event;
 insert into public.audit_logs(edition_id,actor_id,action,target_id,detail) values(e.edition_id,p_actor,'save_sale_settings',p_event,jsonb_build_object('before',prior,'after',p_phases));
 return jsonb_build_object('saved',true,'revision',(select sales_revision from public.events where id=p_event));
end $function$;
CREATE OR REPLACE FUNCTION public.save_voting_settings(p_actor uuid, p_aal text, p_round uuid, p_open timestamp with time zone, p_close timestamp with time zone, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.contest_rounds;s public.vote_sessions;prior jsonb;tick timestamptz=clock_timestamp();started boolean;
begin
 if p_aal is distinct from 'aal2' or not public.has_role(p_actor,array['SUPER_ADMIN']) then raise exception 'FORBIDDEN';end if;
 select * into r from public.contest_rounds where id=p_round for update;
 if not found then raise exception 'NOT_FOUND';end if;
 if r.kind not in ('semifinal','final') or not r.published or not exists(select 1 from public.contest_editions where id=r.edition_id and published) then raise exception 'VOTING_NOT_CONFIGURED';end if;
 if p_open is null or p_close is null or p_close<=p_open then raise exception 'INVALID_VOTE_WINDOW';end if;
 select * into s from public.vote_sessions where round_id=p_round order by open_at desc nulls last,id limit 1 for update;
 tick=clock_timestamp();
 prior=jsonb_build_object('open_at',r.vote_open_at,'close_at',r.vote_close_at,'session',to_jsonb(s));
 if s.id is not null and (s.state in ('CLOSED','FINALIZED') or (s.open_at is not null and s.close_at<=tick)) then raise exception 'VOTE_ALREADY_CLOSED';end if;
 started=(s.id is not null and s.open_at<=tick) or exists(select 1 from public.votes where round_id=p_round);
 if started then
  if p_open is distinct from s.open_at or nullif(trim(p_reason),'') is null then raise exception 'VOTE_REASON_REQUIRED';end if;
  if p_close<=tick then p_close=tick;end if;
 else
  if p_open<tick-interval '5 seconds' or p_close<=tick then raise exception 'INVALID_VOTE_WINDOW';end if;
  if (select count(*) from public.vote_categories where round_id=p_round and gender in ('male','female'))<>2 then raise exception 'VOTING_NOT_CONFIGURED';end if;
  if s.id is null then
   insert into public.vote_sessions(edition_id,round_id,title,updated_by) values(r.edition_id,p_round,r.title,p_actor) returning * into s;
  end if;
  delete from public.vote_eligible_contestants where session_id=s.id;
  insert into public.vote_eligible_contestants(session_id,category_id,round_id,contestant_id)
   select s.id,c.id,p_round,p.id from public.vote_categories c join public.contestants p on p.edition_id=r.edition_id and p.gender=c.gender and p.published
    join public.round_entries en on en.round_id=p_round and en.contestant_id=p.id and en.eligible where c.round_id=p_round;
 end if;
 update public.vote_sessions set open_at=p_open,close_at=p_close,duration_seconds=greatest(1,ceil(extract(epoch from p_close-p_open))::int),published=true,updated_by=p_actor,reopen_reason=p_reason,
  state=case when p_close<=tick then 'CLOSED' when p_open>tick then 'SCHEDULED' else 'OPEN' end where id=s.id;
 update public.contest_rounds set vote_open_at=p_open,vote_close_at=p_close where id=p_round;
 insert into public.audit_logs(edition_id,actor_id,action,target_id,detail) values(r.edition_id,p_actor,'save_voting_settings',p_round,jsonb_build_object('before',prior,'after',jsonb_build_object('open_at',p_open,'close_at',p_close),'reason',p_reason));
 if started then insert into public.vote_incident_logs(session_id,actor_id,action,reason) values(s.id,p_actor,'change_close_time',p_reason);end if;
 return jsonb_build_object('saved',true,'session_id',s.id,'open_at',p_open,'close_at',p_close);
end $function$;
CREATE OR REPLACE FUNCTION public.admin_event_settings(p_actor uuid, p_aal text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if p_aal is distinct from 'aal2' or not public.has_role(p_actor,array['SUPER_ADMIN']) then raise exception 'FORBIDDEN';end if;
 return jsonb_build_object('server_time',clock_timestamp(),
  'editions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'year',year) order by year desc),'[]') from public.contest_editions),
  'rounds',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('session_state',(select ftu_sales_private.effective_vote_state(s) from public.vote_sessions s where s.round_id=r.id order by s.open_at desc nulls last,s.id limit 1)) order by r.position),'[]') from public.contest_rounds r where r.kind in ('semifinal','final')),
  'events',(select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object(
   'categories',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'position',position,'price_vnd',price_vnd) order by position),'[]') from public.ticket_categories where event_id=e.id and enabled),
   'phases',(select coalesce(jsonb_agg(jsonb_build_object('kind',p.kind,'open_at',p.open_at,'close_at',p.close_at,'prices',(select jsonb_agg(jsonb_build_object('category_id',category_id,'price_vnd',price_vnd)) from public.ticket_phase_prices where phase_id=p.id)) order by p.open_at),'[]') from public.ticket_sale_phases p where p.event_id=e.id and p.enabled)
  ) order by e.starts_at),'[]') from public.events e));
end $function$;
CREATE OR REPLACE FUNCTION public.open_voting(p_actor uuid, p_aal text, p_round uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.contest_rounds;opened timestamptz;
begin
 if exists(select 1 from public.purchase_offers where round_id=p_round) then return public.open_gender_voting(p_actor,p_aal,p_round);end if;
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
end$function$;
commit;
