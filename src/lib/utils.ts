import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export type GiftItem = { name: string; qty: number };

export function coerceGiftItems(raw: unknown): GiftItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const row = x as Record<string, unknown>;
      return {
        name: typeof row.name === "string" ? row.name.trim() : "",
        qty: Number.isFinite(Number(row.qty)) ? Number(row.qty) : 1,
      };
    })
    .filter((x) => x.name.length > 0 && x.qty > 0);
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
