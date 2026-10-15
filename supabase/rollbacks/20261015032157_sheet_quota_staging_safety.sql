begin;
-- Reverting quota validation is unsafe after using the feature. Preserve history.
do $$
declare original text;
begin
  if exists(select 1 from ftu_sales_private.sheet_edit_operations) then
    raise exception 'ROLLBACK_BLOCKED_RETAIN_SHEET_QUOTA_SAFETY';end if;
  select definition into original from ftu_sales_private.sheet_quota_original;
  if original is null then raise exception 'ORIGINAL_SHEET_QUOTA_SOURCE_MISSING';end if;
  execute original;
end $$;
drop function ftu_sales_private.validate_sheet_offer_quota(uuid,jsonb,timestamptz);
drop table ftu_sales_private.sheet_quota_original;
commit;
