// Builds a PII-free gender summary for import_logs.meta (counts and source names only).
export type ImportGenderSummary = {
  female_count: number;
  male_count: number;
  unknown_count: number;
  female_from_gender: number;
  female_from_labels: number;
  sources_used: string[];
  female_sources: Record<string, number>;
};

type PlayerLike = { gender?: unknown; gender_source?: unknown };

export function buildImportGenderSummary(
  players: PlayerLike[],
  extra?: { femaleFromLabels?: number; sources?: string[] },
): ImportGenderSummary {
  let female = 0;
  let male = 0;
  let unknown = 0;
  const femaleSources: Record<string, number> = {};
  for (const p of players) {
    const g = String(p.gender ?? '').trim().toUpperCase();
    if (g === 'F') {
      female += 1;
      const src = typeof p.gender_source === 'string' && p.gender_source ? p.gender_source : 'unknown';
      femaleSources[src] = (femaleSources[src] ?? 0) + 1;
    } else if (g === 'M') {
      male += 1;
    } else {
      unknown += 1;
    }
  }
  return {
    female_count: female,
    male_count: male,
    unknown_count: unknown,
    female_from_gender: female,
    female_from_labels: extra?.femaleFromLabels ?? 0,
    sources_used: Array.from(new Set(extra?.sources ?? [])),
    female_sources: femaleSources,
  };
}
