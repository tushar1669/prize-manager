#!/usr/bin/env node

const requiredEnv = ['SUPABASE_URL', 'AUTH_TOKEN', 'TOURNAMENT_ID'];
const missing = requiredEnv.filter((name) => !process.env[name]);

if (missing.length) {
  console.error(`Missing env vars: ${missing.join(', ')}`);
  console.error('Usage: SUPABASE_URL=... AUTH_TOKEN=... TOURNAMENT_ID=... node scripts/verify-function-access.mjs');
  process.exit(1);
}

const { SUPABASE_URL, AUTH_TOKEN, TOURNAMENT_ID } = process.env;
const baseUrl = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1`;

const requests = [
  {
    name: 'allocatePrizes',
    path: 'allocatePrizes',
    body: { tournamentId: TOURNAMENT_ID, dryRun: true },
  },
  {
    name: 'allocateInstitutionPrizes',
    path: 'allocateInstitutionPrizes',
    body: { tournament_id: TOURNAMENT_ID },
  },
  {
    name: 'generatePdf',
    path: 'generatePdf',
    body: { tournamentId: TOURNAMENT_ID, version: 1 },
  },
  {
    name: 'finalize',
    path: 'finalize',
    body: {
      tournamentId: TOURNAMENT_ID,
      winners: [
        {
          prizeId: '00000000-0000-0000-0000-000000000000',
          playerId: '00000000-0000-0000-0000-000000000000',
          reasons: ['manual_check'],
          isManual: true,
        },
      ],
    },
  },
];

const headers = {
  Authorization: `Bearer ${AUTH_TOKEN}`,
  'Content-Type': 'application/json',
};

let failed = false;

for (const request of requests) {
  const response = await fetch(`${baseUrl}/${request.path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request.body),
  });

  const text = await response.text();
  const ok = response.status === 403;
  failed = failed || !ok;

  console.log(`${request.name}: status=${response.status}`);
  if (!ok) {
    console.log(`  expected 403, got ${response.status}`);
    console.log(`  body=${text}`);
  }
}

if (failed) {
  process.exit(1);
}

console.log('All functions returned 403 as expected for unauthorized tournament access.');
