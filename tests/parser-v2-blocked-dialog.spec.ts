import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BrochurePrizeDraftDialog from "@/components/prizes/BrochurePrizeDraftDialog";
import { supabase } from "@/integrations/supabase/client";
import { applyDraftAddOnly } from "@/utils/prizeApplyDraft";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock("@/utils/prizeApplyDraft", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/prizeApplyDraft")>();
  return {
    ...actual,
    applyDraftAddOnly: vi.fn(),
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const invokeMock = vi.mocked(supabase.functions.invoke);
const applyMock = vi.mocked(applyDraftAddOnly);

const makeDraft = (overall_confidence: "HIGH" | "MEDIUM" = "HIGH") => ({
  source: "pdf",
  file_path: "brochure.pdf",
  overall_confidence,
  warnings: [],
  categories: [
    {
      name: "Open",
      is_main: true,
      order_idx: 0,
      confidence: overall_confidence,
      warnings: [],
      criteria_json: {},
      prizes: [
        {
          place: 1,
          cash_amount: 1000,
          has_trophy: false,
          has_medal: false,
          gift_items: [],
          confidence: overall_confidence,
          source_text: "1st ₹1000",
        },
      ],
    },
  ],
  team_groups: [],
});

async function renderLoadedDialog(
  parserMode: "legacy" | "v2",
  payload: unknown,
) {
  invokeMock.mockResolvedValueOnce({ data: payload, error: null });
  render(
    React.createElement(BrochurePrizeDraftDialog, {
      open: true,
      onOpenChange: vi.fn(),
      tournamentId: "tournament-1",
      parserMode,
    }),
  );
  return screen.findByRole("button", { name: /apply \(add-only\)/i });
}

describe("BrochurePrizeDraftDialog Parser V2 backend blocked drafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyMock.mockResolvedValue({
      categories_created: 1,
      categories_reused: 0,
      prizes_created: 1,
      prizes_skipped_existing: 0,
      prizes_skipped_duplicate_in_draft: 0,
      team_groups_created: 0,
      team_groups_reused: 0,
      team_prizes_created: 0,
      team_prizes_skipped: 0,
      failed_categories: [],
      failed_team_groups: [],
    });
  });

  it("shows a blocked warning and disables Apply for a blocked V2 draft", async () => {
    const button = await renderLoadedDialog("v2", {
      status: "blocked_low_confidence",
      existing_draft_compat: makeDraft("HIGH"),
    });

    expect(screen.getByText("Parser V2 blocked this draft")).toBeTruthy();
    expect(
      screen.getByText(
        "The AI parser marked this extraction as unsafe or too uncertain to apply. Review it for reference, then use the existing parser, Excel template, or manual setup.",
      ),
    ).toBeTruthy();
    expect(button).toHaveProperty("disabled", true);
  });

  it("fails closed in the apply handler for a blocked draft and does not call applyDraftAddOnly", async () => {
    const button = await renderLoadedDialog("v2", {
      status: "ok_draft",
      blocked: true,
      existing_draft_compat: makeDraft("HIGH"),
    });

    // Simulate a stale/forced handler invocation despite the disabled UI control.
    (button as HTMLButtonElement).disabled = false;
    fireEvent.click(button);

    await waitFor(() => expect(applyMock).not.toHaveBeenCalled());
  });

  it("does not let SAFE_HIGH validation or SAFE_MEDIUM acknowledgement override a backend block", async () => {
    const highButton = await renderLoadedDialog("v2", {
      status: "ok_draft",
      blocked: true,
      existing_draft_compat: makeDraft("HIGH"),
    });

    expect(screen.getByText(/Confidence:/i)).toBeTruthy();
    expect(highButton).toHaveProperty("disabled", true);

    cleanup();
    vi.clearAllMocks();
    invokeMock.mockResolvedValueOnce({
      data: {
        status: "ok_draft",
        blocked: true,
        existing_draft_compat: makeDraft("MEDIUM"),
      },
      error: null,
    });
    render(
      React.createElement(BrochurePrizeDraftDialog, {
        open: true,
        onOpenChange: vi.fn(),
        tournamentId: "tournament-1",
        parserMode: "v2",
      }),
    );
    const mediumButton = await screen.findByRole("button", { name: /apply \(add-only\)/i });

    fireEvent.click(screen.getByRole("checkbox", { name: /i reviewed this draft/i }));
    expect(mediumButton).toHaveProperty("disabled", true);
  });

  it("preserves legacy parser apply behavior", async () => {
    const button = await renderLoadedDialog("legacy", {
      status: "ok_draft",
      draft: makeDraft("HIGH"),
    });

    expect(button).toHaveProperty("disabled", false);
    fireEvent.click(button);

    await waitFor(() => expect(applyMock).toHaveBeenCalledTimes(1));
  });
});
