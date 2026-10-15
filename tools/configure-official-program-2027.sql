-- Authorized official configuration; no fixtures, customer writes or image uploads.
begin;
do $$
declare eid uuid;semifinal uuid;final uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('ftu:official-program-2027',0));
 select id into eid from public.contest_editions where slug='ftucharm-2027' and year=2027 for update;
 if eid is null then raise exception 'OFFICIAL_EDITION_NOT_FOUND';end if;
 if exists(select 1 from public.purchase_requests where edition_id=eid) then raise exception 'REVIEW_EXISTING_OFFICIAL_PURCHASES';end if;
 update public.contest_editions set published=true,registration_open_at='2027-03-07T00:00:00+07:00',registration_close_at='2027-03-22T00:00:00+07:00' where id=eid and registration_open_at is null and registration_close_at is null;
 select id into semifinal from public.contest_rounds where edition_id=eid and kind='semifinal';
 if semifinal is null then
  insert into public.contest_rounds(edition_id,title,kind,position,cutoff,published)
  values(eid,'Bán kết FTUCharm 2027','semifinal',1,null,true) returning id into semifinal;
 end if;
 select id into final from public.contest_rounds where edition_id=eid and kind='final';
 if final is null then raise exception 'OFFICIAL_FINAL_NOT_FOUND';end if;
 update public.contest_rounds set published=true where id in(semifinal,final);
 update public.contest_rounds set position=2 where id=final and position=0 and not exists(select 1 from public.contest_rounds where edition_id=eid and position=2);
 insert into public.purchase_offers(edition_id,round_id,slug,title,published,mode,event_date,total_quota,early_quota,early_open_at,early_close_at,normal_close_at)
 values(eid,semifinal,'ban-ket-2027','Đêm bán kết FTUCharm 2027',true,'LIVE','2027-04-25',700,100,'2027-03-29T00:00:00+07:00','2027-03-31T00:00:00+07:00','2027-04-25T00:00:00+07:00')
 on conflict(slug) do nothing;
 insert into public.purchase_offers(edition_id,round_id,slug,title,published,mode,event_date,total_quota,early_quota,early_open_at,early_close_at,normal_close_at)
 values(eid,final,'chung-ket-2027','Đêm chung kết FTUCharm 2027',true,'LIVE','2027-05-23',700,100,'2027-04-26T09:00:00+07:00','2027-04-26T11:00:00+07:00','2027-05-23T00:00:00+07:00')
 on conflict(slug) do nothing;
 update public.purchase_offers set published=true,event_date='2027-05-23',total_quota=700,early_quota=100,early_open_at='2027-04-26T09:00:00+07:00',early_close_at='2027-04-26T11:00:00+07:00',normal_close_at='2027-05-23T00:00:00+07:00'
 where slug='chung-ket-2027' and edition_id=eid and round_id=final and mode='LIVE' and total_quota is null;
 if not exists(select 1 from public.purchase_offers where slug='chung-ket-2027' and edition_id=eid and round_id=final and mode='LIVE' and total_quota=700) then raise exception 'OFFICIAL_OFFER_CONFLICT';end if;
 insert into public.timeline_events(edition_id,title,description,position,starts_at,ends_at,published)
 select eid,title,description,position,starts_at::timestamptz,ends_at::timestamptz,true from (values
 (0,'Khám phá FTUCharm 2027','15/02–06/03: xem thông tin và lịch chương trình; chưa nhận hồ sơ, bán vé hoặc vote.','2027-02-15T00:00:00+07:00','2027-03-07T00:00:00+07:00'),
 (1,'Mở đăng ký thí sinh','Nhận hồ sơ từ 07/03 đến hết 21/03/2027, dành cho sinh viên FTU.','2027-03-07T00:00:00+07:00','2027-03-22T00:00:00+07:00'),
 (2,'Đóng đăng ký thí sinh','Hết ngày 21/03 đóng đơn; từ 00:00 ngày 22/03 không nhận hồ sơ mới.','2027-03-22T00:00:00+07:00','2027-03-22T00:00:00+07:00'),
 (3,'Vé sớm bán kết','29–30/03: tối đa 100 vé trong tổng 700 vé. Có thể hết sớm; bán đủ vé sớm thì chuyển vé thường. Giá và phân bổ loại vé chờ BTC.','2027-03-29T00:00:00+07:00','2027-03-31T00:00:00+07:00'),
 (4,'Vé thường bán kết','Mở sau vé sớm, hoặc sớm hơn khi đã bán đủ vé sớm. Đóng hết 24/04 hoặc khi hết vé. Vé sớm còn dư chuyển sang vé thường cùng loại.','2027-03-31T00:00:00+07:00','2027-04-25T00:00:00+07:00'),
 (5,'Công bố ảnh thí sinh bán kết','BTC cập nhật ảnh và danh sách bán kết trong 10–11/04. Ảnh được công bố khi đã sẵn sàng.','2027-04-10T00:00:00+07:00','2027-04-12T00:00:00+07:00'),
 (6,'Đêm bán kết và bình chọn','25/04: diễn ra bán kết; vote trong ngày với cửa sổ 10 phút. Giờ tổ chức, giờ vote và danh sách hợp lệ chờ BTC công bố.','2027-04-25T00:00:00+07:00','2027-04-26T00:00:00+07:00'),
 (7,'Vé sớm chung kết','26/04 từ 09:00–11:00: tối đa 100 vé trong tổng 700 vé; có thể hết sớm.','2027-04-26T09:00:00+07:00','2027-04-26T11:00:00+07:00'),
 (8,'Vé thường chung kết','Mở sau vé sớm, hoặc sớm hơn khi đã bán đủ vé sớm. Đóng hết 22/05 hoặc khi hết vé; giá chờ BTC công bố.','2027-04-26T11:00:00+07:00','2027-05-23T00:00:00+07:00'),
 (9,'Đêm chung kết','Chung kết diễn ra ngày 23/05/2027. Giờ, địa điểm và lịch vote chờ BTC công bố.','2027-05-23T00:00:00+07:00','2027-05-24T00:00:00+07:00'),
 (10,'Vinh danh nhà vô địch','Dự kiến khoảng 23:00 ngày 23/05: BTC công bố tên và ảnh nhà vô địch từng hạng mục sau khi xác nhận kết quả.','2027-05-23T23:00:00+07:00',null)
 ) as schedule(position,title,description,starts_at,ends_at)
 on conflict(edition_id,position) do nothing;
end $$;
commit;
