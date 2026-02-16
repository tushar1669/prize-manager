#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Smoke test for parseWorkbook JWT enforcement.

Required:
  --url <parseWorkbook_endpoint>

Optional:
  --jwt <valid_user_jwt>

Example:
  scripts/smoke/parseWorkbook-auth.sh \
    --url https://<project-ref>.supabase.co/functions/v1/parseWorkbook

  scripts/smoke/parseWorkbook-auth.sh \
    --url https://<project-ref>.supabase.co/functions/v1/parseWorkbook \
    --jwt "$SUPABASE_USER_JWT"
USAGE
}

URL=""
JWT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)
      URL="${2:-}"
      shift 2
      ;;
    --jwt)
      JWT="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "$URL" ]]; then
  echo "Error: --url is required." >&2
  usage
  exit 2
fi

echo "[1/2] Requesting parseWorkbook without Authorization header..."
status_no_auth=$(curl -sS -o /dev/null -w '%{http_code}' "$URL?ping=1")

if [[ "$status_no_auth" != "401" ]]; then
  echo "FAIL: expected 401 without auth, got $status_no_auth" >&2
  exit 1
fi

echo "PASS: unauthenticated request returned 401 as expected."

if [[ -n "$JWT" ]]; then
  echo "[2/2] Requesting parseWorkbook with Authorization header..."
  status_with_auth=$(curl -sS -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $JWT" \
    "$URL?ping=1")

  if [[ "$status_with_auth" == "401" ]]; then
    echo "FAIL: expected non-401 with valid JWT, got 401" >&2
    exit 1
  fi

  echo "PASS: authenticated request returned $status_with_auth (non-401)."
else
  echo "[2/2] Skipped authenticated check (no --jwt provided)."
fi
