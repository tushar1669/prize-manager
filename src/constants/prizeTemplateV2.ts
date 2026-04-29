export const PRIZE_TEMPLATE_V2_HEADERS = [
  "Category",
  "Is Main",
  "Place",
  "Cash Amount",
  "Trophy",
  "Medal",
  "Gift Name",
  "Gift Qty",
  "Notes",
] as const;

export const PRIZE_TEMPLATE_V2_SAMPLE_ROWS = [
  ["Main Prize", "yes", "1", 10000, "yes", "yes", "Chess Clock", 1, "Overall champion"],
  ["Main Prize", "yes", "2", 6000, "yes", "no", "", "", "Main runner-up"],
  ["Women", "no", "1", 3000, "yes", "yes", "", "", "Category prize"],
] as const;
