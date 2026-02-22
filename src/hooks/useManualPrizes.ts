import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ManualPrize {
  id: string;
  tournament_id: string;
  title: string;
  winner_name: string;
  prize_value: string | null;
  sponsor: string | null;
  notes: string | null;
  sort_order: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

type ManualPrizeInsert = {
  tournament_id: string;
  title: string;
  winner_name: string;
  prize_value?: string | null;
  sponsor?: string | null;
  notes?: string | null;
  sort_order?: number;
  is_visible?: boolean;
};

type ManualPrizeUpdate = {
  id: string;
  title?: string;
  winner_name?: string;
  prize_value?: string | null;
  sponsor?: string | null;
  notes?: string | null;
  is_visible?: boolean;
};

function queryKey(tournamentId: string) {
  return ["manual-prizes", tournamentId];
}

export function useManualPrizes(tournamentId: string | undefined) {
  return useQuery({
    queryKey: queryKey(tournamentId ?? ""),
    enabled: !!tournamentId,
    staleTime: 30_000,
    queryFn: async (): Promise<ManualPrize[]> => {
      const { data, error } = await (supabase.from as any)("tournament_manual_prizes")
        .select("*")
        .eq("tournament_id", tournamentId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ManualPrize[];
    },
  });
}

export function useCreateManualPrize(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<ManualPrizeInsert, "tournament_id">) => {
      const { data, error } = await (supabase.from as any)("tournament_manual_prizes")
        .insert({ ...input, tournament_id: tournamentId })
        .select()
        .single();
      if (error) throw error;
      return data as ManualPrize;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKey(tournamentId) });
      toast.success("Prize added");
    },
    onError: (err: Error) => {
      console.error("[manual-prizes] create error", err);
      toast.error(err.message?.includes("row-level security") ? "Pro access required to add prizes" : "Failed to add prize");
    },
  });
}

export function useUpdateManualPrize(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: ManualPrizeUpdate) => {
      const { error } = await (supabase.from as any)("tournament_manual_prizes")
        .update(fields)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKey(tournamentId) });
      toast.success("Prize updated");
    },
    onError: (err: Error) => {
      console.error("[manual-prizes] update error", err);
      toast.error("Failed to update prize");
    },
  });
}

export function useDeleteManualPrize(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)("tournament_manual_prizes")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKey(tournamentId) });
      toast.success("Prize deleted");
    },
    onError: (err: Error) => {
      console.error("[manual-prizes] delete error", err);
      toast.error("Failed to delete prize");
    },
  });
}

export function useReorderManualPrizes(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = orderedIds.map((id, idx) =>
        (supabase.from as any)("tournament_manual_prizes")
          .update({ sort_order: (idx + 1) * 10 })
          .eq("id", id)
      );
      const results = await Promise.all(updates);
      const failed = results.find((r: any) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKey(tournamentId) });
    },
    onError: (err: Error) => {
      console.error("[manual-prizes] reorder error", err);
      toast.error("Failed to save order");
    },
  });
}
