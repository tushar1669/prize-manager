const SAFE_TOURNAMENT_RETURN_SEGMENTS = new Set([
  "review",
  "finalize",
  "setup",
  "import",
  "order-review",
]);

function normalizeReturnTo(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return "";
  if (trimmed.startsWith("//")) return "";
  return trimmed.split("#")[0];
}

export function getSafeReturnToPath(tournamentId: string, requestedPath: string | null | undefined, fallbackPath: string): string {
  if (!requestedPath) return fallbackPath;

  const normalizedPath = normalizeReturnTo(requestedPath);
  if (!normalizedPath) return fallbackPath;

  const allowedPrefix = `/t/${tournamentId}/`;
  if (!normalizedPath.startsWith(allowedPrefix)) return fallbackPath;

  const suffix = normalizedPath.slice(allowedPrefix.length);
  if (!suffix) return fallbackPath;

  const [segment] = suffix.split("/");
  if (!segment || !SAFE_TOURNAMENT_RETURN_SEGMENTS.has(segment)) return fallbackPath;

  return normalizedPath;
}

export function getUpgradeUrl(
  tournamentId: string,
  returnToPath: string,
  options?: { coupon?: boolean },
): string {
  const safeReturnTo = getSafeReturnToPath(tournamentId, returnToPath, `/t/${tournamentId}/finalize`);
  const params = new URLSearchParams({ return_to: safeReturnTo });

  if (options?.coupon) {
    params.set("coupon", "1");
  }

  return `/t/${tournamentId}/payment?${params.toString()}`;
}
