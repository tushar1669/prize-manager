import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";

export const GENDER_OVERRIDE_WARNING = "female signal overrides explicit male gender";

interface OverridePlayer {
  rank?: number | null;
  name?: string | null;
  type_label?: string | null;
  group_label?: string | null;
  _genderWarnings?: string[];
}

export function findGenderOverrides<T extends OverridePlayer>(players: T[]): T[] {
  return players.filter((p) => Array.isArray(p._genderWarnings) && p._genderWarnings.includes(GENDER_OVERRIDE_WARNING));
}

/** Display-only notice: players whose Gender said M but another marker (FS, Type, Gr) said girl. */
export function GenderOverrideNotice({ players }: { players: OverridePlayer[] }) {
  const overrides = findGenderOverrides(players);
  if (overrides.length === 0) return null;
  return (
    <Alert className="my-3">
      <Info className="h-4 w-4" />
      <AlertTitle>
        {overrides.length} player{overrides.length === 1 ? " was" : "s were"} marked as girls even though Gender said M
      </AlertTitle>
      <AlertDescription>
        <p className="text-sm">
          A girl marker in another column (FS, Type or Gr, e.g. F13, FMG, GIRL) took priority. Please check these before saving.
        </p>
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer">Show players</summary>
          <ul className="mt-1 space-y-0.5">
            {overrides.map((p, i) => (
              <li key={`${p.rank ?? "x"}-${i}`}>
                Rank {p.rank ?? "–"}: {p.name ?? "(no name)"}
                {(p.type_label || p.group_label) && (
                  <span className="text-muted-foreground"> — {[p.type_label, p.group_label].filter(Boolean).join(" / ")}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      </AlertDescription>
    </Alert>
  );
}
