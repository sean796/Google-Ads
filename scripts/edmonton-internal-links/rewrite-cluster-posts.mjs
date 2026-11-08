/**
 * In-place rewrite of assigned cluster POSTS only. No new slugs. No Elementor pages.
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runNeodigitalPhp } from "./sftp-oneshot.mjs";

const require = createRequire(import.meta.url);
const { openRouterKey } = require("../load-root-openrouter-env.cjs");

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "test-output");
const inventory = JSON.parse(readFileSync(join(outDir, "edmonton-seo-inventory.json"), "utf8"));
const cluster = JSON.parse(readFileSync(join(outDir, "edmonton-seo-cluster-jobs.json"), "utf8"));

const JOB_BRIEF = {
  citations: "Write a citations and NAP article for Edmonton businesses. Name Google Business Profile, Canadian directories, and identical Name Address Phone. Do not invent listing counts.",
  links: "Write an Edmonton link-building article: local entities, Explore Edmonton, industry pages, and why thin city grids fail. Do not invent backlink counts.",
  tips: "Write a local-pack checklist for Edmonton: proximity, relevance, prominence, reviews, neighborhood copy. Do not invent rankings.",
  smb: "Write how to hire an Edmonton SEO partner. Use Blind Magic GSC only: clicks 4,066 to 11,382, impressions 460,723 to 1,163,424, position 31.5 to 20.0. No hypothetical Mark.",
};

const SYSTEM = `You rewrite one existing Neo Digital blog post. Return JSON only:
{"title":"...","excerpt":"...","html":"...","money_anchor":"3-7 words"}

Rules:
- Keep the same URL job. Do not propose a new slug.
- Answer-first H2s. Crawlable HTML (h2, p, ul, table, a). No Mark or David hypotheticals.
- One link to https://neodigital.ca/edmonton-seo/ whose visible text is money_anchor.
- money_anchor must be 3-7 words and must not be the exact string "Edmonton SEO". Example money_anchor: "full city SEO program".
- Dated facts only. Allowed numbers: retainers $1,500 to $3,500 a month; Blind Magic clicks 4,066 to 11,382; impressions 460,723 to 1,163,424; position 31.5 to 20.0; September 2026.
- Do not invent ROI, call counts, or rankings.`;

function loadKey() {
  const key =
    process.env.OPENROUTER_API_KEY?.trim() ||
    process.env.OPEN_ROUTER_API_KEY?.trim() ||
    process.env.VITE_OPENROUTER_API_KEY?.trim() ||
    (typeof openRouterKey === "string" ? openRouterKey.trim() : "");
  if (!key) throw new Error("OPENROUTER_API_KEY is required");
  return key;
}

function validateRewrite(job, raw) {
  if (!raw || typeof raw !== "object") throw new Error(`${job}: empty rewrite`);
  const title = String(raw.title || "").trim();
  const excerpt = String(raw.excerpt || "").trim();
  const html = String(raw.html || "").trim();
  const money_anchor = String(raw.money_anchor || "").trim();
  if (!title || title.toLowerCase() === "edmonton seo") throw new Error(`${job}: bad title`);
  if (!excerpt) throw new Error(`${job}: excerpt required`);
  if (!html.includes("https://neodigital.ca/edmonton-seo/")) throw new Error(`${job}: missing money URL`);
  if (!money_anchor || money_anchor.toLowerCase() === "edmonton seo") throw new Error(`${job}: banned money_anchor`);
  if (!html.includes(money_anchor)) throw new Error(`${job}: money_anchor not in html`);
  if (/\bMark\b|\bDavid\b/.test(html)) throw new Error(`${job}: hypothetical name leaked`);
  return { title, excerpt, html, money_anchor };
}

async function rewriteOne(apiKey, model, item, job) {
  const user = JSON.stringify({
    job,
    brief: JOB_BRIEF[job],
    current: { id: item.id, title: item.title, path: item.path, excerpt: (item.text || "").slice(0, 1200) },
  });
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://neodigital.ca/neo-pulse/",
      "X-Title": "NEO Pulse edmonton-cluster-rewrite",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 400)}`);
  const parsed = JSON.parse(body);
  const content = parsed?.choices?.[0]?.message?.content;
  return validateRewrite(job, JSON.parse(content));
}

const posts = (cluster.jobs || []).filter((j) => JOB_BRIEF[j.job]);
const byId = new Map((inventory.items || []).map((i) => [i.id, i]));
const apiKey = loadKey();
const model = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";
const updates = [];

for (const job of posts) {
  const item = byId.get(job.id);
  if (!item || item.type !== "post") continue;
  const rewrite = await rewriteOne(apiKey, model, item, job.job);
  updates.push({ id: job.id, job: job.job, path: job.path, ...rewrite });
}

if (!updates.length) throw new Error("No post rewrites produced");

const mapJson = JSON.stringify(updates).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const php = `
$updates = json_decode( '${mapJson}', true );
if ( ! is_array( $updates ) ) {
  echo wp_json_encode( array( 'error' => 'bad updates json' ) );
  return;
}
$out = array();
foreach ( $updates as $row ) {
  $id = (int) $row['id'];
  $post = get_post( $id );
  if ( ! $post instanceof WP_Post || $post->post_type !== 'post' ) {
    $out[] = array( 'id' => $id, 'error' => 'not a post' );
    continue;
  }
  wp_update_post( array(
    'ID'           => $id,
    'post_title'   => $row['title'],
    'post_excerpt' => $row['excerpt'],
    'post_content' => $row['html'],
  ) );
  update_post_meta( $id, 'neo_pulse_seo_title', $row['title'] . ' | Neo Digital' );
  update_post_meta( $id, 'neo_pulse_seo_description', $row['excerpt'] );
  $out[] = array( 'id' => $id, 'ok' => true, 'title' => $row['title'] );
}
if ( class_exists( 'Neo_Pulse_Wp_Cache_Flush' ) ) {
  Neo_Pulse_Wp_Cache_Flush::flush_all();
}
echo wp_json_encode( array( 'ok' => true, 'updated' => $out ) );
`;

const applied = await runNeodigitalPhp(php, "nd-rewrite-cluster-posts");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "edmonton-seo-cluster-rewrites.json"), JSON.stringify({ updates, applied }, null, 2), "utf8");
console.log(JSON.stringify({ ok: true, count: updates.length, applied }, null, 2));
