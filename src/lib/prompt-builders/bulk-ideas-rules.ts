import { GLOBAL_BLOCKED_TOPIC_PROMPT_BLOCK } from "../content-topic-blocklist";
import { NO_FAKE_TESTIMONIALS_RULE } from "./core";
import { TITLE_ANTI_CLICKBAIT_RULE, TITLE_KEYWORD_WEAVING_RULE, TITLE_CASE_RULE, TITLE_WELL_KNOWN_ACRONYMS_RULE } from "./title-rules";

/** Prompt-mode bulk ideation: informational blogs vs local geo entity (service-area) rows. */
export type BulkBlogIdeasContentKind = "content_blog" | "service_area_sap";

/** CSV Modifier column for local geo / entity URL rows: leave blank (no prompt-modifier token). */
export const BULK_SERVICE_AREA_GAP_CSV_MODIFIER = "";

/** Featured image: Google Maps based, not AI (`bulk-auto-generate-template.csv`). */
export const BULK_SERVICE_AREA_GAP_CSV_FEATURED_IMAGE = "google-maps";

export function buildBulkIdeasTodayDateBlock(now: Date = new Date()): string {
  const iso = now.toISOString().slice(0, 10);
  const long = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const year = now.getFullYear();
  const month = now.toLocaleDateString("en-US", { month: "long" });
  return `
=== TODAY (canonical "now" for this entire checklist run) ===
Today's date: ${long} (${iso})
Calendar year: ${year}
Current month: ${month}

This is the only reference date for this run. Apply it to **every** output field: Title, Keyword, MetaDescription, Modifier, and Rationale — plus any rules, angles, or factual framing in your reasoning.

Date-aware rules (all checklist output):
- Treat today as ${long}. "Current", "today", "this year", "now", "latest", "upcoming", and "new for [year]" must match this date — not your training cutoff.
- Forward-looking topics: use ${year} or ${year + 1}. Do not use ${year - 1} or earlier unless the topic is explicitly historical.
- MetaDescription and Rationale: no stale years, expired deadlines, or outdated "just announced" / "new for last year" framing.
- Keywords stay short-tail; do not embed outdated years in Keyword unless the query intent requires a specific historical year.
- Seasonal or time-sensitive angles must fit the season/month of today's date when relevant.
- Do not invent calendar dates inside checklist fields; when a year is needed, derive it from today's date above.
=== END TODAY ===`;
}

// --- Shared rule blocks ---

export const TITLE_RULES =
  `Each Title: under 60 characters; no pipe (|), no ' | ', no suffix like '| Site Name'. One short phrase. Each title must use a different format; do not copy keyword as title. Never append Guide, Types, or Options to the keyword then repeat the keyword after a colon. ${TITLE_CASE_RULE} ${TITLE_KEYWORD_WEAVING_RULE} ${TITLE_ANTI_CLICKBAIT_RULE} ${TITLE_WELL_KNOWN_ACRONYMS_RULE}`;

/** Content-blog checklist titles: keyword front-loaded, one flowing phrase — not "Topic: subtitle". */
export const BULK_CONTENT_BLOG_TITLE_COLON_BAN = `**Title — keyword first, natural join (non-negotiable for content blogs)**:
- **Keyword first**: primary keyword words open the title (first readable phrase), woven in Title Case — not pasted as a label before a colon.
- **One flowing headline**: continue with natural glue — "and", "for", "vs", "without", "how to", "what", "why", "when", or end with "?". Write a single phrase readers scan left to right.
- **Zero colons**: the character ":" is **forbidden** in every checklist Title. No exceptions. Not for cost guides, overviews, maintenance, efficiency, calculators, or degradation topics.
- **Forbidden patterns**: "Solar Panel Costs: What To Expect For Your Home", "Solar Installation Cost: A Comprehensive Overview", "Solar Energy Efficiency: Maximizing Your Output", "Solar System Maintenance: Keeping It Running Smoothly", "Paint Finish Types Explained: Matte Vs. Glossy", "Cabinet Painting Cost: What to Expect".
- **Good patterns**: "Solar Panel Costs And What To Expect For Your Home", "Solar Installation Cost Overview For Homeowners", "Solar Energy Efficiency Tips For Maximum Output", "Solar System Maintenance And Longevity Basics", "Matte Vs Glossy Paint Finish Types Explained", "How To Choose Interior Paint Sheen", "Is Paint Primer Use Always Necessary?"`;

export const TITLE_FORMAT_VARIETY =
  "Formats (rotate across rows; keyword at the start, woven — never keyword-as-label then colon): Comparison 'Matte Vs Glossy [Topic] Compared'; How-to 'How To [Action] [Topic] Without [Problem]'; Numbered '7 [Topic] Strategies For Homeowners'; Question 'Is [Topic] Right For Your Home?'; Guide 'Complete Guide To [Topic] For Beginners'; Problem-solution 'Why [Solution] Matters For [Audience]'. Keyword once, front-loaded; **zero colons** in every title.";

export const MODIFIER_ALL = (n: number, modifier: string) =>
  `Apply modifier "${modifier}" to all ${n} ideas. Every title must clearly reflect it; no generic titles.`;

export const SOURCE_PRIORITY =
  "Venn / set difference: (A) Ideas MUST come only from the KNOWLEDGE BASE section below - your RAG JSON and other KB files (topics, gaps, expansion). (B) The SITE_INVENTORY_POSTS_JSON, SITE_INVENTORY_PAGES_JSON, and SITE_INVENTORY_SAP_JSON blocks in the user message are NOT sources for ideas; they are the WordPress source of truth across all three sitemaps - existing coverage only. Subtract B from A: propose ideas that do not overlap any bucket (no competing intent with any published title, keyword, or URL path). Never treat inventory as inspiration.";

export const INVENTORY_CANNIBALIZATION = `CANNIBALIZATION / EXCLUSION ONLY (mandatory when sitemap inventory blocks are present):
**Read every bucket first:** Each inventory block is a **plain newline-separated keyword list** (one keyword per line, no JSON, no quotes, no commas). Use it as an exclusion list of topics already on the site.
Your new ideas must fall outside the union of all three buckets — no intersection in search intent with any existing keyword.
- Do not duplicate or lightly rephrase any keyword string in the list.
- Do not target the same topic or intent as any listed keyword.
Empty strings are skipped.`;

export const WITHIN_CHECKLIST_EXCLUSIVITY = (n: number) =>
  `**Mutual exclusivity (all ${n} new ideas + all inventory rows):**
- Every Keyword in your checklist must be unique (case-insensitive, normalize spacing).
- Every Title must be unique and use a distinct search angle — no two rows may target the same comparison axis, cost guide, or how-to premise.
- Each new idea must be mutually exclusive with every other new idea AND with every URL in POSTS, PAGES, and SAP inventories.
- Before output: verify no keyword/title/intent overlap within the checklist and no cannibalization against any inventory row.`;

/** Informational content blogs - not local service-area pages; AI featured images; reviews not case studies. */
export const BULK_CONTENT_BLOG_EDITORIAL_RULES = `Content-blog posture (this checklist path):
- **No service-area / geo landing posts:** Do not put city, region, province, state, or "in [Place]" patterns in titles unless the user explicitly set a title template that includes **[Location]**. Prefer national/educational angles.
- **Keyword field - short-tail, no near-me spam:** Prefer **2–3 words**, topic + intent only (product/service type, comparison, cost, best, types, vs). Strip city, neighborhood, and "near me" proximity language from commercial keywords. **Exception - government / policy / incentives / grants / rebates / regulations / tax credits:** keep jurisdiction already present in the selected keyword (country and federal/provincial/state as written). Do not strip those. Do not invent near-me city spam.
- **Entity column:** If Entity is a **company/brand name**, use it for context only - do **not** treat it as a geographic place (avoid "[topic] near [Entity]" when Entity is a brand).
- **FeaturedImage:** Use **"y"** only (AI-generated featured image at publish). Never **"google-maps"** or **"n"** in checklist output for this flow.
- **Proof points:** Modifiers may suggest **reviews, testimonials, star ratings, third-party credibility**. Do **not** prescribe **case studies**, ROI case studies, or formal customer case studies as the content format.`;

/** Local geo / entity sitemap checklist path (not national blogs). */
export const BULK_SERVICE_AREA_GEO_EDITORIAL_RULES = `Local geo landing posture (entity sitemap program):
- **Each idea is one geo-targeted service area page** for the WordPress entity sitemap program, not a national informational blog article.
- **Entity column:** must name the **place the page serves** (neighbourhood, city, county, or hyperlocal area). Use real geography from the knowledge base or typical service territory for this business; never invent fake towns.
- **Keyword:** **2–4 words** combining **commercial or service intent with location** for that row (e.g. core service + city, or service + neighbourhood). Geography belongs here because these are local landings.
- **Title:** follow **GEO title rules** in the system prompt (weave Keyword + Entity with **in / near / for / serving / around** and similar; high variety; not a sheet of bare "[Place] [Keyword]" only).
- **MetaDescription:** local SEO with place plus primary service; no double-quote characters inside the value.
- **Modifier:** leave **empty** for every row (entity landing URLs). On each checklist line use **Modifier: ""** (empty quotes). Do not output guide, comparison, geo-landing, or any other modifier text.
- **FeaturedImage:** use exactly **${BULK_SERVICE_AREA_GAP_CSV_FEATURED_IMAGE}** for every row (Google Maps based featured image, not AI-generated). Never use **y** or **n** for these rows.`;

export const GEO_LANDING_KEYWORD_INTENT_RULES = `Keyword field (local geo landings): **2–4 words** combining service or product intent with **geography** (city, neighbourhood, or county that row targets). No full sentences or questions in Keyword. Entity names the place; Keyword reinforces what is offered in that market.`;

/** Title patterns for geo rows: natural weave of Keyword + Entity; avoid repetitive "City Product" stacks. */
export const GEO_LANDING_TITLE_AI_RULES = `Title (local geo landings — varied, AI-quality local SEO):
- **Weave Keyword and Entity** into one natural phrase. Rotate patterns across rows, for example: "[Keyword] in [Entity]", "[Keyword] near [Entity]", "[Keyword] for [Entity]", "[Keyword] serving [Entity]", "Professional [Keyword] in [Entity]", "[Keyword] across [Entity]", "[Keyword] around [Entity]". Use **different connectors and openers** on each line so the checklist does not sound templated.
- **Avoid as the dominant pattern:** bare "[Place] [Keyword]" or "[Keyword] [Place]" with **no** connector (e.g. a sheet full of "Edmonton Blinds" style only). At most one row may use that ultra-short stack if others use richer patterns.
- ${TITLE_KEYWORD_WEAVING_RULE}
- Entity may appear as written (e.g. city + province) or shortened **only** if still clear and under 60 characters.
- If **Purpose** mentions quarter editorial counts, post shortage, entity shortage, or scheduling, keep titles **confident and timely for filling that gap** without inventing fake calendar dates inside Title unless the user explicitly requested dated titles.
- Optional CSV column **publish_date_gmt** may be filled later for staggering publishes; each Title must read well on its own for any slot in the quarter.`;

/** Hard bans for all bulk blog ideas (service businesses: no DIY repair guides; no entrepreneurship content). */
export const GLOBAL_TOPIC_EXCLUSIONS = `Global topic rules (always apply to every idea):
- No repair-guide or DIY fix-it posts: do not propose step-by-step "how to repair / fix / mend" tutorials or repair guides. You may still position the business as offering professional repair or service in other article types (e.g. service pages, trust, when to call a pro) - but do not make the core premise of any idea a repair how-to guide.
- No entrepreneurship or "start a business" content: do not propose ideas about starting a business, launching a startup, side hustles, business plans, registering a company, or similar.
- Never output copyright lines, "©", "Copyright" + year, "All rights reserved", or invented brand/site names (e.g. fake businesses like "MyGlamping"). Use only the connected site name when TARGET SITE is provided.
${NO_FAKE_TESTIMONIALS_RULE}
${GLOBAL_BLOCKED_TOPIC_PROMPT_BLOCK}`;

export const CONTENT_VARIETY =
  "At least 2 content types (e.g. versus, how-to, guide). Prioritize versus/comparison posts when the topic allows. Mix types across ideas.";

export const META_DESCRIPTION_RULES =
  "MetaDescription: 150–160 chars, SEO-focused, include primary keyword, compelling call-to-action or value prop. No quotation marks inside; no testimonial-style lines, fake patient/customer quotes, star ratings, or invented attributions (e.g. “Name, Local Resident”).";

/** Primary keyword in each row: drives intent for generation - keep extremely tight. */
export const KEYWORD_INTENT_RULES =
  "Keyword field (critical for intent): **short-tail** - prefer **2 or 3 words**. Strip near-me / city / neighborhood proximity spam from commercial keywords. Distill full questions into complete noun/intent phrases; never output broken partial questions. Good: \"solar panels cost\", \"solar panel installation cost\", \"roman shades cost\", \"blinds vs shades\", \"motorized blinds\". Bad: \"how much do solar panels\", \"how much do solar energy\", \"cost of solar panels edmonton\", \"installers near me\". **Exception - government / policy / incentives / grants / rebates / regulations / tax credits:** keep jurisdiction already present (country and federal/provincial/state as written; 3–5 words ok). Good: \"federal solar incentives canada\". Bad: \"solar incentives\" (missing jurisdiction).";

export const OUTPUT_FORMAT_LINE = (
  n: number,
  entityMode: string,
  featuredImage: boolean,
  withRationale: boolean,
  contentKind: BulkBlogIdeasContentKind = "content_blog",
) =>
  contentKind === "service_area_sap"
    ? `Numbered checklist (${n} items). Each: Keyword: "[2–4 words: service + geography]", Entity: "[place name]", Title: "[natural local title: keyword + entity via in/near/for/etc.; varied each row]", MetaDescription: "[150–160 char SEO meta, no double quotes inside]", Modifier: "" (empty), FeaturedImage: "${BULK_SERVICE_AREA_GAP_CSV_FEATURED_IMAGE}"${withRationale ? ', Rationale: "[optional angle]"' : ""}`
    : `Numbered checklist (${n} items). Each: Keyword: "[2–3 word short-tail intent keyword]", Entity: "[entity]"${entityMode === "blank" ? " (or omit)" : ""}, Title: "[title]", MetaDescription: "[150–160 char SEO meta]", Modifier: "[modifier]", FeaturedImage: "${featuredImage ? "y" : "n"}"${withRationale ? ', Rationale: "[why this matches modifier]"' : ""}`;

/** Non-negotiable output shape for `parseBlogIdeasChecklist` (must match parser regex). */
export const MACHINE_CHECKLIST_PARSE_RULES = `MACHINE CHECKLIST FORMAT (required — app parses this with strict line rules):
- Plain text only: do not wrap the checklist in markdown code fences.
- One idea per line. Each line must begin with N. or N) then a single space (e.g. \`1. \` or \`1) \`) at column 0 — no leading spaces, no \`-\`, no \`*\`, no \`**\` around the number.
- Use straight ASCII double quotes only around every field value: Keyword: "...", Title: "...", MetaDescription: "...", etc. No curly/smart quotes.
- MetaDescription must not contain a double-quote character inside the value (rephrase if needed).
- Every line must include labeled Keyword: "…" and Title: "…" exactly in that form.`;
