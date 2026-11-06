/**
 * Universal JSON Repair Utility
 * Handles malformed JSON from AI responses with comprehensive repair strategies
 * Used across all AI response parsing to prevent JSON parse errors
 */

/**
 * Strips text to extract the likely JSON object/array
 */
export function stripToLikelyJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  
  // Also try arrays
  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) return text.slice(arrayStart, arrayEnd + 1);
  
  return text;
}

/**
 * Removes trailing commas before closing brackets/braces
 */
export function removeTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, "$1");
}

/**
 * Attempts to close unbalanced brackets and braces
 * Tracks bracket/brace depth and appends missing closers
 */
export function tryCloseUnbalancedBrackets(text: string): string {
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
    if (ch === "{" || ch === "[") {
      stack.push(ch);
    }
    if (ch === "}" || ch === "]") {
      const last = stack[stack.length - 1];
      if ((ch === "}" && last === "{") || (ch === "]" && last === "[")) {
        stack.pop();
      }
    }
  }
  
  if (stack.length === 0) return text;
  
  let suffix = "";
  for (let i = stack.length - 1; i >= 0; i--) {
    suffix += stack[i] === "{" ? "}" : "]";
  }
  return text + suffix;
}

/**
 * Fixes missing array close before a specific key
 * Handles cases where AI forgets to close an array before starting a new key
 */
export function tryFixMissingArrayCloseBeforeKey(
  text: string,
  key: string
): { fixed: string; applied: boolean } {
  const re = new RegExp(`\\n\\s*},\\s*\\n\\s*\\"${key}\\"\\s*:`, "m");
  if (!re.test(text)) return { fixed: text, applied: false };
  return { fixed: text.replace(re, `\n  ],\n  "${key}":`), applied: true };
}

/**
 * Removes extra/misplaced closing brackets and braces
 * Handles cases like ]] or }} that appear incorrectly before property names
 */
export function tryRemoveExtraBrackets(text: string): string {
  // Pattern 1: Double closing brackets/braces like ]] or }} followed by newline and quote
  // Example: {\n  ]]\n  "key": ... should be {\n  ]\n  "key": ...
  text = text.replace(/(\])\s*\]\s*(\n\s*")/g, '$1$2');
  text = text.replace(/(\})\s*\}\s*(\n\s*")/g, '$1$2');
  
  // Pattern 2: Closing bracket/brace immediately followed by quote (should have comma or be removed)
  // Example: ]"key": should be ], "key": or removed if it's extra
  // But be careful - this might be valid in some cases, so only fix obvious errors
  text = text.replace(/\]\s*\]\s*(\s*")/g, ']$1'); // Remove extra ] before quote
  text = text.replace(/\}\s*\}\s*(\s*")/g, '}$1'); // Remove extra } before quote
  
  // Pattern 3: Track bracket balance and remove extras
  let inString = false;
  let escape = false;
  const bracketStack: Array<{ type: '{' | '['; pos: number }> = [];
  const toRemove: number[] = []; // Positions of extra brackets to remove
  
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
    
    if (ch === "{" || ch === "[") {
      bracketStack.push({ type: ch as '{' | '[', pos: i });
    } else if (ch === "}" || ch === "]") {
      const expectedType = ch === "}" ? "{" : "[";
      const lastBracket = bracketStack[bracketStack.length - 1];
      
      if (lastBracket && lastBracket.type === expectedType) {
        bracketStack.pop();
      } else {
        // Extra closing bracket - check context
        const prevChar = i > 0 ? text[i - 1] : '';
        const nextChars = text.substring(i, Math.min(i + 10, text.length));
        
        // If it's a double bracket (]] or }}) and followed by newline+quote, remove one
        if (prevChar === ch && /^\s*\]\s*\n\s*"/.test(nextChars)) {
          toRemove.push(i);
        } else if (bracketStack.length === 0 && /^\s*\]\s*\n\s*"/.test(nextChars)) {
          // Closing bracket with no matching opener, followed by quote - likely extra
          toRemove.push(i);
        }
      }
    }
  }
  
  // Remove extra brackets in reverse order to preserve indices
  let result = text;
  for (let i = toRemove.length - 1; i >= 0; i--) {
    result = result.slice(0, toRemove[i]) + result.slice(toRemove[i] + 1);
  }
  
  return result;
}

/**
 * Fixes malformed array elements (missing commas, incomplete elements)
 */
export function tryFixMalformedArrayElements(text: string): string {
  // Fix missing commas between array elements
  // Pattern: ]" or }" followed by " (new element)
  text = text.replace(/\]\s*"/g, '], "');
  text = text.replace(/\}\s*"/g, '}, "');
  
  // Fix patterns like ]] or }} that appear incorrectly
  // Pattern: ]] followed by space/newline and quote (should be just ])
  text = text.replace(/\]\s*\]\s*(\n\s*")/g, ']$1');
  text = text.replace(/\}\s*\}\s*(\n\s*")/g, '}$1');
  
  // Fix incomplete array elements (missing closing bracket/brace)
  // Pattern: "key": [ ... "value" without closing ]
  // This is a heuristic - try to close incomplete arrays
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastOpenBracket = -1;
  
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
    if (ch === "[") {
      if (depth === 0) lastOpenBracket = i;
      depth++;
    }
    if (ch === "]") {
      depth--;
      if (depth === 0) lastOpenBracket = -1;
    }
  }
  
  // If we have an unclosed array, try to close it before the next key
  if (depth > 0 && lastOpenBracket >= 0) {
    // Find the next key after the unclosed array
    const afterArray = text.substring(lastOpenBracket);
    const nextKeyMatch = afterArray.match(/[^"]"([^"]+)":/);
    if (nextKeyMatch) {
      const insertPos = lastOpenBracket + afterArray.indexOf(nextKeyMatch[0]);
      // Insert closing brackets before the key
      const closingBrackets = "]".repeat(depth);
      text = text.slice(0, insertPos) + closingBrackets + text.slice(insertPos);
    }
  }
  
  return text;
}

/**
 * Universal JSON repair function
 * Attempts multiple repair strategies to fix malformed JSON
 */
export function repairJson(
  text: string,
  options: {
    targetKeys?: string[]; // Keys that might need array close fixes
  } = {}
): {
  repaired: string;
  repairSteps: string[];
  success: boolean;
} {
  const steps: string[] = [];
  let working = text;

  // Step 1: Try direct parse first
  try {
    JSON.parse(working);
    return { repaired: working, repairSteps: [], success: true };
  } catch {
    // Continue with repairs
  }

  // Step 2: Strip to likely JSON object
  const stripped = stripToLikelyJsonObject(working);
  if (stripped !== working) {
    working = stripped;
    steps.push("stripToLikelyJsonObject");
    try {
      JSON.parse(working);
      return { repaired: working, repairSteps: steps, success: true };
    } catch {
      // Continue
    }
  }

  // Step 3: Remove trailing commas
  const noTrailing = removeTrailingCommas(working);
  if (noTrailing !== working) {
    working = noTrailing;
    steps.push("removeTrailingCommas");
    try {
      JSON.parse(working);
      return { repaired: working, repairSteps: steps, success: true };
    } catch {
      // Continue
    }
  }

  // Step 4: Remove extra/misplaced brackets (like ]] or }})
  const removedExtra = tryRemoveExtraBrackets(working);
  if (removedExtra !== working) {
    working = removedExtra;
    steps.push("tryRemoveExtraBrackets");
    try {
      JSON.parse(working);
      return { repaired: working, repairSteps: steps, success: true };
    } catch {
      // Continue
    }
  }

  // Step 5: Fix malformed array elements
  const fixedArrays = tryFixMalformedArrayElements(working);
  if (fixedArrays !== working) {
    working = fixedArrays;
    steps.push("tryFixMalformedArrayElements");
    try {
      JSON.parse(working);
      return { repaired: working, repairSteps: steps, success: true };
    } catch {
      // Continue
    }
  }

  // Step 6: Fix missing array closes before specific keys
  if (options.targetKeys) {
    for (const key of options.targetKeys) {
      const fixResult = tryFixMissingArrayCloseBeforeKey(working, key);
      if (fixResult.applied) {
        working = fixResult.fixed;
        steps.push(`insertMissingArrayCloseBefore_${key}`);
        try {
          JSON.parse(working);
          return { repaired: working, repairSteps: steps, success: true };
        } catch {
          // Continue
        }
      }
    }
  }

  // Step 7: Close unbalanced brackets
  const closed = tryCloseUnbalancedBrackets(working);
  if (closed !== working) {
    working = closed;
    steps.push("tryCloseUnbalancedBrackets");
    try {
      JSON.parse(working);
      return { repaired: working, repairSteps: steps, success: true };
    } catch {
      // Continue
    }
  }

  // If all repairs failed, return the best attempt
  return { repaired: working, repairSteps: steps, success: false };
}

/** Strip optional ```json fences only; does not slice or mutate JSON body. */
export function unwrapJsonMarkdownFence(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```\s*$/i, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/i, "").replace(/\s*```\s*$/i, "");
  }
  return cleaned.trim();
}

/** One JSON.parse after fence strip. Bulk/CSV: no repair, truncation, or bracket closing. */
export function parseJsonStrict<T = unknown>(text: string): T {
  const cleaned = unwrapJsonMarkdownFence(text);
  return JSON.parse(cleaned) as T;
}

/**
 * Parse JSON with automatic repair
 * Returns parsed object and repair information
 */
export type ParseJsonWithRepairFailureMode = "throw" | "storeRaw";

export type ParseJsonWithRepairOptions<T = unknown> = {
  targetKeys?: string[];
  fallback?: T;
  /** When `storeRaw`, failed parse returns full `rawText` and `parsed: null` instead of throwing. */
  onParseFailure?: ParseJsonWithRepairFailureMode;
};

export type ParseJsonWithRepairResult<T = unknown> = {
  parsed: T | null;
  usedRepair: boolean;
  repairSteps: string[];
  /** Full cleaned input when `onParseFailure === "storeRaw"` and parse failed. */
  rawText?: string;
  parseError?: string;
};

export function parseJsonWithRepair<T = unknown>(
  text: string,
  options: ParseJsonWithRepairOptions<T> = {},
): ParseJsonWithRepairResult<T> {
  // Clean markdown code blocks first
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  }

  // Try direct parse first
  try {
    return {
      parsed: JSON.parse(cleaned) as T,
      usedRepair: false,
      repairSteps: [],
    };
  } catch {
    // Continue with repair
  }

  // Attempt repair
  const repairResult = repairJson(cleaned, { targetKeys: options.targetKeys });

  try {
    return {
      parsed: JSON.parse(repairResult.repaired) as T,
      usedRepair: true,
      repairSteps: repairResult.repairSteps,
    };
  } catch (finalError) {
    const parseError =
      finalError instanceof Error ? finalError.message : String(finalError);
    console.error("[JSON Repair] All repair attempts failed:", {
      originalError: finalError,
      repairSteps: repairResult.repairSteps,
      repairedLength: repairResult.repaired.length,
      inputLength: cleaned.length,
    });

    if (options.onParseFailure === "storeRaw") {
      return {
        parsed: null,
        usedRepair: repairResult.repairSteps.length > 0,
        repairSteps: repairResult.repairSteps,
        rawText: cleaned,
        parseError,
      };
    }

    if (options.fallback !== undefined) {
      return {
        parsed: options.fallback as T,
        usedRepair: false,
        repairSteps: repairResult.repairSteps,
      };
    }

    throw new Error(`Failed to parse JSON after repair attempts: ${parseError}`);
  }
}
