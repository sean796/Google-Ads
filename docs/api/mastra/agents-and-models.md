---
title: Agents & Category Model Routing
slug: mastra/agents-and-models
section: Mastra
order: 20
related:
  - mastra/overview
  - mastra/workflows-and-steps
  - mastra/agent-registry
---

<!-- manual -->

Every LLM agent in NEO Pulse is created with `createPulseAgent` (`src/lib/agent-pipeline/index.ts`) or invoked via `callAgentCategoryOpenRouterChat` / `streamAgentCategoryOpenRouterChat` (`src/lib/openrouter-agent-category-api.ts`).

Agents **never** hardcode an OpenRouter model string. Instead, each agent specifies one of the **seven Pipeline Agent categories** configured in **Dashboard -> AI & Models**.

## The Seven Pipeline Agent Categories

| Category (`AgentOpenRouterCategory`) | Getter (`optimization-settings-storage.ts`) | Global `localStorage` Key | Site Override Field (`optimization_settings_{siteId}`) | Default Model | Primary Responsibilities |
| --- | --- | --- | --- | --- | --- |
| **`research`** | `getResearchModel(siteId)` | `neo-pulse-agent-research-model` | `researchModel` | `deepseek/deepseek-v4.1-flash` | Research All (Topic Fan-out planner, factual verification, first-party claims), Blog Checklist, Blueprint, Link targets, Extra Text, Scenario placement & persona extraction, In-Content & Featured Image checklists/vision grounding, Sitemap Optimizer, Competitor Research, SAP Strategy |
| **`blog`** | `getBlogModel(siteId)` / `getProductionModel(siteId)` | `neo-pulse-agent-blog-model` | `model` | `google/gemini-2.5-flash` | Blog Optimization H2 section writers, AISEO Answer, AISEO Overview, AISEO Headers, AISEO Links, AISEO Scenario HTML writer, Elementor section & page rewrites |
| **`image`** | `getImageModel(siteId)` | `neo-pulse-agent-image-model` | `imageModel` | `google/gemini-3.1-flash-image` | AISEO Featured image generation, AISEO In Content Image generation, SAP Generate Local Image, Extra Image, standalone Image Generator |
| **`meta`** | `getMetaModel(siteId)` | `neo-pulse-agent-meta-model` | `metaModel` | `google/gemini-2.5-flash` | AISEO All Meta, AISEO Titles, AISEO Meta Description (MD), AISEO FAQs & FAQ intro, AISEO Keywords (Content & Entity single/batch), SEO URL slugs, SEO image filename slugs |
| **`report`** | `getReportModel(siteId)` | `neo-pulse-agent-report-model` | `reportModel` | `deepseek/deepseek-v4.1-flash` | GSC Reporting outline & section writers, Organic Reporting highlights, Workplace Call Transcript Summarizer |
| **`ads`** | `getAdsModel(siteId)` | `neo-pulse-agent-ads-model` | `adsModel` | `deepseek/deepseek-v4.1-flash` | Google Ads & Meta PPC reporting and ad copy agents |
| **`video`** | `getVideoModel(siteId)` | `neo-pulse-agent-video-model` | `videoModel` | `heygen/video-1` | Storyboard-to-video clip generation in the Video Generator |

## Creating a Mastra-Style Agent (`createPulseAgent`)

```typescript
import { z } from "zod";
import { createPulseAgent } from "@/lib/agent-pipeline";

export const faqIntroAgent = createPulseAgent({
  id: "aiseo.meta.faq-intro",
  label: "AISEO FAQ Intro Paragraph Agent",
  category: "meta", // Resolves getMetaModel(siteId) dynamically at runtime
  domain: "aiseo",
  reason: "Writes a one-paragraph editorial lead-in before the appended FAQ H2 section.",
  useMasterInstructions: true,
  useWordBlacklist: false,
  temperature: 0.35,
  maxTokens: 384,
  inputSchema: z.object({
    focusKeyword: z.string(),
    pageTitle: z.string(),
    questions: z.array(z.string()),
  }),
  outputSchema: z.string(),
  buildSystemPrompt: () => "Write one concise FAQ intro paragraph in HTML (<p>...</p>).",
  buildUserPrompt: (input) => JSON.stringify(input),
});
```

## Resolution Order & Synchronous Switching

Model resolution is centralized in `src/lib/optimization-settings-storage.ts` and `src/lib/global-agent-models.ts`:

1. **Synchronous Global Persistence:** When a user selects a model in **Dashboard -> AI & Models**, `Index.tsx` and `ManagerSettingsContent.tsx` call `writeGlobal*AgentModel(modelId)` synchronously before React re-renders.
2. **Site Storage Synchronization:** `writeGlobal*AgentModel(modelId)` writes the global `neo-pulse-agent-*-model` key **and** updates the matching field in any stored `optimization_settings_{siteId}` entries in `localStorage` so stale site defaults never mask a newly selected global model.
3. **Runtime Evaluation:** Every `PulseAgent.run()`, `PulseAgent.stream()`, and AISEO hook resolves `resolveModelForAgentCategory(category, siteId)` at call time.
