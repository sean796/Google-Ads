import { logger } from "@/lib/logger";
export type NotifyVariant = "success" | "error" | "info" | "warning" | "loading" | "default";

/**
 * Strip noise for in-app notify copy: trim, collapse whitespace, replace em/en dashes with commas
 * so API or legacy strings stay on one readable line.
 */
export function normalizeNotifyText(s: string | null | undefined): string {
  if (s == null || s === "") return "";
  let t = String(s).trim();
  t = t.replace(/\s*[\u2014\u2013]\s*/g, ", ");
  t = t.replace(/\s+/g, " ");
  t = t.replace(/,\s*,+/g, ", ");
  return t.trim();
}

/** Collapses spaces within lines; preserves newlines (for multi-block loading UX). */
function normalizeNotifyDescriptionMultiline(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .trim();
}

export type NotifyOptions = {
  id?: string | number;
  description?: string;
  /** ms; omit uses defaults; Infinity = until dismissed */
  duration?: number;
};

function stripNotifyNoise(s: string): string {
  let t = s.replace(/https?:\/\/\S+/gi, "");
  t = t.replace(/\s*\([^)]*\)/g, "");
  t = t.replace(/\b\S+\.(json|csv|md|xml|php|txt|docx)\b/gi, "");
  return normalizeNotifyText(t);
}

/** Header-safe copy: short, full words, never truncated. Long detail goes to console. */
function shortNotifyTitle(s: string): string {
  const t = normalizeNotifyText(s);
  if (!t) return t;

  const lower = t.toLowerCase();
  const wpErrCount = (t.match(/wordpress api error/gi) ?? []).length;

  if (lower.includes("can't connect") || lower.includes("cannot connect") || lower.includes("localhost:3001")) {
    return "Can't connect to server";
  }
  if (lower.includes("429") || /rate[- ]?limit/i.test(lower)) {
    return "Rate limited, retry later";
  }
  if (wpErrCount > 1 || (t.includes(":") && wpErrCount >= 1 && t.split(/\s+[·]\s+|\s+-\s+/).length > 2)) {
    return "WordPress load failed";
  }
  if (/wordpress api error:\s*(\d+)/i.test(t)) {
    const status = t.match(/wordpress api error:\s*(\d+)/i)?.[1];
    return status ? `WordPress error ${status}` : "WordPress request failed";
  }
  if (lower.includes("serp saved") || lower.includes("brief merged") || lower.includes("research saved")) {
    return "Research saved";
  }
  if (lower.startsWith("research finished") || lower.startsWith("research failed") || lower.startsWith("research ran")) {
    return lower.includes("fail") ? "Research failed" : "Research done";
  }
  if (/https?:\/\//i.test(t)) {
    const stripped = stripNotifyNoise(t);
    if (stripped.length >= 3) return stripped;
    return "Request failed";
  }

  const stripped = stripNotifyNoise(t);
  if (stripped !== t && stripped.length >= 3 && stripped.length <= 40) {
    return stripped;
  }

  if (t.length <= 40) return stripped || t;

  if (lower.includes("inventory") && lower.includes("fail")) return "WordPress inventory failed";
  if (lower.includes("failed")) return "Failed";
  if (lower.includes("saved") || lower.includes("complete") || lower.includes("finished")) return "Done";

  const clipped = (stripped || t).slice(0, 120);
  return clipped;
}

function notifyDisplayTitle(variant: NotifyVariant, main: string): string {
  const t = normalizeNotifyText(main) || main;
  if (variant === "error" || variant === "warning") return t;
  const short = shortNotifyTitle(t);
  return short || t;
}

type Slot = {
  id: string;
  variant: NotifyVariant;
  title: string;
  description?: string;
  updatedAt: number;
};

type HistoryItem = {
  id: string;
  variant: Exclude<NotifyVariant, "loading">;
  title: string;
  description?: string;
  at: number;
};

const HISTORY_CAP = 20;
export const NOTIFICATION_LOG_DISPLAY_CAP = 10;
const EPHEMERAL_KEY = "__ephemeral__";
const DEFAULT_DURATION = 4000;
const DEFAULT_ERROR_DURATION = 6000;

const slots = new Map<string, Slot>();
let history: HistoryItem[] = [];
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function idKey(id: string | number | undefined): string | undefined {
  if (id === undefined || id === null) return undefined;
  return String(id);
}

function emit() {
  listeners.forEach((fn) => fn());
}

function clearTimer(id: string) {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
}

function scheduleDismiss(slotId: string, duration: number) {
  clearTimer(slotId);
  if (!Number.isFinite(duration) || duration <= 0) return;
  const t = setTimeout(() => {
    timers.delete(slotId);
    slots.delete(slotId);
    emit();
  }, duration);
  timers.set(slotId, t);
}

function normalizeTitle(title: string | null | undefined): string {
  if (title == null || title === "") return "";
  return String(title);
}

function pushHistory(variant: Exclude<NotifyVariant, "loading">, title: string, description?: string) {
  const hid = `h-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  history = [{ id: hid, variant, title, description, at: Date.now() }, ...history].slice(0, HISTORY_CAP);
}

function resolveMainAndDescription(
  title: string | null | undefined,
  description: string | undefined
): { main: string; sub?: string } {
  const t = normalizeTitle(title);
  if (t && description) return { main: t, sub: description };
  if (t) return { main: t };
  if (description) return { main: description };
  return { main: "" };
}

function setSlot(
  key: string,
  variant: NotifyVariant,
  main: string,
  sub: string | undefined,
  duration: number | undefined
) {
  const now = Date.now();
  const title = notifyDisplayTitle(variant, main) || main;
  let description: string | undefined;
  if (sub != null) {
    const d = normalizeNotifyDescriptionMultiline(sub);
    description = d !== "" ? d : undefined;
  }
  slots.set(key, {
    id: key,
    variant,
    title,
    description,
    updatedAt: now,
  });
  clearTimer(key);

  if (variant === "loading") return;
  if (duration === Infinity) return;

  const ms =
    duration ??
    (variant === "error" || variant === "warning" ? DEFAULT_ERROR_DURATION : DEFAULT_DURATION);
  scheduleDismiss(key, ms);
}

export function getAppNotificationState(): {
  slots: Slot[];
  history: HistoryItem[];
  primary: Slot | null;
} {
  const list = [...slots.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  const primary = list.find((slot) => slot.variant !== "loading") ?? null;
  return { slots: list, history, primary };
}

export function subscribeAppNotifications(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function flash(
  variant: Exclude<NotifyVariant, "loading">,
  title: string | null | undefined,
  opts?: NotifyOptions,
) {
  const { main, sub } = resolveMainAndDescription(title, opts?.description);
  const m = main || "";
  if (!m && !sub) return;
  const stableId = idKey(opts?.id);
  const fullTitle = normalizeNotifyText(m) || m;
  if (!stableId) {
    pushHistory(
      variant,
      notifyDisplayTitle(variant, fullTitle) || fullTitle,
      sub != null ? normalizeNotifyText(sub) || sub : undefined,
    );
  }

  const key = stableId ?? EPHEMERAL_KEY;
  const duration = opts?.duration;
  setSlot(key, variant, m, sub, duration);
  emit();
}

export const notify = {
  success(title: string | null | undefined, opts?: NotifyOptions) {
    flash("success", title, opts);
  },

  error(title: string | null | undefined, opts?: NotifyOptions) {
    flash("error", title, opts);
  },

  info(title: string | null | undefined, opts?: NotifyOptions) {
    flash("info", title, opts);
  },

  warning(title: string | null | undefined, opts?: NotifyOptions) {
    flash("warning", title, opts);
  },

  message(title: string | null | undefined, opts?: NotifyOptions) {
    flash("default", title, opts);
  },

  loading(title: string | null | undefined, opts?: NotifyOptions): string {
    const { main, sub } = resolveMainAndDescription(title, opts?.description);
    const m = main || "Loading…";
    const stableId = idKey(opts?.id);
    const key = stableId ?? `loading-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setSlot(key, "loading", m, sub, undefined);
    emit();
    return key;
  },

  dismiss(id?: string | number) {
    const key = idKey(id);
    if (key === undefined) {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      slots.clear();
      emit();
      return;
    }
    clearTimer(key);
    slots.delete(key);
    emit();
  },
};

/** Long error text for history/description; header uses short title only. */
export function notifyErrorDetail(err: unknown, fallback?: string): string | undefined {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (typeof err === "string" && err.trim()) return err.trim();
  return fallback;
}

/** Header pill: errors show full title; optional description in console. */
export function notifyHeaderError(
  shortTitle: string,
  detail?: unknown,
  opts?: NotifyOptions
): void {
  const desc = notifyErrorDetail(detail) ?? opts?.description;
  const title = desc && desc !== shortTitle ? `${shortTitle}: ${desc}` : shortTitle;
  if (desc) logger.error(shortTitle, desc);
  notify.error(title, { ...opts, duration: opts?.duration ?? 12000 });
}
