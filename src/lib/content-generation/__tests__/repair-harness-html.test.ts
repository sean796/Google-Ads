import { describe, expect, it } from "vitest";
import {
  repairHarnessHtmlForUpload,
  repairMalformedImgTags,
  removeDuplicateParagraphBlocks,
  repairUnclosedTrailingParagraph,
  stripOrphanBracketArtifacts,
} from "../repair-harness-html";

describe("repairMalformedImgTags", () => {
  it("fixes slash before style attribute", () => {
    const broken =
      '<img src="https://example.com/a.jpg" alt="Alt" loading="lazy" / style="width: 100%;">';
    const fixed = repairMalformedImgTags(broken);
    expect(fixed).toContain('style="width: 100%;"');
    expect(fixed).not.toContain("/ style=");
  });
});

describe("stripOrphanBracketArtifacts", () => {
  it("removes orphan ]. fragments", () => {
    const html = "<p>See their warranty policy ].</p>";
    expect(stripOrphanBracketArtifacts(html)).toBe("<p>See their warranty policy.</p>");
  });

  it("removes Related reading: link tails", () => {
    const html =
      '<p>Choose solar chargers to maintain battery charge. Related reading: <a href="https://blindmagic.com/powerview/">PowerView Automation</a>. Related reading: <a href="https://blindmagic.com/operating-systems/">operating systems</a>.</p>';
    expect(stripOrphanBracketArtifacts(html)).toBe(
      "<p>Choose solar chargers to maintain battery charge.</p>",
    );
  });
});

describe("removeDuplicateParagraphBlocks", () => {
  it("drops consecutive duplicate paragraphs", () => {
    const html = "<p>Same text here.</p><p>Same text here.</p><p>Different text.</p>";
    const out = removeDuplicateParagraphBlocks(html);
    expect(out).toBe("<p>Same text here.</p><p>Different text.</p>");
  });
});

describe("repairUnclosedTrailingParagraph", () => {
  it("closes a trailing paragraph when prose is complete", () => {
    const html = "<h2>T</h2><p>Complete sentence here.";
    expect(repairUnclosedTrailingParagraph(html)).toBe(
      "<h2>T</h2><p>Complete sentence here.</p>",
    );
  });

  it("removes incomplete trailing paragraph open tag", () => {
    const html = "<h2>T</h2><p>Complete first.</p><p>Cut off mid";
    expect(repairUnclosedTrailingParagraph(html)).toBe("<h2>T</h2><p>Complete first.</p>");
  });
});

describe("repairHarnessHtmlForUpload", () => {
  it("applies img, bracket, and duplicate repairs", () => {
    const html =
      '<p>Alpha sentence.</p><br>Alpha sentence.</p><p>See details ].</p><img src="x" / style="width:100%;">';
    const out = repairHarnessHtmlForUpload(html);
    expect(out).not.toContain("/ style=");
    expect(out).not.toContain("].");
  });
});
