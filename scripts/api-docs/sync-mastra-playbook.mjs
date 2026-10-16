#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const PLAYBOOK_DIR = path.join(ROOT, "docs", "api", "mastra", "playbook");
const INDEX_PATH = path.join(ROOT, "docs", "api", "mastra", "playbook-index.md");
const MANIFEST_JSON_PATH = path.join(ROOT, "docs", "api", "mastra", "playbook-manifest.json");

const GROUP_CONFIG = [
  {
    key: "agents-and-subagents",
    title: "Mastra Playbook: Agents & Subagents",
    match: (rel) =>
      rel.startsWith("docs/agents/") ||
      rel === "docs/subagents" ||
      rel === "docs/skills",
  },
  {
    key: "workflows",
    title: "Mastra Playbook: Workflows & Control Flow",
    match: (rel) => rel.startsWith("docs/workflows/"),
  },
  {
    key: "harness",
    title: "Mastra Playbook: Harness, Durable Agents & Signals",
    match: (rel) => rel.startsWith("docs/harness/"),
  },
  {
    key: "memory",
    title: "Mastra Playbook: Memory & Context Recall",
    match: (rel) => rel.startsWith("docs/memory/"),
  },
  {
    key: "guides-and-context",
    title: "Mastra Playbook: Guides, Context Engineering & Lifecycle",
    match: (rel) => rel.startsWith("docs/guides/"),
  },
  {
    key: "evals-and-observability",
    title: "Mastra Playbook: Evals, Scorers & Observability",
    match: (rel) =>
      rel.startsWith("docs/evals/") || rel.startsWith("docs/observability/"),
  },
  {
    key: "connections-and-sandboxes",
    title: "Mastra Playbook: MCP, Connections, Sandboxes & Channels",
    match: (rel) =>
      rel.startsWith("docs/connections/") ||
      rel.startsWith("docs/sandbox/") ||
      rel === "docs/channels" ||
      rel === "docs/browser",
  },
  {
    key: "server-auth-and-deploy",
    title: "Mastra Playbook: Server, Storage, Studio, Auth & Deployment",
    match: (rel) =>
      rel === "docs" ||
      rel === "docs/develop" ||
      rel === "docs/storage" ||
      rel.startsWith("docs/server/") ||
      rel.startsWith("docs/studio/") ||
      rel.startsWith("docs/auth/") ||
      rel.startsWith("docs/deployment/"),
  },
  {
    key: "models-and-platform",
    title: "Mastra Playbook: Model Router, Providers & Platform",
    match: (rel) =>
      rel === "models" ||
      rel.startsWith("models/") ||
      rel.startsWith("docs/mastra-platform/"),
  },
  {
    key: "reference-agents-and-tools",
    title: "Mastra Playbook: API Reference - Agents, Tools, Processors & Streaming",
    match: (rel) =>
      rel === "reference" ||
      rel === "reference/configuration" ||
      rel === "reference/build-with-ai" ||
      rel === "reference/manual-install" ||
      rel === "reference/project-structure" ||
      rel.startsWith("reference/agents/") ||
      rel.startsWith("reference/tools/") ||
      rel.startsWith("reference/processors/") ||
      rel.startsWith("reference/streaming/") ||
      rel.startsWith("reference/agent-controller/"),
  },
  {
    key: "reference-workflows-core-and-memory",
    title: "Mastra Playbook: API Reference - Workflows, Mastra Core, Memory & Signals",
    match: (rel) =>
      rel.startsWith("reference/workflows/") ||
      rel.startsWith("reference/core/") ||
      rel.startsWith("reference/memory/") ||
      rel.startsWith("reference/signals/") ||
      rel.startsWith("reference/schedules/") ||
      rel.startsWith("reference/workspace/"),
  },
];

function cleanScrapedMarkdown(raw) {
  return raw
    .replace(/\u2014/g, " - ")
    .replace(
      /^>\s*Mastra docs are the canonical, current reference\.[^\n]*\n+/gm,
      ""
    )
    .replace(
      /^>\s*Discover all available pages from the documentation index:[^\n]*\n+/gm,
      ""
    )
    .trim();
}

function demoteHeadings(md) {
  const lines = md.split("\n");
  let inFence = false;
  return lines
    .map((line) => {
      if (line.trim().startsWith("```")) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      if (/^#{1,5}\s+/.test(line)) {
        return "#" + line;
      }
      return line;
    })
    .join("\n");
}

async function fetchWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

export async function syncMastraPlaybook() {
  console.log("Fetching https://mastra.ai/llms.txt ...");
  const llmsRes = await fetch("https://mastra.ai/llms.txt");
  if (!llmsRes.ok) {
    throw new Error(`Failed to fetch llms.txt: ${llmsRes.status}`);
  }
  const llmsTxt = (await llmsRes.text()).replace(/\u2014/g, " - ");

  const docsIdx = llmsTxt.indexOf("## Docs");
  const fullCatalogBlock = llmsTxt.slice(docsIdx);

  const linkRegex = /^\s*-\s*\[([^\]]+)\]\((https:\/\/mastra\.ai\/[^\)]+)\)/gm;
  const pages = [];
  const seenUrls = new Set();
  let match;
  while ((match = linkRegex.exec(fullCatalogBlock)) !== null) {
    const title = match[1].trim();
    const url = match[2].trim();
    if (seenUrls.has(url)) continue;
    const rel = url.replace("https://mastra.ai/", "").replace(/\.md$/, "");
    if (!GROUP_CONFIG.some((g) => g.match(rel))) continue;
    seenUrls.add(url);
    pages.push({ title, url, rel });
  }

  console.log(`Discovered ${pages.length} canonical Mastra playbook & API reference pages.`);

  const fetchedPages = await fetchWithConcurrency(pages, 16, async (page) => {
    const res = await fetch(page.url);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${page.url}: ${res.status}`);
    }
    const text = await res.text();
    return {
      ...page,
      markdown: cleanScrapedMarkdown(text),
    };
  });

  fs.mkdirSync(PLAYBOOK_DIR, { recursive: true });

  const manifestEntries = [];
  let order = 40;

  const indexSlug = "mastra/playbook-index";
  const indexFrontmatter = [
    "---",
    'title: "Mastra Playbook: Complete Index (llms.txt)"',
    `slug: ${indexSlug}`,
    "section: Mastra",
    `order: ${order}`,
    "related:",
    "  - mastra/overview",
    "  - mastra/playbook/agents-and-subagents",
    "  - mastra/playbook/workflows",
    "  - mastra/playbook/harness",
    "  - mastra/playbook/reference-agents-and-tools",
    "  - mastra/playbook/reference-workflows-core-and-memory",
    "---",
    "",
    "<!-- manual -->",
    "",
    "Complete Mastra documentation index (`https://mastra.ai/llms.txt`) and local playbook map for NEO Pulse coding agents. Every Mastra playbook domain and core API reference is scraped and stored locally under `docs/api/mastra/playbook/*.md` so coding agents can read exact TypeScript signatures, schemas, and patterns offline without external fetches.",
    "",
    "## Local Playbook Files for Coding Agents",
    "",
    "| Playbook File | Slug | Covered Topics |",
    "| --- | --- | --- |",
    ...GROUP_CONFIG.map(
      (g) =>
        `| \`docs/api/mastra/playbook/${g.key}.md\` | \`mastra/playbook/${g.key}\` | ${g.title} |`
    ),
    "",
    "## Canonical Mastra `llms.txt` Index",
    "",
    demoteHeadings(llmsTxt),
    "",
  ].join("\n");

  fs.writeFileSync(INDEX_PATH, indexFrontmatter, "utf8");
  manifestEntries.push({
    slug: indexSlug,
    title: "Playbook: Complete Index",
    order,
  });

  for (const group of GROUP_CONFIG) {
    order += 10;
    const groupPages = fetchedPages.filter((p) => group.match(p.rel));
    const slug = `mastra/playbook/${group.key}`;
    const filePath = path.join(PLAYBOOK_DIR, `${group.key}.md`);

    const tocRows = groupPages.map(
      (p) => `- **${p.title}** (\`${p.rel}\` - source: \`${p.url}\`)`
    );

    const sectionsMd = groupPages
      .map((p) => {
        const demoted = demoteHeadings(p.markdown);
        return [
          `## Source: ${p.title} (\`${p.rel}\`)`,
          "",
          `Canonical URL: \`${p.url}\``,
          "",
          demoted,
        ].join("\n");
      })
      .join("\n\n---\n\n");

    const fileContent = [
      "---",
      `title: "${group.title}"`,
      `slug: ${slug}`,
      "section: Mastra",
      `order: ${order}`,
      "related:",
      "  - mastra/overview",
      "  - mastra/playbook-index",
      "  - mastra/workflows-and-steps",
      "  - mastra/agents-and-models",
      "---",
      "",
      "<!-- manual -->",
      "",
      `Scraped canonical Mastra documentation for **${group.title}** (${groupPages.length} upstream pages consolidated for NEO Pulse coding agents).`,
      "",
      "## Included Pages",
      "",
      ...tocRows,
      "",
      "---",
      "",
      sectionsMd,
      "",
    ].join("\n");

    fs.writeFileSync(filePath, fileContent, "utf8");
    manifestEntries.push({
      slug,
      title: group.title.replace(/^Mastra Playbook:\s*/, "Playbook: "),
      order,
      pageCount: groupPages.length,
    });
    console.log(
      `Wrote ${path.relative(ROOT, filePath)} (${groupPages.length} pages, ${fileContent.length} bytes)`
    );
  }

  fs.writeFileSync(
    MANIFEST_JSON_PATH,
    JSON.stringify(
      {
        syncedAt: new Date().toISOString(),
        sourceIndex: "https://mastra.ai/llms.txt",
        totalPagesScraped: fetchedPages.length,
        entries: manifestEntries,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(
    `Synced ${fetchedPages.length} pages across ${manifestEntries.length} Mastra playbook docs.`
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  syncMastraPlaybook().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
