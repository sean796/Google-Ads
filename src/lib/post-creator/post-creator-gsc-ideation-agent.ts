import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { parseJsonWithRepair } from "@/lib/json-repair-utility";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import {
  BENCHMARK_SEO_CONTENT_SPECIALIST_PERSONA,
  BENCHMARK_SITE_INVENTORY_CANNIBALIZATION,
} from "@/lib/vertical-benchmark/vertical-benchmark-inventory-cannibal";

type IdeaRow = { keyword: string; title: string; entity: string };

const POST_CREATOR_INVENTORY_CANNIBALIZATION = BENCHMARK_SITE_INVENTORY_CANNIBALIZATION.replace(
  /GSC OUTPUT line you adapt/g,
  "GSC line you select",
)
  .replace(
    /keep source_exemplar_url on the GSC line but choose/g,
    "choose",
  )
  .replace(
    /pivot that row to the next-best gap topic for this client \(still keep source_exemplar_url\)/g,
    "pick the next-best gap topic from SITE_KW_JSON for that row",
  );

function buildSystemPrompt(): string {
  return `${BENCHMARK_SEO_CONTENT_SPECIALIST_PERSONA}
${POST_CREATOR_INVENTORY_CANNIBALIZATION}

OUTPUT CONTRACT:
- Return valid JSON only: {"rows":[{"keyword":"","title":"","entity":""}]}
- Exactly the requested number of rows.
- Read SITE_INVENTORY_CACHE completely before selecting any keyword from SITE_KW_JSON.
- Each keyword must come from a GSC line in SITE_KW_JSON, distilled to a clean short-tail phrase when needed.
- Every title must be original. Never copy any inventory title.
- Inventory wins over GSC when they conflict.`;
}

function buildUserPrompt(args: {
  siteName: string;
  postCount: number;
  bucketJson: string;
  siteKwJsonText: string;
  optionalPrompt?: string;
}): string {
  const parts = [
    `Generate exactly ${args.postCount} NEW blog post ideas for ${args.siteName}.`,
    "",
    "STEP 1 — READ SITE_INVENTORY_CACHE (mandatory before any ideas):",
    "This is the cached JSON export of every published post URL, slug, and title on the site.",
    "",
    "=== SITE_INVENTORY_CACHE ===",
    args.bucketJson.trim(),
    "=== END SITE_INVENTORY_CACHE ===",
    "",
    "STEP 2 — READ SITE_KW_JSON (mandatory):",
    "GSC keyword lists sorted by opportunity.",
    "",
    "=== SITE_KW_JSON ===",
    args.siteKwJsonText.trim(),
    "=== END SITE_KW_JSON ===",
    "",
    `STEP 3 — OUTPUT ${args.postCount} NET-NEW IDEAS:`,
    "Pick keywords from SITE_KW_JSON whose search intent is NOT already covered in SITE_INVENTORY_CACHE.",
    "Write original titles. Do not cannibalize any existing post.",
  ];

  if (args.optionalPrompt?.trim()) {
    parts.push("", `Content brief (every idea must fit): ${args.optionalPrompt.trim()}`);
  }

  return parts.join("\n");
}

function parseIdeaRows(raw: string, limit: number): IdeaRow[] {
  const { parsed } = parseJsonWithRepair<{ rows?: unknown }>(raw, {
    targetKeys: ["rows"],
    fallback: { rows: [] },
  });
  const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
  const out: IdeaRow[] = [];
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const record = item as { keyword?: unknown; title?: unknown; entity?: unknown };
    const keyword = typeof record.keyword === "string" ? record.keyword.trim() : "";
    const title = typeof record.title === "string" ? record.title.trim() : "";
    if (!keyword || !title) continue;
    out.push({
      keyword,
      title,
      entity: typeof record.entity === "string" ? record.entity.trim() : "",
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function runPostCreatorGscIdeationAgent(args: {
  apiKey: string;
  siteId?: string;
  siteName: string;
  postCount: number;
  bucketJson: string;
  siteKwJsonText: string;
  optionalPrompt?: string;
  onProgress?: (message: string) => void;
}): Promise<CSVRow[]> {
  args.onProgress?.("Senior SEO specialist reading inventory and GSC data…");

  const { content } = await callOpenRouterChatCompletion({
    apiKey: args.apiKey,
    model: getResearchModel(args.siteId),
    system: buildSystemPrompt(),
    user: buildUserPrompt(args),
    maxTokens: 4096,
    temperature: 0.35,
    responseFormat: { type: "json_object" },
  });

  const rows = parseIdeaRows(content, args.postCount);
  if (rows.length < args.postCount) {
    throw new Error(`OpenRouter returned ${rows.length}/${args.postCount} blog ideas.`);
  }

  return rows.map((row) => ({
    keyword: row.keyword,
    title: row.title,
    entity: row.entity,
    featuredImage: "y",
  }));
}
