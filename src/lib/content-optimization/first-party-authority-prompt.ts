import type { FirstPartyClaim, IllustrativeExample, SeoContentBriefV1, VerifiedFact } from "@/lib/overview-seo-content-brief";
import { extractChecklistItemTitle } from "@/lib/checklist-item-title";
import { INTERNAL_LINK_INTENT_ROUTING_RULE } from "@/lib/content-generation/internal-link-routing-rules";
import {
  INTERNAL_LINK_ANCHOR_CASE_RULE,
  INTERNAL_LINKS_PER_SECTION_RULE,
  toSentenceCaseLinkAnchor,
} from "@/lib/content-generation/link-anchor-text-case";

export type { FirstPartyClaim };

export {
  ILLUSTRATIVE_DEFAULT_H2,
  isBadIllustrativeH2Title,
  resolveIllustrativeH2Title,
  replaceChecklistItemHeading,
  stripIllustrativeMarkersFromChecklistItem,
  rewriteIllustrativeChecklistItemHeading,
} from "@/lib/content-optimization/illustrative-h2";

/** Remove legacy illustrative/scenario phrasing so checklist LLM cannot copy old headings. */
export function stripLegacyScenarioPhrasesFromExistingPageText(text: string): string {
  return text
    .replace(/\bA realistic local situation[^.!?]*[.!?]?/gi, " ")
    .replace(/\bScenario:\s*[^.!?]*[.!?]?/gi, " ")
    .replace(/\bHypothetical scenario:\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const FIRST_PARAGRAPH_AUTHORITY_RULE = `**FIRST PARAGRAPH RULE (MANDATORY)**: Stat and fact first. Sentence one opens with a sourced number, range, named spec, process constraint, or installer measurement from FIRST-PARTY AUTHORITY, VERIFIED FACTS, audit blocks, or MANDATORY CHATGPT BUSINESS FACTS that belongs to THIS heading. Then the topic. When ANSWER GROUNDING / published Answer is in this prompt, do not reuse Answer's opening dates, rates, or first-sentence shape. Do not open with the company name as a greeting. Do not put the exact primary keyword as the subject of sentence one. At most one exact primary in the intro. Never stack the keyword at the start of consecutive sentences. Forbidden intro families (samey/templated): "{topic} offer(s)/provide(s)/are {generic benefit}"; "This article/guide provides/explores/covers/outlines"; "We often find/observe/recommend that homeowners"; hollow "our team/experts/professionals"; "functional and aesthetic benefits"; "tailored to your needs"; generic privacy + light control + energy efficiency stacks with no number. When ALREADY USED OPENERS are listed, do not reuse those stems or sentence shapes. Unique every post is not required; sounding the same as other posts on this site is forbidden.`;

export const NAMED_PRODUCT_LINE_RULE = `**NAMED PRODUCT LINES**: When FIRST-PARTY CLAIMS, GBP, inventory, existing HTML, or audit blocks name a manufacturer or product line, use that exact name at least twice in body prose instead of category-only wording. If no named line appears in sources, omit. Never invent brands.`;

export const FIRST_PARTY_AUTHORITY_WRITING_RULE = `**FIRST-PARTY AUTHORITY (MANDATORY)**: Write as we / the company. Include every listed first-party claim except ChatGPT street address, headquarters, phone, and hours. Use 2-4 sourced we/company statements per article spread across sections — each must name a concrete field detail (see FORBIDDEN HOLLOW AUTHORITY and FIELD OBSERVATION). When FIRST-PARTY CLAIMS or audit blocks list project scale, years operating, MW/volume, or regional experience, weave at least one into body copy (not only the intro). Prefer: real project examples from listed claims; regional install or campaign patterns with a named mechanism (winter light angle, cord safety, bracket depth, room glare, market, budget, competition); common mistakes observed in the field; cost or production ranges only when a listed source gives them. ${NAMED_PRODUCT_LINE_RULE} Definitive voice. Never invent install counts, years, MW figures, project names, or program details. Street address, headquarters, phone, and hours only if a listed claim has source gbp or master. Never copy a ChatGPT street address. Ignore ChatGPT facts about a different company with a similar name. Grants, loans, rates, payback, and tax classes only from FIRST-PARTY CLAIMS, QFO, LLM/DFS audit, or MANDATORY CHATGPT BUSINESS FACTS for this connected site's city. Forbidden: another province or country's programs. If a source says a program is closed, say it is closed. Never invent payback figures. If a source asserts experience or volume without a figure, use qualitative wording only (years of experience, lots of installs). If a listed non-NAP claim is missing from the draft, the draft is incomplete. Forbidden: encyclopedia-style topic explainers with no we/field voice when claims exist.`;

/** Upfront pass/fail gate: expert installer voice, not generic topic summary. */
export const FORBIDDEN_HOLLOW_AUTHORITY_RULE = `**FORBIDDEN HOLLOW AUTHORITY (NON-NEGOTIABLE)**:
Standalone "we/our" lines with no concrete fact fail the section. Never write these phrases (including close variants): "our team", "our professionals", "our experts", "contact our team", "reach out to our team", "trusted local experts", "leading provider", "we pride ourselves", "we are committed to", "dedicated to quality", "years of experience" without a sourced number from FIRST-PARTY CLAIMS, "what we see in [city]" with no named detail, "we understand your needs", "we help homeowners", "our specialists can help", "tailored to your needs". Use the connected business name or we plus a sourced concrete detail instead of team-speak.
Every we/our sentence in body copy must carry at least one concrete, source-backed detail: a listed install count or years figure; a mount/window/room constraint we quote; a market, budget, competition, or campaign-scope constraint; a product tier or spec choice with why; a regional climate or season effect with mechanism when the topic is physical product or install; a cost or production band with units and CAD/USD from listed sources; a common on-site or in-market mistake from claims or existing HTML; or a process step we actually perform when sources support it.
If no sourced detail exists for a claim, omit the we-line. Do not substitute generic team speak.`;

/** City + named constraint + we see / we recommend when. No extra encyclopedia length. */
export const FIELD_OBSERVATION_RULE = `**FIELD OBSERVATION (NON-NEGOTIABLE — each body H2, not Overview)**: Include 1-2 sourced we/company lines. Shape: primary city (at most once in that sentence; obey SERVICE AREA DENSITY) or "here", plus a named constraint from this connected site's trade (market, budget, competition, campaign scope; or exposure, room, mount, building pattern, or season when the topic is physical product or install), plus what we see or recommend when. Allowed: "we recommend {option from sources} when {named constraint}". Forbidden: hollow "we often find that homeowners"; extra encyclopedia paragraphs to sound expert; invented install counts, west-facing glass, winter stats, product lines, or fake campaign metrics. If sources name a trade constraint, use it. If they do not, use a sourced process or decision constraint instead. Forbidden: restating the Answer definition as field expertise.`;

/** Upfront pass/fail gate: expert installer voice, not generic topic summary. */
export const INSTALLER_EXPERTISE_GATE_RULE = `**INSTALLER EXPERTISE GATE (NON-NEGOTIABLE — CHECK BEFORE EVERY SECTION)**:
Ask: Does this section contain information that only a knowledgeable provider in this connected site's trade and service area could realistically provide?
If no: rewrite. Forbidden: textbook definitions, generic benefit lists, hollow "our team" authority, restating the Answer definition, or copy any competitor could publish without field experience.
${FORBIDDEN_HOLLOW_AUTHORITY_RULE}
${FIELD_OBSERVATION_RULE}
Required when FIRST-PARTY CLAIMS or audit blocks exist: at least one sourced we/company observation in each body section with a named concrete detail (market, budget, competition, campaign scope; or measurement, mount type, room constraint, product tier, regional pattern, mistake seen, or cost/production band from sources).
When no first-party block is present: use qualitative field voice only with specific decision paths; never invent MW counts, cost bands, project names, campaign metrics, or hollow team lines.`;

/** A+ article contract: specs with meaning, regional climate, cost-worth-it, concrete decisions. */
export const A_PLUS_HOMEOWNER_ARTICLE_RULE = `**A+ HOMEOWNER ARTICLE (NON-NEGOTIABLE)**:
1. **Numbers that mean something**: When the topic involves measurable specs, cost, ROI, savings, payback, or production (efficiency %, kWh, kW, CAD/USD, COP, R-value, SEER, rebates, degradation, etc.), include sourced figures with units and explicit currency (CAD for Canadian sites, USD for US sites — infer from connected service area, province/state, or site country; never bare "$" without CAD or USD). Cost/ROI/savings H2s must carry at least two distinct sourced data points when sources provide them (range + driver, or two drivers). Present install and $/W figures as illustrative ranges, not universal prices: qualify with variance drivers (system size, equipment, roof complexity, electrical work, market timing, location). Never invent specs or dollar amounts; if missing from sources, state what drives variance and what to verify.
2. **Regional climate H2**: Write a climate or season H2 only when climate or season changes a decision in THIS connected site's trade (the service this business sells). When the connected site sells SEO, web, ads, or other marketing, climate facts about a client's product category are not a license for a product-trends, insulation, style, or homeowner-product H2. When sources do not show climate drivers for THIS trade, skip a dedicated climate H2; spend that slot on process, comparison, metrics, or recommendation.
3. **Worth-the-extra-cost H2**: When sources show product tiers, the [TRADEOFF] checklist item must answer whether the premium/higher-efficiency/higher-tier option is worth the extra cost for typical local readers, with constraints (roof, usage, budget, payback horizon, market, competition). No vague "it depends" without criteria. When there are no tiers: [TRADEOFF] is when the approach fails or who it is not for, not a fake premium product tier.
4. **No generic filler**: Replace encyclopedia prose with reader decisions, side-by-side comparisons, and field examples from FIRST-PARTY / audit / existing HTML. Forbidden: repeated generic benefits, textbook definitions, restating the Answer definition, copy any site could publish.`;

/** A+ keyword spine: place is a modifier; practitioner knowledge, intent examples, human voice, sourced we-lines. */
export const A_PLUS_KEYWORD_AUTHORITY_RULE = `**A+ KEYWORD AUTHORITY (NON-NEGOTIABLE)**:
The writing keyword is the article's subject. Place names, the connected business, and SEO mechanics are supporting context. Derive every requirement from the writing keyword and listed sources. Never from a hardcoded vertical.
**Trade + keyword (topic contract)**: CONNECTED SITE IDENTITY is the seller. Write as that business serving the searcher behind the writing keyword. If the site sells SEO, web, or ads and the keyword names another industry, the topic is that marketing service for businesses in that industry. Forbidden: product encyclopedia, style trends, SKU catalogs, install how-tos, or homeowner product-choice copy for the industry noun unless FIRST-PARTY CLAIMS, GBP, or inventory show this site sells that product. The only chrome titles are Answer and Overview. Every body H2 is unique and written from the writing keyword. Never invent fixed H2 titles. Never Section N. Exactly one [ILLUSTRATIVE] section. Never a second homeowner-example H2.
1. **Place-entity density (~70% cut)**: When a place entity (street, neighborhood, district, landmark) is present, it is a location modifier, not the topic. Exact entity name at most once per body H2 (skip if the prior H2 already used it); article-wide at most ~3 exact mentions in prose (Answer may use it once). After the first mention prefer here / this area / local. Forbidden: making the place name the grammatical subject of most paragraphs; repeating "{keyword} {entity}" slug stacks; writing a place-history page with the keyword bolted on. If no place entity is present, skip this item. City/region still obeys SERVICE AREA DENSITY.
2. **Keyword-specific practitioner knowledge**: Each body H2 must include at least one fact, constraint, process step, spec, mistake, or decision that a knowledgeable provider for THIS writing keyword would know, taken from FIRST-PARTY CLAIMS, VERIFIED FACTS, audit blocks, existing HTML, or the keyword's meaning. Forbidden: generic local-page filler that would work for any service at this place; encyclopedia of the place; copy that never names a decision unique to the keyword.
3. **Concrete search-intent examples**: In Overview or the first body H2 (no new H2), include 2-3 concrete searcher questions or query examples implied by the writing keyword. Use peopleAlsoAsk / related searches from the SEO brief when present; otherwise paraphrase the decision behind the keyword. Shape: short query plus what the searcher is trying to decide. Forbidden: abstract labels only (informational / commercial intent) with no example queries. Do not invent SERP queries that are not implied by the keyword or brief.
4. **No AI / programmatic voice**: Write as a practitioner answering the keyword, not a template filling slots. Forbidden: slug stacks; "residents of {entity} need {keyword}"; identical sentence stems across paragraphs; knowledge-graph SPO lists or labeled triples; "this article explores"; repeating the writing keyword as the subject of consecutive sentences; H2s that only swap the place name. Vary rhythm. SPO (if used as a planning aid) must read as natural prose.
5. **First-hand connected-business evidence**: Tie 2-4 sourced we/company observations to the writing keyword's job (what we see when serving this searcher), using FIRST-PARTY CLAIMS, audit blocks, GBP, or existing HTML. Use the connected business name from the identity block. Forbidden: hollow "our team"; inventing case studies; NAP/address dumping as expertise; expertise about the place with no keyword job. If no sourced claim exists, use qualitative we-voice with a named decision constraint; never invent campaigns or metrics.
6. **No unsubstantiated local expertise**: "we understand [place] architecture / needs / market" is invalid unless the same paragraph names a sourced local condition (housing era or style, street or exposure pattern, season, building constraint) from listed sources. If sources lack that condition, omit the claim. Do not invent styles, projects, or businesses.`;

/** AISO depth: definitive answers with sourced numbers, comparisons, regional facts, field expertise. */
export const AISO_DEPTH_RULE = `**AISO DEPTH (NON-NEGOTIABLE)**:
1. **Direct answer first**: Open each section with the answer to its H2 (process, comparison, metrics, who it is for, cost, ROI, savings, payback, eligibility, timeline), not a topic definition or history lesson. Forbidden: restating the article Answer definition in a body H2.
2. **Sourced numbers**: When VERIFIED FACTS, SEO brief, FIRST-PARTY CLAIMS, ChatGPT facts, LLM/DFS audit, or existing HTML contain figures, place confirmed figures prominently in the matching section with units plus explicit currency (CAD for Canada, USD for United States). Qualify cost/$/W/ROI ranges as illustrative when Tier 2. One plain-language "so what" sentence per figure. Cost/ROI/savings headings: at least two distinct confirmed data points when VERIFIED FACTS provides them. Property-value claims allowed when CONFIRMED or Tier 2 illustrative with qualification. Never invent figures. If no Tier 1/2 source for one claim, name drivers for that claim only.
3. **Comparisons**: Include at least one A-vs-B or tier comparison somewhere in the article when the topic has options (battery vs no battery, lease vs buy, MURB vs single-family, premium vs standard, national vs local, in-house vs agency).
4. **Regional specificity**: Programs, rates, incentives, climate effects, market patterns, and campaign or install patterns must name Alberta or the connected service area when sources support them. Forbidden: generic national copy when local sources exist.
5. **First-hand expertise**: Each body section includes FIELD OBSERVATION (city or here + named constraint + we see / we recommend when) from listed claims or audit blocks when available. Named constraint matches this site's trade (campaign scope, market, budget, competition; or install constraints when the topic is physical product). Forbidden: hollow "our team" lines without that detail.
6. **Budget use**: Spend the article word budget on sourced detail (examples, comparison rows, regional program facts, process steps, metrics), not repeated generic benefits or dictionary restatement.
7. **No concept repetition**: State each core idea once per article unless a later section adds new data. Forbidden: restating the same benefit or the Answer definition in Overview and multiple body H2s. Replace repeated explanatory sentences with the next distinct fact.`;

/** AISO authority: natural phrasing, claim reasoning, technical accuracy (no extra sections). */
export const AISO_AUTHORITY_PHRASING_RULE = `**AISO AUTHORITY PHRASING (NON-NEGOTIABLE)**:
1. **Natural phrasing (no SEO stubs)**: Forbidden in body copy: dangling tails "for more", "learn more", "read more", or "click here" when not part of a complete natural sentence. Forbidden broken patterns: [noun phrase] for more with no clear object (e.g. "initial cost for more", "energy future for more"). Internal and external links must stay mid-sentence with words before and after the anchor. Never append a link, keyword, page title, plan query, or [[LINK]] after the final period. Forbidden leftover fragment after a finished sentence: ". durable window coverings". After a period, question mark, or exclamation point, the next sentence starts with a capital letter. If you cannot weave a remaining keyword or link inside a sentence you are already writing, STOP. Do not append it.
2. **Conclusion requires mechanism**: Any strong recommendation or regional benefit claim must name at least one cause in the same paragraph (roof area limit, annual sun hours, winter sun angle, temperature coefficient, snow cover, payback horizon, usage pattern, etc.). Forbidden: standalone conclusions ("X is particularly beneficial here") with no because tied to a measurable or observable factor from sources.
3. **Technical accuracy (no spec conflation)**: Do not equate unrelated specs: panel efficiency vs partial-shading tolerance vs low-light or diffuse-light performance vs temperature coefficient vs inverter/optimizer/string layout. Forbidden: implying higher-efficiency panels solve shading, "perform better in sub-optimal conditions" when shade is the issue, that efficiency ratings mitigate shading losses, or that high efficiency automatically means better low-light performance. Forbidden blanket pros: "better performance in low light conditions" or "better in low light" as a default pro of high-efficiency tiers. When low light matters, use conditional wording (e.g. some high-efficiency panels may perform well under lower-light conditions, depending on module technology and design) or name the driver (cell type, bifacial gain, low-light current, etc.) when sources support it. When shading matters, name the actual drivers (MLPE/optimizers, string layout, bypass diodes, tree/structure obstructions, layout changes) — not buying a higher-efficiency module as the fix unless sources explicitly tie them. Prefer qualified, source-bound statements over broad superlatives.
4. **Qualified claims (no blanket pros)**: Pros/cons tables, comparison tables, and benefit lists must not use unqualified universal claims. Use may / can / when / depending on / for models that plus a named factor or source. Each Pros row should carry one specific, verifiable angle, not a generic superlative.
5. **Premium spec ≠ economics**: System-selection and investment tables must separate when a higher-rated spec helps (limited space, tight performance target) from when a standard tier may yield better economics (ample space, cost-sensitive budget). Forbidden row logic: fastest ROI, fastest payback, or best value → choose highest rated spec/tier without cost and payback caveats. Efficiency vs ROI is one instance of this rule, not the only case.
6. **Comfort and energy hedging**: When the topic touches energy bills, heating/cooling load, or shade-driven comfort, use may / can / help / potentially plus variance drivers (window orientation, glazing, schedule, climate, shade type). Forbidden: guaranteed bill reduction, significant long-term savings, or pays for itself without depends-on framing. Match FAQ-level caution in body prose and recommendations.`;

/** True when primary keyword is a comparison (vs / versus). */
export function isComparisonPrimaryKeyword(keyword: string): boolean {
  const k = keyword.trim().toLowerCase();
  return /\bvs\.?\b/.test(k) || /\bversus\b/.test(k);
}

/** True when topic implies manual vs motorized vs smart window covering tiers. */
export function isAutomationTierTopic(keyword: string): boolean {
  const k = keyword.trim().toLowerCase();
  return (
    /\b(smart|motorized|motorised|automated|automation)\b/.test(k) &&
    /\b(blinds?|shade|window|covering|treatment)\b/.test(k)
  );
}

/** Answer block for vs/versus keywords: comparison verdict before stats. */
export const COMPARISON_ANSWER_RULE = `**COMPARISON ANSWER (NON-NEGOTIABLE when keyword contains vs or versus)**:
- Sentence 1: Direct side-by-side verdict. State what costs more, what each option is best for, and the main tradeoff (convenience vs upfront cost, automation vs manual, etc.). Forbidden: stat-only or dictionary-definition openers before the comparison answer.
- Use semantic variants (smart blinds vs traditional blinds, automated vs manual) — not the exact SEO slug as the grammatical subject of sentence 1.
- Later sentences: Sourced cost or spec when VERIFIED FACTS provides it, qualified with variance drivers. Final sentence may name the connected business with one sourced installer detail.`;

/** Manual vs motorized vs smart distinction for window automation topics. */
export const AUTOMATION_TIER_TAXONOMY_RULE = `**AUTOMATION TIER TAXONOMY (NON-NEGOTIABLE when topic compares manual, motorized, or smart window coverings)**:
Early in Answer or the first comparison body H2, distinguish three tiers in plain prose (no extra H2 required):
1. **Traditional/manual**: cord, wand, or manual lift with no motor.
2. **Motorized**: powered operation, usually remote or wall switch — not necessarily app-connected or scheduled.
3. **Smart/automated**: motorized plus app, scheduling, sensors, voice control, or smart-home integration.
Forbidden: using motorized and smart interchangeably without defining the difference. Comparison tables must label rows with the correct tier.`;

/** Overview must use pre-assigned personaName, not invent one. */
export const OVERVIEW_ASSIGNED_PERSONA_RULE = `**OVERVIEW PERSONA NAME (NON-NEGOTIABLE when ASSIGNED ILLUSTRATIVE PERSONA block is present)**:
- When teasing the Real-World Example, use the assigned personaName exactly. Forbidden to invent a different first name.
- When no assigned personaName block is present, do not invent any persona first name in Overview. Say "a labeled real-world hypothetical" without naming the person.
- Forbidden: "hypothetical scenario about {name}" unless {name} matches assigned personaName exactly.`;

/** Anchor text must align with resolved destination page title. */
export const INTERNAL_LINK_ANCHOR_MATCH_RULE = `**INTERNAL LINK ANCHOR MATCH (NON-NEGOTIABLE)**:
- [[LINK:query|anchor]] query must be copied EXACTLY from LINK TARGETS PLAN when that plan is present.
- Anchor text must include at least one distinctive word from the resolved destination page title (from LINK TARGETS PLAN or inventory).
- When LINK TARGETS PLAN lists suggestedAnchor, use that anchor or a close variant with shared title tokens.
- Forbidden: anchor names one product line (e.g. PowerView) while the plan URL resolves to a different product page (e.g. SoftTouch) unless the destination title includes that brand term.
- Forbidden: raw same-site <a href="https://..."> in body sections — placeholders only.
${INTERNAL_LINK_ANCHOR_CASE_RULE}
${INTERNAL_LINKS_PER_SECTION_RULE}`;

export function formatOverviewPersonaTeaserBlock(personaName: string): string {
  const name = personaName.trim();
  if (!name) return "";
  return [
    "--- ASSIGNED ILLUSTRATIVE PERSONA (Overview only — do not paste full scenario) ---",
    `personaName: ${name}`,
    "When teasing the Real-World Example in Overview, use this exact first name only. Forbidden to invent a different name.",
    "--- END ASSIGNED ILLUSTRATIVE PERSONA ---",
  ].join("\n");
}

/** Short sentence-case anchor (2-3 words) from destination page title for link plan prompts. */
export function suggestAnchorFromPageTitle(title: string): string {
  return toSentenceCaseLinkAnchor(title, 3);
}

/** AISO semantic breadth: prefer topic variants over hammering the exact SEO phrase. */
export const AISO_SEMANTIC_BREADTH_RULE = `**AISO SEMANTIC BREADTH (NON-NEGOTIABLE)**:
- Exact writing keyword: once in Answer (required); at most once in Overview if natural; at most once per body H2 when it reads naturally — skip in a section if the prior body section already used the exact phrase.
- Article-wide cap: exact phrase at most ~5 times in prose (Answer counts once; H2 headings do not count).
- Everywhere else: semantic variants (adapt to topic: e.g. panel efficiency, module efficiency, efficiency rating, conversion efficiency, system performance).
- Forbidden: exact phrase in consecutive sentences, in every table row, or as repeated Pros boilerplate.
- **Local phrasing**: After Answer establishes the topic, most topic mentions omit the place entity (~70%). Use weighted **ENTITY KEYWORD VARIANTS** templates for the remaining ~30% (natural grammar) — not "{keyword} {neighborhood} {city}" slug stacks. Forbidden: "the perfect {keyword} {area} needs", "Homes near {keyword} {area} often", "{keyword} {area} residents need".
- AISO factual precision and readability override checklist density targets when they conflict.`;

/** Checklist generation: qualifies FOCUS KEYWORD DENSITY when first-party AISO rules apply. */
export const AISO_CHECKLIST_KEYWORD_RULE = `**AISO CHECKLIST KEYWORD (NON-NEGOTIABLE when FIRST-PARTY AUTHORITY is present)**:
- Prefer semantic variants across the article; do not chase ~1% exact-phrase density at the cost of natural reading.
- Exact Primary Keyword: required in Answer; up to ~4 additional natural body mentions across the full article (not in every Pros row or consecutive paragraphs).
- **[EXACT PRIMARY PER H2]**: At most once per H2 body when natural; skip when the prior body section already used the exact phrase. Synonyms and partials count toward topical coverage elsewhere.
- **[FOCUS KEYWORD DENSITY]**: State semantic breadth plus exact phrase in Answer and sparingly in body — not minimum ~1% exact-phrase stuffing.`;

/** Geo consistency: Answer, cost H2s, scenarios, and illustrative economics use primary service city only. */
export const PRIMARY_CITY_CONSISTENCY_RULE = `**PRIMARY CITY CONSISTENCY (NON-NEGOTIABLE when PRIMARY LOCAL CONTEXT is present)**:
1. Answer, cost bands, typical project examples, scenarios, and [ILLUSTRATIVE] persona copy must anchor to the primary service city from PRIMARY LOCAL CONTEXT only.
2. Forbidden: citing Calgary, Toronto, Vancouver, or any other city for cost bands or local examples when primary city is Edmonton (or another site default) unless this page explicitly targets that market in the keyword or entity.
3. Discard ChatGPT, SERP, and research snippet facts from other Alberta or Canadian cities when they conflict with primary service city — do not paste competitor-city economics into this page.
4. Service topic tokens (product names, brand lines) are never neighborhoods or cities — forbidden "in {product}" scenario phrasing.`;

/** Connected-site commercial article: company perspective, labeled hypothetical, recommendation. */
export const A_LEVEL_CONNECTED_SITE_ARTICLE_RULE = `**A-LEVEL CONNECTED-SITE ARTICLE (NON-NEGOTIABLE)**:
1. **Search intent first**: Answer the decision behind the keyword (what the reader is trying to choose, afford, or avoid), not a dictionary definition or generic topic overview. In Overview or the first body H2, include 2-3 concrete example queries or searcher questions implied by the writing keyword (use peopleAlsoAsk / related searches when present). Forbidden: abstract intent labels with no example queries.
2. **Company perspective**: In body sections, write as we evaluating options — how we quote, what we see on site, what we recommend and why. Use FIRST-PARTY CLAIMS and connected identity when present.
3. **Illustrative scenario (named persona)**: Exactly one [ILLUSTRATIVE] section. Copy the injected ILLUSTRATIVE EXAMPLE block exactly. Short H2 (3-8 words, same length as sibling H2s, no links). Intro <p>, then scenario in <blockquote> (personaName inside quote only). <h3>Recommendation: {short title}</h3>, mandatory recommendation <p> naming the connected business. Forbidden: "A realistic local situation" as the H2; a scenario question as H2 or H3; links inside headings.
4. **Recommendation**: Exactly one [RECOMMENDATION] section that answers "so what should I actually buy?" Blog: extractable Best for {job}: {option} list (4-6 rows when sources have options) plus one closing sentence naming the connected business from the identity block. When SAP PAGE TEMPLATE is present: that extractable list IS the four-column table Product | Best for | Budget | Reason (not a bullet list). No new H2 beyond the SAP Local Recommendation heading.
5. **Watch out for**: On cost, ROI, financing, or rebate topics, name assumptions that skew economics (usage, roof, budget, payback horizon, program eligibility).
6. **When not**: At least two cases where the recommendation may not fit (reuse tradeoff spirit — budget, property type, timeline, shade, access, etc.).
7. **Local analytical**: Service area only when causally relevant — explain why local climate, rates, or rules change the decision, not keyword stuffing.
8. **Take**: Optional closing line on major body sections: **[business name]'s Take:** one sentence of field judgment when natural.
9. **Natural links**: ${INTERNAL_LINK_INTENT_ROUTING_RULE} Never end a sentence with a keyword or <a>.
10. **Resale / property value**: Specific resale premiums (e.g. 3–4%) allowed when VERIFIED FACTS confirmed or Tier 2 FIRST-PARTY/QFO band with illustrative qualification. Otherwise: effect varies by market, ownership model, energy savings, and buyer demand.
11. **Incentives / rebates**: Write program status, store promotions, free upgrades, or sale end dates only when Keyword or Title is already about rebates, incentives, grants, or current offers. Forbidden: pasting promotions or expiration dates into a comparison or how-to article. If queryFanout.programStatusQuery is present and the topic is about programs, use that query plus matching serpByQuery and researchAsOf. Never restate active rebate rates from stale page HTML without a current source.
12. **Repeat guard**: Do not restate the same unsourced statistic in Answer, body, and conclusion.`;

/** Decision precision: contrast hypothetical, when-it-matters matrix, spec vs field performance. Site-agnostic. */
export const A_LEVEL_DECISION_PRECISION_RULE = `**A-LEVEL DECISION PRECISION (NON-NEGOTIABLE — no new H2s)**:
1. **No new sections**: Fit all requirements inside existing checklist H2s. Replace weak table rows instead of adding length.
2. **Spec vs performance**: In Answer or the first body section, distinguish **rated spec** (label rating, efficiency %, SEER, R-value, tier grade, etc.) from **real-world job or system performance** (layout, access, environment, install quality, usage). Forbidden: treating the rated spec alone as a guaranteed field outcome.
3. **Contrast illustrative**: The [ILLUSTRATIVE] section is one worked example: short H2, intro <p>, scenario in <blockquote> (one genderless persona name in prose; scenarioQuestion as a sentence in the intro or quote, never as a heading), <h3>Recommendation: {short titled pick}</h3>, then **mandatory** site-first recommendation <p> (2-3 sentences) that opens with the connected business name as the subject. Forbidden: Recommendation h3 with no following p. Forbidden: "{persona} should…" as the recommendation opener. Forbidden: a long situation/question as H2 or H3. A-vs-B contrast belongs in the when-it-matters matrix, not a second illustrative block.
4. **When-it-matters matrix**: Exactly one [DECISION] or [TABLE] must be a **"When does [key spec/tier] actually matter?"** matrix with columns **Situation | Importance** (Very high / Moderate / Lower / Depends on …). Format each row as \`<li><strong>Situation</strong>: … <strong>Importance</strong>: …</li>\` or a two-column HTML table. Never use em dash (U+2014) or en dash between labels and values. Adapt rows to the topic (space constraint, budget priority, environment, tight target, lowest upfront cost, etc.). Obstruction or shade rows must not equate rated spec with the fix unless sources tie them.
5. **Premium worth-it rule**: The [TRADEOFF] section must state explicit criteria for when paying more for the premium or higher-tier option is worth it — and when it is not. Forbidden: premium spec automatically means faster ROI, payback, or resale premium.
6. **Matrix + persona synergy**: The matrix is the extractable decision rules; the illustrative section is one local worked example with **one** named persona. Do not repeat the same points in both without adding new detail.
7. **If-X-choose-Y**: Across the article, write 2-4 inline sentences of the form "If {named constraint}, choose {option}". Place them in [DECISION] and/or [RECOMMENDATION]. Forbidden: empty "if you want quality" filler. This is in addition to the one chooser table or Choose A when pair.`;

/** Forbidden dual-homeowner pattern (A/B contrast belongs in [DECISION] matrix, not [ILLUSTRATIVE]). */
export const ILLUSTRATIVE_ONE_PERSONA_FORBIDDEN = `Forbidden in [ILLUSTRATIVE]: "Consider two homeowners", "Homeowner A", "Homeowner B", comparing two unnamed homeowners, Situation A/B, or any second persona. Exactly one OpenRouter-assigned personaName — one detailed scenario for this post only.`;

/** Exact HTML/markdown shape: one persona, one decision matching Answer, compact. */
export const ILLUSTRATIVE_PERSONA_OUTPUT_SHAPE = `**ILLUSTRATIVE OUTPUT SHAPE (exact — compact, one decision matching Answer)**:
Do NOT output lead-in labels. Forbidden: the word "Scenario:" anywhere in this section. Do NOT use a persona name as h3. Keep this block **short** — do not add extra paragraphs or expand word count.
After the section H2 (use this section's checklist title exactly — 3-8 words, unique, no links, no place names, no keyword slug. Never retitle it to a stock label. Never write a second homeowner-example H2):
HTML:
<p>{situationHook only — 1-2 sentences: general decision context for readers facing this topic. Introduce the tension at industry/reader level. Forbidden: personaName or any proper name; scenarioQuestion; repeating blockquote prose; "Scenario:" prefix.}</p>
<blockquote><p>{personaName} + scenarioNarrative — 2-3 sentences: the specific stuck moment, ONE choice from the Answer, why they are stuck. Weave scenarioQuestion here as a normal sentence when assigned. Weave the place name inside this sentence as [[LINK:service-area page title|short place]] when CITY INTERNAL LINK is listed. Forbidden: a location cite as the first child of the blockquote; forbidden "{place} —" or "{place} -" before the scenario sentence; forbidden copying situationHook from the intro.}</p></blockquote>
<h3>Recommendation: {specific pick title that matches Answer, short}</h3>
<p>MANDATORY SITE-FIRST: {Connected business name} would recommend / recommends … (2 sentences max: the quote and why it resolves their decision). Forbidden: opening with personaName should, they should, or a generic a-business-should.</p>
Markdown — same shape: ## {this section's checklist title}, summary paragraph, blockquote, ### Recommendation.
${ILLUSTRATIVE_ONE_PERSONA_FORBIDDEN}
Forbidden: "A realistic local situation" or "A realistic local scenario" as the H2; a full scenario question as H2 or H3; Scenario as an H3 heading; any link inside H2 or H3; demonstrating that products exist without a decision; a vertical Answer does not discuss; checklist-dumping every article topic; keyword+location slug in the H2; ending after Recommendation h3 with no p.`;

/** Genderless named persona + connected-business recommendation (site-first POV). */
export const ILLUSTRATIVE_SCENARIO_PERSONA_RULE = `**ILLUSTRATIVE PERSONA + SITE RECOMMENDATION (NON-NEGOTIABLE — connected site)**:
1. **Copy ILLUSTRATIVE EXAMPLE only**: personaName, householdProfile, situationHook, scenarioQuestion, scenarioNarrative, recommendationTitle, recommendationParagraph are assigned by OpenRouter before this section runs. Copy them exactly — forbidden to rename personaName or invent a different persona.
2. **Name in blockquote only**: personaName appears inside blockquote prose — never as <h2> or <h3>.
3. **Decision matching Answer (mandatory)**: Blockquote + recommendation show ONE decision from Keyword + Answer — not a product catalog and not a different vertical.
4. **Short H2, scenario in body**: H2 is a short topic title (3-8 words), like other body H2s. Intro <p> sets general context (situationHook). Blockquote carries personaName + scenarioNarrative. Put scenarioQuestion in the blockquote only. Forbidden: persona names in the intro p; scenarioQuestion in the intro p; scenarioQuestion as H2 or H3; Scenario as an H3 heading.
5. **Compact, non-redundant**: Intro 1-2 sentences (general setup only); blockquote 2-3 sentences (named persona only); recommendation p 2 sentences max. Intro and blockquote must not say the same thing.
6. **Titled recommendation h3 + mandatory paragraph**: Recommendation h3 is a short pick title only. Forbidden: stopping after Recommendation h3 with no <p>. Forbidden: links in H2 or H3.
7. **Site-first recommendation**: Recommendation <p> opens with the connected business name as the grammatical subject ("{Business} would recommend…"). Forbidden: persona-first advice ("{persona} should…").
8. **Answer ceiling**: Economic numbers must not exceed Answer qualification.
9. **One block only**: Forbidden: a second Recommendation pair in this H2.
${ILLUSTRATIVE_PERSONA_OUTPUT_SHAPE}`;

/** Body [ILLUSTRATIVE] H2: mandatory persona scenario + site recommendation (prompt-level; no HTML injectors). */
export const ILLUSTRATIVE_BLOCKQUOTE_RULE = `**ILLUSTRATIVE SCENARIO (NON-NEGOTIABLE)**:
1. Exactly one body H2 carries [ILLUSTRATIVE]: short H2 + intro p + blockquote + h3 titled Recommendation + **mandatory recommendation p (2-3 sentences)**. Forbidden: ending after Recommendation h3 with no following <p>. Forbidden: Scenario as an H3.
2. Ground to Answer: the persona decision must match Answer topic; economic numbers and payback framing must not exceed Answer qualification. When ANSWER GROUNDING block is present, treat Answer text as the topic contract and the ceiling.
3. **ILLUSTRATIVE EXAMPLE block is mandatory**: Copy its structured fields with minimal edit: situationHook → intro p (general context, no persona name), scenarioQuestion + scenarioNarrative → blockquote (personaName inside quote only; never a heading), recommendationTitle → Recommendation h3, recommendationParagraph → following p. Intro and blockquote must not repeat each other. Forbidden to invent or rename the persona. ${ILLUSTRATIVE_ONE_PERSONA_FORBIDDEN}
4. Overview announces the example; the full persona scenario lives only in the [ILLUSTRATIVE] body section. No other body section may output Recommendation h3 blocks or ILLUSTRATIVE EXAMPLE text.`;

/** Non-[ILLUSTRATIVE] body sections: forbid duplicating the worked hypothetical. */
export const NON_ILLUSTRATIVE_HYPOTHETICAL_BAN_RULE = `**NO DUPLICATE HYPOTHETICAL (NON-NEGOTIABLE — this section is NOT [ILLUSTRATIVE])**:
Forbidden in this section: H2 titled "A Local Homeowner Example", "Section 1", any "Section N", "Hypothetical scenario:", "Hypothetical homeowner situation:", Homeowner A/B, <h3>Scenario:</h3> blocks, <h3>Recommendation:</h3> blocks, <blockquote> hypothetical scenarios, or copying ILLUSTRATIVE EXAMPLE leadIn/quoteBody.
The full labeled hypothetical with persona scenarios and site recommendations lives in exactly one other [ILLUSTRATIVE] body section. Use brief inline when/skip-if or one-sentence tradeoff instead. Overview already points readers to Real-World Example — do not repeat that setup here.`;

/** Verified facts from QFO official-source pass are the source of truth for checkable claims. */
export const FACTUAL_VERIFICATION_SOURCE_RULE = `**FACTUAL VERIFICATION (NON-NEGOTIABLE — EVERY CHECKABLE CLAIM)**:
1. **Scope**: ANY specific number, percentage, dollar amount, rate, date, program name, open/closed status, sun-hour or daylight statistic, efficiency band, kWh/kW/$/W figure, payback period, export rate, resale premium, setback distance, or permit rule is a checkable claim.
2. **Publish confirmed**: VERIFIED FACTS status confirmed is Tier 1. Use the figure prominently in the matching H2 and in Answer when relevant. Specificity helps AISEO when defensible.
3. **Tier 2 (economic only)**: FIRST-PARTY CLAIMS or QFO facts with source may supply illustrative install/payback/production bands when not_found officially. Label illustrative, add variance drivers. Never for program status.
4. **contradicted**: Replace the stale page figure with the official current fact in prose. Do not restate the old number as active.
5. **not_found (no Tier 2)**: Do not copy the stale excerpt figure for that claim. Name drivers or verify-with-installer wording for that claim only.
6. **Forbidden**: Stale existing page HTML, contradicted claims, or model-invented figures.
7. **Answer**: When VERIFIED FACTS has confirmed cost, efficiency, or rate rows, Answer sentence 2 must include one confirmed numeric anchor with units and CAD or USD.
8. **asOf**: Tie program status to queryFanout.researchAsOf when stating open/closed/waitlist.`;

export function formatVerifiedFactsPromptBlock(
  facts: VerifiedFact[] | undefined,
  researchAsOf?: string,
): string {
  const rows = facts ?? [];
  const asOf = researchAsOf?.trim() || rows[0]?.asOf?.trim() || "";
  if (!rows.length) {
    return [
      "--- VERIFIED FACTS (SOURCE OF TRUTH — NON-NEGOTIABLE) ---",
      asOf ? `Research as of: ${asOf}` : "",
      "No confirmed official figures were extracted for this run.",
      "Do not invent numbers or copy stale figures from existing page HTML.",
      "Tier 2 only: illustrative economic bands from FIRST-PARTY CLAIMS or QFO when sourced.",
      "Otherwise use qualitative mechanism wording until a source is confirmed.",
      "--- END VERIFIED FACTS ---",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const confirmed = rows.filter((f) => f.status === "confirmed" && f.fact.trim());
  const contradicted = rows.filter((f) => f.status === "contradicted" && f.fact.trim());
  const notFound = rows.filter((f) => f.status === "not_found");

  const lines = [
    "--- VERIFIED FACTS (SOURCE OF TRUTH — NON-NEGOTIABLE) ---",
    asOf ? `Research as of: ${asOf}` : "",
    "",
    "PUBLISH RULE: Keep specificity when defensible. Use CONFIRMED figures prominently. Swap CONTRADICTED stale page figures for official current facts. For NOT FOUND, use Tier 2 illustrative band from FIRST-PARTY CLAIMS if present, else drivers only for that claim.",
  ];

  if (confirmed.length) {
    lines.push("", "CONFIRMED (publish prominently in matching H2 + Answer when relevant):");
    for (const f of confirmed) {
      lines.push(
        `- ${f.claimLabel}: ${f.fact.trim()} (source: ${f.sourceDomain || f.sourceUrl})`,
      );
    }
  }

  if (contradicted.length) {
    lines.push("", "CONTRADICTED (replace stale page claim with official current fact):");
    for (const f of contradicted) {
      lines.push(`- ${f.claimLabel}: official source says: ${f.fact.trim()}`);
    }
  }

  if (notFound.length) {
    lines.push(
      "",
      "NOT FOUND (do not copy stale excerpt number; Tier 2 illustrative band from FIRST-PARTY if available, else drivers only):",
    );
    for (const f of notFound) {
      lines.push(`- ${f.claimLabel}`);
    }
  }

  if (confirmed.filter((f) => /cost|payback|rate|kwh|savings|roi|\$|cad|export/i.test(f.claimLabel)).length >= 2) {
    lines.push(
      "",
      "NUMERIC DENSITY: At least two confirmed economic figures above must appear in cost/ROI/savings sections with units and CAD.",
    );
  }

  lines.push("--- END VERIFIED FACTS ---");
  return lines.join("\n");
}

export const PHRASE_VARIATION_RULE = `**PHRASE VARIATION (MANDATORY)**: Do not repeat the same sentence stem in adjacent paragraphs. Do not repeat the exact primary keyword phrase in consecutive paragraphs — use semantic variants instead. Forbidden stacked openers: "{keyword} offers", "{keyword} provides", "{keyword} involve", "{keyword} systems". Forbidden local stacks: "{keyword} {neighborhood} {city}" repeated as an SEO slug; prefer "homeowners in {neighborhood}, {city}" once entity/location is established. Vary the first clause of each paragraph. Site-first: prefer named products, mount types, room constraints, and sourced numbers over generic publisher phrasing. Unique wording every time is not required; repeating the same opener family across posts on this site is forbidden.`;

export const SERVICE_AREA_DENSITY_RULE = `**SERVICE AREA DENSITY (MANDATORY)**: In each section you write, use the exact service city or region name at most **2 times** total (city + province/state counts as one mention). Prefer "local", "regional", "area", or "homeowners here" for the rest. Never stack the city in consecutive sentences. When a place entity (street, neighborhood, district, landmark) is present, exact entity name at most **once per body H2** (skip if the prior H2 already used it); article-wide at most **~3** exact mentions in prose (Answer may use it once). After the first mention prefer here / this area / local. Place entity is a location modifier, not the topic. See A+ KEYWORD AUTHORITY.`;

export function formatFirstPartyClaimsPromptBlock(claims: FirstPartyClaim[]): string {
  const rows = claims
    .map((c) => `- ${c.text.trim()} (source: ${c.source.trim()})`)
    .filter((line) => line.includes("(source:"));
  if (!rows.length) return "";
  return `--- FIRST-PARTY CLAIMS (include every item about this connected site; skip ChatGPT NAP) ---\n${rows.join("\n")}\n--- END FIRST-PARTY CLAIMS ---`;
}

export function formatChatGptBusinessFactsPromptBlock(text: string): string {
  const body = text.trim();
  if (!body) return "";
  return `--- MANDATORY CHATGPT BUSINESS FACTS (non-negotiable for THIS connected site only) ---
Use only facts about the connected website and this city's programs and rates. Discard same-name firms in other cities or countries. Discard grants, loans, and rates from another province. Do not copy street address, phone, or HQ from this block unless it also appears in FIRST-PARTY CLAIMS with source gbp or master. If a source says a program is closed, keep it closed.
${body}
--- END MANDATORY CHATGPT BUSINESS FACTS ---`;
}

export function chatGptBusinessFactsFromBrief(
  brief: SeoContentBriefV1 | null | undefined,
  swotText?: string,
): string {
  const parts: string[] = [];
  for (const row of brief?.queryFanout?.chatGptByQuery ?? []) {
    const t = row.responseText?.trim();
    if (t) parts.push(t);
  }
  const swot = swotText?.trim();
  if (swot) parts.push(swot);
  return parts.join("\n\n").trim();
}

export type IllustrativeCityServiceAreaLink = {
  pageTitle: string;
  anchor: string;
};

export function formatIllustrativePersonaPromptBlock(
  ex: IllustrativeExample,
  researchAsOf?: string,
  cityServiceArea?: IllustrativeCityServiceAreaLink,
): string {
  const lines = [
    "--- ILLUSTRATIVE EXAMPLE (MANDATORY — copy into [ILLUSTRATIVE] section) ---",
  ];
  if (ex?.personaName?.trim()) {
    lines.push(`personaName (only person in section): ${ex.personaName.trim()}`);
  }
  if (ex.householdProfile?.trim()) lines.push(`householdProfile: ${ex.householdProfile.trim()}`);
  if (ex.situationHook?.trim()) {
    lines.push(
      `situationHook (intro p only — general reader context, no persona name, no question): ${ex.situationHook.trim()}`,
    );
  }
  if (ex.scenarioQuestion?.trim()) {
    lines.push(`scenarioQuestion (blockquote only; never intro p; never a heading): ${ex.scenarioQuestion.trim()}`);
  }
  if (ex.scenarioNarrative?.trim()) {
    lines.push(`scenarioNarrative (blockquote p with personaName — specific stuck moment): ${ex.scenarioNarrative.trim()}`);
  }
  if (ex.recommendationTitle?.trim()) {
    lines.push(`recommendationTitle (h3 after "Recommendation: "): ${ex.recommendationTitle.trim()}`);
  }
  if (ex.recommendationParagraph?.trim()) {
    lines.push(
      `recommendationParagraph (mandatory SITE-FIRST p after Recommendation h3; already opens with Company name): ${ex.recommendationParagraph.trim()}`,
    );
  }
  if (ex.asOf?.trim() || researchAsOf?.trim()) {
    lines.push(`asOf: ${ex.asOf?.trim() || researchAsOf?.trim() || ""}`);
  }
  const targetH2 = ex.illustrativeH2Title?.trim();
  if (!targetH2) {
    throw new Error("Illustrative persona block requires illustrativeH2Title from the planner H2.");
  }
  lines.push(`target H2: ${targetH2} (exact — use this checklist title verbatim in <h2>. Never retitle it. Never write a second homeowner H2.)`);
  if (cityServiceArea?.pageTitle.trim() && cityServiceArea.anchor.trim()) {
    lines.push(
      `CITY INTERNAL LINK (required inside the blockquote sentence): [[LINK:${cityServiceArea.pageTitle.trim()}|${cityServiceArea.anchor.trim()}]]. Weave that placeholder into the scenario sentence. Forbidden: a location cite as the first child of the blockquote. Forbidden: "${cityServiceArea.anchor.trim()} —" or "${cityServiceArea.anchor.trim()} -" before the scenario sentence.`,
    );
  }
  lines.push(
    "Output shape (HTML tags required): <h2>{target H2}</h2> then <p>{situationHook — general intro, no persona name}</p> then <blockquote><p>{personaName} {scenarioNarrative}{scenarioQuestion woven in when assigned}</p></blockquote> then <h3>Recommendation: {recommendationTitle}</h3> then <p>{recommendationParagraph}</p>. Copy persona fields exactly. The H2 MUST start with Scenario: (included in target H2). Intro p introduces the general decision context; blockquote is the named persona story only. Forbidden: persona name in intro p; intro repeating blockquote; scenarioNarrative outside <blockquote>. Forbidden: omitting <blockquote> tags. Forbidden: Scenario as H3; Scenario: in paragraphs; links in headings. Forbidden: a place name cite on top of the blockquote.",
    ILLUSTRATIVE_ONE_PERSONA_FORBIDDEN,
    "Ground to Answer + VERIFIED FACTS. Persona decision must match Keyword + Answer topic. Recommendation p is site-first (Company would recommend…), never persona-first (persona should…). Natural local phrasing only — no keyword+location slug stuffing.",
    "--- END ILLUSTRATIVE EXAMPLE ---",
  );
  return lines.join("\n");
}

export function formatIllustrativeExamplePromptBlock(
  brief: SeoContentBriefV1 | null | undefined,
): string {
  const ex = brief?.queryFanout?.illustrativeExample;
  if (!ex?.illustrativeH2Title?.trim()) return "";
  return formatIllustrativePersonaPromptBlock(ex, brief?.queryFanout?.researchAsOf);
}

export function buildFirstPartyAuthorityPromptBlock(input: {
  claims?: FirstPartyClaim[];
  chatGptFacts?: string;
  includeWritingRules?: boolean;
}): string {
  const chunks: string[] = [];
  if (input.includeWritingRules !== false) {
    chunks.push(FIRST_PARTY_AUTHORITY_WRITING_RULE, PHRASE_VARIATION_RULE);
  }
  const claimsBlock = formatFirstPartyClaimsPromptBlock(input.claims ?? []);
  if (claimsBlock) chunks.push(claimsBlock);
  const factsBlock = formatChatGptBusinessFactsPromptBlock(input.chatGptFacts ?? "");
  if (factsBlock) chunks.push(factsBlock);
  return chunks.join("\n\n").trim();
}

export function firstPartyAuthorityBlockFromBrief(
  brief: SeoContentBriefV1 | null | undefined,
  swotText?: string,
): string {
  const chunks = [
    formatVerifiedFactsPromptBlock(
      brief?.queryFanout?.verifiedFacts,
      brief?.queryFanout?.researchAsOf,
    ),
    buildFirstPartyAuthorityPromptBlock({
      claims: brief?.firstPartyClaims,
      chatGptFacts: chatGptBusinessFactsFromBrief(brief, swotText),
    }),
  ].filter(Boolean);
  return chunks.join("\n\n").trim();
}

export type SiteOpenerPost = {
  excerpt?: string;
  title?: string;
  link?: string;
};

const USED_OPENERS_MAX = 15;

/** First sentence from excerpt or HTML. Structural split only, not semantic matching. */
export function extractLeadSentence(htmlOrText: string): string {
  const plain = String(htmlOrText || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "";
  const cut = plain.match(/^(.{12,240}?[.!?])(?:\s|$)/);
  return (cut?.[1] || plain.slice(0, 180)).trim();
}

/** Sibling-post lead sentences so new intros do not copy stems already on this site. */
export function formatSiteUsedOpenersPromptBlock(
  posts: SiteOpenerPost[] | undefined,
  currentPageUrl?: string,
): string {
  if (!posts?.length) return "";
  const current = (currentPageUrl || "").replace(/\/+$/, "").toLowerCase();
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const post of posts) {
    if (lines.length >= USED_OPENERS_MAX) break;
    const link = (post.link || "").replace(/\/+$/, "").toLowerCase();
    if (current && link && link === current) continue;
    const lead = extractLeadSentence(post.excerpt || "");
    if (lead.length < 12) continue;
    const key = lead.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`- ${lead}`);
  }
  if (!lines.length) return "";
  return `--- ALREADY USED OPENERS ON THIS SITE (do not copy) ---
These are lead sentences from other published posts on this connected site. Do not reuse their stems, verbs, or sentence shapes. Unique every time is not required; sounding the same as these intros is forbidden.
${lines.join("\n")}
--- END ALREADY USED OPENERS ---`;
}

/** Ensures connected business name and service area appear in generated copy. */
export function buildConnectedSiteIdentityBlock(
  companyName?: string,
  serviceArea?: string,
): string {
  const name = companyName?.trim();
  const area = serviceArea?.trim();
  if (!name && !area) return "";
  const lines = [
    "**CONNECTED SITE IDENTITY (MANDATORY)**: Write as this business, not a generic publisher.",
  ];
  if (name) lines.push(`Business name (use when a sentence carries a sourced claim): ${name}`);
  if (area) lines.push(`Primary service area: ${area}`);
  lines.push(
    "Do not open every article with the company name. Lead with a sourced fact or stat. In Answer, mention this exact business name somewhere in the Answer paragraph. Do not skip the name.",
    SERVICE_AREA_DENSITY_RULE,
  );
  return lines.join("\n");
}

export function swotTextFromResearchFields(input: {
  promptModifier?: string;
  seoResearch?: string;
}): string {
  const modifier = input.promptModifier?.trim() ?? "";
  const research = input.seoResearch?.trim() ?? "";
  if (!research) return modifier;
  try {
    const parsed = JSON.parse(research) as { version?: unknown; focusKeyword?: unknown };
    if (parsed && typeof parsed === "object" && parsed.version === 1 && parsed.focusKeyword) {
      return modifier;
    }
  } catch {
    // CSV / SWOT prose, not a brief
  }
  return [modifier, research].filter(Boolean).join("\n\n");
}
