import { describe, expect, it } from "vitest";
import {
  extractLogoUrlFromHtml,
  resolveClientSiteOrigin,
} from "@/lib/integrations/client-site-logo";

describe("resolveClientSiteOrigin", () => {
  it("prefers productionSiteUrl over siteUrl", () => {
    expect(
      resolveClientSiteOrigin({
        siteUrl: "https://staging.example.com",
        productionSiteUrl: "https://example.com/",
      }),
    ).toBe("https://example.com");
  });
});

describe("extractLogoUrlFromHtml", () => {
  const page = "https://client.example.com/";

  it("reads og:image", () => {
    const html = `<html><head><meta property="og:image" content="/assets/logo.png" /></head></html>`;
    const r = extractLogoUrlFromHtml(html, page);
    expect(r?.source).toBe("og:image");
    expect(r?.logoUrl).toBe("https://client.example.com/assets/logo.png");
  });

  it("reads apple-touch-icon before generic icon", () => {
    const html = `<html><head>
      <link rel="icon" href="/favicon.ico" />
      <link rel="apple-touch-icon" href="/apple.png" />
    </head></html>`;
    const r = extractLogoUrlFromHtml(html, page);
    expect(r?.source).toBe("apple-touch-icon");
    expect(r?.logoUrl).toBe("https://client.example.com/apple.png");
  });

  it("reads JSON-LD Organization logo", () => {
    const html = `<script type="application/ld+json">{"@type":"Organization","logo":{"url":"https://cdn.example.com/logo.webp"}}</script>`;
    const r = extractLogoUrlFromHtml(html, page);
    expect(r?.source).toBe("json-ld");
    expect(r?.logoUrl).toBe("https://cdn.example.com/logo.webp");
  });

  it("returns null when no candidates", () => {
    expect(extractLogoUrlFromHtml("<html></html>", page)).toBeNull();
  });
});
