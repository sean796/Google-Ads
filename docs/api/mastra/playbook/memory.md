---
title: "Mastra Playbook: Memory & Context Recall"
slug: mastra/playbook/memory
section: Mastra
order: 80
related:
  - mastra/overview
  - mastra/playbook-index
  - mastra/workflows-and-steps
  - mastra/agents-and-models
---

<!-- manual -->

Scraped canonical Mastra documentation for **Mastra Playbook: Memory & Context Recall** (7 upstream pages consolidated for NEO Pulse coding agents).

## Included Pages

- **Memory** (`docs/memory/overview` - source: `https://mastra.ai/docs/memory/overview.md`)
- **Message History** (`docs/memory/message-history` - source: `https://mastra.ai/docs/memory/message-history.md`)
- **Observational Memory** (`docs/memory/observational-memory` - source: `https://mastra.ai/docs/memory/observational-memory.md`)
- **Working Memory** (`docs/memory/working-memory` - source: `https://mastra.ai/docs/memory/working-memory.md`)
- **Semantic Recall** (`docs/memory/semantic-recall` - source: `https://mastra.ai/docs/memory/semantic-recall.md`)
- **Memory Processors** (`docs/memory/memory-processors` - source: `https://mastra.ai/docs/memory/memory-processors.md`)
- **Multi-User Threads** (`docs/memory/multi-user-threads` - source: `https://mastra.ai/docs/memory/multi-user-threads.md`)

---

## Source: Memory (`docs/memory/overview`)

Canonical URL: `https://mastra.ai/docs/memory/overview.md`

## Memory

Memory gives your agent access to earlier messages and tool results. The agent can use this context to answer follow-up questions and recall information from previous interactions.

Mastra agents can be configured to store [message history](https://mastra.ai/docs/memory/message-history). Additionally, you can enable:

- [Observational Memory](https://mastra.ai/docs/memory/observational-memory) (Recommended): Uses background agents to maintain a dense observation log that replaces raw message history as it grows. This keeps the context window small while preserving long-term memory.
- [Working memory](https://mastra.ai/docs/memory/working-memory): Stores persistent, structured user data such as names, preferences, and goals.
- [Semantic recall](https://mastra.ai/docs/memory/semantic-recall): Retrieves relevant past messages based on semantic meaning rather than exact keywords.
- [Multi-user threads](https://mastra.ai/docs/memory/multi-user-threads): Share one thread between multiple users.

If the combined memory exceeds the model's context limit, [memory processors](https://mastra.ai/docs/memory/memory-processors) can filter, trim, or prioritize content so the most relevant information is preserved.

Memory results will be stored in one or more of your configured [storage providers](https://mastra.ai/docs/storage).

> **📹 Watch:** Watch [Mastra memory concepts](https://www.youtube.com/watch?v=18iIHQtIPmc) for a conceptual overview of the memory layers agents can use.

### When to use memory

Use memory when your agent needs to maintain multi-turn conversations that reference prior exchanges or recall user preferences or facts from earlier in a session, or alternatively build context over time within a conversation thread. Skip memory for single-turn requests where each interaction is independent.

### Quickstart

1. Install the `@mastra/memory` package.

   **npm**:

   ```bash
   npm install @mastra/memory@latest
   ```

   **pnpm**:

   ```bash
   pnpm add @mastra/memory@latest
   ```

   **Yarn**:

   ```bash
   yarn add @mastra/memory@latest
   ```

   **Bun**:

   ```bash
   bun add @mastra/memory@latest
   ```

2. Memory **requires** a storage provider to persist message history, including user messages and agent responses.

   For the purposes of this quickstart, use `@mastra/libsql`.

   **npm**:

   ```bash
   npm install @mastra/libsql@latest
   ```

   **pnpm**:

   ```bash
   pnpm add @mastra/libsql@latest
   ```

   **Yarn**:

   ```bash
   yarn add @mastra/libsql@latest
   ```

   **Bun**:

   ```bash
   bun add @mastra/libsql@latest
   ```

   For more details on available providers and how storage works in Mastra, visit the [storage](https://mastra.ai/docs/storage) documentation.

3. Add the storage provider to your main Mastra instance to enable memory across all configured agents.

   **For AI agents:** Important: Add `id` to `LibSQLStore`.

   ```typescript
   import { Mastra } from '@mastra/core'
   import { LibSQLStore } from '@mastra/libsql'

   export const mastra = new Mastra({
     storage: new LibSQLStore({
       id: 'mastra-storage',
       url: ':memory:',
     }),
   })
   ```

4. Create a `Memory` instance and pass it to the agent's `memory` option.

   ```typescript
   import { Agent } from '@mastra/core/agent'
   import { Memory } from '@mastra/memory'

   export const memoryAgent = new Agent({
     id: 'memory-agent',
     name: 'Memory Agent',
     memory: new Memory({
       options: {
         lastMessages: 20,
       },
     }),
   })
   ```

   Visit [Memory Class](https://mastra.ai/reference/memory/memory-class) for a full list of configuration options.

5. Call your agent, for example in [Studio](https://mastra.ai/docs/studio/overview). Inside Studio, start a new chat with your agent and take a look at the right sidebar. It'll now display memory details.

### Message history

Pass a `memory` object with `resource` and `thread` to track message history.

- `resource`: A stable identifier for the user or entity.
- `thread`: An ID that isolates a specific conversation or session.

```typescript
const response = await memoryAgent.generate('Remember my favorite color is blue.', {
  memory: {
    resource: 'user-123',
    thread: 'conversation-123',
  },
})
```

To recall information stored in memory, call the agent with the same `resource` and `thread` values used in the original conversation.

```typescript
const response = await memoryAgent.generate("What's my favorite color?", {
  memory: {
    resource: 'user-123',
    thread: 'conversation-123',
  },
})

// Response: "Your favorite color is blue."
```

> **Warning:** Each thread has an owner (`resourceId`) that can't be changed after creation. Avoid reusing the same thread ID for threads with different owners, as this will cause errors when querying.

To list all threads for a resource, or retrieve a specific thread, [use the memory API directly](https://mastra.ai/docs/memory/message-history).

#### Identify memory with scopes

Instead of a `memory` object, you can pass `scopes`: the addresses a run acts as, written as `<type>:<value>`. Memory reads the resource from a `resource:` scope and the thread from a `thread:` scope. Other scopes, such as `org:acme`, are passed to tools and processors.

```typescript
const response = await memoryAgent.generate('Remember my favorite color is blue.', {
  scopes: ['org:acme', 'resource:user-123', 'thread:conversation-123'],
})
```

Scopes can also come from the agent and from the request context. Mastra combines all three sources:

```typescript
export const memoryAgent = new Agent({
  id: 'memory-agent',
  name: 'Memory Agent',
  scopes: ({ requestContext }) => {
    // Set by your auth middleware. Request bodies can fill unreserved keys.
    const orgId = requestContext.get('org-id')
    return orgId ? [`org:${orgId}`] : []
  },
  memory: new Memory(),
})
```

The resolver's inputs must come from the server, not the client: a request body can set any request context key that isn't reserved. Trusted server middleware can also set scopes directly with the `MASTRA_SCOPES_KEY` request context key. Visit [Request Context](https://mastra.ai/docs/server/request-context) for details. Clients can't send scopes in a request body.

You can mix scopes with `memory.resource`, `memory.thread`, or the resource and thread request context keys, as long as they agree. If a `resource:` or `thread:` scope names a different value than another source, the call throws an error.

Tools, processors, and subagents receive the run's other scopes, but not its `resource:` and `thread:` scopes. Each nested agent call picks its own resource and thread.

### Observational Memory

Long conversations can fill the context window with raw message history and reduce agent performance. [Observational Memory](https://mastra.ai/docs/memory/observational-memory) uses background agents to compress older messages into observations. This reduces the context used by message history while retaining information for later turns.

**For AI agents:** Using Observational Memory requires a storage provider! You either need to set it on the Mastra instance at `src/mastra/index.ts` or pass it to the Agent constructor.

```typescript
import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'

export const memoryAgent = new Agent({
  id: 'memory-agent',
  name: 'Memory Agent',
  memory: new Memory({
    options: {
      observationalMemory: true,
    },
  }),
})
```

See [Observational Memory](https://mastra.ai/docs/memory/observational-memory) for details on how observations and reflections work, and [the reference](https://mastra.ai/reference/memory/observational-memory) for all configuration options.

### What the model sees

Memory adds context to the system messages or conversation messages sent to the model. Message history is enabled by default. Other memory features contribute context only when configured. The diagram shows where each feature adds its context, and the list below explains what it contributes:

![Diagram showing how Mastra assembles the model context: system messages containing agent instructions, call-time system messages, working memory, cross-thread semantic recall, and Observational Memory, followed by conversation messages where message history and same-thread semantic recall interleave by timestamp, then call-time context messages, and finally the new user message](/img/memory/memory-context-window-light.svg)

- [Working memory](https://mastra.ai/docs/memory/working-memory) is injected as a system message containing the template and the stored data. With `useStateSignals`, it's delivered as a state signal instead.
- [Semantic recall](https://mastra.ai/docs/memory/semantic-recall) matches from the current thread are inserted as regular messages and interleave with message history by timestamp. Matches from other threads are formatted into a system message instead.
- [Message history](https://mastra.ai/docs/memory/message-history) adds the last N messages in chronological order. Your new message always comes last.
- [Observational Memory](https://mastra.ai/docs/memory/observational-memory) replaces old raw history: reflections and observations live in a system message, and only messages that haven't been observed yet remain in the conversation. A short continuation reminder is placed at the start of the conversation messages.
- Context messages are the optional `context` array passed on a call, for example `agent.generate(msg, { context: [...] })`. Use them for one-off background such as app state or your own RAG results. They appear as regular conversation messages for that request only and are never saved to memory.

Conversation messages are ordered by timestamp and deduplicated by message ID, so recalled older messages appear before recent history. Context messages passed at call time are stamped with the current time, which places them after history and recall but before your new message. To inspect the exact context for a real request, use [Tracing](https://mastra.ai/docs/observability/tracing/overview) and open the LLM call spans, see [Observability](#observability) below.

### Memory in multi-agent systems

When a [supervisor agent](https://mastra.ai/docs/subagents) delegates to a subagent, Mastra isolates subagent memory automatically. No flag enables this as it happens on every delegation. Understanding how this scoping works lets you decide what stays private and what to share intentionally.

#### How delegation scopes memory

Each delegation creates a fresh `threadId` and a deterministic `resourceId` for the subagent:

- **Thread ID**: Unique per delegation. The subagent starts with a clean message history every time it's called.
- **Resource ID**: Derived as `{parentResourceId}-{agentName}`. Because the resource ID is stable across delegations, resource-scoped memory persists between calls. A subagent remembers facts from previous delegations by the same user.
- **Memory instance**: A subagent without its own memory inherits the supervisor's `Memory` instance and all configured options. If the subagent defines its own, that takes precedence.

> **Note:** Title generation (`generateTitle`) is a top-level thread concern and **isn't** applied to inherited subagent threads. Because each delegation creates an ephemeral thread that no one sees, running title generation for it would waste an LLM call per delegation. To generate titles for a subagent's own threads, give that subagent its own memory configuration.

The supervisor forwards its conversation context to the subagent so it has enough background to complete the task. Only the delegation prompt and the subagent's response are saved. The full parent conversation isn't stored. You can control which messages reach the subagent with the [`messageFilter`](https://mastra.ai/docs/subagents) callback.

> **Note:** Subagent resource IDs are always suffixed with the agent name (`{parentResourceId}-{agentName}`). Different subagents under the same supervisor never share a resource ID through delegation.

To go beyond this default isolation, you can share memory between agents by passing matching identifiers when you call them directly.

#### Share memory between agents

When you call agents directly (outside the delegation flow), memory sharing is controlled by two identifiers: `resourceId` and `threadId`. Agents that use the same values read and write to the same data. This is useful when agents collaborate on a shared context, for example, a researcher that saves notes and a writer that reads them.

**Resource-scoped sharing** is the most common pattern. [Working memory](https://mastra.ai/docs/memory/working-memory) and [semantic recall](https://mastra.ai/docs/memory/semantic-recall) default to `scope: 'resource'`. If two agents share a `resourceId`, they share working memory and embeddings, even across different threads:

```typescript
// Both agents share the same resource-scoped memory
await researcher.generate('Find information about quantum computing.', {
  memory: { resource: 'project-42', thread: 'research-session' },
})

await writer.generate('Write a summary from the research notes.', {
  memory: { resource: 'project-42', thread: 'writing-session' },
})
```

Because both calls use `resource: 'project-42'`, the writer can access the researcher's working memory. Semantic embeddings are also shared through the resource. Each agent still has its own thread, so message histories stay separate.

**Thread-scoped sharing** gives tighter coupling. [Observational Memory](https://mastra.ai/docs/memory/observational-memory) uses `scope: 'thread'` by default. If two agents use the same `resource` and `thread`, they share the full message history. Each agent sees every message the other has written. This is useful when agents need to build on each other's exact outputs.

### Observability

Enable [Tracing](https://mastra.ai/docs/observability/tracing/overview) to monitor and debug memory in action. Traces show you exactly which messages and observations the agent included in its context for each request, helping you understand agent behavior and verify that memory retrieval is working as expected.

Open [Studio](https://mastra.ai/docs/studio/overview) and select the **Observability** tab in the sidebar. Open the trace of a recent agent request and look for its LLM call spans.

### Switch memory per request

Use [`RequestContext`](https://mastra.ai/docs/server/request-context) to access request-specific values. This lets you conditionally select different memory or storage configurations based on the context of the request.

```typescript
export type UserTier = {
  'user-tier': 'enterprise' | 'pro'
}

const premiumMemory = new Memory()
const standardMemory = new Memory()

export const memoryAgent = new Agent({
  id: 'memory-agent',
  name: 'Memory Agent',
  memory: ({ requestContext }) => {
    const userTier = requestContext.get('user-tier') as UserTier['user-tier']

    return userTier === 'enterprise' ? premiumMemory : standardMemory
  },
})
```

Visit [Request Context](https://mastra.ai/docs/server/request-context) for more information.

### Related

- [`Memory` reference](https://mastra.ai/reference/memory/memory-class)
- [Tracing](https://mastra.ai/docs/observability/tracing/overview)
- [Request Context](https://mastra.ai/docs/server/request-context)
- [Mastra Code](https://code.mastra.ai/): A coding agent using Mastra's memory system

---

## Source: Message History (`docs/memory/message-history`)

Canonical URL: `https://mastra.ai/docs/memory/message-history.md`

## Message history

Message history is the most basic and important form of memory. It gives the LLM a view of recent messages in the context window, enabling your agent to reference earlier exchanges and respond coherently.

You can also retrieve message history to display past conversations in your UI.

> **Note:** Each message belongs to a thread (the conversation) and a resource (the user or entity it's associated with). See [Threads and resources](#threads-and-resources) for more detail.

### Threads and resources

Mastra organizes conversations using two identifiers:

- **Thread**: A conversation session containing a sequence of messages.
- **Resource**: The entity that owns the thread, such as a user, organization, project, or another domain entity in your application.

Studio automatically generates a thread and resource ID for you. When calling `stream()` or `generate()` yourself, provide these identifiers explicitly.

### Getting started

Install the Mastra memory module along with a [storage adapter](https://mastra.ai/docs/storage) for your database. The examples below use `@mastra/libsql`, which stores data locally in a `mastra.db` file.

**npm**:

```bash
npm install @mastra/memory@latest @mastra/libsql@latest
```

**pnpm**:

```bash
pnpm add @mastra/memory@latest @mastra/libsql@latest
```

**Yarn**:

```bash
yarn add @mastra/memory@latest @mastra/libsql@latest
```

**Bun**:

```bash
bun add @mastra/memory@latest @mastra/libsql@latest
```

Message history requires a storage adapter to persist conversations. Configure storage on your Mastra instance if you haven't already:

```typescript
import { Mastra } from '@mastra/core'
import { LibSQLStore } from '@mastra/libsql'

export const mastra = new Mastra({
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: 'file:./mastra.db',
  }),
})
```

Instantiate a [`Memory`](https://mastra.ai/reference/memory/memory-class) instance in your agent:

```typescript
import { Memory } from '@mastra/memory'
import { Agent } from '@mastra/core/agent'

export const agent = new Agent({
  id: 'test-agent',
  memory: new Memory({
    options: {
      lastMessages: 10,
    },
  }),
})
```

When you call the agent, messages are automatically saved to the database. You can specify a `threadId`, `resourceId`, and optional `metadata`:

**.generate()**:

```typescript
await agent.generate('Hello', {
  memory: {
    thread: {
      id: 'thread-123',
      title: 'Support conversation',
      metadata: { category: 'billing' },
    },
    resource: 'user-456',
  },
})
```

**.stream()**:

```typescript
await agent.stream('Hello', {
  memory: {
    thread: {
      id: 'thread-123',
      title: 'Support conversation',
      metadata: { category: 'billing' },
    },
    resource: 'user-456',
  },
})
```

> **Note:** Threads and messages are created automatically when you call `agent.generate()` or `agent.stream()`, but you can also create them manually with [`createThread()`](https://mastra.ai/reference/memory/createThread) and [`saveMessages()`](https://mastra.ai/reference/memory/memory-class).

You can use this history in two ways:

- **Automatic inclusion**: Mastra automatically includes recent messages in the context window. The default of 10 messages keeps agents grounded in the conversation. Adjust it with `lastMessages` when needed.
- [**Manual querying**](#querying): For more control, query threads and messages directly with `recall()`. Use the results to choose which memories enter the context window or to render conversation history in your UI.

> **Note:** `lastMessages` counts every stored message, including tool calls, tool results, and [signals](https://mastra.ai/docs/harness/signals) of any kind, so a single turn can add several messages to the count. The window also slides forward on every request: once a thread grows past the limit, the oldest message leaves context on each turn, which changes the start of the prompt and invalidates the provider prompt cache. For long-running conversations, use [Observational Memory](https://mastra.ai/docs/memory/observational-memory), which keeps the prompt prefix stable.

#### Sending messages from a client

When you use memory with a client application, send **only the new message** instead of the full conversation history. Mastra loads previous messages from storage.

For an AI SDK example, see [Using Mastra Memory](https://mastra.ai/integrations/agentic-ui/ai-sdk-ui).

<details>
**Passing a full input history**

Mastra filters client-echoed history before loading stored messages. When message IDs match, it uses the stored copy as the base, preserving stored timestamps and provider metadata while retaining new tool results.

If you assemble the request input yourself and need it processed exactly as sent, set `retainFullInput: true` on `memory.options` for that call, or in the memory constructor options to apply it agent-wide. This disables input filtering, but stored history still loads. Every input message that isn't already stored is saved to the thread, including few-shot examples.

</details>

#### Limit history by tokens

Message count is a poor proxy for context size: a tool result can be a few tokens or thousands. Use `messageHistory` to keep recent history within a token budget instead:

```typescript
export const agent = new Agent({
  id: 'test-agent',
  memory: new Memory({
    options: {
      messageHistory: { maxTokens: 8_000, atMaxRemoveTokens: 2_000 },
    },
  }),
})
```

Mastra counts the complete prompt against `maxTokens`, including remembered history, system instructions, context, and the current turn. When the prompt exceeds the budget, Mastra removes the oldest remembered messages until the prompt is at most `maxTokens - atMaxRemoveTokens`. `atMaxRemoveTokens` defaults to 25% of `maxTokens`. Removing history in chunks keeps the prompt prefix stable across several turns, which helps provider prompt caches stay warm.

System messages, context, the current turn's input, and the agent's responses are never trimmed. Linked tool calls and results are removed together. If protected content alone exceeds `maxTokens`, Mastra removes all remembered history but keeps the protected content.

Trimmed messages stay in storage. During agent runs, Mastra persists a per-thread boundary so they're excluded from later turns. Setting `messageHistory` without `lastMessages` disables the default 10-message cap. Set both to combine a count cap with a token budget. Set `maxTokens` to `0` to disable message history.

> **Tip:** When memory is enabled, [Studio](https://mastra.ai/docs/studio/overview) uses message history to display past conversations in the chat sidebar.

### Thread title generation

Mastra can automatically generate descriptive thread titles from the conversation transcript when `generateTitle` is enabled. Use this option when you build a chat interface that renders conversation titles in a thread list or sidebar.

```typescript
import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'

export const supportAgent = new Agent({
  id: 'support-agent',
  name: 'Support agent',
  instructions: 'Answer customer support questions.',
  model: 'openai/gpt-5.6-sol',
  memory: new Memory({
    options: {
      generateTitle: true,
    },
  }),
})
```

Title generation runs asynchronously after the agent responds and doesn't affect response time.

#### Streaming the generated title

By default title generation runs in the background and the run's stream doesn't wait for it, so HTTP clients only see the title on their next thread fetch. Set `emitEvent: true` to deliver the title on the run's stream instead: the stream waits for the title and emits a transient `data-thread-title` chunk before `finish`.

```typescript
import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'

export const supportAgent = new Agent({
  id: 'support-agent',
  name: 'Support agent',
  instructions: 'Answer customer support questions.',
  model: 'openai/gpt-5.6-sol',
  memory: new Memory({
    options: {
      generateTitle: {
        emitEvent: true,
      },
    },
  }),
})
```

Stream consumers receive the chunk with the persisted title, so a chat UI can rename its thread list entry without polling:

```typescript
for await (const chunk of stream.fullStream) {
  if (chunk.type === 'data-thread-title') {
    renameThreadInSidebar(chunk.data.threadId, chunk.data.title)
  }
}
```

The chunk is transient: it's delivered to stream consumers but never persisted as part of the conversation's messages. Because the stream waits for the title, `emitEvent` delays the stream's `finish` on the turn that generates the title: the first turn of a thread, or a later turn when `minMessages` sets a higher threshold. Leave it off to keep title generation fully non-blocking.

> **Note:** `emitEvent` applies to `stream()` runs. `generate()` returns JSON and can't carry the chunk, so it keeps non-blocking title generation. [Durable and evented agents](https://mastra.ai/docs/harness/durable-agents) don't emit this chunk yet. In all of these cases the title is still generated and persisted.

To optimize cost or behavior, provide a smaller [`model`](https://mastra.ai/models) and custom `instructions`:

```typescript
import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'

export const supportAgent = new Agent({
  id: 'support-agent',
  name: 'Support agent',
  instructions: 'Answer customer support questions.',
  model: 'openai/gpt-5.6-sol',
  memory: new Memory({
    options: {
      generateTitle: {
        model: 'openai/gpt-5-mini',
        instructions: 'Generate a one-word title.',
      },
    },
  }),
})
```

### Accessing memory

To access memory functions for querying, cloning, or deleting threads and messages, call `getMemory()` on an agent:

```typescript
const agent = mastra.getAgentById('test-agent')
const memory = await agent.getMemory()
```

Use the `Memory` instance to query stored threads and messages or clone a conversation.

### Querying

Use these methods to fetch threads and messages for displaying conversation history in your UI or for custom memory retrieval logic.

> **Warning:** The memory system doesn't enforce access control. Before running any query, verify in your application logic that the current user is authorized to access the `resourceId` being queried.

#### Threads

Use [`listThreads()`](https://mastra.ai/reference/memory/listThreads) to retrieve threads for a resource:

```typescript
const result = await memory.listThreads({
  filter: { resourceId: 'user-123' },
  perPage: false,
})
```

Paginate through threads:

```typescript
const result = await memory.listThreads({
  filter: { resourceId: 'user-123' },
  page: 0,
  perPage: 10,
})

console.log(result.threads) // thread objects
console.log(result.hasMore) // more pages available?
```

You can also filter by metadata and control sort order:

```typescript
const result = await memory.listThreads({
  filter: {
    resourceId: 'user-123',
    metadata: { status: 'active' },
  },
  orderBy: { field: 'createdAt', direction: 'DESC' },
})
```

To fetch a single thread by ID, use [`getThreadById()`](https://mastra.ai/reference/memory/getThreadById):

```typescript
const thread = await memory.getThreadById({ threadId: 'thread-123' })
```

#### Messages

Once you have a thread, use [`recall()`](https://mastra.ai/reference/memory/recall) to retrieve its messages. It supports pagination and [semantic search](https://mastra.ai/docs/memory/semantic-recall), with optional date filtering.

Fetch a thread's history without pagination. Recall hides reminder signals by default; pass `hideSignals: false` to include them, `true` to hide all recognized signals, or an array to omit selected types. See [signal visibility and compatibility](https://mastra.ai/reference/memory/recall) for matching rules and precedence.

```typescript
const { messages } = await memory.recall({
  threadId: 'thread-123',
  perPage: false,
})
```

Paginate through messages:

```typescript
const { messages } = await memory.recall({
  threadId: 'thread-123',
  page: 0,
  perPage: 50,
})
```

Filter by date range:

```typescript
const { messages } = await memory.recall({
  threadId: 'thread-123',
  filter: {
    dateRange: {
      start: new Date('2025-01-01'),
      end: new Date('2025-06-01'),
    },
  },
})
```

Filter by shallow message metadata:

```typescript
const { messages } = await memory.recall({
  threadId: 'thread-123',
  filter: {
    metadata: {
      category: 'billing',
      escalated: true,
      priority: 2,
      archivedAt: null,
    },
  },
})
```

Metadata filters match shallow scalar values only: `string`, finite `number`, `boolean`, and `null`.

All specified metadata keys use AND semantics. A `null` filter matches only an explicit `null` value. A missing metadata key doesn't match.

Metadata keys must start with a letter or underscore and contain only alphanumeric characters. They must be 128 characters or fewer and can't use reserved prototype keys such as `__proto__`, `constructor`, or `prototype`.

Performance depends on the storage backend. Some backends can push parts of the filter into the database, while others scan candidate messages after thread, resource, and date constraints are applied but before pagination.

Fetch a single message by ID:

```typescript
const { messages } = await memory.recall({
  threadId: 'thread-123',
  include: [{ id: 'msg-123' }],
})
```

Fetch multiple messages by ID with surrounding context:

```typescript
const { messages } = await memory.recall({
  threadId: 'thread-123',
  include: [
    { id: 'msg-123' },
    {
      id: 'msg-456',
      withPreviousMessages: 3,
      withNextMessages: 1,
    },
  ],
})
```

Search by meaning (see [Semantic recall](https://mastra.ai/docs/memory/semantic-recall) for setup):

```typescript
const { messages } = await memory.recall({
  threadId: 'thread-123',
  vectorSearchString: 'project deadline discussion',
  threadConfig: {
    semanticRecall: true,
  },
})
```

#### UI format

Message queries return `MastraDBMessage[]` format. To display messages in a frontend, you may need to convert them to a format your UI library expects. For example, [`toAISdkV5Messages`](https://mastra.ai/reference/ai-sdk/to-ai-sdk-v5-messages) converts messages to AI SDK UI format.

### Thread cloning

Thread cloning creates a copy of an existing thread with its messages. This is useful for branching conversations or creating checkpoints before a potentially destructive operation, or alternatively testing variations of a conversation.

```typescript
const { thread, clonedMessages } = await memory.cloneThread({
  sourceThreadId: 'thread-123',
  title: 'Branched conversation',
})
```

You can filter cloned messages by count or date range and specify custom thread IDs. Utility methods are also available to inspect clone relationships.

If you don't need the copied messages returned, for example when forking a long thread, use `copyThread()`. It never returns message payloads, and on LibSQL and PostgreSQL the rows are copied inside the database. When semantic recall is enabled, the copied messages are still read back in batches to generate embeddings.

See [`cloneThread()`](https://mastra.ai/reference/memory/cloneThread), [`copyThread()`](https://mastra.ai/reference/memory/copyThread), and [clone utilities](https://mastra.ai/reference/memory/clone-utilities) for the full API.

### Deleting messages

To remove messages from a thread, use [`deleteMessages()`](https://mastra.ai/reference/memory/deleteMessages). You can delete by message ID or clear all messages from a thread.

---

## Source: Observational Memory (`docs/memory/observational-memory`)

Canonical URL: `https://mastra.ai/docs/memory/observational-memory.md`

## Observational Memory

**Added in:** `@mastra/memory@1.1.0`

Observational Memory (OM) is Mastra's memory system for long-context agentic memory. Background agents, an **Observer** and a **Reflector**, watch your agent's conversations and maintain a dense observation log that replaces raw message history as it grows.

### Quickstart

Ensure you have `@mastra/memory` installed in your project. Set `observationalMemory: true` in your Memory config to enable Observational Memory.

```typescript
import { Memory } from '@mastra/memory'
import { Agent } from '@mastra/core/agent'

export const agent = new Agent({
  id: 'my-agent',
  name: 'my-agent',
  instructions: 'You are a helpful assistant.',
  model: 'openai/gpt-5-mini',
  memory: new Memory({
    options: {
      observationalMemory: true,
    },
  }),
})
```

**For AI agents:** Using Observational Memory requires a storage provider! You either need to set it on the Mastra instance at `src/mastra/index.ts` or pass it to the Agent constructor.

The following script creates a local LibSQL database and enables Observational Memory before using one resource and thread across two agent calls:

```typescript
import { Agent } from '@mastra/core/agent'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'

const memory = new Memory({
  storage: new LibSQLStore({
    id: 'memory-storage',
    url: 'file:./memory.db',
  }),
  options: {
    observationalMemory: {
      model: 'openai/gpt-5-mini',
    },
  },
})

const agent = new Agent({
  id: 'memory-agent',
  name: 'Memory Agent',
  instructions: 'You are a helpful assistant.',
  model: 'openai/gpt-5-mini',
  memory,
})

const memoryOptions = {
  resource: 'user-123',
  thread: 'conversation-123',
}

const firstResponse = await agent.generate('Remember that my favorite color is blue.', {
  memory: memoryOptions,
})
console.log(firstResponse.text)

const secondResponse = await agent.generate('What is my favorite color?', {
  memory: memoryOptions,
})
console.log(secondResponse.text)
```

The `resource` identifies the user or entity, while the `thread` identifies the conversation. Reuse both values to continue the same conversation. Observational Memory processes the stored history as it grows and replaces older messages with observations when its activation conditions are met.

The agent now has humanlike long-term memory that persists across conversations. Setting `observationalMemory: true` uses automatic model selection. To use a specific model, pass it in the config object:

```typescript
const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'deepseek/deepseek-reasoner',
    },
  },
})
```

See [configuration options](https://mastra.ai/reference/memory/observational-memory) for full API details.

> **Warning:** When you use OM with a client application, send **only the new message** from the client instead of the full conversation history.
>
> Observational memory still relies on stored conversation history. Sending the full history is redundant and can cause message ordering bugs when client-side timestamps conflict with stored timestamps. Mastra filters client-echoed history before loading stored messages and uses the stored copy as the base when message IDs match, preserving stored timestamps and provider metadata while retaining new tool results.
>
> If you assemble the request input yourself and need it processed exactly as sent, set `retainFullInput: true` on `memory.options` for that call, or in the memory constructor options to apply it agent-wide. This disables that filtering. History still loads underneath. Every input message that isn't already stored is saved to the thread, including few-shot examples.
>
> For an AI SDK example, see [Using Mastra Memory](https://mastra.ai/integrations/agentic-ui/ai-sdk-ui).

> **Note:** OM currently only supports `@mastra/pg`, `@mastra/libsql`, `@mastra/mysql`, `@mastra/mongodb`, `@mastra/convex`, and `@mastra/oracledb` storage adapters. It uses background agents for managing memory. When no model is set, the default is `model: 'auto'`.

#### Automatic models in Mastra Code and Factory

Mastra Code and Factory surface the same automatic selection as a per-role **Auto** option in their settings.

An automatic Observer or Reflector follows the active main model provider. Mastra Code uses that provider's built-in low-cost Observational Memory model when one is configured. For custom providers and providers without a built-in choice, it uses the active main model. The effective model is resolved when the role runs, so changing the main model doesn't rewrite the saved automatic selection.

Select an explicit model to pin one role independently. Reset that role to **Auto** to resume following the main model provider. Existing saved concrete model IDs remain explicit until you reset them.

Factory stores automatic intent separately from the effective model shown in settings. A missing provider credential can mark that effective model unavailable, but it doesn't replace the saved selection or prevent Factory from starting.

### Temporal gap markers

Temporal gap markers insert a short reminder before a new user message when enough time has passed since the previous message in the thread. They help the agent and the UI see that the conversation resumed after a useful pause.

Temporal gap markers are off by default. Enable them with `temporalMarkers: true` in the `observationalMemory` config:

```typescript
import { Memory } from '@mastra/memory'
import { Agent } from '@mastra/core/agent'

export const agent = new Agent({
  id: 'my-agent',
  name: 'my-agent',
  instructions: 'You are a helpful assistant.',
  model: 'openai/gpt-5-mini',
  memory: new Memory({
    options: {
      observationalMemory: {
        model: 'google/gemini-2.5-flash',
        temporalMarkers: true,
      },
    },
  }),
})
```

Mastra inserts a temporal gap marker when the gap is at least 10 minutes. The marker is stored in memory and also emitted as a transient reminder event, so clients can render it as a lightweight timeline hint.

The observer also sees these markers when it processes the thread. The observations it writes can anchor memories to when they happened (for example, "User asked about deployment after a 2-day gap").

See [the API reference](https://mastra.ai/reference/memory/observational-memory) for the full configuration shape.

### Early activation

OM can activate buffered observations before the token threshold is reached. This is useful when a prompt cache is likely to expire, or when the agent changes model providers.

Top-level early activation settings apply to observations by default:

```typescript
const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'google/gemini-2.5-flash',
      activateAfterIdle: 'auto',
      activateOnProviderChange: true,
    },
  },
})
```

Use nested `observation` and `reflection` settings for per-phase control. Reflection early activation is opt-in, so top-level settings affect only observations.

```typescript
const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'google/gemini-2.5-flash',
      activateAfterIdle: '5m',
      observation: {
        activateAfterIdle: false,
      },
      reflection: {
        activateAfterIdle: '10m',
        activateOnProviderChange: true,
      },
    },
  },
})
```

In this example, the top-level idle setting is disabled for observations, while reflections opt into idle and provider-change activation.

#### Buffer on idle

Set `observation.bufferOnIdle` to `true` to run background observation buffering when an agent turn ends and the agent becomes idle. This is useful for apps that want short turns to be observed without waiting for the next turn or the `messageTokens` threshold.

```typescript
const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'openai/gpt-5-mini',
      observation: {
        bufferOnIdle: true,
      },
    },
  },
})
```

`bufferOnIdle` is off by default. It's separate from `bufferTokens`: `bufferTokens` controls step-time async buffering, while `bufferOnIdle` controls end-of-turn buffering for idle turns.

#### Retries and failure policy

Observer and Reflector model calls are retried on transient provider errors, and a turn aborts if they still fail. Each stage is controlled independently by:

- `maxRetries`: retries after the initial model call (default `8`).
- `failurePolicy`: what happens once retries are exhausted, either `'abort'` (default) or `'continue'`.

```typescript
const memory = new Memory({
  options: {
    observationalMemory: {
      observation: {
        maxRetries: 8,
        failurePolicy: 'continue',
      },
      reflection: {
        maxRetries: 8,
        failurePolicy: 'continue',
      },
    },
  },
})
```

`maxRetries` governs OM's own retry ladder; the underlying model call is configured with no provider-level retries, so the option is the single retry knob for the stage.

With `failurePolicy: 'continue'`, Mastra retries as configured, reports the failure through the existing OM diagnostics, keeps the failed input pending for a later cycle, and lets the main agent turn continue. It doesn't advance observation boundaries or discard unobserved messages. A Reflector failure under `'continue'` leaves any already-persisted observations committed and defers reflection to the next threshold crossing.

A provider outage usually takes out both stages, so set the policy on both if you want the turn to survive one.

This policy applies only to Observer and Reflector model and provider failures in synchronous, resource-scoped, and buffered observation. Persistence, indexing, transform, locking, invariant, and explicit abort failures remain fatal. It doesn't prevent the underlying provider or network error, change `blockAfter`, or change attachment handling.

> **Warning:** `'continue'` has no backstop for a sustained outage. Unobserved messages stay pending and keep accruing in the main agent's context. A long outage moves the failure from the memory layer to the model's context limit.

See [the API reference](https://mastra.ai/reference/memory/observational-memory) for the full configuration shape.

### Benefits

- **Prompt caching**: OM's context is stable and observations append over time rather than being retrieved at runtime each turn. This keeps the prompt prefix cacheable, which reduces costs.
- **Compression**: Raw message history and tool results get compressed into a dense observation log. Smaller context means faster responses and longer coherent conversations.
- **Zero context rot**: The agent sees relevant information instead of noisy tool calls and irrelevant tokens, which keeps the agent on task over long sessions.

### How it works

You don't remember every word of every conversation you've ever had. You observe what happened subconsciously, then your brain reflects, reorganizing, combining, and condensing into long-term memory. OM works the same way.

Every time an agent responds, it sees a context window containing its system prompt, recent message history, and any injected context. The context window is finite. Even models with large token limits perform worse when the window is full. This causes two problems:

- **Context rot**: the more raw message history an agent carries, the worse it performs.
- **Context waste**: most of that history contains tokens no longer needed to keep the agent on task.

OM solves both problems by compressing old context into dense observations.

#### Observations

When message history tokens exceed a threshold (default: 30,000), the Observer creates observations which are concise notes about what happened:

OM uses fast local token estimation for this thresholding work. Text is estimated with `tokenx`, while image parts use provider-aware heuristics so multimodal conversations still trigger observation at the right time. The same applies to image-like `file` parts when a transport normalizes an uploaded image as a file instead of an image part. For example, OpenAI image detail settings can materially change when OM decides to observe.

The Observer can also see attachments in the history it reviews. For readability, OM keeps placeholders such as `[Image #1: reference-board.png]` or `[File #1: floorplan.pdf]` in the transcript while forwarding the actual attachments beside the text. When possible, image-like `file` parts become image inputs for the Observer. Other attachments remain file parts and use normalized token counting. This applies to both normal thread observation and batched resource-scope observation.

#### Extractors

Use extractors when you want OM to persist specific values alongside observations. Built-in values use the same extraction pipeline as custom values. They include **current task** and **suggested response**, along with **thread title**.

The following example extracts a compact user profile from observations:

```typescript
import { Agent } from '@mastra/core/agent'
import { Extractor, Memory } from '@mastra/memory'
import { z } from 'zod'

const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'openai/gpt-5-mini',
      observation: {
        extract: [
          new Extractor({
            name: 'User profile',
            instructions: 'Extract stable user profile facts that should be remembered.',
            schema: z.object({
              preferredName: z.string().optional(),
              timezone: z.string().optional(),
              tools: z.array(z.string()).optional(),
            }),
          }),
        ],
      },
    },
  },
})

export const agent = new Agent({
  id: 'assistant',
  name: 'assistant',
  instructions: 'You are a helpful assistant.',
  model: 'openai/gpt-5-mini',
  memory,
})
```

Adding a `schema` makes the extractor run as a follow-up structured output request. Schema-less extractors are inline string extractors emitted directly in the Observer or Reflector response.

```typescript
new Extractor({
  name: 'Mood',
  instructions: 'Extract the user mood as a short phrase.',
})
```

By default, OM shows the last extracted value to the extractor on later runs. Set `includePreviousExtraction: false` when the Observer shouldn't see the previous value.

```typescript
new Extractor({
  name: 'Latest blocker',
  instructions: 'Extract any blockers the agent is running into.',
  includePreviousExtraction: false,
})
```

Use runtime `instructions` or `schema` functions when an extractor needs runtime context, such as the active memory instance or request context:

```typescript
new Extractor({
  name: 'Workspace summary',
  instructions: ({ memory }) =>
    memory ? 'Extract workspace facts for this memory instance.' : 'Extract workspace facts.',
})
```

##### Read extracted values from a stream

Extractor results are emitted when OM completes an observation or reflection. Read both completion data parts from the stream:

```typescript
const stream = await agent.stream('Remember that I prefer dark mode.')

for await (const chunk of stream.fullStream) {
  if (chunk.type === 'data-om-observation-end' || chunk.type === 'data-om-buffering-end') {
    const { operationType, extractedValues = {}, extractionFailures = [] } = chunk.data

    for (const [slug, value] of Object.entries(extractedValues)) {
      console.log(`${operationType} extractor ${slug}:`, value)
    }

    for (const failure of extractionFailures) {
      console.error(`Extractor ${failure.slug} failed:`, failure.error)
    }
  }
}
```

`extractedValues` uses each extractor's slug as its key. Both result fields are optional, and a failed extractor doesn't remove values from successful extractors.

`data-om-observation-end` reports a synchronous completion. `data-om-buffering-end` reports completed background work. Its extractor metadata is persisted immediately, but the buffered content remains inactive until activation. Check `operationType` to determine whether the completed work was an observation or reflection.

See the [`data-om-observation-end`](https://mastra.ai/reference/memory/observational-memory) and [`data-om-buffering-end`](https://mastra.ai/reference/memory/observational-memory) reference tables for the complete payloads.

#### Working memory updates

Use `observationalMemory.observation.manageWorkingMemory` to let the Observer manage working memory automatically. The main agent no longer needs to call the working memory tool while it handles the user request, so working memory updates don't depend on the agent remembering to make them.

This also keeps working memory prompt-cache friendly. Working memory normally lives in the system prompt, so updates can invalidate the prompt cache. OM-managed working memory defaults `workingMemory.useStateSignals` to `true`, which moves working memory into state signals instead.

```typescript
import { Memory } from '@mastra/memory'

const memory = new Memory({
  options: {
    workingMemory: {
      enabled: true,
    },
    observationalMemory: {
      enabled: true,
      observation: {
        manageWorkingMemory: true,
      },
    },
  },
})
```

This setting adds `WorkingMemoryExtractor`, defaults `workingMemory.agentManaged` to `false`, and defaults `workingMemory.useStateSignals` to `true`. Set `workingMemory.agentManaged: true` if the main agent should still receive working memory tool and instruction injection.

Use `onExtracted` to normalize or react to custom extracted values before they're persisted:

```typescript
new Extractor({
  name: 'Project status',
  instructions: 'Extract the current project status.',
  schema: z.string(),
  async onExtracted({ current, sendSignal }) {
    await sendSignal?.({
      type: 'user-message',
      contents: `Project status extracted: ${current}`,
    })
    return current.trim().toLowerCase()
  },
})
```

Extractor failures are reported in OM markers and don't block other successful extractor values. See [the API reference](https://mastra.ai/reference/memory/observational-memory) for the full `Extractor` shape.

If your Observer model is text-only or its API rejects multimodal input, set `observation.observeAttachments` to `false` to drop attachments before they reach the Observer. The readable placeholders (`[Image #1: ...]`, `[File #1: ...]`) are kept in the transcript so the Observer can still reason about what was shared without receiving the binary payload. The same filter applies to tool results that contain image or file parts:

```typescript
new Agent({
  id: 'assistant',
  name: 'assistant',
  instructions: 'You are a helpful assistant.',
  model: 'openai/gpt-5-mini',
  memory: new Memory({
    options: {
      observationalMemory: {
        observation: {
          model: 'deepseek/deepseek-reasoner',
          observeAttachments: false,
        },
      },
    },
  }),
})
```

You can also pass an allowlist of mimeType globs (for example `['image/*']`) to forward only the kinds the Observer can handle. Alternatively, set `observeAttachments: 'auto'` so Mastra consults the provider capabilities registry. It forwards attachments when the Observer model supports multimodal input and drops them otherwise. If capability data is unavailable for the model, the setting falls back to `true`.

Attachments that the agent recorded as unavailable, because they could no longer be downloaded, are never sent to the Observer. The Observer still sees their `[Image #1: ...]` or `[File #1: ...]` line. See [attachment download failures](https://mastra.ai/docs/agents/processors) for how Mastra records them.

```md
Date: 2026-01-15

- 🔴 12:10 User is building a Next.js app with Supabase auth, due in 1 week (meaning January 22nd 2026)
  - 🔴 12:10 App uses server components with client-side hydration
  - 🟡 12:12 User asked about middleware configuration for protected routes
  - 🔴 12:15 User stated the app name is "Acme Dashboard"
```

The compression is typically between 5x and 40x. During synchronous observation, the Observer can also track a **current task** and **suggested response** so the agent picks up where it left off.

If you enable `observation.threadTitle`, the Observer can also suggest a short thread title when the conversation topic meaningfully changes. Thread title generation is opt-in and updates the thread metadata, so apps like Mastra Code can show the latest title in thread lists and status UI.

Example: An agent using Playwright MCP might see 50,000+ tokens per page snapshot. With OM, the Observer watches the interaction and creates a few hundred tokens of observations about what was on the page and what actions were taken. The agent stays on task without carrying every raw snapshot.

#### Reflections

When observations exceed their threshold (default: 40,000 tokens), the Reflector condenses them and combines related items, plus reflects on patterns.

Reflections don't accumulate as a separate, ever-growing layer. Each reflection rewrites the entire observation log. The Reflector's output becomes the new log, and new observations append after it. When the log next hits the threshold, the Reflector re-processes everything, including earlier reflections. It condenses older information more aggressively while keeping recent detail. Memory stays bounded around the reflection threshold no matter how long the conversation runs.

The result is a three-tier system:

1. **Recent messages**: Exact conversation history for the current task
2. **Observations**: A log of what the Observer has seen
3. **Reflections**: Condensed observations when memory becomes too long

#### How context changes over time

With default settings, the context window doesn't grow unbounded. It oscillates through an observe-and-shrink cycle:

![Chart of context tokens over the course of a conversation with Observational Memory enabled: message history repeatedly grows toward the 30,000 token observation threshold, then shrinks back to around 6,000 tokens as observations activate, while the observation log steps up with each cycle until it reaches the 40,000 token reflection threshold and the Reflector condenses it into reflections](/img/memory/om-context-over-time-light.svg)

1. **0 → 30k tokens**: Message history grows normally. In the background, the Observer buffers observations every \~6k tokens (`bufferTokens: 0.2`).
2. **30k reached**: Buffered observations activate instantly. Observed messages are removed from the context window and only \~6k tokens of recent history remain (`bufferActivation: 0.8` retains 20% of the threshold). The \~24k tokens of removed messages become roughly 1-5k tokens of observations at typical 5-40x compression.
3. **Repeat**: History grows from \~6k back toward 30k and shrinks again. Each cycle appends to the observation log, which grows much more slowly than raw history.
4. **Observations reach 40k**: The Reflector creates a smaller log from the current observations and any earlier reflections.

In the normal buffered cycle, raw history oscillates between roughly 6k and 30k tokens. The observation log stays around 40k tokens, however long the conversation runs. These are activation thresholds rather than hard caps, so history can grow past the threshold whenever background buffering doesn't keep pace. Between the threshold and `blockAfter` (default `1.2`, \~36k tokens), buffering keeps running in the background and the next ready chunk activates without blocking the agent. At `blockAfter`, a synchronous observation runs if no buffered chunk activates. Reflection falls back to a synchronous run above its own `blockAfter` (\~48k tokens).

With [`shareTokenBudget`](https://mastra.ai/reference/memory/observational-memory) enabled, the two budgets pool together. While the observation log is small, message history can expand into the unused observation space (up to \~70k tokens with the defaults) before observation triggers. It then shrinks as observations accumulate.

#### Retrieval mode

Normal OM compresses messages into observations, which is great for staying on task, but the original wording is gone. Retrieval mode fixes this by keeping each observation group linked to the raw messages that produced it. The agent can call a `recall` tool to recover source details compressed by the summary, including exact wording and tool output as well as chronology.

##### Browsing only

Set `retrieval: true` to enable the recall tool for browsing raw messages. No vector store needed. By default, the recall tool can browse across all threads for the current resource.

```typescript
const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'google/gemini-2.5-flash',
      retrieval: true,
    },
  },
})
```

##### With semantic search

Set `retrieval: { vector: true }` to also enable semantic search. This reuses the vector store and embedder already configured on your Memory instance:

```typescript
const memory = new Memory({
  storage,
  vector: myVectorStore,
  embedder: myEmbedder,
  options: {
    observationalMemory: {
      model: 'google/gemini-2.5-flash',
      retrieval: { vector: true },
    },
  },
})
```

When vector search is configured, new observation groups are automatically indexed at buffer time and during synchronous observation (fire-and-forget, non-blocking). Semantic search returns observation-group matches with their raw source message ID ranges, so the recall tool can show the summarized memory alongside where it came from.

##### Restricting to the current thread

By default, the recall tool scope is `'resource'`, the agent can list threads and browse other threads, plus search across all conversations. Set `scope: 'thread'` to restrict the agent to only the current thread:

```typescript
const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'google/gemini-2.5-flash',
      retrieval: { vector: true, scope: 'thread' },
    },
  },
})
```

##### Custom recall guidance

Mastra injects scope-aware instructions that teach the agent when to search, list threads, or read a specific thread. Use `instructions` to append application-specific guidance after those built-in instructions. The built-in instructions are never replaced:

```typescript
const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'google/gemini-2.5-flash',
      retrieval: {
        vector: true,
        instructions: `
          Prefer the current conversation when it already contains the answer.
          For an initial scan, use a small limit with detail="low".
        `,
      },
    },
  },
})
```

This keeps recall-specific guidance attached to the recall tool instead of the agent's global instructions, so it doesn't affect unrelated tasks.

##### What retrieval enables

With retrieval mode enabled, OM:

- Stores a `range` (e.g. `startId:endId`) on each observation group pointing to the messages it was derived from

- Keeps range metadata visible in the agent's context so the agent knows which observations map to which messages

- Registers a `recall` tool the agent can call to:

  - Page through the raw messages behind any observation group range
  - Search by semantic similarity (`mode: "search"` with a `query` string); requires `vector: true`
  - List all threads (`mode: "threads"`), browse other threads (`threadId`), and search across all threads (default `scope: 'resource'`)
  - When `scope: 'thread'`: restrict browsing and search to the current thread only

See the [recall tool reference](https://mastra.ai/reference/memory/observational-memory) for the full API (detail levels, part indexing, pagination, cross-thread browsing, and token limiting).

### Studio

To see how it works in practice, open [Studio](https://mastra.ai/docs/studio/overview) and navigate to an agent with OM enabled. The **Memory** tab displays:

- **Token progress bars**: Current token counts for messages and observations, showing how close each is to its threshold. Hover over the info icon to see the model and threshold for the Observer and Reflector.

- **Active observations**: The current observation log is shown inline. If earlier observation or reflection records exist, expand "Previous observations" to browse them.

- **Background processing**: During a conversation, buffered observation chunks and reflection status appear as the agent processes in the background.

The progress bars update live while the agent is observing or reflecting, showing elapsed time and a status badge.

### Models

The Observer and Reflector run in the background. Any model that works with Mastra's [model routing](https://mastra.ai/models) (`provider/model`) can be used. When no model is set, the default is `model: 'auto'`.

Automatic selection uses `google/gemini-2.5-flash` when `GOOGLE_GENERATIVE_AI_API_KEY` is configured. Otherwise, it selects a low-cost model for the active main model's provider, then falls back to the active main model. Observer and Reflector resolve independently before each invocation.

Automatic selection reads the main model's `provider/model` ID. Models created from a plain model string carry that ID, and a dynamic model function can label a custom model by returning `{ model, id }`. When the ID is unknown, such as a model with a custom URL, API key, headers, or gateway, automatic selection reuses the main model itself because a sibling model isn't known to share that route. Pass a concrete model ID to the role to override either behavior.

Use `autoModels` to change the model picked for a provider, and `resolveModel` to create the picked model with your own credentials or routing:

```typescript
const memory = new Memory({
  options: {
    observationalMemory: {
      autoModels: { openai: 'openai/gpt-5-nano' },
      resolveModel: (modelId, { requestContext }) => createRoutedModel(modelId, requestContext),
    },
  },
})
```

`resolveAutoModelId(mainModelId, { autoModels })` from `@mastra/memory` returns the model automatic selection would pick, which is useful for showing the effective model in a settings UI.

Mastra recommends using a model that has a large context window (128K+ tokens) and is fast enough to run in the background without slowing down your actions.

To pin a model instead, set a concrete model ID. We've also successfully tested `openai/gpt-5-mini`, `anthropic/claude-haiku-4-5`, `deepseek/deepseek-reasoner`, `deepseek/deepseek-v4-pro`, `deepseek/deepseek-v4-flash`, `xai/grok-4-1-fast`, `qwen3`, and `glm-4.7`.

```typescript
const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'deepseek/deepseek-reasoner',
    },
  },
})
```

See [model configuration](https://mastra.ai/reference/memory/observational-memory) for using different models per agent.

> **Note:** `google/gemini-2.5-flash` is unusually good at preserving detail in long output. As a result, the Reflector can produce reflections that stay above the configured `reflection.observationTokens` threshold even after the maximum compression retry. When this happens, the Reflector returns the smallest non-degenerate candidate produced during retries so the loop terminates instead of running forever.
>
> If you'd rather have more aggressive compression on the Reflector, swap to a model that condenses more readily, such as `xai/grok-4-1-fast`, `deepseek/deepseek-v4-pro`, or `deepseek/deepseek-v4-flash`. You can keep `google/gemini-2.5-flash` for the Observer and use a different model for the Reflector. See [different models per agent](https://mastra.ai/reference/memory/observational-memory).

#### Token-tiered model selection

**Added in:** `@mastra/memory@1.10.0`

You can use `ModelByInputTokens` to specify different Observer or Reflector models based on input token count. OM selects the matching model tier at runtime from the configured `upTo` thresholds.

```typescript
import { Memory, ModelByInputTokens } from '@mastra/memory'

const memory = new Memory({
  options: {
    observationalMemory: {
      observation: {
        model: new ModelByInputTokens({
          upTo: {
            // Faster, cheaper models for smaller inputs; stronger models for larger contexts
            5_000: 'openrouter/mistralai/ministral-8b-2512',
            20_000: 'openrouter/mistralai/mistral-small-2603',
            40_000: 'openai/gpt-5-mini',
            1_000_000: 'google/gemini-3.1-flash-lite-preview',
          },
        }),
      },
      reflection: {
        model: new ModelByInputTokens({
          upTo: {
            20_000: 'openai/gpt-5-mini',
            100_000: 'google/gemini-2.5-flash',
          },
        }),
      },
    },
  },
})
```

The `upTo` keys are inclusive upper bounds. OM computes the actual input token count for the Observer or Reflector call and resolves the matching tier directly, plus uses that concrete model for the run.

If the input exceeds the largest configured threshold, an error is thrown, ensure your thresholds cover the full range of possible input sizes, or use a model with a sufficiently large context window at the highest tier.

### Scopes

#### Thread scope (default)

Each thread has its own observations. This scope is well tested and works well as a general purpose memory system, especially for long horizon agentic use-cases.

```typescript
const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'google/gemini-2.5-flash',
      scope: 'thread',
    },
  },
})
```

Thread scope requires a valid `threadId` to be provided when calling the agent. If `threadId` is missing, Observational Memory throws an error. This prevents multiple threads from silently sharing a single observation record, which can cause database deadlocks.

#### Resource scope (deprecated)

> **Deprecated:** `scope: 'resource'` is deprecated and will be removed in a future release. Mastra logs a warning the first time Observational Memory is created with resource scope. Remove the `scope` option to use the default thread scope, and use the [alternatives below](#cross-thread-continuity-without-resource-scope) for cross-conversation continuity.

In resource scope, observations are shared across all threads for a resource (typically a user). Resource scope works much worse than thread scope for prompt caching and for the agent's understanding of the conversation:

- **Prompt caching:** Observations from every thread share one record. When any thread is observed, the observation context changes for all other threads, which invalidates their cached prompt prefix.
- **Agent understanding:** Each thread sees a mix of observations from every thread for the resource. Every new thread starts with context from earlier threads, and the agent may continue work that another thread started but didn't finish.
- **Performance:** Unobserved messages across _all_ threads are processed together, which is slow for users with many existing threads.

A new knowledge and subconscious memory primitive for cross-thread memory is coming soon and will replace resource scope. Until then, use the alternatives below.

##### Cross-thread continuity without resource scope

Switching from resource scope to thread scope doesn't migrate resource-scoped observations. Each thread uses its existing thread-scoped record if it has one, or starts a new, empty one, and messages already observed under resource scope aren't observed again. Keep facts that must carry over in resource-scoped working memory.

Use thread scope with one or both of these features instead:

- [Retrieval mode](#retrieval-mode): The agent gets a `recall` tool that can list and browse other threads for the same resource, and optionally search them semantically. The agent looks up earlier conversations only when it needs them.
- [Resource-scoped working memory](https://mastra.ai/docs/memory/working-memory): Stores small, durable facts about the user that every thread can read.

```typescript
const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'google/gemini-2.5-flash',
      retrieval: true,
    },
    workingMemory: {
      enabled: true,
      scope: 'resource',
    },
  },
})
```

### Token budgets

OM uses token thresholds to decide when to observe and reflect. See [token budget configuration](https://mastra.ai/reference/memory/observational-memory) for details.

```typescript
const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'google/gemini-2.5-flash',
      observation: {
        // when to run the Observer (default: 30,000)
        messageTokens: 30_000,
      },
      reflection: {
        // when to run the Reflector (default: 40,000)
        observationTokens: 40_000,
      },
      // let message history borrow from observation budget
      // requires bufferTokens: false (temporary limitation)
      shareTokenBudget: false,
    },
  },
})
```

#### Token counting cache

OM caches token estimates in message metadata to reduce repeat counting work during threshold checks and buffering decisions.

- Per-part estimates are stored on `part.providerMetadata.mastra` and reused on subsequent passes when the cache version/tokenizer source matches.
- For string-only message content (without parts), OM uses a message-level metadata fallback cache.
- Message and conversation overhead are still recalculated on every pass. The cache only stores payload estimates, so counting semantics stay the same.
- `data-*` and `reasoning` parts are still skipped and aren't cached.

#### Caller-supplied token estimates for file parts

You can attach a token estimate directly to an `image` or `file` part using `providerMetadata.mastra.tokenEstimate`. The Token Counter honors this value verbatim and skips its own estimator:

```typescript
const filePart = {
  type: 'file',
  data: 'storage://bucket/large-report.pdf',
  mimeType: 'application/pdf',
  filename: 'large-report.pdf',
  providerMetadata: {
    mastra: {
      tokenEstimate: {
        v: 0,
        source: 'client',
        key: 'client',
        tokens: 100_000,
      },
    },
  },
}
```

The `tokenEstimate` object follows the same shape the Token Counter uses internally for cached estimates:

- `v`: cache schema version. Set to `0`. Caller-supplied entries are exempt from the framework's version check, so the value isn't read.
- `source`: cache lineage marker. Must be `'client'`. This is what tells the Token Counter the entry is authoritative and should be honored verbatim instead of being recomputed or overwritten.
- `key`: content fingerprint slot. Set to `'client'`. Framework entries use a content hash here so they invalidate when the payload changes. The `'client'` sentinel keeps caller estimates stable across writes.
- `tokens`: the token count to use. Must be a finite non-negative number.

Additional notes:

- The estimate is only honored on `image` and `file` parts. `text` and `tool-invocation` parts are always counted normally, even if they carry a `tokenEstimate`.

### Async buffering

Without async buffering, the Observer runs synchronously when the message threshold is reached, the agent pauses mid-conversation while the Observer LLM call completes. With async buffering (enabled by default), observations are pre-computed in the background as the conversation grows. When the threshold is hit, buffered observations activate instantly with no pause.

#### How it works

As the agent converses, message tokens accumulate. At regular intervals (`bufferTokens`), a background Observer call runs without blocking the agent. Each call produces a "chunk" of observations that's stored in a buffer.

When message tokens reach the `messageTokens` threshold, buffered chunks activate: their observations move into the active observation log, and the corresponding raw messages are removed from the context window. The agent never pauses.

Async buffered Observer calls don't generate continuation hints because delayed hints can be stale by activation time. When buffered chunks activate, any previously stored suggested response and current task are cleared. The main agent receives the compressed observations without those hints.

When message production outpaces the Observer, history can pass `messageTokens` before a buffered chunk is ready. Between `messageTokens` and `blockAfter`, Mastra keeps buffering in the background and activates the chunk on a later step, so the agent doesn't wait on the Observer. A synchronous observation runs if pending tokens still reach `blockAfter` after buffered activation, for example when a large tool result leaves an uncovered tail. Above `blockAfter`, activation may also overshoot the retention target instead of using fewer chunks. Buffered activation usually preserves a minimum remaining context (the smaller of \~1k tokens or the configured retention floor), but a single buffered chunk that covers the whole pending window still activates and can leave less.

At `blockAfter`, activation waits a bounded time for a buffered observation that's still being produced so it activates with the rest. If that takes longer, Mastra observes the remaining messages synchronously. A late observation whose messages are all already observed is then dropped instead of stored. Activations triggered by the idle TTL or a model change don't wait.

Reflection works similarly: the Reflector runs in the background when observations reach a fraction of the reflection threshold.

#### Settings

| Setting                               | Default | What it controls                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `observation.bufferTokens`            | `0.2`   | How often to buffer. `0.2` means every 20% of `messageTokens`. With the default 30k threshold, that's roughly every 6k tokens. Can also be an absolute token count (e.g. `5000`).                                                                                                                                                                                                                                                                                                                                                                    |
| `observation.bufferActivation`        | `0.8`   | How aggressively to clear the message window on activation. `0.8` means remove enough messages to keep only 20% of `messageTokens` remaining. Lower values keep more message history.                                                                                                                                                                                                                                                                                                                                                                |
| `observation.blockAfter`              | `1.2`   | Safety net if buffering can't keep up. Values from 1 up to (but not including) 100 multiply `messageTokens`. For example, `1.2` creates a threshold of 36k tokens (1.2 × 30k). Below it, only background buffering and activation run. Observation runs synchronously if pending tokens still reach it after buffered activation. Activation may also overshoot the retention target. Values of 100 or more are absolute token counts (e.g. `50_000`) and must be greater than `messageTokens`. Set `1` to observe synchronously at `messageTokens`. |
| `activateAfterIdle`                   | none    | Forces buffered observations to activate after a period of inactivity, even before `observation.messageTokens` is reached. Accepts a numeric millisecond value such as `300_000`, duration strings like `"5m"` or `"1hr"`, `"auto"` for a provider-aware prompt cache TTL, or an object of per-provider TTLs such as `{ default: 'auto', anthropic: '1h' }`.                                                                                                                                                                                         |
| `activateOnProviderChange`            | `false` | Forces buffered observations to activate when the next step uses a different `provider/model` than the one that produced the latest assistant step. Use this when switching providers or models would invalidate prompt cache reuse.                                                                                                                                                                                                                                                                                                                 |
| `reflection.bufferActivation`         | `0.5`   | When to start background reflection. `0.5` means reflection begins when observations reach 50% of the `observationTokens` threshold.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `reflection.activateAfterIdle`        | none    | Opts buffered reflections into idle activation. Reflections don't inherit top-level `activateAfterIdle`.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `reflection.activateOnProviderChange` | `false` | Opts buffered reflections into provider-change activation. Reflections don't inherit top-level `activateOnProviderChange`.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `reflection.blockAfter`               | `1.2`   | Safety threshold for reflection. Same value format as observation (absolute values must be greater than `observationTokens`), but above it reflection runs synchronously when no buffered reflection is ready to activate.                                                                                                                                                                                                                                                                                                                           |

If you're relying on prompt caching, set `activateAfterIdle` to `"auto"` or to a specific cache TTL. That way, once a thread has been idle long enough for the cache to expire, the next request can activate buffered observations first and send a smaller compressed context window.

With `"auto"`, Mastra chooses an idle activation TTL from the active model provider:

| Provider                                                                                               | Auto TTL  |
| ------------------------------------------------------------------------------------------------------ | --------- |
| Anthropic, OpenRouter, unknown providers, xAI                                                          | 5 minutes |
| DeepSeek                                                                                               | 1 hour    |
| Google Gemini                                                                                          | 24 hours  |
| Groq                                                                                                   | 2 hours   |
| OpenAI with `providerOptions.openai.promptCacheRetention: "24h"`                                       | 1 hour    |
| OpenAI with `providerOptions.openai.promptCacheRetention: "in_memory"`                                 | 5 minutes |
| OpenAI `gpt-4*`, `gpt-5`, `gpt-5-*`, and `gpt-5.1` through `gpt-5.4` (including `-` suffixed variants) | 5 minutes |
| Other OpenAI models                                                                                    | 1 hour    |

```typescript
const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'google/gemini-2.5-flash',
      activateAfterIdle: 'auto',
      activateOnProviderChange: true,
    },
  },
})
```

With `"auto"`, this activates buffered observations based on the active provider's prompt cache behavior so the next uncached prompt uses compressed observations instead of a larger raw message window. If you prefer a fixed 5-minute TTL, use `"5m"` or `300_000`.

Changing models or providers mid-thread will invalidate the prompt cache. If your agent can switch between providers or models mid-thread, `activateOnProviderChange: true` forces buffered observations to activate before the new provider runs. That avoids sending a large raw window to a provider that can't reuse the previous prompt cache.

##### Per-provider idle TTLs

`"auto"` can't see a cache TTL that you set on individual messages, such as Anthropic's `cacheControl: { type: 'ephemeral', ttl: '1h' }`. It keeps using the provider's 5-minute default, so buffered observations activate while the 1-hour cache is still warm. Pass an object to set the TTL per provider instead:

```typescript
const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'google/gemini-2.5-flash',
      activateAfterIdle: { default: 'auto', anthropic: '1h' },
    },
  },
})
```

Set the `anthropic` entry to the same TTL as your `cacheControl.ttl`. Mastra doesn't read the per-message cache setting, so the two must be kept in sync by hand.

How the object resolves:

- Keys are provider names. Mastra compares them case-insensitively with the part of the model's provider before the first `.`, so `anthropic` matches both `anthropic` and `anthropic.messages`. Claude served through another provider uses that provider's key instead, for example `amazon-bedrock`. Keys must not contain `.` or `/`.
- Each value accepts the same forms as a single TTL: milliseconds, a duration string, `"auto"`, or `false` to turn off idle activation for that provider.
- `default` applies to every provider without its own key. Without `default`, those providers don't idle-activate.
- `observation.activateAfterIdle` and `reflection.activateAfterIdle` accept the same object. An `observation.activateAfterIdle` object replaces the top-level value and isn't merged with it.

#### Disabling

To disable async buffering and use synchronous observation/reflection instead:

```typescript
const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'google/gemini-2.5-flash',
      observation: {
        bufferTokens: false,
      },
    },
  },
})
```

Setting `bufferTokens: false` disables both observation and reflection async buffering. See [async buffering configuration](https://mastra.ai/reference/memory/observational-memory) for the full API.

> **Note:** Resource scope (deprecated) automatically disables async buffering.

### Observer Context Optimization

By default, the Observer receives the full observation history as context when processing new messages. The Observer also receives prior `current-task` and `suggested-response` metadata (when available), so it can stay oriented even when observation context is truncated. For long-running conversations where observations grow large, you can opt into context optimization to reduce Observer input costs.

Set `observation.previousObserverTokens` to limit how many tokens of previous observations are sent to the Observer. Observations are tail-truncated, keeping the most recent entries. When a buffered reflection is pending, the already-reflected lines are automatically replaced with the reflection summary before truncation is applied.

```typescript
const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'google/gemini-2.5-flash',
      observation: {
        previousObserverTokens: 10_000, // keep only ~10k tokens of recent observations
      },
    },
  },
})
```

- `previousObserverTokens: false` → default. Sends the full previous observations.
- `previousObserverTokens: 2000` → keeps \~2k tokens of recent observations.
- `previousObserverTokens: 0` → omit previous observations completely.

### Hooks

OM exposes two kinds of config-level hooks on `observationalMemory.hooks`:

- **Lifecycle hooks** (`onObservationStart`, `onObservationEnd`, `onReflectionStart`, `onReflectionEnd`) are telemetry callbacks. They receive `threadId`, `resourceId`, and `trigger`, and the end hooks also receive the model call's `usage`, `providerMetadata`, and any `error`. They never change what OM stores.
- **Transform hooks** (`beforeObservation`, `afterObservation`, `beforeReflection`, `afterReflection`) intercept the data flowing through a cycle. Return `void` to pass the input through unchanged, or return a replacement to change what the Observer/Reflector sees or what gets persisted.

```typescript
const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'google/gemini-2.5-flash',
      hooks: {
        // Drop or redact messages before the Observer sees them.
        beforeObservation: ({ messages }) => ({
          messages: messages.filter(m => !isSensitive(m)),
        }),
        // Rewrite observations before they are persisted.
        afterObservation: ({ observations, threadId }) => ({
          observations: redact(observations),
        }),
        // Rewrite the text the Reflector condenses, or its output.
        beforeReflection: ({ observations }) => ({
          observations: stripInternalNotes(observations),
        }),
        afterReflection: async ({ observations, resourceId }) => {
          await syncToExternalStore(resourceId, observations)
        },
      },
    },
  },
})
```

Transform hooks are always awaited, on every path (manual `observe()`/`reflect()`, turn-synchronous observation, and async buffering). If `beforeObservation` returns an empty `messages` array, the Observer model call is skipped and the filtered messages are still marked as observed. If a transform hook throws, the cycle fails before committing the transformed observation or reflection text. This doesn't roll back extractor callbacks or other side effects that have already run.

`afterObservation` and `afterReflection` replace only the observation or reflection text. They don't recompute or redact the separate structured extractor results stored in thread metadata. Reflection extraction and its callbacks run before `afterReflection`, so rewriting the reflection doesn't rerun those callbacks. Use extractor configuration and callbacks to control structured values. Don't treat an after hook as a redaction boundary for all cycle data.

Because hooks receive `threadId` and `resourceId`, you can also use them to update [working memory](https://mastra.ai/docs/memory/working-memory) via `memory.updateWorkingMemory()` during a cycle. These external updates aren't atomic with the OM text commit.

#### Redact skill results

Agent skills are injected into the agent as tools (`skill`, `skill_search`, `skill_read`). Their results contain the skill's full instructions or file contents, so without redaction the Observer re-observes that text every time a skill is used. `skillResultRedactor()` is a ready-made `beforeObservation` hook that replaces those results with a placeholder and leaves everything else in place. The tool call survives, so the Observer still records which skill was used and what it was called with.

```typescript
import { Memory } from '@mastra/memory'
import { skillResultRedactor } from '@mastra/memory/hooks'

const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'google/gemini-2.5-flash',
      hooks: {
        beforeObservation: skillResultRedactor(),
      },
    },
  },
})
```

Pass `toolNames` to redact results from a different set of tools. Because a hook is a function over the messages, it composes with your own transforms by chaining the outputs. Await each chained hook so an async one isn't discarded:

```typescript
const dropSkillResults = skillResultRedactor()

hooks: {
  beforeObservation: async input => {
    const messages = (await dropSkillResults(input))?.messages ?? input.messages
    return { messages: messages.filter(m => m.role !== 'signal') }
  },
}
```

### Migrating existing threads

No manual migration needed. OM reads existing messages and observes them lazily when thresholds are exceeded.

- **Thread scope**: The first time a thread exceeds `observation.messageTokens`, the Observer processes the backlog.
- **Resource scope (deprecated)**: All unobserved messages across all threads for a resource are processed together. For users with many existing threads, this could take substantial time.

### Comparing OM with other memory features

- **[Message history](https://mastra.ai/docs/memory/message-history)**: High-fidelity record of the current conversation
- **[Working memory](https://mastra.ai/docs/memory/working-memory)**: Small, structured state (JSON or markdown) for user preferences, names, goals
- **[Semantic Recall](https://mastra.ai/docs/memory/semantic-recall)**: RAG-based retrieval of relevant past messages
- **[Multi-user threads](https://mastra.ai/docs/memory/multi-user-threads)**: How OM attributes facts to individual users when several people share a single thread

If you're using working memory to store conversation summaries or ongoing state that grows over time, OM is a better fit. Working memory is for small, structured data. OM is for long-running event logs. OM also manages message history automatically, the `messageTokens` setting controls how much raw history remains before observation runs.

In practical terms, OM replaces both working memory and message history, and has greater accuracy (and lower cost) than Semantic Recall.

### Related

- [Observational Memory Reference](https://mastra.ai/reference/memory/observational-memory)
- [Memory Overview](https://mastra.ai/docs/memory/overview)
- [Message History](https://mastra.ai/docs/memory/message-history)
- [Memory Processors](https://mastra.ai/docs/memory/memory-processors)
- [Mastra Code](https://code.mastra.ai/): A coding agent using Observational Memory
- 📹 [Mastra processors and Observational Memory workshop](https://www.youtube.com/watch?v=4Vpp7xQYvl0)

---

## Source: Working Memory (`docs/memory/working-memory`)

Canonical URL: `https://mastra.ai/docs/memory/working-memory.md`

## Working memory

While [message history](https://mastra.ai/docs/memory/message-history) and [semantic recall](https://mastra.ai/docs/memory/semantic-recall) help agents remember conversations, working memory allows them to maintain persistent information about users across interactions.

Working memory is the agent's active scratchpad: key information it keeps available about the user or task. It can retain a person's name, preferences, or other important details during a conversation.

This is useful for maintaining ongoing state that's always relevant and should always be available to the agent.

If you use [Observational Memory](https://mastra.ai/docs/memory/observational-memory), `observationalMemory.observation.manageWorkingMemory` lets OM update working memory for the agent.

> **📹 Watch:** Watch [Mastra working memory](https://www.youtube.com/watch?v=UMy_JHLf1n8\&pp=ygUVbWFzdHJhIHdvcmtpbmcgbWVtb3J5) to see how agents keep persistent user context available across interactions.

Working memory can persist at two different scopes:

- **Resource-scoped** (default): Memory persists across all conversation threads for the same user
- **Thread-scoped**: Memory is isolated per conversation thread

**Requirement:** Switching between scopes means the agent won't see memory from the other scope - thread-scoped memory is completely separate from resource-scoped memory.

### Quickstart

Here's a minimal example of setting up an agent with working memory:

```typescript
import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'

// Create agent with working memory enabled
const agent = new Agent({
  id: 'personal-assistant',
  name: 'PersonalAssistant',
  instructions: 'You are a helpful personal assistant.',
  model: 'openai/gpt-5.6-sol',
  memory: new Memory({
    options: {
      workingMemory: {
        enabled: true,
      },
    },
  }),
})
```

### How it works

Working memory is a block of Markdown text that the agent can update over time to store continuously relevant information.

### Memory persistence scopes

Working memory can operate in two different scopes, allowing you to choose how memory persists across conversations:

#### Resource-Scoped Memory (Default)

By default, working memory persists across all conversation threads for the same user (resourceId), enabling persistent user memory:

```typescript
const memory = new Memory({
  storage,
  options: {
    workingMemory: {
      enabled: true,
      scope: 'resource', // Memory persists across all user threads
      template: `# User Profile
- **Name**:
- **Location**:
- **Interests**:
- **Preferences**:
- **Long-term Goals**:
`,
    },
  },
})
```

**Use cases:**

- Personal assistants that remember user preferences
- Customer service bots that maintain customer context
- Educational applications that track student progress

#### Usage with Agents

When using resource-scoped memory, make sure to pass the `resource` parameter in the memory options:

```typescript
// Resource-scoped memory requires resource
const response = await agent.generate('Hello!', {
  memory: {
    thread: 'conversation-123',
    resource: 'user-alice-456', // Same user across different threads
  },
})
```

#### Thread-Scoped Memory

Thread-scoped memory isolates working memory to individual conversation threads. Each thread maintains its own isolated memory:

```typescript
const memory = new Memory({
  storage,
  options: {
    workingMemory: {
      enabled: true,
      scope: 'thread', // Memory is isolated per thread
      template: `# User Profile
- **Name**:
- **Interests**:
- **Current Goal**:
`,
    },
  },
})
```

**Use cases:**

- Different conversations about separate topics
- Temporary or session-specific information
- Workflows where each thread needs working memory but threads are ephemeral and not related to each other

### Storage adapter support

Resource-scoped working memory requires specific storage adapters that support the `mastra_resources` table:

#### Supported Storage Adapters

- **libSQL** (`@mastra/libsql`)
- **PostgreSQL** (`@mastra/pg`)
- **OracleDB** (`@mastra/oracledb`)
- **Upstash** (`@mastra/upstash`)
- **MongoDB** (`@mastra/mongodb`)

### Custom templates

Templates guide the agent on what information to track and update in working memory. Mastra uses a default template when you don't provide one. Define a custom template for your agent's use case so it remembers the most relevant information. For threads shared by multiple users, see [Multi-user threads](https://mastra.ai/docs/memory/multi-user-threads).

Here's an example of a custom template. In this example the agent will store the users name, location, timezone, etc as soon as the user sends a message containing any of the info:

```typescript
const memory = new Memory({
  options: {
    workingMemory: {
      enabled: true,
      template: `
# User Profile

## Personal info

- Name:
- Location:
- Timezone:

## Preferences

- Communication Style: [e.g., Formal, Casual]
- Project Goal:
- Key Deadlines:
  - [Deadline 1]: [Date]
  - [Deadline 2]: [Date]

## Session state

- Last Task Discussed:
- Open Questions:
  - [Question 1]
  - [Question 2]
`,
    },
  },
})
```

### Designing effective templates

A well-structured template keeps the information straightforward for the agent to parse and update. Treat the template as a short form that you want the assistant to keep up to date.

- **Short, focused labels.** Avoid paragraphs or very long headings. Keep labels brief (for example `## Personal Info` or `- Name:`) so updates are readable and less likely to be truncated.
- **Use consistent casing.** Inconsistent capitalization (`Timezone:` vs `timezone:`) can cause messy updates. Stick to Title Case or lower case for headings and bullet labels.
- **Keep placeholder text minimal.** Use hints such as `[e.g., Formal]` or `[Date]` to help the LLM fill in the correct spots.
- **Abbreviate very long values.** If you only need a short form, include guidance like `- Name: [First name or nickname]` or `- Address (short):` rather than the full legal text.
- **Mention update rules in `instructions`.** You can instruct how and when to fill or clear parts of the template directly in the agent's `instructions` field.

#### Alternative Template Styles

Use a shorter single block if you only need a few items:

```typescript
const basicMemory = new Memory({
  options: {
    workingMemory: {
      enabled: true,
      template: `User Facts:\n- Name:\n- Favorite Color:\n- Current Topic:`,
    },
  },
})
```

You can also store the key facts in a short paragraph format if you prefer a more narrative style:

```typescript
const paragraphMemory = new Memory({
  options: {
    workingMemory: {
      enabled: true,
      template: `Important Details:\n\nKeep a short paragraph capturing the user's important facts (name, main goal, current task).`,
    },
  },
})
```

### Structured working memory

Working memory can also be defined using a structured schema instead of a Markdown template. A [Standard JSON Schema](https://standardschema.dev/json-schema) ([Zod](https://zod.dev/), [Valibot](https://valibot.dev/), [ArkType](https://arktype.io/), etc.). When using a schema, the agent will see and update working memory as a JSON object matching your schema.

**Requirement:** You must specify either `template` or `schema`, but not both.

#### Example: Schema-Based Working Memory

```typescript
import { z } from 'zod'
import { Memory } from '@mastra/memory'

const userProfileSchema = z.object({
  name: z.string().optional(),
  location: z.string().optional(),
  timezone: z.string().optional(),
  preferences: z
    .object({
      communicationStyle: z.string().optional(),
      projectGoal: z.string().optional(),
      deadlines: z.array(z.string()).optional(),
    })
    .optional(),
})

const memory = new Memory({
  options: {
    workingMemory: {
      enabled: true,
      schema: userProfileSchema,
      // template: ... (do not set)
    },
  },
})
```

When a schema is provided, the agent receives the working memory as a JSON object. For example:

```json
{
  "name": "Sam",
  "location": "Berlin",
  "timezone": "CET",
  "preferences": {
    "communicationStyle": "Formal",
    "projectGoal": "Launch MVP",
    "deadlines": ["2025-07-01"]
  }
}
```

#### Merge Semantics for Schema-Based Memory

Schema-based working memory uses **merge semantics**, meaning the agent only needs to include fields it wants to add or update. Existing fields are preserved automatically.

- **Object fields are deep merged:** Only provided fields are updated; others remain unchanged
- **Set a field to `null` to delete it:** This explicitly removes the field from memory
- **Arrays are replaced entirely:** When an array field is provided, it replaces the existing array (arrays aren't merged element-by-element)

#### Concurrent updates

With `scope: 'resource'` and a storage adapter that supports atomic merges (currently `@mastra/pg`), each merge runs inside a row-locked database transaction. Concurrent updates to different fields from separate processes are all kept. Other adapters merge in the application, which only serializes writers inside a single process.

To merge a partial update from your own code, call `memory.mergeWorkingMemory()`:

```typescript
await memory.mergeWorkingMemory({
  threadId: 'thread-1',
  resourceId: 'user-123',
  workingMemory: { preferences: { tone: 'formal' } },
})
```

It throws if working memory isn't schema-based and resource-scoped, or if the storage adapter doesn't support atomic merges. Check `await memory.supportsAtomicWorkingMemoryMerge()` first if you need to fall back.

### Choosing between template and schema

- Use a **template** (Markdown) if you want the agent to maintain memory as a free-form text block, such as a user profile or scratchpad. Templates use **replace semantics**: the agent must provide the complete memory content on each update.
- Use a **schema** for structured, type-safe JSON data that supports validation and programmatic access. The `workingMemory.schema` field accepts any `PublicSchema`-compatible schema, such as Zod v3 or v4. JSON Schema and already-standard schemas are also supported. **Merge semantics** preserve existing fields when the agent provides only the fields to update.
- Only one mode can be active at a time: setting both `template` and `schema` isn't supported.

### Example: Multi-step retention

Below is a simplified view of how the `User Profile` template updates across a short user conversation:

```nohighlight
# User Profile

## Personal info

- Name:
- Location:
- Timezone:

--- After user says "My name is **Sam** and I'm from **Berlin**" ---

# User Profile
- Name: Sam
- Location: Berlin
- Timezone:

--- After user adds "By the way I'm normally in **CET**" ---

# User Profile
- Name: Sam
- Location: Berlin
- Timezone: CET
```

The agent can now refer to `Sam` or `Berlin` in later responses without requesting the information again because it has been stored in working memory.

If your agent isn't properly updating working memory when you expect it to, you can add system instructions on _how_ and _when_ to use this template in your agent's `instructions` setting.

### Setting initial working memory

While agents typically update working memory through the `updateWorkingMemory` tool, you can also set initial working memory programmatically when creating or updating threads. This is useful for injecting user data (like their name, preferences, or other info) that you want available to the agent without passing it in every request.

#### Setting Working Memory via Thread Metadata

When creating a thread, you can provide initial working memory through the metadata's `workingMemory` key:

```typescript
// Create a thread with initial working memory
const thread = await memory.createThread({
  threadId: 'thread-123',
  resourceId: 'user-456',
  title: 'Medical Consultation',
  metadata: {
    workingMemory: `# Patient Profile
- Name: John Doe
- Blood Type: O+
- Allergies: Penicillin
- Current Medications: None
- Medical History: Hypertension (controlled)
`,
  },
})

// The agent will now have access to this information in all messages
await agent.generate("What's my blood type?", {
  memory: {
    thread: thread.id,
    resource: 'user-456',
  },
})
// Response: "Your blood type is O+."
```

#### Updating Working Memory Programmatically

You can also update an existing thread's working memory:

```typescript
// Update thread metadata to add/modify working memory
await memory.updateThread({
  id: 'thread-123',
  title: thread.title,
  metadata: {
    ...thread.metadata,
    workingMemory: `# Patient Profile
- Name: John Doe
- Blood Type: O+
- Allergies: Penicillin, Ibuprofen  // Updated
- Current Medications: Lisinopril 10mg daily  // Added
- Medical History: Hypertension (controlled)
`,
  },
})
```

#### Direct Memory Update

Alternatively, use the `updateWorkingMemory` method directly:

```typescript
await memory.updateWorkingMemory({
  threadId: 'thread-123',
  resourceId: 'user-456', // Required for resource-scoped memory
  workingMemory: 'Updated memory content...',
})
```

### Read-only working memory

In some scenarios, you may want an agent to have access to working memory data without the ability to modify it. This is useful for:

- **Routing agents** that need context but shouldn't update user profiles
- **Sub agents** in a multi-agent system that should reference but not own the memory

To enable read-only mode, set `readOnly: true` in the memory options:

```typescript
const response = await agent.generate('What do you know about me?', {
  memory: {
    thread: 'conversation-123',
    resource: 'user-alice-456',
    options: {
      readOnly: true, // Working memory is provided but cannot be updated
    },
  },
})
```

### Opt in to state signals (experimental)

By default, working memory reaches the model as part of the system message. You can opt into delivering it as a [state signal](https://mastra.ai/docs/harness/signals) instead by setting `useStateSignals: true`:

```typescript
const memory = new Memory({
  storage: new LibSQLStore({ id: 'mastra-storage', url: 'file:./mastra.db' }),
  options: {
    workingMemory: {
      enabled: true,
      template: '# User\n- name:\n- location:',
      useStateSignals: true, // experimental: deliver as state signal
    },
  },
})
```

What changes:

- **Storage is identical.** The same resource/thread `workingMemory` field is read and written.
- **The tool is the same shape, exposed under a new name.** Writes still flow through the same underlying tool; on this path it's registered as `setWorkingMemory` (instead of `updateWorkingMemory`). The rename keeps legacy strip filters from removing tool-call parts so they persist as a normal audit trail and the next model step picks the new value up automatically.
- **Delivery only.** Instead of folding into the system prompt, `Memory` auto-attaches a `WorkingMemoryStateProcessor` that emits the current working memory as a `state` signal with `stateId: 'working-memory'`.

You inherit the standard state-signal benefits: thread-scoped tracking metadata, `cacheKey` dedup so identical snapshots are only emitted once, and `contextWindow.hasSnapshot` re-injection when an older snapshot rolls out of the window.

The default (`useStateSignals: false`) keeps the existing system-message behavior unchanged. `useStateSignals` isn't supported with template working memory `version: 'vnext'`.

### Examples

- [Working memory with template](https://github.com/mastra-ai/mastra/tree/main/examples/memory-with-template)
- [Working memory with schema](https://github.com/mastra-ai/mastra/tree/main/examples/memory-with-schema)
- [Per-resource working memory](https://github.com/mastra-ai/mastra/tree/main/examples/memory-per-resource-example): Complete example showing resource-scoped memory persistence

---

## Source: Semantic Recall (`docs/memory/semantic-recall`)

Canonical URL: `https://mastra.ai/docs/memory/semantic-recall.md`

## Semantic recall

If you ask your friend what they did last weekend, they will search in their memory for events associated with "last weekend" and then tell you what they did. That's sort of like how semantic recall works in Mastra.

> **📹 Watch:** Watch [Mastra semantic recall](https://www.youtube.com/watch?v=UVZtK8cK8xQ\&pp=ygUVbWFzdHJhIHdvcmtpbmcgbWVtb3J5) to see how agents retrieve relevant messages from past conversations.

### How semantic recall works

Semantic recall is RAG-based search that helps agents maintain context across longer interactions when messages are no longer within [recent message history](https://mastra.ai/docs/memory/message-history).

It uses vector embeddings of messages for similarity search and integrates with vector stores, plus has configurable context windows around retrieved messages.

When it's enabled, new messages are used to query a vector DB for semantically similar messages.

After getting a response from the LLM, all new messages (user, assistant, and tool calls/results) are inserted into the vector DB to be recalled in later interactions.

### Quickstart

Semantic recall is disabled by default. To enable it, set `semanticRecall: true` in `options` and provide a `vector` store and an `embedder`. A store that generates embeddings itself, such as MongoDB with Automated Embedding, works without one. See [Server-side embeddings](#server-side-embeddings).

**LibSQL**:

```typescript
import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { LibSQLStore, LibSQLVector } from '@mastra/libsql'
import { ModelRouterEmbeddingModel } from '@mastra/core/llm'

const agent = new Agent({
  id: 'support-agent',
  name: 'SupportAgent',
  instructions: 'You are a helpful support agent.',
  model: 'openai/gpt-5.6-sol',
  memory: new Memory({
    storage: new LibSQLStore({
      id: 'agent-storage',
      url: 'file:./local.db',
    }),
    vector: new LibSQLVector({
      id: 'agent-vector',
      url: 'file:./local.db',
    }),
    embedder: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
    options: {
      semanticRecall: true,
    },
  }),
})
```

**MongoDB**:

```typescript
import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { MongoDBStore, MongoDBVector } from '@mastra/mongodb'
import { ModelRouterEmbeddingModel } from '@mastra/core/llm'

const agent = new Agent({
  id: 'support-agent',
  name: 'SupportAgent',
  instructions: 'You are a helpful support agent.',
  model: 'openai/gpt-5.6-sol',
  memory: new Memory({
    storage: new MongoDBStore({
      id: 'agent-storage',
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    }),
    vector: new MongoDBVector({
      id: 'agent-vector',
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    }),
    embedder: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
    options: {
      semanticRecall: true,
    },
  }),
})
```

### Using the `recall()` method

While `listMessages` retrieves messages by thread ID with basic pagination, [`recall()`](https://mastra.ai/reference/memory/recall) adds support for **semantic search**. When you need to find messages by meaning rather than recency, use `recall()` with a `vectorSearchString`:

```typescript
const memory = await agent.getMemory()

// Basic recall - similar to listMessages
const { messages } = await memory!.recall({
  threadId: 'thread-123',
  perPage: 50,
})

// Semantic recall - find messages by meaning
const { messages: relevantMessages } = await memory!.recall({
  threadId: 'thread-123',
  vectorSearchString: 'What did we discuss about the project deadline?',
  threadConfig: {
    semanticRecall: true,
  },
})
```

### Storage configuration

Semantic recall relies on a [storage and vector db](https://mastra.ai/reference/memory/memory-class) to store messages and their embeddings.

```ts
import { Memory } from '@mastra/memory'
import { Agent } from '@mastra/core/agent'
import { LibSQLStore, LibSQLVector } from '@mastra/libsql'

const agent = new Agent({
  memory: new Memory({
    // this is the default storage db if omitted
    storage: new LibSQLStore({
      id: 'agent-storage',
      url: 'file:./local.db',
    }),
    // this is the default vector db if omitted
    vector: new LibSQLVector({
      id: 'agent-vector',
      url: 'file:./local.db',
    }),
    options: {
      semanticRecall: true,
    },
  }),
})
```

Each vector store page below includes installation instructions, configuration parameters, and usage examples:

- [Astra](https://mastra.ai/reference/vectors/astra)
- [Chroma](https://mastra.ai/reference/vectors/chroma)
- [Cloudflare Vectorize](https://mastra.ai/reference/vectors/vectorize)
- [Convex](https://mastra.ai/reference/vectors/convex)
- [Couchbase](https://mastra.ai/reference/vectors/couchbase)
- [DuckDB](https://mastra.ai/reference/vectors/duckdb)
- [Elasticsearch](https://mastra.ai/reference/vectors/elasticsearch)
- [LanceDB](https://mastra.ai/reference/vectors/lance)
- [libSQL](https://mastra.ai/reference/vectors/libsql)
- [MongoDB](https://mastra.ai/reference/vectors/mongodb)
- [OpenSearch](https://mastra.ai/reference/vectors/opensearch)
- [OracleDB](https://mastra.ai/reference/vectors/oracledb)
- [Pinecone](https://mastra.ai/reference/vectors/pinecone)
- [PostgreSQL](https://mastra.ai/reference/vectors/pg)
- [Qdrant](https://mastra.ai/reference/vectors/qdrant)
- [S3 Vectors](https://mastra.ai/reference/vectors/s3vectors)
- [Turbopuffer](https://mastra.ai/reference/vectors/turbopuffer)
- [Upstash](https://mastra.ai/reference/vectors/upstash)

### Recall configuration

The following options control semantic recall behavior:

1. **topK**: The number of similar messages to retrieve
2. **messageRange**: The surrounding messages to include with each match
3. **scope**: Whether to search the current thread or all threads for a resource
4. **filter**: Metadata criteria that restrict search results

```typescript
const agent = new Agent({
  id: 'agent',
  memory: new Memory({
    options: {
      semanticRecall: {
        topK: 3, // Retrieve 3 similar messages
        messageRange: 2, // Include 2 messages before and after each match
        scope: 'resource', // Search all threads for this resource
        filter: { projectId: { $eq: 'project-a' } },
      },
    },
  }),
})
```

> **Note:** `scope: 'resource'` is supported by the LibSQL, OracleDB, PostgreSQL, MongoDB, and Upstash storage adapters.

#### Metadata filtering

The `filter` option restricts semantic recall results to messages with matching thread metadata.

```typescript
const agent = new Agent({
  id: 'agent',
  memory: new Memory({
    options: {
      semanticRecall: {
        scope: 'resource',
        filter: {
          projectId: { $eq: 'project-a' },
          category: { $in: ['work', 'personal'] },
        },
      },
    },
  }),
})
```

Filters match metadata stored on message embeddings when messages are saved. If thread metadata changes later, existing embeddings keep their previous metadata until those messages are saved or indexed again.

Supported filter operators:

- `$and`: Logical AND
- `$eq`: Equal to
- `$gt`: Greater than
- `$gte`: Greater than or equal
- `$in`: In array
- `$lt`: Less than
- `$lte`: Less than or equal
- `$ne`: Not equal to
- `$nin`: Not in array
- `$or`: Logical OR

The following example demonstrates metadata filters for common use cases:

```typescript
// Filter by project
const options = {
  semanticRecall: { filter: { projectId: { $eq: 'my-project' } } },
}

// Filter by multiple categories
const options = {
  semanticRecall: { filter: { category: { $in: ['work', 'research'] } } },
}

// Filter by project and priority
const options = {
  semanticRecall: {
    filter: {
      $and: [{ projectId: { $eq: 'project-a' } }, { priority: { $gte: 3 } }],
    },
  },
}
```

### Server-side embeddings

Some vector stores generate the embeddings themselves. With one of those, semantic recall runs without an `embedder`: the database embeds each message on write and the search string on arrival. The embedding provider stays out of your application entirely.

MongoDB does this through [Automated Embedding](https://mastra.ai/reference/vectors/mongodb): name a Voyage AI model on the vector store and leave the `embedder` out.

```typescript
import { Memory } from '@mastra/memory'
import { MongoDBStore, MongoDBVector } from '@mastra/mongodb'

const memory = new Memory({
  storage: new MongoDBStore({
    id: 'agent-storage',
    uri: process.env.MONGODB_URI,
    dbName: process.env.MONGODB_DB_NAME,
  }),
  vector: new MongoDBVector({
    id: 'agent-vector',
    uri: process.env.MONGODB_URI,
    dbName: process.env.MONGODB_DB_NAME,
    autoEmbed: { model: 'voyage-4' },
  }),
  options: {
    semanticRecall: { topK: 3, messageRange: 2 },
  },
})
```

Messages are stored as text and MongoDB embeds them, so the model choice and the vector size belong to the index rather than to your application. Recall works the same way through an agent and through [`recall()`](#using-the-recall-method).

MongoDB embeds newly written messages in the background. A message saved moments ago may not be recallable immediately.

Every other store expects your application to supply the vectors, and keeps requiring an `embedder`. Enabling semantic recall with neither an `embedder` nor a store that embeds server-side raises an error naming both options.

### Embedder configuration

Semantic recall relies on an [embedding model](https://mastra.ai/reference/memory/memory-class) to convert messages into embeddings. Mastra supports embedding models through the model router using `provider/model` strings, or you can use any [embedding model](https://sdk.vercel.ai/docs/ai-sdk-core/embeddings) compatible with the AI SDK.

#### Using the Model Router (Recommended)

The simplest way is to use a `provider/model` string with autocomplete support:

```ts
import { Memory } from '@mastra/memory'
import { Agent } from '@mastra/core/agent'
import { ModelRouterEmbeddingModel } from '@mastra/core/llm'

const agent = new Agent({
  id: 'agent',
  memory: new Memory({
    embedder: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
    options: {
      semanticRecall: true,
    },
  }),
})
```

Supported embedding models:

- **OpenAI**: `text-embedding-3-small`, `text-embedding-3-large`, `text-embedding-ada-002`
- **Google**: `gemini-embedding-001`
- **OpenRouter**: Access embedding models from multiple providers

```ts
import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { ModelRouterEmbeddingModel } from '@mastra/core/llm'

const agent = new Agent({
  id: 'agent',
  memory: new Memory({
    embedder: new ModelRouterEmbeddingModel({
      providerId: 'openrouter',
      modelId: 'openai/text-embedding-3-small',
    }),
  }),
})
```

The model router automatically handles API key detection from environment variables (`OPENAI_API_KEY`, `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`). Google models also fall back to `GOOGLE_GENERATIVE_AI_API_KEY`.

#### Using AI SDK Packages

You can also use AI SDK embedding models directly:

```ts
import { Memory } from '@mastra/memory'
import { Agent } from '@mastra/core/agent'
import { ModelRouterEmbeddingModel } from '@mastra/core/llm'

const agent = new Agent({
  id: 'agent',
  memory: new Memory({
    embedder: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
  }),
})
```

#### Using FastEmbed (local)

To use FastEmbed (a local embedding model), install `@mastra/fastembed`:

**npm**:

```bash
npm install @mastra/fastembed@latest
```

**pnpm**:

```bash
pnpm add @mastra/fastembed@latest
```

**Yarn**:

```bash
yarn add @mastra/fastembed@latest
```

**Bun**:

```bash
bun add @mastra/fastembed@latest
```

Then configure it in your memory:

```ts
import { Memory } from '@mastra/memory'
import { Agent } from '@mastra/core/agent'
import { fastembed } from '@mastra/fastembed'

const agent = new Agent({
  id: 'agent',
  memory: new Memory({
    embedder: fastembed,
  }),
})
```

FastEmbed also exposes the multilingual E5 model for non-English content. E5 is asymmetric, so it's exposed as two models: `multilingualE5LargePassage` for text you index and `multilingualE5LargeQuery` for search text.

```ts
import { Memory } from '@mastra/memory'
import { Agent } from '@mastra/core/agent'
import { fastembed } from '@mastra/fastembed'

const agent = new Agent({
  id: 'agent',
  memory: new Memory({
    embedder: fastembed.multilingualE5LargePassage,
  }),
})
```

Memory uses a single embedder for both storing and recalling messages, so pick one of the two models and use it consistently. Use the paired `multilingualE5LargeQuery` model only where you control both sides of the pipeline, such as a RAG workflow that indexes with the passage model and searches with the query model.

Multilingual E5 produces 1024-dimensional vectors. Your vector index must be created with matching dimensions, and E5 vectors can't be mixed with vectors from another embedder in the same index.

### PostgreSQL index optimization

When using PostgreSQL as your vector store, you can optimize semantic recall performance by configuring the vector index. This is particularly important for large-scale deployments with thousands of messages.

PostgreSQL supports both IVFFlat and HNSW indexes. By default, Mastra creates an IVFFlat index, but HNSW indexes typically provide better performance, especially with OpenAI embeddings which use inner product distance.

```typescript
import { Memory } from '@mastra/memory'
import { PostgresStore, PgVector } from '@mastra/pg'

const agent = new Agent({
  memory: new Memory({
    storage: new PostgresStore({
      id: 'agent-storage',
      connectionString: process.env.DATABASE_URL,
    }),
    vector: new PgVector({
      id: 'agent-vector',
      connectionString: process.env.DATABASE_URL,
    }),
    options: {
      semanticRecall: {
        topK: 5,
        messageRange: 2,
        indexConfig: {
          type: 'hnsw', // Use HNSW for better performance
          metric: 'dotproduct', // Best for OpenAI embeddings
          m: 16, // Number of bi-directional links (default: 16)
          efConstruction: 64, // Size of candidate list during construction (default: 64)
        },
      },
    },
  }),
})
```

For detailed information about index configuration options and performance tuning, see the [PgVector configuration guide](https://mastra.ai/reference/vectors/pg).

### Disable semantic recall

Semantic recall is disabled by default (`semanticRecall: false`). Each call adds latency because new messages are converted into embeddings and used to query a vector database before the LLM receives them.

Keep semantic recall disabled when:

- Message history provides sufficient context for the current conversation.
- You're building performance-sensitive applications, like realtime two-way audio, where embedding and vector query latency is noticeable.

### Viewing recalled messages

When tracing is enabled, any messages retrieved via semantic recall will appear in the agent's trace output, alongside recent message history (if configured).

---

## Source: Memory Processors (`docs/memory/memory-processors`)

Canonical URL: `https://mastra.ai/docs/memory/memory-processors.md`

## Memory processors

Memory processors transform and filter messages as they pass through an agent with memory enabled. They manage context window limits and remove unnecessary content, plus optimize the information sent to the language model.

When memory is enabled on an agent, Mastra adds memory processors to the agent's processor pipeline. These processors retrieve message history and working memory, plus semantically relevant messages, then persist new messages after the model responds.

Memory processors are [processors](https://mastra.ai/docs/agents/processors) that operate specifically on memory-related messages and state.

### Built-in memory processors

Mastra automatically adds these processors when memory is enabled:

#### `MemoryInputFilter`

Trims client-echoed history before memory loaders run. For an existing thread, it keeps only the current user turn or new tool results. For an empty thread, it keeps the full initial input and removes provider item metadata from assistant parts that could refer to items that don't exist in storage.

This processor runs first so `MessageHistory`, `SemanticRecall`, and Observational Memory receive only the new input they need.

#### `MessageHistory`

Retrieves message history and persists new messages.

**When you configure:**

```typescript
memory: new Memory({
  lastMessages: 10,
})
```

**Mastra internally:**

1. Creates a `MessageHistory` processor with `limit: 10`
2. Adds it to the agent's input processors (runs before the LLM)
3. Adds it to the agent's output processors (runs after the LLM)

**What it does:**

- **Input**: Fetches the last 10 messages from storage and prepends them to the conversation
- **Output**: Persists new messages to storage after the model responds

**Example:**

```typescript
import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { LibSQLStore } from '@mastra/libsql'
import { openai } from '@ai-sdk/openai'

const agent = new Agent({
  id: 'test-agent',
  name: 'Test Agent',
  instructions: 'You are a helpful assistant',
  model: 'openai/gpt-5.6-sol',
  memory: new Memory({
    storage: new LibSQLStore({
      id: 'memory-store',
      url: 'file:memory.db',
    }),
    lastMessages: 10, // MessageHistory processor automatically added
  }),
})
```

#### `SemanticRecall`

Retrieves semantically relevant messages based on the current input and creates embeddings for new messages.

**When you configure:**

```typescript
memory: new Memory({
  semanticRecall: { enabled: true },
  vector: myVectorStore,
  embedder: myEmbedder,
})
```

**Mastra internally:**

1. Creates a `SemanticRecall` processor
2. Adds it to the agent's input processors (runs before the LLM)
3. Adds it to the agent's output processors (runs after the LLM)
4. Requires both a vector store and embedder to be configured

**What it does:**

- **Input**: Performs vector similarity search to find relevant past messages and prepends them to the conversation
- **Output**: Creates embeddings for new messages and stores them in the vector store for future retrieval

**Example:**

```typescript
import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { LibSQLStore } from '@mastra/libsql'
import { PineconeVector } from '@mastra/pinecone'
import { ModelRouterEmbeddingModel } from '@mastra/core/llm'
import { openai } from '@ai-sdk/openai'

const agent = new Agent({
  name: 'semantic-agent',
  instructions: 'You are a helpful assistant with semantic memory',
  model: 'openai/gpt-5.6-sol',
  memory: new Memory({
    storage: new LibSQLStore({
      id: 'memory-store',
      url: 'file:memory.db',
    }),
    vector: new PineconeVector({
      id: 'memory-vector',
      apiKey: process.env.PINECONE_API_KEY!,
    }),
    embedder: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
    semanticRecall: { enabled: true }, // SemanticRecall processor automatically added
  }),
})
```

#### `WorkingMemory`

Manages working memory state across conversations.

**When you configure:**

```typescript
memory: new Memory({
  workingMemory: { enabled: true },
})
```

**Mastra internally:**

1. Creates a `WorkingMemory` processor
2. Adds it to the agent's input processors (runs before the LLM)
3. Requires a storage adapter to be configured

**What it does:**

- **Input**: Retrieves working memory state for the current thread and prepends it to the conversation
- **Output**: No output processing

**Example:**

```typescript
import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { LibSQLStore } from '@mastra/libsql'
import { openai } from '@ai-sdk/openai'

const agent = new Agent({
  name: 'working-memory-agent',
  instructions: 'You are an assistant with working memory',
  model: 'openai/gpt-5.6-sol',
  memory: new Memory({
    storage: new LibSQLStore({
      id: 'memory-store',
      url: 'file:memory.db',
    }),
    workingMemory: { enabled: true }, // WorkingMemory processor automatically added
  }),
})
```

### Manual control and deduplication

If you manually add a memory processor to `inputProcessors` or `outputProcessors`, Mastra **won't** automatically add it. Manual configuration gives you full control over processor ordering:

```typescript
import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { MessageHistory } from '@mastra/core/processors'
import { TokenLimiter } from '@mastra/core/processors'
import { LibSQLStore } from '@mastra/libsql'
import { openai } from '@ai-sdk/openai'

// Custom MessageHistory with different configuration
const customMessageHistory = new MessageHistory({
  storage: new LibSQLStore({ id: 'memory-store', url: 'file:memory.db' }),
  lastMessages: 20,
})

const agent = new Agent({
  name: 'custom-memory-agent',
  instructions: 'You are a helpful assistant',
  model: 'openai/gpt-5.6-sol',
  memory: new Memory({
    storage: new LibSQLStore({ id: 'memory-store', url: 'file:memory.db' }),
    lastMessages: 10, // This would normally add MessageHistory(10)
  }),
  inputProcessors: [
    customMessageHistory, // Your custom one is used instead
    new TokenLimiter({ limit: 4000 }), // Runs after your custom MessageHistory
  ],
})
```

### Processor execution order

Understanding the execution order is important when combining guardrails with memory:

#### Input Processors

```text
[Memory Processors] → [Your inputProcessors]
```

1. **Memory processors run FIRST**: `MemoryInputFilter`, then `WorkingMemory`, `MessageHistory`, and `SemanticRecall`
2. **Your input processors run AFTER**: guardrails, filters, validators

As a result, memory loads message history before your processors can validate or filter the input.

#### Output Processors

```text
[Your outputProcessors] → [Memory Processors]
```

1. **Your output processors run FIRST**: guardrails, filters, validators
2. **Memory processors run AFTER**: `SemanticRecall` (embeddings), `MessageHistory` (persistence)

This ordering is designed to be **safe by default**: if your output guardrail calls `abort()`, the memory processors never run and **no messages are saved**.

### Guardrails and memory

The default execution order provides safe guardrail behavior:

#### Output guardrails (recommended)

Output guardrails run **before** memory processors save messages. If a guardrail aborts:

- The tripwire is triggered
- Memory processors are skipped
- **No messages are persisted to storage**

```typescript
import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { openai } from '@ai-sdk/openai'

// Output guardrail that blocks inappropriate content
const contentBlocker = {
  id: 'content-blocker',
  processOutputResult: async ({ messages, abort }) => {
    const hasInappropriateContent = messages.some(msg => containsBadContent(msg))
    if (hasInappropriateContent) {
      abort('Content blocked by guardrail')
    }
    return messages
  },
}

const agent = new Agent({
  id: 'safe-agent',
  name: 'safe-agent',
  instructions: 'You are a helpful assistant',
  model: 'openai/gpt-5.6-sol',
  memory: new Memory({ lastMessages: 10 }),
  // Your guardrail runs BEFORE memory saves
  outputProcessors: [contentBlocker],
})

// If the guardrail aborts, nothing is saved to memory
const result = await agent.generate('Hello')
if (result.tripwire) {
  console.log('Blocked:', result.tripwire.reason)
  // Memory is empty - no messages were persisted
}
```

#### Input guardrails

Input guardrails run **after** memory processors load history. If a guardrail aborts:

- The tripwire is triggered
- The LLM is never called
- Output processors (including memory persistence) are skipped
- **No messages are persisted to storage**

```typescript
// Input guardrail that validates user input
const inputValidator = {
  id: 'input-validator',
  processInput: async ({ messages, abort }) => {
    const lastUserMessage = messages.findLast(m => m.role === 'user')
    if (isInvalidInput(lastUserMessage)) {
      abort('Invalid input detected')
    }
    return messages
  },
}

const agent = new Agent({
  id: 'validated-agent',
  name: 'validated-agent',
  instructions: 'You are a helpful assistant',
  model: 'openai/gpt-5.6-sol',
  memory: new Memory({ lastMessages: 10 }),
  // Your guardrail runs AFTER memory loads history
  inputProcessors: [inputValidator],
})
```

#### Summary

| Guardrail Type | When it runs               | If it aborts                  |
| -------------- | -------------------------- | ----------------------------- |
| Input          | After memory loads history | LLM not called, nothing saved |
| Output         | Before memory saves        | Nothing saved to storage      |

Both scenarios are safe - guardrails prevent inappropriate content from being persisted to memory

### Handling large attachments

Some storage providers enforce record size limits that base64-encoded file attachments can exceed:

| Provider                                                                | Record size limit |
| ----------------------------------------------------------------------- | ----------------- |
| [DynamoDB](https://mastra.ai/integrations/databases/dynamodb)           | 400 KB            |
| [Convex](https://mastra.ai/integrations/databases/convex)               | 1 MiB             |
| [Cloudflare D1](https://mastra.ai/integrations/databases/cloudflare-d1) | 1 MiB             |

PostgreSQL, MongoDB, and libSQL have higher limits and are usually unaffected.

Use an input processor to upload attachments to external storage, then replace them with URL references before messages are persisted.

```typescript
import type { Processor } from '@mastra/core/processors'
import type { MastraDBMessage } from '@mastra/core/memory'

export class AttachmentUploader implements Processor {
  id = 'attachment-uploader'

  async processInput({ messages }: { messages: MastraDBMessage[] }) {
    return Promise.all(messages.map(message => this.processMessage(message)))
  }

  async processMessage(message: MastraDBMessage) {
    const attachments = message.content.experimental_attachments
    if (!attachments?.length) return message

    const uploaded = await Promise.all(
      attachments.map(async attachment => {
        if (!attachment.url?.startsWith('data:')) return attachment

        const url = await this.upload(attachment.url, attachment.contentType)
        return { ...attachment, url }
      }),
    )

    return { ...message, content: { ...message.content, experimental_attachments: uploaded } }
  }

  async upload(dataUri: string, contentType?: string): Promise<string> {
    const base64 = dataUri.split(',')[1]
    const buffer = Buffer.from(base64, 'base64')

    throw new Error('Implement upload() with your storage provider')
  }
}
```

Use the processor with your agent:

```typescript
import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { AttachmentUploader } from '../processors/attachment-uploader'

export const supportAgent = new Agent({
  id: 'support-agent',
  name: 'Support agent',
  instructions: 'Answer customer support questions.',
  model: 'openai/gpt-5.6-sol',
  memory: new Memory({ lastMessages: 10 }),
  inputProcessors: [new AttachmentUploader()],
})
```

### Related documentation

- [Processors](https://mastra.ai/docs/agents/processors): General processor concepts and custom processor creation
- [Guardrails](https://mastra.ai/docs/agents/guardrails): Security and validation processors
- [Memory Overview](https://mastra.ai/docs/memory/overview): Memory types and configuration

When creating custom processors avoid mutating the input `messages` array or its objects directly.

---

## Source: Multi-User Threads (`docs/memory/multi-user-threads`)

Canonical URL: `https://mastra.ai/docs/memory/multi-user-threads.md`

## Multi-user threads

A single Mastra thread can be shared by multiple users, each with their own name and functional role. You carry speaker identity in the message body so the agent can tell users apart while reading from a single shared thread.

### When to use multi-user threads

Use multi-user threads when several people collaborate on the same subject through one agent:

- Collaborative documents with editors, reviewers, and approvers
- Group chats where one assistant serves many participants
- Multi-stakeholder reviews where different roles have different authority

### Share one `resourceId` across all participants

A thread belongs to exactly one `resourceId`, so all participants on a shared thread need to pass the same value. Instead of using a user id (the default for single-user apps), key `resourceId` on the conversation itself, for example `doc_${docId}` for a shared document, or `room_${roomId}` for a group chat. With everyone pointing at the same `resourceId`, they read and write the same history.

### Tag each user message with the speaker's identity

The model needs to know who's talking on every turn. Since the message body is the one place that survives into history and back into context, wrap each user message in a small `<turn>` tag with the speaker's id, name, and role. The tag stays attached to the message, so when prior turns are recalled the model still sees who said what.

Build the tag with a small helper. The example below is one way to do it, copy it into your project and adapt it to your shape of user data:

```typescript
export type Speaker = {
  id: string
  name: string
  role: string
}

function escapeAttr(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function asUserTurn(speaker: Speaker, text: string) {
  const id = escapeAttr(speaker.id)
  const name = escapeAttr(speaker.name)
  const role = escapeAttr(speaker.role)
  return {
    role: 'user' as const,
    content: `<turn author_id="${id}" author_name="${name}" functional_role="${role}">
${text}
</turn>`,
  }
}
```

Teach the agent how to read the `<turn>` tag in its instructions. The agent must have `memory` configured so it can be called with a `thread` and `resource`:

```typescript
import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { LibSQLStore } from '@mastra/libsql'

const memory = new Memory({
  storage: new LibSQLStore({ id: 'collab-storage', url: 'file:./collab.db' }),
  options: {
    lastMessages: 20,
  },
})

export const collabAgent = new Agent({
  id: 'collab',
  name: 'CollabAgent',
  model: 'openai/gpt-5-mini',
  memory,
  instructions: `
You are a collaborative document assistant. Multiple users talk to you in the SAME thread.

Every user message is wrapped in a <turn> tag carrying the user's identity:

  <turn author_id="u_alice" author_name="Alice" functional_role="editor">
  ...message text...
  </turn>

Rules:
1. Address users by their author_name.
2. Respect functional_role: editors propose changes, reviewers approve.
3. When attributing past statements, read author_name from the surrounding <turn> tag.
4. Do not echo the <turn> tags back at users.
  `.trim(),
})
```

Call the agent with the wrapped message. Every participant shares the same `thread` and `resource`:

```typescript
import { asUserTurn } from './identity'

const docResourceId = 'doc_42'
const docThreadId = 'doc_42'

const alice = { id: 'u_alice', name: 'Alice', role: 'editor' }
const bob = { id: 'u_bob', name: 'Bob', role: 'reviewer' }

await collabAgent.generate([asUserTurn(alice, 'My favorite color is teal.')], {
  memory: { thread: docThreadId, resource: docResourceId },
})

await collabAgent.generate([asUserTurn(bob, 'I want QA sign-off before publish.')], {
  memory: { thread: docThreadId, resource: docResourceId },
})
```

The `<turn>` tag persists in the message body, so when history is recalled on later turns the model still sees who said what.

### Combining with memory layers

The user-tagging pattern composes with every memory layer. Pick the layer based on how long the conversation needs to remember per-user facts:

- **Short conversations** (a single session, or a thread small enough to fit in `lastMessages`), or when you need a verbatim record of who said what: use [message history alone](#message-history-alone). The user tags in history are enough. No extra memory layer needed.
- **Long-running threads** (conversations that outgrow `lastMessages`, where you need per-user facts to survive history eviction): use [observational memory](#with-observational-memory-recommended).
- **Need a structured participants list, or your storage adapter doesn't support OM** (OM requires LibSQL, PG, or MongoDB): use [working memory](#with-working-memory).

We recommend using either observational memory or working memory because they cover overlapping needs. Running both adds latency and token cost without much benefit.

#### Message history alone

For short conversations, or when you need a verbatim record of who said what, the user tags in history are enough. `lastMessages` brings prior turns back into context with their attribution intact:

```typescript
import { Memory } from '@mastra/memory'
import { LibSQLStore } from '@mastra/libsql'

const memory = new Memory({
  storage: new LibSQLStore({ id: 'collab-storage', url: 'file:./collab.db' }),
  options: {
    lastMessages: 20,
  },
})
```

The model reads identity from the `<turn>` tag on the current message and from prior tagged messages brought back through `lastMessages`.

#### With Observational Memory (recommended)

[Observational Memory](https://mastra.ai/docs/memory/observational-memory) (OM) extracts per-user facts into a background log without burning the agent's tool budget. The default Observer model reads `<turn>` tags natively and produces attribution like `Alice stated her favorite color is teal.` and `Bob asked for QA sign-off before publish.`

Prefer OM over working memory for multi-user threads when your storage supports it. OM extracts facts automatically, scales to any number of participants, and doesn't need template upkeep. Enable it with no overrides:

```typescript
import { Memory } from '@mastra/memory'
import { LibSQLStore } from '@mastra/libsql'

const memory = new Memory({
  storage: new LibSQLStore({ id: 'collab-storage', url: 'file:./collab.db' }),
  options: {
    lastMessages: 20,
    observationalMemory: true,
  },
})
```

OM requires a storage adapter that supports it: `@mastra/libsql`, `@mastra/pg`, `@mastra/mongodb`, `@mastra/mysql`, `@mastra/convex`, or `@mastra/oracledb`.

> **Note:** If you switch the Observer to a less capable model and see facts attributed to a generic `User` instead of individual participants, use [`observation.instruction`](https://mastra.ai/reference/memory/observational-memory) to explain how to interpret the `<turn>` tag.

#### With working memory

Use working memory when OM isn't an option, for example, when your storage adapter doesn't support OM, or when you need a structured, deterministic participants list the agent can read and write on every turn.

The default [working memory](https://mastra.ai/docs/memory/working-memory) template assumes one user per thread ("First Name", "Last Name", etc.). For multi-user threads, provide a template with a participants list:

```typescript
import { Memory } from '@mastra/memory'
import { LibSQLStore } from '@mastra/libsql'

const memory = new Memory({
  storage: new LibSQLStore({ id: 'collab-storage', url: 'file:./collab.db' }),
  options: {
    lastMessages: 20,
    workingMemory: {
      enabled: true,
      scope: 'thread',
      template: `# Document Collaboration State

## Participants
<!-- One entry per known collaborator. Use author_id as the stable key. -->
<!-- - **<author_name>** (<author_id>, <functional_role>): <their position> -->

## Open Questions

## Decisions
`,
    },
  },
})
```

Set `scope: 'thread'` so the participants list belongs to the document, not to any individual user. Add one instruction telling the agent to append new participants to the list whenever a new `author_id` shows up in a `<turn>`.

For more on templates, see [Custom templates](https://mastra.ai/docs/memory/working-memory).

### Security

Set the `speaker` from your authenticated request context, never from the request body. If a client can choose its own `author_id`, one user can impersonate another. Use [Request Context](https://mastra.ai/docs/server/request-context) to read the verified user from your auth layer and build the `<turn>` tag on the server before calling the agent.

### Related

- [Working memory](https://mastra.ai/docs/memory/working-memory)
- [Observational memory](https://mastra.ai/docs/memory/observational-memory)
- [Share memory between agents](https://mastra.ai/docs/memory/overview)
- [`Memory` reference](https://mastra.ai/reference/memory/memory-class)
