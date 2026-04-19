type SupabaseQueryResult<T> = {
  data: T | null;
  error: Error | null;
};

type SupabaseQuery<T> = {
  or(filters: string): SupabaseMaybeSingleQuery<T>;
  eq(column: string, value: string): SupabaseMaybeSingleQuery<T>;
};

type SupabaseMaybeSingleQuery<T> = {
  maybeSingle(): Promise<SupabaseQueryResult<T>>;
};

type SupabaseClientLike = {
  from(table: "published_tournaments"): {
    select(fields: string): SupabaseQuery<PublicTournamentLookup>;
  };
};

export type PublicTournamentLookup = {
  id: string;
  title: string;
  slug: string;
  brochure_url: string | null;
};

export async function fetchPublishedTournamentBySlug(
  supabaseClient: SupabaseClientLike,
  slug: string
): Promise<PublicTournamentLookup | null> {
  const fields = "id, title, slug, brochure_url";
  const indexed = supabaseClient
    .from("published_tournaments")
    .select(fields) as SupabaseQuery<PublicTournamentLookup>;
  const indexedResult = await indexed
    .or(`publication_slug.eq.${slug},public_slug.eq.${slug}`)
    .maybeSingle();

  if (indexedResult.error) throw indexedResult.error;
  if (indexedResult.data) return indexedResult.data;

  const fallback = supabaseClient
    .from("published_tournaments")
    .select(fields) as SupabaseQuery<PublicTournamentLookup>;
  const fallbackResult = await fallback.eq("slug", slug).maybeSingle();

  if (fallbackResult.error) throw fallbackResult.error;
  return fallbackResult.data;
}
