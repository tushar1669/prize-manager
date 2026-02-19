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

type ProfileRow = {
  id: string;
  display_name: string | null;
  phone: string | null;
  city: string | null;
  org_name: string | null;
  fide_arbiter_id: string | null;
  website: string | null;
  profile_completed_at: string | null;
  profile_reward_claimed: boolean;
};

type PaymentRow = {
  id: string;
  status: string;
  created_at: string;
};

type ReferralCodeRow = {
  id: string;
  created_at: string;
};

type ReferralRow = {
  id: string;
  created_at: string;
};

type ReferralRewardRow = {
  id: string;
  trigger_user_id: string;
  created_at: string;
};

export type DashboardMetrics = {
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
  paymentFunnel: FunnelStep[];
  profileFunnel: FunnelStep[];
  referralFunnel: FunnelStep[];
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
  paymentFunnel: [
    { label: "Payments submitted", value: 0 },
    { label: "Approved", value: 0 },
    { label: "Rejected", value: 0 },
  ],
  profileFunnel: [
    { label: "Total organizers", value: 0 },
    { label: "Started profile", value: 0 },
    { label: "Completed profile", value: 0 },
    { label: "Reward claimed", value: 0 },
  ],
  referralFunnel: [
    { label: "Codes issued", value: 0 },
    { label: "Referrals made", value: 0 },
    { label: "Referred upgrades", value: 0 },
    { label: "Rewards issued", value: 0 },
  ],
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
    if (startsAt && endsAt) return startsAt <= now && now <= endsAt;
    if (!startsAt && endsAt) return now <= endsAt;
    if (startsAt && !endsAt) return startsAt <= now;
    return true;
  }).length;
}

const PROFILE_FIELDS_LIST = ["display_name", "phone", "city", "org_name", "fide_arbiter_id", "website"] as const;

function hasAnyProfileField(p: ProfileRow): boolean {
  return PROFILE_FIELDS_LIST.some((f) => {
    const v = p[f];
    return v != null && String(v).trim() !== "";
  });
}

export function buildMartechMetrics(input: {
  organizers: OrganizerRole[];
  tournaments: Tournament[];
  publishedTournaments: PublishedTournament[];
  imports: ImportLog[];
  allocations: Allocation[];
  players: Player[];
  entitlements: TournamentEntitlement[];
  payments?: PaymentRow[];
  profiles?: ProfileRow[];
  referralCodes?: ReferralCodeRow[];
  referrals?: ReferralRow[];
  referralRewards?: ReferralRewardRow[];
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

  // Payment funnel
  const payments = input.payments ?? [];
  const paymentFunnel: FunnelStep[] = [
    { label: "Payments submitted", value: payments.length },
    { label: "Approved", value: payments.filter((p) => p.status === "approved").length },
    { label: "Rejected", value: payments.filter((p) => p.status === "rejected").length },
  ];

  // Profile funnel
  const profiles = input.profiles ?? [];
  const profileFunnel: FunnelStep[] = [
    { label: "Total organizers", value: input.organizers.length },
    { label: "Started profile", value: profiles.filter((p) => hasAnyProfileField(p)).length },
    { label: "Completed profile", value: profiles.filter((p) => !!p.profile_completed_at).length },
    { label: "Reward claimed", value: profiles.filter((p) => p.profile_reward_claimed).length },
  ];

  // Referral funnel
  const referralCodes = input.referralCodes ?? [];
  const referrals = input.referrals ?? [];
  const referralRewards = input.referralRewards ?? [];
  const referralFunnel: FunnelStep[] = [
    { label: "Codes issued", value: referralCodes.length },
    { label: "Referrals made", value: referrals.length },
    { label: "Referred upgrades", value: new Set(referralRewards.map((r) => r.trigger_user_id)).size },
    { label: "Rewards issued", value: referralRewards.length },
  ];

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
    paymentFunnel,
    profileFunnel,
    referralFunnel,
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

      const paymentsQuery = unsafeSupabase
        .from("tournament_payments")
        .select("id,status,created_at");

      const profilesQuery = supabase
        .from("profiles")
        .select("id,display_name,phone,city,org_name,fide_arbiter_id,website,profile_completed_at,profile_reward_claimed");

      const referralCodesQuery = unsafeSupabase
        .from("referral_codes")
        .select("id,created_at");

      const referralsQuery = unsafeSupabase
        .from("referrals")
        .select("id,created_at");

      const referralRewardsQuery = unsafeSupabase
        .from("referral_rewards")
        .select("id,trigger_user_id,created_at");

      const [
        organizersRes, tournamentsRes, publishedRes, importsRes, allocationsRes, playersRes, entitlementsRes,
        paymentsRes, profilesRes, referralCodesRes, referralsRes, referralRewardsRes,
      ] = await Promise.all([
        organizersQuery,
        tournamentsQuery,
        publishedQuery,
        importsQuery,
        allocationsQuery,
        playersQuery,
        entitlementsQuery,
        paymentsQuery,
        profilesQuery,
        referralCodesQuery,
        referralsQuery,
        referralRewardsQuery,
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

      if (errors.length > 0) throw errors[0];

      // Non-critical: silently handle errors for new tables
      const organizers = (organizersRes.data ?? []) as OrganizerRole[];
      const tournaments = (tournamentsRes.data ?? []) as Tournament[];
      const publishedTournaments = (publishedRes.data ?? []) as PublishedTournament[];
      const imports = (importsRes.data ?? []) as ImportLog[];
      const allocations = (allocationsRes.data ?? []) as Allocation[];
      const players = (playersRes.data ?? []) as Player[];
      const entitlements = (entitlementsRes.data ?? []) as TournamentEntitlement[];
      const payments = (paymentsRes.error ? [] : (paymentsRes.data ?? [])) as PaymentRow[];
      const profiles = (profilesRes.error ? [] : (profilesRes.data ?? [])) as ProfileRow[];
      const referralCodes = (referralCodesRes.error ? [] : (referralCodesRes.data ?? [])) as ReferralCodeRow[];
      const referrals = (referralsRes.error ? [] : (referralsRes.data ?? [])) as ReferralRow[];
      const referralRewards = (referralRewardsRes.error ? [] : (referralRewardsRes.data ?? [])) as ReferralRewardRow[];

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
        payments: payments.filter((row) => withinDateRange(row.created_at, range)),
        profiles, // No date filter for profiles (they're accumulated)
        referralCodes: referralCodes.filter((row) => withinDateRange(row.created_at, range)),
        referrals: referrals.filter((row) => withinDateRange(row.created_at, range)),
        referralRewards: referralRewards.filter((row) => withinDateRange(row.created_at, range)),
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
