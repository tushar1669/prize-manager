import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { BROCHURE_PARSER_V2_ROLLOUT_QUERY_KEY, useBrochureParserV2Rollout } from "@/hooks/useBrochureParserV2Rollout";

function readEnabled(data: unknown): boolean {
  const row = Array.isArray(data) ? data[0] : data;
  return !!row && typeof row === "object" && (row as { enabled?: unknown }).enabled === true;
}

export function ParserV2RolloutControl() {
  const queryClient = useQueryClient();
  const rollout = useBrochureParserV2Rollout();
  const mutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data, error } = await supabase.rpc("set_brochure_parser_v2_rollout_state", { p_enabled: enabled });
      if (error) throw error;
      return readEnabled(data);
    },
    onSuccess: async (enabled) => {
      await queryClient.invalidateQueries({ queryKey: BROCHURE_PARSER_V2_ROLLOUT_QUERY_KEY });
      toast.success(enabled ? "AI Parser V2 enabled." : "AI Parser V2 disabled.");
    },
    onError: async () => {
      toast.error("Could not update AI Parser V2. No change was made.");
      await queryClient.invalidateQueries({ queryKey: BROCHURE_PARSER_V2_ROLLOUT_QUERY_KEY });
    },
  });

  const disabled = rollout.isLoading || mutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Parser V2 (Beta)</CardTitle>
        <CardDescription>
          Controls whether organizers can see and invoke Parser V2. The existing parser and manual prize setup remain available.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">{rollout.enabled ? "Enabled" : "Disabled"}</p>
            <p className="text-xs text-muted-foreground">An emergency server shutdown can still override this rollout control.</p>
          </div>
          <Switch
            checked={rollout.enabled}
            disabled={disabled}
            onCheckedChange={(checked) => mutation.mutate(checked)}
            aria-label="AI Parser V2 rollout"
          />
        </div>
      </CardContent>
    </Card>
  );
}
