#!/usr/bin/env bash
set -euo pipefail
# Two concurrent service-role clients against ONE fresh synthetic tournament.
# PostgreSQL row lock must permit exactly one expected-version=0 commit.
set +e
psql -v ON_ERROR_STOP=1 -c "SET ROLE service_role; SELECT qa.submit_version(0);" > /tmp/team-v2-writer-a.log 2>&1 &
a=$!
psql -v ON_ERROR_STOP=1 -c "SET ROLE service_role; SELECT qa.submit_version(0);" > /tmp/team-v2-writer-b.log 2>&1 &
b=$!
wait "$a"; ra=$?
wait "$b"; rb=$?
set -e
if ! { [[ "$ra" == 0 && "$rb" != 0 ]] || [[ "$ra" != 0 && "$rb" == 0 ]]; }; then
  echo "FAIL expected exactly one committed writer"
  exit 1
fi
if [[ "$ra" != 0 ]]; then grep -q "team_v2_stale_allocation_version" /tmp/team-v2-writer-a.log; fi
if [[ "$rb" != 0 ]]; then grep -q "team_v2_stale_allocation_version" /tmp/team-v2-writer-b.log; fi
individual=$(psql -At -c "SELECT count(*) FROM public.allocations WHERE version=1")
team=$(psql -At -c "SELECT count(*) FROM public.team_allocations WHERE version=1")
versions=$(psql -At -c "SELECT count(DISTINCT version) FROM public.team_allocations")
pins=$(psql -At -c "SELECT count(*) FROM public.publications WHERE allocation_version=0")
if [[ "$individual" != 1 || "$team" != 1 || "$versions" != 1 || "$pins" != 1 ]]; then
  echo "FAIL parallel write caused partial version or changed pin"
  exit 1
fi
echo "PASS two real parallel connections: 1 commit, 1 stale reject, no partial allocation or pin change"

# Verify a concurrent source edit is never committed against a pre-edit
# server fingerprint. Two separate PostgreSQL sessions; no production data.
# The mutator holds its real ROW EXCLUSIVE table lock until after Save begins.
psql -v ON_ERROR_STOP=1 -c "TRUNCATE public.allocations, public.team_allocations" >/dev/null
source_id='00000000-0000-4000-8000-000000000001'
player_id='00000000-0000-4000-8000-000000000004'
actor_id='00000000-0000-4000-8000-000000000010'
digest=$(psql -At -c "SET ROLE service_role; SELECT public.team_v2_source_fingerprint('$source_id'::uuid);" | tail -n 1)
if [[ ! "$digest" =~ ^[0-9a-f]{64}$ ]]; then
  echo "FAIL expected source digest was not generated"
  exit 1
fi

psql -v ON_ERROR_STOP=1 -c "BEGIN;
  UPDATE public.players SET points=6 WHERE id='$player_id'::uuid;
  SELECT pg_sleep(4);
  COMMIT;" > /tmp/team-v2-source-mutator.log 2>&1 &
mutator=$!

# Prove the second client starts only after the uncommitted source update
# occurred (not merely a post-update, sequential rejection).
mutated=0
for i in $(seq 1 60); do
  if grep -q 'UPDATE 1' /tmp/team-v2-source-mutator.log; then
    mutated=1
    break
  fi
  if ! kill -0 "$mutator" 2>/dev/null; then break; fi
  sleep 0.1
done
if [[ "$mutated" != 1 ]]; then
  wait "$mutator" || true
  echo "FAIL concurrent mutator did not reach source update"
  cat /tmp/team-v2-source-mutator.log
  exit 1
fi

set +e
timeout 15s psql -v ON_ERROR_STOP=1 -c "SET ROLE service_role;
  SELECT qa.submit_version(0,'$actor_id'::uuid,9,false,'$digest');" > /tmp/team-v2-source-save.log 2>&1
save_rc=$?
wait "$mutator"; mutator_rc=$?
set -e
if [[ "$mutator_rc" != 0 || "$save_rc" == 0 || "$save_rc" == 124 ]]; then
  echo "FAIL overlapping source edit was accepted, blocked indefinitely or mutator failed"
  cat /tmp/team-v2-source-save.log
  cat /tmp/team-v2-source-mutator.log
  exit 1
fi
grep -q 'team_v2_source_changed' /tmp/team-v2-source-save.log || {
  echo "FAIL concurrent source update rejected for the wrong reason"
  cat /tmp/team-v2-source-save.log
  exit 1
}
if [[ "$(psql -At -c "SELECT count(*) FROM public.allocations")" != 0 ||
      "$(psql -At -c "SELECT count(*) FROM public.team_allocations")" != 0 ||
      "$(psql -At -c "SELECT count(*) FROM public.publications WHERE allocation_version=0")" != 1 ]]; then
  echo "FAIL concurrent source rejection wrote awards or changed publication"
  exit 1
fi
echo "PASS source editor overlapping atomic Save: changed digest rejected, no partial award, pin preserved"

