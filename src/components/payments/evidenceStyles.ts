/**
 * Opaque resting background for the evidence detail row — never a translucent
 * tint. The base TableRow class carries `hover:bg-muted/50`, so a 60%-alpha
 * resting colour made the whole evidence block legible only while hovered.
 */
export function evidenceRowClass(hasFlags: boolean): string {
  return hasFlags
    ? "bg-warning/10 hover:bg-warning/10"
    : "bg-success/10 hover:bg-success/10";
}
