import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { CORS_HEADERS } from "../_shared/health.ts";

const BUILD_VERSION = "2025-12-20T20:00:00Z";
const FUNCTION_NAME = "pmPing";

const corsHeaders = CORS_HEADERS;

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
      function: FUNCTION_NAME,
      status: 'ok',
      buildVersion: BUILD_VERSION,
      timestamp: new Date().toISOString(),
      functions: FUNCTIONS,
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
});
