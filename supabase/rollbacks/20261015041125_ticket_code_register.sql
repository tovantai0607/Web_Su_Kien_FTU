begin;
do $$ begin
  if exists(select 1 from ftu_sales_private.ticket_code_slots where ticket_id is not null) then
    raise exception 'ROLLBACK_BLOCKED_RETAIN_TICKET_CODES';end if;
end $$;
drop trigger assign_inserted_ticket_code on public.tickets;
drop function public.read_own_ticket_codes(uuid),public.read_ticket_code_register(uuid,text,text,integer),public.configure_ticket_code_stock(uuid,text,integer,integer);
drop function ftu_sales_private.assign_inserted_ticket_code(),ftu_sales_private.assign_ticket_code(uuid),ftu_sales_private.ticket_code_line(uuid,bigint);
drop table ftu_sales_private.ticket_code_slots;
drop function ftu_sales_private.protect_ticket_code();
drop table ftu_sales_private.ticket_code_batches;
commit;
