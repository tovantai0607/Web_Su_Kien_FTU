-- Stop the local official runtime before rollback. Publications must be backed up.
begin;
drop trigger official_offer_policy on public.purchase_offers;
drop function ftu_sales_private.official_offer_policy();
drop index public.one_program_offer_per_round;
drop trigger official_vote_window on public.vote_sessions;
drop function ftu_sales_private.official_vote_window();
drop function public.save_program_publication(uuid,text,jsonb);
-- Preserve publication data: move the table out of the public API rather than delete it.
alter table public.program_publications set schema ftu_sales_private;
drop function public.purchase_catalog(text),public.reserve_purchase(uuid,jsonb,uuid,text),public.complete_purchase(uuid,uuid,uuid),public.save_purchase_offer(uuid,text,jsonb);
alter function public.purchase_catalog_before_2027(text) rename to purchase_catalog;
alter function public.reserve_purchase_before_2027(uuid,jsonb,uuid,text) rename to reserve_purchase;
alter function public.complete_purchase_before_2027(uuid,uuid,uuid) rename to complete_purchase;
alter function public.save_purchase_offer_before_2027(uuid,text,jsonb) rename to save_purchase_offer;
grant execute on function public.purchase_catalog(text),public.reserve_purchase(uuid,jsonb,uuid,text),public.complete_purchase(uuid,uuid,uuid),public.save_purchase_offer(uuid,text,jsonb) to service_role;
-- Unpublish incomplete offers before reinstating the old QR constraint.
update public.purchase_offers set published=false where mode='LIVE' and (qr_path is null or length(trim(payment_instructions))=0);
alter table public.purchase_offers add constraint purchase_offers_check check(not published or mode='DEMO' or (qr_path is not null and length(trim(payment_instructions))>0));
drop function ftu_sales_private.product_stock(uuid,timestamptz),ftu_sales_private.offer_ready(uuid),ftu_sales_private.offer_phase(uuid,timestamptz);
drop trigger product_base_quota on public.purchase_products;
drop function ftu_sales_private.product_base_quota();
-- Added columns remain for recovery; the restored functions ignore them.
commit;
