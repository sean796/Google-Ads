---
title: "Agentic Engineering Field Guide & Study Playbook"
slug: mastra/agentic-study-guide
section: Mastra
order: 35
related:
  - mastra/overview
  - mastra/workflows-and-steps
  - mastra/agents-and-models
  - mastra/agent-registry
  - mastra/playbook-index
---

<!-- manual -->

Complete insider study guide for explaining **NEO Pulse** to senior AI engineers, agentic framework builders, technical founders, and enterprise buyers.

---

## 1. Vocabulary Translation Matrix (Beginner vs. Senior Agentic Engineer)

When talking to agentic engineers, the words you choose signal immediately whether you built a wrapper or a real agentic harness.

| Beginner Phrase (Avoid) | Agentic Engineer Term (Use This) | How It Maps to NEO Pulse |
| --- | --- | --- |
| "We send a prompt to ChatGPT/OpenRouter" | **Bounded Agent Invocation via Category Router** | `createPulseAgent` (`src/lib/agent-pipeline/index.ts`) resolves a functional category (`research`, `blog`, `meta`, etc.) at runtime via `resolveModelForAgentCategory(category, siteId)`. |
| "We chained a few prompts together" | **Deterministic DAG / Multi-Step Workflow Orchestration** | `createStep` and `createWorkflow` with `.then()`, `.parallel()`, `.branch()`, and `.commit()` execute typed state transitions rather than brittle prompt chains. |
| "We told the AI to return JSON" | **Contract-First Schema Validation (`zod` Boundary Enforcement)** | Every `PulseAgent` and `PulseStep` validates `inputSchema.parse()` before execution and `outputSchema.parse()` after `parseJsonStrict`. |
| "We clean up the AI output with regex if it messes up" | **Prompt-Level Contract Fix & Fail-Fast Boundary** | Zero regex workarounds. If an output fails `outputSchema`, the step throws a structured error at the boundary (`phase: "error"`). |
| "We pass client info in the prompt" | **Automated Context Engineering & System-Level Injection** | Agents declare `useMasterInstructions: true` and `useWordBlacklist: true`; the harness injects site GBP/SWOT rules and forbidden lexicon at the transport layer. |
| "We generate a whole blog post at once" | **Checklist -> Multi-Agent Blueprint -> Parallel Worker Fan-Out** | `blog.checklist.generator` -> `blog.blueprint.generator` -> `blog.harness.section-writer` running in parallel Web Workers, followed by `blog.harness.html-qc`. |
| "We show a loading spinner while the AI works" | **Pre-Allocated Step Telemetry & Artifact Streaming (Zero CLS)** | `workflow.getPipelineTitles()` reserves fixed-height UI slots before execution; `onStepProgress` and `onArtifact` stream live state and downloadable JSON/HTML audit files. |
| "We let the AI search the web" | **Topic Fan-Out (QFO) & Grounded Claim Verification** | `aiseo.research.topic-fanout-planner` plans queries, pulls SERP/GSC/first-party data on the server, and `aiseo.research.factual-verification` verifies claims against authority domains before copywriting. |

---

## 2. Inside-Out Architecture: The 5 Pillars of NEO Pulse

1. **The Mastra Pipeline Core (`src/lib/agent-pipeline/index.ts`)**
   - Implements Mastra's core primitives (`createPulseAgent`, `createStep`, `createWorkflow`) with **zero Node.js built-ins** so the exact same definitions run in Vite, Web Workers, and Capacitor while routing all I/O through server-side PHP endpoints.
2. **The 37-Agent Registry (`src/lib/agent-pipeline/pulse-agent-registry.ts`)**
   - Every AI capability in the codebase is cataloged in `PULSE_AGENT_REGISTRY` across **10 domains** (`aiseo`, `blog-generator`, `entity-sap`, `sitemap-optimizer`, `competitor-research`, `reporting`, `ppc-ads`, `video`, `wikipedia`, `emcp`).
3. **The 7 Functional Model Categories (`src/lib/openrouter-agent-category-api.ts`)**
   - Zero hardcoded model strings in application code (enforced by `src/lib/__tests__/universal-agent-contract.test.ts`).
   - Categories: `research`, `blog`, `image`, `meta`, `report`, `ads`, `video`.
   - Synchronous persistence (`writeGlobal*AgentModel`) updates both global keys and per-site `optimization_settings_{siteId}` overrides in `localStorage`, backed by PHP server resolution (`Neo_Pulse_App_Openrouter_Agent_Models::resolve`).
4. **Details Drawer & Generated Files Contract (`docs/api/aiseo/overview.md`)**
   - Every workflow step maps 1:1 to a row in the **Details** drawer (`waiting` -> `generating` -> `done` / `error`) and emits downloadable proof files (`PulseStepArtifact`) into `urlGeneratedFiles[url]`.
5. **Offline Mastra Playbook for Coding Agents (`docs/api/mastra/playbook/`)**
   - 304 official Mastra documentation and API reference pages are scraped and indexed locally so coding agents working on NEO Pulse never hallucinate framework APIs.

---

## 3. Deep-Dive Scenarios: How to Answer Tough Questions Like an Architect

### Scenario 1: Autonomous Agent Loops vs. Deterministic Workflows
- **Their Question:** *"Why don't you just give one ReAct / tool-calling agent access to WordPress and let it figure out how to optimize the page?"*
- **Your Core Principle:** Unbounded agent loops are great for open-ended chat, but terrible for production publishing where latency, token cost, and destructive writes matter.
- **Your Answer:**
  - "In production AI engineering, we separate **agency** from **orchestration**. If you let an unconstrained ReAct loop decide how to optimize a live WordPress page, it might skip keyword grounding, hallucinate an internal link URL, or overwrite ACF fields out of order. Instead, we use **Mastra workflows** (`createWorkflow`) for the macro control flow and **bounded Mastra agents** (`createPulseAgent`) for each cognitive step. The workflow guarantees that research, SERP grounding, and internal link inventory resolution happen *before* the writer agent runs, and that `zod` schema validation passes *before* the WordPress REST step executes."

### Scenario 2: Preventing Hallucinations & Grounding (RAG / QFO)
- **Their Question:** *"How do you stop your agents from making up fake statistics, fake local laws, or fake company claims?"*
- **Your Core Principle:** Grounding happens *upstream* via Query Fan-Out (QFO) and first-party extraction, never by hoping the writer model "knows" the truth.
- **Your Answer:**
  - "We don't ask a writing model to invent facts. Our **Research All** pipeline runs a multi-agent grounding pass first:
    1. `aiseo.research.topic-fanout-planner` decomposes the target URL and focus keyword into localized buyer questions and named municipal/utility programs.
    2. `aiseo.research.first-party-claims` extracts verified business facts strictly from first-party sources (GBP Master Rules, SWOT notes, and verified authority responses).
    3. `aiseo.research.factual-verification` extracts checkable claims from existing copy and verifies them against official government/authority domains.
    4. Only that verified research brief is injected into the downstream `blog` and `meta` agents."

### Scenario 3: Long-Form Content Without Context Degradation
- **Their Question:** *"When an LLM writes a 2,500-word article in one shot, the second half always gets repetitive and generic. How does your harness solve that?"*
- **Your Core Principle:** Decompose long-form generation into a **Checklist -> Blueprint -> Parallel Section Writer -> HTML QC** pipeline.
- **Your Answer:**
  - "We never generate a full article in a single completion. We use a four-stage multi-agent harness:
    1. `blog.checklist.generator` (`research` category) analyzes SERP People-Also-Ask, Semrush clusters, and the research brief to produce an intent-ordered section checklist.
    2. `blog.blueprint.generator` (`research` category) converts that checklist into a typed JSON blueprint where each H2 section has its own scoped objective, entities, and internal/external link targets.
    3. `blog.harness.section-writer` (`blog` category) fans out across **parallel Web Workers**, streaming each H2 section independently with focused context so attention never degrades.
    4. `blog.harness.html-qc` (`blog` category) runs a post-stitch quality control pass to repair any leaked markdown or malformed tags before WordPress upload."

### Scenario 4: Internal Linking Without 404 Hallucinations
- **Their Question:** *"LLMs love to invent URLs like `/contact-us` or `/services/plumbing` that don't actually exist on the client's site. How do you handle internal linking?"*
- **Your Core Principle:** Constrained candidate selection from verified live WordPress inventory.
- **Your Answer:**
  - "Our internal linking agent (`aiseo.content.links`) is never allowed to invent a URL. First, our server-side WordPress inventory endpoint pulls the live published URL catalog for the site. Then `aiseo.content.links` receives that verified candidate list along with the current article's sections and selects the highest-intent target URLs and natural 2-5 word contextual anchor phrases. Every link injected into the HTML is guaranteed to resolve to a real, live post or service page."

### Scenario 5: Structured Output & Why Regex Workarounds Are Banned
- **Their Question:** *"What happens when a model returns markdown code fences around JSON or misses a field?"*
- **Your Core Principle:** Fix the contract at the prompt/schema level; validate strictly at the boundary; fail fast visibly.
- **Your Answer:**
  - "We enforce a strict **No-Workarounds, Contract-First** rule across the codebase. When a `PulseAgent` declares a non-string `outputSchema` in `zod`, `createPulseAgent` automatically sets `response_format: { type: 'json_object' }`, parses the payload with `parseJsonStrict`, and validates it through `outputSchema.parse()`. We don't write brittle regex hacks to guess what a broken completion meant. If validation fails, the step immediately transitions to `phase: 'error'` in the Details drawer and surfaces the exact schema violation."

### Scenario 6: Model Routing, Cost vs. Intelligence, and Zero Vendor Lock-In
- **Their Question:** *"Are you locked into OpenAI or Anthropic? How do you balance reasoning quality against token cost across so many agents?"*
- **Your Core Principle:** Functional category abstraction over OpenRouter.
- **Your Answer:**
  - "We route 100% of LLM calls through **OpenRouter** using **7 functional category variables**: `research`, `blog`, `image`, `meta`, `report`, `ads`, and `video`. Deep analytical agents like `sitemap.optimizer.cluster` or `aiseo.research.topic-fanout-planner` bind to the `research` category (defaulting to high-speed reasoning models like `deepseek/deepseek-v4.1-flash`), while high-fluency HTML rewriters bind to `blog` or `meta` (`google/gemini-2.5-flash`), and multimodal visual synthesis binds to `image` (`google/gemini-3.1-flash-image`). We can swap any category's model globally or per-client in **Dashboard -> AI & Models** in one click, and our unit test suite (`universal-agent-contract.test.ts`) fails the build if anyone ever hardcodes a model string in `src/`."

### Scenario 7: Multimodal Vision Grounding for AI Images
- **Their Question:** *"AI-generated blog images usually look like cheesy stock sci-fi art. How do your image agents produce realistic, on-brand visuals?"*
- **Your Core Principle:** Three-agent visual pipeline: Scene Checklist -> Real-World Reference Vision Scoring -> Multimodal Generation + SEO Slug.
- **Your Answer:**
  - "We don't just pass a blog title to an image model. We run a coordinated 4-agent visual pipeline:
    1. `image.checklist.planner` (`research`) reads the article/section copy and outputs concrete visual scene requirements and physical plausibility rules.
    2. `image.reference.vision-picker` (`research`) queries DataForSEO Google Images for real-world photos of the topic/locality and uses multimodal vision to score and pick the most authentic reference image.
    3. `image.generator.openrouter` (`image`) generates the 16:9 featured or 1:1 in-content image grounded in that reference and checklist.
    4. `image.filename.seo-slug` (`meta`) generates a clean 3-8 word hyphenated SEO filename before uploading to WordPress Media."

### Scenario 8:Modifying Complex Page Builders (Elementor & ACF) Safely
- **Their Question:** *"WordPress sites aren't just plain HTML posts anymore; they use Elementor JSON trees and ACF fields. How do your agents edit those without breaking the layout?"*
- **Your Core Principle:** Structure-preserving AST/JSON decomposition; rewrite text nodes and SEO fields in place without mutating layout containers.
- **Your Answer:**
  - "For Elementor pages, `aiseo.content.elementor` decomposes the Elementor JSON widget tree, identifies heading and text-editor widgets in document order, rewrites the copy and internal links inside those specific widget settings, and reassembles the exact Elementor structure. For ACF-driven templates (like FAQ schema `seo_faq` or supplementary `seo_extra_text`), dedicated agents (`aiseo.meta.faq` and `aiseo.content.extra-text`) generate schema-validated payloads that write directly to the corresponding WordPress ACF REST endpoints."

### Scenario 9: Semantic Sitemap & Cannibalization Architecture
- **Their Question:** *"How do you handle a site with 500 posts where dozens of articles are cannibalizing the same keywords?"*
- **Your Core Principle:** AI-first semantic clustering (`sitemap.optimizer.cluster`) over naive keyword-overlap formulas.
- **Your Answer:**
  - "Instead of using primitive string similarity or regex, our `sitemap.optimizer.cluster` agent (`research` category) ingests the site's URL inventory, titles, meta, and GSC query performance, groups URLs by true buyer search intent and entity overlap, flags keyword cannibalization clusters, and outputs a structured 301 redirect and content consolidation plan."

### Scenario 10: Local SEO & Service-Area Page (SAP) Scaling
- **Their Question:** *"When agencies build local Service-Area Pages for 20 neighborhoods, Google flags them as doorway pages if they just swap the city name. How do your agents avoid that?"*
- **Your Core Principle:** Geographically grounded entity workflows (`entity.sap.*` + `wikipedia.entity.resolver` + Local Dominator grid data).
- **Your Answer:**
  - "We never do find-and-replace city spinning. Our Local SEO pipeline combines **Local Dominator rank-grid data** (`entity.sap.strategy-from-grid`), **verified MediaWiki/Wikipedia geographic entity facts** (`wikipedia.entity.resolver`), and **illustrative buyer persona scenarios** (`aiseo.research.illustrative-persona`). Each SAP page gets unique neighborhood entities, local landmarks, service-specific decision hooks, and localized titles/meta (`entity.sap.title-agent`, `entity.sap.meta-agent`)."
