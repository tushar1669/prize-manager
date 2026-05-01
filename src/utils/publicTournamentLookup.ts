import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type SupabaseClientLike = Pick<SupabaseClient<Database>, "from">;

type PublishedTournamentRow = Database["public"]["Views"]["published_tournaments"]["Row"];

export type PublicTournamentLookup = Pick<
  PublishedTournamentRow,
  "id" | "title" | "slug" | "brochure_url"
>;

export async function fetchPublishedTournamentBySlug(
  supabaseClient: SupabaseClientLike,
  slug: string
): Promise<PublicTournamentLookup | null> {
  const fields = "id, title, slug, brochure_url";
  const indexedResult = await supabaseClient
    .from("published_tournaments")
    .select(fields)
    .or(`publication_slug.eq.${slug},public_slug.eq.${slug}`)
    .maybeSingle();

  if (indexedResult.error) throw indexedResult.error;
  if (indexedResult.data) return indexedResult.data;

  const fallbackResult = await supabaseClient
    .from("published_tournaments")
    .select(fields)
    .eq("slug", slug)
    .maybeSingle();

  if (fallbackResult.error) throw fallbackResult.error;
  return fallbackResult.data;
}
