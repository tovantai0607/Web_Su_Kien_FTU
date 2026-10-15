-- Keep effective normal quota after closing: existing holds still have their TTL,
-- and BTC must be able to save unchanged configuration after a full 700-ticket sale.
do $$
declare definition text;revised text;
begin
 definition=pg_get_functiondef('ftu_sales_private.product_stock(uuid,timestamptz)'::regprocedure);
 revised=replace(definition,'if phase=''NORMAL'' and p.tier=''NORMAL'' then','if phase in (''NORMAL'',''CLOSED'') and p.tier=''NORMAL'' then');
 if revised=definition then raise exception 'EXPECTED_STOCK_FUNCTION_NOT_FOUND';end if;
 execute revised;
 definition=pg_get_functiondef('public.save_purchase_offer(uuid,text,jsonb)'::regprocedure);
 revised=replace(definition,'ftu_sales_private.offer_phase(o.id,clock_timestamp())=''NORMAL'' then','ftu_sales_private.offer_phase(o.id,clock_timestamp()) in (''NORMAL'',''CLOSED'') then');
 if revised=definition then raise exception 'EXPECTED_CONFIG_FUNCTION_NOT_FOUND';end if;
 -- Avoid a PL/pgSQL record variable shadowing the alias in product ownership checks.
 revised=replace(revised,'effective bigint;p public.purchase_products;stock jsonb;','effective bigint;normal_product public.purchase_products;stock jsonb;');
 revised=replace(revised,'for p in select * from public.purchase_products where offer_id=(p_data->>''id'')::uuid and tier=''NORMAL'' order by id loop','for normal_product in select * from public.purchase_products where offer_id=(p_data->>''id'')::uuid and tier=''NORMAL'' order by id loop');
 revised=replace(revised,'product_stock(p.id,clock_timestamp())','product_stock(normal_product.id,clock_timestamp())');
 revised=replace(revised,'<p.sold_quantity+','<normal_product.sold_quantity+');
 revised=replace(revised,'where id=p.id;','where id=normal_product.id;');
 execute revised;
end $$;
