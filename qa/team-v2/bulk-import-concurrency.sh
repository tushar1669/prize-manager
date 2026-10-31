#!/usr/bin/env bash
# Team V2 bulk player-import concurrency and source-epoch safety.
# Synthetic data only, isolated ephemeral PostgreSQL only. Real independent
# psql sessions; synchronisation by observed output markers, never by sleep
# ordering alone. Run after atomic-contract.sql and concurrent.sh.
#
# Budget (derived, not invented): production PostgREST runs import_replace_players
# as `authenticated` with statement_timeout=8s and lock_timeout=8s (read from
# pg_roles, 2026-10-31). Every import here runs under those same settings, so a
# timeout here is a timeout a real organiser would hit.
set -euo pipefail

CANARY=00000000-0000-4000-8000-000000000001
NONCANARY=00000000-0000-4000-8000-000000000011
ACTOR=00000000-0000-4000-8000-000000000010
SIZES=${TEAM_V2_BULK_SIZES:-"100 500 1250"}
LOG=${TEAM_V2_BULK_LOG_DIR:-/tmp/team-v2-bulk}
mkdir -p "$LOG"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -At)
AS_ORGANISER="SET ROLE authenticated; SET statement_timeout='8s'; SET lock_timeout='8s';"

q() { "${PSQL[@]}" -c "$1" | tail -n 1; }
fail() { echo "FAIL $*"; exit 1; }
now_ms() { date +%s%3N; }

digest() { q "SELECT public.team_v2_source_fingerprint('$1'::uuid)"; }

import_sql() { # tournament n club_a_top club_a_second poison
  local other=false
  [[ "$1" == "$NONCANARY" ]] && other=true
  echo "SELECT qa.import_replace_players('$1'::uuid, qa.synthetic_roster($2,$3,$4,$5,$other));"
}

assert_no_deadlock() {
  if grep -l 'deadlock detected' "$LOG"/*.log >/dev/null 2>&1; then
    fail "deadlock detected: $(grep -l 'deadlock detected' "$LOG"/*.log)"
  fi
}

assert_pin_and_history() { # expected_history_checksum label
  local pins rows
  pins=$(q "SELECT count(*) FROM public.publications WHERE tournament_id='$CANARY' AND allocation_version=0")
  rows=$(q "SELECT count(*) FROM public.publications WHERE tournament_id='$CANARY'")
  [[ "$pins" == 1 && "$rows" == 1 ]] || fail "$2: publication pin changed (pins=$pins rows=$rows)"
  [[ "$(q "SELECT qa.saved_history_checksum('$CANARY')")" == "$1" ]] ||
    fail "$2: saved allocation history or publication changed"
}

assert_watermark() { # tournament label
  local wm cnt
  wm=$(q "SELECT players_count_max FROM public.tournament_player_watermark WHERE tournament_id='$1'")
  cnt=$(q "SELECT count(*) FROM public.players WHERE tournament_id='$1'")
  # Production semantics: GREATEST(previous max, post-statement count).
  [[ -n "$wm" && "$wm" -ge "$cnt" ]] || fail "$2: watermark $wm below player count $cnt"
}

save() { # expected digest [timeout] -> writes rc; logs to $LOG/save-<tag>.log
  local tag=$3 to=${4:-15s}
  set +e
  timeout "$to" "${PSQL[@]}" -c "SET ROLE service_role; SELECT qa.submit_version($1,'$ACTOR'::uuid,9,$( [[ $1 == 0 ]] && echo false || echo true ),'$2');" \
    > "$LOG/save-$tag.log" 2>&1
  local rc=$?
  set -e
  return $rc
}

reset_canary() { # n -> canary holds an n-player roster, no saved versions
  q "TRUNCATE public.allocations, public.team_allocations" >/dev/null
  "${PSQL[@]}" -c "$AS_ORGANISER $(import_sql $CANARY "$1" 5 4 false)" >/dev/null
}

wait_marker() { # file marker pid label
  for _ in $(seq 1 100); do
    grep -q "$2" "$1" 2>/dev/null && return 0
    kill -0 "$3" 2>/dev/null || break
    sleep 0.1
  done
  cat "$1"; fail "$4: background session never reached $2"
}

# Fresh synthetic baseline, independent of earlier harness steps.
q "TRUNCATE public.allocations, public.team_allocations" >/dev/null
[[ "$(q "SELECT public.team_v2_canary_active('$CANARY')")" == t ]] || fail "canary fixture not enabled"
[[ "$(q "SELECT public.team_v2_canary_active('$NONCANARY')")" == f ]] || fail "noncanary fixture enabled"
EMPTY_HISTORY=$(q "SELECT qa.saved_history_checksum('$CANARY')")

echo "postgres=$(q 'SHOW server_version') sizes=[$SIZES] budget=statement_timeout 8s, lock_timeout 8s"
printf '%-6s %-10s %10s %22s\n' players arm import_ms tournament_row_updates

for N in $SIZES; do
  # ---------- Measurement: same payload, epoch trigger on/off, canary/noncanary
  # TEAM_V2_BULK_SKIP_MEASURE=1 is for negative controls only, so a later
  # case's guard can be shown failing independently of the epoch-count guard.
  if [[ "${TEAM_V2_BULK_SKIP_MEASURE:-0}" != 1 ]]; then
  reset_canary "$N"
  q "ALTER TABLE public.players DISABLE TRIGGER team_v2_epoch_players" >/dev/null
  base=$("${PSQL[@]}" -c "$AS_ORGANISER SELECT qa.measure_import('$CANARY', qa.synthetic_roster($N))" | tail -n1)
  q "ALTER TABLE public.players ENABLE TRIGGER team_v2_epoch_players" >/dev/null
  can=$("${PSQL[@]}" -c "$AS_ORGANISER SELECT qa.measure_import('$CANARY', qa.synthetic_roster($N))" | tail -n1)
  non=$("${PSQL[@]}" -c "$AS_ORGANISER SELECT qa.measure_import('$NONCANARY', qa.synthetic_roster($N,5,4,false,true))" | tail -n1)
  for arm in base:"$base" canary:"$can" noncanary:"$non"; do
    j=${arm#*:}
    printf '%-6s %-10s %10s %22s\n' "$N" "${arm%%:*}" \
      "$(q "SELECT '$j'::jsonb->>'ms'")" "$(q "SELECT '$j'::jsonb->>'tournament_row_updates'")"
  done
  # Canary import deletes N and inserts N rows: one epoch UPDATE per row.
  [[ "$(q "SELECT '$can'::jsonb->>'tournament_row_updates'")" == $((2 * N)) ]] ||
    fail "N=$N canary epoch updates != 2N"
  [[ "$(q "SELECT '$non'::jsonb->>'tournament_row_updates'")" == 0 ]] ||
    fail "N=$N noncanary import touched a tournament row"
  [[ "$(q "SELECT '$base'::jsonb->>'tournament_row_updates'")" == 0 ]] ||
    fail "N=$N baseline unexpectedly touched a tournament row"
  assert_watermark "$CANARY" "N=$N measurement"
  assert_watermark "$NONCANARY" "N=$N measurement"
  fi

  # ---------- A. Identical replacement invalidates the old fingerprint (matched pair)
  reset_canary "$N"
  d0=$(digest $CANARY)
  "${PSQL[@]}" -c "$AS_ORGANISER $(import_sql $CANARY "$N" 5 4 false)" >/dev/null
  [[ "$(q "SELECT qa.players_checksum('$CANARY')")" == "$(q "SELECT md5(string_agg((p->>'id')||':'||(p->>'points')||':'||(p->>'club'), ',' ORDER BY p->>'id')) FROM jsonb_array_elements(qa.synthetic_roster($N)) p")" ]] ||
    fail "A N=$N replacement payload was not byte-identical"
  if save 0 "$d0" "A-stale-$N"; then fail "A N=$N stale fingerprint authorised Save after identical replacement"; fi
  grep -q team_v2_source_changed "$LOG/save-A-stale-$N.log" || { cat "$LOG/save-A-stale-$N.log"; fail "A N=$N wrong rejection"; }
  assert_pin_and_history "$EMPTY_HISTORY" "A N=$N stale"
  save 0 "$(digest $CANARY)" "A-fresh-$N" || { cat "$LOG/save-A-fresh-$N.log"; fail "A N=$N fresh fingerprint Save (positive control) failed"; }
  [[ "$(q "SELECT count(*) FROM public.team_allocations WHERE tournament_id='$CANARY' AND version=1")" == 1 ]] ||
    fail "A N=$N positive control wrote no team award"

  # ---------- B. Changed scores: stale digest rejected; fresh digest with stale award rejected
  reset_canary "$N"
  d0=$(digest $CANARY)
  "${PSQL[@]}" -c "$AS_ORGANISER $(import_sql $CANARY "$N" 6 5 false)" >/dev/null
  if save 0 "$d0" "B-stale-$N"; then fail "B N=$N stale fingerprint accepted after score change"; fi
  grep -q team_v2_source_changed "$LOG/save-B-stale-$N.log" || { cat "$LOG/save-B-stale-$N.log"; fail "B N=$N wrong rejection"; }
  if save 0 "$(digest $CANARY)" "B-staleaward-$N"; then
    fail "B N=$N award computed from obsolete scores committed under a fresh fingerprint"
  fi
  grep -q 'team_v2_' "$LOG/save-B-staleaward-$N.log" || { cat "$LOG/save-B-staleaward-$N.log"; fail "B N=$N unexpected error"; }
  assert_pin_and_history "$EMPTY_HISTORY" "B N=$N"

  # ---------- C1. Import holds the source open; overlapping Save must wait, then reject
  reset_canary "$N"
  d0=$(digest $CANARY)
  "${PSQL[@]}" > "$LOG/import-C1-$N.log" 2>&1 <<SQL &
$AS_ORGANISER
BEGIN;
$(import_sql $CANARY "$N" 5 4 false)
SELECT 'IMPORTED';
SELECT pg_sleep(3);
COMMIT;
SQL
  imp=$!
  wait_marker "$LOG/import-C1-$N.log" IMPORTED $imp "C1 N=$N"
  t0=$(now_ms)
  if save 0 "$d0" "C1-$N"; then fail "C1 N=$N Save committed an obsolete snapshot during import"; fi
  waited=$(( $(now_ms) - t0 ))
  wait $imp || { cat "$LOG/import-C1-$N.log"; fail "C1 N=$N import failed"; }
  grep -q team_v2_source_changed "$LOG/save-C1-$N.log" || { cat "$LOG/save-C1-$N.log"; fail "C1 N=$N wrong rejection"; }
  (( waited >= 1500 )) || fail "C1 N=$N Save did not overlap the open import (waited ${waited}ms)"
  assert_pin_and_history "$EMPTY_HISTORY" "C1 N=$N"
  assert_watermark "$CANARY" "C1 N=$N"
  echo "C1 N=$N save waited ${waited}ms on open import, then team_v2_source_changed"

  # ---------- C2. Save holds the tournament lock; overlapping import must wait, then commit
  reset_canary "$N"
  d0=$(digest $CANARY)
  "${PSQL[@]}" > "$LOG/save-C2-$N.log" 2>&1 <<SQL &
SET ROLE service_role;
BEGIN;
SELECT qa.submit_version(0,'$ACTOR'::uuid,9,false,'$d0');
SELECT 'SAVED';
SELECT pg_sleep(3);
COMMIT;
SQL
  sv=$!
  wait_marker "$LOG/save-C2-$N.log" SAVED $sv "C2 N=$N"
  t0=$(now_ms)
  set +e
  timeout 15s "${PSQL[@]}" -c "$AS_ORGANISER $(import_sql $CANARY "$N" 6 5 false)" > "$LOG/import-C2-$N.log" 2>&1
  irc=$?
  set -e
  waited=$(( $(now_ms) - t0 ))
  wait $sv || { cat "$LOG/save-C2-$N.log"; fail "C2 N=$N Save failed"; }
  [[ $irc == 0 ]] || { cat "$LOG/import-C2-$N.log"; fail "C2 N=$N import failed under production 8s timeouts"; }
  (( waited >= 1500 )) || fail "C2 N=$N import did not overlap the open Save (waited ${waited}ms)"
  [[ "$(q "SELECT count(*) FROM public.team_allocations WHERE tournament_id='$CANARY' AND version=1")" == 1 &&
     "$(q "SELECT count(*) FROM public.allocations WHERE tournament_id='$CANARY' AND version=1")" == 1 ]] ||
    fail "C2 N=$N Save committed a partial version"
  H1=$(q "SELECT qa.saved_history_checksum('$CANARY')")
  [[ "$(digest $CANARY)" != "$d0" ]] || fail "C2 N=$N import committed without changing the source fingerprint"
  if save 1 "$d0" "C2-followup-$N"; then fail "C2 N=$N pre-import snapshot committed after import"; fi
  grep -q team_v2_source_changed "$LOG/save-C2-followup-$N.log" || { cat "$LOG/save-C2-followup-$N.log"; fail "C2 N=$N wrong rejection"; }
  assert_pin_and_history "$H1" "C2 N=$N"
  assert_watermark "$CANARY" "C2 N=$N"
  echo "C2 N=$N import waited ${waited}ms on open Save, then committed; stale follow-up rejected"

  # ---------- D. A bulk import into a noncanary event never blocks the canary Save
  reset_canary 4
  ncx0=$(q "SELECT xmin FROM public.tournaments WHERE id='$NONCANARY'")
  "${PSQL[@]}" > "$LOG/import-D-$N.log" 2>&1 <<SQL &
$AS_ORGANISER
BEGIN;
$(import_sql $NONCANARY "$N" 5 4 false)
SELECT 'IMPORTED';
SELECT pg_sleep(4);
COMMIT;
SQL
  imp=$!
  wait_marker "$LOG/import-D-$N.log" IMPORTED $imp "D N=$N"
  save 0 "$(digest $CANARY)" "D-$N" 3s || { cat "$LOG/save-D-$N.log"; fail "D N=$N noncanary bulk import blocked or broke canary Save"; }
  kill -0 $imp 2>/dev/null || fail "D N=$N noncanary import finished before Save; overlap not proven"
  wait $imp || { cat "$LOG/import-D-$N.log"; fail "D N=$N noncanary import failed"; }
  [[ "$(q "SELECT xmin FROM public.tournaments WHERE id='$NONCANARY'")" == "$ncx0" ]] ||
    fail "D N=$N epoch trigger wrote a noncanary tournament row"
  assert_watermark "$NONCANARY" "D N=$N"

  # ---------- E. Failed import rolls back players, watermark, epoch and lineage
  reset_canary "$N"
  d0=$(digest $CANARY)
  ck0=$(q "SELECT qa.players_checksum('$CANARY')")
  wm0=$(q "SELECT players_count_max FROM public.tournament_player_watermark WHERE tournament_id='$CANARY'")
  x0=$(q "SELECT xmin FROM public.tournaments WHERE id='$CANARY'")
  set +e
  "${PSQL[@]}" -c "$AS_ORGANISER $(import_sql $CANARY "$N" 6 5 true)" > "$LOG/import-E-$N.log" 2>&1
  erc=$?
  set -e
  [[ $erc != 0 ]] || fail "E N=$N poisoned import unexpectedly succeeded"
  grep -q 'invalid input syntax' "$LOG/import-E-$N.log" || { cat "$LOG/import-E-$N.log"; fail "E N=$N failed for an unexpected reason"; }
  [[ "$(q "SELECT qa.players_checksum('$CANARY')")" == "$ck0" ]] || fail "E N=$N players not rolled back"
  [[ "$(q "SELECT players_count_max FROM public.tournament_player_watermark WHERE tournament_id='$CANARY'")" == "$wm0" ]] ||
    fail "E N=$N watermark not rolled back"
  [[ "$(q "SELECT xmin FROM public.tournaments WHERE id='$CANARY'")" == "$x0" ]] || fail "E N=$N epoch write not rolled back"
  [[ "$(digest $CANARY)" == "$d0" ]] || fail "E N=$N fingerprint changed after rolled-back import"
  assert_pin_and_history "$EMPTY_HISTORY" "E N=$N"
  # Positive control: unchanged source still saves with the pre-failure digest.
  save 0 "$d0" "E-$N" || { cat "$LOG/save-E-$N.log"; fail "E N=$N unchanged source rejected after rolled-back import"; }

  # ---------- F. Saved version + pin survive a later import and stale Save attempt
  H1=$(q "SELECT qa.saved_history_checksum('$CANARY')")
  "${PSQL[@]}" -c "$AS_ORGANISER $(import_sql $CANARY "$N" 5 4 false)" >/dev/null
  if save 1 "$d0" "F-$N"; then fail "F N=$N stale Save created a new version over saved history"; fi
  grep -q team_v2_source_changed "$LOG/save-F-$N.log" || { cat "$LOG/save-F-$N.log"; fail "F N=$N wrong rejection"; }
  assert_pin_and_history "$H1" "F N=$N"
  [[ "$(q "SELECT count(*) FROM public.team_allocations WHERE tournament_id='$CANARY' AND version=2")" == 0 ]] ||
    fail "F N=$N version 2 exists"

  assert_no_deadlock
  echo "PASS N=$N A identical, B changed, C1 import-first, C2 save-first, D noncanary, E rollback, F history/pin"
done

# Leave seed-shaped state for any later step.
reset_canary 4
q "TRUNCATE public.allocations, public.team_allocations" >/dev/null
echo "PASS bulk import vs Team V2 Save: sizes [$SIZES], no stale commit, no partial version, no deadlock, pins preserved"
