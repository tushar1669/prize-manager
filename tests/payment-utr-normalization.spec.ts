import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  normalizeUtr,
  runPaymentTrustChecks,
} from "../supabase/functions/extract/paymentTrustCheck";
import { UTR_NORMALIZATION_FIXTURES } from "./fixtures/utrNormalizationFixtures";

const PLATFORM_VPA = "platform@testvpa";
// process.cwd() is the vitest root (the repo root); import.meta.url is an
// http:// URL under the jsdom environment, so it cannot be used here.
const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260808172212_f0d_utr_active_duplicate_exists.sql",
);

describe("normalizeUtr mirrors the SQL normalize_utr", () => {
  it.each(UTR_NORMALIZATION_FIXTURES)(
    "$label",
    ({ input, expected }) => {
      expect(normalizeUtr(input)).toBe(expected);
    },
  );

  it("strips before uppercasing, so JS and Postgres cannot diverge", () => {
    // Upper-THEN-strip would produce "UTRSS1234I": JS uppercases \u00DF to "SS" and
    // \u0131 to "I", both of which survive the [^A-Za-z0-9] strip as letters.
    // Postgres upper() leaves both alone and the strip then deletes them.
    // Strip-then-upper leaves only ASCII, which both engines agree on.
    expect(normalizeUtr("utr\u00DF1234\u0131")).toBe("UTR1234");
    expect(normalizeUtr("utr\u00DF1234\u0131")).not.toBe("UTRSS1234I");
  });

  it("returns the empty string for every non-string input", () => {
    expect(normalizeUtr(undefined)).toBe("");
    expect(normalizeUtr(null)).toBe("");
    expect(normalizeUtr(12345678)).toBe("");
    expect(normalizeUtr({})).toBe("");
  });
});

describe("runPaymentTrustChecks — UTR duplicate check", () => {
  // Only .rpc() is needed: tournamentId and userId are null, so the amount
  // branch short-circuits before any .from() builder chain is touched.
  const rpc = vi.fn();
  const admin = { rpc } as never;

  const reasons = async (payload: Record<string, unknown>) => {
    const flags = await runPaymentTrustChecks(payload, null, null, admin, "");
    return flags.map((flag) => flag.reason);
  };

  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: false, error: null });
    vi.stubGlobal("Deno", {
      env: {
        get: (key: string) => (key === "PLATFORM_PAYEE_VPA" ? PLATFORM_VPA : undefined),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("flags utr_duplicate when the rpc reports an active duplicate", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await reasons({ utr: "028862663052" })).toContain("utr_duplicate");
  });

  it("does not flag when the rpc reports no duplicate", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await reasons({ utr: "028862663052" })).not.toContain("utr_duplicate");
  });

  it("does not flag, and does not throw, when the rpc returns an error", async () => {
    // Advisory only: the hard block is submit_tournament_payment_claim plus the
    // unique index, so a failed lookup must never manufacture a flag.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });

    const flags = await reasons({ utr: "028862663052" });
    expect(flags).not.toContain("utr_duplicate");
    expect(console.warn).toHaveBeenCalled();
  });

  it("still runs the duplicate check on a UTR that fails the format rule", async () => {
    // The regression this fixes: the duplicate lookup used to live inside the
    // format check's else-branch, so "1234-5678-9012" flagged utr_format and was
    // never duplicate-checked — a hyphen was enough to skip the lookup entirely.
    rpc.mockResolvedValue({ data: true, error: null });

    const flags = await reasons({ utr: "1234-5678-9012" });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("utr_active_duplicate_exists", {
      p_utr: "1234-5678-9012",
    });
    expect(flags).toContain("utr_format");
    expect(flags).toContain("utr_duplicate");
  });

  it("passes the raw trimmed UTR, not the normalized one, so mirror drift is harmless", async () => {
    await reasons({ utr: "  sbin1234abcd  " });
    expect(rpc).toHaveBeenCalledWith("utr_active_duplicate_exists", {
      p_utr: "sbin1234abcd",
    });
  });

  it("skips both UTR checks entirely when no UTR was extracted", async () => {
    for (const payload of [{}, { utr: "" }, { utr: "   " }, { utr: null }]) {
      rpc.mockClear();
      const flags = await reasons(payload);
      expect(flags).not.toContain("utr_format");
      expect(flags).not.toContain("utr_duplicate");
      expect(rpc).not.toHaveBeenCalled();
    }
  });
});

describe("migration parity guard", () => {
  // Locks the SQL side to the comparison the TS mirror assumes. If anyone edits
  // the migration to compare raw UTRs, or to include rejected rows, this fails
  // loudly rather than letting the two definitions drift apart in silence.
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  it("compares on public.normalize_utr, not the raw column", () => {
    expect(sql).toContain("public.normalize_utr(tp.utr)");
  });

  it("excludes rejected payments from the duplicate set", () => {
    expect(sql).toContain("status <> 'rejected'");
  });
});
