import { describe, expect, it } from "vitest";
import {
  applyBuiltinPreset,
  getBuiltinPreset,
} from "@/lib/chat-preferences-presets";
import {
  defaultChatPreferences,
  mergeChatPreferences,
  messageMatchesKeywords,
  messageMatchesTopics,
  normalizeAppearance,
  normalizeChatPreferences,
} from "@/lib/chat-preferences-types";
import { chatRootDataAttrs, chatZoneProps, zoneThemeStyle } from "@/lib/chat-theme-palettes";

describe("chat-preferences-presets", () => {
  it("minimal preset uses minimal layout and aubergine zone themes", () => {
    const base = defaultChatPreferences();
    const next = applyBuiltinPreset(base, "minimal");
    expect(next.activePresetId).toBe("minimal");
    expect(next.appearance.layoutMode).toBe("minimal");
    expect(next.appearance.zoneThemes).toEqual({ left: "slack", main: "slack", right: "slack" });
    expect(next.appearance.headingTheme).toBe("slack");
    expect(next.appearance.starredChannelIds).toEqual([]);
  });

  it("migrates legacy slack preset id to minimal", () => {
    const base = defaultChatPreferences();
    const next = applyBuiltinPreset(base, "slack");
    expect(next.activePresetId).toBe("minimal");
    expect(next.appearance.layoutMode).toBe("minimal");
  });

  it("returns balanced as default built-in preset", () => {
    const preset = getBuiltinPreset("balanced");
    expect(preset?.label).toBe("Balanced");
    expect(preset?.snapshot.notifications.mentions).toBe(true);
    expect(preset?.snapshot.appearance.zoneThemes.main).toBe("light");
  });

  it("focus preset uses split zone themes", () => {
    const base = defaultChatPreferences();
    const next = applyBuiltinPreset(base, "focus");
    expect(next.appearance.zoneThemes).toEqual({ left: "dark", main: "midnight", right: "dark" });
    expect(next.appearance.headingTheme).toBe("dark");
  });

  it("mergeChatPreferences deep-merges sidebar sections and zone themes", () => {
    const base = defaultChatPreferences();
    const merged = mergeChatPreferences(base, {
      appearance: {
        sidebarSections: { channels: true, dms: true, mentions: true, alerts: false },
        zoneThemes: { left: "light", main: "dark", right: "light" },
      },
    });
    expect(merged.appearance.sidebarSections.alerts).toBe(false);
    expect(merged.appearance.zoneThemes.main).toBe("dark");
    expect(merged.appearance.zoneThemes.left).toBe("light");
  });
});

describe("chat preferences migration", () => {
  it("migrates v1 themeId to zoneThemes and headingTheme", () => {
    const normalized = normalizeAppearance({
      themeId: "dark",
      zoneThemes: { left: "dark", main: "dark", right: "dark" },
      headingTheme: "dark",
      accentPreset: "brand",
      density: "comfortable",
      fontScale: "default",
      sidebarSections: { channels: true, dms: true, mentions: true, alerts: true },
      layoutMode: "default",
      starredChannelIds: [],
    });
    expect(normalized.zoneThemes).toEqual({ left: "dark", main: "dark", right: "dark" });
    expect(normalized.headingTheme).toBe("dark");
  });

  it("normalizeChatPreferences bumps version to 2", () => {
    const prefs = normalizeChatPreferences({
      version: 1,
      appearance: { themeId: "brand" } as never,
    });
    expect(prefs.version).toBe(2);
    expect(prefs.appearance.zoneThemes.right).toBe("brand");
  });
});

describe("chat notification matchers", () => {
  it("messageMatchesKeywords finds case-insensitive term", () => {
    expect(messageMatchesKeywords("Hello SEO world", ["seo"])).toBe("seo");
    expect(messageMatchesKeywords("Hello world", ["seo"])).toBeNull();
  });

  it("messageMatchesTopics checks body and channel topic", () => {
    expect(messageMatchesTopics("update shipped", "product launch", ["launch"])).toBe("launch");
    expect(messageMatchesTopics("plain text", null, ["launch"])).toBeNull();
  });
});

describe("chat-theme-palettes", () => {
  it("chatRootDataAttrs exposes layout and theme attrs", () => {
    const attrs = chatRootDataAttrs(defaultChatPreferences().appearance);
    expect(attrs["data-heading-theme"]).toBe("light");
    expect(attrs["data-chat-accent"]).toBe("brand");
    expect(attrs["data-chat-layout"]).toBe("default");
    expect(attrs["data-chat-theme"]).toBeUndefined();
  });

  it("chatZoneProps sets data-zone-theme per column", () => {
    const props = chatZoneProps("midnight", "blue");
    expect(props["data-zone-theme"]).toBe("midnight");
    expect(zoneThemeStyle("midnight", "blue")["--chat-bg"]).toBeTruthy();
  });
});
