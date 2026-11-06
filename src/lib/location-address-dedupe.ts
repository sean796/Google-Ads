/**
 * Canonical storefront dedupe keys: OpenRouter chat completions only (`getResearchModel`).
 * No RegExp-based address normalization. If the model response is not valid JSON, keys fall back to trimmed strings.
 */
import { loadApiKey } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";


function keysFromModelContent(content: string, n: number): string[] | null {
  const t = content.trim();
  try {
    const parsed = JSON.parse(t);
    return Array.isArray(parsed) && parsed.length === n ? (parsed as string[]) : null;
  } catch {
    return null;
  }
}

function passThroughKeys(lines: string[]): string[] {
  return lines.map((l) => l.trim());
}

async function aiKeys(lines: string[], siteId?: string, apiKeyOverride?: string): Promise<string[]> {
  if (lines.length === 0) return [];
  const apiKey = (apiKeyOverride ?? loadApiKey()).trim();
  if (!apiKey) return passThroughKeys(lines);
  try {
    const res = await postOpenRouterAppChatFetch({
      method: "POST",
      body: JSON.stringify({
        model: getResearchModel(siteId),
        messages: [
          {
            role: "system",
            content:
              "Reply with exactly one JSON array of strings and nothing else. No markdown fences, no commentary. The array length must equal the number of numbered address lines. Each string is one canonical dedupe key for that physical storefront; same real-world location must share the same string.",
          },
          { role: "user", content: lines.map((a, i) => `${i + 1}. ${a}`).join("\n") },
        ],
        temperature: 0,
        max_tokens: 8192,
        stream: false,
      }),
    });
    const j = await res.json();
    const content = j.choices?.[0]?.message?.content;
    if (typeof content !== "string") return passThroughKeys(lines);
    const keys = keysFromModelContent(content, lines.length);
    return keys ?? passThroughKeys(lines);
  } catch {
    return passThroughKeys(lines);
  }
}

export async function normalizeStreetLocationKey(
  s: string,
  siteId?: string,
  apiKeyOverride?: string
): Promise<string> {
  const t = s.trim();
  if (!t) return "";
  return (await aiKeys([t], siteId, apiKeyOverride))[0];
}

/** Same research-model keying as Find location; use for CSV / other callers that need batched keys. */
export async function researchAddressKeys(
  lines: string[],
  siteId?: string,
  apiKeyOverride?: string
): Promise<string[]> {
  return aiKeys(lines, siteId, apiKeyOverride);
}

export interface UniqueSiteLocation {
  key: string;
  displayAddress: string;
  hrefs: string[];
  name?: string | null;
}

function pickLongerDisplay(a: string, b: string): string {
  const x = a.trim();
  const y = b.trim();
  return y.length > x.length ? y : x;
}

function firstSegmentHasDigit(s: string): boolean {
  const head = (s.split(",")[0] || s).trim();
  for (let i = 0; i < head.length; i++) {
    const c = head.charCodeAt(i);
    if (c >= 48 && c <= 57) return true;
  }
  return false;
}

export function mergeAddressLineForUi(
  displayAddress: string,
  napLine: string | null | undefined,
  napKey: string | null,
  rowKey: string,
  locationCount: number
): string {
  const d = displayAddress.trim();
  const n = napLine?.trim();
  if (!n) return d;
  if (!d) return n;
  if (napKey && napKey === rowKey) return pickLongerDisplay(d, n);
  if (locationCount === 1 && firstSegmentHasDigit(n) && !firstSegmentHasDigit(d)) return n;
  return d;
}

export function resolveRadiusDisplayLine(
  displayAddress: string,
  napLine: string | null | undefined,
  areaFallback: string | null | undefined,
  cityStateFallback: string | null | undefined,
  napKey: string | null,
  rowKey: string,
  locationCount: number
): string {
  const merged = mergeAddressLineForUi(displayAddress, napLine, napKey, rowKey, locationCount);
  const m = merged.trim();
  if (firstSegmentHasDigit(m)) return m;
  const area = areaFallback?.trim();
  if (area) return area;
  if (m) return m;
  return cityStateFallback?.trim() || "";
}

export async function buildUniqueSiteLocations(
  discoveryAddresses: { label: string; name: string | null }[],
  enrichedPages: { href: string; address: string | null }[],
  extraDiscoveryLabels: string[] | undefined,
  siteId?: string,
  apiKeyOverride?: string
): Promise<UniqueSiteLocation[]> {
  const ordered: string[] = [];
  for (const a of discoveryAddresses) {
    const label = a.label?.trim();
    if (label) ordered.push(label);
  }
  for (const raw of extraDiscoveryLabels ?? []) {
    const label = raw?.trim();
    if (label) ordered.push(label);
  }
  for (const p of enrichedPages) {
    const addr = p.address?.trim();
    if (addr && p.href?.trim()) ordered.push(addr);
  }
  const unique = [...new Set(ordered)];
  const keys = unique.length ? await aiKeys(unique, siteId, apiKeyOverride) : [];
  const keyOf = (addr: string) => keys[unique.indexOf(addr)];

  const map = new Map<string, UniqueSiteLocation>();

  for (const a of discoveryAddresses) {
    const label = a.label?.trim();
    if (!label) continue;
    const key = keyOf(label);
    if (!key) continue;
    const existing = map.get(key);
    if (existing) {
      existing.displayAddress = pickLongerDisplay(existing.displayAddress, label);
      if (a.name && !existing.name) existing.name = a.name;
    } else {
      map.set(key, { key, displayAddress: label, hrefs: [], name: a.name });
    }
  }

  for (const raw of extraDiscoveryLabels ?? []) {
    const label = raw?.trim();
    if (!label) continue;
    const key = keyOf(label);
    if (!key || map.has(key)) continue;
    map.set(key, { key, displayAddress: label, hrefs: [], name: null });
  }

  for (const p of enrichedPages) {
    const addr = p.address?.trim();
    if (!addr || !p.href?.trim()) continue;
    const key = keyOf(addr);
    if (!key) continue;
    const existing = map.get(key);
    if (existing) {
      existing.displayAddress = pickLongerDisplay(existing.displayAddress, addr);
      if (!existing.hrefs.includes(p.href)) existing.hrefs.push(p.href);
    } else {
      map.set(key, { key, displayAddress: addr, hrefs: [p.href], name: null });
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.displayAddress.localeCompare(b.displayAddress, undefined, { sensitivity: "base" })
  );
}
