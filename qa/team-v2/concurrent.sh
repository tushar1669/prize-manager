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
