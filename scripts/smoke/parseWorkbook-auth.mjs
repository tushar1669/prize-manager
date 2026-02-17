#!/usr/bin/env node

/**
 * Smoke test for parseWorkbook JWT enforcement.
 *
 * Usage:
 *   PARSE_WORKBOOK_URL="https://<project-ref>.supabase.co/functions/v1/parseWorkbook" \
 *   node scripts/smoke/parseWorkbook-auth.mjs
 *
 *   PARSE_WORKBOOK_URL="https://<project-ref>.supabase.co/functions/v1/parseWorkbook" \
 *   SUPABASE_USER_JWT="<jwt>" \
 *   node scripts/smoke/parseWorkbook-auth.mjs
 */

const url = process.env.PARSE_WORKBOOK_URL;
const jwt = process.env.SUPABASE_USER_JWT;

if (!url) {
  console.error('Missing PARSE_WORKBOOK_URL environment variable.');
  process.exit(2);
}

const pingUrl = `${url}${url.includes('?') ? '&' : '?'}ping=1`;

async function hit(name, headers = {}) {
  const response = await fetch(pingUrl, { method: 'GET', headers });
  console.log(`${name}: ${response.status}`);
  return response.status;
}

const unauthStatus = await hit('[1/2] no Authorization header');
if (unauthStatus !== 401) {
  console.error(`FAIL: expected 401 without auth, got ${unauthStatus}`);
  process.exit(1);
}
console.log('PASS: unauthenticated request returned 401.');

if (!jwt) {
  console.log('[2/2] skipped authenticated check (set SUPABASE_USER_JWT to run).');
  process.exit(0);
}

const authStatus = await hit('[2/2] with Authorization header', {
  Authorization: `Bearer ${jwt}`,
});

if (authStatus === 401) {
  console.error('FAIL: expected non-401 with a valid JWT, got 401');
  process.exit(1);
}

console.log(`PASS: authenticated request returned non-401 (${authStatus}).`);
