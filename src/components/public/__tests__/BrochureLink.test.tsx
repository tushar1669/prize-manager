import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrochureLink, type BrochureLinkProps } from "../BrochureLink";

const SAMPLE_URL = "https://example.com/brochure.pdf";
const STORAGE_PATH = "123/1234567890_brochure.pdf";

describe("BrochureLink", () => {
  it("renders a brochure button when full URL is provided (SSR)", () => {
    // Full URLs (starting with http) are rendered synchronously
    const html = renderToString(<BrochureLink url={SAMPLE_URL} />);
    expect(html).toContain(SAMPLE_URL);
    expect(html).toContain("Brochure");
    expect(html).toContain("target=\"_blank\"");
  });

  it("hides when url is missing or empty", () => {
    expect(renderToString(<BrochureLink url={null} />)).toBe("");
    expect(renderToString(<BrochureLink url="   " />)).toBe("");
  });

  it("shows loading state for storage paths (SSR)", () => {
    // Storage paths (not starting with http) trigger async signed URL fetch
    // During SSR, this shows loading state
    const html = renderToString(<BrochureLink url={STORAGE_PATH} />);
    // Should render something (loading state) but not the raw path
    expect(html).not.toContain(STORAGE_PATH);
    expect(html).toContain("Brochure");
  });

  it("detects storage paths correctly", () => {
    // Storage path detection is internal but we can verify behavior:
    // - Full URLs render immediately with the URL
    // - Storage paths don't include the raw path in output
    
    const fullUrlHtml = renderToString(<BrochureLink url="https://example.com/file.pdf" />);
    expect(fullUrlHtml).toContain("https://example.com/file.pdf");
    
    const storagePathHtml = renderToString(<BrochureLink url="bucket/file.pdf" />);
    expect(storagePathHtml).not.toContain("bucket/file.pdf");
  });
});
