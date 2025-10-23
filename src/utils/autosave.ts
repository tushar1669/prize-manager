// src/utils/autosave.ts
export type DraftEnvelope<T> = { v: number; t: number; data: T };

const PREFIX = 'autosave:';
const DAY = 24 * 60 * 60 * 1000;

export function makeKey(scope: string) {
  return `${PREFIX}${scope}`;
}

export function setDraft<T>(key: string, data: T, v = 1) {
  try {
    const env: DraftEnvelope<T> = { v, t: Date.now(), data };
    sessionStorage.setItem(key, JSON.stringify(env));
  } catch {
    // ignore quota / private mode errors
  }
}

export function getDraft<T>(
  key: string,
  v = 1,
  maxAgeMs = 7 * DAY
): { data: T; ageMs: number } | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const env = JSON.parse(raw) as DraftEnvelope<T>;
    if (!env || typeof env !== 'object') return null;
    if (env.v !== v) return null;
    const ageMs = Date.now() - env.t;
    if (ageMs > maxAgeMs) {
      sessionStorage.removeItem(key);
      return null;
    }
    return { data: env.data as T, ageMs };
  } catch {
    return null;
  }
}

export function clearDraft(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function formatAge(ageMs: number) {
  const mins = Math.round(ageMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
