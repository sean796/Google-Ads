import {
  appendMasterInstructionsToSystemPrompt,
  ensureMasterInstructionsInMemory,
} from "@/lib/master-instructions-storage";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";

const SYS_VALIDATE = `You classify one English Wikipedia page for local SEO entity mapping.

Output **only** valid JSON:
{"kind":"neighbourhood"|"district"|"city"|"disambiguation"|"other","matchesExpectedCity":true|false}

kind:
- neighbourhood — residential neighbourhood, suburb, or named community within a city
- district — urban district / borough / named area within a city (same treatment as neighbourhood for SAP)
- city — whole-city or municipality article
- disambiguation — surname, given-name, "may refer to", or other mix of unrelated topics
- other — person, company, ship, media, non-geographic topic, wrong place type, law enforcement HQ, jail, courthouse, fire department as an organization, abstract concept

matchesExpectedCity: true only when the page is clearly about a place in \`expectedCity\` (and \`expectedRegion\` when the intro gives a region). False for wrong cities, national lists, or person/disambiguation pages.`;

export type WikiPlaceKind =
  | "neighbourhood"
  | "district"
  | "city"
  | "disambiguation"
  | "other";

export type WikiPlaceValidation = {
  kind: WikiPlaceKind;
  matchesExpectedCity: boolean;
};

export type WikiPlaceValidationTier = "neighbourhood" | "city";

export type ValidateWikipediaPlacePageParams = {
  apiKey: string;
  model?: string;
  siteId?: string;
  entity: string;
  candidateTitle: string;
  resolvedTitle: string;
  expectedCity: string;
  expectedRegion?: string;
  intro: string;
};

const KIND_SET = new Set<string>([
  "neighbourhood",
  "district",
  "city",
  "disambiguation",
  "other",
]);

const memo = new Map<string, WikiPlaceValidation>();

function memoKey(resolvedTitle: string, expectedCity: string): string {
  return `${resolvedTitle.trim().toLowerCase()}|${expectedCity.trim().toLowerCase()}`;
}

/** Pure acceptance rule for neighbourhood vs city candidate tiers. */
export function isAcceptedWikiPlaceValidation(
  result: WikiPlaceValidation | null | undefined,
  tier: WikiPlaceValidationTier,
): boolean {
  if (!result || !result.matchesExpectedCity) return false;
  if (tier === "neighbourhood") {
    return result.kind === "neighbourhood" || result.kind === "district";
  }
  return result.kind === "city";
}

function parseValidation(raw: string): WikiPlaceValidation | null {
  try {
    const parsed = JSON.parse(raw) as {
      kind?: unknown;
      matchesExpectedCity?: unknown;
    };
    const kind = String(parsed.kind ?? "")
      .trim()
      .toLowerCase();
    if (!KIND_SET.has(kind)) return null;
    return {
      kind: kind as WikiPlaceKind,
      matchesExpectedCity: parsed.matchesExpectedCity === true,
    };
  } catch {
    return null;
  }
}

/**
 * OpenRouter: is this Wikipedia intro a neighbourhood/district/city page in the expected grid city?
 * Returns null on network/parse failure (caller must not accept the candidate).
 */
export async function validateWikipediaPlacePage(
  params: ValidateWikipediaPlacePageParams,
): Promise<WikiPlaceValidation | null> {
  const apiKey = params.apiKey.trim();
  const expectedCity = params.expectedCity.trim();
  const resolvedTitle = params.resolvedTitle.trim();
  const intro = params.intro.trim();
  if (!apiKey || !expectedCity || !resolvedTitle) return null;

  const key = memoKey(resolvedTitle, expectedCity);
  const cached = memo.get(key);
  if (cached) return cached;

  if (!intro) return null;

  await ensureMasterInstructionsInMemory(params.siteId);
  const model = params.model?.trim() || getResearchModel(params.siteId);
  const system = appendMasterInstructionsToSystemPrompt(SYS_VALIDATE, params.siteId ?? null);
  const user = JSON.stringify({
    entity: params.entity.trim(),
    candidateTitle: params.candidateTitle.trim(),
    resolvedTitle,
    expectedCity,
    expectedRegion: (params.expectedRegion ?? "").trim(),
    intro: intro.slice(0, 600),
  });

  try {
    const res = await postOpenRouterAppChatFetch( {
      method: "POST",
      headers: openRouterWebAppHeaders(apiKey),
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.1,
        max_tokens: 120,
        response_format: { type: "json_object" },
        stream: false,
      }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = j.choices?.[0]?.message?.content ?? "";
    const result = parseValidation(raw.trim());
    if (!result) return null;
    memo.set(key, result);
    return result;
  } catch {
    return null;
  }
}

/** Test-only: clear memo between cases. */
export function clearWikipediaPlacePageValidationMemo(): void {
  memo.clear();
}
