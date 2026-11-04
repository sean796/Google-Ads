import { describe, expect, it } from "vitest";
import {
  clientLogoUrlForLocalStorage,
  stripInlineClientLogoFromSite,
} from "@/components/integrations/storage";
import { resolveOrganicClientReportClientLogoUrl } from "@/lib/integrations/client-site-logo";
import type { WordPressSite } from "@/components/integrations/types";

const baseSite: WordPressSite = {
  id: "wp-test",
  name: "Test",
  siteUrl: "https://example.com",
  username: "u",
  appPassword: "p",
  connectedAt: 1,
};

describe("clientLogoUrlForLocalStorage", () => {
  it("drops data URLs", () => {
    expect(clientLogoUrlForLocalStorage("data:image/png;base64,abc")).toBeUndefined();
    expect(clientLogoUrlForLocalStorage("https://example.com/logo.png")).toBe(
      "https://example.com/logo.png",
    );
  });
});

describe("resolveOrganicClientReportClientLogoUrl", () => {
  it("maps external client URLs to hub logo API", () => {
    const url = resolveOrganicClientReportClientLogoUrl(
      "blind-magic",
      "https://blindmagic.com/wp-content/uploads/logo.png",
      "https://neo-pulse-static.onrender.com",
    );
    expect(url).toBe(
      "https://neo-pulse-static.onrender.com/api/manager-wordpress-properties/client-logo/blind-magic",
    );
  });
});

describe("stripInlineClientLogoFromSite", () => {
  it("removes inline logo fields", () => {
    const site: WordPressSite = {
      ...baseSite,
      clientLogoUrl: "data:image/png;base64,abc",
      clientLogoSource: "manual",
      clientLogoFetchedAt: 123,
      clientLogoBoxTheme: "white",
    };
    const next = stripInlineClientLogoFromSite(site);
    expect(next.clientLogoUrl).toBeUndefined();
    expect(next.clientLogoSource).toBeUndefined();
    expect(next.clientLogoFetchedAt).toBeUndefined();
    expect(next.clientLogoBoxTheme).toBe("white");
  });
});
