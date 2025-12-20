/**
 * Shared health check utilities for Prize-Manager edge functions.
 * 
 * Standardized contract:
 * - Triggered by: ?ping=1 OR empty body OR {} OR {"ping": true}
 * - Response: { function, status: "ok", buildVersion }
 * - No auth required for health checks
 */

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

/**
 * Check if request is a health check ping.
 * 
 * @param req - The incoming request
 * @param rawBody - The raw body text (if already read)
 * @returns true if this is a ping request
 */
export function isPingRequest(req: Request, rawBody?: string): boolean {
  // Check query param
  const url = new URL(req.url);
  if (url.searchParams.get("ping") === "1") {
    return true;
  }
  
  // Check body
  if (rawBody !== undefined) {
    const trimmed = rawBody.trim();
    if (!trimmed || trimmed === '{}') {
      return true;
    }
    
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && parsed.ping === true) {
        return true;
      }
    } catch {
      // Not valid JSON, not a ping
    }
  }
  
  return false;
}

/**
 * Check if request URL has ?ping=1 (before reading body)
 */
export function hasPingQueryParam(req: Request): boolean {
  const url = new URL(req.url);
  return url.searchParams.get("ping") === "1";
}

/**
 * Check if raw body indicates a ping request
 */
export function isPingBody(rawBody: string): boolean {
  const trimmed = rawBody.trim();
  if (!trimmed || trimmed === '{}') {
    return true;
  }
  
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && parsed.ping === true;
  } catch {
    return false;
  }
}

/**
 * Create a standardized ping response.
 * 
 * @param functionName - Name of the edge function
 * @param buildVersion - Build version timestamp
 * @param corsHeaders - CORS headers to include
 * @returns Response with health check JSON
 */
export function pingResponse(
  functionName: string, 
  buildVersion: string, 
  corsHeaders: Record<string, string> = CORS_HEADERS
): Response {
  return new Response(
    JSON.stringify({ 
      function: functionName, 
      status: "ok", 
      buildVersion 
    }),
    { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    }
  );
}
