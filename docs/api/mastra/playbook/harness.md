---
title: "Mastra Playbook: Harness, Durable Agents & Signals"
slug: mastra/playbook/harness
section: Mastra
order: 70
related:
  - mastra/overview
  - mastra/playbook-index
  - mastra/workflows-and-steps
  - mastra/agents-and-models
---

<!-- manual -->

Scraped canonical Mastra documentation for **Mastra Playbook: Harness, Durable Agents & Signals** (8 upstream pages consolidated for NEO Pulse coding agents).

## Included Pages

- **Harness** (`docs/harness/overview` - source: `https://mastra.ai/docs/harness/overview.md`)
- **Durable Agents** (`docs/harness/durable-agents` - source: `https://mastra.ai/docs/harness/durable-agents.md`)
- **Background Tasks** (`docs/harness/background-tasks` - source: `https://mastra.ai/docs/harness/background-tasks.md`)
- **Goals** (`docs/harness/goals` - source: `https://mastra.ai/docs/harness/goals.md`)
- **Schedules** (`docs/harness/schedules` - source: `https://mastra.ai/docs/harness/schedules.md`)
- **Signals** (`docs/harness/signals` - source: `https://mastra.ai/docs/harness/signals.md`)
- **Signal Providers** (`docs/harness/signal-providers` - source: `https://mastra.ai/docs/harness/signal-providers.md`)
- **Agent Controller** (`docs/harness/agent-controller` - source: `https://mastra.ai/docs/harness/agent-controller.md`)

---

## Source: Harness (`docs/harness/overview`)

Canonical URL: `https://mastra.ai/docs/harness/overview.md`

## Harness

A harness lets an agent pursue long-running, complex goals while keeping its work durable, visible, and steerable. It preserves progress across retries and interruptions, while giving people and other systems a way to inspect progress, add context, approve actions, redirect the agent, or stop it.

Agent harnesses are useful wherever work continues over time. Common examples include coding agents that carry changes through CI and review, software factories (like [Mastra Factory](https://factory.mastra.ai)) that coordinate many tasks in parallel, SRE agents that adapt as incidents evolve, and go-to-market agents that respond as accounts, signals, and conversations change.

In Mastra, harness refers to a set of capabilities for managing an agent beyond a single uninterrupted run. You can adopt these capabilities individually or combine them as needed.

### When to use a harness

Choose a starting point based on what the agent needs. You may use one capability or several.

| If you want to                                                                                                                            | Start here                                                                            | Why                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Keep a run available through client disconnects or server restarts                                                                        | [Durable Agents](https://mastra.ai/docs/harness/durable-agents)                       | Persist run state and let clients reconnect to its stream.                              |
| Run slow tools, workflows, or subagents without blocking                                                                                  | [Background Tasks](https://mastra.ai/docs/harness/background-tasks)                   | Finish work asynchronously and return its result to the agent.                          |
| Keep an agent working until it reaches an objective                                                                                       | [Goals](https://mastra.ai/docs/harness/goals)                                         | Evaluate a thread-scoped objective until it's complete or reaches its run budget.       |
| Start work automatically at recurring times                                                                                               | [Schedules](https://mastra.ai/docs/harness/schedules)                                 | Start isolated runs or send prompts into an existing thread on a cron schedule.         |
| Add context, redirect active work, or wake an idle thread                                                                                 | [Signals](https://mastra.ai/docs/harness/signals)                                     | Deliver input now or hold it for the next turn.                                         |
| React to changes in GitHub, Slack, continuous integration, or another external system                                                     | [Signal Providers](https://mastra.ai/docs/harness/signal-providers)                   | Track subscriptions and forward matching events to agent threads.                       |
| Build an interactive product with sessions, modes, state, approvals, and events, or let users steer, queue follow-up work, and stop a run | [AgentController](https://mastra.ai/docs/harness/agent-controller)                    | Host isolated sessions around a shared agent runtime, each with its own run controls.   |
| Give an agent files, a shell, and the defaults a coding agent needs                                                                       | [`createCodingAgent()`](https://mastra.ai/reference/coding-agent/create-coding-agent) | Build a standard agent with a workspace, task tracking, and retries already configured. |

---

## Source: Durable Agents (`docs/harness/durable-agents`)

Canonical URL: `https://mastra.ai/docs/harness/durable-agents.md`

## Durable agents

**Added in:** `@mastra/core@1.45.0`

> **Beta:** Breaking changes may occur without a major version bump until the API is stable.

A durable agent wraps a regular [`Agent`](https://mastra.ai/docs/agents/overview) so the agentic loop runs inside a workflow. Events flow through [PubSub](https://mastra.ai/docs/server/pubsub), which means a client can disconnect and reconnect without missing chunks. The run state is persisted, so it survives process restarts.

### When to use durable agents

Use a durable agent when any of the following apply:

- The client may drop and reconnect mid-stream (mobile, spotty networks, long-running calls).
- The agentic loop may outlive a single HTTP request (background research, multi-step tool use).
- You need an observe/reconnect API where a second client picks up a stream that a first client started.
- You want [Inngest-powered execution](https://mastra.ai/integrations/deploy/inngest) with step memoization, retries, and monitoring.

For short-lived, request-scoped calls where the client stays connected, a regular `Agent` with `stream()` or `generate()` is simpler.

### Quickstart

Wrap an existing agent with `createDurableAgent()` from `@mastra/core/agent/durable`:

```typescript
import { Agent } from '@mastra/core/agent'
import { createDurableAgent } from '@mastra/core/agent/durable'

const agent = new Agent({
  id: 'researcher',
  name: 'Researcher',
  instructions: 'You research topics thoroughly.',
  model: 'openai/gpt-5.6-sol',
})

export const durableResearcher = createDurableAgent({ agent })
```

Register the durable agent with Mastra and call `stream()`:

```typescript
import { Mastra } from '@mastra/core'
import { durableResearcher } from './agents/researcher'

const mastra = new Mastra({
  agents: { durableResearcher },
})

const { output, runId, cleanup } = await durableResearcher.stream(
  'Research quantum computing advances in 2025',
)

for await (const chunk of output.fullStream) {
  // Process each chunk as it arrives
}

// Release PubSub subscriptions and clear the run from the registry.
// If you skip this, an automatic cleanup timer fires after the stream ends.
cleanup()
```

The returned `runId` identifies the execution. Pass it to `observe()` to reconnect from a different client. Visit the [DurableAgent reference](https://mastra.ai/reference/agents/durable-agent) for the full configuration and method API.

### How it works

A durable agent adds three layers on top of a regular agent:

1. **Workflow execution**: `stream()` serializes the messages and options into a workflow input, then triggers the agentic loop inside a durable workflow. The workflow runs the same loop as `Agent.stream()` but each step can be memoized and replayed.

2. **PubSub streaming**: The loop publishes chunks to a PubSub topic keyed by the run ID. The caller subscribes to that topic and pipes the chunks into a `ReadableStream`, while the cache replays any chunks missed during a disconnect.

3. **Cache layer**: An optional cache (in-memory by default, Redis or another backend in production) stores published events so that a late subscriber can catch up.

### Execution variants

Mastra provides three factory functions that produce durable agents. They differ in how the workflow is executed:

| Factory                | Package           | Best for                                                                                           |
| ---------------------- | ----------------- | -------------------------------------------------------------------------------------------------- |
| `createDurableAgent()` | `@mastra/core`    | Local development and single-process servers. You get a stream you can await directly.             |
| `createEventedAgent()` | `@mastra/core`    | Background execution. The workflow starts without blocking, and you consume chunks through PubSub. |
| `createInngestAgent()` | `@mastra/inngest` | Production deployments. Inngest adds step memoization, retries, and a monitoring dashboard.        |

All three return an object you register with `Mastra` the same way as a regular agent. `createDurableAgent()` and `createEventedAgent()` return class instances that extend `Agent`. `createInngestAgent()` returns a Proxy-backed object that forwards `Agent` methods to the underlying agent. When a signal wakes an idle thread, all three start that run with the durable `stream()`. `sendSignal()` and `sendNotificationSignal()` both work this way.

#### In-process with `createDurableAgent()`

Wrap your agent and call `stream()`. You get a `DurableAgentStreamResult` back in the same process. No external infrastructure is required, so this is the fastest way to get started:

```typescript
import { Agent } from '@mastra/core/agent'
import { createDurableAgent } from '@mastra/core/agent/durable'

const agent = new Agent({
  id: 'helper',
  instructions: 'You are a helpful assistant.',
  model: 'openai/gpt-5.6-sol',
})

export const durableHelper = createDurableAgent({ agent })
```

#### Fire-and-forget with `createEventedAgent()`

The workflow starts in the background without blocking the caller. You still receive chunks through PubSub, so `stream()` returns a result you can consume. The HTTP handler that triggered the run doesn't need to wait for the workflow to finish:

```typescript
import { Agent } from '@mastra/core/agent'
import { createEventedAgent } from '@mastra/core/agent/durable'

const agent = new Agent({
  id: 'writer',
  instructions: 'You write articles.',
  model: 'openai/gpt-5.6-sol',
})

export const eventedWriter = createEventedAgent({ agent })
```

#### Stored agents created through the API

Agents created with [`createStoredAgent()`](https://mastra.ai/reference/client-js/agents) opt in with a `durable` field on the agent config. The server wraps the agent with `createDurableAgent()` when it hydrates it, so no code deployment is needed:

```typescript
await mastraClient.createStoredAgent({
  id: 'helper',
  name: 'Helper',
  instructions: 'You are a helpful assistant.',
  model: { provider: 'openai', name: 'gpt-5' },
  durable: true,
})
```

`durable` also accepts `{ maxSteps, cleanupTimeoutMs }`. Only serializable options are accepted here, so snapshot persistence for API-created agents follows the server's `recovery.durableAgents` setting. Cache and pubsub are inherited from the server's `Mastra` instance, so configure distributed backends there if you need durability across replicas. Automatic recovery is still configured in code through `recovery.durableAgents`.

#### Inngest-powered with `createInngestAgent()`

Run the workflow on the [Inngest](https://www.inngest.com/docs) platform. Each tool call becomes a memoized step that Inngest can retry independently, and you get a dashboard for monitoring runs:

```typescript
import { Agent } from '@mastra/core/agent'
import { createInngestAgent } from '@mastra/inngest'
import { Inngest } from 'inngest'

const inngest = new Inngest({ id: 'my-app' })

const agent = new Agent({
  id: 'analyst',
  instructions: 'You analyze data.',
  model: 'openai/gpt-5.6-sol',
})

export const inngestAnalyst = createInngestAgent({ agent, inngest })
```

Visit the [`createInngestAgent()` reference](https://mastra.ai/reference/agents/inngest-agent) for the full API, including Inngest-specific options like PubSub and cache configuration.

### Resumable streams

Durable agents support resumable streams through PubSub and an event cache. When a client disconnects mid-stream, the cache continues storing events. The same client can reconnect by calling `observe()` with the `runId`:

```typescript
const { output } = await durableResearcher.observe(runId)

for await (const chunk of output.fullStream) {
  // Chunks from the run, including any missed while disconnected
}
```

Calling `observe(runId)` without an offset is the supported general reconnect flow. It replays all available cached events before delivering live events. The optional `offset` is an inclusive, zero-based PubSub event index, not a chunk number, and the public stream doesn't expose it. If an offset skips earlier text deltas, aggregated text is partial and structured output may be invalid. On transports with numeric offset support, an offset beyond the highest retained index also skips live events with lower indexes. Events arrive only when the published index reaches the requested offset. If the index counter restarts below that offset and never reaches it, observation remains pending indefinitely. See [`observe(runId, options?)`](https://mastra.ai/reference/agents/durable-agent) for the full offset and transport behavior.

Observing doesn't own the run. When the loop ends, or you leave it early with `break`, `return`, or an error, the observer unsubscribes and the run keeps going for anyone else watching it. To stop observing from outside the loop, for example when the client disconnects, call `detach()`:

```typescript
const { output, detach } = await durableResearcher.observe(runId)

request.signal.addEventListener('abort', detach, { once: true })

if (request.signal.aborted) detach()

for await (const chunk of output.fullStream) {
  // Stops when the run finishes or the client disconnects
}
```

If you pass `idleTimeoutMs` and no chunks arrive for that long, Mastra checks `isAlive` when you provide it. If `isAlive` returns `true` or throws, the timer restarts and the stream stays open. Otherwise the stream ends with an error chunk and detaches the observer. The run itself is only cleaned up when `isAlive` returns `false`.

`createDurableAgent()` and `createEventedAgent()` use an in-memory cache by default, which means resumable streams work within a single process. For production, provide a persistent cache backend (e.g., Redis) so cached events survive process restarts:

```typescript
import { createDurableAgent } from '@mastra/core/agent/durable'
import { RedisServerCache } from '@mastra/redis'
import Redis from 'ioredis'

const cache = new RedisServerCache({ client: new Redis('redis://localhost:6379') })

export const durableAgent = createDurableAgent({
  agent,
  cache,
})
```

`createInngestAgent()` doesn't enable caching by default. Pass a `cache` option or register the agent with a `Mastra` instance that has a `serverCache` configured to enable resumable streams.

For cached topics, each published event is recorded in the cache before it's delivered live, so publish latency is bounded by the round-trip to the cache. If the cache write fails, the event is still delivered live but can't be replayed. `@mastra/redis` and `@mastra/valkey` record each event in a single round-trip using a Lua script. `@mastra/redis` falls back to separate commands when the client has no `evalScript` or when Redis Cluster rejects the multi-key script. Per-run workflow watch events (`workflow.events.v2.*`) are never cached. If the cache is remote (for example, in another region) and you don't need to resume a topic, use `shouldCache` to publish that topic straight through:

```typescript
export const durableAgent = createDurableAgent({
  agent,
  cache,
  // Skip the replay cache for the per-chunk stream topic; other topics stay resumable.
  shouldCache: topic => !topic.startsWith('agent.stream.'),
})
```

### Streaming with background tasks

Durable agents support the same [`untilIdle`](https://mastra.ai/reference/streaming/agents/stream) option as regular agents. When `untilIdle` is set, `stream()` keeps the connection open across background-task continuations until the agent is idle:

```typescript
const { output, cleanup } = await durableAgent.stream('Research and summarize the topic', {
  untilIdle: true,
  memory: { thread: 'thread-1', resource: 'user-1' },
})

for await (const chunk of output.fullStream) {
  // Chunks from the initial turn AND any follow-up turns triggered by
  // background task completions
}

cleanup()
```

Pass `{ maxIdleMs }` to customize the idle timeout (defaults to 5 minutes):

```typescript
await durableAgent.stream('Research topic', {
  untilIdle: { maxIdleMs: 30_000 },
  memory: { thread: 'thread-1', resource: 'user-1' },
})
```

Visit [Background tasks](https://mastra.ai/docs/harness/background-tasks) for the full background task guide, including configuration, subagents, and suspend/resume.

### Cleanup

Every `stream()` and `observe()` call returns a `cleanup` function that tears the run down: it unsubscribes from PubSub, removes the run from the internal registry, and deletes the run's cached events so nobody can replay it afterward.

When you don't call `cleanup()` yourself, Mastra calls it `cleanupTimeoutMs` after the run finishes, errors, or is aborted. Detaching an observer or reaching a plain `idleTimeoutMs` doesn't start this timer. Set `cleanupTimeoutMs: 0` to turn the timer off.

Call `cleanup()` from the process that started the run. To stop watching a run from `observe()`, use `detach()` or leave the loop instead.

### Tool approval

Durable agents support tool approval (human-in-the-loop). When a tool call requires approval, the workflow suspends, emits an `onSuspended` callback, and waits for the caller to resume with `resume()`:

```typescript
const { output, runId, cleanup } = await durableAgent.stream('Delete the old records', {
  requireToolApproval: true,
  onSuspended: ({ toolCallId, toolName, args }) => {
    // Notify the user and ask for approval
  },
})
```

Resume the suspended run after approval:

```typescript
await durableAgent.resume(runId, { approved: true })
```

### Crash recovery

Durable agents can checkpoint each run's state to storage while it executes. If the server process crashes mid-run, the run remains in `running` status in storage with no automatic retry, and on the next server start you can re-drive these orphaned runs so they pick up where they left off. For orderly shutdowns such as rolling deploys, the generated server can also drain in-flight turns before exiting. See [graceful shutdown and rolling deploys](https://mastra.ai/docs/deployment/mastra-server).

Under the default persistence policy, these `running` checkpoints are written when crash recovery is enabled. With `recovery.durableAgents: 'off'` (the default), durable agents persist snapshots for `pending`, `paused`, and `suspended` runs (the artifacts human-in-the-loop resume depends on) and skip the per-step `running` writes until `mastra.shutdown()` starts. A custom `shouldPersistSnapshot` predicate replaces the default policy: one that includes `running` writes those checkpoints at every step, and one that excludes `running` writes none, including during shutdown. See [snapshot persistence](#snapshot-persistence) for the full policy and how to override it.

Durable agent runs are excluded from the generic boot-time restart of active workflow runs. The only automatic recovery path for durable agent runs is `recovery.durableAgents: 'auto'`, which claims each orphaned run and registers its thread runtimes before re-driving it. See [run ownership](#run-ownership).

> **Warning:** Automatic and manual recovery re-run the agentic loop from the last persisted snapshot, which can reissue LLM calls (with real cost) and re-execute tool calls. A sub-agent delegation is one generated `agent-<name>` tool call, and recovery doesn't checkpoint the LLM or tool calls inside that delegation independently. If recovery replays the delegation step, the entire sub-agent run starts again and can repeat inner LLM calls and already-completed tool side effects. Make tools, including tools used by sub-agents, idempotent, or deduplicate their external side effects.

#### Snapshot persistence

The `shouldPersistSnapshot` option on `createDurableAgent()` (also accepted in the agent-level `durable` config) controls which workflow snapshots a durable agent writes. The default policy:

- Always persists `pending`, `paused`, and `suspended` snapshots. These are what `resume()` and tool approval read, so human-in-the-loop flows work without configuration.
- Persists `running` checkpoints at every step when `recovery.durableAgents` is `'auto'`. These per-step writes exist solely to make in-flight runs recoverable after a crash, so with recovery off they're skipped until shutdown.
- Persists a `running` checkpoint at each step boundary a run reaches after `mastra.shutdown()` starts, even with recovery off. A run that reaches a step boundary before the drain window ends can then be resumed later with `recover()` or `recoverActiveRuns()`. A run blocked in a single LLM or tool call for the whole drain gets no shutdown checkpoint.

When the agent is configured with a fixed memory instance (`memory: new Memory(...)`), a `running` checkpoint doesn't repeat messages memory already stores. Messages recalled from memory and messages the run saved itself (for example with `savePerStep: true`) are stored as small references to their memory rows instead of their full contents, as long as they still match the stored row (a message changed after saving stays inline). This applies to every copy of the conversation a checkpoint holds, including the run input and step results. A long run's checkpoints grow much more slowly as a result. Agents that resolve memory with a function keep the full transcript in each checkpoint, because the memory a resumed run resolves may differ.

To keep crash-recovery checkpoints without enabling automatic recovery (for example, when you call `recoverActiveRuns()` yourself behind a leader election), pass a predicate that includes `running`:

```typescript
export const durableResearcher = createDurableAgent({
  agent,
  shouldPersistSnapshot: ({ workflowStatus }) =>
    ['pending', 'paused', 'suspended', 'running'].includes(workflowStatus),
})
```

Mastra logs a warning when a custom predicate excludes `suspended` or `paused`, which breaks human-in-the-loop resume, or excludes `running` while `recovery.durableAgents` is `'auto'`, which makes the agent invisible to automatic recovery.

Evented agents always persist the full snapshot set: the evented engine coordinates workers through storage, so the `running` row is part of its execution model. Inngest agents always persist only `suspended` snapshots, because Inngest's own replay provides durability. Both accept `shouldPersistSnapshot` for API symmetry but log a warning and ignore it.

#### Automatic recovery

Set `recovery.durableAgents` to `'auto'` in the Mastra config. The deployer calls `recoverAllDurableAgents()` on boot, alongside the workflow run restarts (the two run concurrently):

```typescript
export const mastra = new Mastra({
  agents: { myAgent: durableAgent },
  storage: new PostgresStore({ connectionString: process.env.DATABASE_URL! }),
  recovery: { durableAgents: 'auto' },
})
```

On startup, this discovers every registered durable agent with runs stuck in `running` status and re-drives them from the last persisted snapshot.

Recovery doesn't take over a run that another execution still drives. It skips the run and checks it again once that execution's claim could have lapsed. A run whose process crashed shortly before the restart is still recovered, without another call.

#### Manual recovery

If you need finer control, such as running recovery on a schedule, call the methods directly:

```typescript
// Recover all durable agents
const result = await mastra.recoverAllDurableAgents()
console.log(
  `Recovered ${result.recovered} runs (${result.succeeded} ok, ${result.failed} failed, ${result.skipped} still live)`,
)

// Recover a specific agent
const { recovered } = await durableAgent.recoverActiveRuns()
for (const run of recovered) {
  if (run.status === 'skipped') console.log(`${run.runId} is still live: ${run.reason}`)
}

// Recover a single known run
await durableAgent.recoverActiveRuns({ runId: 'run-abc-123' })
```

`recoverAllDurableAgents()` returns counts and re-checks skipped runs itself. `recoverActiveRuns()` returns each run's outcome as `success`, `failed`, or `skipped`, and doesn't re-check skipped runs. A run skipped because another process drives it carries `retryAt`, the time after which its claim lapses unless renewed.

Manual recovery reads the same `running` checkpoints as automatic recovery. For a `DurableAgent` using the default snapshot policy with `recovery.durableAgents` set to `'off'`, in-flight runs are only checkpointed at step boundaries reached after `mastra.shutdown()` starts. A run that crashes before then, or doesn't reach a step boundary during the drain, has no checkpoint, so `listActiveRuns()` and `recoverActiveRuns()` don't find it. See [snapshot persistence](#snapshot-persistence).

To take over a run that's still live, such as one held by a hung execution, call `recover()` with `force: true`:

```typescript
const { output } = await durableAgent.recover('run-abc-123', { force: true })
```

The execution that held the run loses it and stops, and streams for the run drop the events it still publishes. Without `force`, `recover()` throws `DURABLE_AGENT_RUN_ACTIVE` for a live run. Even with `force`, `recover()` refuses a run that the same process is executing.

#### Run ownership

Every `stream()`, `generate()`, `resume()`, and `recover()` call claims the run before it executes and renews the claim every 10 seconds. A claim lapses 30 seconds after its last renewal, so a run whose process crashed becomes recoverable within 30 seconds. Until then, recovery treats the run as live, and a `stream()` or `resume()` call for that run waits up to 5 seconds for the claim, then throws `DURABLE_AGENT_EXECUTION_CONFLICT`. `mastra.shutdown()` stops the runs still executing after its drain window without further writes and releases their claims. The next boot then recovers them without waiting for the claims to lapse.

Enforcement of the claim depends on the workflows store. When the store supports run fencing, the claim is a record in that store, and each write is checked against the claim in the same operation. Once another execution claims the run, writes from the execution that lost it are rejected. That execution's message, thread, and working memory writes are rejected only if the memory store supports run fencing too, so they still land when the agent's `Memory` uses a storage adapter without it. These storage adapters support run fencing:

- `InMemoryStore` from `@mastra/core/storage`
- `@mastra/pg`
- `@mastra/libsql` and `@mastra/turso`
- `@mastra/mysql`
- `@mastra/mssql`
- `@mastra/oracledb`
- `@mastra/spanner`
- `@mastra/dsql`
- `@mastra/cloudflare-d1`
- `@mastra/cloudflare`, with `CloudflareDOStorage`
- `@mastra/convex`
- `@mastra/mongodb`, on a replica set or sharded cluster
- `@mastra/dynamodb`
- `@mastra/redis`
- `@mastra/upstash`
- `@mastra/valkey`

On Convex, run fencing runs in the Mastra server functions you deploy. Redeploy your Convex functions after upgrading `@mastra/convex`. Until you do, durable agent runs fail with an error asking you to redeploy, while other writes keep working.

Stores that support run fencing keep one claim record per run, plus one memory fence record per run with memory. Stores with retention support prune them with the `workflows.runOwnership` and `memory.runFences` [retention keys](https://mastra.ai/reference/storage/retention). Redis, Upstash, and Valkey expire them on their own instead: a claim 7 days after its last claim, renewal, or release, and a fence 7 days after it's retired. A run's first generation comes from the store's clock, so a run that reuses a `runId` after its records were pruned still outranks the fences and stream events of its earlier executions.

With any other workflows store, the claim is a lease on the [PubSub](https://mastra.ai/docs/server/pubsub) backend. The lease keeps two executions from claiming the run at once, but writes from an execution that lost the run aren't rejected. A run taken over while its previous execution was still live can end with that execution's output. When an execution loses its lease and no other execution has taken the run, the run stays held for up to 15 more seconds. Until then, `recover()` without `force` throws `DURABLE_AGENT_RUN_ACTIVE` with `retryAt` set to when the hold is sure to have ended. Mastra logs a warning when it recovers runs against a workflows or memory store without run fencing.

A lease only coordinates the processes that share it. `EventEmitterPubSub`, the default, covers one process. `UnixSocketPubSub` covers the processes on one host. `RedisStreamsPubSub` and `ValkeyStreamsPubSub` cover every instance connected to the same server. `GoogleCloudPubSub` doesn't provide leases, so with a store that lacks run fencing every claim succeeds, and recovery can take over a run that's still live.

#### Multi-instance deployments

Every replica can start with `recovery.durableAgents: 'auto'`. Replicas that boot together race to recover the same orphaned runs, but only one claim succeeds per run and the other replicas skip it. This requires a claim that every replica shares: a workflows store that supports run fencing, or a PubSub backend whose lease every replica shares. Without either, gate recovery behind your own leader election or run it from a single replica.

### Related

- [DurableAgent reference](https://mastra.ai/reference/agents/durable-agent)
- [`createInngestAgent()` reference](https://mastra.ai/reference/agents/inngest-agent)
- [Background tasks](https://mastra.ai/docs/harness/background-tasks)
- [Inngest deployment guide](https://mastra.ai/integrations/deploy/inngest)
- [Agent overview](https://mastra.ai/docs/agents/overview)
- [Worker overview](https://mastra.ai/docs/deployment/workers)

---

## Source: Background Tasks (`docs/harness/background-tasks`)

Canonical URL: `https://mastra.ai/docs/harness/background-tasks.md`

## Background tasks

**Added in:** `@mastra/core@1.29.0`

Background tasks let an agent dispatch a long-running tool call without blocking the agentic loop. The tool returns an immediate acknowledgement while the LLM continues responding. The task then runs to completion in the background. When it finishes, its result is written to memory and if you use `stream()` with the [`untilIdle`](https://mastra.ai/reference/streaming/agents/stream) option the agent is re-invoked automatically so the result is processed in the same call.

### When to use background tasks

Use background tasks when a tool call may take long enough that the user shouldn't wait for it before seeing a response. Common cases:

- Subagent delegations that themselves run multi-step research or writing.
- Tool calls that hit slow external services, queues, or large data jobs.
- Workflows triggered from a tool call that may take minutes to complete.

For tool calls that return quickly, foreground execution using `agent.stream()` and `agent.generate()` is simpler.

> **Note:** Background tasks require a configured [storage](https://mastra.ai/docs/storage) backend on the Mastra instance. Tasks are persisted so they survive process restarts.

### Quickstart

Background tasks are off by default. Enable them by setting `backgroundTasks.enabled` on the Mastra instance:

```typescript
import { Mastra } from '@mastra/core'
import { LibSQLStore } from '@mastra/libsql'

export const mastra = new Mastra({
  storage: new LibSQLStore({ id: 'storage', url: 'file:mastra.db' }),
  backgroundTasks: {
    enabled: true,
    globalConcurrency: 10,
    perAgentConcurrency: 5,
    backpressure: 'queue',
    defaultTimeoutMs: 300_000,
  },
})
```

The full set of options is listed in the [backgroundTasks configuration reference](https://mastra.ai/reference/configuration).

### Run a tool in the background

Enabling the manager doesn't run anything in the background by itself. Tools become eligible at one of two layers:

1. **Tool-level config**: the tool itself declares it as background-eligible.
2. **Agent-level config**: the agent declares which of its tools are background-eligible.

Eligible tools default to `deferred` execution. Set `defaultDisposition: 'foreground'` at either layer when eligibility should only give the LLM the option to run a call in the background. The LLM can include a `_background` field in the tool arguments to select `foreground`, `deferred`, or `awaited` execution for a specific call and override its timeout or retries.

#### Tool-level

Set `background.enabled: true` on the tool definition. Tools opted in at this layer are eligible for background execution when called by an agent that has the manager enabled. Their configured default disposition determines whether each call runs inline or in the background unless the call includes a `_background` override.

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

export const researchTool = createTool({
  id: 'research',
  description: 'Run a long research job',
  inputSchema: z.object({ topic: z.string() }),
  background: {
    enabled: true,
    defaultDisposition: 'deferred',
    timeoutMs: 600_000,
    maxRetries: 1,
  },
  execute: async ({ topic }) => {
    // Run the research job for topic
  },
})
```

#### Agent-level

Use `backgroundTasks.tools` on the agent to opt in specific tools or override timeouts for individual tools, or alternatively run all background-eligible tools in the background. Use `disabled: true` to short-circuit background dispatch for the agent entirely.

```typescript
import { Agent } from '@mastra/core/agent'

export const researcher = new Agent({
  id: 'researcher',
  instructions: 'You research topics and answer questions.',
  model: 'openai/gpt-5.6-sol',
  tools: { researchTool, summarizeTool },
  backgroundTasks: {
    tools: {
      researchTool: { enabled: true, timeoutMs: 600_000 },
      summarizeTool: false,
    },
  },
})
```

Set `tools: 'all'` to opt in every tool the agent has.

#### LLM per-call override

When a tool is registered on an agent that has background tasks enabled, the model can include a `_background` field in the tool arguments to override the resolved configuration for that specific call. The model only includes what it wants to override, all fields in `_background` are optional. The override is stripped from the arguments before the tool runs.

```json
{
  "topic": "solana",
  "_background": { "disposition": "awaited", "timeoutMs": 900000 }
}
```

The available dispositions are:

- `foreground`: Run the tool synchronously without background-work lifecycle signals.
- `deferred`: Dispatch the tool and let the agent continue. The task remains attached to the run, and streams using `untilIdle` wait for it to reconcile.
- `awaited`: Dispatch the tool through the background task manager, but hold the current branch until its authoritative result has been reconciled.

For compatibility, `_background.enabled: true` selects `deferred`, and `_background.enabled: false` selects `foreground`. An explicit `disposition` takes precedence over `enabled`.

The `_background` override only _modifies_ tools the developer has already opted in at the tool or agent layer. If a tool hasn't been opted in, a model-selected background disposition is ignored and the tool runs in the foreground. This keeps deterministic, foreground-only tools (calculators, lookups, schema validators) from being silently dispatched as tasks.

#### Resolution order

When a tool call is dispatched, agent-level and tool-level settings determine eligibility and fallback values. For an eligible tool, the LLM `_background` fields override the corresponding values for that call. Manager defaults fill timeout and retry values that remain unset. An `_background` field can't enable a tool that's not eligible.

If the agent has `backgroundTasks.disabled: true`, every tool call runs synchronously regardless of the layers above.

### Background tasks related stream chunks

When a tool call dispatches as a background task, two streams may surface lifecycle events for it: the agent's own stream and the [`backgroundTaskManager.stream()`](https://mastra.ai/docs/harness/background-tasks) SSE stream. Each stream covers a different set of chunk types:

| Chunk type                  | When it fires                                                                          | Emitted by     |
| --------------------------- | -------------------------------------------------------------------------------------- | -------------- |
| `background-task-started`   | The task has been enqueued and assigned a `taskId`.                                    | Agent stream   |
| `background-task-running`   | The task picked up a worker and started executing.                                     | Manager stream |
| `background-task-progress`  | Shows number of running background tasks.                                              | Agent stream   |
| `background-task-output`    | A streamed output chunk from the task's `execute`.                                     | Manager stream |
| `background-task-completed` | The task finished successfully. The `payload.result` matches the eventual tool result. | Manager stream |
| `background-task-failed`    | The task threw or timed out.                                                           | Manager stream |
| `background-task-cancelled` | The task was cancelled before completing.                                              | Manager stream |
| `background-task-suspended` | The tool called `suspend()` from inside its execute.                                   | Manager stream |
| `background-task-resumed`   | A suspended task was resumed via `manager.resume(taskId, resumeData)`.                 | Manager stream |

`agent.stream().fullStream` only emits the agent-loop chunks (`background-task-started`, `background-task-progress`) on its own. `agent.stream()` with `untilIdle: true` emits the same two chunks and additionally subscribes to the manager pubsub for the run's memory scope and pipes the seven manager chunks (`background-task-running`, `background-task-output`, `background-task-completed`, `background-task-failed`, `background-task-cancelled`, `background-task-suspended`, `background-task-resumed`) into the same `fullStream`.

`backgroundTaskManager.stream()` only emits the seven manager chunks.

The full payload shapes are documented in the [background task chunks reference](https://mastra.ai/reference/streaming/ChunkType).

### Keep the agent stream open with `untilIdle`

`agent.stream()` returns once the LLM emits a final response even if a background task is still running. Pass `untilIdle: true` when you want the stream to stay open until every dispatched background task has completed and the LLM has had a chance to respond to the result:

```typescript
const stream = await agent.stream('Research solana for me', {
  memory: { thread: 't1', resource: 'u1' },
  untilIdle: true,
})

for await (const chunk of stream.fullStream) {
  // chunks from the initial turn AND any continuation turns triggered by
  // background task completions flow through here
}
```

When a background task completes, the result is injected into the agent memory, `stream()` re-enters the agentic loop so the LLM can react to it. The stream closes when no tasks are running and no completions are queued.

Customize the idle timeout by passing an object instead of `true`. The timer only runs while the wrapper is between turns, so a slow first token won't close the stream. The default is 5 minutes:

```typescript
const stream = await agent.stream('Research solana for me', {
  memory: { thread: 't1', resource: 'u1' },
  untilIdle: { maxIdleMs: 30_000 },
})
```

Visit [`Agent.stream()`](https://mastra.ai/reference/streaming/agents/stream) for the full API.

#### Aggregate properties

`stream()` with `untilIdle` returns a `MastraModelOutput` that looks like the one from a regular `stream()` call, but `fullStream` alone spans the initial turn and any auto-continuations. Aggregate properties (`text`, `toolCalls`, `toolResults`, `finishReason`, `messageList`, `getFullOutput()`) still resolve against the **first turn's** internal buffer. If you need an aggregate view across continuations, consume `fullStream` yourself and accumulate.

### Subagents in the background

Subagent invocations are dispatched as tool calls under the hood, so the same background configuration applies. The recommended pattern is to opt each subagent in on the supervisor, it's clearer and lets you tune `timeoutMs` per subagent in one place:

```typescript
import { Agent } from '@mastra/core/agent'

const supervisor = new Agent({
  id: 'supervisor',
  instructions: 'Coordinate research and writing using the available agents.',
  model: 'openai/gpt-5.6-sol',
  agents: { researchAgent, writingAgent },
  backgroundTasks: {
    tools: {
      researchAgent: { enabled: true, timeoutMs: 900_000 },
      writingAgent: { enabled: true, timeoutMs: 900_000 },
    },
  },
})

const stream = await supervisor.stream('Research AI in education and write an article', {
  memory: { thread: 't1', resource: 'u1' },
  untilIdle: true,
})
```

#### Inheriting from the subagent

If a subagent isn't listed under the supervisor's `backgroundTasks.tools` but has background-eligible tools of its own (either via tool-level `background.enabled: true` or its own `backgroundTasks.tools` entry) the framework still dispatches the entire subagent invocation as a background task. The supervisor inherits the subagent's intent: the subagent itself becomes the background task, and it can dispatch its eligible ordinary tools in the background inside its loop. Further delegated-agent calls run in the foreground.

The background config used for the inherited dispatch (for example `waitTimeoutMs`) is derived from the subagent's own `backgroundTasks` config.

```typescript
const researchAgent = new Agent({
  id: 'research-agent',
  description: 'Gathers factual information.',
  model: 'openai/gpt-5-mini',
  tools: { deepResearchTool },
  backgroundTasks: {
    tools: {
      deepResearchTool: { enabled: true, timeoutMs: 600_000 },
    },
    waitTimeoutMs: 900_000,
  },
})
```

When this `researchAgent` is delegated to from a supervisor that has no background task configuration for the `researchAgent`, the supervisor still dispatches the whole `researchAgent` invocation as a background task.

Mastra supports one nested background-tool level inside a delegated run: a root agent can delegate to a subagent, and that subagent can dispatch an eligible ordinary tool in the background. A second delegated-agent edge runs in the foreground and doesn't receive nested background guidance. This limit is execution-scoped and doesn't mutate the shared subagent configuration.

Which layer to use depends on where consistency matters: subagent-level configuration travels with the agent, which keeps its background behavior the same under every supervisor, whereas the supervisor-side opt-in above centralizes that tuning in one place. This boundary stops at a single nested delegation level and has no workflow integration.

### Suspending and resuming

A background task can pause itself mid-execution and wait for an external signal before continuing. This is useful for human approvals, webhooks, or any flow where the next step depends on data that arrives later.

A tool calls `suspend(data)` from inside its `execute`, which:

- Persists `status: 'suspended'` and the `data` payload on the task record.
- Saves the workflow snapshot so the run survives process restarts.
- Emits a `background-task-suspended` chunk on the manager stream.
- Releases the concurrency slot so other tasks can run.

Resume the task with `mastra.backgroundTaskManager.resume(taskId, resumeData)`. The `resumeData` arrives in the tool's `execute` options on the resumed run, and the task transitions back to `running`.

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

export const reviewTool = createTool({
  id: 'review',
  description: 'Submit a draft for human review.',
  inputSchema: z.object({ draft: z.string() }),
  outputSchema: z.object({ approvedBy: z.string(), edits: z.string().optional() }),
  background: { enabled: true },
  execute: async ({ draft }, context) => {
    const { suspend, resumeData } = context.agent
    if (!resumeData) {
      await suspend?.({ awaiting: 'approval', draft })
      return { approvedBy: '', edits: undefined }
    }
    const { reviewer, edits } = resumeData as { reviewer: string; edits?: string }
    return { approvedBy: reviewer, edits }
  },
})
```

The first invocation of `execute` sees `resumeData === undefined` and calls `suspend`. After the task is resumed, the runtime restarts the tool with `resumeData` populated. The `if` condition is false. The tool returns its real result.

To resume the task once an approval arrives:

```typescript
await mastra.backgroundTaskManager?.resume(taskId, {
  reviewer: 'alice@example.com',
  edits: 'Reworded paragraph 3.',
})
```

#### What happens to the agent loop

When a task suspends mid-`stream()` with `untilIdle`, the wrapper treats it as terminal for the current iteration and closes. Once the resume payload is available, call `agent.resumeStream(resumeData, { runId, toolCallId, memory, untilIdle: true })` to continue immediately. The resumed background task completes and adds its result to the message list before the agent runs a follow-up turn on the same SSE connection. To drive the resume out of band, call `mastra.backgroundTaskManager.resume(taskId, resumeData)` directly. Its result is still written into the thread for the next user turn.

#### Re-registering the executor on resume

The manager keeps tool executors in process memory. If the process restarts while a task is suspended, the executor closure is gone, the caller of `resume()` must re-register it first via `manager.registerTaskContext(taskId, ...)`. Tasks dispatched and resumed inside the same process don't need this.

#### Cancelling a suspended task

`manager.cancel(taskId)` works against suspended tasks the same way it works for running ones. The row changes to `cancelled` and the workflow snapshot is cleaned up. A `task.cancelled` event then fires.

### Lifecycle callbacks

Each layer can register terminal-state callbacks. They don't replace one another, and success/failure hooks fire for their outcomes:

- Tool-level `background.onComplete` / `onFailed`: scoped to one tool.
- Agent-level `backgroundTasks.onTaskComplete` / `onTaskFailed`: scoped to all tasks dispatched by this agent.
- Manager-level `onTaskComplete` / `onTaskFailed`: scoped globally.

```typescript
export const mastra = new Mastra({
  storage,
  backgroundTasks: {
    enabled: true,
    onTaskComplete: task => {
      logger.info('Background task complete', { taskId: task.id, toolName: task.toolName })
    },
    onTaskFailed: task => {
      logger.error('Background task failed', { taskId: task.id, error: task.error })
    },
  },
})
```

### Streaming

#### Subscribe to all task events

Pass `allResources: true` to receive every task event in the system, across all resources. On connection, the stream emits a snapshot of all currently running tasks, then forwards live events as they happen.

```typescript
const bgManager = mastra.backgroundTaskManager;
if (!bgManager) throw new Error('Background tasks are not enabled');

const controller = new AbortController();
const stream = bgManager.stream({ allResources: true, abortSignal: controller.signal });

for await (const chunk of stream) {
  switch (chunk.type) {
    case 'background-task-running':
      console.log('started', chunk.payload.taskId, chunk.payload.toolName);
      break;
    case 'background-task-completed':
      console.log('done', chunk.payload.taskId, chunk.payload.result);
      break;
    case 'background-task-failed':
      console.error('failed', chunk.payload.taskId, chunk.payload.error);
      break;
  }
}
```

The stream stays open until the caller's `AbortSignal` fires. Always pass an `abortSignal` so you can disconnect cleanly.

> **Warning:** `allResources: true` delivers task arguments and results for every user. Use it only in trusted server-side code, never to serve a single user's request. Without `resourceId` or `allResources`, `stream()` only delivers tasks that have no `resourceId`. Agent tasks dispatched with memory always have a `resourceId`, so they won't appear in that stream.

#### Filter the stream

Pass any combination of filter options to narrow the events you receive. Filters apply to both the initial snapshot and the live event subscription.

```typescript
const stream = bgManager.stream({
  agentId: 'researcher',
  threadId: 't1',
  resourceId: 'u1',
  abortSignal: controller.signal,
})
```

| Filter         | Description                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------- |
| `agentId`      | Only events from tasks dispatched by this agent                                               |
| `runId`        | Only events from this specific agent run                                                      |
| `threadId`     | Only events from tasks scoped to this memory thread                                           |
| `resourceId`   | Only events from tasks scoped to this resource                                                |
| `taskId`       | Only events for a single task                                                                 |
| `allResources` | Include tasks from every resource when `resourceId` is omitted. Trusted server-side code only |
| `abortSignal`  | Closes the stream when the signal aborts                                                      |

#### Look up task state directly

For one-off lookups instead of a live stream, use `getTask` and `listTasks`:

```typescript
const task = await mastra.backgroundTaskManager?.getTask(taskId)
const { tasks, total } = await mastra.backgroundTaskManager?.listTasks({
  status: 'running',
  agentId: 'researcher',
})
```

These read from storage rather than the pubsub stream, so they're suitable for paginated lists and detail views.

### Related

- [`Agent.stream()` reference](https://mastra.ai/reference/streaming/agents/stream)
- [backgroundTasks configuration reference](https://mastra.ai/reference/configuration)
- [Durable agents](https://mastra.ai/docs/harness/durable-agents)
- [Supervisor agents](https://mastra.ai/docs/subagents)
- [Stream chunk types](https://mastra.ai/reference/streaming/ChunkType)
- [Storage](https://mastra.ai/docs/storage)

---

## Source: Goals (`docs/harness/goals`)

Canonical URL: `https://mastra.ai/docs/harness/goals.md`

## Goals

**Added in:** `@mastra/core@1.43.0`

A goal is a durable, thread-scoped objective: a standing instruction the agent keeps working toward across loop iterations until a judge model decides it's satisfied or a run budget is exhausted.

The objective is persisted in thread state, so it survives reloads and is evaluated in-loop, even when a new message arrives in the middle of an already-running turn.

Goals build on the same machinery as [`isTaskComplete`](https://mastra.ai/docs/subagents): an LLM-as-judge scores the agent's output each iteration and gates the loop. The difference is that a goal is **durable** (stored in thread state, not passed per call) and is set and updated through `Agent` methods rather than per-`stream()` options.

### When to use goals

Use a goal when you want an agent to keep working toward a single objective across many iterations and messages, without re-supplying the success criteria on every call:

- A standing objective the agent should pursue until a judge says it's done.
- Work that should continue across mid-run messages (a message delivered into a live run is still judged against the goal).
- An objective that must persist across thread reloads or process restarts.

For a one-off completion check within a single `stream()` call, use [`isTaskComplete`](https://mastra.ai/docs/subagents) instead.

### Quickstart

Goals require a configured [storage](https://mastra.ai/docs/storage) backend and a memory-backed thread. Add a `goal` config to the agent, a judge model is required for the goal to do anything, then set an objective for a thread:

```typescript
import { Agent } from '@mastra/core/agent'

const worker = new Agent({
  id: 'worker',
  name: 'worker',
  instructions: 'You complete software tasks end to end.',
  model: 'openai/gpt-5.6-sol',
  memory,
  goal: {
    judge: 'openai/gpt-5-mini',
    maxRuns: 50,
  },
})

// Set the durable objective for a thread.
await worker.setObjective('Add and test a /health endpoint', {
  threadId,
  resourceId,
})

// The objective is judged each iteration until it's complete or maxRuns is hit.
const stream = await worker.stream('Start working on the goal', {
  memory: { thread: threadId, resource: resourceId },
})
```

The `goal` config auto-registers the state-signal projection, so the model always sees the current objective as `<current-objective>` in its context without extra setup.

### How the goal step works

A goal step runs inside the agentic execution loop, right after `isTaskComplete`. On a real candidate answer it scores the conversation against the objective and gates the loop:

- **Not satisfied, budget remaining** → the loop continues. Per-evaluation feedback is injected so the agent iterates.
- **Satisfied** → the loop stops and the objective is marked `done`.
- **Budget exhausted** (`runsUsed >= maxRuns`) → the loop stops and the objective is marked `paused`. Raise `maxRuns`, then resume the objective to continue.

The step is a no-op for background-task, mid-tool-loop, and working-memory-only iterations, the same gating as `isTaskComplete`.

Each evaluation emits a typed `goal` stream chunk (`GoalEvaluationPayload`: `objective`, `iteration`, `maxRuns`, `passed`, `status`, `results`, `reason`, `duration`, `timedOut`, `maxRunsReached`, `suppressFeedback`) so a UI can show goal progress mid-run.

**The judge model is the activation switch.** If no judge resolves, from either the per-objective override or the agent's `goal.judge`, the goal step performs no scoring or budget consumption and emits no `goal` chunk. The gate covers every scorer: Mastra checks it before selecting a scorer, so a custom `goal.scorer` still needs a judge to resolve.

Effective settings resolve as per-objective record value, then agent `goal` config, then a built-in default (`maxRuns` `50` and the default judge prompt).

#### Judge and scorer

`goal.judge` and `goal.scorer` work at different levels. `goal.scorer` is the evaluation pipeline that produces the score the loop gates on. `goal.judge` is the model the default pipeline calls to reach that score.

Omit `scorer` and Mastra builds a default LLM-as-judge scorer, which returns `1` when the objective is achieved and `0` otherwise. Configure it with these settings:

- `goal.judge`: The model that decides whether the objective is met.
- `goal.prompt`: Extra instructions for the judge. Defaults to the built-in goal judge prompt.
- `goal.tools`: Read-only verification tools the judge can call before deciding, so it can confirm the work instead of grading the agent's text alone.
- `goal.maxSteps`: Step budget for the judge's own agentic loop. Defaults to `5`.

Pass `goal.scorer` to replace the pipeline with your own [scorer](https://mastra.ai/reference/evals/create-scorer), either a scorer instance or a registered scorer id. The custom scorer brings its own judging, so `goal.prompt`, `goal.tools`, and `goal.maxSteps` no longer apply, and Mastra stops resolving the judge model for judging. A `goal.judge` resolver function still runs, and its return value is discarded.

Configure the default scorer with `judge`, `maxRuns`, and `prompt`:

```typescript
const worker = new Agent({
  id: 'worker',
  name: 'worker',
  instructions: 'You complete software tasks end to end.',
  model: 'openai/gpt-5.6-sol',
  memory,
  goal: {
    // A resolver function lets you inject provider credentials and read the
    // current judge selection at runtime; returning `undefined` keeps the
    // goal step a no-op.
    judge: ({ requestContext }) => resolveJudgeModel(requestContext),
    maxRuns: 30,
    prompt: 'Only mark the goal complete when tests pass.',
  },
})
```

To hand the decision to your own scorer, pass it as `scorer` and keep `judge` set, because the activation gate still applies:

```typescript
goal: {
  judge: 'openai/gpt-5-mini',
  // Replaces the built-in judge pipeline. `prompt`, `tools`, and `maxSteps` no longer apply.
  scorer: 'tests-pass',
}
```

### Managing the objective

Control the objective for a thread with `Agent` methods. All of them no-op when the run isn't memory-backed (they require storage and a `threadId`):

```typescript
// Read the current objective record.
const record = await worker.getObjective({ threadId })

// Update options on the active objective (only provided fields are written;
// unset fields fall back to the agent's `goal` config).
await worker.updateObjectiveOptions({ threadId, maxRuns: 100 })

// Drop the objective.
await worker.clearObjective({ threadId })
```

Objective records include an optional `activeDurationMs` value for user interfaces that display active pursuit time. Mastra advances this value while an agent runs toward an active objective and checkpoints it when the run ends or waits for tool approval. Missing values represent zero, and the duration measures agent execution rather than the goal's wall-clock age.

Per-objective values written by `setObjective` / `updateObjectiveOptions` take precedence over the agent's `goal` config, and that precedence is remembered in thread state. See the [`GoalEvaluationPayload` in the ChunkType reference](https://mastra.ai/reference/streaming/ChunkType) for the full goal chunk shape.

### Related

- [Supervisor agents](https://mastra.ai/docs/subagents): `isTaskComplete` and the rubric scorer
- [Signal providers](https://mastra.ai/docs/harness/signal-providers): How the objective is projected into context
- [Memory storage](https://mastra.ai/docs/storage): The storage backend goals require
- [Mastra Factory](https://factory.mastra.ai) and [Mastra Code](https://code.mastra.ai): Examples of goal-driven coding agents

---

## Source: Schedules (`docs/harness/schedules`)

Canonical URL: `https://mastra.ai/docs/harness/schedules.md`

## Schedules

**Added in:** `@mastra/core@1.50.0`

A schedule runs an agent on a cron cadence. On each fire, Mastra sends a prompt either as a [signal](https://mastra.ai/docs/harness/signals) into a thread or as a threadless [`agent.generate()`](https://mastra.ai/reference/agents/generate) run. Use schedules for recurring work such as daily summaries and periodic checks, including scheduled nudges into a conversation.

Schedules are persisted, so they survive restarts and redeploys. Manage them at runtime through [`mastra.schedules`](https://mastra.ai/reference/schedules/overview), the canonical create, read, update, and delete (CRUD) surface. The same surface also manages [workflow schedules](https://mastra.ai/docs/workflows/scheduled-workflows) (pass `workflowId` instead of `agentId` to schedule a workflow).

> **Note:** Schedules require a [storage](https://mastra.ai/docs/storage) adapter that implements the schedules domain. See the [`mastra.schedules` reference](https://mastra.ai/reference/schedules/overview) for supported adapters and API behavior.

### Quickstart

The following schedule runs the `pinger` agent every hour. It has no thread, so each fire is an isolated `agent.generate()` run.

```typescript
import { Mastra } from '@mastra/core'
import { Agent } from '@mastra/core/agent'
import { LibSQLStore } from '@mastra/libsql'

const pinger = new Agent({
  id: 'pinger',
  name: 'Pinger',
  instructions: 'Report the current system status in one sentence.',
  model: 'openai/gpt-5.6-sol',
})

const mastra = new Mastra({
  agents: { pinger },
  storage: new LibSQLStore({ id: 'mastra-storage', url: 'file:./mastra.db' }),
})

await mastra.schedules.create({
  agentId: 'pinger',
  cron: '0 * * * *',
  prompt: 'Give me a status update.',
})
```

Mastra starts the scheduler the first time a schedule is created, then fires the agent on the cron you specify.

### Cadence

Schedules fire on a cron expression. The `cron` field accepts a standard 5-, 6-, or 7-part cron expression, and it's validated when you create or update the schedule.

`croner` nicknames also work, for example `@hourly`, `@daily`, `@weekly`, `@monthly`, and `@midnight`. For day-and-time combinations, write the cron field directly:

```typescript
// Every weekday at 9am
await mastra.schedules.create({
  agentId: 'pinger',
  cron: '0 9 * * 1-5',
  prompt: 'Start-of-day check.',
})
```

Set `timezone` to an IANA timezone, for example `America/New_York`, so fire times don't depend on the host's locale. When omitted, the cron resolves against the host's local timezone.

For more readable cron construction, you can use a userland builder such as [`cron-time-generator`](https://www.npmjs.com/package/cron-time-generator) and pass its output to `cron`.

### Threadless and threaded schedules

An agent schedule fires in one of two modes, decided by whether you pass a `threadId`.

#### Threadless

Without a `threadId`, each fire is an isolated `agent.generate()` run. Nothing is written to a conversation thread. This is the simplest mode and suits status checks, reports, and other work that doesn't need conversation context.

#### Threaded

With a `threadId`, the schedule sends a [signal](https://mastra.ai/docs/harness/signals) into that thread. The prompt joins the agent's conversation. Threaded schedules require a `resourceId` alongside the `threadId`.

```typescript
await mastra.schedules.create({
  agentId: 'pinger',
  cron: '0 9 * * *',
  prompt: 'Summarize anything new since yesterday.',
  threadId: 'thread-123',
  resourceId: 'user-456',
})
```

Threaded schedules accept extra fields that control how the signal behaves, including the signal type, XML tag, tag attributes, and active-or-idle delivery behavior. They mirror the options [`agent.sendSignal()`](https://mastra.ai/docs/harness/signals) accepts and stay JSON-serializable so they persist with the schedule.

These fields require a `threadId`. For the full threaded input shape, see the [agent schedule input reference](https://mastra.ai/reference/schedules/overview).

```typescript
await mastra.schedules.create({
  agentId: 'pinger',
  cron: '0 9 * * *',
  prompt: 'Summarize anything new since yesterday.',
  threadId: 'thread-123',
  resourceId: 'user-456',
  tagName: 'check-in', // renders as <check-in>…</check-in>
  attributes: { source: 'cron' },
  ifActive: { behavior: 'discard' }, // skip if the thread is mid-stream
  ifIdle: {
    behavior: 'wake', // wake the agent if the thread is idle
    streamOptions: { requestContext: { locale: 'en-US' } },
  },
})
```

`providerOptions` are merged into the signal payload on every fire and apply to both threaded and threadless schedules.

### Managing schedules

Use `mastra.schedules` for all schedule operations. The service can create, read, update, pause, resume, manually run, and delete schedules.

```typescript
const schedule = await mastra.schedules.create({
  agentId: 'pinger',
  cron: '0 * * * *',
  prompt: 'Status check.',
})

await mastra.schedules.pause(schedule.id)
await mastra.schedules.resume(schedule.id)
await mastra.schedules.run(schedule.id) // Fire once now, off-schedule
```

`pause` and `resume` are durable. `run` fires the schedule once immediately without affecting its cadence. For the complete method list, filters, and patch fields, see the [`mastra.schedules` reference](https://mastra.ai/reference/schedules/overview).

#### Workflow schedules

The same service creates schedules that run a workflow instead of an agent. Pass `workflowId` and the workflow-shaped fields:

```typescript
await mastra.schedules.create({
  workflowId: 'daily-report',
  cron: '0 9 * * *',
  inputData: { userId: 'system' },
})
```

Workflow schedules created this way are independent of the declarative `schedule` field on `createWorkflow`, see [scheduled workflows](https://mastra.ai/docs/workflows/scheduled-workflows) for the declarative form and Studio views.

#### Custom IDs

Pass `id` when you need a predictable handle to look up, update, or delete later.

```typescript
await mastra.schedules.create({
  id: 'nightly-summary',
  agentId: 'pinger',
  cron: '0 9 * * *',
  prompt: 'Summarize anything new since yesterday.',
})
```

See the [`create(input)` reference](https://mastra.ai/reference/schedules/overview) for ID normalization rules and duplicate ID behavior.

#### From the client

The same operations are available from `@mastra/client-js` over the `/api/schedules` routes, so you can manage schedules from a separate process or a UI. See the [client-js agent schedules reference](https://mastra.ai/reference/client-js/agents) for the client method list.

### Lifecycle hooks

Hooks let you run code at key points in an agent schedule's lifecycle, for example to compute fire-time parameters or react to the outcome. Configure them on the `Mastra` constructor under `schedules`. The hooks are a single flat bundle that runs for every agent's schedules; each hook context carries the firing `agentId`, so branch on it when you need per-agent behavior. Hooks live at the `Mastra` level so they apply to both code-defined and stored agents.

```typescript
const mastra = new Mastra({
  agents: { pinger },
  storage: new LibSQLStore({ id: 'mastra-storage', url: 'file:./mastra.db' }),
  schedules: {
    prepare: async ({ agentId, schedule, trigger }) => {
      // Return overrides, null to skip this fire, or undefined for defaults
      return { prompt: `Status as of ${trigger.firedAt.toISOString()}` }
    },
    onFinish: async ({ agentId, outcome, runId }) => {
      // Runs on any non-error, non-abort outcome
    },
    onError: async ({ agentId, phase, error }) => {
      // Runs when prepare, the signal, or the agent run threw
    },
    onAbort: async ({ agentId, runId }) => {
      // Runs when the run was aborted mid-stream
    },
  },
})
```

The hooks are:

- `prepare`: runs before the fire. Return an object to override fire-time parameters such as `prompt` or `threadId`, `null` to skip the fire, or `undefined` to use the stored defaults.
- `onFinish`: runs once per trigger that reached a non-error, non-abort terminal state.
- `onError`: runs after a failure in `prepare` or the signal. It also runs when the agent run fails.
- `onAbort`: runs when the run was aborted mid-stream.

Every hook context includes `agentId` (the agent the schedule fired for) alongside `schedule` and `trigger`.

Hook exceptions are caught and logged. They never re-route the worker or trigger another hook.

### Recurring prompts in Mastra Code

Mastra Code offers the `/schedules` command, which attaches a recurring prompt to the current conversation thread. Unlike `mastra.schedules`, these schedules live only in the Mastra Code process that created them: nothing is written to storage, and each fire is sent to the thread with `agent.sendSignal()` directly.

Run `/schedules` to open a menu with **Create schedule** and one row per schedule on the current thread. Creating a schedule walks through these steps:

1. Choose what each fire sends: a **Prompt**, a **Prompt file** that's re-read on every fire, or a **Script** that runs on every fire.
2. Enter the prompt text or the file path. Paths resolve from the project root. For a script, you can add a prompt that's sent after the script output.
3. Pick a cadence from `1m` to `1d`, or type one such as `20m` or `3h`. Minute steps must divide an hour and hour steps must divide a day.
4. Confirm.

Scripts run from the project root with a 60-second timeout, and their stdout, stderr, and exit code become the prompt. The extra prompt is never passed to the script.

Selecting an existing schedule offers **Run now**, **Pause** or **Resume**, and **Delete**. **Run now** fires the schedule once without changing its cadence, works on paused schedules, and is skipped while a fire of the same schedule is still running.

Each fire arrives on the thread as a `user`-type signal and shows in the transcript as a `schedule` entry with the schedule's id, cadence, source, and script exit status. If the thread is busy, the running agent receives the prompt as its next input, the same way a message you type mid-run does. If the thread is idle, it wakes and runs. Schedules fire on any thread in the process, not only the one focused in the terminal. After `/new`, a new schedule binds to the new thread.

Things to know:

- **Session scoped.** Schedules exist only in the Mastra Code process that created them and stop when it exits. Other Mastra Code processes sharing the same database never see or fire them.
- **Clock boundaries.** `5m` fires at :00, :05, :10 and so on, not five minutes after creation, and `1d` fires at local midnight. Hour and day cadences follow wall-clock time across daylight saving changes, like cron. A fire missed while the machine slept, or one whose timer runs more than a minute late, is skipped, and the schedule resumes at the next boundary.
- **Overlapping fires are skipped.** If a script is still running when the next boundary arrives, that fire doesn't run.

#### Agent schedule tools

Turning on **Experimental schedule tools** in `/settings` (restart required) gives the agent tools that manage the same schedules: `schedule_create`, `schedule_list`, `schedule_update` (pause or delete), `schedule_resume`, and `schedule_run`. The tools only see and change schedules on the thread of the run that calls them. Because a schedule can run a script on every fire, `schedule_create`, `schedule_resume`, and `schedule_run` need the same approval as running a shell command unless YOLO mode is on. Schedules the agent creates are marked `created by agent` in the transcript.

### Related

- [`mastra.schedules`](https://mastra.ai/reference/schedules/overview): API reference for creating and managing schedules.
- [Signals](https://mastra.ai/docs/harness/signals): the delivery mechanism behind threaded schedules.
- [Scheduled workflows](https://mastra.ai/docs/workflows/scheduled-workflows): declare a cron schedule on a workflow definition.

---

## Source: Signals (`docs/harness/signals`)

Canonical URL: `https://mastra.ai/docs/harness/signals.md`

## Signals

**Added in:** `@mastra/core@1.39.0`

Signals let you interact with an agent through a thread. Instead of starting every interaction with `agent.stream()`, subscribe to a thread and send messages or signals. Mastra wakes an idle agent or delivers input to its running loop; alternatively, it queues the input for the next turn.

Use message APIs for user-authored input. Use `sendSignal()` for lower-level system context, such as background task notifications, policy reminders, or processor-generated context.

> **📹 Watch:** Watch [Mastra signals overview](https://www.youtube.com/watch?v=7It2y89TVP4) to see how signals wake and steer long-running agents.

### When to use signals

Use signals when an agent thread needs new input or context outside the original `stream()` call. Signals are useful when users send follow-up messages while a run is active, when background systems need to add context to a thread, or when external events should wake, update, or notify the agent.

Use `sendMessage()` and `queueMessage()` for user-authored input. Use `sendSignal()` for lower-level system context. Use `sendStateSignal()` for durable state lanes, and use `sendNotificationSignal()` when an external event should create a durable notification inbox record.

### Quickstart

Create an agent, subscribe to a thread, then send a message to that thread. The subscription receives the active stream when the message wakes the agent or enters a running loop.

```typescript
import { Agent } from '@mastra/core/agent'

const agent = new Agent({
  id: 'support-agent',
  name: 'Support Agent',
  instructions: 'Help the user compare options.',
  model: 'openai/gpt-5.6-sol',
})

const thread = {
  resourceId: 'user_123',
  threadId: 'thread_456',
}

const subscription = await agent.subscribeToThread(thread)

await agent.sendMessage('Compare that with the previous option.', thread)

for await (const chunk of subscription.stream) {
  console.log(chunk)
}
```

When the thread has a running agent stream, `sendMessage()` becomes new input inside that agent loop. When the thread is idle, Mastra starts a stream with the message as the first input.

#### Input during reasoning

In the default loop and experimental durable and evented agents, accepted pending messages and signals interrupt a model request that has produced only reasoning or metadata. This includes the wait for its first token. Mastra cancels that request, discards its response from model history and memory, and includes queued input in the next request within the same run. Earlier completed responses stay in history.

Once text, tool calls, or other response content starts, signals wait for the next loop boundary. Running tools aren't cancelled or repeated. If the run reaches `maxSteps`, queued input may be saved without a response. `queueMessage()` still waits for the active run to finish. Signals that processors write directly to the message history don't interrupt their own request.

Interrupted requests don't count toward `maxSteps` or advance `stepNumber`. The next request uses the same logical step, so `maxSteps: 1` still allows a replacement response. Mastra doesn't set a separate interruption limit. Repeated signals can keep restarting reasoning until a request completes, the run is cancelled, or its total timeout expires.

Already-streamed reasoning may remain visible until the client reloads history. When input arrives while per-step input processors (`processInputStep`) run, the processors finish and Mastra cancels the model request they prepared. Custom output processors also keep running after a cancellation, and the next request waits for their in-flight work to settle. Mastra discards framework-owned response buffers, but doesn't undo processor state, data that processors write while the cancelled request settles, or external side effects. Usage totals exclude interrupted requests, including any usage the provider reports for them. Providers may still bill for those requests.

Reasoning interruption doesn't apply to the Inngest engine, or to durable and evented steps that run in a different process from the one that accepted the input.

### Message input

#### Send a message now

Use `sendMessage()` when the user expects the active agent to see the message immediately.

```typescript
agent.sendMessage(
  {
    contents: 'Use the latest customer note too.',
    attributes: { name: 'Jane', sentFrom: 'slack' },
  },
  {
    resourceId: 'user_123',
    threadId: 'thread_456',
  },
)
```

The model receives attributed messages as XML-wrapped user input:

```xml
<user name="Jane" sentFrom="slack">Use the latest customer note too.</user>
```

Messages without attributes are sent as plain user input.

#### Queue a message for the next turn

Use `queueMessage()` when a user sends a follow-up but the active model call should finish first. Mastra waits for the active run to complete, then starts a new run on the same thread.

```typescript
agent.queueMessage('Also check whether the tests need updates.', {
  resourceId: 'user_123',
  threadId: 'thread_456',
})
```

When the thread is idle, `queueMessage()` starts a run immediately. When the thread is active, it preserves turn order by starting a new run after the active run completes.

#### Queue a typed signal for the next turn

Use `queueSignal()` when system-generated input needs the same turn ordering as `queueMessage()` but should keep its own signal type, tag, and attributes. For example, a skill invocation can render as a `<skill>` element instead of a plain user message:

```typescript
agent.queueSignal(
  {
    type: 'reactive',
    tagName: 'skill',
    attributes: { name: 'triage' },
    contents: 'Triage the new issue.',
  },
  { resourceId: 'user_123', threadId: 'thread_456' },
)
```

The model receives `<skill name="triage">Triage the new issue.</skill>`. Queued signals share the `queueMessage()` queue, so they count toward queue-count events and you can cancel them with `cancelQueuedMessages()`.

When a signal starts a run, the run's `AGENT_RUN` span records the signal's `id`, `type`, `tagName`, and `attributes` under `attributes.signal`.

#### Cancel pending input

Use [`cancelQueuedMessages()`](https://mastra.ai/reference/agents/agent) to remove selected pending input without stopping the active run. Cancellation is scoped to the memory thread, including input submitted by other Agents sharing the same runtime and PubSub instance.

The thread must still have a pending message to cancel. This example assumes a run is active when you queue the message. An idle thread starts the message immediately instead.

```typescript
const queued = agent.queueMessage('Also check the tests.', thread)
await queued.accepted

const { cancelledSignalIds } = agent.cancelQueuedMessages({
  ...thread,
  signalIds: [queued.signal.id],
})
console.log(cancelledSignalIds)
```

Only IDs removed locally by this call appear in `cancelledSignalIds`. Mastra still publishes every requested ID through PubSub, even when none are pending locally, so other processes subscribed to the thread can cancel their matching pending input. Because that propagation is asynchronous, the result doesn't confirm remote cancellation, and input that has already been handed to execution is out of reach. Cancellation doesn't delete saved messages, notification records, or state updates, and it never revokes an earlier acceptance acknowledgement.

#### Stop the run and clear pending input

By default, aborting a thread preserves its queued input. To clear pending signals before stopping the active run, pass `clearPendingSignals: true`:

```typescript
subscription.abort({ clearPendingSignals: true })
```

Without a subscription, use `agent.abortThreadStream({ ...thread, clearPendingSignals: true })`. Existing listeners stay subscribed after cancellation, and later messages can still start a new run.

With a shared PubSub backend, the runtime receives remote signals, cancellation, and abort requests independently of `subscribeToThread()` observers. Clear-on-abort sends the clear flag to a remote active owner through PubSub, but it doesn't clear every process's local queues. Neither operation cancels continuations created by `continueWithMessages()`.

### Signal context

#### Control low-level signal behavior

Use `sendSignal()` when you need to send system-generated context instead of user-authored input. For external events, use `type: 'notification'`. By default, Mastra delivers signals to active runs and wakes idle threads. Use `ifActive.behavior` and `ifIdle.behavior` to change that behavior.

```typescript
const result = agent.sendSignal(
  {
    type: 'notification',
    contents: 'GitHub CI failed on PR #123: 3 tests failed.',
  },
  {
    resourceId: 'user_123',
    threadId: 'thread_456',
    ifIdle: {
      behavior: 'persist',
    },
  },
)

await result.persisted
```

Pass `ifIdle.streamOptions` when the idle wake-up stream needs options such as model settings, tools, or runtime context. Visit [`Agent.sendSignal()` reference](https://mastra.ai/reference/agents/agent) for `ifActive`, `ifIdle`, branch attributes, and `streamOptions`.

#### Send notification context

Signals have a semantic `type` and an LLM-facing `tagName`. Use `type` to describe the signal category. Use `tagName` to control the XML tag the model sees.

For external events, use `type: 'notification'`. Reactive signals are reserved for processor- or runtime-generated context, such as policy guidance, background task results, and auto-loaded instructions.

```typescript
agent.sendSignal(
  {
    type: 'notification',
    contents: 'PR #123 has a new review comment from User X about the API surface.',
    attributes: {
      source: 'github',
      pr: '123',
    },
  },
  {
    resourceId: 'user_123',
    threadId: 'thread_456',
  },
)
```

The model receives the signal as context like this:

```xml
<notification source="github" pr="123">PR #123 has a new review comment from User X about the API surface.</notification>
```

Use XML-safe `tagName` and attribute names. They can contain letters, numbers, periods, hyphens, and the underscore character (`_`). They must start with a letter or underscore.

##### Storage support

Notification inbox storage is available in the storage adapters that support richer memory and signal workflows: [libSQL](https://mastra.ai/integrations/databases/libsql), [PostgreSQL](https://mastra.ai/integrations/databases/postgresql), and [MongoDB](https://mastra.ai/integrations/databases/mongodb). These adapters expose notification records through `getStore('notifications')`.

#### Send processor context

Processors can send reactive signals during a run. A processor should inspect the chat history and react to a specific trigger without sending the same context more than once.

The following example demonstrates a processor that injects `AGENTS.md` instructions after a tool call reads an `AGENTS.md` file.

```typescript
import type { Processor, ProcessInputStepArgs } from '@mastra/core/processors'

export const agentsMdReminderProcessor: Processor = {
  id: 'agents-md-reminder',
  async processInputStep({ messageList, sendSignal }: ProcessInputStepArgs) {
    const messages = messageList.get.all.db()
    const agentsMdPath = findAgentsMdPathFromToolCalls(messages)

    if (!agentsMdPath || hasAlreadySentAgentsMdReminder(messages, agentsMdPath)) {
      return messageList
    }

    await sendSignal?.({
      type: 'reactive',
      contents: readAgentsMdInstructions(agentsMdPath),
      attributes: {
        type: 'dynamic-agents-md',
        path: agentsMdPath,
      },
      metadata: {
        path: agentsMdPath,
      },
    })

    return messageList
  },
}
```

Reactive signals default to `tagName: 'system-reminder'`. The model receives this context as

```xml
<system-reminder type="dynamic-agents-md" path="packages/ui/AGENTS.md">
  $agentsMdFileContents
</system-reminder>
```

Awaiting `sendSignal()` preserves stream echo ordering when a subscribed thread is active.

#### Conditional attributes

Use `ifActive.attributes` and `ifIdle.attributes` to tag input with context that depends on whether the agent is active or idle at delivery time. Top-level `attributes` always apply, and Mastra merges the selected branch's `attributes` into them when the input is accepted. Visit [`Agent.sendMessage()` reference](https://mastra.ai/reference/agents/agent) and [`Agent.sendSignal()` reference](https://mastra.ai/reference/agents/agent) for branch-specific attributes.

### State and notification signals

#### State signals

State signals expose named, thread-scoped context lanes. Use them for durable context that changes over time, such as browser state, editor state, or a background watcher result.

Use `sendStateSignal()` when an external producer detects a state change. Each state signal identifies a state lane, a producer-owned cache key, and whether the update is a snapshot or delta.

```typescript
await agent.sendStateSignal(
  {
    id: 'browser',
    mode: 'snapshot',
    cacheKey: 'browser:https://example.com:3-tabs',
    contents: 'Browser is open. Active tab URL: https://example.com. 3 open tabs.',
    value: {
      activeUrl: 'https://example.com',
      tabCount: 3,
      open: true,
    },
  },
  {
    resourceId: 'user_123',
    threadId: 'thread_456',
  },
)
```

When Mastra accepts a state signal, it stores compact tracking metadata on the thread. If a producer sends the same `cacheKey` and mode again while that state is still current, Mastra skips the duplicate.

Use `computeStateSignal()` when a processor owns a state lane. Mastra calls it once per model input step after `processInputStep()`. Visit [`Agent.sendStateSignal()` reference](https://mastra.ai/reference/agents/agent) for state signal fields and return values.

```typescript
import type { ComputeStateSignalArgs, Processor } from '@mastra/core/processors'

export const browserStateProcessor: Processor = {
  id: 'browser-state',
  stateId: 'browser',
  computeStateSignal(args: ComputeStateSignalArgs) {
    const browser = readCurrentBrowserState()
    const previous = readMostRecentBrowserState(args.activeStateSignals)
    const changed = previous ? diffBrowserState(previous, browser) : browser
    const shouldRefreshSnapshot = Boolean(args.lastSnapshot && !args.contextWindow.hasSnapshot)

    if (previous && Object.keys(changed).length === 0 && !shouldRefreshSnapshot) {
      return
    }

    const isDelta = Boolean(previous && !shouldRefreshSnapshot)

    return {
      mode: isDelta ? 'delta' : 'snapshot',
      cacheKey: stableBrowserStateCacheKey(browser),
      contents: isDelta ? describeBrowserDelta(changed) : describeBrowserSnapshot(browser),
      value: browser,
      ...(isDelta ? { delta: changed } : {}),
    }
  },
}
```

Mastra passes `lastSnapshot` and `deltasSinceSnapshot` into `computeStateSignal()`. It resolves them from message history when the current message list doesn't contain the latest snapshot. The processor still owns merge and diff logic.

`contextWindow.hasSnapshot` tells the processor whether the active message window already contains a snapshot for this state lane. If it's `false`, return a fresh `snapshot` so the model sees the current state even after older state messages are trimmed from the context window.

The built-in browser context processor emits state under the `browser` id with snapshot and delta modes.

#### Notification signals

Notification signals represent external events such as GitHub activity, email, Slack mentions, CI status, incidents, recordings, or direct messages. Use `agent.sendNotificationSignal()` when the event should create a durable inbox record.

Notification delivery has two phases. During ingress, `agent.sendNotificationSignal()` stores a notification record and resolves the agent's delivery policy. During dispatch, Mastra consumes due records and emits full notification or summary signals.

The default delivery policy is priority-aware. Urgent notifications deliver immediately, while lower-priority notifications may be batched into summaries or wait until the thread is idle. Visit [`Agent.sendNotificationSignal()` reference](https://mastra.ai/reference/agents/agent) for notification fields, [`Agent` constructor reference](https://mastra.ai/reference/agents/agent) for `notifications.deliveryPolicy` configuration, and [`createNotificationInboxTool()` reference](https://mastra.ai/reference/signals/create-notification-inbox-tool) for inbox tool actions.

```typescript
await agent.sendNotificationSignal(
  {
    source: 'github',
    kind: 'ci-status',
    priority: 'high',
    summary: 'CI failed on main: 3 tests failed.',
    payload: {
      repository: 'acme/app',
      branch: 'main',
    },
    dedupeKey: 'github:acme/app:main:ci',
  },
  {
    resourceId: 'user_123',
    threadId: 'thread_456',
  },
)
```

The model receives full notifications as context:

```xml
<notification source="github" type="ci-status" priority="high" status="delivered">CI failed on main: 3 tests failed.</notification>
```

Notification summaries tell the model that inbox records are waiting:

```xml
<notification-summary pending="10">github: 3, email: 5, slack: 2</notification-summary>
```

When Mastra emits a summary, it clears `summaryAt` and sets `summarySignalId` on each summarized record. The records stay pending and readable. When Mastra emits a full notification, it sets `deliveredSignalId` and marks the record `delivered`. If the inbox tool reads a notification first, it can inject the full notification signal and mark the record `seen`, which prevents duplicate full delivery.

Configure a delivery policy on the agent when some notifications should wait for a different dispatch window or summary rollup. Enable scheduled dispatch at the Mastra level when deferred notifications and summary rollups should be delivered automatically. Visit [`Agent` constructor reference](https://mastra.ai/reference/agents/agent) for `notifications.deliveryPolicy` and [`Mastra` class reference](https://mastra.ai/reference/core/mastra-class) for runtime notification dispatch configuration.

##### Notification inbox tool

Use `createNotificationInboxTool()` to give agents one tool for inbox actions instead of many CRUD tools. Use `read` after a `<notification-summary>` signal when the agent needs the full records behind the summary. The notification contents are delivered as signals, not as normal tool output. Visit [`createNotificationInboxTool()` reference](https://mastra.ai/reference/signals/create-notification-inbox-tool) for the setup example, input schema, and action behavior.

`sendNotificationSignal()` requires a storage domain with `notifications` support. Use `sendSignal({ type: 'notification' })` only for lower-level notification-shaped context that should bypass inbox storage.

### Cross-agent connections in Mastra Code

Cross-agent communication is experimental and off by default. Enable it in Mastra Code with the `/settings` toggle "Experimental cross-agent communication" and restart. Embedded clients can set `crossAgentSignals: true` when calling `createMastraCode()`. The setting enables thread ownership advertisements and peer discovery. It also makes the agent connection tools available, and lets peer discovery reach instances in other projects on the same machine (see [Discover agents in other projects](#discover-agents-in-other-projects)).

```typescript
import { createMastraCode } from 'mastracode'

const mastraCode = await createMastraCode({
  crossAgentSignals: true,
})
```

Mastra Code can use notification signals to communicate between agent threads. A peer is an exact `{ agentId, resourceId, threadId }` endpoint. Discovery is a point-in-time advertisement that the exact endpoint is available now. It isn't a durable connection or a guarantee that delivery will succeed.

`agent_connections_list` returns one `peers` collection. Each peer includes:

- `relationship`: `none` or `saved`. This is the authoritative durable state for the current sender thread.
- `presence`: `advertised` or `absent`. This reflects the current discovery pass.
- `displayStatus`: A derived, presentational value: `discovered`, `connected`, or `saved`.
- `canAttemptSend`: `true` only when the peer is both saved and currently advertised.

The displayed statuses mean:

| Status         | Meaning                                                     | Can attempt a send? |
| -------------- | ----------------------------------------------------------- | ------------------- |
| `[discovered]` | Advertised now, but not saved by the current sender thread. | No                  |
| `[connected]`  | Saved by the current sender thread and advertised now.      | Yes                 |
| `[saved]`      | Saved by the current sender thread, but not advertised now. | No                  |

Use the connection tools for distinct operations:

- `agent_connect` saves a freshly discovered exact peer in the current sender thread.
- `agent_disconnect` removes a saved peer from the current sender thread. The peer doesn't need to be currently advertised, and repeated disconnects are safe.
- `agent_signal_send` requires the exact peer to remain saved and freshly advertised at send time. A previously discovered or recently seen peer that's absent from the current discovery pass isn't sendable.

Saved connections remain in the sender thread until explicitly disconnected. Every send independently refreshes discovery and verifies the exact endpoint before routing begins. A saved connection therefore records collaboration intent. It doesn't indicate current presence.

After a send attempt reaches Core routing, the routing result is authoritative. The result can be `wake`, `deliver`, `persist`, `blocked`, or `discard`, depending on the target thread and notification policy. A send that isn't acknowledged by the advertised thread owner returns an error and doesn't consume its `messageId`, so the sender can retry it.

#### Discover agents in other projects

With cross-agent communication on, `agent_connections_list` lists Mastra Code instances in every project on the same machine, including the current one. An instance can connect to and message an instance in another project, and receive its replies. This needs Unix socket pub/sub. The Mastra Code CLI turns it on by default. Embedded clients pass `unixSocketPubSub: true` alongside `crossAgentSignals: true` to `createMastraCode()`. It doesn't apply in these cases:

- On Windows.
- When you pass your own `pubsub`.
- When the resource ID, set through `MASTRA_RESOURCE_ID` or `resourceId` in `.mastracode/database.json`, can't be used as a directory name. That covers IDs that are empty, are longer than 128 characters, contain `/`, `\` or control characters, or equal `.`, `..` or `_shared`. Mastra Code logs one warning at startup, and the instance only lists instances that share its resource ID.

Mastra Code routes a thread's messages and run leases to the socket directory of the thread's project. Thread-owner lookup and peer discovery, which lists the threads you can connect to, both run in a shared `/tmp/mc/_shared` directory. Instances running versions before this change can't see or be seen by updated instances, so restart every instance after updating.

Any local process running as your user can list the threads your instances advertise and message them, so only turn on cross-agent communication on machines and accounts you trust.

To isolate an instance or a test from the shared `/tmp/mc` directory, set `MASTRACODE_SIGNALS_SOCKET_ROOT` to another absolute path. Relative paths are ignored. Keep the path short, because macOS limits Unix socket paths to 104 bytes. The root also holds every thread's run and ownership leases. An instance with a different root doesn't coordinate threads with instances that use the default root.

### Distributed and serverless deployments

Signals coordinate runs through a pub/sub backend. When a signal arrives on a backend that implements `LeaseProvider`, Mastra acquires a lease on the target thread so a single process owns the conversation at a time, then either wakes the agent or routes the input into the running loop. Backends without leasing fall back to a no-op that always grants ownership, which is fine in a single process but not across instances.

The default in-memory pub/sub can't cross instance boundaries. On serverless platforms like Vercel, or any multi-instance deployment, a follow-up signal can be routed to a different instance than the one running the agent.

Without a shared pub/sub, that instance can't reach the active run and starts its own, leaving the original run untouched and the thread processed twice.

Configure a shared pub/sub backed by Redis Streams on the `Mastra` instance so leases and signals coordinate across instances:

```typescript
import { Mastra } from '@mastra/core'
import { RedisStreamsPubSub } from '@mastra/redis-streams'

export const mastra = new Mastra({
  agents: { agent },
  pubsub: new RedisStreamsPubSub({
    url: process.env.REDIS_URL,
    keyPrefix: 'mastra:my-app',
  }),
})
```

`RedisStreamsPubSub` implements both the event delivery contract and distributed leasing. A single backend handles cross-instance signal delivery and lease ownership. Vercel's managed Redis integration and Upstash Redis both work well. For more on when a distributed pub/sub is needed, see the [PubSub guide](https://mastra.ai/docs/server/pubsub) and the [`RedisStreamsPubSub` reference](https://mastra.ai/reference/pubsub/redis-streams).

### Compatibility and APIs

#### Compatibility

Mastra still accepts legacy signal payloads such as `type: 'user-message'` and `type: 'system-reminder'`. It normalizes them internally to the new category and tag shape:

- `type: 'user-message'`: Normalizes to `type: 'user'` and `tagName: 'user'`
- `type: 'system-reminder'`: Normalizes to `type: 'reactive'` and `tagName: 'system-reminder'`

Existing stored signal rows and older clients continue to load through the compatibility layer. New clients call the message routes when the server supports them. React's thread signal path falls back to the legacy `/signals` route when it detects an older server. Visit [Agent signals reference](https://mastra.ai/reference/agents/agent) for the full message, signal, and subscription types.

#### Approve tool calls

When a subscribed run pauses for tool approval, approve or decline the tool call with the subscription-native methods. The resumed chunks arrive through the existing thread subscription. Visit [`client.getAgent().sendToolApproval()` reference](https://mastra.ai/reference/client-js/agents) and [server agent routes](https://mastra.ai/reference/server/routes) for request and response shapes.

#### Use HTTP routes

If you call Mastra over HTTP directly, use `POST /api/agents/:agentId/send-message` for immediate messages and `POST /api/agents/:agentId/queue-message` for next-turn messages. For subscription-native tool approval, use `POST /api/agents/:agentId/send-tool-approval`. See [Server routes reference](https://mastra.ai/reference/server/routes) for request and response schemas.

#### Use the client SDK

The JavaScript client exposes thread signal APIs.

Use `subscribeToThread()` before sending thread input so the client can render the stream that receives the input or wakes in response to it.

```typescript
const agent = client.getAgent('supportAgent')

const subscription = await agent.subscribeToThread({
  resourceId: 'user_123',
  threadId: 'thread_456',
})

await agent.sendMessage({
  message: 'Show the shorter version.',
  resourceId: 'user_123',
  threadId: 'thread_456',
})

await subscription.processDataStream({
  onChunk: chunk => {
    console.log(chunk)
  },
  reconnect: true,
})
```

Use `reconnect: true` for long-lived subscriptions. Visit [`client.getAgent().subscribeToThread()` reference](https://mastra.ai/reference/client-js/agents) for reconnect options.

#### Keep custom SSE subscriptions alive

If you expose your own Server-Sent Events (SSE) endpoint for thread subscriptions, send periodic heartbeat frames while the stream is idle. This keeps browsers, proxies, and load balancers from closing the connection before the next signal or model chunk arrives.

The following example sends an SSE comment every 25 seconds:

```typescript
const heartbeat = setInterval(() => {
  controller.enqueue(encoder.encode(': keep-alive\n\n'))
}, 25_000)

request.signal.addEventListener('abort', () => {
  clearInterval(heartbeat)
})
```

Use heartbeats together with client-side reconnect logic. Heartbeats reduce idle disconnects, while reconnects recover when the network or runtime still closes the stream.

### Related

- [`Agent.sendMessage()`](https://mastra.ai/reference/agents/agent)
- [`Agent.queueMessage()`](https://mastra.ai/reference/agents/agent)
- [`Agent.queueSignal()`](https://mastra.ai/reference/agents/agent)
- [`Agent.sendSignal()`](https://mastra.ai/reference/agents/agent)
- [`Agent.sendStateSignal()`](https://mastra.ai/reference/agents/agent)
- [`Agent.subscribeToThread()`](https://mastra.ai/reference/agents/agent)
- [`createNotificationInboxTool()`](https://mastra.ai/reference/signals/create-notification-inbox-tool)
- [`client.getAgent().sendMessage()`](https://mastra.ai/reference/client-js/agents)
- [`client.getAgent().queueMessage()`](https://mastra.ai/reference/client-js/agents)
- [`client.getAgent().queueSignal()`](https://mastra.ai/reference/client-js/agents)
- [`client.getAgent().sendSignal()`](https://mastra.ai/reference/client-js/agents)
- [Server agent routes](https://mastra.ai/reference/server/routes)
- [`client.getAgent().subscribeToThread()`](https://mastra.ai/reference/client-js/agents)
- [`client.getAgent().sendToolApproval()`](https://mastra.ai/reference/client-js/agents)
- [`RedisStreamsPubSub`](https://mastra.ai/reference/pubsub/redis-streams)
- 📹 [Mastra signals workshop](https://www.youtube.com/watch?v=KLg6uFKz9aw\&t=3020s)

---

## Source: Signal Providers (`docs/harness/signal-providers`)

Canonical URL: `https://mastra.ai/docs/harness/signal-providers.md`

## Signal providers

**Added in:** `@mastra/core@1.42.0`

A signal provider monitors an external source, such as GitHub, Slack, continuous integration (CI), or your own API, and pushes [notification signals](https://mastra.ai/docs/harness/signals) into subscribed agent threads.

### When to use a signal provider

Use a signal provider when an external system produces events that an agent should react to, and you want Mastra to manage the subscription bookkeeping for you.

- The source emits events tied to a resource a thread cares about, such as a pull request, a channel, or a build.
- You want one place that tracks which threads watch which external resources.
- You want to receive events by polling or by webhook, or alternatively both.

If you only need to push a one-off event into a thread, call [`agent.sendNotificationSignal()`](https://mastra.ai/reference/agents/agent) directly instead.

### How signal providers work

A signal provider is the producing side of the [signals](https://mastra.ai/docs/harness/signals) system. It brings external events into a thread, while the signal APIs control how the thread consumes them.

A signal provider combines three capabilities:

- **Subscription tracking:** The `SignalProvider` base class keeps an in-memory registry that maps each agent thread to the external resources it watches.
- **Ingestion:** You override `poll()` for pull-based sources or `handleWebhook()` for push-based sources.
- **Delivery:** When an event matches a subscription, call the protected `notify()` helper to forward a notification signal to the connected agent's thread.

Register a provider by passing it to an agent.

The agent connects the provider and starts polling when a `pollInterval` is set. It also merges any processors or tools exposed by the provider.

```typescript
import { Agent } from '@mastra/core/agent'
import { CiSignals } from '../signals/ci-signals'

export const supportAgent = new Agent({
  id: 'support-agent',
  name: 'Support Agent',
  instructions: 'Help the user triage updates.',
  model: 'openai/gpt-5.6-sol',
  signals: [new CiSignals()],
})
```

> **Note:** Notification delivery requires a storage adapter with notification support, such as [libSQL](https://mastra.ai/integrations/databases/libsql), [PostgreSQL](https://mastra.ai/integrations/databases/postgresql), or [MongoDB](https://mastra.ai/integrations/databases/mongodb). Configure storage on the Mastra instance so `notify()` can store notification records.

### Quickstart

The following example demonstrates a polling provider that watches CI pipelines and emits a notification when a subscribed pipeline fails.

```typescript
import { SignalProvider } from '@mastra/core/signals'
import type { SignalProviderTarget, SignalSubscription } from '@mastra/core/signals'

type BuildStatus = {
  id: string
  status: 'passed' | 'failed'
}

const builds = new Map<string, BuildStatus>([
  ['acme-app-main', { id: 'build_123', status: 'failed' }],
])

async function fetchBuildStatus(pipeline: string): Promise<BuildStatus> {
  return builds.get(pipeline) ?? { id: 'build_unknown', status: 'passed' }
}

export class CiSignals extends SignalProvider<'ci-signals'> {
  readonly id = 'ci-signals' as const
  readonly pollInterval = 30_000

  watch(target: SignalProviderTarget, pipeline: string) {
    return this.subscribe(target, pipeline)
  }

  unwatch(target: SignalProviderTarget, pipeline: string) {
    return this.unsubscribe(target, pipeline)
  }

  async poll(subscriptions: SignalSubscription[]) {
    for (const sub of subscriptions) {
      const build = await fetchBuildStatus(sub.externalResourceId)
      if (build.status !== 'failed') continue

      await this.notify(
        {
          source: this.id,
          kind: 'ci-status',
          priority: 'high',
          summary: `Build failed for ${sub.externalResourceId}`,
          payload: build,
          dedupeKey: `${this.id}:${sub.externalResourceId}:${build.id}`,
        },
        { resourceId: sub.resourceId, threadId: sub.threadId },
      )
    }
  }
}
```

Register the provider with an agent and subscribe a thread to the pipeline you want to watch.

```typescript
import { Agent } from '@mastra/core/agent'
import { CiSignals } from '../signals/ci-signals'

export const ciSignals = new CiSignals()

export const supportAgent = new Agent({
  id: 'support-agent',
  name: 'Support Agent',
  instructions: 'Help the user triage CI updates.',
  model: 'openai/gpt-5.6-sol',
  signals: [ciSignals],
})

ciSignals.watch({ resourceId: 'user_123', threadId: 'thread_456' }, 'acme-app-main')
```

Mastra calls `poll()` on the `pollInterval` with all active subscriptions. It skips a cycle when there are no subscriptions and doesn't overlap cycles, so a slow `poll()` doesn't run concurrently with itself.

> **Note:** For a complete polling-provider build with notification storage, agent registration, thread subscription, and testing, follow [Building a signal provider](https://mastra.ai/blog/building-a-signal-provider).

### Polling and webhook providers

Use polling when the external source doesn't push events to your app. Set `pollInterval` and override `poll(subscriptions)`. Each subscription includes the thread target and the external resource id to inspect.

Use webhooks when the external source can call your app. Override `handleWebhook(request)` to parse the payload, then find matching subscriptions and call `notify()` for every match.

```typescript
import { SignalProvider } from '@mastra/core/signals'
import type { SignalProviderWebhookRequest } from '@mastra/core/signals'

export class CiSignals extends SignalProvider<'ci-signals'> {
  readonly id = 'ci-signals' as const

  async handleWebhook(request: SignalProviderWebhookRequest) {
    const payload = request.body as { pipeline: string; status: string }
    const subscriptions = this.getSubscriptionsForResource(payload.pipeline)

    for (const sub of subscriptions) {
      await this.notify(
        {
          source: this.id,
          kind: 'ci-status',
          priority: 'high',
          summary: `Build ${payload.status} for ${payload.pipeline}`,
          payload,
        },
        { resourceId: sub.resourceId, threadId: sub.threadId },
      )
    }

    return { status: 200, body: { matched: subscriptions.length } }
  }
}
```

`handleWebhook()` is a provider method, not an auto-mounted HTTP route. Invoke it from your own endpoint, passing the request body, headers, and any route params. Visit [`SignalProvider` reference](https://mastra.ai/reference/signals/signal-provider) for subscription, polling, lifecycle, and `notify()` details. For the complete notification payload shape, including deduplication and coalescing fields, visit [`Agent.sendNotificationSignal()` reference](https://mastra.ai/reference/agents/agent).

### Built-in webhook provider

For generic webhook sources, use [`WebhookSignalProvider`](https://mastra.ai/reference/signals/webhook-signal-provider) instead of writing a subclass. Configure it with a function that extracts a resource id from the payload, and an optional function that builds the notification.

```typescript
import { Agent } from '@mastra/core/agent'
import { WebhookSignalProvider } from '@mastra/core/signals'

const webhooks = new WebhookSignalProvider({
  extractResourceId: payload => (payload as { repository: string }).repository,
  buildNotification: (payload, sub) => ({
    source: 'ci',
    kind: 'build-status',
    priority: 'medium',
    summary: `Build ${(payload as { status: string }).status} for ${sub.externalResourceId}`,
  }),
})

export const supportAgent = new Agent({
  id: 'support-agent',
  name: 'Support Agent',
  instructions: 'Help the user triage updates.',
  model: 'openai/gpt-5.6-sol',
  signals: [webhooks],
})

webhooks.subscribeThread({ resourceId: 'user_123', threadId: 'thread_456' }, 'acme/app')
```

When a webhook arrives, call `webhooks.handleWebhook({ body, headers })` from your route. The provider matches the extracted resource id against its subscriptions and notifies each matching thread.

### Advanced provider capabilities

A provider can support more than event ingestion. Add only the capabilities your source needs.

- **Durable subscriptions:** The base registry is in-memory and per-process. Persist subscriptions yourself when they must survive a restart, then rehydrate them in [`start()`](https://mastra.ai/reference/signals/signal-provider).
- **Lifecycle hooks:** Override [`start()`](https://mastra.ai/reference/signals/signal-provider) for async setup and [`stop()`](https://mastra.ai/reference/signals/signal-provider) for cleanup. Call `super.stop()` when overriding `stop()` so the base provider can stop polling and clear its registry.
- **Processors and tools:** Return processors from [`getInputProcessors()`](https://mastra.ai/reference/signals/signal-provider) or [`getOutputProcessors()`](https://mastra.ai/reference/signals/signal-provider), and return agent-callable tools from [`getTools()`](https://mastra.ai/reference/signals/signal-provider).

For a production provider that watches GitHub pull requests, see the [GitHub Channels integration](https://mastra.ai/integrations/channels/github).

### Related

- [Guide: Building a signal provider](https://mastra.ai/blog/building-a-signal-provider)
- [Signals](https://mastra.ai/docs/harness/signals)
- [Notification signals](https://mastra.ai/docs/harness/signals)
- [`SignalProvider` reference](https://mastra.ai/reference/signals/signal-provider)
- [`WebhookSignalProvider` reference](https://mastra.ai/reference/signals/webhook-signal-provider)
- [Mastra Factory](https://factory.mastra.ai/) uses signal providers to integrate with external systems like GitHub and Linear, bringing issues and pull requests into a collaborative work board.

---

## Source: Agent Controller (`docs/harness/agent-controller`)

Canonical URL: `https://mastra.ai/docs/harness/agent-controller.md`

## Agent Controller

`AgentController` is a shared runtime host for interactive agent applications. It coordinates modes, models, storage, workspaces, tool approvals, subagents, and channels. Each user or active task works through an isolated [`Session`](https://mastra.ai/reference/agent-controller/session).

[Mastra Code](https://code.mastra.ai) and [Mastra Factory](https://factory.mastra.ai) are the flagship AgentController implementations. They're coding agents with multi-model support, persistent conversations, and plan-then-execute workflows. Read [Building a coding agent](https://mastra.ai/blog/building-a-coding-agent) for a step-by-step TUI guide.

When the agent you host works in a codebase, build it with [`createCodingAgent()`](https://mastra.ai/reference/coding-agent/create-coding-agent) instead of `new Agent()`. It returns a standard `Agent` that already has a workspace, task tracking, and retries for transient model errors, which are the defaults Mastra Code runs on.

### When to use the Agent Controller

Use the Agent Controller when your application needs:

- Multiple agent modes that share one conversation thread (e.g., plan → build → review)
- A control layer between your UI and the agent loop (model switching, state persistence, thread management)
- Tool approval flows and permission policies for human-in-the-loop gating
- Subagent orchestration to delegate focused subtasks with constrained tools
- Persistent threads and selected thread settings across restarts, with isolated live state for each Session

You could assemble all of this yourself on top of the [Agent class](https://mastra.ai/docs/agents/overview), which exposes the full agent loop, tools, and memory. The AgentController provides opinionated defaults for an ongoing session where the agent acts as a collaborator rather than a one-shot endpoint. Use the Agent class directly for full control or request-response calls. Choose AgentController for ongoing sessions without building your own session runtime.

### Quickstart

Create the backing [`Agent`](https://mastra.ai/reference/agents/agent), storage, and [`Workspace`](https://mastra.ai/reference/workspace/workspace-class). Call [`controller.init()`](https://mastra.ai/reference/agent-controller/agent-controller-class) once, then use [`controller.createSession()`](https://mastra.ai/reference/agent-controller/agent-controller-class) to create a Session. Subscribe with [`session.subscribe()`](https://mastra.ai/reference/agent-controller/session) and send work with [`session.sendMessage()`](https://mastra.ai/reference/agent-controller/session):

```typescript
import { Agent } from '@mastra/core/agent'
import { AgentController } from '@mastra/core/agent-controller'
import { LocalFilesystem, Workspace } from '@mastra/core/workspace'
import { LibSQLStore } from '@mastra/libsql'

const agent = new Agent({
  id: 'assistant',
  name: 'Assistant',
  instructions: 'Help the user plan and complete tasks.',
  model: 'openai/gpt-5.6-sol',
})

const controller = new AgentController({
  id: 'assistant-controller',
  agent,
  storage: new LibSQLStore({
    id: 'agent-controller-storage',
    url: 'file:./mastra.db',
  }),
  workspace: new Workspace({
    id: 'assistant-workspace',
    filesystem: new LocalFilesystem({ basePath: './workspace' }),
  }),
  modes: [
    {
      id: 'plan',
      name: 'Plan',
      metadata: { default: true },
      instructions: 'Reason about the task before making changes.',
    },
    {
      id: 'build',
      name: 'Build',
      instructions: 'Implement the approved plan.',
    },
  ],
})

await controller.init()

const session = await controller.createSession({
  resourceId: 'user-123',
})

const unsubscribe = session.subscribe(event => {
  if (event.type === 'message_update' && event.event.type === 'text-delta') {
    process.stdout.write(event.event.delta)
  }
})

await session.sendMessage({ content: 'Plan a small TypeScript CLI.' })
unsubscribe()
```

Each message emits a `message_start` event with the initial message, zero or more `message_update` events with compact deltas, and a `message_end` event containing the message ID. Apply updates by ID when you need to reconstruct the complete message.

Use the same controller for many Sessions. Don't store a current Session on the controller or route work through controller-level message methods.

### Understand the runtime model

The controller, Session, and thread have different lifetimes:

- **Controller**: A shared host for configuration and runtime services. Initialize it once and reuse it.
- **Session**: An isolated live runtime for one user, task, or concurrent work scope. It owns the active mode, model, state, event bus, run state, grants, and current thread binding.
- **Thread**: A stored conversation containing messages and thread settings. Threads can survive controller and process recreation when you configure storage.

A Session is live state. Arbitrary [`session.state`](https://mastra.ai/reference/agent-controller/session), permission grants, pending approvals, and active runs don't automatically survive process recreation. Thread messages and selected thread settings, including the active mode and the current model, can persist through storage, but switching modes doesn't change the model.

### Sessions and threads

`createSession()` is get-or-create by `resourceId` and optional `scope`:

```typescript
const webSession = await controller.createSession({
  resourceId: 'user-123',
  scope: 'web',
})

const sameWebSession = await controller.createSession({
  resourceId: 'user-123',
  scope: 'web',
})

const workerSession = await controller.createSession({
  resourceId: 'user-123',
  scope: 'background-worker',
})

console.log(webSession === sameWebSession) // true
console.log(webSession === workerSession) // false
```

Sessions with different scopes have separate event buses, run loops, state, mode and model selections, and current thread bindings. Their stored threads still belong to the shared `resourceId`.

Pass `threadId` when the host must bind the Session to an exact thread. The controller switches to the existing thread or creates it with that ID when it's missing. This behavior also applies when `createSession()` returns a cached Session:

```typescript
const session = await controller.createSession({
  resourceId: 'user-123',
  scope: 'web',
  threadId: 'support-ticket-42',
})
```

Use [`session.thread.create()`](https://mastra.ai/reference/agent-controller/session) and [`session.thread.switch()`](https://mastra.ai/reference/agent-controller/session) to move one live Session between conversations.

#### Transfer thread ownership

Each new thread stores its durable owner in `metadata.ownerId` and its original creator in `metadata.createdBy`. Both default to the Session host's `ownerId`. `createdBy` doesn't change when ownership transfers.

Read the active thread's owner and transfer it through `session.thread`:

```typescript
const currentOwnerId = await session.thread.getOwner()

await session.thread.transferOwnership({
  toOwnerId: 'user-456',
})
```

Transfers are serialized within one process. Hosts that require a durable cross-process compare-and-set should commit it in their own storage first, then call `transferOwnership()` to mirror the owner onto the active thread.

Every run snapshots the thread owner when it starts. Tools and other dynamic runtime code can read that value from `AgentControllerRequestContext.threadOwnerId`. If ownership changes during a run, the active run keeps the old snapshot and the next run receives the new owner. `context.session.ownerId` remains the identity of the process-local Session host.

#### List stored messages from the client

Use the Agent Controller client to page through a thread's stored messages. Passing an options object returns the messages with pagination metadata:

```typescript
import { MastraClient } from '@mastra/client-js'

const client = new MastraClient({ baseUrl: 'http://localhost:4111' })
const session = client.getAgentController('assistant-controller').session('user-123')

const result = await session.listMessages('support-ticket-42', {
  page: 0,
  perPage: 20,
  orderBy: { field: 'createdAt', direction: 'DESC' },
  filter: {
    dateRange: { start: new Date('2026-01-01') },
  },
})

console.log(result.messages)
console.log(result.total)
console.log(result.hasMore)
```

`page` is zero-indexed. Omitting `perPage` uses the storage default of 40 messages. Use `include` to request a message by ID with adjacent messages. `limit` is a deprecated alias for `perPage`; existing paged callers may use `{ limit, page }`, but must use `perPage` with `orderBy`, `filter`, or `include`. The existing numeric form, `session.listMessages(threadId, limit)`, remains available when you need the newest message window as an array, ordered oldest-first.

### Switch modes and models

Modes change the instructions and tools used by the shared backing agent without replacing the Session or thread. Configure mode-specific tools and visibility on the controller:

```typescript
const modes = [
  {
    id: 'plan',
    name: 'Plan',
    metadata: { default: true },
    instructions: 'Investigate the task and propose a plan.',
    additionalTools: { searchDocs },
    availableTools: ['searchDocs', 'submit_plan'],
    transitionsTo: 'build',
  },
  {
    id: 'build',
    name: 'Build',
    instructions: 'Implement the approved plan.',
  },
]
```

`tools` and `additionalTools` are mutually exclusive inputs for adding mode-specific tools. When the controller has a shared backing agent, either input layers those tools onto the agent's tools. Use `availableTools` to restrict the final exposed tool names for a mode. Permission denies still take precedence over this allowlist.

Switch the live Session with [`session.mode.switch()`](https://mastra.ai/reference/agent-controller/session). Read the active mode with [`session.mode.get()`](https://mastra.ai/reference/agent-controller/session) or [`session.mode.resolve()`](https://mastra.ai/reference/agent-controller/session):

```typescript
await session.mode.switch({ modeId: 'build' })

console.log(session.mode.get()) // "build"
console.log(session.mode.resolve().instructions)
```

Switch models independently with [`session.model.switch()`](https://mastra.ai/reference/agent-controller/session), then read the active selection with [`session.model.get()`](https://mastra.ai/reference/agent-controller/session). The selection is stored as the thread's current model and remains active when the Session changes modes:

```typescript
await session.model.switch('anthropic/claude-sonnet-4-6')

console.log(session.model.get())
```

#### Select Observational Memory models

Observer and reflector model choices are independent. Each role can use an explicit model or an automatic selection that the host resolves from the active main model and session state.

Configure automatic selection with a synchronous resolver that returns a concrete model ID:

```typescript
const controller = new AgentController({
  // ...
  omConfig: {
    observerModel: 'auto',
    reflectorModel: 'auto',
    defaultObserverModelId: 'openai/gpt-5-mini',
    defaultReflectorModelId: 'openai/gpt-5-mini',
    resolveAutoModelId: ({ currentModelId }) => currentModelId,
  },
})
```

`session.om.observer.model()` returns `'auto'` or a concrete model ID. `session.om.observer.modelId()` returns the effective concrete model. A host can therefore change the main model without rewriting automatic role settings.

Reset one role to automatic selection without changing the other:

```typescript
await session.om.observer.switchModel({ modelId: 'auto' })
```

If the resolver returns `undefined` or throws, the role uses its concrete `defaultObserverModelId` or `defaultReflectorModelId` fallback. See the [`Session` Observational Memory API](https://mastra.ai/reference/agent-controller/session) for explicit selection.

### Manage threads and state

List stored conversations with [`session.thread.list()`](https://mastra.ai/reference/agent-controller/session):

```typescript
const thread = await session.thread.create({ title: 'Release planning' })
const threads = await session.thread.list()

await session.thread.switch({ threadId: thread.id })
console.log(threads.length)
```

Use `session.state` for structured live state associated with the Session. Read it with [`session.state.get()`](https://mastra.ai/reference/agent-controller/session) and write updates with [`session.state.set()`](https://mastra.ai/reference/agent-controller/session). Define `stateSchema` and `initialState` on the controller when you need validation and defaults:

```typescript
console.log(session.state.get())

await session.state.set({ activeProject: 'docs-site' })
```

`session.state.get()` returns a snapshot. `set()` validates and merges the update into the Session state. Treat this state as live Session data unless your host explicitly persists and restores it.

### Approve tools and resume suspensions

Permission policies decide whether a tool is allowed, denied, or sent to the UI for approval. Map custom tools to categories with `toolCategoryResolver` on the controller:

```typescript
const controller = new AgentController({
  toolCategoryResolver: toolName => {
    if (toolName === 'delete_project') return 'execute'
    return null
  },
})
```

Configure category policies with [`session.permissions.setForCategory()`](https://mastra.ai/reference/agent-controller/session) and tool policies with [`session.permissions.setForTool()`](https://mastra.ai/reference/agent-controller/session):

```typescript
await session.permissions.setForCategory({
  category: 'execute',
  policy: 'ask',
})

await session.permissions.setForTool({
  toolName: 'delete_project',
  policy: 'deny',
})
```

When a policy resolves to `ask`, subscribe for the approval event and return the user's decision with [`session.respondToToolApproval()`](https://mastra.ai/reference/agent-controller/session):

```typescript
session.subscribe(event => {
  if (event.type === 'tool_approval_required') {
    session.respondToToolApproval({
      toolCallId: event.toolCallId,
      decision: 'approve',
    })
  }
})
```

The `always_allow_category` decision grants the tool category for the gate's thread. Grants aren't durable process-level permissions.

Interactive tools such as [`ask_user`](https://mastra.ai/reference/tools/ask-user-tool) and [`submit_plan`](https://mastra.ai/reference/tools/submit-plan-tool) use resumable tool suspensions instead. Resume them with [`session.respondToToolSuspension()`](https://mastra.ai/reference/agent-controller/session):

```typescript
session.subscribe(event => {
  if (event.type === 'tool_suspended' && event.toolName === 'ask_user') {
    void session.respondToToolSuspension({
      toolCallId: event.toolCallId,
      resumeData: 'Use SQLite.',
    })
  }
})
```

For `submit_plan`, resume with `{ action: 'approved' }` or `{ action: 'rejected', feedback }`. An approved plan can switch to the mode configured by `transitionsTo` before the run continues.

The built-in `submit_plan` tool takes a plan file path, not the plan text. The agent writes the plan to a file and submits its path. It needs a filesystem it can write to, such as a workspace filesystem. To show the plan for approval, your app reads the file at the submitted `path`.

### Delegate to subagents

Configure available subagent types on the controller. The built-in `subagent` tool can then delegate focused tasks using those definitions:

```typescript
const controller = new AgentController({
  tools: {
    searchDocs,
  },
  subagents: [
    {
      id: 'code-reviewer',
      name: 'Code reviewer',
      description: 'Review a change for correctness and regressions.',
      instructions: 'Inspect the change and report actionable findings.',
      allowedControllerTools: ['searchDocs'],
      allowedWorkspaceTools: ['view', 'find_files'],
      defaultModelId: 'openai/gpt-5-mini',
    },
  ],
})
```

A regular subagent starts with its configured instructions and constrained toolset. Set `forked: true` when the child should clone the parent thread and run with the parent agent's instructions and tools. Forked subagents preserve the parent prompt prefix, ignore the definition's instructions, tools, allowlists, and default model, and require memory on the controller.

Use [`session.subagents.model.set()`](https://mastra.ai/reference/agent-controller/session) to store one default subagent model or a model for a specific agent type. Read the selection with [`session.subagents.model.get()`](https://mastra.ai/reference/agent-controller/session):

```typescript
await session.subagents.model.set({
  modelId: 'openai/gpt-5-mini',
})

await session.subagents.model.set({
  agentType: 'code-reviewer',
  modelId: 'anthropic/claude-sonnet-4-6',
})

const reviewerModel = session.subagents.model.get({
  agentType: 'code-reviewer',
})
```

These selections are written to thread settings. An agent-type selection takes precedence over the Session's default subagent model.

### Connect chat channels

Pass channel adapters to the controller and register it on a [`Mastra`](https://mastra.ai/reference/core/mastra-class) instance:

```typescript
import { Mastra } from '@mastra/core'
import { AgentController } from '@mastra/core/agent-controller'
import { createSlackAdapter } from '@chat-adapter/slack'

const controller = new AgentController({
  id: 'support-controller',
  agent,
  storage,
  workspace,
  modes,
  channels: {
    adapters: {
      slack: createSlackAdapter(),
    },
    resolveResourceId: ({ thread, message, defaultResourceId }) => {
      if (thread.isDM) return message.author.userId
      return defaultResourceId
    },
    onSessionStart: async ({ session, thread }) => {
      const plan = await billing.planFor(thread.resourceId)
      await session.model.switch(plan.modelId)
    },
  },
})

export const mastra = new Mastra({
  agentControllers: { controller },
  storage,
})
```

Point each platform webhook at the controller-specific route:

```text
/api/agent-controllers/<CONTROLLER_ID>/channels/<PLATFORM>/webhook
```

Each external chat thread maps to one controller Session and Mastra thread. By default, new sessions use a resource ID derived from the adapter's chat-thread ID, prefixed with `channel:`. Use `resolveResourceId` to map direct messages to an existing application user or choose another memory owner. The callback only affects new threads. An existing thread keeps its stored resource ID.

Channel sessions are created by the controller rather than by your code, so `onSessionStart` is where you configure them. It runs once per session, after the session is bound to its mapped thread and before the first message is handled. A channel session starts with controller defaults, so this is where you set its model and memory settings. Later messages in the same thread reuse the session and don't call it again. Errors are logged and swallowed so a session that can't be configured still answers the message.

#### Authorize and route channel sessions

`onSessionStart` runs after the session exists and swallows errors, so it can't refuse a request. Use `resolveSession` when your host decides whether a session may exist. It replaces the built-in session creation and runs before any session exists. Throwing refuses the request before the controller creates a session or calls the model. Mastra logs the refusal and leaves the chat thread silent, so your authorization message never reaches the channel.

```typescript
channels: {
  adapters: { slack: createSlackAdapter() },
  resolveSession: async ({ controller, thread, requestContext }) => {
    const install = await installs.authorize(requestContext.get('teamId'))

    return controller.createSession({
      resourceId: thread.resourceId,
      threadId: thread.id,
      scope: install.id,
      ownerId: controller.id,
      requestContext,
    })
  },
}
```

Create the session under `thread.resourceId`. Because a session can bind only threads it owns, use `resolveResourceId` to assign a different owner to the mapped thread. Pass `threadId: thread.id` so the session opens on the mapped thread. Without it, a session that has tags or a `projectPath` doesn't treat the mapped thread as its own, so it creates an extra empty thread before switching to the mapped one. Sessions are get-or-create for each `resourceId` and `scope` combination. Pass `scope` when one thread needs separate sessions for each installation or principal.

Failures that aren't refusals (a storage outage, a bug in your resolver's dependencies) still post an error to the thread, so a broken bot doesn't look like a silent one. If you need to tell them apart in your own code, a refusal is a `ChannelSessionRejectedError` with the original error as its `cause`.

`resolveSession` also runs when a user answers an approval card, with that action's request context. A shared install revalidates the person approving rather than trusting the person who sent the original message.

#### Handle stale approvals

An approval gate lives in memory, so every approval answered after a restart is stale. Mastra never runs the tool for a stale action. Use `onStaleToolApproval` to settle the attempt the user answered, instead of dropping it:

```typescript
channels: {
  adapters: { slack: createSlackAdapter() },
  onStaleToolApproval: async ({ decision, toolCallId, runId, memory }) => {
    await runs.markInterrupted({ runId, toolCallId, decision, threadId: memory.thread })
  },
}
```

`runId` is the run the approval card was rendered for, which is the attempt the user answered and the one you settle against after a restart. The session's own run is passed separately as `currentRunId`, and is usually `null` or a different run by then.

Controller channel sessions and auto-approval state are held in memory, so use a long-lived server. Pending approvals and live Session state don't survive process restarts. Adapters that can't render approval controls automatically run tools without an approval prompt so the run doesn't remain suspended.

See [Channels](https://mastra.ai/docs/channels) for adapter setup and platform-specific webhook configuration.

### Connect a UI

How you connect depends on where the UI runs. A terminal UI or a server that owns the controller holds the `Session` object and subscribes to it directly. A browser UI runs in a different process, so it reaches the same session over the controller's HTTP routes with [`@mastra/client-js`](https://mastra.ai/reference/client-js/mastra-client).

#### Server-side sessions

Subscribe to Session events for incremental updates. Read the reduced display state with [`session.displayState.get()`](https://mastra.ai/reference/agent-controller/session) when the UI needs a complete render snapshot:

```typescript
const unsubscribe = session.subscribe(event => {
  if (event.type === 'display_state_changed') {
    render(event.displayState)
  }
})

render(session.displayState.get())

// Call when the UI disconnects.
unsubscribe()
```

Subscriptions are isolated by Session. Events from another Session on the same controller aren't delivered to this listener. Read the [Building a coding agent](https://mastra.ai/blog/building-a-coding-agent) guide for a complete TUI example.

#### Client-side sessions

[`client.getAgentController(key).session(resourceId, scope?)`](https://mastra.ai/reference/client-js/agent-controller) returns a session client bound to one resource. Pass the key the controller is registered under in `new Mastra({ agentControllers })`, which can differ from the controller's `id`. Sessions are get-or-create on the server, so `create()` resumes an existing conversation instead of forking it. Pass `scope` when one resource needs independent sessions, such as one per git worktree:

```typescript
import { MastraClient } from '@mastra/client-js'

const client = new MastraClient({ baseUrl: 'http://localhost:4111' })
const session = client.getAgentController('coding-controller').session('user-123')

await session.create()

const subscription = await session.subscribe({
  onEvent: event => handleEvent(event),
  onError: error => showDisconnected(error),
  onReconnect: () => {
    void session.state().then(resync).catch(showDisconnected)
  },
  reconnect: true,
})

// Call when the UI disconnects.
subscription.unsubscribe()
```

`subscribe()` takes an options object and is async, unlike the in-process listener. Its promise resolves once the stream is established and rejects when it can't connect. A rejected call leaves nothing running in the background. `reconnect: true` re-establishes a stream that drops after it was established, with exponential backoff.

The server doesn't replay events missed while the stream was down, so read `session.state()` from `onReconnect` for the current mode, model, and thread. The client surface has no `session.displayState.get()`.

Send work with `session.sendMessage(content)`, or `session.sendMessage({ content, files })` to attach base64-encoded files. The reply arrives as `message_*` events on the subscription, not as the return value of the call. Answer a `tool_approval_required` event with `session.approveTool(toolCallId, approved)`, and a `tool_suspended` event with `session.respondToToolSuspension(toolCallId, resumeData)`.

`onEvent` receives every event the session emits. See the [Agent Controller API](https://mastra.ai/reference/client-js/agent-controller) reference for the event types and how to narrow them.

### Related

- [Agents](https://mastra.ai/docs/agents/overview)
- [Workspace](https://mastra.ai/docs/sandbox/overview)
- [Observational memory](https://mastra.ai/docs/memory/observational-memory)
- [Channels](https://mastra.ai/docs/channels)
- [Mastra Code](https://code.mastra.ai)
- [Mastra Factory](https://factory.mastra.ai)
