import { describe, expect, it } from "vitest";
import {
  clientLogoUrlForLocalStorage,
  stripInlineClientLogoFromSite,
} from "@/components/integrations/storage";
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
