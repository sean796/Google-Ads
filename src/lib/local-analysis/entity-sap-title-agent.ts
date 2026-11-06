import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { aiRejectBrandOrBlockedTexts } from "@/lib/content-brand-ai-gate";
import { serviceKeywordForSapTitle } from "@/lib/local-analysis/entity-sap-row-keyword-fill";
import {
  SAP_TITLE_MAX_CHARS,
  truncateAtWordBoundary,
  formatSapHeadlineTitleCase,
} from "@/lib/sap-brand-and-brevity";
import {
  titleCollidesWithEntityInventory,
  type EntitySapOccupancy,
} from "@/lib/local-analysis/entity-sap-inventory-collision";
import {
  DEFAULT_ENTITY_SAP_TITLE_TEMPLATE,
  DEFAULT_ENTITY_TITLE_TEMPLATE,
  isValidEntitySapTitle,
  resolveEntitySapPostTitle,
  resolveEntitySapTitleFromTemplate,
} from "@/lib/local-analysis/entity-sap-title-validation";
import {
  delay,
  fetchTitlesBatch,
} from "@/lib/local-analysis/entity-sap-title-fetch";

export {
  DEFAULT_ENTITY_SAP_TITLE_TEMPLATE,
  isValidEntitySapTitle,
  resolveEntitySapPostTitle,
  resolveEntitySapTitleFromTemplate,
};

export type FillSapRowTitlesOptions = {
  apiKey: string;
  model: string;
  siteId?: string;
  siteName: string;
  gridLocations: string[];
  entityTypeFocus?: string[];
  /** Structural pattern e.g. "{keyword} Near {entity}". */
  titleTemplate?: string;
  /** When true, rewrite all rows even if title is already set. */
  forceRewrite?: boolean;
  sapOccupancy?: EntitySapOccupancy;
  onProgress?: (done: number, total: number) => void;
  onRowsUpdate?: (rows: CSVRow[]) => void;
};

/** @deprecated Use {@link fillSapRowTitlesFromOpenRouter} */
export type EntitySapTitleAgentOptions = FillSapRowTitlesOptions;

function applyTitlesAtIndices(out: CSVRow[], indices: number[], titles: string[]): void {
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i]!;
    if (idx < 0 || idx >= out.length) continue;
    out[idx] = { ...out[idx]!, title: titles[i] ?? "" };
  }
}

function applyValidatedOrFallbackTitle(
  out: CSVRow[],
  index: number,
  candidateTitle: string,
  titleTemplate: string,
  siteName: string,
): void {
  const row = out[index]!;
  const keyword = (row.keyword ?? "").trim();
  const entity = (row.entity ?? "").trim();
  const serviceKw = serviceKeywordForSapTitle(keyword, entity);
  const cleaned = truncateAtWordBoundary(candidateTitle.trim(), SAP_TITLE_MAX_CHARS);
  const titled = formatSapHeadlineTitleCase(cleaned);
  if (titled && isValidEntitySapTitle(titled, serviceKw || keyword, entity, siteName)) {
    out[index] = { ...row, title: titled };
    return;
  }
  out[index] = {
    ...row,
    title: resolveEntitySapTitleFromTemplate(keyword, entity, titleTemplate, siteName),
  };
}

function applyTemplateFallbackForIndices(
  out: CSVRow[],
  indices: number[],
  titleTemplate: string,
  siteName: string,
): void {
  for (const i of indices) {
    const row = out[i];
    if (!row) continue;
    out[i] = {
      ...row,
      title: resolveEntitySapTitleFromTemplate(
        (row.keyword ?? "").trim(),
        (row.entity ?? "").trim(),
        titleTemplate,
        siteName,
      ),
    };
  }
}


export async function fillSapRowTitlesFromOpenRouter(
  rows: CSVRow[],
  options: FillSapRowTitlesOptions,
): Promise<CSVRow[]> {
  if (rows.length === 0) return rows;
  const apiKey = options.apiKey.trim();
  const model = options.model.trim();
  const siteId = options.siteId;
  const gridLocations = options.gridLocations;
  const entityTypeFocus = options.entityTypeFocus;
  const titleTemplate = options.titleTemplate?.trim() || DEFAULT_ENTITY_TITLE_TEMPLATE;
  const forceRewrite = options.forceRewrite === true || Boolean(options.titleTemplate?.trim());
  const sapOccupancy = options.sapOccupancy;
  const out = rows.map((r) => ({ ...r }));
  const total = out.length;

  const pendingIndices = out
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => forceRewrite || !row.title?.trim())
    .map(({ index }) => index);

  if (pendingIndices.length === 0) {
    options.onProgress?.(total, total);
    return out;
  }

  if (forceRewrite) {
    for (const i of pendingIndices) {
      out[i] = { ...out[i]!, title: "" };
    }
  }

  const pendingRows = pendingIndices.map((i) => out[i]!);
  let attempt = 0;
  const maxAttempts = 5;

  while (pendingIndices.some((i) => !out[i]!.title?.trim()) && attempt < maxAttempts) {
    attempt++;
    try {
      const titles = await fetchTitlesBatch(
        apiKey,
        model,
        siteId,
        options.siteName,
        pendingRows,
        gridLocations,
        entityTypeFocus,
        titleTemplate,
        sapOccupancy,
      );
      for (let j = 0; j < pendingIndices.length; j++) {
        const idx = pendingIndices[j]!;
        applyValidatedOrFallbackTitle(out, idx, titles[j] ?? "", titleTemplate, options.siteName);
      }
    } catch {
      await delay(Math.min(10_000, 1_000 * attempt));
    }

    // Brand gate runs outside the retry catch on purpose (Wave 2): an
    // unparseable gate response throws and fails the run visibly instead of
    // silently shipping unfiltered titles.
    const titled = pendingIndices
      .map((i) => ({ i, title: out[i]!.title?.trim() ?? "" }))
      .filter((x) => x.title);
    if (titled.length > 0 && options.siteName.trim()) {
      const rejected = await aiRejectBrandOrBlockedTexts({
        apiKey,
        model,
        companyName: options.siteName,
        candidates: titled.map((x) => x.title),
        kind: "title",
      });
      if (rejected.length > 0) {
        const rejectKeys = new Set(
          rejected.map((t) => t.trim().toLowerCase().replace(/\s+/g, " ")),
        );
        for (const { i, title } of titled) {
          const key = title.toLowerCase().replace(/\s+/g, " ");
          if (rejectKeys.has(key)) {
            const row = out[i]!;
            out[i] = {
              ...row,
              title: resolveEntitySapTitleFromTemplate(
                (row.keyword ?? "").trim(),
                (row.entity ?? "").trim(),
                titleTemplate,
                options.siteName,
              ),
            };
          }
        }
      }
    }
    options.onRowsUpdate?.(out.map((row) => ({ ...row })));
    options.onProgress?.(
      out.filter((r) => r.title?.trim()).length,
      total,
    );
  }

  const stillBlank = pendingIndices.filter((i) => !out[i]!.title?.trim());
  if (stillBlank.length > 0) {
    applyTemplateFallbackForIndices(out, stillBlank, titleTemplate, options.siteName);
    options.onRowsUpdate?.(out.map((row) => ({ ...row })));
  }

  if (sapOccupancy) {
    const titleRetryIndices: number[] = [];
    for (const i of pendingIndices) {
      const row = out[i];
      if (!row) continue;
      const entity = (row.entity ?? "").trim();
      const title = row.title?.trim() ?? "";
      if (entity && title && titleCollidesWithEntityInventory(title, entity, sapOccupancy)) {
        titleRetryIndices.push(i);
      }
    }
    if (titleRetryIndices.length > 0) {
      for (const i of titleRetryIndices) {
        out[i] = { ...out[i]!, title: "" };
      }
      const retryRows = titleRetryIndices.map((i) => out[i]!);
      try {
        const retryTitles = await fetchTitlesBatch(
          apiKey,
          model,
          siteId,
          options.siteName,
          retryRows,
          gridLocations,
          entityTypeFocus,
          titleTemplate,
          sapOccupancy,
        );
        for (let j = 0; j < titleRetryIndices.length; j++) {
          const idx = titleRetryIndices[j]!;
          applyValidatedOrFallbackTitle(out, idx, retryTitles[j] ?? "", titleTemplate, options.siteName);
        }
      } catch {
        applyTemplateFallbackForIndices(out, titleRetryIndices, titleTemplate, options.siteName);
      }
      options.onRowsUpdate?.(out.map((row) => ({ ...row })));
    }
  }

  options.onProgress?.(total, total);
  return out;
}

/** @deprecated Use {@link fillSapRowTitlesFromOpenRouter} */
export async function rewriteEntitySapTitlesWithOpenRouter(
  rows: CSVRow[],
  options: EntitySapTitleAgentOptions,
): Promise<CSVRow[]> {
  return fillSapRowTitlesFromOpenRouter(rows, options);
}
