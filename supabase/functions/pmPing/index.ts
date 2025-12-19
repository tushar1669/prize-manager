import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Build version for deployment verification
const BUILD_VERSION = "2025-12-19T10:00:00Z";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// Known functions and their expected build versions
const FUNCTIONS = [
  { name: 'parseWorkbook', version: '2025-12-18T14:00:00Z' },
  { name: 'allocatePrizes', version: '2025-12-18T14:00:00Z' },
  { name: 'allocateInstitutionPrizes', version: '2025-12-18T14:00:00Z' },
  { name: 'generatePdf', version: '2025-12-18T14:00:00Z' },
  { name: 'finalize', version: 'unknown' },
];

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[pmPing] Health check requested');

  return new Response(
    JSON.stringify({
      status: 'ok',
      function: 'pmPing',
      buildVersion: BUILD_VERSION,
      timestamp: new Date().toISOString(),
      functions: FUNCTIONS,
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
});
