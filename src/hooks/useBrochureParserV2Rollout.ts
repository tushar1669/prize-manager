import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const BROCHURE_PARSER_V2_ROLLOUT_QUERY_KEY = ["brochure-parser-v2-rollout-state"] as const;

type RolloutRpcRow = { enabled: boolean };

function coerceRolloutState(data: unknown): boolean {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return false;
  return (row as Partial<RolloutRpcRow>).enabled === true;
}

export async function fetchBrochureParserV2RolloutState(): Promise<boolean> {
  const { data, error } = await supabase.rpc("get_brochure_parser_v2_rollout_state");
  if (error) throw error;
  return coerceRolloutState(data);
}

export function useBrochureParserV2Rollout() {
  const query = useQuery({
    queryKey: BROCHURE_PARSER_V2_ROLLOUT_QUERY_KEY,
    queryFn: fetchBrochureParserV2RolloutState,
    staleTime: 45_000,
    refetchOnWindowFocus: true,
  });

  return {
    enabled: query.data === true && !query.isLoading && !query.isError,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
