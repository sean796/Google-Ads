import type {
  ChatBuiltinPresetId,
  ChatPreferencesPatch,
  ChatSavedPreset,
  ChatUserPreferences,
  ChatZoneThemes,
} from "@/lib/chat-preferences-types";
import { defaultAppearance, normalizeChatPreferences } from "@/lib/chat-preferences-types";
import { clampNoiseCancellationStrength } from "@/lib/call-audio-constraints";

type PresetDef = {
  id: ChatBuiltinPresetId;
  label: string;
  snapshot: Omit<ChatUserPreferences, "savedPresets" | "activePresetId" | "profile">;
};

const BASE_APPEARANCE = defaultAppearance();

const BASE_SNAPSHOT: Omit<ChatUserPreferences, "savedPresets" | "activePresetId" | "profile"> = {
  version: 2,
  appearance: BASE_APPEARANCE,
  notifications: {
    mentions: true,
    dms: true,
    threads: true,
    calls: true,
    channelMessages: false,
    desktopAlerts: false,
    soundEnabled: false,
    soundPreset: "subtle",
    keywordWatch: [],
    topicWatch: [],
  },
  behavior: {
    enterToSend: true,
    showLinkPreviews: true,
    showTypingIndicators: true,
    collapseThreadsByDefault: false,
    noiseCancellationStrength: 75,
  },
};

function zones(left: ChatZoneThemes["left"], main: ChatZoneThemes["main"], right: ChatZoneThemes["right"], heading: ChatZoneThemes["left"]) {
  return {
    zoneThemes: { left, main, right },
    headingTheme: heading,
  };
}

export const CHAT_BUILTIN_PRESETS: PresetDef[] = [
  {
    id: "minimal",
    label: "Minimal",
    snapshot: {
      ...BASE_SNAPSHOT,
      appearance: {
        ...BASE_APPEARANCE,
        layoutMode: "minimal",
        ...zones("slack", "slack", "slack", "slack"),
        accentPreset: "blue",
        density: "comfortable",
        sidebarSections: { channels: true, dms: true, mentions: true, alerts: true },
        starredChannelIds: [],
      },
    },
  },
  {
    id: "balanced",
    label: "Balanced",
    snapshot: BASE_SNAPSHOT,
  },
  {
    id: "all",
    label: "All",
    snapshot: {
      ...BASE_SNAPSHOT,
      appearance: {
        ...BASE_APPEARANCE,
        ...zones("light", "light", "light", "brand"),
        density: "comfortable",
      },
      notifications: {
        mentions: true,
        dms: true,
        threads: true,
        calls: true,
        channelMessages: true,
        desktopAlerts: true,
        soundEnabled: true,
        soundPreset: "classic",
        keywordWatch: [],
        topicWatch: [],
      },
    },
  },
  {
    id: "focus",
    label: "Focus",
    snapshot: {
      ...BASE_SNAPSHOT,
      appearance: {
        ...BASE_APPEARANCE,
        ...zones("dark", "midnight", "dark", "dark"),
        accentPreset: "brand",
        density: "compact",
        sidebarSections: { channels: true, dms: true, mentions: true, alerts: false },
      },
      notifications: {
        mentions: true,
        dms: true,
        threads: false,
        calls: true,
        channelMessages: false,
        desktopAlerts: false,
        soundEnabled: false,
        soundPreset: "subtle",
        keywordWatch: [],
        topicWatch: [],
      },
      behavior: {
        enterToSend: true,
        showLinkPreviews: true,
        showTypingIndicators: false,
        collapseThreadsByDefault: true,
        noiseCancellationStrength: 75,
      },
    },
  },
];

export function getBuiltinPreset(id: ChatBuiltinPresetId | "slack"): PresetDef | undefined {
  const presetId = id === "slack" ? "minimal" : id;
  return CHAT_BUILTIN_PRESETS.find((p) => p.id === presetId);
}

export function applyBuiltinPreset(
  current: ChatUserPreferences,
  presetId: ChatBuiltinPresetId | "slack",
): ChatUserPreferences {
  const preset = getBuiltinPreset(presetId);
  if (!preset) return current;
  return {
    ...current,
    activePresetId: preset.id,
    appearance: { ...preset.snapshot.appearance },
    notifications: { ...preset.snapshot.notifications },
    behavior: { ...preset.snapshot.behavior },
  };
}

export function applyPresetSnapshot(
  current: ChatUserPreferences,
  snapshot: Omit<ChatUserPreferences, "savedPresets" | "activePresetId">,
  activePresetId: string,
): ChatUserPreferences {
  return normalizeChatPreferences({
    ...current,
    activePresetId,
    appearance: { ...snapshot.appearance },
    notifications: { ...snapshot.notifications },
    behavior: { ...snapshot.behavior },
    profile: { ...current.profile, ...snapshot.profile },
  });
}

export function buildCustomPresetPatch(
  current: ChatUserPreferences,
  name: string,
): ChatPreferencesPatch {
  const id = `custom-${Date.now()}`;
  const snapshot: ChatSavedPreset["snapshot"] = {
    version: current.version,
    profile: { ...current.profile },
    appearance: {
      ...current.appearance,
      zoneThemes: { ...current.appearance.zoneThemes },
      sidebarSections: { ...current.appearance.sidebarSections },
      starredChannelIds: [...current.appearance.starredChannelIds],
    },
    notifications: {
      ...current.notifications,
      keywordWatch: [...current.notifications.keywordWatch],
      topicWatch: [...current.notifications.topicWatch],
    },
    behavior: { ...current.behavior },
  };
  return {
    activePresetId: id,
    savedPresets: [...current.savedPresets, { id, name, snapshot }],
  };
}

export function deleteSavedPresetPatch(
  current: ChatUserPreferences,
  presetId: string,
): ChatPreferencesPatch {
  return {
    savedPresets: current.savedPresets.filter((p) => p.id !== presetId),
    activePresetId: current.activePresetId === presetId ? "balanced" : current.activePresetId,
  };
}

export const CHAT_THEME_OPTIONS = [
  { id: "light" as const, label: "Light" },
  { id: "dark" as const, label: "Dark" },
  { id: "midnight" as const, label: "Midnight" },
  { id: "high-contrast" as const, label: "High contrast" },
  { id: "brand" as const, label: "Brand chartreuse" },
  { id: "slack" as const, label: "Aubergine" },
];

export const CHAT_ACCENT_OPTIONS = [
  { id: "brand" as const, swatch: "bg-primary" },
  { id: "blue" as const, swatch: "bg-blue-500" },
  { id: "violet" as const, swatch: "bg-violet-500" },
  { id: "rose" as const, swatch: "bg-rose-500" },
  { id: "amber" as const, swatch: "bg-amber-500" },
];

export const CHAT_TIMEZONE_OPTIONS = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney",
];
