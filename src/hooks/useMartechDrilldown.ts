import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withinDateRange } from "@/hooks/useMartechMetrics";

export type DrilldownChart =
  | "organizer_funnel"
  | "tournament_funnel"
  | "revenue"
  | "payment_funnel"
  | "profile_funnel"
  | "referral_funnel";

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

type UnsafeSelectResult = { data: unknown[] | null; error: { message?: string } | null };
type UnsafeFrom = {
  from: (table: string) => {
    select: (columns: string) => Promise<UnsafeSelectResult>;
  };
};

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

      switch (selection.chart) {
        case "organizer_funnel":
          return fetchOrganizerDrilldown(selection.key, range, offset);
        case "tournament_funnel":
          return fetchTournamentDrilldown(selection.key, range, offset);
        case "revenue":
          return fetchRevenueDrilldown(selection.key, range, offset);
        case "payment_funnel":
          return fetchPaymentDrilldown(selection.key, range, offset);
        case "profile_funnel":
          return fetchProfileDrilldown(selection.key, range, offset);
        case "referral_funnel":
          return fetchReferralDrilldown(selection.key, range, offset);
        default:
          return { rows: [], totalCount: 0, limitation: null };
      }
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
  let filtered = all.filter((r) => withinDateRange(r.created_at, range));
  let limitation: string | null = null;

  if (key === "Verified") {
    filtered = filtered.filter((r) => r.is_verified);
  } else if (key === "Created ≥1 tournament") {
    const { data: tournaments } = await supabase.from("tournaments").select("owner_id,created_at");
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

  return {
    rows: filtered.slice(offset, offset + PAGE_SIZE).map((r) => ({ user_id: r.user_id, is_verified: r.is_verified, created_at: r.created_at })),
    totalCount: filtered.length,
    limitation,
  };
}

async function fetchTournamentDrilldown(key: string, range: DateRange, offset: number) {
  let limitation: string | null = null;

  if (key === "Published") {
    const { data, error } = await supabase.from("published_tournaments").select("id,title,published_at,city,venue");
    if (error) throw error;
    const filtered = ((data ?? []) as Array<{ id: string | null; title: string | null; published_at: string | null; city: string | null; venue: string | null }>)
      .filter((r) => r.id && withinDateRange(r.published_at, range));
    return { rows: filtered.slice(offset, offset + PAGE_SIZE), totalCount: filtered.length, limitation };
  }

  const { data, error } = await supabase.from("tournaments").select("id,title,owner_id,created_at,is_published");
  if (error) throw error;
  let filtered = ((data ?? []) as TournamentRow[]).filter((r) => withinDateRange(r.created_at, range));

  if (key === "With import logs") {
    const { data: imports } = await supabase.from("import_logs").select("tournament_id,imported_at");
    const importedIds = new Set(
      ((imports ?? []) as Array<{ tournament_id: string; imported_at: string }>)
        .filter((r) => withinDateRange(r.imported_at, range))
        .map((r) => r.tournament_id)
    );
    filtered = filtered.filter((r) => importedIds.has(r.id));
  } else if (key === "With allocations") {
    const { data: allocs } = await supabase.from("allocations").select("tournament_id,created_at");
    const allocIds = new Set(
      ((allocs ?? []) as Array<{ tournament_id: string; created_at: string | null }>)
        .filter((r) => withinDateRange(r.created_at, range))
        .map((r) => r.tournament_id)
    );
    filtered = filtered.filter((r) => allocIds.has(r.id));
  }

  return {
    rows: filtered.slice(offset, offset + PAGE_SIZE).map((r) => ({ id: r.id, title: r.title, owner_id: r.owner_id, created_at: r.created_at, is_published: r.is_published })),
    totalCount: filtered.length,
    limitation,
  };
}

async function fetchRevenueDrilldown(key: string, range: DateRange, offset: number) {
  const unsafeSupabase = supabase as unknown as UnsafeFrom;
  const { data, error } = await unsafeSupabase.from("tournament_entitlements").select("id,tournament_id,source,starts_at,ends_at,created_at");
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
    rows: all.slice(offset, offset + PAGE_SIZE).map((r) => ({ id: r.id, tournament_id: r.tournament_id, source: r.source, starts_at: r.starts_at, ends_at: r.ends_at, created_at: r.created_at })),
    totalCount: all.length,
    limitation: null,
  };
}

async function fetchPaymentDrilldown(key: string, range: DateRange, offset: number) {
  const unsafeSupabase = supabase as unknown as UnsafeFrom;
  const { data, error } = await unsafeSupabase
    .from("tournament_payments")
    .select("id,tournament_id,user_id,amount_inr,utr,status,created_at,reviewed_at,review_note");
  if (error) throw new Error(error.message);

  type PaymentDetailRow = { id: string; tournament_id: string; user_id: string; amount_inr: number; utr: string; status: string; created_at: string; reviewed_at: string | null; review_note: string | null };
  let filtered = ((data ?? []) as PaymentDetailRow[]).filter((r) => withinDateRange(r.created_at, range));

  if (key === "Approved") {
    filtered = filtered.filter((r) => r.status === "approved");
  } else if (key === "Rejected") {
    filtered = filtered.filter((r) => r.status === "rejected");
  }
  // "Payments submitted" = all

  return {
    rows: filtered.slice(offset, offset + PAGE_SIZE),
    totalCount: filtered.length,
    limitation: null,
  };
}

async function fetchProfileDrilldown(key: string, range: DateRange, offset: number) {
  let limitation: string | null = null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,display_name,phone,city,org_name,fide_arbiter_id,website,profile_completed_at,profile_reward_claimed");

  if (error) {
    // RLS may block; return limitation
    limitation = "Could not fetch profiles: " + (error.message || "permission denied");
    return { rows: [], totalCount: 0, limitation };
  }

  type ProfileDrillRow = { id: string; email: string | null; display_name: string | null; phone: string | null; city: string | null; org_name: string | null; fide_arbiter_id: string | null; website: string | null; profile_completed_at: string | null; profile_reward_claimed: boolean };
  const profiles = (data ?? []) as ProfileDrillRow[];

  const FIELDS = ["display_name", "phone", "city", "org_name", "fide_arbiter_id", "website"] as const;
  const hasAny = (p: ProfileDrillRow) => FIELDS.some((f) => p[f] != null && String(p[f]).trim() !== "");

  let filtered: ProfileDrillRow[];
  if (key === "Started profile") {
    filtered = profiles.filter((p) => hasAny(p));
  } else if (key === "Completed profile") {
    filtered = profiles.filter((p) => !!p.profile_completed_at);
  } else if (key === "Reward claimed") {
    filtered = profiles.filter((p) => p.profile_reward_claimed);
  } else {
    // Total organizers
    filtered = profiles;
  }

  return {
    rows: filtered.slice(offset, offset + PAGE_SIZE),
    totalCount: filtered.length,
    limitation,
  };
}

async function fetchReferralDrilldown(key: string, range: DateRange, offset: number) {
  const unsafeSupabase = supabase as unknown as UnsafeFrom;

  if (key === "Codes issued") {
    const { data, error } = await unsafeSupabase.from("referral_codes").select("id,code,user_id,created_at");
    if (error) return { rows: [], totalCount: 0, limitation: "Could not fetch referral_codes: " + error.message };
    type Row = { id: string; code: string; user_id: string; created_at: string };
    const filtered = ((data ?? []) as Row[]).filter((r) => withinDateRange(r.created_at, range));
    return { rows: filtered.slice(offset, offset + PAGE_SIZE), totalCount: filtered.length, limitation: null };
  }

  if (key === "Referrals made") {
    const { data, error } = await unsafeSupabase.from("referrals").select("id,referrer_id,referred_id,created_at,referral_code_id");
    if (error) return { rows: [], totalCount: 0, limitation: "Could not fetch referrals: " + error.message };
    type Row = { id: string; referrer_id: string; referred_id: string; created_at: string; referral_code_id: string };
    const filtered = ((data ?? []) as Row[]).filter((r) => withinDateRange(r.created_at, range));
    return { rows: filtered.slice(offset, offset + PAGE_SIZE), totalCount: filtered.length, limitation: null };
  }

  if (key === "Referred upgrades") {
    const { data, error } = await unsafeSupabase.from("referral_rewards").select("id,trigger_user_id,trigger_tournament_id,created_at");
    if (error) return { rows: [], totalCount: 0, limitation: "Could not fetch referral_rewards: " + error.message };
    type Row = { id: string; trigger_user_id: string; trigger_tournament_id: string; created_at: string };
    const all = ((data ?? []) as Row[]).filter((r) => withinDateRange(r.created_at, range));
    // Group by trigger_user_id for "distinct upgrades"
    const seen = new Map<string, Row>();
    all.forEach((r) => { if (!seen.has(r.trigger_user_id)) seen.set(r.trigger_user_id, r); });
    const unique = [...seen.values()];
    return { rows: unique.slice(offset, offset + PAGE_SIZE), totalCount: unique.length, limitation: null };
  }

  if (key === "Rewards issued") {
    const { data, error } = await unsafeSupabase.from("referral_rewards").select("id,beneficiary_id,trigger_user_id,trigger_tournament_id,level,reward_type,created_at,coupon_id");
    if (error) return { rows: [], totalCount: 0, limitation: "Could not fetch referral_rewards: " + error.message };
    type Row = { id: string; beneficiary_id: string; trigger_user_id: string; trigger_tournament_id: string; level: number; reward_type: string; created_at: string; coupon_id: string | null };
    const filtered = ((data ?? []) as Row[]).filter((r) => withinDateRange(r.created_at, range));
    return { rows: filtered.slice(offset, offset + PAGE_SIZE), totalCount: filtered.length, limitation: null };
  }

  return { rows: [], totalCount: 0, limitation: null };
}
