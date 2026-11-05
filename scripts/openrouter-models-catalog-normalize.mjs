/** @param {unknown} raw OpenRouter GET /models JSON */
export function normalizeOpenRouterModelsPayload(raw) {
  const data = raw && typeof raw === "object" && Array.isArray(raw.data) ? raw.data : [];
  const out = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id) continue;
    const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : id;
    const pricing = row.pricing && typeof row.pricing === "object" ? row.pricing : {};
    const arch = row.architecture && typeof row.architecture === "object" ? row.architecture : {};
    const outputMods = Array.isArray(arch.output_modalities) ? arch.output_modalities : [];
    const textOutput = outputMods.length === 0 || outputMods.includes("text");
    const imageOutput = outputMods.includes("image");
    const videoOutput =
      outputMods.includes("video") ||
      id.includes("kling") ||
      id.includes("video") ||
      id.includes("veo") ||
      id.includes("seedance") ||
      id.includes("hailuo") ||
      id.includes("wan-");

    out.push({
      id,
      name,
      promptUsdPerToken: parseUsdPerToken(pricing.prompt),
      completionUsdPerToken: parseUsdPerToken(pricing.completion),
      imageUsdPerToken: parseUsdPerToken(pricing.image),
      contextLength:
        typeof row.context_length === "number" && Number.isFinite(row.context_length)
          ? row.context_length
          : null,
      textOutput,
      imageOutput,
      videoOutput,
    });
  }
  return out;
}

function parseUsdPerToken(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}
