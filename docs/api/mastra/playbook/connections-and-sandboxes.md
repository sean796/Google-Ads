---
title: "Mastra Playbook: MCP, Connections, Sandboxes & Channels"
slug: mastra/playbook/connections-and-sandboxes
section: Mastra
order: 110
related:
  - mastra/overview
  - mastra/playbook-index
  - mastra/workflows-and-steps
  - mastra/agents-and-models
---

<!-- manual -->

Scraped canonical Mastra documentation for **Mastra Playbook: MCP, Connections, Sandboxes & Channels** (13 upstream pages consolidated for NEO Pulse coding agents).

## Included Pages

- **Channels** (`docs/channels` - source: `https://mastra.ai/docs/channels.md`)
- **Sandboxes** (`docs/sandbox/overview` - source: `https://mastra.ai/docs/sandbox/overview.md`)
- **Filesystem** (`docs/sandbox/filesystem` - source: `https://mastra.ai/docs/sandbox/filesystem.md`)
- **Search** (`docs/sandbox/search` - source: `https://mastra.ai/docs/sandbox/search.md`)
- **Skills** (`docs/sandbox/skills` - source: `https://mastra.ai/docs/sandbox/skills.md`)
- **Computer** (`docs/sandbox/computer` - source: `https://mastra.ai/docs/sandbox/computer.md`)
- **LSP** (`docs/sandbox/lsp` - source: `https://mastra.ai/docs/sandbox/lsp.md`)
- **Browser** (`docs/browser` - source: `https://mastra.ai/docs/browser.md`)
- **Connections** (`docs/connections/overview` - source: `https://mastra.ai/docs/connections/overview.md`)
- **MCP** (`docs/connections/mcp` - source: `https://mastra.ai/docs/connections/mcp.md`)
- **A2A** (`docs/connections/a2a` - source: `https://mastra.ai/docs/connections/a2a.md`)
- **ACP** (`docs/connections/acp` - source: `https://mastra.ai/docs/connections/acp.md`)
- **SDK Agents** (`docs/connections/sdk-agents` - source: `https://mastra.ai/docs/connections/sdk-agents.md`)

---

## Source: Channels (`docs/channels`)

Canonical URL: `https://mastra.ai/docs/channels.md`

## Channels

**Added in:** `@mastra/core@1.22.0`

Channels connect agents to messaging and collaboration platforms like Slack, Microsoft Teams, Discord, Telegram, WhatsApp, GitHub, and Linear. When a user sends a message or comment on a platform, the agent receives it and processes it through the normal agent pipeline, plus streams the response back to the conversation. Mastra uses [Chat SDK](https://chat-sdk.dev/) for this channel layer.

Start with the page for your platform:

- [Discord](https://mastra.ai/integrations/channels/discord)
- [GitHub](https://mastra.ai/integrations/channels/github)
- [iMessage](https://mastra.ai/integrations/channels/imessage)
- [Microsoft Teams](https://mastra.ai/integrations/channels/teams)
- [Slack](https://mastra.ai/integrations/channels/slack)
- [Telegram](https://mastra.ai/integrations/channels/telegram)
- [WhatsApp](https://mastra.ai/integrations/channels/whatsapp)

[Other adapters](#other-adapters) lists additional platforms. Mastra channels work with compatible [Chat SDK adapters](https://chat-sdk.dev/adapters) beyond the platforms listed here, and the same Mastra configuration pattern applies across adapters.

### When to use channels

Use channels when an agent needs to:

- Meet users where they already talk or work.
- Respond in chat platforms like Slack, Microsoft Teams, Discord, Telegram, and WhatsApp.
- Support multiplayer agents where several people interact with the same agent in a shared channel or thread.
- Integrate with collaboration workflows like GitHub issues, pull request threads, and Linear comments.

### Configure channels faster with Mastra Connect

If you don't want to configure a bot or app for each channel and maintain the credentials yourself, you can use [Mastra Connect](https://mastra.ai/docs/mastra-platform/connect/channels). It manages credentials for you, simplifying channel setup and maintenance.

### Configure an agent

Channels use Chat SDK adapters and follow the same Mastra-side pattern: create a channel adapter and add it to the agent.

```typescript
import { Agent } from '@mastra/core/agent'
import { createSlackAdapter } from '@chat-adapter/slack'

export const yourAgent = new Agent({
  id: 'your-agent',
  name: 'Your Agent',
  instructions: 'You are a helpful assistant.',
  model: 'openai/gpt-5.6-sol',
  channels: {
    adapters: {
      slack: createSlackAdapter(),
    },
  },
})
```

> **Note:** Channel adapters require provider-specific environment variables for credentials and request verification, such as bot tokens, signing secrets, app IDs, and webhook verification tokens. Check the guide for your platform or the [Chat SDK adapter catalog](https://chat-sdk.dev/adapters) for the exact variable names.

We recommend configuring [storage](https://mastra.ai/docs/storage) for channels. Storage preserves channel and memory state across restarts, including thread subscriptions and tool approvals:

```typescript
import { Mastra } from '@mastra/core'
import { LibSQLStore } from '@mastra/libsql'
import { yourAgent } from './agents/your-agent'

export const mastra = new Mastra({
  agents: { yourAgent },
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: process.env.DATABASE_URL,
  }),
})
```

### Webhook routes

Platforms send channel activity to Mastra through webhooks. A webhook is an HTTP endpoint that the platform calls when something happens, such as a new message, a mention, or a user selecting "Approve" on an interactive tool approval card. The webhook delivers the message to your agent for processing, and the agent responds in the same channel.

Mastra registers a webhook route for each configured adapter and handles the request for you:

```text
/api/agents/<AGENT_ID>/channels/<PLATFORM>/webhook
```

For example, a Slack adapter on an agent with the `your-agent` ID uses:

```text
/api/agents/your-agent/channels/slack/webhook
```

Point the platform's webhook, event, or interactions URL to this path. Follow the guide for your platform or the [Chat SDK docs](https://chat-sdk.dev/adapters). The webhook acknowledges the request before the agent finishes responding. See [Error handling and delivery](#error-handling-and-delivery) for what happens when verification or a handler fails.

During local development, platform webhooks need a public URL to reach your local server. Use a tunnel like [cloudflared](https://github.com/cloudflare/cloudflared) or [ngrok](https://ngrok.com/) to expose your server, `localhost:4111` by default:

**npm**:

```bash
npx cloudflared tunnel --url http://localhost:4111
```

**pnpm**:

```bash
pnpm dlx cloudflared tunnel --url http://localhost:4111
```

**Yarn**:

```bash
yarn dlx cloudflared tunnel --url http://localhost:4111
```

**Bun**:

```bash
bun x cloudflared tunnel --url http://localhost:4111
```

Use the generated public URL as the base URL for webhook paths, for example `https://abc123.trycloudflare.com/api/agents/your-agent/channels/slack/webhook`.

> **Note:** Tunnel URLs are for local development. After you deploy the Mastra server, update the platform's webhook, event, or interactions URL to your production URL.

### Thread context

When a user mentions the agent mid-conversation in a channel thread, the agent may not have prior context. On the first mention, Mastra fetches earlier messages from the platform and saves them into the agent's memory thread before the mention runs.

1. On the first mention in a thread, the agent fetches the thread's first message and the most recent messages before the mention. `maxMessages` (default `10`) sets the window: the first message plus up to `maxMessages - 1` recent messages. When messages fall between the two, a `[… N earlier Slack messages omitted]` marker (the platform name matches the channel) is saved in their place.
2. Each fetched message is saved to memory as its own user message, attributed to its author and platform message id and carrying its attachments, with a `source: 'thread-history'` attribute. The mention itself then dispatches as a normal message.
3. After responding, the agent subscribes to the thread and has full history through Mastra memory.
4. Subsequent messages in that thread don't re-fetch from the platform.

Set `threadContext: { maxMessages: 0 }` to disable this behavior. This only applies to non-direct message threads.

Agents without memory can't save the rows, so they receive the same history as context text inside the mention instead. The same fallback applies when the write to memory fails.

Memory's `lastMessages` option limits how many messages reach the prompt. Its default of `10` trims the first message and the omitted marker when `maxMessages` is `10`, so set `lastMessages` to at least `maxMessages + 1`.

Mastra also adds a short system message that tells the agent which channel and platform the request came from, such as whether the message came from a direct message or public channel. Set `threadContext: { addSystemMessage: false }` to skip it.

### Tool approval

Tools with `requireApproval: true` render as interactive cards with Approve and Deny buttons:

```typescript
import { promises as fs } from 'node:fs'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

export const deleteFile = createTool({
  id: 'delete-file',
  description: 'Delete a file from the system',
  inputSchema: z.object({
    path: z.string().describe('Path to the file to delete'),
  }),
  requireApproval: true,
  execute: async ({ path }) => {
    await fs.unlink(path)
    return { deleted: path }
  },
})
```

When the agent calls this tool, users see a card with the tool name, arguments, and Approve and Deny actions. The tool only executes after approval.

Set `toolDisplay: 'text'` on an adapter to render tool calls as plain text instead of interactive cards. In `'hidden'` mode, `autoResumeSuspendedTools` can resume data-bearing `suspend()` flows when a later user message arrives on the same thread. This requires memory. Hidden mode only suppresses approval buttons. It doesn't turn a message into consent. Tools that require approval remain suspended until an explicit approval or decline is submitted through a UI or API action.

#### Custom action handling

Use `handlers.onAction` to handle button clicks and select changes from cards you post yourself. The handler is called with the Chat SDK action event and the default handler, plus the same `ctx` the other channel handlers receive. Values you set on `ctx.requestContext` before delegating carry through to the resumed tool call. The default handler processes the built-in Approve and Deny buttons and ignores every other action ID, so call it for events you don't handle to keep tool approval working:

```typescript
channels: {
  adapters: {
    slack: createSlackAdapter(),
  },
  handlers: {
    onAction: async (event, defaultHandler, ctx) => {
      if (event.actionId === 'retry') {
        await event.thread?.post('Retrying...')
        return
      }
      await defaultHandler()
    },
  },
},
```

Setting `onAction: false` disables action handling entirely, including the built-in tool approval buttons. To register more Chat SDK handlers after the channels start, use `agent.channels.sdk`.

### Reply formatting

Agent replies post as markdown by default. Platforms with native markdown rendering, such as Slack, render bold text, links, and tables directly. Other platforms convert the markdown to their own format. Agents write standard markdown and it renders correctly everywhere, matching how the same reply renders in Studio.

Set `textFormat: 'plain'` on an adapter to post replies as literal plain text instead:

```typescript
channels: {
  adapters: {
    slack: {
      adapter: createSlackAdapter(),
      textFormat: 'plain',
    },
  },
},
```

Use this escape hatch if your agent is prompted to emit a platform-specific dialect, such as Slack mrkdwn, instead of standard markdown. If you added such prompt instructions to work around markdown rendering literally, remove them instead. The default now renders standard markdown natively. `textFormat` affects final reply text only. Tool cards, error messages, and natively streamed text are unaffected.

### Multi-user awareness

In group conversations, Mastra prefixes each message with the sender's name and platform ID so the agent can distinguish between speakers:

```text
[Alice (@U123ABC)]: Can you help me with this?
[Bob (@U456DEF)]: I have a question too.
```

### Per-message Signal metadata

Use `signalMetadata` in a custom Channel handler to attach structured context to one inbound message. The metadata follows the message when it starts an idle run or joins an active run.

The following example attaches registered file IDs before calling the default handler:

```typescript
import { Agent } from '@mastra/core/agent'
import { createSlackAdapter } from '@chat-adapter/slack'

export const yourAgent = new Agent({
  id: 'your-agent',
  name: 'Your Agent',
  instructions: 'You are a helpful assistant.',
  model: 'openai/gpt-5.6-sol',
  channels: {
    adapters: {
      slack: createSlackAdapter(),
    },
    handlers: {
      onDirectMessage: async (thread, message, defaultHandler, ctx) => {
        ctx.signalMetadata.attachmentIds = ['file-1']
        await defaultHandler(thread, message)
      },
    },
  },
})
```

Add only JSON-serializable, non-sensitive values. Signal metadata may be stored in memory or sent through a shared publish-subscribe transport. It isn't added to the model prompt.

Use `requestContext` for run-scoped configuration, such as credentials for a message that starts a run. Use `signalMetadata` for context that must stay attached to one message, including messages delivered to an active run.

### Error handling and delivery

A channel webhook acknowledges the platform before the agent finishes, so a `200` response means "received", not "answered". Before that acknowledgment, the adapter rejects bad requests synchronously (`401` for failed verification, `400` for an unparseable body, `503` for transient state failures) and the platform redelivers on non-`2xx` responses per its own policy. After the `200`, the platform never retries and Mastra owns errors. The default handler catches agent-run failures and posts an error message to the thread (customize it with `formatError`, which defaults to `❌ Error: {message}`). A custom handler that throws for a single message is only logged by Chat SDK, so nothing is posted or retried (see [Batched messages](#batched-messages) for multi-sender batches). Catch failures in custom handlers yourself:

```typescript
channels: {
  adapters: {
    slack: createSlackAdapter(),
  },
  handlers: {
    onDirectMessage: async (thread, message, defaultHandler, ctx) => {
      try {
        ctx.signalMetadata.ticketId = await lookupTicket(message)
      } catch (error) {
        ctx.mastra?.getLogger().error('Ticket lookup failed', { error })
        await thread.post('Something went wrong looking up your ticket. Try again in a moment.')
        return
      }
      await defaultHandler(thread, message)
    },
  },
},
```

Platform retries sometimes deliver an event more than once. Adapters use channel state for deduplication, which [storage](https://mastra.ai/docs/storage) can preserve across restarts. Because this protection is best effort, custom-handler side effects should be idempotent so duplicate delivery can't repeat work such as ticket creation.

#### Batched messages

When a `chatOptions.concurrency` strategy (`burst`, `debounce`, or `queue`) batches several messages into one dispatch, Mastra splits the batch into one turn per sender: consecutive messages from the same sender form one turn, oldest first. Your handler runs once per turn with its own `ctx.requestContext`, `ctx.signalMetadata`, and `ctx.skipped` (that turn's earlier messages), so authorization and context apply to every sender. Await `defaultHandler` inside your handler, otherwise senders' turns can overlap. A handler that throws for one turn is logged, the remaining turns still run, and the first error is re-thrown afterwards. In a batch routed to `onMention` because one message mentions the bot, other senders' non-mention messages also reach `onMention` with `message.isMention` set to `false`.

### Multimodal content

Models like Gemini can process images, video, and audio natively. Combine `inlineMedia` and `inlineLinks` to let users share rich content with your agent across platforms:

```typescript
import { Agent } from '@mastra/core/agent'
import { createDiscordAdapter } from '@chat-adapter/discord'

export const visionAgent = new Agent({
  id: 'vision-agent',
  name: 'Vision Agent',
  instructions: 'You can see images, watch videos, and listen to audio.',
  model: 'google/gemini-2.5-flash',
  channels: {
    adapters: {
      discord: createDiscordAdapter(),
    },
    inlineMedia: ['image/*', 'video/*', 'audio/*'],
    inlineLinks: [
      { match: 'youtube.com', mimeType: 'video/*' },
      { match: 'youtu.be', mimeType: 'video/*' },
      'imgur.com',
    ],
  },
})
```

With this configuration:

- A user uploads a screenshot and the agent describes what it sees.
- A user uploads an `.mp4` clip and the agent summarizes the video.
- A user pastes a YouTube link and the agent watches and discusses the video.
- A user pastes an imgur link and the agent sees the image directly.

By default, only images are sent inline (`inlineMedia: ['image/*']`). Unsupported types are described as text summaries so the agent knows about the file without failing on models that reject them. See [Channels reference](https://mastra.ai/reference/agents/channels) for all `inlineMedia` patterns and [inlineLinks reference](https://mastra.ai/reference/agents/channels) for domain matching, HEAD detection, and forced MIME types.

### Serverless deployment

On serverless platforms like Vercel, each request runs in a separate, short-lived instance. Channels need two things to work reliably in that environment: a way to keep the function alive while the agent responds, and a shared pub/sub so instances can coordinate.

#### Keep the function alive with `waitUntil`

A channel webhook returns a `200` response right away, then the agent runs in the background to post its reply. On most serverless platforms the function is frozen as soon as it responds, which stops the run before the agent answers. Pass a `waitUntil` function so the platform keeps the instance alive until the run finishes.

On Vercel, pass `waitUntil` from `@vercel/functions`:

```typescript
import { Agent } from '@mastra/core/agent'
import { createSlackAdapter } from '@chat-adapter/slack'
import { waitUntil } from '@vercel/functions'

export const yourAgent = new Agent({
  id: 'your-agent',
  name: 'Your Agent',
  instructions: 'You are a helpful assistant.',
  model: 'openai/gpt-5.6-sol',
  channels: {
    adapters: {
      slack: createSlackAdapter(),
    },
    waitUntil,
  },
})
```

Vercel and AWS Lambda require `waitUntil`, since they freeze the function as soon as the response is sent. Cloudflare Workers and Netlify Functions are detected automatically from the request context, so they don't need it. For runtimes where `waitUntil` lives on the request context but isn't detected automatically, use `resolveWaitUntil`. See the [Channels reference](https://mastra.ai/reference/agents/channels) for details.

#### Coordinate instances with a shared pub/sub

Channels route messages through the agent's [signal pipeline](https://mastra.ai/docs/harness/signals), and each run acquires a lease on its thread so one run owns the conversation at a time.

The default in-memory pub/sub can't cross instance boundaries, so on serverless a follow-up message can be routed to a different instance than the one running the agent.

Without a shared pub/sub, that instance can't reach the active run and starts its own, leaving the original run untouched and the thread processed twice.

Configure a shared pub/sub backed by Redis Streams on the `Mastra` instance so leases and signals coordinate across instances:

```typescript
import { Mastra } from '@mastra/core'
import { RedisStreamsPubSub } from '@mastra/redis-streams'
import { yourAgent } from './agents/your-agent'

export const mastra = new Mastra({
  agents: { yourAgent },
  pubsub: new RedisStreamsPubSub({
    url: process.env.REDIS_URL,
    keyPrefix: 'mastra:my-app',
  }),
})
```

Vercel's managed Redis integration and Upstash Redis both work well. For more on when a distributed pub/sub is needed, see the [PubSub guide](https://mastra.ai/docs/server/pubsub) and the [`RedisStreamsPubSub` reference](https://mastra.ai/reference/pubsub/redis-streams).

### Other adapters

Mastra channels use Chat SDK adapters, so the platform guides aren't the full list of supported platforms. Use any Chat SDK platform adapter that exports an adapter factory compatible with `channels.adapters`.

#### Adapter catalog

The [Chat SDK adapter catalog](https://chat-sdk.dev/adapters) is the canonical source for available adapters. The list below is a snapshot and may not always be up to date.

At the time of writing, Chat SDK lists adapters for:

- AgentPhone
- Baileys WhatsApp
- Discord
- GitHub
- Google Chat
- iMessage
- Kapso
- Lark / Feishu
- Linear
- Linq
- Liveblocks
- Matrix
- Mattermost
- Messenger
- Novu
- Resend
- Sendblue
- Telegram
- Twilio
- Velt
- Web
- Webex
- WeChat
- WhatsApp Business Cloud
- X
- Zalo
- Zernio

Check the adapter's docs for its package name, credential variables, webhook requirements, and platform-specific behavior.

#### Use the same Mastra wiring

The Mastra side of each Chat SDK adapter follows the same setup. Install the adapter package and add its factory to `channels.adapters`. Then configure the platform credentials and point its webhook to the generated Mastra route.

Use one of the platform guides as a reference for the Mastra wiring:

- [Discord](https://mastra.ai/integrations/channels/discord)
- [Microsoft Teams](https://mastra.ai/integrations/channels/teams)
- [Slack](https://mastra.ai/integrations/channels/slack)
- [Telegram](https://mastra.ai/integrations/channels/telegram)
- [WhatsApp](https://mastra.ai/integrations/channels/whatsapp)

#### Check the adapter docs

Before wiring a new adapter into Mastra, check the adapter docs for:

- Attachment, card, and rich message support.
- Credential environment variables.
- Required platform permissions or scopes.
- Whether regular messages require long-running listeners or polling.
- Whether the platform needs separate routes for setup, events, or interactions.
- Webhook verification behavior.

### Related

- [Channels reference](https://mastra.ai/reference/agents/channels)
- [AgentController channels](https://mastra.ai/docs/harness/agent-controller)
- 📹 [Mastra channels workshop](https://www.youtube.com/watch?v=E9KFsZEnQO8\&t=5s)

---

## Source: Sandboxes (`docs/sandbox/overview`)

Canonical URL: `https://mastra.ai/docs/sandbox/overview.md`

## Sandboxes and filesystems

A sandbox gives your agent an isolated environment where it can run commands, execute code, install dependencies, and manage processes. This lets agents perform work that would be risky, resource-intensive, or impractical to run directly inside your application.

Sandboxes are often temporary, so files created inside them may disappear when the environment stops. A [filesystem](https://mastra.ai/docs/sandbox/filesystem) gives the agent a place to read, write, and [search](https://mastra.ai/docs/sandbox/search) files that can outlive the sandbox. You can use one to keep outputs between runs, seed a new sandbox with existing files, or give the agent documents it can search while working. Filesystems also work without a sandbox, for example when an agent only needs a knowledge base or access to files in a service such as Google Drive. A real-world example is [Mastra Factory](https://factory.mastra.ai/) which uses sandboxes to give coding-agent sessions an environment for repository checkouts, dependencies, and commands.

### When to use sandboxes

Use a sandbox when an agent needs to:

- Clone repositories and run shell, Git, build, or test workflows in a separate environment.
- Process PDFs, presentations, or other files with specialized libraries and produce new artifacts.
- Run long-lived or parallel work in separate environments with isolated files and processes.

If an agent only needs to read, write, or search files, configure [direct filesystem access](https://mastra.ai/docs/sandbox/filesystem).

### Quickstart

Give an agent a local sandbox:

```typescript
import { Agent } from '@mastra/core/agent'
import { LocalSandbox, Workspace } from '@mastra/core/workspace'

export const codingAgent = new Agent({
  id: 'coding-agent',
  name: 'Coding agent',
  instructions: 'Use the sandbox to complete coding tasks.',
  model: 'openai/gpt-5.6-sol',
  workspace: new Workspace({
    sandbox: new LocalSandbox({
      workingDirectory: './workspace',
    }),
  }),
})

await codingAgent.generate('List the files in the sandbox directory')
```

> **Warning:** `LocalSandbox` runs commands on the application host by default and isn't isolated or secure. Enable [native isolation](#localsandbox), or use a remote or container sandbox when running untrusted code.

A static sandbox is shared across every request and memory thread that uses the agent. Use a [resolver](#sandboxes-per-user-or-thread) when each user or thread needs a separate environment. See [Lifecycle and persistence](#lifecycle-and-persistence) for sharing and cleanup details.

### Using the sandbox

Agents receive tools for the capabilities supported by the sandbox backend:

| Tool                 | Does                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `execute_command`    | Runs a shell command and returns stdout, stderr, and the exit code. Supports `background: true` when the backend can spawn long-running processes.                                                                                                                                                                                                                                                       |
| `get_process_output` | Gets stdout, stderr, and status for a background process. Supports `tail` to limit output and `wait: true` to wait for the process to exit. For a static sandbox, this tool and `kill_process` are only added when the backend supports background processes. Workspaces that resolve their sandbox per request always include both tools, because capabilities aren't known until the sandbox resolves. |
| `kill_process`       | Stops a background process and returns its recent output.                                                                                                                                                                                                                                                                                                                                                |

Configured capabilities determine which tools are available. Tool configuration can then disable, rename, or add policies to those tools:

```typescript
import { LocalSandbox, Workspace, WORKSPACE_TOOLS } from '@mastra/core/workspace'

const workspace = new Workspace({
  sandbox: new LocalSandbox({ workingDirectory: './workspace' }),
  tools: {
    requireApproval: true,
    [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: {
      enabled: false,
    },
  },
})
```

Set `{ enabled: false }` on one tool to remove it, or set the top-level `enabled: false` to disable generated tools by default. A per-tool `{ enabled: true }` overrides that global setting. The top-level `requireApproval` policy applies to every generated tool unless a per-tool entry overrides it.

See the [sandbox tools reference](https://mastra.ai/reference/workspace/workspace-class) for all generated tools and the [tool configuration reference](https://mastra.ai/reference/workspace/workspace-class) for approvals, output limits, and hooks.

Authored runtime functions, including tools and workflow steps, can get the live sandbox from their execution context. Use it to execute commands, install dependencies, process files, or spawn a long-running process.

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

export const startServerTool = createTool({
  id: 'start-server',
  description: 'Starts a server in the sandbox',
  inputSchema: z.object({
    command: z.string(),
  }),
  execute: async ({ command }, ctx) => {
    if (!ctx.workspace || !ctx.requestContext) {
      throw new Error('This tool requires a workspace execution context')
    }

    const sandbox = await ctx.workspace.resolveSandbox({
      requestContext: ctx.requestContext,
    })

    if (!sandbox?.processes) {
      throw new Error('The configured sandbox does not support background processes')
    }

    const server = await sandbox.processes.spawn(command)
    return { pid: server.pid }
  },
})
```

### Sandboxes

#### `LocalSandbox`

[`LocalSandbox`](https://mastra.ai/reference/workspace/local-sandbox) executes commands on the same machine as your Mastra application. By default, commands run directly on the host with the permissions of the application process.

```typescript
const sandbox = new LocalSandbox({
  workingDirectory: './workspace',
  isolation: 'seatbelt', // Use 'bwrap' on Linux
  nativeSandbox: {
    allowNetwork: false,
    readOnlyPaths: ['./reference-data'],
  },
})
```

Enable native isolation to restrict filesystem and network access at the operating-system level. On macOS, native isolation uses Seatbelt (`sandbox-exec`). On Linux, it uses Bubblewrap (`bwrap`). Use `LocalSandbox.detectIsolation()` to check whether Seatbelt or Bubblewrap is available on the current operating system.

The [`nativeSandbox` options](https://mastra.ai/reference/workspace/local-sandbox) control network access, read-only or writable paths, write access to the working directory, and system binaries. You can also provide a custom Seatbelt profile or Bubblewrap arguments. See [`LocalSandbox`](https://mastra.ai/reference/workspace/local-sandbox) for the full configuration.

#### Remote sandboxes

Use a remote or container sandbox when commands need a stronger boundary from the host application or when workloads need to scale beyond the resources of your application server. Each sandbox has its own isolation, persistence, networking, and mount behavior:

- [AgentCore](https://mastra.ai/integrations/sandboxes/agentcore)
- [Apple Container](https://mastra.ai/integrations/sandboxes/apple-container)
- [Blaxel](https://mastra.ai/integrations/sandboxes/blaxel)
- [Cloudflare Sandbox](https://mastra.ai/integrations/sandboxes/cloudflare-sandbox)
- [Daytona](https://mastra.ai/integrations/sandboxes/daytona)
- [Docker](https://mastra.ai/integrations/sandboxes/docker)
- [E2B](https://mastra.ai/integrations/sandboxes/e2b)
- [E2B Desktop](https://mastra.ai/integrations/sandboxes/e2b-desktop)
- [Mastra](https://mastra.ai/reference/workspace/platform-sandbox)
- [Modal](https://mastra.ai/integrations/sandboxes/modal)
- [Railway](https://mastra.ai/integrations/sandboxes/railway)
- [Fly.io Sprites](https://mastra.ai/integrations/sandboxes/sprites)
- [Vercel](https://mastra.ai/integrations/sandboxes/vercel)

If Mastra doesn't support your sandbox provider, implement the [sandbox provider interface](https://mastra.ai/reference/workspace/sandbox) to add it.

### Filesystem

Every sandbox has a filesystem for commands. `LocalSandbox` uses the host filesystem, while remote sandboxes have isolated filesystems that are often temporary. For files that need to outlive a sandbox, use external storage.

Mastra filesystems connect agents and sandboxes to provider-backed storage such as Amazon S3, Google Cloud Storage, or Google Drive. Configuring one gives the agent tools to read, write, and search files. When a remote sandbox and provider support mounting, Mastra automatically mounts the storage through Filesystem in Userspace (FUSE). Commands use normal file paths while the provider stores changes outside the sandbox.

See [Filesystem](https://mastra.ai/docs/sandbox/filesystem) for providers, file tools, and mounts.

### Computer use

Supported desktop sandboxes give agents screenshot, mouse, and keyboard control. See [Computer](https://mastra.ai/docs/sandbox/computer) for supported sandboxes and configuration.

### Sandboxes per user or thread

Use a **resolver** when each user, tenant, or thread needs a separate sandbox. Set `sandboxCacheKey` to the identity that owns the sandbox so later requests reuse the same live environment.

This example creates and caches one Daytona sandbox per user:

```typescript
import { Workspace } from '@mastra/core/workspace'
import { DaytonaSandbox } from '@mastra/daytona'

const workspace = new Workspace({
  sandbox: async ({ requestContext }) => {
    const userId = requestContext.get('user-id') as string
    const sandbox = new DaytonaSandbox({ id: `user-${userId}` })
    await sandbox.start()
    return sandbox
  },
  sandboxCacheKey: ({ requestContext }) => requestContext.get('user-id') as string,
})
```

The first request from a user creates the sandbox. Later requests with the same user ID reuse it.

For a sandbox with persistent storage, create a [filesystem](https://mastra.ai/docs/sandbox/filesystem) and mount it inside the resolver. This example creates one Daytona sandbox and one S3 storage prefix per memory thread, then mounts the storage at `/workspace`:

```typescript
import { MASTRA_THREAD_ID_KEY, type RequestContext } from '@mastra/core/request-context'
import { Workspace } from '@mastra/core/workspace'
import { DaytonaSandbox } from '@mastra/daytona'
import { S3Filesystem } from '@mastra/s3'

const getThreadId = (requestContext: RequestContext) =>
  requestContext.get(MASTRA_THREAD_ID_KEY) as string

const createThreadFilesystem = (threadId: string) =>
  new S3Filesystem({
    bucket: process.env.S3_BUCKET!,
    region: process.env.S3_REGION!,
    prefix: `threads/${threadId}`,
  })

const workspace = new Workspace({
  filesystem: ({ requestContext }) => createThreadFilesystem(getThreadId(requestContext)),
  sandbox: async ({ requestContext }) => {
    const threadId = getThreadId(requestContext)
    const sandbox = new DaytonaSandbox({
      id: `thread-${threadId}`,
      language: 'typescript',
    })

    await sandbox.start()
    await sandbox.mount(createThreadFilesystem(threadId), '/workspace')
    return sandbox
  },
  sandboxCacheKey: ({ requestContext }) => getThreadId(requestContext),
})
```

The first request in a thread runs the resolver and starts the sandbox. Later requests with the same thread ID reuse the cached sandbox. A different thread ID creates a different sandbox and storage prefix.

The example mounts the filesystem inside the resolver because static `mounts` can't be combined with a sandbox resolver. Generated tools resolve the filesystem and sandbox from the request context automatically.

> **Warning:** Your application owns sandboxes returned by a resolver. Destroy them and call `workspace.clearSandboxCache(cacheKey)` when the user, thread, or session ends. `workspace.destroy()` doesn't destroy resolver-returned sandboxes.

#### Tool availability

With a static sandbox, Mastra knows which capabilities the backend supports and only gives the agent the corresponding tools. Application code should also check that an optional capability is available before using it.

Because a [resolver-backed sandbox](#sandboxes-per-user-or-thread) isn't known until request time, Mastra initially exposes every sandbox tool. Calling one unsupported by the resolved backend fails with `SandboxFeatureNotSupportedError`.

### Background processes

When agents start background processes through `execute_command`, you can receive lifecycle callbacks for stdout, stderr, and process exit. Configure these through the `backgroundProcesses` option on its `WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND` entry:

```typescript
import { Workspace, LocalSandbox, WORKSPACE_TOOLS } from '@mastra/core/workspace'

const workspace = new Workspace({
  sandbox: new LocalSandbox({ workingDirectory: './workspace' }),
  tools: {
    [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: {
      backgroundProcesses: {
        onStdout: (data, { pid }) => console.log(`[${pid}] ${data}`),
        onStderr: (data, { pid }) => console.error(`[${pid}] ${data}`),
        onExit: ({ pid, exitCode }) => console.log(`Process ${pid} exited: ${exitCode}`),
      },
    },
  },
})
```

These callbacks fire for all background processes started by the agent through `execute_command`.

By default, background processes inherit the agent's abort signal and stop when the agent disconnects. Set `abortSignal` to a custom signal, or use `null` or `false` when the process should continue after the request ends.

For the full `SandboxProcessManager` API, including programmatic process spawning, output, and standard input, see the [`SandboxProcessManager` reference](https://mastra.ai/reference/workspace/process-manager).

### Lifecycle and persistence

Who shares a sandbox depends on where you configure it and whether you use a resolver:

| Configuration              | Who shares the sandbox                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Mastra-level configuration | Agents that inherit the configuration from the [`Mastra`](https://mastra.ai/reference/configuration) instance use the same sandbox. |
| Agent-level configuration  | Every request handled by that agent instance uses the same sandbox.                                                                 |
| Resource-scoped resolver   | The resolver caches one sandbox for each resource ID.                                                                               |
| Thread-scoped resolver     | A memory thread keeps its sandbox across requests in that thread.                                                                   |

A static sandbox isn't automatically scoped to the current resource or memory thread. For resource or thread scope, use a resolver and set `sandboxCacheKey` to the corresponding ID. See [Sandboxes per user or thread](#sandboxes-per-user-or-thread).

#### Start

Static sandbox environments usually start when the first command runs, so most applications don't need to initialize them explicitly. Call `workspace.init()` during application startup only when you want to start a static sandbox and prepare its mounts before serving requests. This is useful when credential, network, or provider errors need to surface during startup instead of on the first command.

`workspace.init()` doesn't start resolver-backed sandboxes because no sandbox is selected until a request runs. The resolver must return a sandbox that's already started or can start itself on first use.

#### Hooks

Use `onStart`, `onStop`, and `onDestroy` to run application code during lifecycle transitions. Hooks receive the live sandbox instance:

```typescript
const sandbox = new LocalSandbox({
  workingDirectory: './workspace',
  onStart: ({ sandbox }) => console.log(`Started ${sandbox.id}`),
  onStop: ({ sandbox }) => console.log(`Stopping ${sandbox.id}`),
  onDestroy: ({ sandbox }) => console.log(`Destroying ${sandbox.id}`),
})
```

`onStart` runs after the sandbox starts. `onStop` and `onDestroy` run before their corresponding operation.

#### Cleanup

When you configure a sandbox directly instead of using a resolver, Mastra owns it. `mastra dev` and the generated Mastra server handle shutdown signals and destroy registered resources automatically. If you embed Mastra in a custom server or process, call `mastra.shutdown()` from its shutdown hook. For standalone use, call `workspace.destroy()` directly.

The backend decides what `stop()` and `destroy()` do. For example, stopping may shut down compute while preserving an environment that can restart, while destroying may delete the environment and its ephemeral files. Check the selected backend before relying on either behavior.

Sandboxes returned by a resolver are owned by your application. `workspace.destroy()` and `mastra.shutdown()` clear cached references but don't destroy resolved sandboxes. Application lifecycle code must keep track of them, call `destroy()` when their user, thread, or session ends, and then call `workspace.clearSandboxCache(cacheKey)`. This prevents unused compute from continuing to run and later requests from reusing a stale sandbox.

#### Persistence

Persistence is backend-specific. Files and processes aren't guaranteed to survive when a sandbox stops or the application restarts. An idle timeout may also discard them. Some backends reconnect by sandbox ID or preserve snapshots and volumes. Others create a fresh environment.

Every sandbox has an `id`, but the ID isn't a cross-backend persistence guarantee. Read the selected backend's reference before relying on reconnection or persisted state.

### Network and credential safety

Mastra doesn't define one network policy that applies to every sandbox backend. Defaults and supported controls vary, so check the selected backend before running untrusted code. For sensitive or production workloads, prefer blocking outbound access or allowing only the destinations the task needs. Apply that policy when you create the sandbox so it takes effect before commands run.

If an agent starts a web server inside a remote sandbox, that server initially listens on a port inside the sandbox. Backends that support port exposure implement `sandbox.networking.getPortUrl()` to return a URL you can use to preview or test the server from outside the sandbox:

```typescript
const url = await sandbox.networking?.getPortUrl(8000)
```

Depending on the backend's access controls, the URL may make the service reachable to others. This inbound exposure is separate from outbound sandbox access. `LocalSandbox` with native isolation blocks network access by default unless `allowNetwork` is enabled. Without native isolation, local commands use the host network.

For example, `DaytonaSandbox` allows outbound access unless you configure a restriction. Set `networkBlockAll` with a domain allowlist when the task only needs specific services:

```typescript
import { DaytonaSandbox } from '@mastra/daytona'

const sandbox = new DaytonaSandbox({
  networkBlockAll: true,
  domainAllowList: 'registry.npmjs.org,api.github.com',
})
```

Daytona applies these settings when it creates the sandbox. It also supports CIDR rules through `networkAllowList`. See the [Daytona integration page](https://mastra.ai/integrations/sandboxes/daytona) for full configuration details.

Environment variables passed to a sandbox or command are available to code running there. Mastra doesn't provide a backend-neutral credential broker that keeps secrets outside the sandbox while authorizing its requests. Give the command only the credentials it needs, scoped to the task. Follow the selected backend's secret-management guidance.

For example, pass a read-only token to the command that needs it instead of configuring it for every command in the sandbox:

```typescript
await sandbox.executeCommand('node', ['scripts/download-reports.js'], {
  env: {
    REPORTS_READ_TOKEN: process.env.REPORTS_READ_TOKEN,
  },
})
```

### Related

- [`SandboxProcessManager` reference](https://mastra.ai/reference/workspace/process-manager)
- [Sandbox provider interface](https://mastra.ai/reference/workspace/sandbox)
- [Filesystem](https://mastra.ai/docs/sandbox/filesystem)
- [Mastra Factory](https://factory.mastra.ai)

---

## Source: Filesystem (`docs/sandbox/filesystem`)

Canonical URL: `https://mastra.ai/docs/sandbox/filesystem.md`

## Filesystem

A filesystem gives an agent tools for reading, writing, listing, and [searching](https://mastra.ai/docs/sandbox/search) files. Use it as a knowledge base or to persist files between ephemeral sandbox runs.

Configure files in two ways:

- [Direct filesystem access](#direct-filesystem-access) uses `filesystem` with one filesystem provider or a [`CompositeFilesystem`](#manual-composition) that you create yourself.
- [Mounts](#mounts) uses `mounts` to create a `CompositeFilesystem` from path-prefixed providers. When a static sandbox and filesystem provider support mounting, Mastra automatically mounts the provider at its configured path. Remote sandbox mounts typically use Filesystem in Userspace (FUSE).

Configure either `filesystem` or `mounts`, not both. Configuring both throws a `WorkspaceError` with the code `INVALID_CONFIG`.

Both configurations give the agent file tools. Sandbox commands can only see a provider when the sandbox can mount it successfully.

Configuring a filesystem gives the agent these tools:

| Tool                          | Does                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `mastra_workspace_read_file`  | Reads all or part of a file.                                                 |
| `mastra_workspace_write_file` | Creates or overwrites a file.                                                |
| `mastra_workspace_edit_file`  | Replaces matching text in an existing file.                                  |
| `mastra_workspace_list_files` | Lists files and directories.                                                 |
| `mastra_workspace_delete`     | Deletes a file or directory.                                                 |
| `mastra_workspace_file_stat`  | Returns metadata about a file or directory.                                  |
| `mastra_workspace_mkdir`      | Creates a directory and any missing parent directories.                      |
| `mastra_workspace_grep`       | Searches file contents with a regular expression.                            |
| `mastra_workspace_ast_edit`   | Applies structural code edits. Available when `@ast-grep/napi` is installed. |

### Supported filesystems

#### `LocalFilesystem`

[`LocalFilesystem`](https://mastra.ai/reference/workspace/local-filesystem) connects to a directory on the same machine as your Mastra application. Use it for local development or files that already live on the application host.

#### Other filesystems

Use another provider when files live outside the application host or already exist in an external service:

- [AgentFS](https://mastra.ai/integrations/file-storage/agentfs)
- [Amazon S3](https://mastra.ai/integrations/file-storage/amazon-s3)
- [Archil](https://mastra.ai/integrations/file-storage/archil)
- [Azure Blob](https://mastra.ai/integrations/file-storage/azure-blob)
- [Google Cloud Storage](https://mastra.ai/integrations/file-storage/google-cloud-storage)
- [Google Drive](https://mastra.ai/integrations/file-storage/google-drive)
- [Mastra Platform](https://mastra.ai/reference/workspace/platform-filesystem)
- [Mesa](https://mastra.ai/integrations/file-storage/mesa)
- [Vercel Files](https://mastra.ai/integrations/file-storage/vercel-files)

Every provider supports file tools through `filesystem`. Sandbox mounting depends on both the filesystem provider and sandbox backend.

### Direct filesystem access

Use `filesystem` when the agent should access a provider through file tools. It can also accept a resolver or a manually created `CompositeFilesystem`.

Give an agent file tools for a local knowledge base:

```typescript
import { LocalFilesystem, Workspace } from '@mastra/core/workspace'

const workspace = new Workspace({
  filesystem: new LocalFilesystem({
    basePath: './knowledge-base',
  }),
})
```

The agent receives tools such as `mastra_workspace_read_file`, `mastra_workspace_write_file`, `mastra_workspace_list_files`, and `mastra_workspace_grep`. Paths are resolved under `./knowledge-base`, and no sandbox or command tools are required.

See [Search](https://mastra.ai/docs/sandbox/search) to index the files for keyword or semantic retrieval. See the [filesystem tools reference](https://mastra.ai/reference/workspace/workspace-class) for every generated tool and its policies.

### Mounts

Use `mounts` when programs inside a sandbox need to access persistent files by path. Mastra creates the mount automatically when the sandbox and filesystem provider support it. The agent still receives file tools, while command tools can run commands such as `ls`, `cat`, or `python` against the same files.

For example, mount an S3 bucket at `/workspace` inside a Daytona sandbox:

```typescript
import { Mastra } from '@mastra/core'
import { Workspace } from '@mastra/core/workspace'
import { DaytonaSandbox } from '@mastra/daytona'
import { S3Filesystem } from '@mastra/s3'

const workspace = new Workspace({
  mounts: {
    '/workspace': new S3Filesystem({
      bucket: process.env.S3_BUCKET!,
      region: 'us-east-1',
    }),
  },
  sandbox: new DaytonaSandbox(),
})

export const mastra = new Mastra({ workspace })
```

#### Using mounts

Files already available through the provider appear under `/workspace`. The agent can call `read_file('/workspace/report.md')` or run `cat /workspace/report.md`. Files written through either interface are saved by the provider and remain available after the sandbox stops.

Without a mount, an agent can still combine file tools with sandbox commands by passing file contents between tool calls. This works for selected text files. Mounts are a better fit when programs expect a directory tree or need to process large or binary files.

> **Warning:** File-tool and command-tool policies are independent. Requiring approval for `write_file`, for example, doesn't stop the agent from using `execute_command` to write the same mounted path. If files must only be accessed through file tools, disable sandbox command tools.

#### Paths

A mount path is the path exposed to file tools and, after a successful sandbox mount, commands. The underlying provider may store those files somewhere else.

For a remote provider mounted at `/workspace`:

- File tools use paths such as `/workspace/report.md`.
- Remote sandbox commands generally use the same path.
- The provider maps the path to its configured bucket, prefix, or remote directory.

`LocalSandbox` creates a symlink inside its `workingDirectory` instead. A `/workspace` mount becomes `<workingDirectory>/workspace` on the host and is usually addressed as `workspace` by commands.

### Composite filesystem

The `mounts` option creates a `CompositeFilesystem`. This TypeScript path router presents several providers as one virtual directory tree.

#### Multiple filesystems

Configure each provider under its mount path:

```typescript
import { Workspace } from '@mastra/core/workspace'
import { E2BSandbox } from '@mastra/e2b'
import { GCSFilesystem } from '@mastra/gcs'
import { S3Filesystem } from '@mastra/s3'

const workspace = new Workspace({
  mounts: {
    '/data': new S3Filesystem({
      bucket: 'agent-data',
      region: 'us-east-1',
    }),
    '/reports': new GCSFilesystem({
      bucket: 'agent-reports',
    }),
  },
  sandbox: new E2BSandbox({ id: 'analysis-sandbox' }),
})
```

With this configuration:

- `list_files('/')` returns the virtual directories `data` and `reports`.
- `read_file('/data/input.csv')` routes to the S3 provider.
- `write_file('/reports/summary.md')` routes to the Google Cloud Storage provider.
- Sandbox commands use the same paths when each sandbox mount succeeds.

The composite strips the mount prefix before passing the remaining path to its provider. Mount paths can't be nested, so the same composite can't contain both `/data` and `/data/archive`.

#### Without a sandbox

You can configure `mounts` without a sandbox. Mastra still creates the `CompositeFilesystem`, and all file tools work with mount-prefixed paths. The agent receives no command or process tools because no sandbox is configured.

#### Manual composition

You can also create a `CompositeFilesystem` yourself and pass it through `filesystem` for path routing without automatic sandbox mount wiring:

```typescript
import { CompositeFilesystem, LocalFilesystem, Workspace } from '@mastra/core/workspace'
import { S3Filesystem } from '@mastra/s3'

const filesystem = new CompositeFilesystem({
  mounts: {
    '/local': new LocalFilesystem({ basePath: './data' }),
    '/archive': new S3Filesystem({
      bucket: 'agent-archive',
      region: 'us-east-1',
    }),
  },
})

const workspace = new Workspace({ filesystem })
```

Use manual composition when another part of your application needs the composite as a filesystem provider. For normal sandbox mounting, the `mounts` option performs the same routing setup with less configuration.

### Mount availability

File tools and composite routing work without a sandbox mount. When a remote sandbox and filesystem provider support mounting, `mounts` automatically uses FUSE to make the files visible to commands. `LocalSandbox` uses symlinks instead.

Built-in sandbox mounting currently includes:

| Sandbox backend | Filesystem providers                                |
| --------------- | --------------------------------------------------- |
| `LocalSandbox`  | `LocalFilesystem`                                   |
| E2B             | Amazon S3, Google Cloud Storage, Azure Blob Storage |
| Daytona         | Amazon S3, Google Cloud Storage, Azure Blob Storage |
| Blaxel          | Amazon S3, Google Cloud Storage                     |

Remote mounts may require `s3fs`, `gcsfuse`, or `blobfuse2` inside the sandbox. Some backends install missing software during startup, which can require network access and additional startup time. Other combinations require an [`onMount`](https://mastra.ai/reference/workspace/workspace-class) hook or provider-specific setup.

If a sandbox mount is unavailable or fails, the workspace remains usable. File tools continue to access the provider through its SDK, but commands can't see that path. Mastra describes these providers to the agent as available through file tools only.

### Filesystems per user or thread

The `filesystem` option accepts a resolver when storage should vary by request, user, role, or tenant:

```typescript
const workspace = new Workspace({
  filesystem: ({ requestContext }) => {
    const userId = requestContext.get('user-id') as string

    return new S3Filesystem({
      bucket: process.env.S3_BUCKET!,
      region: process.env.S3_REGION!,
      prefix: `users/${userId}`,
    })
  },
})
```

Each user gets a separate filesystem view, and file tools resolve the provider from the request context automatically.

`mounts` doesn't accept a resolver and can't be combined with a sandbox resolver. When each user or thread needs separate storage inside a separate sandbox, create and mount the provider inside the sandbox resolver. See [Sandboxes per user or thread](https://mastra.ai/docs/sandbox/overview).

### Policies and containment

Use individual constants under `WORKSPACE_TOOLS.FILESYSTEM`, such as `WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE`, to configure each file tool. Set approval globally or per tool. Configure read-before-write and output limits on individual filesystem tool entries. See the [filesystem tool configuration reference](https://mastra.ai/reference/workspace/workspace-class).

`LocalFilesystem` contains access within `basePath` by default. Use `allowedPaths` when the agent needs specific directories outside that root:

```typescript
const workspace = new Workspace({
  filesystem: new LocalFilesystem({
    basePath: './knowledge-base',
    allowedPaths: ['../shared-policies'],
  }),
})
```

Containment applies to filesystem operations, including file tools and search indexing. It doesn't restrict shell commands.

Set `readOnly: true` when the agent should use files without changing them. For a static provider, Mastra removes write-related file tools.

With a filesystem resolver, write tools remain registered because the provider isn't known until the request runs. The provider rejects write attempts at runtime.

For `LocalFilesystem` entries in a composite, keep `contained: true`, which is the default. Set `contained: false` only when unrestricted host filesystem access is intentional.

### Related

- [Sandboxes](https://mastra.ai/docs/sandbox/overview)
- [Search](https://mastra.ai/docs/sandbox/search)
- [Filesystem provider interface](https://mastra.ai/reference/workspace/filesystem)
- [Configuration API reference](https://mastra.ai/reference/workspace/workspace-class)

---

## Source: Search (`docs/sandbox/search`)

Canonical URL: `https://mastra.ai/docs/sandbox/search.md`

## Search and indexing

Search gives agents a fast way to find relevant content without reading every file. It works with [direct filesystem access](https://mastra.ai/docs/sandbox/filesystem) and [`mounts`](https://mastra.ai/docs/sandbox/filesystem), but stores searchable content in a separate index.

Queries read that index, not the live filesystem. This separation also lets you index content from databases, APIs, or other application sources.

### Quickstart

Enable BM25 keyword search, add a document to the index, and search it:

```typescript
import { LocalFilesystem, Workspace } from '@mastra/core/workspace'

const workspace = new Workspace({
  filesystem: new LocalFilesystem({ basePath: './workspace' }),
  bm25: true,
})

await workspace.index('/docs/guide.md', 'Reset passwords from the account settings page.')

const results = await workspace.search('password reset')

for (const result of results) {
  console.log(`${result.id}: ${result.score}`)
  console.log(result.content)
}
```

The first argument to `workspace.index()` is the document ID returned in search results. It looks like a file path in this example, but `index()` doesn't read or create that file.

Configuring search also gives agents search and indexing tools. See [Agent tools](#agent-tools) to control them.

### Choose a search mode

Mastra supports three search modes:

| Mode     | Best for                                 | Example queries                             |
| -------- | ---------------------------------------- | ------------------------------------------- |
| `bm25`   | Exact terms, technical queries, and code | "useState hook", "404 error", "config.yaml" |
| `vector` | Concepts and natural-language questions  | "how to handle user authentication"         |
| `hybrid` | A mix of exact and conceptual queries    | Most agent search use cases                 |

If you don't pass a mode to `workspace.search()`, Mastra uses hybrid search when both BM25 and vector search are configured. Otherwise, it uses the configured mode.

#### BM25 keyword search

BM25 scores documents by term frequency and document length. It needs no external service or embedding model. Pass `bm25: true` to use the defaults shown in the quickstart.

To tune term-frequency saturation and document-length normalization, pass `k1` and `b`:

```typescript
const workspace = new Workspace({
  filesystem: new LocalFilesystem({ basePath: './workspace' }),
  bm25: {
    k1: 1.5,
    b: 0.75,
  },
})
```

#### Vector search

Vector search uses embeddings to find semantically similar content. Configure a vector store and a function that embeds one string at a time:

```typescript
import { openai } from '@ai-sdk/openai'
import { Workspace, LocalFilesystem } from '@mastra/core/workspace'
import { PineconeVector } from '@mastra/pinecone'
import { embed } from 'ai'

const workspace = new Workspace({
  filesystem: new LocalFilesystem({ basePath: './workspace' }),
  vectorStore: new PineconeVector({
    id: 'workspace-search',
    apiKey: process.env.PINECONE_API_KEY!,
  }),
  embedder: async (text: string) => {
    const { embedding } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: text,
    })
    return embedding
  },
})
```

##### Batch embedding

A single-text embedder makes a separate provider call for each document. For large indexes, use a provider's batch API to embed several documents in one call.

A batch embedder must:

- Accept an array of strings.
- Return one embedding per string, in the same order.
- Have a `batch: true` property so Mastra can detect it at runtime.
- Optionally set `maxBatchSize` to the largest array the provider accepts.

Mastra splits larger indexing sets according to `maxBatchSize` and can process the resulting groups concurrently. Set this value to the provider's documented limit:

| Provider | Maximum inputs |
| -------- | -------------- |
| OpenAI   | 2048           |
| Cohere   | 96             |
| Voyage   | 128            |

If you omit `maxBatchSize`, Mastra uses its internal batch size.

Replace the single-text embedder with a batch embedder:

```typescript
import { openai } from '@ai-sdk/openai'
import { LocalFilesystem, Workspace } from '@mastra/core/workspace'
import { PineconeVector } from '@mastra/pinecone'
import { embedMany } from 'ai'

const model = openai.embedding('text-embedding-3-small')

const workspace = new Workspace({
  filesystem: new LocalFilesystem({ basePath: './workspace' }),
  vectorStore: new PineconeVector({
    id: 'workspace-search',
    apiKey: process.env.PINECONE_API_KEY!,
  }),
  embedder: Object.assign(
    async (texts: string[]) => {
      const { embeddings } = await embedMany({ model, values: texts })
      return embeddings
    },
    { batch: true as const, maxBatchSize: 2048 },
  ),
})
```

`Object.assign()` adds `batch` and `maxBatchSize` as properties on the function. Mastra reads them as metadata and doesn't pass them to the provider. Single-text embedders with the `(text: string) => Promise<number[]>` signature remain supported.

#### Hybrid search

Configure both BM25 and vector search to combine keyword and semantic results:

```typescript
const workspace = new Workspace({
  filesystem: new LocalFilesystem({ basePath: './workspace' }),
  bm25: true,
  vectorStore: pineconeVector,
  embedder: embedderFn,
})
```

#### Custom index name

The vector index name defaults to a sanitized version of the workspace ID followed by `_search`. Set `searchIndexName` when you need a stable or shared name:

```typescript
const workspace = new Workspace({
  filesystem: new LocalFilesystem({ basePath: './workspace' }),
  vectorStore: pineconeVector,
  embedder: embedderFn,
  searchIndexName: 'my_workspace_vectors',
})
```

The name must start with a letter or `_`, contain only letters, numbers, or `_`, and contain at most 63 characters.

### Index content

Use `workspace.index()` to add supplied text to the search index. Mastra tokenizes the content for BM25 search and generates an embedding when vector search is configured.

The document ID doesn't need to exist in the filesystem. Add metadata when results need filtering or more context:

```typescript
await workspace.index('/docs/guide.md', 'Content of the guide...')

await workspace.index('/docs/api.md', apiDocContent, {
  metadata: {
    category: 'api',
    version: '2.0',
  },
})
```

Manual indexing works well for database records and API responses, or when you need to preprocess, chunk, or annotate content yourself.

#### Keep files and the index in sync

Filesystem and index mutations are independent. Writing, editing, or deleting a file doesn't update its indexed content, and `workspace.index()` doesn't read or change a file.

To write a file and make it searchable, perform both operations:

```typescript
const path = 'notes/launch.md'
const content = '# Launch notes\n\nShip the new dashboard on Friday.'
const filesystem = workspace.filesystem

if (!filesystem) {
  throw new Error('This operation requires a static filesystem')
}

await filesystem.writeFile(path, content)
await workspace.index(path, content)
```

After editing a file, index its complete updated content again. Deleting a file leaves its indexed document in place, and Mastra doesn't currently expose a public method for removing one indexed document. Use the `grep` file tool instead when an agent must search the current filesystem state without maintaining a separate index.

### Search content

Use `workspace.search()` to return documents ranked by relevance:

```typescript
const results = await workspace.search('authentication flow', {
  topK: 10,
  mode: 'hybrid',
  vectorWeight: 0.5,
})
```

| Option         | Description                                                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `topK`         | Maximum number of results. Direct API calls default to 10. The agent search tool defaults to 5.                                                                |
| `mode`         | Search mode: `'bm25'`, `'vector'`, or `'hybrid'`. Defaults to the best available mode for the workspace configuration.                                         |
| `minScore`     | Removes results below this score. The scale depends on the mode, vector provider, and indexed content.                                                         |
| `vectorWeight` | In hybrid mode, the weight given to vector scores. `0` gives vector scores zero weight, `1` gives BM25 scores zero weight, and `0.5` weights both equally.     |
| `filter`       | Vector-store metadata filter used by vector retrieval. In hybrid mode, it doesn't filter BM25-only results. The syntax depends on the configured vector store. |

Each result contains the matching content and its score:

```typescript
interface SearchResult {
  id: string
  content: string
  score: number
  lineRange?: {
    start: number
    end: number
  }
  metadata?: Record<string, unknown>
  scoreDetails?: {
    vector?: number
    bm25?: number
  }
}
```

Score scales aren't interchangeable:

- Standalone BM25 search returns raw BM25 scores, which aren't limited to 0 through 1.
- Vector score meaning depends on the configured vector store.
- Hybrid search min-max normalizes BM25 for its weighted calculation but uses the vector provider's score unchanged. The combined score isn't clamped to 0 through 1.
- `scoreDetails` keeps the raw component scores, including the unnormalized BM25 score.
- Tune `minScore` for the active mode, vector provider, and indexed content instead of reusing one threshold across indexes.

### Agent tools

When search is configured, agents receive `mastra_workspace_search` and `mastra_workspace_index`. Configure them independently with `WORKSPACE_TOOLS.SEARCH`.

Disable indexing when an agent should search existing content without changing the index:

```typescript
import { LocalFilesystem, Workspace, WORKSPACE_TOOLS } from '@mastra/core/workspace'

const workspace = new Workspace({
  filesystem: new LocalFilesystem({ basePath: './workspace' }),
  bm25: true,
  tools: {
    [WORKSPACE_TOOLS.SEARCH.INDEX]: {
      enabled: false,
    },
  },
})
```

The index tool accepts the same supplied `path`, `content`, and optional metadata as `workspace.index()`. Because it can trigger embedding calls and vector-store writes, require approval when agents shouldn't mutate the index without review:

```typescript
const workspace = new Workspace({
  filesystem: new LocalFilesystem({ basePath: './workspace' }),
  bm25: true,
  tools: {
    [WORKSPACE_TOOLS.SEARCH.INDEX]: {
      requireApproval: true,
    },
  },
})
```

`requireReadBeforeWrite` applies to filesystem write tools, not index mutations. Mastra also excludes the index tool when a static filesystem is read-only, even though indexing doesn't write to that filesystem.

See the [search tool reference](https://mastra.ai/reference/workspace/workspace-class) for the complete tool list and the [tool configuration reference](https://mastra.ai/reference/workspace/workspace-class) for shared settings.

### Auto-indexing

Use `autoIndexPaths` to build an index from static filesystem content during application startup.

> **Warning:** `autoIndexPaths` runs as part of `workspace.init()`. Passing the workspace to `new Mastra({ workspace })` registers it but doesn't initialize it or build the index. Call and await `workspace.init()` unless another runtime, such as `AgentController`, owns workspace initialization.
>
> ```typescript
> await workspace.init()
> ```
>
> When your application owns initialization, call it once during startup before serving requests.

In a normal Mastra application, construct `Mastra` first so its logger is available to the workspace. Then initialize the workspace at module startup:

```typescript
import { Mastra } from '@mastra/core'
import { LocalFilesystem, Workspace } from '@mastra/core/workspace'

const workspace = new Workspace({
  filesystem: new LocalFilesystem({ basePath: './workspace' }),
  bm25: true,
  autoIndexPaths: ['docs', 'support/faq'],
})

export const mastra = new Mastra({ workspace })

await workspace.init()
```

Top-level `await` keeps module startup pending until initialization finishes. When `init()` resolves, Mastra has attempted to read and index every matching file.

Each `autoIndexPaths` entry can be a file, directory, or glob pattern. Recursive directory and glob traversal is limited to ten levels:

```typescript
const workspace = new Workspace({
  filesystem: new LocalFilesystem({ basePath: './workspace' }),
  bm25: true,
  autoIndexPaths: ['docs/**/*.md', 'support/**/*.txt'],
})

export const mastra = new Mastra({ workspace })

await workspace.init()
```

Auto-indexing supports a static `filesystem` or `mounts`. Include mount prefixes in paths, such as `/docs/**/*.md`. It doesn't support a filesystem resolver because no provider has been selected when the workspace initializes. Index resolver-backed content manually instead.

Initialization performs one scan and doesn't watch for later changes. It splits large files into chunks before indexing them and generates embeddings in vector mode.

Keep the configured paths narrow and avoid dependency or output directories. Don't include binary file trees. Use a batch embedder for large vector indexes.

Calling `workspace.init()` again scans the paths again and clears the process-local BM25 index before rebuilding it. Don't call it from an agent call, tool, workflow step, or request handler.

A persistent vector index behaves differently. Auto-indexing replaces the files it reads but can retain documents for files removed before a later scan. Use a stable workspace `id` or `searchIndexName` when vectors must survive process restarts, and plan cleanup around the vector store's persistence behavior.

### Related

- [Sandboxes](https://mastra.ai/docs/sandbox/overview)
- [Filesystem](https://mastra.ai/docs/sandbox/filesystem)
- [Retrieval-Augmented Generation overview](https://mastra.ai/reference/rag/overview)
- [Workspace configuration reference](https://mastra.ai/reference/workspace/workspace-class)

---

## Source: Skills (`docs/sandbox/skills`)

Canonical URL: `https://mastra.ai/docs/sandbox/skills.md`

## Filesystem-backed skills

Filesystem-backed skills are directories of reusable instructions and supporting files. Mastra discovers them from paths in the `skills` option, then makes them available to every agent using that configuration. Skills follow the [Agent Skills specification](https://agentskills.io).

Use [agent skills](https://mastra.ai/docs/skills) instead when you want to define a skill directly in one agent's code. An agent can use both types. If a direct agent skill and a filesystem-backed skill have the same name, the direct agent skill takes precedence.

### Quickstart

Create a directory with a `SKILL.md` file:

```markdown
---
name: code-review
description: Reviews code for bugs and readability issues
---

# Code review

Check the code for bugs, missing error handling, and unclear naming.
```

Configure the directory:

```typescript
import { LocalFilesystem, Workspace } from '@mastra/core/workspace'

export const workspace = new Workspace({
  filesystem: new LocalFilesystem({
    basePath: './workspace',
  }),
  skills: ['skills'],
})
```

The `skills` path is relative to the filesystem root, so Mastra discovers `./workspace/skills/code-review/SKILL.md`. An agent using this configuration can now discover and load `code-review` when a request needs it.

### Skill structure

Each skill is a directory with a required `SKILL.md` file. It can also contain supporting files:

```plaintext
code-review/
  SKILL.md
  references/
    style-guide.md
  scripts/
    lint.ts
  assets/
    review-template.md
```

- `SKILL.md`: Metadata and instructions that Mastra loads when the agent selects the skill
- `references/`: Documentation that the agent can read or search as needed
- `scripts/`: Scripts used by the skill
- `assets/`: Templates, images, and other supporting files

Keep the main workflow in `SKILL.md`. Move detailed material to `references/` so the agent only reads it when needed.

### `SKILL.md` format

The YAML frontmatter requires `name` and `description`. The `name` must match the skill directory name, contain at most 64 lowercase letters, numbers, or hyphens, not start or end with a hyphen, and not contain consecutive hyphens. The Markdown body contains the instructions returned to the agent when it loads the skill.

Mastra also reads the optional `license`, `compatibility`, `user-invocable`, and `metadata` fields. See the [Agent Skills specification](https://agentskills.io/specification) for the complete package format and field guidance.

### How agents use skills

When skills are configured, Mastra adds each skill's name, description, path, and source type to the system message. This lets the agent discover available skills without loading every instruction file into its context.

Mastra also gives the agent three tools:

| Tool           | Does                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------- |
| `skill`        | Loads a skill's `SKILL.md` instructions and lists its reference, script, and asset files. |
| `skill_read`   | Reads all or part of any file under the selected skill directory.                         |
| `skill_search` | Searches skill instructions and reference files.                                          |

Loading is stateless. The instructions remain in the conversation as a tool result, and the agent can call `skill` again if they leave the context after compaction.

### Configure skill paths

The `skills` array accepts several path forms:

| Path                          | Discovery behavior                                                |
| ----------------------------- | ----------------------------------------------------------------- |
| `skills`                      | Scans each immediate subdirectory for a `SKILL.md` file.          |
| `skills/code-review`          | Loads one skill directory directly.                               |
| `skills/code-review/SKILL.md` | Loads one skill file directly.                                    |
| `./**/skills`                 | Finds matching directories, then discovers skills under each one. |
| `./**/SKILL.md`               | Finds and loads matching skill files.                             |

Add more entries to discover skills from several roots, such as project, team, or package directories.

Glob traversal is limited to four directory levels below the glob base.

Paths use the configured filesystem when one is available. Without a filesystem, Mastra reads them from local disk relative to the application process's current working directory. An explicit [`skillSource`](#custom-skill-sources) replaces both defaults.

### Same-named skills

Mastra lists every distinct filesystem-backed skill in the system message, including its path and source type. If several skills have the same name, a lookup by name uses this priority:

1. Local project paths
2. Managed paths under `.mastra/skills`
3. External paths under `node_modules`

If multiple highest-priority candidates have the same source type, Mastra can't choose between them and throws an error. Rename one skill or move it to a different source type.

The agent can bypass name-based resolution by passing the exact path shown in the system message to `skill` or `skill_read`. Paths with or without the trailing `/SKILL.md` work. If several configured paths resolve to the same canonical directory, Mastra treats them as aliases and lists the skill once.

Direct [agent skills](https://mastra.ai/docs/skills) are resolved before filesystem-backed skills. A direct skill wins when both types use the same name.

### Search skill content

When [BM25 or vector search](https://mastra.ai/docs/sandbox/search) is configured alongside skills, Mastra automatically indexes each skill's `SKILL.md` instructions and reference files. Scripts and assets aren't indexed.

Without BM25 or vector search, `skill_search` falls back to case-insensitive text matching across the instructions and references. This keeps skill search available without a separate search configuration, while indexed search provides ranking and semantic retrieval for larger collections.

### Dynamic skill paths

Pass a synchronous or asynchronous function when the available paths depend on request context. This example adds development skills for users with the `developer` role:

```typescript
import { LocalFilesystem, Workspace } from '@mastra/core/workspace'

const workspace = new Workspace({
  filesystem: new LocalFilesystem({ basePath: './workspace' }),
  skills: ({ requestContext }) => {
    const paths = ['skills']

    if (requestContext?.get('user-role') === 'developer') {
      paths.push('developer-skills')
    }

    return paths
  },
})
```

Mastra resolves the function for each execution and gives the agent the skill set for that request. The returned paths support the same directory, file, and glob forms as a static array.

### Custom skill sources

Set `skillSource` when skills should come from a backend other than the configured filesystem or local disk. A custom source handles skill discovery and file reads for every configured path.

For example, `CompositeVersionedSkillSource` mounts published skill versions from a content-addressable blob store under directories where Mastra can discover them:

```typescript
import { CompositeVersionedSkillSource, Workspace } from '@mastra/core/workspace'

const skillSource = new CompositeVersionedSkillSource(
  [
    {
      dirName: 'code-review',
      tree: versionTree,
      versionCreatedAt,
    },
  ],
  blobStore,
)

const workspace = new Workspace({
  skills: ['.'],
  skillSource,
})
```

An explicit `skillSource` doesn't fall back to the configured filesystem or local disk when a path is missing. See the [configuration reference](https://mastra.ai/reference/workspace/workspace-class) for the source interface and related options.

### Related

- [Agent skills](https://mastra.ai/docs/skills)
- [Agent Skills specification](https://agentskills.io)
- [Sandboxes](https://mastra.ai/docs/sandbox/overview)
- [Search and indexing](https://mastra.ai/docs/sandbox/search)
- [`createSkill()` reference](https://mastra.ai/reference/agents/createSkill)

---

## Source: Computer (`docs/sandbox/computer`)

Canonical URL: `https://mastra.ai/docs/sandbox/computer.md`

## Computer

Sandboxes that run a desktop environment can expose screenshot, mouse, and keyboard control. The workspace registers computer tools when a statically configured sandbox supports the computer capability.

[`DaytonaSandbox`](https://mastra.ai/integrations/sandboxes/daytona) and [`E2BDesktopSandbox`](https://mastra.ai/integrations/sandboxes/e2b-desktop) support this capability. Other sandbox backends don't register the computer tools. Resolver-backed sandboxes don't register them because the workspace can't inspect the resolved sandbox's capabilities when it creates the tool list.

### Computer tools

| Tool                                        | Does                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| `mastra_workspace_computer_screenshot`      | Captures the desktop as a PNG image and returns it to the model as native media. |
| `mastra_workspace_computer_click`           | Presses and releases the left mouse button at pixel coordinates.                 |
| `mastra_workspace_computer_double_click`    | Presses the left mouse button twice at pixel coordinates.                        |
| `mastra_workspace_computer_right_click`     | Presses and releases the right mouse button at pixel coordinates.                |
| `mastra_workspace_computer_move_mouse`      | Moves the cursor to pixel coordinates without pressing a button.                 |
| `mastra_workspace_computer_drag`            | Presses, drags, and releases between two points.                                 |
| `mastra_workspace_computer_type`            | Types text into the focused element.                                             |
| `mastra_workspace_computer_press_key`       | Presses a key or key combination, such as `Enter` or `ctrl+s`.                   |
| `mastra_workspace_computer_scroll`          | Scrolls up or down.                                                              |
| `mastra_workspace_computer_get_screen_info` | Gets the screen dimensions and cursor position.                                  |
| `mastra_workspace_computer_wait`            | Waits for the interface to settle.                                               |

### Configure computer tools

Action tools take a screenshot after each action by default. Configure the screenshot behavior for each tool:

```typescript
import { Workspace, WORKSPACE_TOOLS } from '@mastra/core/workspace'
import { E2BDesktopSandbox } from '@mastra/e2b-desktop'

const workspace = new Workspace({
  sandbox: new E2BDesktopSandbox(),
  tools: {
    [WORKSPACE_TOOLS.COMPUTER.CLICK]: {
      screenshotAfterAction: true,
      screenshotDelayMs: 1000,
    },
    [WORKSPACE_TOOLS.COMPUTER.TYPE]: {
      requireApproval: true,
    },
  },
})
```

Computer tools accept the same per-tool `enabled` and `requireApproval` configuration as other workspace tools.

### Related

- [Sandboxes](https://mastra.ai/docs/sandbox/overview)
- [Computer capability reference](https://mastra.ai/reference/workspace/sandbox)
- [Workspace tool configuration](https://mastra.ai/reference/workspace/workspace-class)

---

## Source: LSP (`docs/sandbox/lsp`)

Canonical URL: `https://mastra.ai/docs/sandbox/lsp.md`

## LSP inspection

Language Server Protocol (LSP) inspection gives agents semantic information about project code. A language server can identify a symbol's type, declaration, implementations, and diagnostics because it understands the language and project structure.

### What LSP adds

File and search tools answer different questions about a codebase:

| Tool                                            | Best for                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| `read_file`                                     | Reading the exact contents and surrounding context of a known file    |
| `grep`                                          | Finding text or regular-expression matches across files               |
| [Search](https://mastra.ai/docs/sandbox/search) | Retrieving indexed files by keyword or semantic similarity            |
| LSP inspection                                  | Getting type-aware information and following symbols across a project |

LSP inspection complements these tools rather than replacing them. An agent can use `grep` to find a symbol and inspect it through LSP to locate its declaration. It can then use `read_file` to read the full implementation before making a change.

### Set up LSP

LSP starts a long-running language-server process and exchanges JSON-RPC messages with it. Before enabling LSP, ensure your configuration includes:

- A static [sandbox](https://mastra.ai/docs/sandbox/overview) with a process manager whose process handles provide readable output and writable input streams. Sandbox resolvers aren't supported.
- The `vscode-jsonrpc` and `vscode-languageserver-protocol` packages installed in the Mastra application.
- A language-server binary and its runtime installed where the sandbox process runs.
- An absolute project root and project files available through matching paths to both the Mastra application and the sandbox process.

Mastra has built-in server definitions for TypeScript and JavaScript, Python, Go, and Rust. The matching language-server binary must still be installed. You can [register another server](#custom-language-servers) for other file types.

Install the shared protocol packages:

**npm**:

```bash
npm install vscode-jsonrpc vscode-languageserver-protocol
```

**pnpm**:

```bash
pnpm add vscode-jsonrpc vscode-languageserver-protocol
```

**Yarn**:

```bash
yarn add vscode-jsonrpc vscode-languageserver-protocol
```

**Bun**:

```bash
bun add vscode-jsonrpc vscode-languageserver-protocol
```

Then install a language server for your project. For example, install TypeScript and its language server:

**npm**:

```bash
npm install typescript typescript-language-server
```

**pnpm**:

```bash
pnpm add typescript typescript-language-server
```

**Yarn**:

```bash
yarn add typescript typescript-language-server
```

**Bun**:

```bash
bun add typescript typescript-language-server
```

Create a static `LocalSandbox` and point the filesystem, sandbox, and LSP root at the same directory:

```typescript
import { resolve } from 'node:path'
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace'

const projectPath = resolve('./workspace')

export const workspace = new Workspace({
  filesystem: new LocalFilesystem({
    basePath: projectPath,
  }),
  sandbox: new LocalSandbox({
    workingDirectory: projectPath,
  }),
  lsp: {
    root: projectPath,
  },
})
```

The filesystem gives the agent file tools for the project. The sandbox starts the language server in the same directory when an LSP query first needs it. If any required protocol package, process manager, or server binary is unavailable, Mastra disables LSP or returns that no language server is available.

### Inspect code with the agent tool

When LSP is enabled, the agent receives `mastra_workspace_lsp_inspect`. Its input identifies a file and places a cursor on one symbol:

```json
{
  "path": "/absolute/path/to/workspace/src/orders.ts",
  "line": 10,
  "match": "const order = await <<<findOrder(orderId)"
}
```

`line` is 1-indexed. Copy the content of that line into `match`, then insert exactly one `<<<` marker immediately before the symbol to inspect. The marker isn't part of the source file.

The tool returns the fields that the language server can provide:

| Field            | Output                                                                  |
| ---------------- | ----------------------------------------------------------------------- |
| `hover`          | Type information or documentation, with its markup kind                 |
| `diagnostics`    | Severity, message, and source for diagnostics on the inspected line     |
| `definition`     | Declaration locations with a one-line preview when the file is readable |
| `implementation` | Implementation locations                                                |
| `error`          | A setup, server, or query error when inspection can't run               |

Unavailable result fields are omitted. Definition and implementation locations identify where to continue with `read_file` for full context.

### Configure LSP

Set `lsp: true` to use the defaults. Replace it with an object when you need to control the root, server discovery, timeouts, or retained clients:

```typescript
lsp: {
  root: projectPath,
  diagnosticTimeout: 4_000,
  initTimeout: 8_000,
  maxOpenClients: 4,
  disableServers: ['eslint'],
  binaryOverrides: {
    typescript: '/opt/mastra-tools/typescript-language-server --stdio',
  },
  searchPaths: ['/opt/mastra-tools'],
},
```

`binaryOverrides` maps a built-in server ID to its full startup command. `searchPaths` adds package roots whose `node_modules` may contain required modules or binaries. As a last-resort fallback, you can set a `packageRunner` such as `pnpm dlx`. Package-runner fallback is disabled by default because it may install software or hang in some project layouts.

`diagnosticTimeout` controls how long the direct `getDiagnostics()` and `getDiagnosticsMulti()` APIs wait for diagnostics. The agent inspection tool currently waits up to five seconds.

Mastra normally finds a project root for each file by walking upward for that server's project markers. It falls back to `lsp.root` when it finds no marker. See the [LSP configuration reference](https://mastra.ai/reference/workspace/workspace-class) for all options and defaults.

#### Limit retained clients

`maxOpenClients` limits the language-server clients retained for one configuration. It must be a positive integer. When the limit is reached, Mastra closes the least recently used client that has no active query lease.

If every retained client has an active lease, the next acquisition waits up to five seconds for a lease to be released. If none becomes available, `prepareQuery()` and `getDiagnostics()` return `null`. `getDiagnosticsMulti()` omits a server it couldn't acquire. Omitting `maxOpenClients` leaves the number of retained clients unlimited. Mastra Code uses a default limit of `4`.

#### Tool name remapping

Configure the agent inspection tool through `tools`. For example, add this entry to expose a shorter name:

```typescript
import { WORKSPACE_TOOLS } from '@mastra/core/workspace'

const tools = {
  [WORKSPACE_TOOLS.LSP.LSP_INSPECT]: {
    name: 'lsp_inspect',
  },
}
```

Add `tools` alongside `lsp` in the configuration. The `name` changes the exposed tool name, but the configuration key remains `WORKSPACE_TOOLS.LSP.LSP_INSPECT`. Set `enabled: false` on the same entry to remove the tool.

See the [tool configuration reference](https://mastra.ai/reference/workspace/workspace-class) for approval settings, dynamic policies, output limits, and hooks shared by generated agent tools.

### Custom language servers

Add a server under `lsp.servers` when a language isn't built in or when you need to replace a built-in definition:

```typescript
lsp: {
  root: projectPath,
  servers: {
    phpactor: {
      id: 'phpactor',
      name: 'Phpactor Language Server',
      languageIds: ['php'],
      extensions: ['.php'],
      markers: ['composer.json'],
      command: 'phpactor language-server',
      initializationOptions: {
        indexer: { enabled: true },
      },
    },
  },
},
```

Each definition supports these fields:

| Field                   | Required | Description                                                     |
| ----------------------- | -------- | --------------------------------------------------------------- |
| `id`                    | Yes      | Unique server ID. Use a built-in ID to replace that definition. |
| `name`                  | Yes      | Human-readable name used in logs and errors.                    |
| `languageIds`           | Yes      | LSP language identifiers handled by the server.                 |
| `extensions`            | Yes      | File extensions handled by the server, including the dot.       |
| `markers`               | Yes      | Files or directories used to find the project root.             |
| `command`               | Yes      | Full command that starts the server.                            |
| `initializationOptions` | No       | Settings sent during the LSP initialization handshake.          |

Custom definitions are merged with the built-in definitions. A custom definition with the same `id` replaces the built-in one. When a server lists multiple language IDs, Mastra maps each configured extension to the first ID.

### Query LSP directly

Application code can query the configured LSP manager directly. `getDiagnostics()` and `getDiagnosticsMulti()` manage their client leases and document open and close notifications internally.

`prepareQuery()` exposes the client for hover, definition, implementation, and other direct queries. Pass it an absolute file path. It opens the file and returns a lease. Close the file before releasing that lease, and put both calls in a `finally` block:

```typescript
async function inspectHover(filePath: string, line: number, character: number) {
  const query = await workspace.lsp?.prepareQuery(filePath)
  if (!query) return null

  try {
    return await query.client.queryHover(query.uri, {
      line,
      character,
    })
  } finally {
    query.client.notifyClose(filePath)
    query.release()
  }
}
```

Direct client positions are 0-indexed. A leaked lease can prevent an idle client from being evicted when `maxOpenClients` is set. During teardown, Mastra waits up to five seconds for active leases before forcing the language servers to shut down. Managed LSP clients close before the sandbox is destroyed.

### Limitations

- LSP only works for file types with a matching built-in or custom server.
- A filesystem alone can't run a language server. LSP requires a static sandbox with a bidirectional process manager.
- `LocalFilesystem` containment and `allowedPaths` don't constrain LSP inspection. Restrict `lsp.root` to a trusted project, and don't expose the LSP tool when users can submit untrusted host paths.
- External package inspection may resolve to declaration files such as `.d.ts` instead of runtime source.
- Language servers may omit hover, diagnostic, definition, or implementation results that they don't support.

#### Remote sandboxes

Remote LSP isn't backend-transparent. The language-server command runs through the remote sandbox process manager, but binary discovery, file reads, and some source previews still use the Mastra host.

Use remote LSP only when all of these conditions are met:

- The remote process manager provides readable output and writable input streams.
- The project uses matching absolute paths on the Mastra host and in the remote sandbox.
- The resolved server command is installed in the remote image. Configure it with `binaryOverrides` for a built-in server or `lsp.servers.command` for a custom server.
- The host can read files needed for inspection and definition previews.

A local filesystem and remote sandbox don't synchronize automatically. A binary installed only on the host can't run in the remote sandbox, and remote-only files can't provide all host-side results. For remote-only projects, use `grep`, indexed [search](https://mastra.ai/docs/sandbox/search), and sandbox commands until LSP file access is backend-transparent.

### Related

- [Filesystem](https://mastra.ai/docs/sandbox/filesystem)
- [Sandboxes](https://mastra.ai/docs/sandbox/overview)
- [Search](https://mastra.ai/docs/sandbox/search)
- [Configuration reference](https://mastra.ai/reference/workspace/workspace-class)

---

## Source: Browser (`docs/browser`)

Canonical URL: `https://mastra.ai/docs/browser.md`

## Browser

Browser support enables agents to move through websites, interact with page elements, fill forms, and extract data. Mastra provides browser capabilities through SDK providers that wrap browser automation libraries and a CLI provider for agents that drive browsers through command-line tools.

Mastra supports three SDK providers and one CLI provider:

- [**AgentBrowser**](https://mastra.ai/integrations/browsers/agent-browser): A Playwright-based provider with accessibility-first element targeting. Best for general web automation and scraping.
- [**Stagehand**](https://mastra.ai/integrations/browsers/stagehand): A Browserbase provider with AI-powered element detection. Best for complex interactions that benefit from natural language selectors.
- [**FirecrawlBrowser**](https://mastra.ai/integrations/browsers/firecrawl): A Firecrawl Browser Sandbox provider that runs AgentBrowser tools against hosted browser sessions. Best for running automation on hosted browser sessions without managing local browser infrastructure.
- [**BrowserViewer**](https://mastra.ai/integrations/browsers/browser-viewer): A CLI provider that launches Chrome and injects CDP URLs into CLI tools like agent-browser, browser-use, and browse. Best for workspace agents that drive browsers through shell commands.

### When to use browser

Use browser when your agent needs to:

- Navigate websites and interact with page elements
- Fill out forms and submit data
- Extract structured data from web pages
- Automate multi-step web workflows
- Take actions that require a real browser (JavaScript rendering, authentication flows)

### How it works

When you assign a browser to an agent, Mastra includes the provider's tools in the agent's toolset. The agent uses these tools to control the browser. It can open URLs and select elements. It can also type text and read page content.

Each provider offers a different set of tools optimized for its approach.

### Quickstart

Install your provider of choice, for this example you'll use the AgentBrowser provider.

**npm**:

```bash
npm install @mastra/agent-browser
```

**pnpm**:

```bash
pnpm add @mastra/agent-browser
```

**Yarn**:

```bash
yarn add @mastra/agent-browser
```

**Bun**:

```bash
bun add @mastra/agent-browser
```

Create a new browser instance:

```typescript
import { AgentBrowser } from '@mastra/agent-browser'

export const browser = new AgentBrowser({
  headless: false,
})
```

Assign the browser to an agent:

```typescript
import { Agent } from '@mastra/core/agent'
import { browser } from '../browsers'

export const webAgent = new Agent({
  id: 'web-agent',
  name: 'Web Agent',
  description: 'A web automation assistant that can navigate websites and complete tasks.',
  model: 'openai/gpt-5.6-sol',
  browser,
  instructions:
    'You are a web automation assistant. Use browser tools to navigate websites and complete tasks.',
})
```

The agent automatically receives all browser tools from the provider.

### Cloud providers

All SDK providers support connecting to cloud browser services instead of launching a local browser.

#### Firecrawl Browser Sandbox (FirecrawlBrowser native)

FirecrawlBrowser provisions hosted sessions through the Firecrawl API:

```typescript
import { FirecrawlBrowser } from '@mastra/browser-firecrawl'

const browser = new FirecrawlBrowser({
  apiKey: process.env.FIRECRAWL_API_KEY,
})
```

#### Browserbase (Stagehand native)

Stagehand has native Browserbase integration:

```typescript
import { StagehandBrowser } from '@mastra/stagehand'

const browser = new StagehandBrowser({
  env: 'BROWSERBASE',
  apiKey: process.env.BROWSERBASE_API_KEY,
  projectId: process.env.BROWSERBASE_PROJECT_ID,
})
```

#### CDP URL (any provider)

Connect to any browser exposing a Chrome DevTools Protocol (CDP) endpoint:

```typescript
import { AgentBrowser } from '@mastra/agent-browser'

const browser = new AgentBrowser({
  cdpUrl: process.env.BROWSER_CDP_URL,
  headless: true,
})
```

This works with any [CDP-compatible](https://chromedevtools.github.io/devtools-protocol/) browser service.

### Screencast

Browser providers stream a live video feed of the browser to the Mastra Studio UI. This lets you watch the agent interact with pages in real-time.

Screencast requires WebSocket support. Install these packages in your project:

**npm**:

```bash
npm install ws @hono/node-ws
```

**pnpm**:

```bash
pnpm add ws @hono/node-ws
```

**Yarn**:

```bash
yarn add ws @hono/node-ws
```

**Bun**:

```bash
bun add ws @hono/node-ws
```

> **Note:** These packages aren't included by default because they're incompatible with serverless environments like Cloudflare Workers. If they aren't installed, screencast is disabled but all other browser functionality works normally.

Screencast is enabled by default and can be configured:

```typescript
const browser = new AgentBrowser({
  screencast: {
    format: 'jpeg',
    quality: 80,
    maxWidth: 1280,
    maxHeight: 720,
  },
})
```

### Record browser sessions

AgentBrowser and StagehandBrowser can opt into recording for reviewing, sharing, or debugging browser runs. Configure `outputDir` to add the recording tools:

```typescript
import { join } from 'node:path'
import { AgentBrowser } from '@mastra/agent-browser'

export const browser = new AgentBrowser({
  recording: {
    outputDir: join(process.cwd(), 'browser-recordings'),
  },
})
```

StagehandBrowser accepts the same `recording` option. The agent uses `browser_record` to start, check, and stop a recording, and `browser_record_caption` to label major actions. Stopping saves the video and lets the agent return its path. A custom `outputPath` can be absolute or relative to the current working directory, and must resolve to a path inside `recording.outputDir`.

Recordings use Motion-JPEG AVI and don't require `ffmpeg`. The default maximum duration is 30 seconds, with a 120-second hard cap. The default maximum frame size is 1024 × 720, captions are limited to 80 characters, and only one recording can be active per process.

### Next steps

- [AgentBrowser](https://mastra.ai/integrations/browsers/agent-browser)
- [Stagehand](https://mastra.ai/integrations/browsers/stagehand)
- [Firecrawl](https://mastra.ai/integrations/browsers/firecrawl)
- [BrowserViewer](https://mastra.ai/integrations/browsers/browser-viewer)
- [MastraBrowser reference](https://mastra.ai/reference/browser/mastra-browser)
- 📹 [Mastra browser capabilities workshop](https://www.youtube.com/watch?v=E9KFsZEnQO8\&t=5s)

---

## Source: Connections (`docs/connections/overview`)

Canonical URL: `https://mastra.ai/docs/connections/overview.md`

## Connections

Connections let Mastra work with remote agents, coding agents, provider software development kit (SDK) runtimes, and external tools and resources. Choose a connection type based on which system owns the agent runtime and what you need to exchange.

- [**Model Context Protocol (MCP)**](https://mastra.ai/docs/connections/mcp): Connect agents to external tools and resources, or expose Mastra agents, tools, workflows, prompts, and resources to MCP-compatible systems.
- [**Agent-to-Agent (A2A)**](https://mastra.ai/docs/connections/a2a): Expose or consume remote agents across service, framework, vendor, and language boundaries.
- [**Agent Client Protocol (ACP)**](https://mastra.ai/docs/connections/acp): Run compatible coding-agent processes, such as Claude Code, Cline, or OpenCode, as Mastra tools or subagents.
- [**SDK agents**](https://mastra.ai/docs/connections/sdk-agents): Register Claude, Cursor, or OpenAI SDK-backed agents while the provider SDK retains control of the runtime, tools, permissions, and agent loop.

### When to use connections

Use connections when you need to:

- Delegate work to an agent running in another service or runtime.
- Run a coding agent against a project workspace.
- Add a provider-native agent without replacing its SDK runtime or agent loop.
- Connect agents to external tools and resources or publish Mastra capabilities to other systems.

### Get started

Start with the boundary you need to cross. Use [A2A](https://mastra.ai/docs/connections/a2a) for remote agent endpoints, [ACP](https://mastra.ai/docs/connections/acp) for coding-agent processes, [SDK agents](https://mastra.ai/docs/connections/sdk-agents) for provider-owned runtimes, or [MCP](https://mastra.ai/docs/connections/mcp) for tools and resources.

**A2A**:

```typescript
import { A2AAgent } from '@mastra/core/a2a'

const agent = new A2AAgent({
  url: 'https://agent.example.com/.well-known/agent-card.json',
})

const result = await agent.generate('Summarize the latest report')
console.log(result.text)
```

**ACP**:

```typescript
import { AcpAgent } from '@mastra/acp'

const agent = new AcpAgent({
  id: 'coding-agent',
  description: 'Inspects and edits code',
  command: 'claude',
  args: ['--acp'],
  persistSession: false,
})

const result = await agent.generate('Review this project')
console.log(result.text)
```

**SDK agents**:

```typescript
import { OpenAISDKAgent } from '@mastra/openai'

const agent = new OpenAISDKAgent({
  id: 'openai-agent',
  description: 'Answers project questions',
  sdkOptions: {
    name: 'Project assistant',
    model: 'gpt-5',
  },
})

const result = await agent.generate('Explain agent loops in one sentence')
console.log(result.text)
```

**MCP**:

```typescript
import { MCPClient } from '@mastra/mcp'

const client = new MCPClient({
  id: 'wikipedia-client',
  servers: {
    wikipedia: {
      command: 'npx',
      args: ['-y', 'wikipedia-mcp'],
    },
  },
})

try {
  const tools = await client.listTools()
  console.log(Object.keys(tools))
} finally {
  await client.disconnect()
}
```

---

## Source: MCP (`docs/connections/mcp`)

Canonical URL: `https://mastra.ai/docs/connections/mcp.md`

## MCP

Mastra supports the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction), an open standard for connecting AI agents to external tools and resources.

Use [`MCPClient`](https://mastra.ai/reference/tools/mcp-client) to connect to MCP servers. Use [`MCPServer`](https://mastra.ai/reference/tools/mcp-server) to expose Mastra agents, tools, workflows, prompts, and resources to other MCP-compatible systems. Both speak the MCP `2026-07-28` revision over stdio and Streamable HTTP.

For hosted MCP servers such as Neon and Canva, [Connect](https://mastra.ai/docs/mastra-platform/connect/providers) on Mastra platform can manage the OAuth flow and credentials for you, so agents get the server's tools through [`tools()`](https://mastra.ai/docs/mastra-platform/connect/tools) without a hand-configured `MCPClient`.

> **Note:** Upgrading from `@mastra/mcp` 1.x? See the [migration guide](https://mastra.ai/reference/migrations/mcp-v2).

For credential choices and permission boundaries, see [Authentication and authorization with MCP](https://mastra.ai/docs/guides/mcp-authentication-authorization).

### Connect to MCP servers

Install the MCP package:

**npm**:

```bash
npm install @mastra/mcp@latest
```

**pnpm**:

```bash
pnpm add @mastra/mcp@latest
```

**Yarn**:

```bash
yarn add @mastra/mcp@latest
```

**Bun**:

```bash
bun add @mastra/mcp@latest
```

Configure each server with a local command or remote URL:

```typescript
import { MCPClient } from '@mastra/mcp'

export const mcpClient = new MCPClient({
  id: 'my-mcp-client',
  servers: {
    wikipedia: {
      command: 'npx',
      args: ['-y', 'wikipedia-mcp'],
    },
    weather: {
      url: new URL('https://weather.example.com/mcp'),
      requestInit: {
        headers: {
          Authorization: `Bearer ${process.env.WEATHER_API_KEY}`,
        },
      },
    },
  },
})
```

> **Authentication:** For OAuth-protected servers, use `authenticate()` to complete the browser-based authorization flow. Visit [OAuth authentication](https://mastra.ai/reference/tools/mcp-client) for configuration details.

Pass tools from the configured servers to an agent:

```typescript
import { Agent } from '@mastra/core/agent'
import { mcpClient } from '../mcp/client'

export const assistant = new Agent({
  id: 'assistant',
  name: 'Assistant',
  instructions: `
    Use the available MCP tools to answer questions.
    Include the source of any information you retrieve.
  `,
  model: 'openai/gpt-5.6-sol',
  tools: await mcpClient.listTools(),
})
```

#### Static and runtime tools

Choose how to load tools based on whether the server configuration changes between requests:

|             | Static tools                       | Runtime toolsets                         |
| ----------- | ---------------------------------- | ---------------------------------------- |
| Method      | `await mcpClient.listTools()`      | `await mcpClient.listToolsets()`         |
| Use case    | Shared, fixed configuration        | Per-user or per-request configuration    |
| Credentials | Shared by all requests             | Can vary between requests                |
| Agent API   | `tools` in the `Agent` constructor | `toolsets` in `generate()` or `stream()` |

The preceding agent example uses static tools. For runtime credentials, create a client for the request and pass its toolsets when calling the agent:

```typescript
import { MCPClient } from '@mastra/mcp'
import { mastra } from './mastra'

export async function handleRequest(prompt: string, apiKey: string) {
  const userMcpClient = new MCPClient({
    servers: {
      weather: {
        url: new URL('https://weather.example.com/mcp'),
        requestInit: {
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      },
    },
  })

  const agent = mastra.getAgent('assistant')
  const response = await agent.generate(prompt, {
    toolsets: await userMcpClient.listToolsets(),
  })

  await userMcpClient.disconnect()
  return response.text
}
```

Visit [`listTools()`](https://mastra.ai/reference/tools/mcp-client) and [`listToolsets()`](https://mastra.ai/reference/tools/mcp-client) for their full APIs.

#### Tool approval

Set `requireToolApproval` on a server to require approval for all its tools:

```typescript
const mcpClient = new MCPClient({
  servers: {
    github: {
      url: new URL('https://github.example.com/mcp'),
      requireToolApproval: true,
    },
  },
})
```

You can also provide a function that decides based on the tool name, arguments, or annotations:

```typescript
requireToolApproval: ({ toolName }) => toolName.startsWith('delete_')
```

Treat tool annotations from servers you don't control as untrusted hints. Visit [tool approval](https://mastra.ai/reference/tools/mcp-client) for the callback context and security guidance.

#### Security

MCP servers run code and return content on your agent's behalf, so configure them with the same care as any other external dependency:

- **Stdio subprocess environment**: subprocesses inherit only the MCP SDK's curated environment whitelist (for example `PATH` and `HOME` on POSIX), not the full parent environment. Set `inheritDefaultEnv: false` on a server to pass only the variables you list in `env`.
- **Outbound host restriction**: Set `allowedHosts` when HTTP server URLs come from untrusted configuration to restrict the hosts that the client can contact. The default fetch path also blocks redirect hops before sending them. A custom `fetch` is validated against its final response URL only after the request, so it must enforce its own redirect policy when outbound contact must be prevented.
- **Tool response trust**: tool results are untrusted model input. Use [input and output processors](https://mastra.ai/docs/agents/processors) to inspect or sanitize content before it reaches the model, and `requireToolApproval` to gate sensitive tools.

Visit the [MCPClient security reference](https://mastra.ai/reference/tools/mcp-client) for enforcement details of each option.

#### MCP registries

Registries provide hosted or packaged MCP servers. The client configuration above works with registry endpoints and commands.

| Registry                                        | Connection          | Notes                                         |
| ----------------------------------------------- | ------------------- | --------------------------------------------- |
| [Klavis AI](https://klavis.ai)                  | Hosted HTTP         | Enterprise authentication and managed servers |
| [mcp.run](https://www.mcp.run/)                 | Signed hosted URL   | Treat the profile URL as a secret             |
| [Composio](https://mcp.composio.dev)            | Hosted URL          | URLs are often tied to one user account       |
| [Smithery](https://smithery.ai)                 | CLI or hosted URL   | Run local packages through `npx`              |
| [Apify](https://mcp.apify.com)                  | Hosted HTTP         | Authenticate with an Apify API token          |
| [Ampersand](https://docs.withampersand.com/mcp) | Hosted URL or stdio | Connect to configured SaaS integrations       |

Store signed URLs, API keys, and tokens in environment variables. Follow the registry's documentation to obtain the endpoint, command, and credentials for each server.

### Expose a Mastra MCP server

Create an `MCPServer` to expose Mastra primitives to external MCP clients:

```typescript
import { MCPServer } from '@mastra/mcp'
import { assistant } from '../agents/assistant'
import { weatherTool } from '../tools/weather'
import { weatherWorkflow } from '../workflows/weather'

export const mcpServer = new MCPServer({
  id: 'my-mcp-server',
  name: 'My MCP Server',
  version: '1.0.0',
  agents: { assistant },
  tools: { weatherTool },
  workflows: { weatherWorkflow },
})
```

Register the server on the main `Mastra` instance:

```typescript
import { Mastra } from '@mastra/core/mastra'
import { mcpServer } from './mcp/server'

export const mastra = new Mastra({
  mcpServers: { mcpServer },
})
```

> **Authentication:** Protect HTTP MCP servers with OAuth middleware. Visit [OAuth protection](https://mastra.ai/reference/tools/mcp-server) for setup instructions.

Registered servers are served at `/api/mcp/:serverId/mcp` over Streamable HTTP. Because every request is self-contained, the same server runs unchanged on long-lived hosts and serverless platforms.

A tool that needs something from the user before it can finish calls `context.suspend()` with a payload and declares a `resumeSchema`. The server turns that into an `input_required` round and runs the tool again with the answer in `context.resumeData`. Clients answer those rounds with the `inputRequests` handler on their server definition. Visit [Asking the caller for input](https://mastra.ai/reference/tools/mcp-server) and [Answering input requests](https://mastra.ai/reference/tools/mcp-client).

Visit the [`MCPServer` reference](https://mastra.ai/reference/tools/mcp-server) for prompts, resources, transports, and other server options.

#### Publish a stdio server package

Package a server that uses the standard input/output (stdio) transport when you want clients to run it locally through a command such as `npx`. Create a separate executable entry point that starts the server:

```typescript
#!/usr/bin/env node
import { mcpServer } from './server'

mcpServer.startStdio().catch(error => {
  console.error('Failed to start MCP server:', error)
  process.exit(1)
})
```

Build the entry point as an executable Node.js file, then point the package's `bin` field to that output. Include the built file in the published package and keep the shebang as its first line:

```json
{
  "bin": {
    "my-mcp-server": "dist/stdio.js"
  },
  "files": ["dist"]
}
```

After publishing the package, configure clients to run it by package name:

```typescript
import { MCPClient } from '@mastra/mcp'

const mcpClient = new MCPClient({
  servers: {
    myServer: {
      command: 'npx',
      args: ['-y', '@your-org/my-mcp-server@1.0.0'],
    },
  },
})
```

Visit the [npm package publishing documentation](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages) for package naming, authentication, and publication commands.

### Build MCP Apps

The [MCP Apps extension](https://github.com/modelcontextprotocol/ext-apps) lets MCP tools serve interactive HTML interfaces through `ui://` resources. Mastra Studio renders these apps in sandboxed iframes on tool pages and in agent chat.

Use an MCP App when a tool result benefits from interaction, such as a form, calculator, color picker, or data visualization.

#### Define an app resource

Return a short `content` summary for the model and place UI data in `structuredContent`. Link the tool to its app by setting `mcp._meta.ui.resourceUri` to the same `ui://` URI used in `appResources`:

```typescript
import { MCPServer } from '@mastra/mcp'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

export const calculatorTool = createTool({
  id: 'calculatorWithUI',
  description: 'Calculate the sum of two numbers',
  inputSchema: z.object({
    num1: z.number(),
    num2: z.number(),
  }),
  mcp: {
    _meta: { ui: { resourceUri: 'ui://calculator/main' } },
  },
  execute: async ({ num1, num2 }) => ({
    content: [{ type: 'text', text: 'The result is displayed in the calculator app.' }],
    structuredContent: { result: num1 + num2 },
  }),
})

export const calculatorMcpServer = new MCPServer({
  id: 'calculator-app-server',
  name: 'Calculator App Server',
  version: '1.0.0',
  tools: { calculatorTool },
  appResources: {
    'ui://calculator/main': {
      name: 'Calculator',
      htmlPath: './src/mastra/mcp/calculator.html',
    },
  },
})
```

The model sees `content`, while the app receives `structuredContent`. Visit [`appResources`](https://mastra.ai/reference/tools/mcp-server) for inline HTML, file paths, metadata, and content security policy options.

#### Connect the app to Studio

Use the `App` class from `@modelcontextprotocol/ext-apps` inside the HTML resource. Register event handlers before calling `connect()`:

```html
<!doctype html>
<html>
  <body>
    <p id="result">Waiting for input</p>
    <button id="recalculate">Recalculate</button>

    <script type="module">
      import { App } from 'https://cdn.jsdelivr.net/npm/@modelcontextprotocol/ext-apps/+esm'

      const app = new App({ name: 'Calculator', version: '1.0.0' })
      let toolInput

      app.ontoolinput = params => {
        toolInput = params.arguments
      }

      document.querySelector('#recalculate').addEventListener('click', async () => {
        const result = await app.callServerTool({
          name: 'calculatorWithUI',
          arguments: toolInput,
        })
        document.querySelector('#result').textContent = JSON.stringify(result)

        await app.sendMessage({
          role: 'user',
          content: [{ type: 'text', text: 'Explain the recalculated result.' }],
        })
      })

      await app.connect()
    </script>
  </body>
</html>
```

The guest-side APIs serve different parts of the interaction:

| API                    | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `app.ontoolinput`      | Receive the arguments from the host tool call         |
| `app.callServerTool()` | Call an MCP tool from inside the iframe               |
| `app.sendMessage()`    | Add a user message to chat and start a new model turn |
| `app.connect()`        | Connect to the host after registering event handlers  |

The interaction follows this sequence:

1. The agent calls the tool.
2. The tool returns model-facing `content` and UI-facing `structuredContent`.
3. Studio renders the associated app resource.
4. The app receives tool input and can call server tools or send chat messages.

Visit the external [`App` API reference](https://apps.extensions.modelcontextprotocol.io/api/classes/app.App.html) for all guest-side methods and lifecycle hooks.

#### Register MCP Apps

For a local app, pass the tool to an agent and register its MCP server on `Mastra`:

```typescript
import { Agent } from '@mastra/core/agent'
import { Mastra } from '@mastra/core/mastra'
import { calculatorMcpServer, calculatorTool } from './mcp/calculator'

const calculatorAgent = new Agent({
  id: 'calculator-agent',
  name: 'Calculator Agent',
  instructions: 'Use the calculator tool for arithmetic.',
  model: 'openai/gpt-5-mini',
  tools: { calculatorTool },
})

export const mastra = new Mastra({
  agents: { calculatorAgent },
  mcpServers: { calculatorMcpServer },
})
```

For an external MCP server that implements MCP Apps, load its tools with `MCPClient.listTools()` and register its proxy so Studio can resolve the remote app resources:

```typescript
import { Agent } from '@mastra/core/agent'
import { Mastra } from '@mastra/core/mastra'
import { mcpClient } from './mcp/client'

const tools = await mcpClient.listTools()
const mcpServers = mcpClient.toMCPServerProxies()

const agent = new Agent({
  id: 'remote-app-agent',
  name: 'Remote App Agent',
  instructions: 'Use the available remote tools.',
  model: 'openai/gpt-5-mini',
  tools,
})

export const mastra = new Mastra({
  agents: { agent },
  mcpServers,
})
```

Tools loaded through `listTools()` include a `serverId` in `_meta.ui`, allowing Studio to resolve each app resource without scanning every server. Visit [`toMCPServerProxies()`](https://mastra.ai/reference/tools/mcp-client) for proxy configuration details.

#### Sandbox security

Mastra Studio uses [`@mcp-ui/client`](https://www.npmjs.com/package/@mcp-ui/client) to load app HTML through a sandbox proxy and communicate over JSON-RPC with `postMessage`.

App iframes allow scripts, forms, and popups. They can't access the parent page's DOM, cookies, or storage. The host controls all communication with the guest app.

### Next steps

- [Use tools with agents](https://mastra.ai/docs/agents/tools)
- [`MCPClient` reference](https://mastra.ai/reference/tools/mcp-client)
- [`MCPServer` reference](https://mastra.ai/reference/tools/mcp-server)
- [MCP Apps extension specification](https://github.com/modelcontextprotocol/ext-apps)

---

## Source: A2A (`docs/connections/a2a`)

Canonical URL: `https://mastra.ai/docs/connections/a2a.md`

## A2A (Agent-to-Agent)

Mastra supports version 0.3.0 of the [Agent-to-Agent (A2A) protocol](https://a2a-protocol.org/latest/) for cross-platform multi-agent systems. Use A2A to expose Mastra agents as remote agents or consume remote A2A agents as Mastra subagents. You can also call A2A endpoints with the JavaScript client SDK.

A2A is an open protocol for delegating work to agents across network, framework, vendor, and language boundaries. A remote agent keeps its own tools, prompts, memory, workflows, and infrastructure private while exposing a protocol endpoint that other systems can discover and call.

### When to use A2A

- A parent agent should delegate work to a specialized remote agent.
- A remote agent is owned by another service, team, vendor, or runtime.
- A backend, browser app, or another A2A-compatible system needs programmatic access to a Mastra agent.
- Long-running remote work needs task IDs, status updates, artifacts, cancellation, resubscription, or push notifications.

### How A2A works

A2A uses an agent card for discovery. The card is a JSON document served from a well-known URL. It describes the remote agent and includes the execution URL that accepts A2A JSON-RPC requests.

When using the default Mastra Server `apiPrefix` of `/api`, an agent registered as `weather-agent` exposes:

- Agent card: `/api/.well-known/weather-agent/agent-card.json`
- Execution endpoint: `/api/a2a/weather-agent`

An agent card includes fields like the agent name, description, endpoint URL, provider, capabilities, security metadata, and skills:

```json
{
  "protocolVersion": "0.3.0",
  "name": "Weather Agent",
  "description": "Provides weather information.",
  "url": "https://agent.example.com/api/a2a/weather-agent",
  "version": "1.0",
  "provider": {
    "organization": "Acme",
    "url": "https://acme.example.com"
  },
  "capabilities": {
    "streaming": true,
    "pushNotifications": true,
    "stateTransitionHistory": false
  },
  "defaultInputModes": ["text/plain"],
  "defaultOutputModes": ["text/plain"],
  "skills": [
    {
      "id": "weather",
      "name": "weather",
      "description": "Gets weather conditions for a location.",
      "tags": ["tool"]
    }
  ]
}
```

A2A represents work as messages and tasks. Messages carry text, file, or structured data parts.

Tasks are stateful units of work with IDs and lifecycle states. Clients can follow long-running work and send follow-up turns. They can also cancel work or resubscribe after a disconnect.

### Protocol versions

Mastra supports A2A Protocol v0.3 and v1.0 on the same agent card and execution URLs. The `A2A-Version` request header selects the wire protocol:

- Missing, empty, or `0.3`: Uses the existing v0.3 API.
- `1.0`: Uses the v1.0 API.
- Any other value: Returns a `VersionNotSupported` protocol error.

`A2AAgent` and `MastraClient.getA2A()` use v0.3 by default. Set `protocolVersion: '1.0'` on `A2AAgent` for v1.0 subagent delegation, or use `MastraClient.getA2AV1()` for direct v1.0 requests. Both v1.0 clients send `A2A-Version: 1.0` automatically. The direct v1.0 client also adds the `tasks/list` operation.

Import v1.0 protocol types and codecs from `@mastra/core/a2a/v1`. The existing `@mastra/core/a2a/client` export remains on v0.3.

### Get started

A2A has two common paths in Mastra:

- Consume a remote A2A agent as a Mastra subagent with `A2AAgent`.
- Send requests to a Mastra A2A endpoint with `MastraClient.getA2A()`.

Use `A2AAgent` when another Mastra agent should delegate work to a remote agent. Use the client SDK when application code needs to call an A2A-enabled Mastra endpoint directly.

### Consume A2A agents as subagents

Use `A2AAgent` to wrap a remote A2A agent, then add it to a parent agent with the [supervisor agents](https://mastra.ai/docs/subagents) pattern. Pass an explicit agent card URL when the remote server hosts multiple agents or uses a custom well-known path. Set `protocolVersion: '1.0'` when the remote agent requires A2A v1.0. Omit it to use v0.3.

```typescript
import { Agent } from '@mastra/core/agent'
import { A2AAgent } from '@mastra/core/a2a'

const remoteWeatherAgent = new A2AAgent({
  url: 'https://weather.example.com/api/.well-known/weather-agent/agent-card.json',
  protocolVersion: '1.0',
  headers: {
    Authorization: `Bearer ${process.env.WEATHER_AGENT_TOKEN}`,
  },
})

export const supportAgent = new Agent({
  id: 'support-agent',
  name: 'Support Agent',
  instructions: 'Answer user questions and delegate weather questions when needed.',
  model: 'openai/gpt-5.6-sol',
  agents: {
    remoteWeatherAgent,
  },
})
```

If `url` points to a domain, `A2AAgent` fetches the agent card from `/.well-known/agent-card.json`. Use a domain URL for single-agent servers that follow that discovery path. For multi-agent servers, pass the full card URL, such as `https://agent.example.com/api/.well-known/weather-agent/agent-card.json`.

During execution, `A2AAgent`:

- Fetches and caches the remote agent card.
- Reads the execution URL and capabilities from the card.
- Calls `message/send` or `message/stream` with v0.3, and `SendMessage` or `SendStreamingMessage` with v1.0.
- Converts remote messages, tasks, artifacts, and status updates into Mastra subagent results.
- Supports `resumeGenerate()` and `resumeStream()` when the remote task requires follow-up input or resubscription.

If the remote card doesn't advertise streaming support, `A2AAgent.stream()` falls back to the non-streaming generate path and returns a buffered stream result.

### Send requests with the client SDK

Use `MastraClient.getA2A()` when you want application code to call an A2A-enabled Mastra agent. Configure `baseUrl` for the server origin and `apiPrefix` when the server doesn't use the default `/api` prefix.

```typescript
import { MastraClient } from '@mastra/client-js'

const client = new MastraClient({
  baseUrl: 'https://agent.example.com',
  headers: {
    Authorization: `Bearer ${process.env.AGENT_API_TOKEN}`,
  },
})

const a2a = client.getA2A('weather-agent')
const card = await a2a.getAgentCard()

console.log(card.name, card.capabilities)
```

Use `sendMessageStream()` to send a message and receive task status and artifact updates over Server-Sent Events (SSE):

```typescript
const stream = a2a.sendMessageStream({
  message: {
    kind: 'message',
    role: 'user',
    messageId: crypto.randomUUID(),
    parts: [{ kind: 'text', text: "What's the weather in Prague?" }],
  },
})

for await (const event of stream) {
  if (event.kind === 'artifact-update') {
    console.log(event.artifact.parts)
  }
}
```

If a stream disconnects while a task is still running, use `resubscribeTask()` to receive live updates for the in-progress task:

```typescript
const updates = a2a.resubscribeTask({
  id: 'task-123',
})

for await (const event of updates) {
  console.log(event)
}
```

#### Use the v1.0 client

Use `getA2AV1()` to opt into the A2A v1.0 wire protocol. The protocol package provides codecs for creating v1 request values from JSON-shaped input:

```typescript
import { ListTasksRequest } from '@mastra/core/a2a/v1'
import { MastraClient } from '@mastra/client-js'

const client = new MastraClient({
  baseUrl: 'https://agent.example.com',
})

const a2a = client.getA2AV1('weather-agent')
const response = await a2a.listTasks(
  ListTasksRequest.fromJSON({
    contextId: 'customer-support',
    pageSize: 20,
  }),
)

for (const task of response.tasks) {
  console.log(task.id, task.status)
}
```

The v1.0 client supports `getAgentCard()`, `sendMessage()`, `sendMessageStream()`, `getTask()`, `listTasks()`, `cancelTask()`, and `resubscribeTask()`.

### Configure subagent calls

`A2AAgent` accepts request options for authenticated or constrained environments:

```typescript
import { A2AAgent } from '@mastra/core/a2a'

const remoteWeatherAgent = new A2AAgent({
  url: 'https://weather.example.com/api/.well-known/weather-agent/agent-card.json',
  headers: {
    Authorization: `Bearer ${process.env.WEATHER_AGENT_TOKEN}`,
  },
  retries: 2,
  backoffMs: 250,
  maxBackoffMs: 1000,
  timeoutMs: 30_000,
})
```

You can also pass `credentials`, `fetch`, and `abortSignal` when the runtime needs custom fetch behavior or request cancellation.

### Human-in-the-loop

A2A models human-in-the-loop (HITL) work with the `input-required` task state. When a task pauses for input, the client provides the missing input by sending a follow-up message with the same `taskId`, and the server continues the task.

Mastra maps its agent suspension model to this state in both directions:

- **As a server**: when an exposed agent suspends, the task transitions to `input-required`. This includes suspensions caused by [tool approval](https://mastra.ai/docs/agents/human-in-the-loop) or a tool that calls `suspend()`. The task status message includes a text prompt and a data part with the structured `suspendPayload` and `resumeSchema`. A follow-up `message/send` or `message/stream` request with the same `taskId` resumes the suspended run with the provided input.
- **As a client**: when a remote task reaches `input-required` or `auth-required`, `A2AAgent` returns a suspended result with `finishReason: 'suspended'` and a `suspendPayload`. Calling `resumeGenerate()` or `resumeStream()` sends the input or credentials back to the remote task with the original `taskId`.

```typescript
import { A2AAgent } from '@mastra/core/a2a'

const agent = new A2AAgent({
  url: 'https://agent.example.com/api/.well-known/booking-agent/agent-card.json',
})

const result = await agent.generate('Book a flight to Paris', { runId: 'run-1' })

if (result.finishReason === 'suspended') {
  // Inspect result.suspendPayload, collect input from a human,
  // then resume the remote task.
  const resumed = await agent.resumeGenerate({ approved: true }, { runId: 'run-1' })
  console.log(resumed.text)
}
```

Follow-up messages for an `input-required` task can carry the resume data as a structured data part, or as JSON or plain text in a text part.

When a resumed run requires additional input, the task returns to `input-required` and the flow repeats. Resuming a suspended run requires storage configured on the Mastra server so the suspended run state can be restored across requests.

> **Note:** A2A task records live in an in-memory store, so a paused task can only be resumed by the same server process that suspended it. A server restart or a horizontally scaled deployment without sticky routing loses the task record, and a follow-up message fails with a task-not-found error.

### Push notifications

Mastra supports A2A push notifications for remote agents that advertise `capabilities.pushNotifications`. Use push notifications when a client can't keep a stream open, or when a long-running task should update a callback URL after the original request ends.

After a client has a task ID, it can register a callback URL for that task:

```typescript
await a2a.setTaskPushNotificationConfig({
  taskId: 'task-123',
  pushNotificationConfig: {
    url: 'https://app.example.com/a2a/tasks',
    token: process.env.A2A_WEBHOOK_TOKEN,
  },
})
```

Mastra Server sends the current task snapshot to registered callbacks when the task reaches `completed`, `failed`, `canceled`, `rejected`, `input-required`, or `auth-required`. Push notification delivery is best-effort. Protect callback URLs, validate notification tokens, and avoid exposing internal network targets as push notification destinations.

Push notification configurations are stored in memory and must be registered again after a server restart.

### Sign and verify agent cards

Mastra supports signed A2A agent cards so clients can verify that a discovered card came from a trusted publisher and wasn't changed in transit. Configure signing on the Mastra server that exposes the remote agent:

```typescript
import { Mastra } from '@mastra/core/mastra'

export const mastra = new Mastra({
  server: {
    a2a: {
      agentCardSigning: {
        privateKey: process.env.A2A_AGENT_CARD_PRIVATE_KEY!,
        protectedHeader: {
          alg: 'ES256',
          kid: 'agent-card-key',
        },
      },
    },
  },
})
```

When signing is configured, Mastra includes a `signatures` array on the agent card. Client verification is opt-in, and unsigned cards still return unchanged.

Verify a signed card with `MastraClient.getA2A()`:

```typescript
const card = await a2a.getAgentCard({
  verifySignature: {
    algorithms: ['ES256'],
    keyProvider: async ({ kid, jku }) => {
      return fetchTrustedPublicJwk({ kid, jku })
    },
  },
})

if (!card.signatures?.length) {
  throw new Error('Expected a signed A2A agent card.')
}
```

Use client-side signature verification when a client must enforce trusted keys before calling the remote agent.

### Verify subagent cards

Use `verifyAgentCard` when a parent agent should validate a remote agent before delegating work to it. The verification hook receives the fetched agent card and context about where and when it was fetched.

```typescript
import { A2AAgent } from '@mastra/core/a2a'

const remoteWeatherAgent = new A2AAgent({
  url: 'https://weather.example.com/api/.well-known/weather-agent/agent-card.json',
  verifyAgentCard: {
    verify: async (card, context) => {
      if (card.provider?.organization !== 'Weather Inc') {
        throw new Error(`Unexpected provider for ${context.cardUrl}`)
      }
    },
  },
})
```

Use this hook to enforce expected providers, expected endpoints, certificate-bound identities, signed cards, or other trust requirements before a parent agent delegates to the remote agent.

### Related

- [Agent reference](https://mastra.ai/reference/agents/agent)
- [JavaScript client agents reference](https://mastra.ai/reference/client-js/agents)
- [A2A core concepts](https://a2a-protocol.org/latest/topics/key-concepts/)
- [A2A discovery guide](https://a2a-protocol.org/latest/topics/agent-discovery/)
- 📹 [Agent-to-agent with Mastra workshop](https://www.youtube.com/watch?v=LQDzyNGm-aw)

---

## Source: ACP (`docs/connections/acp`)

Canonical URL: `https://mastra.ai/docs/connections/acp.md`

## Agent Client Protocol

Mastra supports the [Agent Client Protocol (ACP)](https://agentclientprotocol.com/overview/introduction) for running ACP-compatible coding agents from a Mastra agent. Use `@mastra/acp` to wrap a coding agent process as a Mastra tool or as a subagent.

ACP is useful for coding agents such as Claude Code, Cline, OpenCode, Amp, Codex, or any other executable that implements ACP over standard input and output.

### When to use ACP

- A Mastra agent should delegate code inspection, editing, or repository tasks to an external coding agent.
- An ACP-compatible agent process should stay alive across calls so it can keep session context.
- A parent agent needs real-time output from a coding agent while the task runs.
- An ACP-compatible agent needs permission prompts before it reads files or writes files, or alternatively runs actions.
- File access should go through Mastra's workspace abstraction instead of direct process-only file access.

### How ACP works

`@mastra/acp` starts the configured ACP agent command as a child process and communicates with it using newline-delimited JSON over standard input and output.

The flow is:

1. Configure `command`, `args`, and optional connection settings.
2. `@mastra/acp` spawns the ACP agent process on first use.
3. The client sends ACP `initialize` and `session/new` requests.
4. Mastra sends the user task to the ACP agent with `session/prompt`.
5. The ACP agent streams session updates and message chunks back to Mastra.
6. Mastra returns the buffered output or emits streaming chunks, or alternatively handles permission input.
7. The ACP connection stops the process after the prompt when `persistSession` is `false`. `AcpAgent` can keep a reusable process alive across calls by default.

During execution, the ACP client also handles permission requests and file operations. File reads and writes that the agent requests through the protocol go through Mastra's `Workspace`. The workspace covers only those requests: the agent process runs with the configured `cwd` and isn't sandboxed or isolated, and it can still reach files through its own tools and shell commands.

### Compatible agents

Any executable that implements ACP over standard input and output works with `@mastra/acp`. You don't need a dedicated Mastra package for each agent. Install the agent, then pass its launch command through `command` and `args`.

| Agent      | `command`  | `args`      |
| ---------- | ---------- | ----------- |
| Cline      | `cline`    | `['--acp']` |
| OpenCode   | `opencode` | `['acp']`   |
| Gemini CLI | `gemini`   | `['--acp']` |

Each agent documents its own ACP mode, and launch flags change between releases. Check the agent's documentation for the current command, such as [Cline ACP](https://docs.cline.bot/usage/acp) or [OpenCode ACP](https://opencode.ai/docs/acp/).

### Getting started

Install `@mastra/acp` in a project that already uses `@mastra/core`. The package requires `@mastra/core` version `1.34.0` or later.

**npm**:

```bash
npm install @mastra/acp
```

**pnpm**:

```bash
pnpm add @mastra/acp
```

**Yarn**:

```bash
yarn add @mastra/acp
```

**Bun**:

```bash
bun add @mastra/acp
```

`@mastra/acp` exports two APIs:

- [`createACPTool()`](https://mastra.ai/reference/acp/create-acp-tool): Create a Mastra tool that sends a `task` string to an ACP agent and returns an `output` string.
- [`AcpAgent`](https://mastra.ai/reference/acp/acp-agent): Wrap an ACP agent as a Mastra subagent with `generate()` and `stream()` support.

### Use ACP as a subagent

Use `AcpAgent` when a parent Mastra agent should delegate directly to an ACP-compatible coding agent as a subagent.

```typescript
import { AcpAgent } from '@mastra/acp'
import { Agent } from '@mastra/core/agent'

const codeAgent = new AcpAgent({
  id: 'code-agent',
  name: 'Code Agent',
  description: 'An ACP-compatible coding agent that can inspect and edit files',
  command: 'opencode',
  args: ['acp'],
  cwd: process.cwd(),
})

export const codeSupervisor = new Agent({
  id: 'code-supervisor',
  name: 'Code Supervisor',
  instructions: 'Delegate code editing tasks to the code-agent subagent.',
  model: 'openai/gpt-5.6-sol',
  agents: {
    codeAgent,
  },
})
```

See the [AcpAgent reference](https://mastra.ai/reference/acp/acp-agent) for all options, methods, and configuration.

### Use ACP as a tool

Use `createACPTool()` when the parent Mastra agent should decide when to call the ACP agent as a tool.

```typescript
import { createACPTool } from '@mastra/acp'
import { Agent } from '@mastra/core/agent'

const codeAgentTool = createACPTool({
  id: 'code-agent',
  description: 'Use an ACP-compatible coding agent to inspect and edit code',
  command: 'opencode',
  args: ['acp'],
  cwd: process.cwd(),
})

export const codeSupervisor = new Agent({
  id: 'code-supervisor',
  name: 'Code Supervisor',
  instructions: 'Use the code-agent tool when a task requires repository inspection or code edits.',
  model: 'openai/gpt-5.6-sol',
  tools: {
    codeAgentTool,
  },
})
```

See the [createACPTool() reference](https://mastra.ai/reference/acp/create-acp-tool) for all options and configuration.

### Model selection

ACP agents may expose selectable models. Pass `model` in the ACP configuration to select a model after session creation, or use `AcpAgent.getAvailableModels()` and `AcpAgent.setModel()` to manage models at runtime.

See the [AcpAgent model management methods](https://mastra.ai/reference/acp/acp-agent) for examples.

### Session lifecycle

`AcpAgent` starts the configured command on first use and creates an ACP session. By default, `persistSession` is `true`. The child process stays alive across calls. Set `persistSession: false` when each prompt should run in an isolated process.

See the [AcpAgent session lifecycle](https://mastra.ai/reference/acp/acp-agent) section for details.

### Permission handling

ACP agents may ask the client to choose a permission option before they continue. By default, `@mastra/acp` selects the first option returned by the ACP agent. Pass `onPermissionRequest` when you need custom permission behavior.

See the [createACPTool() permission handling](https://mastra.ai/reference/acp/create-acp-tool) section for a complete example.

### Workspace integration

ACP file requests go through Mastra's workspace abstraction. `AcpAgent` can use a `workspace` option, and `createACPTool()` uses the current Mastra workspace from the tool execution context when one is available. Without a workspace, `@mastra/acp` falls back to a `Workspace` backed by `LocalFilesystem` at `cwd` or `process.cwd()`.

See the [AcpAgent workspace integration](https://mastra.ai/reference/acp/acp-agent) section for custom workspace examples.

### Related

- [AcpAgent reference](https://mastra.ai/reference/acp/acp-agent)
- [createACPTool() reference](https://mastra.ai/reference/acp/create-acp-tool)
- [Agent reference](https://mastra.ai/reference/agents/agent)
- [Subagents](https://mastra.ai/docs/subagents)
- [Agent Client Protocol introduction](https://agentclientprotocol.com/overview/introduction)
- [Agent Client Protocol schema](https://agentclientprotocol.com/protocol/schema)

---

## Source: SDK Agents (`docs/connections/sdk-agents`)

Canonical URL: `https://mastra.ai/docs/connections/sdk-agents.md`

## SDK agents

SDK agents let you use other agent SDK frameworks inside Mastra. Use them to register SDK-backed agents in a Mastra project while the provider SDK keeps its own runtime, tools, permissions, and agent loop.

### When to use SDK agents

- A vendor SDK already owns the agent loop, tools, permissions, or local runtime.
- You want to register that SDK-backed agent in a Mastra project.
- You need Mastra-compatible `generate()` and `stream()` outputs.
- You want usage, cost, and tool activity from the SDK run to appear in Mastra observability.

### Supported SDK agents

- [Claude Agent SDK](#claude-agent-sdk): Use `@mastra/claude` to register a Claude SDK agent and call it with Mastra `generate()` and `stream()`.
- [Cursor Agent SDK](#cursor-agent-sdk): Use `@mastra/cursor` to register a Cursor SDK agent and call it with Mastra `generate()` and `stream()`.
- [OpenAI Agents SDK](#openai-agents-sdk): Use `@mastra/openai` to register an OpenAI SDK agent and call it with Mastra `generate()` and `stream()`.

Coding agents without a dedicated Mastra package, such as Cline and OpenCode, run through the [Agent Client Protocol](https://mastra.ai/docs/connections/acp) instead.

### Claude Agent SDK

Use `@mastra/claude` for Claude Code runtime configuration, permissions, tools, and agent-loop behavior.

#### Install Claude packages

Install the Mastra package and the Claude Agent SDK peer dependency:

**npm**:

```bash
npm install @mastra/claude @anthropic-ai/claude-agent-sdk
```

**pnpm**:

```bash
pnpm add @mastra/claude @anthropic-ai/claude-agent-sdk
```

**Yarn**:

```bash
yarn add @mastra/claude @anthropic-ai/claude-agent-sdk
```

**Bun**:

```bash
bun add @mastra/claude @anthropic-ai/claude-agent-sdk
```

Set the Claude SDK credential:

```bash
export ANTHROPIC_API_KEY="..."
```

#### Create a Claude SDK agent

Configure Claude Agent SDK through `sdkOptions`.

```typescript
import { ClaudeSDKAgent } from '@mastra/claude'

export const claudeSDKAgent = new ClaudeSDKAgent({
  id: 'claude-sdk-agent',
  name: 'Claude SDK Agent',
  description: 'Use Claude Agent SDK through Mastra.',
  sdkOptions: {
    model: 'claude-sonnet-4-6',
    cwd: process.cwd(),
  },
})
```

#### Add Claude SDK tools

Claude Agent SDK tools are provided through Claude SDK Model Context Protocol (MCP) servers. Create the server with the Claude SDK, then pass it through `sdkOptions.mcpServers`.

```typescript
import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { ClaudeSDKAgent } from '@mastra/claude'
import { getTemperature } from '../tools/get-temperature'

const weatherServer = createSdkMcpServer({
  name: 'weather',
  version: '1.0.0',
  tools: [getTemperature],
})

export const claudeSDKAgent = new ClaudeSDKAgent({
  id: 'claude-sdk-agent',
  name: 'Claude SDK Agent',
  description: 'Use Claude Agent SDK through Mastra.',
  sdkOptions: {
    model: 'claude-sonnet-4-6',
    cwd: process.cwd(),
    mcpServers: {
      weather: weatherServer,
    },
    allowedTools: ['mcp__weather__get_temperature'],
  },
})
```

The `allowedTools` value uses Claude Agent SDK MCP tool naming: `mcp__<server name>__<tool name>`.

### Cursor Agent SDK

Use `@mastra/cursor` to register a Cursor SDK agent in Mastra while keeping Cursor-specific setup in Cursor SDK options.

#### Install Cursor packages

Install the Mastra package and the Cursor SDK peer dependency:

**npm**:

```bash
npm install @mastra/cursor @cursor/sdk
```

**pnpm**:

```bash
pnpm add @mastra/cursor @cursor/sdk
```

**Yarn**:

```bash
yarn add @mastra/cursor @cursor/sdk
```

**Bun**:

```bash
bun add @mastra/cursor @cursor/sdk
```

Set the Cursor SDK credential:

```bash
export CURSOR_API_KEY="..."
```

#### Create a Cursor SDK agent

Configure Cursor Agent SDK through `sdkOptions`.

```typescript
import { CursorSDKAgent } from '@mastra/cursor'

export const cursorSDKAgent = new CursorSDKAgent({
  id: 'cursor-sdk-agent',
  name: 'Cursor SDK Agent',
  description: 'Use Cursor Agent SDK through Mastra.',
  sdkOptions: {
    apiKey: process.env.CURSOR_API_KEY,
    model: {
      id: 'gpt-5',
    },
    local: {
      cwd: process.cwd(),
    },
  },
})
```

Cursor local agents require an explicit model. Set it in `sdkOptions.model`.

#### Use an existing Cursor SDK agent

If your app already creates a Cursor SDK agent, pass that agent to `CursorSDKAgent` instead:

```typescript
import { Agent as CursorAgent } from '@cursor/sdk'
import { CursorSDKAgent } from '@mastra/cursor'

const cursorAgent = CursorAgent.create({
  apiKey: process.env.CURSOR_API_KEY,
  model: {
    id: 'gpt-5',
  },
  local: {
    cwd: process.cwd(),
  },
})

export const cursorSDKAgent = new CursorSDKAgent({
  id: 'cursor-sdk-agent',
  name: 'Cursor SDK Agent',
  description: 'Use Cursor Agent SDK through Mastra.',
  agent: cursorAgent,
})
```

#### Add Cursor SDK tools

Cursor Agent SDK tools are configured with Cursor SDK options. Pass Model Context Protocol (MCP) servers through `sdkOptions.mcpServers`:

```typescript
import { CursorSDKAgent } from '@mastra/cursor'
import { mcpServers } from '../mcp/cursor'

export const cursorSDKAgent = new CursorSDKAgent({
  id: 'cursor-sdk-agent',
  name: 'Cursor SDK Agent',
  description: 'Use Cursor Agent SDK through Mastra.',
  sdkOptions: {
    apiKey: process.env.CURSOR_API_KEY,
    model: {
      id: 'gpt-5',
    },
    local: {
      cwd: process.cwd(),
    },
    mcpServers,
  },
})
```

### OpenAI Agents SDK

Use `@mastra/openai` to register an OpenAI Agents SDK agent in Mastra while keeping OpenAI-specific agent settings in OpenAI SDK options.

#### Install OpenAI packages

Install the Mastra package and the OpenAI Agents SDK peer dependency:

**npm**:

```bash
npm install @mastra/openai @openai/agents zod
```

**pnpm**:

```bash
pnpm add @mastra/openai @openai/agents zod
```

**Yarn**:

```bash
yarn add @mastra/openai @openai/agents zod
```

**Bun**:

```bash
bun add @mastra/openai @openai/agents zod
```

Set the OpenAI SDK credential:

```bash
export OPENAI_API_KEY="..."
```

#### Create an OpenAI SDK agent

Configure OpenAI Agents SDK through `sdkOptions`. `OpenAISDKAgent` creates the OpenAI SDK agent on first use.

```typescript
import { OpenAISDKAgent } from '@mastra/openai'

export const openaiSDKAgent = new OpenAISDKAgent({
  id: 'openai-sdk-agent',
  name: 'OpenAI SDK Agent',
  description: 'Use OpenAI Agents SDK through Mastra.',
  sdkOptions: {
    name: 'Repository assistant',
    instructions: 'Answer clearly and cite the relevant files.',
    model: 'gpt-5',
  },
})
```

#### Use an existing OpenAI SDK agent

If your app already creates an OpenAI SDK agent, pass that agent to `OpenAISDKAgent` instead:

```typescript
import { Agent as OpenAIAgent } from '@openai/agents'
import { OpenAISDKAgent } from '@mastra/openai'

const sdkAgent = new OpenAIAgent({
  name: 'Repository assistant',
  instructions: 'Answer clearly and cite the relevant files.',
  model: 'gpt-5',
})

export const openaiSDKAgent = new OpenAISDKAgent({
  id: 'openai-sdk-agent',
  name: 'OpenAI SDK Agent',
  description: 'Use OpenAI Agents SDK through Mastra.',
  agent: sdkAgent,
})
```

#### Add OpenAI SDK tools

OpenAI Agents SDK tools are configured with OpenAI SDK options. Create tools with the OpenAI SDK, then pass them through `sdkOptions.tools`.

```typescript
import { tool } from '@openai/agents'
import { OpenAISDKAgent } from '@mastra/openai'
import { z } from 'zod'

const getTemperature = tool({
  name: 'get_temperature',
  description: 'Get the current temperature for a city.',
  parameters: z.object({
    city: z.string(),
  }),
  execute: async ({ city }) => {
    return `${city}: 27 C`
  },
})

export const openaiSDKAgent = new OpenAISDKAgent({
  id: 'openai-sdk-agent',
  name: 'OpenAI SDK Agent',
  description: 'Use OpenAI Agents SDK through Mastra.',
  sdkOptions: {
    name: 'Weather assistant',
    model: 'gpt-5',
    tools: [getTemperature],
  },
})
```

### Register SDK agents

Register SDK agents in the Mastra instance like other agents:

```typescript
import { Mastra } from '@mastra/core'
import { claudeSDKAgent } from './agents/claude-sdk-agent'
import { cursorSDKAgent } from './agents/cursor-sdk-agent'
import { openaiSDKAgent } from './agents/openai-sdk-agent'

export const mastra = new Mastra({
  agents: {
    claudeSDKAgent,
    cursorSDKAgent,
    openaiSDKAgent,
  },
})
```

After registration, call them with `mastra.getAgentById()`:

```typescript
import { mastra } from './index'

const agent = mastra.getAgentById('cursor-sdk-agent')
const stream = await agent.stream('Inspect this project and describe the test setup.')

for await (const chunk of stream.textStream) {
  process.stdout.write(chunk)
}
```

### Resume SDK runs

SDK agents support Mastra `resumeGenerate()` and `resumeStream()` with provider-native resume data. Pass the message to continue with and the resume identifier used by the underlying SDK.

Claude SDK agents can resume a known session with `sessionId`:

```typescript
const result = await claudeSDKAgent.resumeGenerate({
  message: 'Continue the previous task.',
  sessionId: 'claude-session-id',
})

console.log(result.text)
```

OpenAI SDK agents can resume with a previous response, conversation, or session:

```typescript
const stream = await openaiSDKAgent.resumeStream({
  message: 'Continue the previous task.',
  previousResponseId: 'resp_123',
})

for await (const chunk of stream.textStream) {
  process.stdout.write(chunk)
}
```

Cursor SDK agents can continue with the wrapped SDK agent. If you need to resume a stored Cursor SDK agent by ID, pass `agentId` in `resumeData`.

### Structured output

Claude and OpenAI SDK agents support Mastra `structuredOutput` through their provider-native structured output APIs. The validated value is available on `result.object`.

```typescript
import { z } from 'zod'

const result = await openaiSDKAgent.generate<{ summary: string }>('Summarize this project.', {
  structuredOutput: {
    schema: z.object({
      summary: z.string(),
    }),
  },
})

console.log(result.object.summary)
```

Cursor SDK agents throw a clear error when `structuredOutput` is requested because the Cursor TypeScript SDK doesn't expose a schema-constrained output API.

### Observability

SDK agents create Mastra agent and model spans for `generate()` and `stream()` calls. Mastra records SDK-provided usage, tool activity, and provider metadata when the vendor SDK exposes those events.

Claude SDK runs can include SDK-estimated cost from the Claude result message. Cursor SDK runs include token usage from Cursor interaction updates. OpenAI SDK runs include token usage from OpenAI run state.

For storage and dashboard setup, see [Observability](https://mastra.ai/docs/observability/overview).

### Related

- [Agents overview](https://mastra.ai/docs/agents/overview)
- [Tools](https://mastra.ai/docs/agents/tools)
- [Observability](https://mastra.ai/docs/observability/overview)
