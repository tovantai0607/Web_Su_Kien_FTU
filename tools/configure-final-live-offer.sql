-- Khởi tạo cấu hình LIVE chưa công bố; không giá/quota/giờ/QR giả.
-- Chỉ dùng cho project ifgtyslifgegwcguysbb đã được người dùng chỉ định.
-- Không đổi schema, mùa/vòng, Auth, quyền, vé hoặc phiếu.
begin;
do $$
declare target_edition uuid := '99912261-1765-4980-adcb-3d129a81afba';
        target_round uuid := '555e2f29-d3fe-4995-9276-af5683dbfca5';
        existing public.purchase_offers;
begin
  perform pg_advisory_xact_lock(hashtextextended('ftu:configure:chung-ket-2027',0));
  if not exists (
    select 1 from public.contest_editions e
    join public.contest_rounds r on r.edition_id=e.id
    where e.id=target_edition and e.slug='ftucharm-2027' and e.year=2027
      and r.id=target_round and r.kind='final'
  ) then raise exception 'EXPECTED_2027_FINAL_NOT_FOUND'; end if;

  select * into existing from public.purchase_offers where slug='chung-ket-2027' for update;
  if found then
    if existing.edition_id<>target_edition or existing.round_id<>target_round
      or existing.mode<>'LIVE' then raise exception 'EXISTING_OFFER_CONFLICT'; end if;
    -- Không ghi đè cấu hình đã tồn tại khi chạy lại.
    return;
  end if;

  if exists (select 1 from public.purchase_offers where edition_id=target_edition and round_id=target_round)
    then raise exception 'FINAL_ALREADY_HAS_OFFER_REVIEW_FIRST'; end if;

  insert into public.purchase_offers(edition_id,round_id,slug,title,venue,starts_at,published,mode,payment_instructions,qr_path)
  values(target_edition,target_round,'chung-ket-2027','Đêm chung kết FTUCharm 2027','',null,false,'LIVE','',null);
end $$;
select id,edition_id,round_id,slug,title,mode,published,starts_at,qr_path
from public.purchase_offers where slug='chung-ket-2027';
commit;
