import type {
  AssistHistoryMessage,
  AssistSubmode,
  AssistTargetScope,
  PageContentMode,
} from "./types";

const SUBMODE_KEY = "neo_pulse_chat_admin_submode";
const PAGE_CONTENT_MODE_KEY = "neo_pulse_page_content_mode";
const SCOPE_KEY = "neo_pulse_chat_target_scope";
const OPEN_KEY = "neo_pulse_pulse_assist_open";
const PANEL_KEY = "neo_pulse_sidebar_panel";
const SIDEBAR_WIDTH_KEY = "neo_pulse_assist_sidebar_width";
export const DEFAULT_SIDEBAR_WIDTH = 480;
/** Wider default when the SEO inspector is open (research brief JSON, meta fields). */
export const DEFAULT_SEO_SIDEBAR_WIDTH = 720;
export const MIN_SIDEBAR_WIDTH = 360;
export const MAX_SIDEBAR_WIDTH = 1280;
export type SidebarPanel = "assist" | "agents" | "seo";
const ASSIST_HISTORY_MAX = 40;
const ASSIST_HISTORY_BODY_MAX = 12000;

export function readSubmode(): AssistSubmode {
  try {
    const v = sessionStorage.getItem(SUBMODE_KEY);
    if (v === "ask" || v === "plan" || v === "build") return v;
  } catch {
    /* ignore */
  }
  return "ask";
}

export function writeSubmode(submode: AssistSubmode): void {
  try {
    sessionStorage.setItem(SUBMODE_KEY, submode);
  } catch {
    /* ignore */
  }
}

export function cycleSubmode(current: AssistSubmode): AssistSubmode {
  if (current === "ask") return "plan";
  if (current === "plan") return "build";
  return "ask";
}

export function readPageContentMode(): PageContentMode {
  try {
    const v = sessionStorage.getItem(PAGE_CONTENT_MODE_KEY);
    if (v === "seo_blocks" || v === "elementor_widgets") return v;
  } catch {
    /* ignore */
  }
  return "seo_blocks";
}

export function writePageContentMode(mode: PageContentMode): void {
  try {
    sessionStorage.setItem(PAGE_CONTENT_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function togglePageContentMode(current: PageContentMode): PageContentMode {
  return current === "seo_blocks" ? "elementor_widgets" : "seo_blocks";
}

export function readTargetScope(): AssistTargetScope {
  try {
    const v = sessionStorage.getItem(SCOPE_KEY);
    if (v === "page" || v === "site") return v;
  } catch {
    /* ignore */
  }
  return "page";
}

export function writeTargetScope(scope: AssistTargetScope): void {
  try {
    sessionStorage.setItem(SCOPE_KEY, scope);
  } catch {
    /* ignore */
  }
}

export function readSidebarOpen(): boolean {
  try {
    if (sessionStorage.getItem(OPEN_KEY) === "1") return true;
    if (sessionStorage.getItem("neo_pulse_agent_runs_open") === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function writeSidebarOpen(open: boolean): void {
  try {
    sessionStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function readSidebarPanel(): SidebarPanel {
  try {
    const v = sessionStorage.getItem(PANEL_KEY);
    if (v === "agents" || v === "seo") return v;
    if (v === "mastra") return "seo";
  } catch {
    /* ignore */
  }
  return "assist";
}

export function writeSidebarPanel(panel: SidebarPanel): void {
  try {
    sessionStorage.setItem(PANEL_KEY, panel);
  } catch {
    /* ignore */
  }
}

export function clampSidebarWidth(width: number, viewportWidth = window.innerWidth): number {
  const max = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, viewportWidth - 48));
  return Math.min(max, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)));
}

export function readSidebarWidth(viewportWidth = window.innerWidth): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(parsed)) return clampSidebarWidth(parsed, viewportWidth);
  } catch {
    /* ignore */
  }
  return clampSidebarWidth(DEFAULT_SIDEBAR_WIDTH, viewportWidth);
}

export function writeSidebarWidth(width: number): void {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clampSidebarWidth(width)));
  } catch {
    /* ignore */
  }
}

function assistHistoryKey(userId: string | number): string {
  return `neo_pulse_assist_chat_${String(userId || "0")}`;
}

function legacyGodModeHistoryKey(userId: string | number): string {
  return `neo-pulse_godmode_chat_${String(userId || "0")}`;
}

function normalizeAssistHistory(raw: unknown): AssistHistoryMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw as AssistHistoryMessage[];
}

export function loadPulseAssistHistory(userId: string | number): AssistHistoryMessage[] {
  try {
    const key = assistHistoryKey(userId);
    let raw = localStorage.getItem(key);
    if (!raw) {
      raw = localStorage.getItem(legacyGodModeHistoryKey(userId));
      if (raw) {
        localStorage.setItem(key, raw);
        localStorage.removeItem(legacyGodModeHistoryKey(userId));
      }
    }
    if (!raw) return [];
    return normalizeAssistHistory(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function savePulseAssistHistory(userId: string | number, history: AssistHistoryMessage[]): void {
  try {
    localStorage.setItem(
      assistHistoryKey(userId),
      JSON.stringify(history.slice(-ASSIST_HISTORY_MAX)),
    );
  } catch {
    /* ignore */
  }
}

export function clearPulseAssistHistory(userId: string | number): void {
  try {
    localStorage.removeItem(assistHistoryKey(userId));
    localStorage.removeItem(legacyGodModeHistoryKey(userId));
  } catch {
    /* ignore */
  }
}

/** @deprecated Use loadPulseAssistHistory */
export function loadGodModeHistory(userId: string | number): AssistHistoryMessage[] {
  return loadPulseAssistHistory(userId);
}

/** @deprecated Use savePulseAssistHistory */
export function saveGodModeHistory(userId: string | number, history: AssistHistoryMessage[]): void {
  savePulseAssistHistory(userId, history);
}

/** @deprecated Use clearPulseAssistHistory */
export function clearGodModeHistory(userId: string | number): void {
  clearPulseAssistHistory(userId);
}

export { ASSIST_HISTORY_BODY_MAX };
