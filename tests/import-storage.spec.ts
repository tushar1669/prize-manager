import { describe, expect, it } from "vitest";
import { buildImportStoragePath, isMissingBucketError } from "../supabase/functions/_shared/importStorage";

describe("import storage hardening", () => {
  it("builds object paths without a hard-coded imports/ prefix", () => {
    const path = buildImportStoragePath({
      userId: "user-1",
      tournamentId: "t-1",
      date: "2026-04-19",
      fileHash: "abc123",
      fileName: "players.xlsx"
    });

    expect(path).toBe("user-1/t-1/2026-04-19/abc123_players.xlsx");
  });

  it("detects missing bucket errors for imports bucket", () => {
    expect(isMissingBucketError("Bucket not found: imports", "imports")).toBe(true);
    expect(isMissingBucketError("storage bucket imports does not exist", "imports")).toBe(true);
    expect(isMissingBucketError("Permission denied", "imports")).toBe(false);
    expect(isMissingBucketError("Bucket not found: exports", "imports")).toBe(false);
  });
});
