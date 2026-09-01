#!/usr/bin/env bash
# scripts/backlog_sweep_repo.sh
#
# Repo-side half of the backlog loop. Re-measures every frontend backlog claim
# in PROJECT_STATE §14 against the working tree, and prints one named verdict
# per item.
#
# Run from the repo root:   bash scripts/backlog_sweep_repo.sh
#
# Discipline, same as the SQL sweep:
#   * A check whose target file is missing reports UNMEASURED, never CLOSED.
#   * The verdict comes from a grep, never from the document.
#   * Read-only. This script never edits anything.

set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

open=0; closed=0; unmeasured=0

# check <key> <file> <pattern> <present_means> <label>
#   present_means = OPEN   -> finding the pattern means the defect is still live
#   present_means = CLOSED -> finding the pattern means the fix is in
check() {
  local key="$1" file="$2" pattern="$3" present_means="$4" label="$5"
  local verdict count

  if [[ ! -f "$file" ]]; then
    verdict="UNMEASURED"; count="no file"
  else
    count=$(grep -cF -- "$pattern" "$file" 2>/dev/null | head -1)
    [[ -z "$count" ]] && count=0
    if [[ "$count" -gt 0 ]]; then
      verdict="$present_means"
    else
      [[ "$present_means" == "OPEN" ]] && verdict="CLOSED" || verdict="OPEN"
    fi
  fi

  printf '  %-8s %-11s %-8s %s\n' "$key" "$verdict" "$count" "$label"
  case "$verdict" in
    OPEN)       open=$((open+1)) ;;
    CLOSED)     closed=$((closed+1)) ;;
    UNMEASURED) unmeasured=$((unmeasured+1)) ;;
  esac
}

echo "REPO BACKLOG SWEEP   HEAD=$(git rev-parse --short HEAD)   branch=$(git rev-parse --abbrev-ref HEAD)"
echo "  key      verdict     value    item"

U=src/pages/TournamentUpgrade.tsx
A=src/pages/Account.tsx
P=src/pages/PublishSuccess.tsx
F=src/pages/Finalize.tsx
C=src/pages/admin/AdminCoupons.tsx

check "B13#1" "$U" "Awaiting admin approval"        OPEN   "B13 #1 post-submit toast hardcodes 'Awaiting admin approval'"
check "B13#2" "$U" 'to="/account"'                  OPEN   "B13 #2 bare Link to /account, no returnToForClaim"
check "B13#5" "$U" "speeds up approval"             OPEN   "B13 #5 screenshot copy understates the auto-approval trade-off"
check "B13#3" "$A" "coupon_redemptions"             CLOSED "B13 #3 Account coupon list joins coupon_redemptions"
check "B13#9" "$P" 'useState(true)'                 OPEN   "B13 #9 PublishSuccess assumes published on mount"
check "B13#9b" "$P" '/t/${id}/public'               OPEN   "B13 #9 PublishSuccess falls back to the legacy public URL"
check "B138"  "$F" "single publish surface (B13 #8)" CLOSED "B13 #8 Finalize single publish surface (batch F1)"
check "B20"   "$F" "publish_blocked_no_winners"     CLOSED "B20 durable audit on publish early returns (batch F1)"
check "F1TIE" "$F" "hasPendingTeamTies"             OPEN   "Dead hasPendingTeamTies state removed from Finalize (batch F1)"
check "B13#7" "$C" "min-w-0"                        CLOSED "B13 #7 /admin/coupons filter row has an overflow guard"

echo
echo "  NOT MECHANICALLY CHECKABLE -- tracked in PROJECT_STATE only:"
echo "    - the team-tie guard itself still needs designing (F1TIE only proves the dead state is gone)"
echo "    - B13 #7 clipping is a rendered-layout defect; min-w-0 is a proxy, not the measurement"
echo "    - sportup.online GTM claims (FIDE partner, player count, ToS date) live on another property"

echo
echo "  Baselines (must match PROJECT_STATE §2 before any batch starts):"
npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep "error TS" | sed 's/(.*//' | sort | uniq -c | sort -rn | sed 's/^/    /'
echo "    total tsc errors: $(npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c 'error TS')"

echo
echo "SUMMARY: $open OPEN, $closed CLOSED, $unmeasured UNMEASURED (UNMEASURED is never CLOSED)"
