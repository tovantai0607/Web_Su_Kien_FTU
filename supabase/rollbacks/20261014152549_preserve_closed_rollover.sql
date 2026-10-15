-- Function-only rollback; no customer or configuration data is changed.
do $$
declare definition text;
begin
 definition=pg_get_functiondef('ftu_sales_private.product_stock(uuid,timestamptz)'::regprocedure);
 execute replace(definition,'if phase in (''NORMAL'',''CLOSED'') and p.tier=''NORMAL'' then','if phase=''NORMAL'' and p.tier=''NORMAL'' then');
 definition=pg_get_functiondef('public.save_purchase_offer(uuid,text,jsonb)'::regprocedure);
 execute replace(definition,'ftu_sales_private.offer_phase(o.id,clock_timestamp()) in (''NORMAL'',''CLOSED'') then','ftu_sales_private.offer_phase(o.id,clock_timestamp())=''NORMAL'' then');
end $$;
