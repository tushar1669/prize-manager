import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { CORS_HEADERS } from "../_shared/health.ts";

const BUILD_VERSION = "2025-12-20T20:00:00Z";
const FUNCTION_NAME = "pmPing";

const corsHeaders = CORS_HEADERS;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Minimal public response — do not enumerate deployed functions to unauthenticated callers.
  return new Response(
    JSON.stringify({
      function: FUNCTION_NAME,
      status: 'ok',
      buildVersion: BUILD_VERSION,
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
});
