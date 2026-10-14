-- User explicitly authorized DEMO writes on project ifgtyslifgegwcguysbb.
-- Illustrative prices/quota/time window are NOT the 2027 event sales configuration.
begin;
do $$
declare ed uuid; rd uuid; off_id uuid; existing public.purchase_offers;
begin
  perform pg_advisory_xact_lock(hashtextextended('ftu:configure:ticket-demo-20261014',0));
  select * into existing from public.purchase_offers where slug='test-giao-dich-demo' for update;
  if found then
    if existing.mode<>'DEMO' or existing.title<>'Test mua vé DEMO — không chuyển tiền'
      then raise exception 'EXISTING_DEMO_CONFLICT'; end if;
    return; -- preserve prices, allocations, deadlines and history on retries
  end if;
  if exists(select 1 from public.contest_editions where slug='ftu-ticket-demo-20261014')
    then raise exception 'DEMO_EDITION_ALREADY_EXISTS_REVIEW_FIRST'; end if;
  insert into public.contest_editions(slug,title,year,published)
    values('ftu-ticket-demo-20261014','DEMO kiểm tra lưu đơn — không chuyển tiền',2027,true)
    returning id into ed;
  insert into public.contest_rounds(edition_id,title,kind,position,cutoff,published)
    values(ed,'Vòng test vé DEMO','final',0,10,true) returning id into rd;
  insert into public.purchase_offers(edition_id,round_id,slug,title,mode,published,payment_instructions)
    values(ed,rd,'test-giao-dich-demo','Test mua vé DEMO — không chuyển tiền','DEMO',true,'DEMO — không chuyển tiền. Chỉ dùng thông tin và ảnh minh chứng giả.')
    returning id into off_id;
  insert into public.purchase_products(offer_id,name,tier,quota,price_vnd,combo2_vnd,combo3_vnd,opens_at,closes_at,enabled)
    select off_id,n,t,100,100000,200000,300000,statement_timestamp()-interval '5 minutes',statement_timestamp()+interval '7 days',true
    from unnest(array['The Intro','The Bridge','The Chorus']) n
    cross join unnest(array['EARLY','NORMAL']) t;
end $$;
select o.id,o.edition_id,o.round_id,o.slug,o.mode,o.published,
  (select count(*) from public.purchase_products p where p.offer_id=o.id) as products
from public.purchase_offers o where o.slug='test-giao-dich-demo';
commit;
