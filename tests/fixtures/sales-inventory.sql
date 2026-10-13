-- Fake local/test data only. No seed for remote or production.
begin;
insert into auth.users(id) values
 ('99010000-0000-4000-8000-000000000001'),('99010000-0000-4000-8000-000000000002');
insert into public.contest_editions(id,slug,title,year,published)
 values('99010000-0000-4000-8000-000000000010','sales-test','TEST SALES ONLY',2026,true);
insert into public.contest_rounds(id,edition_id,title,kind,position,cutoff,published)
 values('99010000-0000-4000-8000-000000000020','99010000-0000-4000-8000-000000000010','TEST FINAL','final',0,10,true);
insert into public.tickets(id,edition_id,round_id,user_id,seat_label,token_hash)
 values('99010000-0000-4000-8000-000000000030','99010000-0000-4000-8000-000000000010','99010000-0000-4000-8000-000000000020','99010000-0000-4000-8000-000000000001','A1','test-only-token-hash');
insert into public.events(id,edition_id,round_id,slug,title,venue,starts_at,sale_open_at,sale_close_at)
 values('99010000-0000-4000-8000-000000000040','99010000-0000-4000-8000-000000000010','99010000-0000-4000-8000-000000000020','sales-test-event','TEST SALES EVENT','TEST VENUE',clock_timestamp()+interval '2 days',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour');
insert into public.ticket_categories(id,event_id,name,position) values
 ('99010000-0000-4000-8000-000000000050','99010000-0000-4000-8000-000000000040','TEST TIER 1',1),
 ('99010000-0000-4000-8000-000000000051','99010000-0000-4000-8000-000000000040','TEST TIER 2',2);
insert into public.event_seats(id,event_id,category_id,row_label,seat_number,label) values
 ('99010000-0000-4000-8000-000000000060','99010000-0000-4000-8000-000000000040','99010000-0000-4000-8000-000000000050','A',1,'A1'),
 ('99010000-0000-4000-8000-000000000061','99010000-0000-4000-8000-000000000040','99010000-0000-4000-8000-000000000050','A',2,'A2'),
 ('99010000-0000-4000-8000-000000000062','99010000-0000-4000-8000-000000000040','99010000-0000-4000-8000-000000000051','B',1,'B1'),
 ('99010000-0000-4000-8000-000000000063','99010000-0000-4000-8000-000000000040','99010000-0000-4000-8000-000000000051','B',2,'B2');
update public.tickets set event_id='99010000-0000-4000-8000-000000000040',category_id='99010000-0000-4000-8000-000000000050',seat_id='99010000-0000-4000-8000-000000000060' where id='99010000-0000-4000-8000-000000000030';
update public.events set published=true where id='99010000-0000-4000-8000-000000000040';
commit;
