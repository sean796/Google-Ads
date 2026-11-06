import type { OpenRouterModelCatalogEntry } from "@/lib/openrouter-models-catalog";

export type ConfiguredModel = { label: string; modelId: string };

export type ModelCatalogValidation =
  | { status: "ok" }
  | { status: "unverified"; reason: string }
  | { status: "invalid"; unknown: ConfiguredModel[] };

/**
 * Startup check: every configured category model must exist in the live
 * OpenRouter catalog. "Unverified" (catalog unreachable) is reported distinctly
 * from "invalid" (catalog loaded, model missing) so neither is silently OK.
 */
export function validateConfiguredModelsAgainstCatalog(
  configured: ConfiguredModel[],
  catalog: OpenRouterModelCatalogEntry[] | null,
  catalogError?: string | null,
): ModelCatalogValidation {
  if (catalogError?.trim()) {
    return {
      status: "unverified",
      reason: `model catalog request failed (${catalogError.trim()})`,
    };
  }
  if (!catalog || catalog.length === 0) {
    return { status: "unverified", reason: "model catalog is empty or still loading" };
  }

  const knownIds = new Set(catalog.map((m) => m.id));
  const unknown = configured.filter((c) => {
    const id = c.modelId.trim();
    return id.length > 0 && !knownIds.has(id);
  });
  if (unknown.length > 0) return { status: "invalid", unknown };
  return { status: "ok" };
}

/** One-line user-facing summary for the settings surface. */
export function formatModelCatalogValidation(validation: ModelCatalogValidation): string | null {
  if (validation.status === "ok") return null;
  if (validation.status === "unverified") {
    return `Could not verify configured models: ${validation.reason}. Model names were not checked.`;
  }
  const names = validation.unknown.map((u) => `${u.label}: ${u.modelId.trim()}`).join("; ");
  return `Unknown model in the live OpenRouter catalog: ${names}. Pick a listed model or runs will fail.`;
}
