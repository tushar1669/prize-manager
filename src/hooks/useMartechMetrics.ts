import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

type DateRange = {
  from: Date | null;
  to: Date | null;
};

type OrganizerRole = {
  user_id: string;
  is_verified: boolean;
  created_at: string | null;
};

type Tournament = {
  id: string;
  owner_id: string;
  created_at: string | null;
  is_published: boolean;
};

type PublishedTournament = {
  id: string | null;
  published_at: string | null;
};

type ImportLog = {
  id: string;
  tournament_id: string;
  imported_at: string;
  accepted_rows: number;
  skipped_rows: number;
  total_rows: number;
  duration_ms: number | null;
  top_reasons: unknown;
};

type Allocation = {
  id: string;
  tournament_id: string;
  created_at: string | null;
};

type Player = {
  id: string;
  created_at: string | null;
};

type TournamentEntitlement = {
  id: string;
  source?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at?: string | null;
};

type RevenueBySource = {
  source: string;
  count: number;
};

type UnsafeSelectResponse = {
  data: unknown[] | null;
  error: { message?: string } | null;
};

type UnsafeSupabaseClient = {
  from: (table: string) => {
    select: (columns: string) => Promise<UnsafeSelectResponse>;
  };
};

type FunnelStep = {
  label: string;
  value: number;
  note?: string;
};

type DashboardMetrics = {
  kpis: {
    totalOrganizers: number;
    verifiedOrganizers: number;
    pendingApprovals: number;
    totalTournaments: number;
    publishedTournaments: number;
    activeProTournaments: number;
    totalPlayers: number;
  };
  organizerFunnel: FunnelStep[];
  tournamentFunnel: FunnelStep[];
  importHealth: {
    totalImports: number;
    avgAcceptanceRate: number | null;
    avgDurationMs: number | null;
    topReasons: Array<{ reason: string; count: number }>;
  };
  revenueProxy: {
    bySource: RevenueBySource[];
  };
};

const EMPTY_METRICS: DashboardMetrics = {
  kpis: {
    totalOrganizers: 0,
    verifiedOrganizers: 0,
    pendingApprovals: 0,
    totalTournaments: 0,
    publishedTournaments: 0,
    activeProTournaments: 0,
    totalPlayers: 0,
  },
  organizerFunnel: [
    { label: "Total organizers", value: 0 },
    { label: "Verified", value: 0 },
  ],
  tournamentFunnel: [
    { label: "Total tournaments", value: 0 },
    { label: "With import logs", value: 0 },
    { label: "With allocations", value: 0 },
    { label: "Published", value: 0 },
  ],
  importHealth: {
    totalImports: 0,
    avgAcceptanceRate: null,
    avgDurationMs: null,
    topReasons: [],
  },
  revenueProxy: {
    bySource: [],
  },
};

export function withinDateRange(value: string | null | undefined, range: DateRange): boolean {
  if (!range.from && !range.to) return true;
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const fromOk = !range.from || parsed >= startOfDay(range.from);
  const toOk = !range.to || parsed <= endOfDay(range.to);
  return fromOk && toOk;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function parseReasons(input: unknown): string[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).filter(Boolean);
  }
  if (typeof input === "object") {
    return Object.entries(input as Record<string, unknown>)
      .flatMap(([reason, count]) => {
        const safeCount = typeof count === "number" ? Math.max(1, Math.floor(count)) : 1;
        return Array.from({ length: safeCount }, () => reason);
      })
      .filter(Boolean);
  }
  if (typeof input === "string") {
    return [input];
  }
  return [];
}

function computeActiveEntitlements(entitlements: TournamentEntitlement[], now: Date) {
  return entitlements.filter((entitlement) => {
    const startsAt = entitlement.starts_at ? new Date(entitlement.starts_at) : null;
    const endsAt = entitlement.ends_at ? new Date(entitlement.ends_at) : null;

    if (startsAt && endsAt) {
      return startsAt <= now && now <= endsAt;
    }

    if (!startsAt && endsAt) {
      return now <= endsAt;
    }

    if (startsAt && !endsAt) {
      return startsAt <= now;
    }

    return true;
  }).length;
}

export function buildMartechMetrics(input: {
  organizers: OrganizerRole[];
  tournaments: Tournament[];
  publishedTournaments: PublishedTournament[];
  imports: ImportLog[];
  allocations: Allocation[];
  players: Player[];
  entitlements: TournamentEntitlement[];
}): DashboardMetrics {
  const now = new Date();
  const verifiedOrganizers = input.organizers.filter((o) => o.is_verified).length;
  const pendingApprovals = input.organizers.filter((o) => !o.is_verified).length;

  const importedTournamentIds = new Set(input.imports.map((row) => row.tournament_id));
  const allocationTournamentIds = new Set(input.allocations.map((row) => row.tournament_id));

  const hasOwnerJoin = input.tournaments.some((t) => typeof t.owner_id === "string" && t.owner_id.length > 0);
  const ownersWithTournaments = new Set(input.tournaments.map((t) => t.owner_id));

  const reasonCounts = new Map<string, number>();
  input.imports.forEach((entry) => {
    parseReasons(entry.top_reasons).forEach((reason) => {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    });
  });

  const avgAcceptanceRate =
    input.imports.length > 0
      ? input.imports.reduce((sum, row) => {
          const denominator = row.total_rows > 0 ? row.total_rows : row.accepted_rows + row.skipped_rows;
          if (!denominator) return sum;
          return sum + row.accepted_rows / denominator;
        }, 0) / input.imports.length
      : null;

  const durationRows = input.imports.filter((row) => row.duration_ms != null);
  const avgDurationMs =
    durationRows.length > 0
      ? durationRows.reduce((sum, row) => sum + Number(row.duration_ms ?? 0), 0) / durationRows.length
      : null;

  const sourceCounts = new Map<string, number>();
  input.entitlements.forEach((entitlement) => {
    const source = entitlement.source?.trim() || "unknown";
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
  });

  const publishedCount = input.publishedTournaments.filter((row) => row.id).length;

  const organizerFunnel: FunnelStep[] = [
    { label: "Total organizers", value: input.organizers.length },
    { label: "Verified", value: verifiedOrganizers },
  ];

  if (hasOwnerJoin) {
    organizerFunnel.push({
      label: "Created ≥1 tournament",
      value: input.organizers.filter((o) => ownersWithTournaments.has(o.user_id)).length,
    });
  } else {
    organizerFunnel.push({
      label: "Created ≥1 tournament",
      value: 0,
      note: "Missing organizer/tournament join column (owner_id/created_by/organizer_id not available)",
    });
  }

  return {
    kpis: {
      totalOrganizers: input.organizers.length,
      verifiedOrganizers,
      pendingApprovals,
      totalTournaments: input.tournaments.length,
      publishedTournaments: publishedCount,
      activeProTournaments: computeActiveEntitlements(input.entitlements, now),
      totalPlayers: input.players.length,
    },
    organizerFunnel,
    tournamentFunnel: [
      { label: "Total tournaments", value: input.tournaments.length },
      { label: "With import logs", value: importedTournamentIds.size },
      { label: "With allocations", value: allocationTournamentIds.size },
      { label: "Published", value: publishedCount },
    ],
    importHealth: {
      totalImports: input.imports.length,
      avgAcceptanceRate,
      avgDurationMs,
      topReasons: [...reasonCounts.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    },
    revenueProxy: {
      bySource: [...sourceCounts.entries()]
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count),
    },
  };
}

export function useMartechMetrics(range: DateRange) {
  const { user } = useAuth();
  const { isMaster } = useUserRole();

  const query = useQuery({
    queryKey: ["admin-martech-metrics", range.from?.toISOString() ?? null, range.to?.toISOString() ?? null],
    queryFn: async () => {
      const organizersQuery = supabase
        .from("user_roles")
        .select("user_id,is_verified,created_at")
        .eq("role", "organizer");

      const tournamentsQuery = supabase
        .from("tournaments")
        .select("id,owner_id,created_at,is_published");

      const publishedQuery = supabase
        .from("published_tournaments")
        .select("id,published_at");

      const importsQuery = supabase
        .from("import_logs")
        .select("id,tournament_id,imported_at,accepted_rows,skipped_rows,total_rows,duration_ms,top_reasons");

      const allocationsQuery = supabase
        .from("allocations")
        .select("id,tournament_id,created_at");

      const playersQuery = supabase
        .from("players")
        .select("id,created_at");

      const unsafeSupabase = supabase as unknown as UnsafeSupabaseClient;
      const entitlementsQuery = unsafeSupabase
        .from("tournament_entitlements")
        .select("id,source,starts_at,ends_at,created_at");

      const [organizersRes, tournamentsRes, publishedRes, importsRes, allocationsRes, playersRes, entitlementsRes] =
        await Promise.all([
          organizersQuery,
          tournamentsQuery,
          publishedQuery,
          importsQuery,
          allocationsQuery,
          playersQuery,
          entitlementsQuery,
        ]);

      const errors = [
        organizersRes.error,
        tournamentsRes.error,
        publishedRes.error,
        importsRes.error,
        allocationsRes.error,
        playersRes.error,
        entitlementsRes.error,
      ].filter(Boolean);

      if (errors.length > 0) {
        throw errors[0];
      }

      const organizers = (organizersRes.data ?? []) as OrganizerRole[];
      const tournaments = (tournamentsRes.data ?? []) as Tournament[];
      const publishedTournaments = (publishedRes.data ?? []) as PublishedTournament[];
      const imports = (importsRes.data ?? []) as ImportLog[];
      const allocations = (allocationsRes.data ?? []) as Allocation[];
      const players = (playersRes.data ?? []) as Player[];
      const entitlements = (entitlementsRes.data ?? []) as TournamentEntitlement[];

      return buildMartechMetrics({
        organizers: organizers.filter((row) => withinDateRange(row.created_at, range)),
        tournaments: tournaments.filter((row) => withinDateRange(row.created_at, range)),
        publishedTournaments: publishedTournaments.filter((row) => withinDateRange(row.published_at, range)),
        imports: imports.filter((row) => withinDateRange(row.imported_at, range)),
        allocations: allocations.filter((row) => withinDateRange(row.created_at, range)),
        players: players.filter((row) => withinDateRange(row.created_at, range)),
        entitlements: entitlements.filter((row) => {
          if (row.created_at) return withinDateRange(row.created_at, range);
          if (row.starts_at) return withinDateRange(row.starts_at, range);
          if (row.ends_at) return withinDateRange(row.ends_at, range);
          return !range.from && !range.to;
        }),
      });
    },
    enabled: !!user && isMaster,
  });

  const metrics = useMemo(() => query.data ?? EMPTY_METRICS, [query.data]);

  return {
    ...query,
    metrics,
    hasData: Boolean(query.data),
    isMaster,
  };
}
