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

# An edit to a different NONCANARY tournament must NOT lock out the
# administrator's canary Save. Both are real concurrent PG sessions.
psql -v ON_ERROR_STOP=1 -c "TRUNCATE public.allocations, public.team_allocations" >/dev/null
psql -v ON_ERROR_STOP=1 > /tmp/team-v2-other-tournament-edit.log 2>&1 <<'SQL' &
BEGIN;
UPDATE public.players SET points=2
 WHERE id='00000000-0000-4000-8000-000000000030'::uuid;
SELECT pg_sleep(5);
COMMIT;
SQL
other_editor=$!
other_started=0
for i in $(seq 1 60); do
  if grep -q 'UPDATE 1' /tmp/team-v2-other-tournament-edit.log; then
    other_started=1
    break
  fi
  if ! kill -0 "$other_editor" 2>/dev/null; then break; fi
  sleep 0.1
done
if [[ "$other_started" != 1 ]]; then
  wait "$other_editor" || true
  echo "FAIL other event editor did not reach its update"
  exit 1
fi
set +e
timeout 3s psql -v ON_ERROR_STOP=1 -c "SET ROLE service_role;
  SELECT qa.submit_version(0,'00000000-0000-4000-8000-000000000010'::uuid,9,false);" \
  > /tmp/team-v2-canary-independent-save.log 2>&1
other_save_rc=$?
wait "$other_editor"; other_rc=$?
set -e
if [[ "$other_save_rc" != 0 || "$other_rc" != 0 ]] ||
   [[ "$(psql -At -c "SELECT count(*) FROM public.team_allocations WHERE version=1")" != 1 ]]; then
  echo "FAIL noncanary concurrent editor delayed or corrupted separate canary Save"
  cat /tmp/team-v2-canary-independent-save.log
  exit 1
fi
echo "PASS noncanary concurrent editor: independent canary Save completed without global lock"


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

# Edit two scorer tables in one real transaction, in the opposite order
# to the database Save's table locks. A blocking SHARE lock deadlocks here.
# Separate psql statements ensure UPDATE 1 is flushed BEFORE pg_sleep.
# A single -c multi-statement string can buffer output until COMMIT and
# deceptively make this a sequential, not concurrent, test.
psql -v ON_ERROR_STOP=1 > /tmp/team-v2-source-mutator.log 2>&1 <<SQL &
BEGIN;
UPDATE public.players SET points=6 WHERE id='$player_id'::uuid;
SELECT pg_sleep(4);
UPDATE public.tournaments SET owner_id=owner_id WHERE id='$source_id'::uuid;
COMMIT;
SQL
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
# Per-event row serialization must reject the obsolete source digest. After the writer
# commits, re-check with the ORIGINAL pre-edit digest to prove the stale
# score cannot be committed on an immediately retried request either.
grep -q 'team_v2_source_changed' /tmp/team-v2-source-save.log || {
  echo "FAIL source Save accepted old digest after concurrent edit"
  cat /tmp/team-v2-source-save.log
  exit 1
}
set +e
timeout 15s psql -v ON_ERROR_STOP=1 -c "SET ROLE service_role;
  SELECT qa.submit_version(0,'$actor_id'::uuid,9,false,'$digest');" > /tmp/team-v2-after-edit-save.log 2>&1
retry_rc=$?
set -e
if [[ "$retry_rc" == 0 || "$retry_rc" == 124 ]] ||
   ! grep -q 'team_v2_source_changed' /tmp/team-v2-after-edit-save.log; then
  echo "FAIL old source digest was accepted after editor committed"
  cat /tmp/team-v2-after-edit-save.log
  exit 1
fi
if [[ "$(psql -At -c "SELECT count(*) FROM public.allocations")" != 0 ||
      "$(psql -At -c "SELECT count(*) FROM public.team_allocations")" != 0 ||
      "$(psql -At -c "SELECT count(*) FROM public.publications WHERE allocation_version=0")" != 1 ]]; then
  echo "FAIL concurrent source rejection wrote awards or changed publication"
  exit 1
fi
echo "PASS two-table source editor vs Save: no deadlock, source fingerprint rejected; no partial award, pin preserved"

