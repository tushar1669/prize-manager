import type { PostgrestError } from "@supabase/supabase-js";

const MISSING_EVENT_CODE_SNIPPET = "published_tournaments.event_code";

const PUBLIC_TOURNAMENT_DETAILS_FIELDS = [
  "id",
  "title",
  "start_date",
  "end_date",
  "venue",
  "city",
  "event_code",
  "notes",
  "brochure_url",
  "chessresults_url",
  "public_results_url",
  "public_slug",
  "time_control_base_minutes",
  "time_control_increment_seconds",
  "chief_arbiter",
  "tournament_director",
  "entry_fee_amount",
  "cash_prize_total",
];

const PUBLIC_TOURNAMENT_DETAILS_LEGACY_FIELDS = [
  "id",
  "title",
  "start_date",
  "end_date",
  "venue",
  "city",
  "notes",
  "brochure_url",
  "chessresults_url",
  "public_results_url",
  "public_slug",
];

type SupabaseQueryResult<T> = {
  data: T | null;
  error: PostgrestError | null;
  status?: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientLike = any;

type SupabaseQueryError = Error & {
  status?: number;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

export type TournamentDetails = {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  venue?: string | null;
  city?: string | null;
  event_code?: string | null;
  notes?: string | null;
  brochure_url?: string | null;
  chessresults_url?: string | null;
  public_results_url?: string | null;
  public_slug?: string | null;
  time_control_base_minutes?: number | null;
  time_control_increment_seconds?: number | null;
  chief_arbiter?: string | null;
  tournament_director?: string | null;
  entry_fee_amount?: number | null;
  cash_prize_total?: number | null;
};

const toSupabaseQueryError = (error: PostgrestError, status?: number): SupabaseQueryError => {
  const wrapped = new Error(error.message) as SupabaseQueryError;
  wrapped.name = "SupabaseQueryError";
  wrapped.status = status;
  wrapped.details = error.details;
  wrapped.hint = error.hint;
  wrapped.code = error.code;
  return wrapped;
};

const isMissingEventCodeError = (error: PostgrestError) => {
  const message = error.message ?? "";
  const details = error.details ?? "";
  return message.includes(MISSING_EVENT_CODE_SNIPPET) || details.includes(MISSING_EVENT_CODE_SNIPPET);
};

const fetchBySelect = async (
  supabaseClient: SupabaseClientLike,
  slug: string,
  fields: string
) => {
  return supabaseClient
    .from("published_tournaments")
    .select(fields)
    .eq("slug", slug)
    .maybeSingle();
};

export const isClientError = (error: unknown) => {
  const status = (error as { status?: number })?.status;
  return typeof status === "number" && status >= 400 && status < 500;
};

export const getPublicTournamentDetailsErrorMessage = (error: unknown, isDev: boolean) => {
  if (!error) return "Unable to load tournament details.";
  if (isDev) {
    const message = (error as Error).message ?? "";
    if (message.includes(MISSING_EVENT_CODE_SNIPPET)) {
      return "Unable to load tournament details. Database view is outdated. Apply migrations.";
    }
  }
  return "Unable to load tournament details.";
};

export async function fetchPublicTournamentDetails(
  supabaseClient: SupabaseClientLike,
  slug: string
): Promise<TournamentDetails | null> {
  const fullSelect = PUBLIC_TOURNAMENT_DETAILS_FIELDS.join(", ");
  const legacySelect = PUBLIC_TOURNAMENT_DETAILS_LEGACY_FIELDS.join(", ");

  const { data, error, status } = await fetchBySelect(supabaseClient, slug, fullSelect);

  if (error) {
    if (status === 400 && isMissingEventCodeError(error)) {
      const legacyResult = await fetchBySelect(supabaseClient, slug, legacySelect);
      if (legacyResult.error) {
        throw toSupabaseQueryError(legacyResult.error, legacyResult.status);
      }
      return legacyResult.data;
    }
    throw toSupabaseQueryError(error, status);
  }

  return data;
}
