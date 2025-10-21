export function slugifyWithSuffix(title: string): string {
  const base = (title || 'tournament')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const suf = Math.random().toString(36).slice(2, 7);
  return `${base}-${suf}`;
}
