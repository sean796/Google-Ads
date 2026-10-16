---
title: Workflows & Steps (createStep / createWorkflow)
slug: mastra/workflows-and-steps
section: Mastra
order: 10
related:
  - mastra/overview
  - mastra/agents-and-models
  - mastra/agent-registry
  - aiseo/generated-files
---

<!-- manual -->

Multi-step pipelines in NEO Pulse are built with `createStep` and `createWorkflow` from `src/lib/agent-pipeline/index.ts`.

## 1. Defining a Step (`createStep`)

Each step defines its `id`, `title` (rendered as the row label in the **Details** drawer), `inputSchema` (`zod`), `outputSchema` (`zod`), optional `artifact` builder (for **Generated files**), and `execute` function:

```typescript
import { z } from "zod";
import { createStep } from "@/lib/agent-pipeline";

export const deriveKeywordStep = createStep({
  id: "derive-keyword",
  title: "AI keywords (content)", // Displayed as the step row in the Details drawer
  inputSchema: z.object({ url: z.string(), title: z.string(), focusKeyword: z.string() }),
  outputSchema: z.object({ url: z.string(), focusKeyword: z.string() }),
  artifact: (output) => ({
    name: "focus-keyword.json",
    content: JSON.stringify(output, null, 2),
    mimeType: "application/json;charset=utf-8",
  }),
  execute: async ({ inputData }) => ({
    url: inputData.url,
    focusKeyword: inputData.focusKeyword.trim(),
  }),
});
```

## 2. Composing a Workflow (`createWorkflow`)

Chain steps sequentially with `.then()`, run steps concurrently with `.parallel([...])`, route conditionally with `.branch([...])`, and finalize with `.commit()`:

```typescript
import { z } from "zod";
import { createWorkflow } from "@/lib/agent-pipeline";

export const keywordWorkflow = createWorkflow({
  id: "aiseo.keywords.workflow",
  runKind: "contentKw",
  inputSchema: z.object({ url: z.string(), title: z.string(), focusKeyword: z.string() }),
  outputSchema: z.object({ ok: z.boolean(), url: z.string() }),
})
  .then(deriveKeywordStep)
  .then(postContentStep)
  .then(wpUploadStep)
  .commit();
```

## 3. Running a Workflow with Details Drawer Hooks

```typescript
// 1. Pre-populate fixed-height Details drawer slots before execution (zero CLS):
const pipelineTitles = keywordWorkflow.getPipelineTitles();

// 2. Run the workflow and stream step status + generated files:
const { output, artifacts } = await keywordWorkflow.run(inputData, {
  siteId: site.id,
  apiKey: openRouterApiKey,
  onStepProgress: (ev) => {
    // ev.stepId, ev.title, ev.sectionIndex, ev.totalSections, ev.phase ("start" | "done" | "error")
  },
  onArtifact: (file) => {
    // file.name, file.content, file.mimeType -> attached to urlGeneratedFiles[url]
  },
});
```

## Control Flow Methods

| Method | Behavior |
| --- | --- |
| `.then(step)` | Runs `step` sequentially, passing the validated output of the previous step into `step.inputSchema`. |
| `.parallel([stepA, stepB])` | Runs all steps in the array concurrently via `Promise.all` and returns `{ [stepA.id]: outA, [stepB.id]: outB }`. |
| `.branch([{ condition, step }])` | Evaluates `condition(currentOutput, context)` in order and executes the first matching branch step. |
| `.commit()` | Seals the workflow builder and returns a runnable `PulseWorkflow` with `.getPipelineTitles()` and `.run()`. |
