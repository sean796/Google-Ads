export function parseOpenRouterResponseBody(text: string, status: number): unknown {
  const trimmed = text.trim();
  if (
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<!doctype") ||
    trimmed.startsWith("<html") ||
    trimmed.startsWith("<HTML")
  ) {
    throw new Error(
      `OpenRouter returned HTML instead of JSON (${status}). The API may be temporarily unavailable. Try again.`,
    );
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(`OpenRouter returned non-JSON (${status}): ${trimmed.slice(0, 160)}`);
  }
}

export async function readOpenRouterResponseJson(
  res: Pick<Response, "text" | "status">,
): Promise<unknown> {
  const text = await res.text();
  return parseOpenRouterResponseBody(text, res.status);
}
