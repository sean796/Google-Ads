---
title: Pulse Engine Overview & Architecture
slug: pulse-engine/overview
section: Pulse Engine
order: 0
related:
  - pulse-engine/workflows-and-steps
  - pulse-engine/agents-and-models
  - pulse-engine/agent-registry
  - pulse-engine/playbook-index
  - pulse-engine/playbook/agents-and-subagents
  - pulse-engine/playbook/workflows
  - aiseo/overview
---

<!-- manual -->

NEO Pulse implements a browser-safe **Pulse Engine** agent and workflow engine (`src/lib/agent-pipeline/index.ts` and `src/lib/agent-pipeline/pulse-agent-registry.ts`) on top of `POST /api/openrouter/chat-completion` and `zod`.

## Why Pulse Engine Architecture in NEO Pulse

NEO Pulse does not run `@mastra/core`. The local Pulse Engine borrows the agent and workflow primitive shapes (`createStep`, `createWorkflow`, `.then()`, `.parallel()`, `.branch()`, `.commit()`) popularized by upstream Mastra and implements them in `src/lib/agent-pipeline/`, because NEO Pulse runs in a Vite browser + Capacitor bundle against a WordPress PHP `/api/openrouter/chat-completion` proxy.

`src/lib/agent-pipeline/` implements the Pulse Engine workflow and agent specification with:
1. **Zero Node.js built-ins** (100% compatible with Vite and Capacitor builds).
2. **Category-Bound Model Variables:** Every Pulse Engine agent in NEO Pulse declares `category: AgentOpenRouterCategory` (`"research" | "blog" | "image" | "meta" | "report" | "ads" | "video"`) rather than a hardcoded model string.
3. **Automatic Details Drawer & Artifact Integration:** Every `createStep` and `createWorkflow` automatically drives the **Details** drawer step rows (`waiting` -> `generating` -> `done` / `error`) and attaches downloadable files into `urlGeneratedFiles[url]`.

## Core Modules

| File | Role |
| --- | --- |
| `src/lib/agent-pipeline/index.ts` | Pulse Engine `createPulseAgent`, `createStep`, `createWorkflow`, `.then()`, `.parallel()`, `.branch()`, `.commit()` |
| `src/lib/agent-pipeline/pulse-agent-registry.ts` | `PULSE_AGENT_REGISTRY` cataloging all 47 agents across 9 domains with `id`, `category`, `domain`, `label`, and `reason` |
| `src/lib/openrouter-agent-category-api.ts` | Category-to-model resolver (`resolveModelForAgentCategory`) and OpenRouter transport executors |
| `wordpress-plugins/neo-pulse-app/includes/openrouter/class-openrouter-agent-models.php` | PHP backend category model resolver (`Neo_Pulse_App_Openrouter_Agent_Models::resolve`) |
| `src/lib/__tests__/universal-agent-contract.test.ts` | Contract suite verifying `createPulseAgent`, `createStep`, `createWorkflow`, `PULSE_AGENT_REGISTRY`, and zero hardcoded model literals across `src/` |

## Local Pulse Engine Playbook for Coding Agents

The Pulse Engine playbook (304 canonical upstream Mastra pages from `https://mastra.ai/llms.txt`, vendored as design reference) is stored locally in `docs/api/pulse-engine/` so every coding agent instance can read the reference specifications offline without external web fetches. The playbook pages document upstream Mastra; the engine that runs in NEO Pulse is the local Pulse Engine described above.

| Local File | Slug | Contents |
| --- | --- | --- |
| `docs/api/pulse-engine/playbook-index.md` | `pulse-engine/playbook-index` | Complete vendored Mastra `llms.txt` index and local playbook map |
| `docs/api/pulse-engine/playbook/agents-and-subagents.md` | `pulse-engine/playbook/agents-and-subagents` | Agents overview, tools, structured output, human-in-the-loop, guardrails, processors, code mode, subagents, skills |
| `docs/api/pulse-engine/playbook/workflows.md` | `pulse-engine/playbook/workflows` | Workflows overview, state, control flow, agents & tools, dynamic workflows, snapshots, suspend & resume, human-in-the-loop, time travel, error handling, scheduled workflows |
| `docs/api/pulse-engine/playbook/harness.md` | `pulse-engine/playbook/harness` | Harness overview, durable agents, background tasks, goals, schedules, signals, signal providers, agent controller |
| `docs/api/pulse-engine/playbook/memory.md` | `pulse-engine/playbook/memory` | Memory overview, message history, observational memory, working memory, semantic recall, memory processors, multi-user threads |
| `docs/api/pulse-engine/playbook/guides-and-context.md` | `pulse-engine/playbook/guides-and-context` | Multi-agent systems, context engineering, agent lifecycle, authentication, MCP auth, streaming, eval loops |
| `docs/api/pulse-engine/playbook/evals-and-observability.md` | `pulse-engine/playbook/evals-and-observability` | Evals, built-in & custom scorers, quick checks, gates & verdicts, multi-turn, CI/Vitest, datasets, experiments, tracing, logging, metrics |
| `docs/api/pulse-engine/playbook/connections-and-sandboxes.md` | `pulse-engine/playbook/connections-and-sandboxes` | MCP, A2A, ACP, SDK agents, sandboxes (filesystem, search, skills, computer, LSP), channels, browser |
| `docs/api/pulse-engine/playbook/server-auth-and-deploy.md` | `pulse-engine/playbook/server-auth-and-deploy` | Storage, server adapters, middleware, request context, pubsub, custom routes, Mastra client, Studio, Auth, Deployment |
| `docs/api/pulse-engine/playbook/models-and-platform.md` | `pulse-engine/playbook/models-and-platform` | Model router, embeddings, environment variables, gateways, providers, Mastra Platform |
| `docs/api/pulse-engine/playbook/reference-agents-and-tools.md` | `pulse-engine/playbook/reference-agents-and-tools` | Full API Reference for `Agent`, `.generate()`, `.stream()`, `createTool()`, processors, streaming, and `AgentController` |
| `docs/api/pulse-engine/playbook/reference-workflows-core-and-memory.md` | `pulse-engine/playbook/reference-workflows-core-and-memory` | Full API Reference for `Workflow`, `createStep`, `createWorkflow`, `Mastra` core, `Memory`, signals, schedules, and workspaces |

To refresh the scraped playbook from upstream `https://mastra.ai/llms.txt`, run `node scripts/api-docs/sync-mastra-playbook.mjs` followed by `node scripts/generate-api-docs.mjs`.

