/**
 * Removes trailing commas before `}` or `]` - LLMs often emit invalid JSON this way
 * ("Expected ',' or ']' after array element" / similar).
 */
export function stripTrailingCommasInJsonText(s: string): string {
  let prev = "";
  let cur = s;
  while (cur !== prev) {
    prev = cur;
    cur = cur.replace(/,(\s*[}\]])/g, "$1");
  }
  return cur;
}

/**
 * Inserts missing commas between adjacent JSON string literals (`"a" "b"` → `"a","b"`).
 * Fixes "Expected ',' or ']' after array element" when the model omits a comma between members.
 */
export function insertCommasBetweenAdjacentJsonStringLiterals(s: string): string {
  let prev = "";
  let cur = s;
  while (cur !== prev) {
    prev = cur;
    cur = cur.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"\s+"([^"\\]*(?:\\.[^"\\]*)*)"/g, '"$1","$2"');
  }
  return cur;
}

function repairLlmJsonText(s: string): string {
  return stripTrailingCommasInJsonText(insertCommasBetweenAdjacentJsonStringLiterals(s));
}

/**
 * First top-level JSON value (object or array) by brace depth, respecting strings and escapes.
 * Use when the model returns valid JSON followed by extra text ("Unexpected non-whitespace after JSON").
 * A naive `indexOf`/`lastIndexOf` slice breaks when a string value contains `}`.
 */
export function extractFirstBalancedJsonValue(s: string): string | null {
  const t = s;
  const start = t.search(/[[{]/);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i]!;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{" || c === "[") depth++;
    if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return t.slice(start, i + 1);
    }
  }
  return null;
}

function tryParseWithRepairs(tryParse: (raw: string) => unknown, raw: string): unknown | null {
  try {
    return tryParse(raw);
  } catch {
    /* continue */
  }
  try {
    return tryParse(stripTrailingCommasInJsonText(raw));
  } catch {
    /* continue */
  }
  try {
    return tryParse(insertCommasBetweenAdjacentJsonStringLiterals(raw));
  } catch {
    /* continue */
  }
  try {
    return tryParse(repairLlmJsonText(raw));
  } catch {
    /* continue */
  }
  return null;
}

/** Strips optional ```json fences from model output before JSON.parse. */
export function parseAssistantJsonObject(content: string): unknown {
  let t = content.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/m, "").trim();
  }

  const tryParse = (raw: string): unknown => JSON.parse(raw) as unknown;

  let firstErr: unknown;
  try {
    return tryParse(t);
  } catch (e) {
    firstErr = e;
  }

  const balanced = extractFirstBalancedJsonValue(t);
  if (balanced) {
    const got = tryParseWithRepairs(tryParse, balanced);
    if (got !== null) return got;
  }

  {
    const got = tryParseWithRepairs(tryParse, t);
    if (got !== null) return got;
  }

  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first >= 0 && last > first) {
    const slice = t.slice(first, last + 1);
    const got = tryParseWithRepairs(tryParse, slice);
    if (got !== null) return got;
  }

  throw firstErr instanceof Error ? firstErr : new Error(String(firstErr));
}

/** Same repairs as {@link parseAssistantJsonObject} but returns null instead of throwing. */
export function tryParseAssistantJsonObject(content: string): unknown | null {
  try {
    return parseAssistantJsonObject(content);
  } catch {
    return null;
  }
}

export function jsonObjectFromOpenRouterChatResult(result: {
  content: string;
  parsed?: Record<string, unknown>;
}): unknown | null {
  if (result.parsed && typeof result.parsed === "object" && !Array.isArray(result.parsed)) {
    return result.parsed;
  }
  const trimmed = result.content.trim();
  if (!trimmed) return null;
  return tryParseAssistantJsonObject(trimmed);
}
