import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Guard for X4: revoking an auto-approval does NOT necessarily remove Pro.
 *
 * tournament_entitlements stack. Ending the auto_upi window leaves any coupon
 * or manual grant untouched, so revoke_auto_entitlement returns
 * pro_still_active / active_sources and the panel must render THOSE — never a
 * blanket "access removed". This test pins that: the RPC says Pro survived via
 * a coupon, and the panel has to say so and name the coupon.
 *
 * The fixture row deliberately lists only auto_upi as an active source, so the
 * word "coupon" can reach the screen from exactly one place — the revoke
 * response. The re-fetch assertion at the end pins the other half of the rule:
 * the row is re-read from the server rather than patched optimistically.
 *
 * Written without JSX because vitest only collects tests/**\/*.spec.ts.
 */

const { mockList, mockRevoke, mockRecord } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockRevoke: vi.fn(),
  mockRecord: vi.fn(),
}));

vi.mock("@/integrations/supabase/autoApprovals", () => ({
  listAutoApprovals: mockList,
  recordAutoApprovalAudit: mockRecord,
  revokeAutoEntitlement: mockRevoke,
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ authzStatus: "ready", is_master: true }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { AutoApprovedPanel } from "@/components/payments/AutoApprovedPanel";

const ROW = {
  payment_id: "11111111-1111-1111-1111-111111111111",
  tournament_id: "22222222-2222-2222-2222-222222222222",
  tournament_title: "Jaipur Open 2026",
  user_id: "33333333-3333-3333-3333-333333333333",
  organizer_email: "organizer@example.com",
  amount_inr: 500,
  utr: "412345678901",
  payment_status: "approved",
  created_at: "2026-08-01T10:00:00.000Z",
  reviewed_by: null,
  reviewed_at: null,
  review_note: "Auto-approved.",
  screenshot_extraction_id: "44444444-4444-4444-4444-444444444444",
  file_hash: "abc123",
  file_path: "b7db99f0-0000-0000-0000-000000000000/payments/acd65f1a-0000-0000-0000-000000000000/938583ba-0000-0000-0000-000000000000.jpg",
  file_name: "upi-receipt.jpg",
  entitlement_id: "55555555-5555-5555-5555-555555555555",
  entitlement_starts_at: "2026-08-01T10:00:00.000Z",
  entitlement_ends_at: "2027-08-01T10:00:00.000Z",
  entitlement_active: true,
  auto_entitlement_count: 1,
  pro_still_active: true,
  active_sources: ["auto_upi"],
  checker_version: 1,
  verdicts: {
    utr_format: "pass",
    utr_duplicate: "pass",
    amount_mismatch: "pass",
    payee_vpa_mismatch: "pass",
    payee_vpa_missing: "skipped",
    date_stale: "pass",
    direction_not_outgoing: "pass",
    required_fields_missing: "pass",
  },
  audit: null,
};

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(MemoryRouter, null, React.createElement(AutoApprovedPanel))
    )
  );
}

describe("AutoApprovedPanel revoke outcome", () => {
  beforeEach(() => {
    mockList.mockReset();
    mockRevoke.mockReset();
    mockRecord.mockReset();
    mockList.mockResolvedValue([ROW]);
  });

  it("reports that Pro is still active and names the surviving source when revoke says so", async () => {
    // The post-revoke refetch is allowed to resolve normally here. The stored
    // revoke result is a dated record of what the RPC said, not a claim about
    // the present, so a fresh row landing beside it does not clear it — the
    // message below has to survive the refetch, and this test is what pins
    // that. (mockList already resolves to [ROW] for every call.)
    mockRevoke.mockResolvedValue({
      payment_id: ROW.payment_id,
      entitlements_ended: 1,
      ends_at: "2026-08-28T12:00:00.000Z",
      pro_still_active: true,
      active_sources: ["coupon"],
      payment_status: "approved",
      organizer_emailed: false,
    });

    renderPanel();

    await screen.findByText("Jaipur Open 2026");
    // Nothing has said "coupon" yet — the list fixture only knows auto_upi.
    expect(document.body.textContent).not.toContain("coupon");

    fireEvent.click(screen.getByRole("button", { name: "Revoke entitlement…" }));

    const reason = await screen.findByLabelText("Reason for revoking");
    fireEvent.change(reason, { target: { value: "Payee VPA was never verified." } });
    fireEvent.click(screen.getByRole("button", { name: "Revoke entitlement" }));

    await waitFor(() => expect(mockRevoke).toHaveBeenCalledTimes(1));
    expect(mockRevoke).toHaveBeenCalledWith(ROW.payment_id, "Payee VPA was never verified.");

    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Pro is still active");
    expect(status.textContent).toContain("coupon");
    // The honest phrasing must not be undercut elsewhere in the message.
    expect(status.textContent).toContain("Access was NOT removed");

    // No optimistic update: the row is re-read from the server after the write.
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });
});

/**
 * A failed read is not an empty list.
 *
 * listAutoApprovals() throws rather than returning [] when the RPC errors or
 * hands back something that is not an array. This pins the consequence: the
 * panel must show that it could not read, and must NOT show the empty state.
 * "No auto-approvals yet" on a broken read path is the D21/D32/D40 failure —
 * an oversight surface quietly reporting that there is nothing to oversee.
 */
describe("AutoApprovedPanel load failure", () => {
  beforeEach(() => {
    mockList.mockReset();
    mockRevoke.mockReset();
    mockRecord.mockReset();
  });

  it("renders the error state, not the empty state, when the list cannot be read", async () => {
    mockList.mockRejectedValue(
      new Error("list_auto_approvals did not return an array — the contract moved. Received object.")
    );

    renderPanel();

    await screen.findByText("Could not load auto-approved payments.");
    expect(document.body.textContent).toContain("the contract moved");
    expect(screen.queryByText("No auto-approvals yet")).toBeNull();
  });
});
