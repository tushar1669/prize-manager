import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrochureLink } from "../BrochureLink";

const SAMPLE_URL = "https://example.com/brochure.pdf";

describe("BrochureLink", () => {
  it("renders a brochure button when url is provided", () => {
    const html = renderToString(<BrochureLink url={SAMPLE_URL} />);
    expect(html).toContain(SAMPLE_URL);
    expect(html).toContain("Brochure");
    expect(html).toContain("target=\"_blank\"");
  });

  it("hides when url is missing or empty", () => {
    expect(renderToString(<BrochureLink url={null} />)).toBe("");
    expect(renderToString(<BrochureLink url="   " />)).toBe("");
  });
});
