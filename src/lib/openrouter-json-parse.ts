/** Salvage JSON objects/arrays from OpenRouter text (markdown fences, trailing prose, minor breaks). */

export function stripMarkdownCodeFence(text: string): string {
  let t = text.trim();
  if (t.startsWith("```json")) {
    t = t.replace(/^```json\s*/i, "").replace(/\s*```\s*$/i, "");
  } else if (t.startsWith("```")) {
    t = t.replace(/^```\s*/i, "").replace(/\s*```\s*$/i, "");
  }
  return t.trim();
}

export function findJsonValueSpan(text: string, fromIndex = 0): { start: number; end: number } | null {
  const s = text;
  for (let i = fromIndex; i < s.length; i++) {
    const ch = s[i];
    if (ch !== "{" && ch !== "[") continue;
    const end = jsonValueEndIndex(s, i);
    if (end >= 0) return { start: i, end: end + 1 };
  }
  return null;
}

function jsonValueEndIndex(s: string, start: number): number {
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") {
      const expected = stack.pop();
      if (expected !== ch) return -1;
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

export function sliceFirstJsonValue(text: string): string {
  const cleaned = stripMarkdownCodeFence(text);
  const span = findJsonValueSpan(cleaned);
  if (span) return cleaned.slice(span.start, span.end);
  return cleaned;
}

export function sliceLastJsonValue(text: string): string {
  const cleaned = stripMarkdownCodeFence(text);
  let last: { start: number; end: number } | null = null;
  let from = 0;
  while (from < cleaned.length) {
    const span = findJsonValueSpan(cleaned, from);
    if (!span) break;
    last = span;
    from = span.end;
  }
  if (last) return cleaned.slice(last.start, last.end);
  return cleaned;
}

function removeTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, "$1");
}

function tryCloseUnbalancedBrackets(text: string): string {
  let inString = false;
  let escape = false;
  const stack: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") stack.push(ch);
    if (ch === "}" || ch === "]") {
      const last = stack[stack.length - 1];
      if ((ch === "}" && last === "{") || (ch === "]" && last === "[")) stack.pop();
    }
  }
  if (stack.length === 0) return text;
  let suffix = "";
  for (let i = stack.length - 1; i >= 0; i--) {
    suffix += stack[i] === "{" ? "}" : "]";
  }
  if (inString) suffix = `"${suffix}`;
  return text + suffix;
}

export function parseOpenRouterJsonContent<T>(content: string, step: string): T {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error(`${step}: OpenRouter returned empty content`);
  }

  const candidates = [
    sliceFirstJsonValue(trimmed),
    sliceLastJsonValue(trimmed),
    trimmed,
  ].filter((value, index, arr) => value && arr.indexOf(value) === index);

  let lastError: unknown;
  for (const base of candidates) {
    const working = base;
    const attempts = [working, removeTrailingCommas(working), tryCloseUnbalancedBrackets(working)];
    const closed = tryCloseUnbalancedBrackets(removeTrailingCommas(working));
    if (!attempts.includes(closed)) attempts.push(closed);

    for (const attempt of attempts) {
      try {
        return JSON.parse(attempt) as T;
      } catch (err) {
        lastError = err;
      }
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${step}: invalid JSON from OpenRouter (${msg})`);
}
