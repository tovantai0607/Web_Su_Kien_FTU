begin;
create function public.update_application(p_user uuid,p_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.contestant_private where id=p_id and user_id=p_user and status='needs_changes' for update;
 if not found then raise exception 'FORBIDDEN';end if;
 update public.contestants set faculty=p_data->>'faculty',bio=p_data->>'bio',talents=p_data->>'talents' where id=p_id;
 update public.contestant_private set status='pending',note=null where id=p_id;
 return jsonb_build_object('id',p_id,'status','pending');
end$$;
create function public.admin_save(p_actor uuid,p_aal text,p_table text,p_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare required_role text;cols text='';vals text='';updates text='';k text;result jsonb;allowed text[];
begin
 case p_table
 when 'contest_editions' then required_role='CONTENT_EDITOR';allowed=array['slug','title','theme','year','registration_open_at','registration_close_at','published'];
 when 'contest_rounds' then required_role='VOTE_MANAGER';allowed=array['edition_id','title','kind','position','cutoff','published','vote_open_at','vote_close_at'];
 when 'timeline_events' then required_role='CONTENT_EDITOR';allowed=array['edition_id','title','description','position','starts_at','ends_at','published'];
 when 'news_posts' then required_role='CONTENT_EDITOR';allowed=array['edition_id','title','slug','excerpt','body','category','published'];
 when 'sponsors' then required_role='CONTENT_EDITOR';allowed=array['edition_id','name','tier','url','published'];
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
create function public.publish_round(p_actor uuid,p_aal text,p_round uuid,p_ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
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
end$$;
create function public.issue_ticket(p_actor uuid,p_aal text,p_user uuid,p_round uuid,p_seat text,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.contest_rounds;tid uuid;
begin
 if p_aal<>'aal2' or not public.has_role(p_actor,array['TICKET_STAFF']) then raise exception 'FORBIDDEN';end if;
 select * into r from public.contest_rounds where id=p_round;if not found then raise exception 'NOT_FOUND';end if;
 insert into public.tickets(edition_id,round_id,user_id,seat_label,token_hash) values(r.edition_id,r.id,p_user,p_seat,p_hash) returning id into tid;
 insert into public.audit_logs(edition_id,actor_id,action,target_id) values(r.edition_id,p_actor,'issue_ticket',tid);
 return jsonb_build_object('id',tid,'seat_label',p_seat);
end$$;
create function public.set_user_role(p_actor uuid,p_aal text,p_user uuid,p_role text,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_aal<>'aal2' or not public.has_role(p_actor,array['SUPER_ADMIN']) then raise exception 'FORBIDDEN';end if;
 perform pg_advisory_xact_lock(77102026);
 if not p_enabled and p_role='SUPER_ADMIN' and (select count(*) from public.user_roles where role='SUPER_ADMIN')<=1 then raise exception 'LAST_ADMIN';end if;
 if p_enabled then insert into public.user_roles values(p_user,p_role) on conflict do nothing;else delete from public.user_roles where user_id=p_user and role=p_role;end if;
 insert into public.audit_logs(actor_id,action,target_id,detail) values(p_actor,'set_role',p_user,jsonb_build_object('role',p_role,'enabled',p_enabled));
end$$;
revoke all on function public.update_application(uuid,uuid,jsonb),public.admin_save(uuid,text,text,uuid,jsonb),public.publish_round(uuid,text,uuid,uuid[]),public.issue_ticket(uuid,text,uuid,uuid,text,text),public.set_user_role(uuid,text,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.update_application(uuid,uuid,jsonb),public.admin_save(uuid,text,text,uuid,jsonb),public.publish_round(uuid,text,uuid,uuid[]),public.issue_ticket(uuid,text,uuid,uuid,text,text),public.set_user_role(uuid,text,uuid,text,boolean) to service_role;
commit;
