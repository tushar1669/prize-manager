import type { MutableRefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const MAIN_CATEGORY_NAME = "Main Prize";

async function ensureMainCategoryExists({
  prizeMode,
  categories,
  categoriesLoading,
  tournamentId,
  supabaseClient,
  queryClient,
  ensuringRef,
}: {
  prizeMode: "individual" | "team";
  categories: Array<{ is_main?: boolean; [key: string]: unknown }> | null | undefined;
  categoriesLoading: boolean;
  tournamentId?: string;
  supabaseClient: typeof supabase;
  queryClient: ReturnType<typeof useQueryClient>;
  ensuringRef: MutableRefObject<boolean>;
}) {
  if (prizeMode !== "individual") return false;
  // Wait for categories to finish loading before checking - prevents race condition
  if (!tournamentId || categoriesLoading) return false;
  // Guard: categories must be an array (even if empty) after loading completes
  if (!Array.isArray(categories)) return false;

  const hasMainCategory = categories.some((c) => c.is_main);
  if (hasMainCategory || ensuringRef.current) return false;

  ensuringRef.current = true;

  // DB-FIRST CHECK: Query DB directly to avoid stale in-memory state
  const { data: existingMain } = await supabaseClient
    .from("categories")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("is_main", true)
    .maybeSingle();

  if (existingMain) {
    // Main already exists in DB, just refetch to sync state
    console.log("[ensureMainCategoryExists] Main category already exists in DB, syncing");
    ensuringRef.current = false;
    await queryClient.invalidateQueries({ queryKey: ["categories", tournamentId] });
    return false;
  }

  const { error } = await supabaseClient.from("categories").insert({
    tournament_id: tournamentId,
    name: MAIN_CATEGORY_NAME,
    is_main: true,
    criteria_json: {},
    order_idx: 0,
  });

  if (error) {
    ensuringRef.current = false;
    // If unique constraint violation (main already exists), just refetch
    if (error.code === "23505") {
      console.warn("[ensureMainCategoryExists] Main category already exists (unique constraint), refetching");
      await queryClient.invalidateQueries({ queryKey: ["categories", tournamentId] });
      return false;
    }
    throw error;
  }

  await queryClient.invalidateQueries({ queryKey: ["categories", tournamentId] });
  return true;
}

export { ensureMainCategoryExists, MAIN_CATEGORY_NAME };
