import { describe, expect, it } from "vitest";
import {
  extractMetaDeviceScreenCopyRoot,
  formatMetaDeviceScreenCopyForPrompt,
  normalizeMetaDeviceScreenUiStyle,
  parseMetaDeviceScreenCopy,
} from "@/lib/ppc/meta-ad-device-screen-copy";

describe("meta-ad-device-screen-copy", () => {
  it("parses flat model output", () => {
    const copy = parseMetaDeviceScreenCopy({
      uiStyle: "elementor",
      heroTitle: "Welcome to Edmonton",
      heroSubline: "Rank higher locally",
      primaryButton: "Get Started",
      secondaryButton: "Learn More",
    });
    expect(copy.heroTitle).toBe("Welcome to Edmonton");
    expect(copy.primaryButton).toBe("Get Started");
  });

  it("unwraps nested deviceScreenCopy and field aliases", () => {
    const copy = parseMetaDeviceScreenCopy({
      deviceScreenCopy: {
        style: "WordPress admin",
        headline: "Local SEO Wins",
        subtitle: "Built for Edmonton businesses",
        primary_cta: "Start Now",
      },
    });
    expect(copy.uiStyle).toBe("wordpress");
    expect(copy.heroTitle).toBe("Local SEO Wins");
    expect(copy.heroSubline).toBe("Built for Edmonton businesses");
    expect(copy.primaryButton).toBe("Start Now");
  });

  it("normalizes ui style labels from model", () => {
    expect(normalizeMetaDeviceScreenUiStyle("Elementor editor")).toBe("elementor");
    expect(normalizeMetaDeviceScreenUiStyle("Neo-Pulse action list")).toBe("neo-pulse");
  });

  it("formats exact strings for image prompt", () => {
    const block = formatMetaDeviceScreenCopyForPrompt({
      uiStyle: "wordpress",
      heroTitle: "Welcome to Edmonton",
      heroSubline: "Local SEO wins",
      primaryButton: "Get Started",
    });
    expect(block).toContain('Hero title: "Welcome to Edmonton"');
    expect(block).toContain("Sidebars and panels are icons");
  });

  it("extracts nested copy root", () => {
    expect(
      extractMetaDeviceScreenCopyRoot({
        screenCopy: { heroTitle: "Test" },
      }).heroTitle,
    ).toBe("Test");
  });
});
