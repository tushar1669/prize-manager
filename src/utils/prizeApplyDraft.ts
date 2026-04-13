import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface DraftPrize {
  place: number;
  cash_amount: number;
  has_trophy: boolean;
  has_medal: boolean;
  gift_items: string[];
  confidence: string;
  source_text: string;
}

export interface DraftCategory {
  name: string;
  is_main: boolean;
  order_idx: number;
  confidence: string;
  warnings: string[];
  criteria_json: Record<string, unknown>;
  prizes: DraftPrize[];
}

export interface DraftTeamGroup {
  name: string;
  group_by: string;
  team_size: number;
  confidence: string;
  warnings: string[];
  prizes: DraftPrize[];
}

export interface DraftResult {
  source: string;
  file_path: string;
  overall_confidence: string;
  warnings: string[];
  categories: DraftCategory[];
  team_groups: DraftTeamGroup[];
}

export interface ApplyReport {
  categories_created: number;
  categories_reused: number;
  prizes_created: number;
  prizes_skipped_existing: number;
  prizes_skipped_duplicate_in_draft: number;
  team_groups_created: number;
  team_groups_reused: number;
  team_prizes_created: number;
  team_prizes_skipped: number;
  failed_categories: string[];
  failed_team_groups: string[];
}

/** Convert draft string[] gift_items to DB shape [{name, qty}] with dedup+counting */
export function convertGiftItems(items: string[]): Array<{ name: string; qty: number }> {
  if (!items || items.length === 0) return [];
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = item.trim();
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([name, qty]) => ({ name, qty }));
}

export async function applyDraftAddOnly(
  tournamentId: string,
  draft: DraftResult,
  includeTeamGroups: boolean,
  verifiedTeamGroups: Set<number>,
): Promise<ApplyReport> {
  const report: ApplyReport = {
    categories_created: 0,
    categories_reused: 0,
    prizes_created: 0,
    prizes_skipped_existing: 0,
    prizes_skipped_duplicate_in_draft: 0,
    team_groups_created: 0,
    team_groups_reused: 0,
    team_prizes_created: 0,
    team_prizes_skipped: 0,
    failed_categories: [],
    failed_team_groups: [],
  };

  const { data: existingCats, error: catErr } = await supabase
    .from("categories")
    .select("id, name, is_main, order_idx")
    .eq("tournament_id", tournamentId)
    .eq("is_active", true);
  if (catErr) throw new Error(`Failed to fetch categories: ${catErr.message}`);

  const cats = existingCats || [];
  let resolvedMainCategoryId: string | null = cats.find((c) => c.is_main)?.id ?? null;
  const catByNormName = new Map(cats.map((c) => [c.name.trim().toLowerCase(), c]));
  let maxOrderIdx = cats.reduce((m, c) => Math.max(m, c.order_idx ?? 0), 0);

  const categoryIdMap: Array<{ draftIdx: number; categoryId: string }> = [];

  for (let i = 0; i < draft.categories.length; i++) {
    const dc = draft.categories[i];
    const normName = dc.name.trim().toLowerCase();
    const existing = catByNormName.get(normName);

    if (dc.is_main) {
      if (resolvedMainCategoryId) {
        categoryIdMap.push({ draftIdx: i, categoryId: resolvedMainCategoryId });
        report.categories_reused++;
        continue;
      }

      if (existing) {
        resolvedMainCategoryId = existing.id;
        categoryIdMap.push({ draftIdx: i, categoryId: existing.id });
        report.categories_reused++;
        continue;
      }

      maxOrderIdx++;
      const { data: inserted, error: insErr } = await supabase
        .from("categories")
        .insert({
          tournament_id: tournamentId,
          name: dc.name.trim(),
          is_main: true,
          criteria_json: {},
          order_idx: maxOrderIdx,
          is_active: true,
        })
        .select("id")
        .single();
      if (insErr) throw new Error(`Failed to create category "${dc.name}": ${insErr.message}`);

      resolvedMainCategoryId = inserted.id;
      categoryIdMap.push({ draftIdx: i, categoryId: inserted.id });
      catByNormName.set(normName, { id: inserted.id, name: dc.name, is_main: true, order_idx: maxOrderIdx });
      report.categories_created++;
      continue;
    }

    if (existing) {
      categoryIdMap.push({ draftIdx: i, categoryId: existing.id });
      report.categories_reused++;
      continue;
    }

    maxOrderIdx++;
    const { data: inserted, error: insErr } = await supabase
      .from("categories")
      .insert({
        tournament_id: tournamentId,
        name: dc.name.trim(),
        is_main: false,
        criteria_json: {},
        order_idx: maxOrderIdx,
        is_active: true,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(`Failed to create category "${dc.name}": ${insErr.message}`);

    categoryIdMap.push({ draftIdx: i, categoryId: inserted.id });
    catByNormName.set(normName, { id: inserted.id, name: dc.name, is_main: false, order_idx: maxOrderIdx });
    report.categories_created++;
  }

  const targetCatIds = [...new Set(categoryIdMap.map((m) => m.categoryId))];
  const { data: existingPrizes, error: pErr } = await supabase
    .from("prizes")
    .select("category_id, place")
    .in("category_id", targetCatIds)
    .eq("is_active", true);
  if (pErr) throw new Error(`Failed to fetch prizes: ${pErr.message}`);

  const existingPlaceMap = new Map<string, Set<number>>();
  for (const p of existingPrizes || []) {
    const key = p.category_id;
    if (!existingPlaceMap.has(key)) existingPlaceMap.set(key, new Set());
    existingPlaceMap.get(key)!.add(p.place);
  }

  const categoryToDraftSections = new Map<string, DraftCategory[]>();
  for (const mapping of categoryIdMap) {
    const current = categoryToDraftSections.get(mapping.categoryId) ?? [];
    current.push(draft.categories[mapping.draftIdx]);
    categoryToDraftSections.set(mapping.categoryId, current);
  }

  for (const [categoryId, sections] of categoryToDraftSections.entries()) {
    const existingPlaces = existingPlaceMap.get(categoryId) || new Set<number>();
    const seenDraftKeys = new Set<string>();
    const categoryRows: Array<{
      category_id: string;
      place: number;
      cash_amount: number;
      has_trophy: boolean;
      has_medal: boolean;
      gift_items: Array<{ name: string; qty: number }>;
      is_active: boolean;
    }> = [];

    for (const section of sections) {
      for (const dp of section.prizes) {
        const dedupeKey = `${categoryId}:${dp.place}`;
        if (seenDraftKeys.has(dedupeKey)) {
          report.prizes_skipped_duplicate_in_draft++;
          continue;
        }
        seenDraftKeys.add(dedupeKey);

        if (existingPlaces.has(dp.place)) {
          report.prizes_skipped_existing++;
          continue;
        }

        categoryRows.push({
          category_id: categoryId,
          place: dp.place,
          cash_amount: dp.cash_amount,
          has_trophy: dp.has_trophy,
          has_medal: dp.has_medal,
          gift_items: convertGiftItems(dp.gift_items),
          is_active: true,
        });
      }
    }

    if (categoryRows.length === 0) continue;

    const { error: prizeInsErr } = await supabase.from("prizes").insert(categoryRows);
    if (!prizeInsErr) {
      report.prizes_created += categoryRows.length;
      continue;
    }

    let categoryFailureMessage: string | null = null;
    for (const row of categoryRows) {
      const { error: rowErr } = await supabase.from("prizes").insert(row);
      if (!rowErr) {
        report.prizes_created++;
        continue;
      }

      if (rowErr.message.toLowerCase().includes("duplicate key")) {
        report.prizes_skipped_existing++;
        continue;
      }

      categoryFailureMessage = rowErr.message;
    }

    if (categoryFailureMessage) {
      report.failed_categories.push(`${categoryId}: ${categoryFailureMessage}`);
    }
  }

  if (includeTeamGroups && draft.team_groups.length > 0) {
    const allVerified = draft.team_groups.every((_, idx) => verifiedTeamGroups.has(idx));
    if (!allVerified) {
      toast.warning("Some team groups were not verified — skipping team groups.");
    } else {
      const { data: existingGroups, error: gErr } = await supabase
        .from("institution_prize_groups")
        .select("id, name")
        .eq("tournament_id", tournamentId)
        .eq("is_active", true);
      if (gErr) throw new Error(`Failed to fetch team groups: ${gErr.message}`);

      const groupByNorm = new Map((existingGroups || []).map((g) => [g.name.trim().toLowerCase(), g]));
      const groupIdMap: Array<{ draftIdx: number; groupId: string }> = [];

      for (let i = 0; i < draft.team_groups.length; i++) {
        const tg = draft.team_groups[i];
        const normName = tg.name.trim().toLowerCase();
        const existing = groupByNorm.get(normName);

        if (existing) {
          groupIdMap.push({ draftIdx: i, groupId: existing.id });
          report.team_groups_reused++;
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from("institution_prize_groups")
            .insert({
              tournament_id: tournamentId,
              name: tg.name.trim(),
              group_by: tg.group_by || "club",
              team_size: tg.team_size || 3,
              female_slots: 0,
              male_slots: 0,
              scoring_mode: "by_top_k_score",
              is_active: true,
            })
            .select("id")
            .single();
          if (insErr) throw new Error(`Failed to create team group "${tg.name}": ${insErr.message}`);
          groupIdMap.push({ draftIdx: i, groupId: inserted.id });
          groupByNorm.set(normName, { id: inserted.id, name: tg.name });
          report.team_groups_created++;
        }
      }

      const targetGroupIds = [...new Set(groupIdMap.map((m) => m.groupId))];
      const { data: existingTeamPrizes, error: tpErr } = await supabase
        .from("institution_prizes")
        .select("group_id, place")
        .in("group_id", targetGroupIds)
        .eq("is_active", true);
      if (tpErr) throw new Error(`Failed to fetch team prizes: ${tpErr.message}`);

      const teamPlaceMap = new Map<string, Set<number>>();
      for (const tp of existingTeamPrizes || []) {
        if (!teamPlaceMap.has(tp.group_id)) teamPlaceMap.set(tp.group_id, new Set());
        teamPlaceMap.get(tp.group_id)!.add(tp.place);
      }

      const groupToDraftSections = new Map<string, DraftTeamGroup[]>();
      for (const mapping of groupIdMap) {
        const current = groupToDraftSections.get(mapping.groupId) ?? [];
        current.push(draft.team_groups[mapping.draftIdx]);
        groupToDraftSections.set(mapping.groupId, current);
      }

      for (const [groupId, sections] of groupToDraftSections.entries()) {
        const existingPlaces = teamPlaceMap.get(groupId) || new Set<number>();
        const seenDraftKeys = new Set<string>();
        const groupRows: Array<{
          group_id: string;
          place: number;
          cash_amount: number;
          has_trophy: boolean;
          has_medal: boolean;
          is_active: boolean;
        }> = [];

        for (const section of sections) {
          for (const dp of section.prizes) {
            const dedupeKey = `${groupId}:${dp.place}`;
            if (seenDraftKeys.has(dedupeKey)) {
              report.team_prizes_skipped++;
              continue;
            }
            seenDraftKeys.add(dedupeKey);

            if (existingPlaces.has(dp.place)) {
              report.team_prizes_skipped++;
              continue;
            }
            groupRows.push({
              group_id: groupId,
              place: dp.place,
              cash_amount: dp.cash_amount,
              has_trophy: dp.has_trophy,
              has_medal: dp.has_medal,
              is_active: true,
            });
          }
        }

        if (groupRows.length === 0) continue;

        const { error: tpInsErr } = await supabase.from("institution_prizes").insert(groupRows);
        if (!tpInsErr) {
          report.team_prizes_created += groupRows.length;
          continue;
        }

        let groupFailureMessage: string | null = null;
        for (const row of groupRows) {
          const { error: rowErr } = await supabase.from("institution_prizes").insert(row);
          if (!rowErr) {
            report.team_prizes_created++;
            continue;
          }

          if (rowErr.message.toLowerCase().includes("duplicate key")) {
            report.team_prizes_skipped++;
            continue;
          }

          groupFailureMessage = rowErr.message;
        }

        if (groupFailureMessage) {
          report.failed_team_groups.push(`${groupId}: ${groupFailureMessage}`);
        }
      }
    }
  }

  return report;
}
