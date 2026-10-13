-- Authorized staging bootstrap only. No real contestants, users, tickets or votes.
-- Dates, registration and voting stay closed until approved by the organizer.
begin;
insert into public.contest_editions(slug,title,theme,year,published)
values ('ftucharm-staging','FTUCharm – Duyên dáng Ngoại thương (thử nghiệm)','',2026,false)
on conflict(slug) do nothing;

insert into public.timeline_events(edition_id,title,position,published)
select e.id,s.title,s.position,false
from public.contest_editions e
cross join (values
 (0,'Kick-off'),(1,'Mở đơn đăng ký'),(2,'Sơ khảo'),
 (3,'Training đầu tiên'),(4,'Bộ ảnh truyền thông'),
 (5,'Mở bán vé bán kết'),(6,'Bán kết'),(7,'Training chung kết'),
 (8,'Bộ ảnh truyền thông chung kết'),(9,'Mở bán vé chung kết'),(10,'Chung kết')
) as s(position,title)
where e.slug='ftucharm-staging'
on conflict(edition_id,position) do nothing;

-- 50 is a provisional ceiling, not an approved elimination quota.
insert into public.contest_rounds(edition_id,title,kind,position,cutoff,published)
select e.id,s.title,s.kind,s.position,50,false
from public.contest_editions e
cross join (values
 (0,'Sơ khảo (nháp)','preliminary'),
 (1,'Bán kết (nháp)','semifinal'),
 (2,'Chung kết (nháp)','final')
) as s(position,title,kind)
where e.slug='ftucharm-staging'
on conflict(edition_id,position) do nothing;

insert into public.news_categories(name)
values ('Tin tức'),('Hành trình'),('Cẩm nang')
on conflict(name) do nothing;
commit;
