import {
  PROFILE_BRAND_NAMING_FILENAME,
  profileMasterRuleSourcesForSite,
} from "@/lib/profile-master-rules";
import type {
  MasterInstructionSource,
  MasterInstructionsPayload,
} from "@/lib/master-instructions-storage-types";

const STORAGE_KEY_PREFIX = "neo_pulse_wp_master_instructions_";
const NEO_PULSE_MASTER_INSTRUCTIONS_CHANGED_EVENT = "neo-pulse-master-instructions-changed";
const profileMasterRulesSeededSiteIds = new Set<string>();

function notifyProfileMasterRulesChanged(siteId: string): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(
    new CustomEvent(NEO_PULSE_MASTER_INSTRUCTIONS_CHANGED_EVENT, { detail: { siteId } }),
  );
}

function emptyPayload(): MasterInstructionsPayload {
  return { sources: [] };
}

const TRIPLE_BLOCK_HINT =
  "Format: nested semantic triples. Each block: line [Subject], then predicate<TAB>object. Repeated predicates under one subject should be one line with object = item1; item2; item3 (semicolon-separated lists). \"# \" lines = section headers. Legacy flat subject<TAB>predicate<TAB>object may appear in old saves.";

const GBP_ADDRESS_JSON_HINT =
  "Format: GBP address JSON for client grounding (business name, address, city, region, phone, coordinates).";

function joinSources(sources: MasterInstructionSource[]): string {
  return sources
    .map((s) => {
      const body = typeof s.content === "string" ? s.content : "";
      const head = `=== FILE: ${s.name} ===\n`;
      if (s.kind === "semantic-triples") {
        return `${head}${TRIPLE_BLOCK_HINT}\n\n${body}\n`;
      }
      if (s.kind === "gbp-address-json") {
        return `${head}${GBP_ADDRESS_JSON_HINT}\n\n${body}\n`;
      }
      return `${head}${body}\n`;
    })
    .join("\n");
}

/** Normalize sources for persistence (no content truncation). */
function normalizeSources(sources: MasterInstructionSource[]): MasterInstructionSource[] {
  return sources.map((s) => {
    const name = s.name.slice(0, 240);
    const row: MasterInstructionSource = {
      name,
      content: s.content,
      uploadedAt: s.uploadedAt,
    };
    if (s.kind === "pdf-summary") row.kind = "pdf-summary";
    if (s.kind === "openrouter-section-summary") row.kind = "openrouter-section-summary";
    if (s.kind === "semantic-triples") row.kind = "semantic-triples";
    if (s.kind === "gbp-address-json") row.kind = "gbp-address-json";
    if (typeof s.originalExtractedChars === "number") {
      row.originalExtractedChars = s.originalExtractedChars;
    }
    return row;
  });
}

/** Migrate legacy `{ text, files }` shape or loose API rows. */
function migrateRaw(parsed: unknown): MasterInstructionsPayload {
  if (!parsed || typeof parsed !== "object") return emptyPayload();
  const o = parsed as Record<string, unknown>;
  if (Array.isArray(o.sources)) {
    const sources = o.sources
      .filter(
        (x): x is MasterInstructionSource =>
          x &&
          typeof x === "object" &&
          typeof (x as MasterInstructionSource).name === "string" &&
          typeof (x as MasterInstructionSource).content === "string" &&
          typeof (x as MasterInstructionSource).uploadedAt === "number",
      )
      .map((s) => {
        const row: MasterInstructionSource = {
          name: s.name,
          content: s.content,
          uploadedAt: s.uploadedAt,
        };
        if (s.kind === "pdf-summary") row.kind = "pdf-summary";
        if (s.kind === "openrouter-section-summary") row.kind = "openrouter-section-summary";
        if (s.kind === "semantic-triples") row.kind = "semantic-triples";
        if (s.kind === "gbp-address-json") row.kind = "gbp-address-json";
        if (typeof s.originalExtractedChars === "number") {
          row.originalExtractedChars = s.originalExtractedChars;
        }
        return row;
      });
    return { sources: normalizeSources(sources) };
  }
  const text = typeof o.text === "string" ? o.text.trim() : "";
  if (text) {
    return {
      sources: normalizeSources([
        {
          name: "Imported instructions",
          content: text,
          uploadedAt: Date.now(),
        },
      ]),
    };
  }
  return emptyPayload();
}

function storageKey(siteId: string): string {
  return `${STORAGE_KEY_PREFIX}${siteId}`;
}

function readFromLocalStorage(siteId: string): MasterInstructionsPayload {
  if (typeof window === "undefined") return emptyPayload();
  try {
    const raw = localStorage.getItem(storageKey(siteId));
    if (!raw) return emptyPayload();
    return migrateRaw(JSON.parse(raw));
  } catch {
    return emptyPayload();
  }
}

function writeToLocalStorage(siteId: string, data: MasterInstructionsPayload): void {
  if (typeof window === "undefined") return;
  const normalized = { sources: normalizeSources(data.sources) };
  localStorage.setItem(storageKey(siteId), JSON.stringify(normalized));
}

/** In-memory override (unit tests only). */
const memoryBySite = new Map<string, MasterInstructionsPayload>();

/** Clears in-memory test overrides (e.g. on logout). Does not wipe localStorage. */
export function clearAllMasterInstructionsMemory(): void {
  memoryBySite.clear();
}

/** @internal Unit tests: seed cache without localStorage. */
export function seedMasterInstructionsForTests(siteId: string, payload: MasterInstructionsPayload): void {
  memoryBySite.set(siteId, { sources: normalizeSources(payload.sources) });
}

/** @internal Unit tests */
export function clearMasterInstructionsTestCache(): void {
  clearAllMasterInstructionsMemory();
  profileMasterRulesSeededSiteIds.clear();
}

/** No-op with local persistence (kept for callers). */
export function invalidateMasterInstructionsCache(_siteId: string): void {
  /* localStorage is source of truth */
}

/**
 * Loads per-site master instructions from browser localStorage.
 * @deprecated Name retained for callers; no cloud fetch.
 */
export async function loadMasterInstructionsFromCloud(siteId: string): Promise<MasterInstructionsPayload> {
  return getMasterInstructionsPayload(siteId);
}

/** No-op: localStorage reads are synchronous. */
export async function ensureMasterInstructionsInMemory(_siteId: string | null | undefined): Promise<void> {
  /* local reads need no prefetch */
}

function readMasterInstructionsPayloadRaw(siteId: string): MasterInstructionsPayload {
  const mem = memoryBySite.get(siteId);
  if (mem) return mem;
  return readFromLocalStorage(siteId);
}

/** @internal Sync persist for profile rule seeding. */
export function persistMasterInstructionsPayload(siteId: string, data: MasterInstructionsPayload): void {
  writeToLocalStorage(siteId, { sources: normalizeSources(data.sources) });
  memoryBySite.delete(siteId);
}

function withProfileMasterRules(siteId: string, payload: MasterInstructionsPayload): MasterInstructionsPayload {
  const profileSources = profileMasterRuleSourcesForSite({ siteId });
  if (!profileSources.length) return payload;

  const canonical = profileSources[0];
  if (!canonical) return payload;

  const existingIndex = payload.sources.findIndex((s) => s.name === PROFILE_BRAND_NAMING_FILENAME);
  if (existingIndex >= 0) {
    const existing = payload.sources[existingIndex]!;
    if (existing.content.trim() === canonical.content.trim()) return payload;
    const nextSources = [...payload.sources];
    nextSources[existingIndex] = { ...canonical, uploadedAt: Date.now() };
    const next = { sources: nextSources };
    persistMasterInstructionsPayload(siteId, next);
    notifyProfileMasterRulesChanged(siteId);
    return next;
  }

  const next = { sources: [...payload.sources, canonical] };
  if (!profileMasterRulesSeededSiteIds.has(siteId)) {
    profileMasterRulesSeededSiteIds.add(siteId);
    persistMasterInstructionsPayload(siteId, next);
    notifyProfileMasterRulesChanged(siteId);
  }
  return next;
}

export function getMasterInstructionsPayload(siteId: string | undefined | null): MasterInstructionsPayload {
  if (!siteId || typeof window === "undefined") return emptyPayload();
  return withProfileMasterRules(siteId, readMasterInstructionsPayloadRaw(siteId));
}

export function getMasterInstructionsText(siteId: string | undefined | null): string {
  const { sources } = getMasterInstructionsPayload(siteId);
  if (sources.length === 0) return "";
  return joinSources(sources);
}

export async function setMasterInstructions(siteId: string, data: MasterInstructionsPayload): Promise<void> {
  if (typeof window === "undefined") return;
  const normalized = { sources: normalizeSources(data.sources) };
  try {
    writeToLocalStorage(siteId, normalized);
    memoryBySite.delete(siteId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[MasterInstructions] Failed to save:", e);
    throw new Error(msg || "Failed to save master instructions");
  }
}

export async function clearMasterInstructions(siteId: string): Promise<void> {
  if (typeof window === "undefined") return;
  localStorage.removeItem(storageKey(siteId));
  memoryBySite.delete(siteId);
}
