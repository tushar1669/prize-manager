import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withinDateRange } from "@/hooks/useMartechMetrics";

export type DrilldownChart = "organizer_funnel" | "tournament_funnel" | "revenue";

export type DrilldownSelection = {
  chart: DrilldownChart;
  key: string;
} | null;

type DateRange = { from: Date | null; to: Date | null };

const PAGE_SIZE = 20;

type OrganizerRow = { user_id: string; is_verified: boolean; created_at: string | null };
type TournamentRow = { id: string; title: string; owner_id: string; created_at: string | null; is_published: boolean };
type EntitlementRow = { id: string; tournament_id: string; source: string; starts_at: string; ends_at: string; created_at: string };

type DrilldownResult = {
  rows: Record<string, unknown>[];
  totalCount: number;
  isLoading: boolean;
  error: Error | null;
  pageSize: number;
  limitation: string | null;
};

function getOrganizerFilter(key: string) {
  switch (key) {
    case "Total organizers": return (r: OrganizerRow) => true;
    case "Verified": return (r: OrganizerRow) => r.is_verified;
    case "Created ≥1 tournament": return null; // needs join - handled separately
    default: return () => false;
  }
}

function getTournamentFilter(key: string) {
  switch (key) {
    case "Total tournaments": return () => true;
    case "With import logs": return null; // needs join
    case "With allocations": return null; // needs join
    case "Published": return null; // needs published_tournaments
    default: return () => false;
  }
}

export function useMartechDrilldown(
  selection: DrilldownSelection,
  range: DateRange,
  page: number
) {
  const query = useQuery<{ rows: Record<string, unknown>[]; totalCount: number; limitation: string | null }>({
    queryKey: ["martech-drilldown", selection?.chart, selection?.key, range.from?.toISOString(), range.to?.toISOString(), page],
    queryFn: async () => {
      if (!selection) return { rows: [], totalCount: 0, limitation: null };

      const offset = page * PAGE_SIZE;

      if (selection.chart === "organizer_funnel") {
        return fetchOrganizerDrilldown(selection.key, range, offset);
      }

      if (selection.chart === "tournament_funnel") {
        return fetchTournamentDrilldown(selection.key, range, offset);
      }

      if (selection.chart === "revenue") {
        return fetchRevenueDrilldown(selection.key, range, offset);
      }

      return { rows: [], totalCount: 0, limitation: null };
    },
    enabled: !!selection,
  });

  return {
    rows: query.data?.rows ?? [],
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    error: query.error,
    pageSize: PAGE_SIZE,
    limitation: query.data?.limitation ?? null,
  } satisfies DrilldownResult;
}

async function fetchOrganizerDrilldown(key: string, range: DateRange, offset: number) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id,is_verified,created_at,role")
    .eq("role", "organizer");

  if (error) throw error;
  const all = (data ?? []) as Array<{ user_id: string; is_verified: boolean; created_at: string | null; role: string }>;
  
  // Apply date range
  let filtered = all.filter((r) => withinDateRange(r.created_at, range));

  let limitation: string | null = null;

  if (key === "Verified") {
    filtered = filtered.filter((r) => r.is_verified);
  } else if (key === "Created ≥1 tournament") {
    // Need tournament owners - fetch tournaments
    const { data: tournaments } = await supabase
      .from("tournaments")
      .select("owner_id,created_at");
    const tournamentOwners = new Set(
      ((tournaments ?? []) as Array<{ owner_id: string; created_at: string | null }>)
        .filter((t) => withinDateRange(t.created_at, range))
        .map((t) => t.owner_id)
    );
    if (tournamentOwners.size === 0) {
      limitation = "Missing organizer/tournament join column (owner_id not available)";
    }
    filtered = filtered.filter((r) => tournamentOwners.has(r.user_id));
  }
  // "Total organizers" uses all filtered

  const totalCount = filtered.length;
  const rows = filtered
    .slice(offset, offset + PAGE_SIZE)
    .map((r) => ({ user_id: r.user_id, is_verified: r.is_verified, created_at: r.created_at }));

  return { rows, totalCount, limitation };
}

async function fetchTournamentDrilldown(key: string, range: DateRange, offset: number) {
  let limitation: string | null = null;

  if (key === "Published") {
    const { data, error } = await supabase
      .from("published_tournaments")
      .select("id,title,published_at,city,venue");
    if (error) throw error;
    const filtered = ((data ?? []) as Array<{ id: string | null; title: string | null; published_at: string | null; city: string | null; venue: string | null }>)
      .filter((r) => r.id && withinDateRange(r.published_at, range));
    return {
      rows: filtered.slice(offset, offset + PAGE_SIZE),
      totalCount: filtered.length,
      limitation,
    };
  }

  const { data, error } = await supabase
    .from("tournaments")
    .select("id,title,owner_id,created_at,is_published");
  if (error) throw error;
  let filtered = ((data ?? []) as TournamentRow[])
    .filter((r) => withinDateRange(r.created_at, range));

  if (key === "With import logs") {
    const { data: imports } = await supabase
      .from("import_logs")
      .select("tournament_id,imported_at");
    const importedIds = new Set(
      ((imports ?? []) as Array<{ tournament_id: string; imported_at: string }>)
        .filter((r) => withinDateRange(r.imported_at, range))
        .map((r) => r.tournament_id)
    );
    filtered = filtered.filter((r) => importedIds.has(r.id));
  } else if (key === "With allocations") {
    const { data: allocs } = await supabase
      .from("allocations")
      .select("tournament_id,created_at");
    const allocIds = new Set(
      ((allocs ?? []) as Array<{ tournament_id: string; created_at: string | null }>)
        .filter((r) => withinDateRange(r.created_at, range))
        .map((r) => r.tournament_id)
    );
    filtered = filtered.filter((r) => allocIds.has(r.id));
  }

  return {
    rows: filtered.slice(offset, offset + PAGE_SIZE).map((r) => ({
      id: r.id,
      title: r.title,
      owner_id: r.owner_id,
      created_at: r.created_at,
      is_published: r.is_published,
    })),
    totalCount: filtered.length,
    limitation,
  };
}

async function fetchRevenueDrilldown(key: string, range: DateRange, offset: number) {
  const unsafeSupabase = supabase as unknown as {
    from: (table: string) => { select: (columns: string) => Promise<{ data: unknown[] | null; error: { message?: string } | null }> };
  };

  const { data, error } = await unsafeSupabase
    .from("tournament_entitlements")
    .select("id,tournament_id,source,starts_at,ends_at,created_at");
  if (error) throw new Error(error.message);

  const all = ((data ?? []) as EntitlementRow[]).filter((r) => {
    const src = r.source?.trim() || "unknown";
    if (src !== key) return false;
    if (r.created_at) return withinDateRange(r.created_at, range);
    if (r.starts_at) return withinDateRange(r.starts_at, range);
    if (r.ends_at) return withinDateRange(r.ends_at, range);
    return !range.from && !range.to;
  });

  return {
    rows: all.slice(offset, offset + PAGE_SIZE).map((r) => ({
      id: r.id,
      tournament_id: r.tournament_id,
      source: r.source,
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      created_at: r.created_at,
    })),
    totalCount: all.length,
    limitation: null,
  };
}
