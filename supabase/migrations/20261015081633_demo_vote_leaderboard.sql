begin;

-- Aggregate only approved, published DEMO rounds. Keep LIVE result publication unchanged.
-- INVOKER is deliberate: only the backend service role can read all votes.
create function public.read_demo_vote_leaderboard(p_round uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  with demo_round as (
    select r.id from public.contest_rounds r
    join public.contest_editions e on e.id=r.edition_id and e.published
    where r.id=p_round and r.published
      and exists(select 1 from public.purchase_offers o where o.round_id=r.id and o.mode='DEMO' and o.published)
      and not exists(select 1 from public.purchase_offers o where o.round_id=r.id and o.mode='LIVE')
  ), session as (
    select s.id from public.vote_sessions s join demo_round r on r.id=s.round_id
    where s.published order by s.open_at desc nulls last,s.id limit 1
  ), counts as (
    select v.category_id,v.contestant_id,count(*) votes from public.votes v
    join session s on s.id=v.session_id where v.round_id=p_round
    group by v.category_id,v.contestant_id
  ), ranked as (
    select ec.category_id,ec.contestant_id,coalesce(c.votes,0) votes,
      dense_rank() over(partition by ec.category_id order by coalesce(c.votes,0) desc) rank
    from public.vote_eligible_contestants ec join session s on s.id=ec.session_id
    join public.vote_categories cat on cat.id=ec.category_id and cat.round_id=p_round
    join public.contestants person on person.id=ec.contestant_id and person.published
    left join counts c on c.category_id=ec.category_id and c.contestant_id=ec.contestant_id
    where ec.round_id=p_round
  ) select case when exists(select 1 from demo_round) then
    jsonb_build_object('session_id',(select id from session),'rows',
      coalesce((select jsonb_agg(to_jsonb(r) order by r.category_id,r.rank,r.contestant_id) from ranked r),'[]'::jsonb))
    else null end;
$$;
revoke all on function public.read_demo_vote_leaderboard(uuid) from public,anon,authenticated;
grant execute on function public.read_demo_vote_leaderboard(uuid) to service_role;

commit;
