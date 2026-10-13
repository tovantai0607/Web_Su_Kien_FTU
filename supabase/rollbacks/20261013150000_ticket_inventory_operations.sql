-- Disable the stage-03 HTTP/cron consumers before running. Preserves every order/hold/history row.
begin;
set local lock_timeout = '5s';
drop function public.reserve_sales_seats(uuid,uuid,uuid[],uuid,text),public.release_sales_hold(uuid,uuid),
  public.read_sales_hold(uuid,uuid),public.expire_sales_holds(uuid,integer),public.sales_catalog(uuid,uuid,text);
drop function ftu_sales_private.release_order_hold(uuid,boolean);
commit;
