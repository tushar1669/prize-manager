import { describe, it, expect } from "vitest";
import { normalizeError } from "@/lib/errors/normalizeError";

describe("normalizeError", () => {
  it("normalizes auth credential error", () => {
    const result = normalizeError({ message: "Invalid login credentials" });
    expect(result.friendlyMessage).toBe("Incorrect email or password.");
    expect(result.referenceId).toBeTruthy();
    expect(result.referenceId.length).toBe(6);
    expect(result.severity).toBe("error");
    expect(result.eventType).toBe("auth_error");
    expect(result.suggestedAction).toContain("Forgot password");
  });

  it("normalizes network error", () => {
    const result = normalizeError(new TypeError("Failed to fetch"));
    expect(result.friendlyMessage).toContain("Network error");
    expect(result.referenceId).toBeTruthy();
    expect(result.eventType).toBe("network_error");
  });

  it("normalizes already registered error", () => {
    const result = normalizeError({ message: "User already registered" });
    expect(result.friendlyMessage).toContain("already registered");
    expect(result.eventType).toBe("auth_error");
  });

  it("normalizes RLS error", () => {
    const result = normalizeError({ message: "new row violates row-level security policy" });
    expect(result.friendlyMessage).toContain("data access rule");
    expect(result.eventType).toBe("rls_error");
  });

  it("returns fallback for unknown errors", () => {
    const result = normalizeError({ message: "Something totally random happened" });
    expect(result.friendlyMessage).toBe("Something went wrong. Please try again.");
    expect(result.referenceId).toBeTruthy();
    expect(result.eventType).toBe("unknown_error");
  });

  it("handles string errors", () => {
    const result = normalizeError("Rate limit exceeded: too many requests");
    expect(result.friendlyMessage).toContain("Too many requests");
    expect(result.eventType).toBe("rate_limit");
  });

  it("generates unique reference IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => normalizeError("test").referenceId));
    expect(ids.size).toBeGreaterThan(90);
  });
});
