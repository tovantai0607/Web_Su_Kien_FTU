begin;
-- Read-only helper: reverting it does not change tickets, votes or published results.
drop function if exists public.read_demo_vote_leaderboard(uuid);
commit;
