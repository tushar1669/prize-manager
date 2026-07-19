import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const BROCHURE_IMPORT_ROLLOUT_QUERY_KEY = ["brochure-import-rollout-state"] as const;

type RolloutRpcRow = { enabled: boolean };

function coerceRolloutState(data: unknown): boolean {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return false;
  return (row as Partial<RolloutRpcRow>).enabled === true;
}

export async function fetchBrochureImportRolloutState(): Promise<boolean> {
  const { data, error } = await supabase.rpc("get_brochure_import_rollout_state");
  if (error) throw error;
  return coerceRolloutState(data);
}

/** Platform-level kill switch for brochure import; disabled and invisible unless a master enables it. */
export function useBrochureImportRollout() {
  const query = useQuery({
    queryKey: BROCHURE_IMPORT_ROLLOUT_QUERY_KEY,
    queryFn: fetchBrochureImportRolloutState,
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
