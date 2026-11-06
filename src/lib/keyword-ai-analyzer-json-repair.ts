import type { KeywordAIAnalysis } from "./keyword-types";

/** Gemini 2.5 Flash Lite has a massive context window; use 1M max output so truncation is never an issue. */
export const RESEARCH_MODEL_MAX_TOKENS = 1_000_000;

function stripToLikelyJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function removeTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, "$1");
}

function tryCloseUnbalancedBrackets(text: string): string {
  // Best-effort: append missing closers at end, ignoring brackets inside JSON strings.
  let inString = false;
  let escape = false;
  const stack: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
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
  return text + suffix;
}

function tryFixMissingArrayCloseBeforeKey(text: string, key: string): { fixed: string; applied: boolean } {
  // If the model forgets to close an array before emitting the next key, this heuristic inserts `],`
  // Example broken:  ... }\n  },\n  "peopleAlsoAsk":
  // Desired:       ... }\n  ],\n  "peopleAlsoAsk":
  const re = new RegExp(`\\n\\s*},\\s*\\n\\s*\\"${key}\\"\\s*:`, "m");
  if (!re.test(text)) return { fixed: text, applied: false };
  return { fixed: text.replace(re, `\n  ],\n  "${key}":`), applied: true };
}

export function tryParseKeywordAnalysisJson(cleanedResponse: string): {
  parsed: KeywordAIAnalysis;
  usedRepair: boolean;
  repairSteps: string[];
} {
  try {
    return { parsed: JSON.parse(cleanedResponse) as KeywordAIAnalysis, usedRepair: false, repairSteps: [] };
  } catch {
    // fall through to repair attempts
  }

  let working = cleanedResponse;
  const steps: string[] = [];

  const stripped = stripToLikelyJsonObject(working);
  if (stripped !== working) {
    working = stripped;
    steps.push("stripToLikelyJsonObject");
  }

  const noTrailing = removeTrailingCommas(working);
  if (noTrailing !== working) {
    working = noTrailing;
    steps.push("removeTrailingCommas");
  }

  // Targeted fix based on observed runtime error context
  const fixPAA = tryFixMissingArrayCloseBeforeKey(working, "peopleAlsoAsk");
  if (fixPAA.applied) {
    working = fixPAA.fixed;
    steps.push("insertMissingArrayCloseBefore_peopleAlsoAsk");
  }

  const closed = tryCloseUnbalancedBrackets(working);
  if (closed !== working) {
    working = closed;
    steps.push("tryCloseUnbalancedBrackets");
  }

  return { parsed: JSON.parse(working) as KeywordAIAnalysis, usedRepair: true, repairSteps: steps };
}
