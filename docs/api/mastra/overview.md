---
title: Mastra Overview & Architecture
slug: mastra/overview
section: Mastra
order: 0
related:
  - mastra/workflows-and-steps
  - mastra/agents-and-models
  - mastra/agent-registry
  - mastra/playbook-index
  - mastra/playbook/agents-and-subagents
  - mastra/playbook/workflows
  - aiseo/overview
---

<!-- manual -->

NEO Pulse implements a browser-safe **Mastra** agent and workflow engine (`src/lib/agent-pipeline/index.ts` and `src/lib/agent-pipeline/pulse-agent-registry.ts`) on top of `POST /api/openrouter/chat-completion` and `zod`.

## Why Mastra Architecture in NEO Pulse

Standard `@mastra/core` provides the cleanest TypeScript primitives for agents and deterministic multi-step workflows (`createStep`, `createWorkflow`, `.then()`, `.parallel()`, `.branch()`, `.commit()`), while NEO Pulse runs in a Vite browser + Capacitor bundle against a WordPress PHP `/api/openrouter/chat-completion` proxy.

`src/lib/agent-pipeline/` implements the Mastra workflow and agent specification with:
1. **Zero Node.js built-ins** (100% compatible with Vite and Capacitor builds).
2. **Category-Bound Model Variables:** Every Mastra agent in NEO Pulse declares `category: AgentOpenRouterCategory` (`"research" | "blog" | "image" | "meta" | "report" | "ads" | "video"`) rather than a hardcoded model string.
3. **Automatic Details Drawer & Artifact Integration:** Every `createStep` and `createWorkflow` automatically drives the **Details** drawer step rows (`waiting` -> `generating` -> `done` / `error`) and attaches downloadable files into `urlGeneratedFiles[url]`.

## Core Modules

| File | Role |
| --- | --- |
| `src/lib/agent-pipeline/index.ts` | Mastra-style `createPulseAgent`, `createStep`, `createWorkflow`, `.then()`, `.parallel()`, `.branch()`, `.commit()` |
| `src/lib/agent-pipeline/pulse-agent-registry.ts` | `PULSE_AGENT_REGISTRY` cataloging all 37 agents across 10 domains with `id`, `category`, `domain`, `label`, and `reason` |
| `src/lib/openrouter-agent-category-api.ts` | Category-to-model resolver (`resolveModelForAgentCategory`) and OpenRouter transport executors |
| `wordpress-plugins/neo-pulse-app/includes/openrouter/class-openrouter-agent-models.php` | PHP backend category model resolver (`Neo_Pulse_App_Openrouter_Agent_Models::resolve`) |
| `src/lib/__tests__/universal-agent-contract.test.ts` | Contract suite verifying `createPulseAgent`, `createStep`, `createWorkflow`, `PULSE_AGENT_REGISTRY`, and zero hardcoded model literals across `src/` |

## Local Mastra Playbook for Coding Agents

The entire official Mastra playbook and core API reference (304 canonical upstream pages from `https://mastra.ai/llms.txt`) is scraped and stored locally in `docs/api/mastra/` so every coding agent instance can read exact Mastra specifications offline without external web fetches:

| Local File | Slug | Contents |
| --- | --- | --- |
| `docs/api/mastra/playbook-index.md` | `mastra/playbook-index` | Complete Mastra `llms.txt` index and local playbook map |
| `docs/api/mastra/playbook/agents-and-subagents.md` | `mastra/playbook/agents-and-subagents` | Agents overview, tools, structured output, human-in-the-loop, guardrails, processors, code mode, subagents, skills |
| `docs/api/mastra/playbook/workflows.md` | `mastra/playbook/workflows` | Workflows overview, state, control flow, agents & tools, dynamic workflows, snapshots, suspend & resume, human-in-the-loop, time travel, error handling, scheduled workflows |
| `docs/api/mastra/playbook/harness.md` | `mastra/playbook/harness` | Harness overview, durable agents, background tasks, goals, schedules, signals, signal providers, agent controller |
| `docs/api/mastra/playbook/memory.md` | `mastra/playbook/memory` | Memory overview, message history, observational memory, working memory, semantic recall, memory processors, multi-user threads |
| `docs/api/mastra/playbook/guides-and-context.md` | `mastra/playbook/guides-and-context` | Multi-agent systems, context engineering, agent lifecycle, authentication, MCP auth, streaming, eval loops |
| `docs/api/mastra/playbook/evals-and-observability.md` | `mastra/playbook/evals-and-observability` | Evals, built-in & custom scorers, quick checks, gates & verdicts, multi-turn, CI/Vitest, datasets, experiments, tracing, logging, metrics |
| `docs/api/mastra/playbook/connections-and-sandboxes.md` | `mastra/playbook/connections-and-sandboxes` | MCP, A2A, ACP, SDK agents, sandboxes (filesystem, search, skills, computer, LSP), channels, browser |
| `docs/api/mastra/playbook/server-auth-and-deploy.md` | `mastra/playbook/server-auth-and-deploy` | Storage, server adapters, middleware, request context, pubsub, custom routes, Mastra client, Studio, Auth, Deployment |
| `docs/api/mastra/playbook/models-and-platform.md` | `mastra/playbook/models-and-platform` | Model router, embeddings, environment variables, gateways, providers, Mastra Platform |
| `docs/api/mastra/playbook/reference-agents-and-tools.md` | `mastra/playbook/reference-agents-and-tools` | Full API Reference for `Agent`, `.generate()`, `.stream()`, `createTool()`, processors, streaming, and `AgentController` |
| `docs/api/mastra/playbook/reference-workflows-core-and-memory.md` | `mastra/playbook/reference-workflows-core-and-memory` | Full API Reference for `Workflow`, `createStep`, `createWorkflow`, `Mastra` core, `Memory`, signals, schedules, and workspaces |

To refresh the scraped playbook from upstream `https://mastra.ai/llms.txt`, run `node scripts/api-docs/sync-mastra-playbook.mjs` followed by `node scripts/generate-api-docs.mjs`.

