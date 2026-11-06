import { describe, expect, it } from "vitest";
import { countHarnessInternalLinkPlaceholders } from "@/lib/bulk/harness-section-validate";

describe("harness section internal link validation", () => {
  it("counts [[LINK:query|anchor]] placeholders", () => {
    const html = `<h2>Permits</h2><p>See [[LINK:tent rental|tent rental]] and [[LINK:contact page|contact page]] for help.</p>`;
    expect(countHarnessInternalLinkPlaceholders(html)).toBe(2);
  });

  it("counts zero when a section has no internal links (allowed, no minimum)", () => {
    const html = `<h2>Permits</h2><p>No links in this section.</p>`;
    expect(countHarnessInternalLinkPlaceholders(html)).toBe(0);
  });
});
