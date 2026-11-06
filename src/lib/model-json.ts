import type { ZodType } from "zod";

/**
 * The one strict model-JSON parse path (Wave 2). Model output is parsed
 * exactly once and validated against the caller's zod schema; anything else
 * throws visibly. No repair, no slicing, no bracket closing: if the model
 * did not return the promised shape, the flow fails loudly at this boundary
 * instead of patching the output downstream.
 */

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

/** One JSON.parse after fence strip. No repair, truncation, or bracket closing. */
export function parseJsonStrict<T = unknown>(text: string): T {
  const cleaned = unwrapJsonMarkdownFence(text);
  return JSON.parse(cleaned) as T;
}

/**
 * Fence strip, one JSON.parse, zod validate. Throws a labeled error when the
 * model did not return valid JSON or the JSON does not match the schema.
 */
export function parseModelJson<T>(raw: string, schema: ZodType<T>, label: string): T {
  const stripped = unwrapJsonMarkdownFence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped) as unknown;
  } catch {
    throw new Error(`Invalid ${label} JSON: model did not return valid JSON.`);
  }
  const row = schema.safeParse(parsed);
  if (!row.success) {
    throw new Error(`Invalid ${label} JSON: ${row.error.message}`);
  }
  return row.data;
}
