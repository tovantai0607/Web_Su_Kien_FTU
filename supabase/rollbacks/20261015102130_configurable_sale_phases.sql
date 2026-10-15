begin;
-- Restore behavior only if it is compatible with the settings still stored in the database.
do $$
declare original record;
begin
  if exists(select 1 from public.purchase_offers o join public.contest_editions e on e.id=o.edition_id
    join public.contest_rounds r on r.id=o.round_id where o.mode='LIVE' and e.slug='ftucharm-2027' and (
      o.early_quota is distinct from 100 or
      (r.kind='semifinal' and (o.early_open_at is distinct from '2027-03-29T00:00:00+07:00'::timestamptz
        or o.early_close_at is distinct from '2027-03-31T00:00:00+07:00'::timestamptz
        or o.normal_close_at is distinct from '2027-04-25T00:00:00+07:00'::timestamptz)) or
      (r.kind='final' and (o.early_open_at is distinct from '2027-04-26T09:00:00+07:00'::timestamptz
        or o.early_close_at is distinct from '2027-04-26T11:00:00+07:00'::timestamptz
        or o.normal_close_at is distinct from '2027-05-23T00:00:00+07:00'::timestamptz)))) then
    raise exception 'ROLLBACK_BLOCKED_CUSTOM_SALE_PHASES';
  end if;
  for original in select definition from ftu_sales_private.sale_phase_original loop
    execute original.definition;
  end loop;
end $$;
drop table ftu_sales_private.sale_phase_original;
commit;
