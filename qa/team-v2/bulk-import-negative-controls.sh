#!/usr/bin/env bash
# Negative controls for bulk-import-concurrency.sh: each mutation removes one
# defence, and the harness must FAIL with the named message. A guard never
# observed failing is an assumption, not a check (project rule D35).
# Each control runs in a throwaway copy of the prepared synthetic database.
set -euo pipefail
SRC_DB=${PGDATABASE:?PGDATABASE must name the prepared synthetic database}
HERE=$(cd "$(dirname "$0")" && pwd)

run_control() { # name expected_message mutation_sql [skip_measure]
  local db="nc_$1" out="/tmp/team-v2-nc-$1.log" rc
  psql -X -q -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $db" \
    -c "CREATE DATABASE $db TEMPLATE $SRC_DB"
  psql -X -q -d "$db" -v ON_ERROR_STOP=1 -c "$3"
  set +e
  PGDATABASE="$db" TEAM_V2_BULK_SIZES=100 TEAM_V2_BULK_SKIP_MEASURE="${4:-0}" TEAM_V2_BULK_LOG_DIR="/tmp/team-v2-nc-$1" \
    bash "$HERE/bulk-import-concurrency.sh" > "$out" 2>&1
  rc=$?
  set -e
  psql -X -q -d postgres -c "DROP DATABASE $db"
  if [[ $rc == 0 ]]; then echo "FAIL control $1: harness passed with defence removed"; exit 1; fi
  if ! grep -q "$2" "$out"; then
    echo "FAIL control $1: harness failed for the wrong reason"; tail -5 "$out"; exit 1
  fi
  echo "PASS control $1 caught: $(grep -m1 '^FAIL' "$out")"
}

# 1. No source epoch on players (trigger kept by name, body a no-op).
NOOP_EPOCH="CREATE FUNCTION qa.noop_epoch() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RETURN NULL; END \$\$;
  CREATE OR REPLACE TRIGGER team_v2_epoch_players AFTER INSERT OR UPDATE OR DELETE ON public.players
  FOR EACH ROW EXECUTE FUNCTION qa.noop_epoch();"
# 1a. The per-row epoch count guard notices.
run_control no_player_epoch_count "canary epoch updates != 2N" "$NOOP_EPOCH"
# 1b. Independently, an in-flight import no longer serialises Save, so Save
#     commits a pre-import snapshot while the import transaction is open.
run_control no_player_epoch_overlap "Save committed an obsolete snapshot during import" "$NOOP_EPOCH" 1

# 2. Epoch ignores the canary allowlist: derived from the real migration text
#    with only the canary guard line removed, so noncanary imports write rows.
MIG="$HERE/../../supabase/migrations/20261027110000_team_v2_source_epoch.sql"
EPOCH_NO_CANARY=$(sed -n '/^CREATE FUNCTION public.team_v2_record_source_change/,/^\$source_epoch\$;/p' "$MIG" |
  sed -e 's/^CREATE FUNCTION/CREATE OR REPLACE FUNCTION/' -e '/team_v2_canary_active(touched)/d')
grep -q 'CREATE OR REPLACE FUNCTION public.team_v2_record_source_change' <<<"$EPOCH_NO_CANARY" ||
  { echo "FAIL control setup: could not derive epoch function from migration"; exit 1; }
! grep -q team_v2_canary_active <<<"$EPOCH_NO_CANARY" ||
  { echo "FAIL control setup: canary guard still present"; exit 1; }
run_control epoch_ignores_canary "noncanary import touched a tournament row" "$EPOCH_NO_CANARY"

# 3. Fingerprint blind to source changes: stale scorer digest authorises Save.
run_control blind_fingerprint "stale fingerprint authorised Save after identical replacement" \
  "CREATE OR REPLACE FUNCTION public.team_v2_source_fingerprint(p_tournament_id uuid)
   RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
   AS \$\$ SELECT encode(sha256(convert_to(p_tournament_id::text,'UTF8')),'hex') \$\$;"

echo "PASS all bulk-import negative controls failed the harness for the named reason"
