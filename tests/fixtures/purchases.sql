-- Local fake data only. This fixture is never a Supabase seed/migration.
insert into auth.users values
 ('98010000-0000-4000-8000-000000000001'),('98010000-0000-4000-8000-000000000002'),('98010000-0000-4000-8000-000000000003');
insert into public.user_roles values('98010000-0000-4000-8000-000000000003','SUPER_ADMIN');
insert into public.contest_editions(id,slug,title,year,published) values('98010000-0000-4000-8000-000000000010','supplement-test','DEMO LOCAL ONLY',2027,true);
insert into public.contest_rounds(id,edition_id,title,kind,position,cutoff,published) values('98010000-0000-4000-8000-000000000020','98010000-0000-4000-8000-000000000010','DEMO SEMIFINAL','semifinal',0,10,true);
insert into public.purchase_offers(id,edition_id,round_id,slug,title,venue,mode,published) values('98010000-0000-4000-8000-000000000040','98010000-0000-4000-8000-000000000010','98010000-0000-4000-8000-000000000020','ban-ket-local','Bán kết DEMO local','Địa điểm DEMO','DEMO',true);
insert into public.purchase_products(id,offer_id,name,tier,quota,price_vnd,combo2_vnd,combo3_vnd,opens_at,closes_at) values
 ('98010000-0000-4000-8000-000000000050','98010000-0000-4000-8000-000000000040','The Intro','EARLY',100000,100000,190000,280000,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day'),
 ('98010000-0000-4000-8000-000000000051','98010000-0000-4000-8000-000000000040','The Bridge','NORMAL',100000,100000,190000,280000,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day'),
 ('98010000-0000-4000-8000-000000000052','98010000-0000-4000-8000-000000000040','The Chorus','NORMAL',100000,100000,190000,280000,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day');
insert into public.contestants(id,edition_id,user_id,slug,display_name,faculty,bio,gender,published) values
 ('98010000-0000-4000-8000-000000000060','98010000-0000-4000-8000-000000000010','98010000-0000-4000-8000-000000000003','male-demo','Nam DEMO','TEST','TEST','male',true),
 ('98010000-0000-4000-8000-000000000061','98010000-0000-4000-8000-000000000010','98010000-0000-4000-8000-000000000002','female-demo','Nữ DEMO','TEST','TEST','female',true);
insert into public.round_entries values
 ('98010000-0000-4000-8000-000000000010','98010000-0000-4000-8000-000000000020','98010000-0000-4000-8000-000000000060',true),
 ('98010000-0000-4000-8000-000000000010','98010000-0000-4000-8000-000000000020','98010000-0000-4000-8000-000000000061',true);
