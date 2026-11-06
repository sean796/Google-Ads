import { describe, it, expect } from "vitest";
import {
  runPublishingEvals,
  scoreLinkResolution,
  scoreSchemaValidity,
  scoreTemplatedFaqAnswers,
} from "./publishing-evals";

const INVENTORY = [
  "https://blindmagic.com/blinds/",
  "https://blindmagic.com/shutters/",
  "https://blindmagic.com/contact/",
];
const SITE = "https://blindmagic.com";

const GOOD_HTML = `
<article>
  <h2>Choosing Blinds for West-Facing Windows</h2>
  <p>Cellular shades cut heat gain. See our <a href="https://blindmagic.com/blinds/">blinds</a> range
  or the <a href="/shutters/">shutter collection</a>.</p>
  <p>External reference: <a href="https://www.energy.gov/energysaver/window-coverings">energy.gov</a>.</p>
</article>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
  {"@type":"Question","name":"Do cellular shades block heat?","acceptedAnswer":{"@type":"Answer","text":"Yes. The honeycomb pockets trap air, which insulates the glass and reduces heat transfer into the room."}},
  {"@type":"Question","name":"How long does installation take?","acceptedAnswer":{"@type":"Answer","text":"Most homes are finished in one visit of two to three hours, including measuring checks and cleanup."}}
]}
</script>`;

const GOOD_FAQ = [
  {
    question: "Do cellular shades block heat?",
    answer:
      "Yes. The honeycomb pockets trap air, which insulates the glass and reduces heat transfer into the room.",
  },
  {
    question: "How long does installation take?",
    answer: "Most homes are finished in one visit of two to three hours, including measuring checks and cleanup.",
  },
];

describe("scoreLinkResolution", () => {
  it("passes when every internal link resolves and no placeholders remain", () => {
    const r = scoreLinkResolution(GOOD_HTML, { inventoryUrls: INVENTORY, siteUrl: SITE });
    expect(r.pass).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it("fails on a leftover link placeholder", () => {
    const html = `<p>Read [[LINK:blinds|our blinds]] first.</p>`;
    const r = scoreLinkResolution(html, { inventoryUrls: INVENTORY, siteUrl: SITE });
    expect(r.pass).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("unresolved-link-placeholder");
  });

  it("fails on an internal link that is not in the inventory", () => {
    const html = `<p>See <a href="https://blindmagic.com/invented-page/">this page</a>.</p>`;
    const r = scoreLinkResolution(html, { inventoryUrls: INVENTORY, siteUrl: SITE });
    expect(r.pass).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("unresolved-internal-link");
  });

  it("ignores external links outside the site inventory", () => {
    const html = `<p><a href="https://en.wikipedia.org/wiki/Window_blind">Wikipedia</a></p>`;
    const r = scoreLinkResolution(html, { inventoryUrls: INVENTORY, siteUrl: SITE });
    expect(r.pass).toBe(true);
  });
});

describe("scoreSchemaValidity", () => {
  it("passes valid FAQPage JSON-LD with real answers", () => {
    const r = scoreSchemaValidity(GOOD_HTML);
    expect(r.pass).toBe(true);
  });

  it("passes when no FAQ schema is emitted at all (gate omission)", () => {
    const r = scoreSchemaValidity(`<article><p>Body only.</p></article>`);
    expect(r.pass).toBe(true);
  });

  it("fails on invalid JSON-LD", () => {
    const html = `<script type="application/ld+json">{not json</script>`;
    const r = scoreSchemaValidity(html);
    expect(r.pass).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("jsonld-parse-error");
  });

  it("fails on FAQPage with an empty answer", () => {
    const html = `<script type="application/ld+json">
      {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
        {"@type":"Question","name":"Real question?","acceptedAnswer":{"@type":"Answer","text":""}}
      ]}</script>`;
    const r = scoreSchemaValidity(html);
    expect(r.pass).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("faq-schema-missing-answer");
  });

  it("fails on FAQPage with no questions", () => {
    const html = `<script type="application/ld+json">
      {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[]}</script>`;
    const r = scoreSchemaValidity(html);
    expect(r.pass).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("faq-schema-empty");
  });
});

describe("scoreTemplatedFaqAnswers", () => {
  it("passes real stored answers", () => {
    const r = scoreTemplatedFaqAnswers(GOOD_FAQ);
    expect(r.pass).toBe(true);
  });

  it("catches the deleted fabricator template", () => {
    const r = scoreTemplatedFaqAnswers([
      {
        question: "How much do blinds cost?",
        answer: "For expert guidance on how much do blinds cost, contact our team for a quote.",
      },
    ]);
    expect(r.pass).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("templated-faq-answer");
  });

  it("catches the same answer pasted under different questions", () => {
    const r = scoreTemplatedFaqAnswers([
      { question: "Do you offer free estimates?", answer: "Yes, every estimate is free and takes 30 minutes." },
      { question: "What areas do you serve?", answer: "Yes, every estimate is free and takes 30 minutes." },
    ]);
    expect(r.pass).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("duplicate-faq-answer");
  });
});

describe("runPublishingEvals", () => {
  it("passes a clean artifact end to end", () => {
    const report = runPublishingEvals({
      html: GOOD_HTML,
      faqEntries: GOOD_FAQ,
      inventoryUrls: INVENTORY,
      siteUrl: SITE,
    });
    expect(report.pass).toBe(true);
  });

  it("fails a dirty artifact and names every failing scorer", () => {
    const report = runPublishingEvals({
      html: `<p>See [[LINK:shutters|shutters]] and <a href="/gone/">gone</a>.</p>
        <script type="application/ld+json">{broken</script>`,
      faqEntries: [
        { question: "Cost?", answer: "For expert guidance on cost, contact our team." },
      ],
      inventoryUrls: INVENTORY,
      siteUrl: SITE,
    });
    expect(report.pass).toBe(false);
    expect(report.links.pass).toBe(false);
    expect(report.schema.pass).toBe(false);
    expect(report.faqAnswers.pass).toBe(false);
  });

  it("leaves factuality out unless verdicts are fed in", () => {
    const report = runPublishingEvals({
      html: GOOD_HTML,
      faqEntries: GOOD_FAQ,
      inventoryUrls: INVENTORY,
      siteUrl: SITE,
    });
    expect(report.factuality).toBeUndefined();
    expect(report.pass).toBe(true);
  });

  it("fails the report when fed verdicts contain an unsupported claim", () => {
    const report = runPublishingEvals({
      html: GOOD_HTML,
      faqEntries: GOOD_FAQ,
      inventoryUrls: INVENTORY,
      siteUrl: SITE,
      factualityVerdicts: [
        {
          claim: "Lowest price in Canada, guaranteed.",
          verdict: "unsupported",
          reason: "Not in the pack.",
        },
      ],
    });
    expect(report.factuality?.pass).toBe(false);
    expect(report.factuality?.issues[0]?.code).toBe("unsupported-claim");
    expect(report.pass).toBe(false);
  });
});
