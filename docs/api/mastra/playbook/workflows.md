---
title: "Mastra Playbook: Workflows & Control Flow"
slug: mastra/playbook/workflows
section: Mastra
order: 60
related:
  - mastra/overview
  - mastra/playbook-index
  - mastra/workflows-and-steps
  - mastra/agents-and-models
---

<!-- manual -->

Scraped canonical Mastra documentation for **Mastra Playbook: Workflows & Control Flow** (11 upstream pages consolidated for NEO Pulse coding agents).

## Included Pages

- **Workflows** (`docs/workflows/overview` - source: `https://mastra.ai/docs/workflows/overview.md`)
- **Workflow State** (`docs/workflows/workflow-state` - source: `https://mastra.ai/docs/workflows/workflow-state.md`)
- **Control Flow** (`docs/workflows/control-flow` - source: `https://mastra.ai/docs/workflows/control-flow.md`)
- **Agents and Tools** (`docs/workflows/agents-and-tools` - source: `https://mastra.ai/docs/workflows/agents-and-tools.md`)
- **Dynamic Workflows** (`docs/workflows/dynamic-workflows` - source: `https://mastra.ai/docs/workflows/dynamic-workflows.md`)
- **Snapshots** (`docs/workflows/snapshots` - source: `https://mastra.ai/docs/workflows/snapshots.md`)
- **Suspend and Resume** (`docs/workflows/suspend-and-resume` - source: `https://mastra.ai/docs/workflows/suspend-and-resume.md`)
- **Human-in-the-Loop** (`docs/workflows/human-in-the-loop` - source: `https://mastra.ai/docs/workflows/human-in-the-loop.md`)
- **Time Travel** (`docs/workflows/time-travel` - source: `https://mastra.ai/docs/workflows/time-travel.md`)
- **Error Handling** (`docs/workflows/error-handling` - source: `https://mastra.ai/docs/workflows/error-handling.md`)
- **Scheduled Workflows** (`docs/workflows/scheduled-workflows` - source: `https://mastra.ai/docs/workflows/scheduled-workflows.md`)

---

## Source: Workflows (`docs/workflows/overview`)

Canonical URL: `https://mastra.ai/docs/workflows/overview.md`

## Workflows

Workflows let you define complex task sequences with clear, structured steps instead of relying on one agent to reason through the entire process. You control the task breakdown along with the flow and timing of data. Workflows use the built-in execution engine by default, while managed infrastructure is available through [workflow runners](https://mastra.ai/docs/deployment/workflow-runners) such as Inngest.

**For AI agents:** Run `npx mastra api workflow run start test-workflow '{"inputData":{"message":"Hello, world!"}}'` to start this workflow directly instead of writing a temporary script. The command requires a running Mastra server; start the local server with `npx mastra dev`, or pass the reachable server's base URL with `--url`. Run `npx mastra api workflow run start --schema` before constructing different input. Install Mastra's skill with `npx skills add mastra-ai/skills --skill mastra` for complete API CLI discovery, targeting, schema, authentication, and error-handling guidance.

### When to use workflows

Use workflows for tasks that are clearly defined upfront and involve multiple steps with a specific execution order. They give you fine-grained control over how data flows and transforms between steps, and which primitives are called at each stage.

### Core principles

Mastra workflows operate using these principles:

- Defining **steps** with [`createStep`](https://mastra.ai/reference/workflows/step), specifying input/output schemas and business logic.
- Composing **steps** with [`createWorkflow`](https://mastra.ai/reference/workflows/workflow) to define the execution flow.
- Running **workflows** to execute the entire sequence, with built-in support for suspension, resumption, and streaming results.

### Creating a workflow step

Steps are the building blocks of workflows. Create a step using `createStep()` with `inputSchema` and `outputSchema` to define the data it accepts and returns. You can define both schemas using [Standard JSON Schema](https://standardschema.dev/json-schema) ([Zod](https://zod.dev/), [Valibot](https://valibot.dev/), [ArkType](https://arktype.io/), etc.).

The `execute` function defines what the step does. Use it to call functions in your codebase, external APIs, agents, or tools.

**Zod**:

```typescript
import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'

const step1 = createStep({
  id: 'step-1',
  inputSchema: z.object({
    message: z.string(),
  }),
  outputSchema: z.object({
    formatted: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { message } = inputData

    return {
      formatted: message.toUpperCase(),
    }
  },
})
```

**Valibot**:

```typescript
import { createStep } from '@mastra/core/workflows'
import * as v from 'valibot'
import { toStandardJsonSchema } from '@valibot/to-json-schema'

const step1 = createStep({
  id: 'step-1',
  inputSchema: toStandardJsonSchema(
    v.object({
      message: v.string(),
    }),
  ),
  outputSchema: toStandardJsonSchema(
    v.object({
      formatted: v.string(),
    }),
  ),
  execute: async ({ inputData }) => {
    const { message } = inputData

    return {
      formatted: message.toUpperCase(),
    }
  },
})
```

**ArkType**:

```typescript
import { createStep } from '@mastra/core/workflows'
import { type } from 'arktype'

const step1 = createStep({
  id: 'step-1',
  inputSchema: type({
    message: 'string',
  }),
  outputSchema: type({
    formatted: 'string',
  }),
  execute: async ({ inputData }) => {
    const { message } = inputData

    return {
      formatted: message.toUpperCase(),
    }
  },
})
```

Visit [`Step`](https://mastra.ai/reference/workflows/step) for a full list of configuration options.

#### Using agents and tools

Workflow steps can also call registered agents or import and execute tools directly, visit the [Using Tools](https://mastra.ai/docs/agents/tools) page for more information.

### Creating a workflow

Create a workflow using `createWorkflow()` with `inputSchema` and `outputSchema` to define the data it accepts and returns. You can define both schemas using [Standard JSON Schema](https://standardschema.dev/json-schema) ([Zod](https://zod.dev/), [Valibot](https://valibot.dev/), [ArkType](https://arktype.io/), etc.). Add steps using `.then()` and complete the workflow with `.commit()`.

**Zod**:

```typescript
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({...});

export const testWorkflow = createWorkflow({
  id: "test-workflow",
  inputSchema: z.object({
    message: z.string()
  }),
  outputSchema: z.object({
    output: z.string()
  })
})
  .then(step1)
  .commit();
```

**Valibot**:

```typescript
import { createWorkflow, createStep } from "@mastra/core/workflows";
import * as v from "valibot";
import { toStandardJsonSchema } from "@valibot/to-json-schema";

const step1 = createStep({...});

export const testWorkflow = createWorkflow({
  id: "test-workflow",
  inputSchema: toStandardJsonSchema(v.object({
    message: v.string()
  })),
  outputSchema: toStandardJsonSchema(v.object({
    output: v.string()
  }))
})
  .then(step1)
  .commit();
```

**ArkType**:

```typescript
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { type } from "arktype";

const step1 = createStep({...});

export const testWorkflow = createWorkflow({
  id: "test-workflow",
  inputSchema: type({
    message: "string"
  }),
  outputSchema: type({
    output: "string"
  })
})
  .then(step1)
  .commit();
```

Visit [Workflow Class](https://mastra.ai/reference/workflows/workflow) for a full list of configuration options.

#### Understanding control flow

Workflows can be composed using a number of different methods. The method you choose determines how each step's schema should be structured. Visit the [Control Flow](https://mastra.ai/docs/workflows/control-flow) page for more information.

### Studio

Open [Studio](https://mastra.ai/docs/studio/overview) and select a workflow from the **Workflows** tab.

- **Graph view**: The center panel visualizes the workflow's steps and execution flow.
- **Input form**: The right sidebar generates a form from the workflow's `inputSchema`. Fill it in and start the run.
- **Live status**: During execution, the graph updates each step's status in real time. The sidebar shows the workflow's input, output, state, and logs.
- [**Time travel**](https://mastra.ai/docs/workflows/time-travel): After a run completes, replay individual steps to inspect or retry them.

### Workflow state

Workflow state lets you share values across steps without passing them through every step's inputSchema and outputSchema. Use state for tracking progress or accumulating results, or alternatively sharing configuration across the entire workflow.

```typescript
const step1 = createStep({
  id: 'step-1',
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ formatted: z.string() }),
  stateSchema: z.object({ counter: z.number() }),
  execute: async ({ inputData, state, setState }) => {
    // Read from state
    console.log(state.counter)

    // Update state for subsequent steps
    setState({ ...state, counter: state.counter + 1 })

    return { formatted: inputData.message.toUpperCase() }
  },
})
```

Visit [Workflow State](https://mastra.ai/docs/workflows/workflow-state) for complete documentation on state schemas, initial state, persistence across suspend/resume, and nested workflows.

### Workflows as steps

Use a workflow as a step to reuse its logic within a larger composition. Input and output follow the same schema rules described in [Core principles](https://mastra.ai/docs/workflows/control-flow).

```typescript
const step1 = createStep({...});
const step2 = createStep({...});

const childWorkflow = createWorkflow({
  id: "child-workflow",
  inputSchema: z.object({
    message: z.string()
  }),
  outputSchema: z.object({
    emphasized: z.string()
  })
})
  .then(step1)
  .then(step2)
  .commit();

export const testWorkflow = createWorkflow({
  id: "test-workflow",
  inputSchema: z.object({
    message: z.string()
  }),
  outputSchema: z.object({
    emphasized: z.string()
  })
})
  .then(childWorkflow)
  .commit();
```

#### Cloning a workflow

Clone a workflow using `cloneWorkflow()` when you want to reuse its logic but track it separately under a new ID. Each clone runs independently and shows up as a distinct workflow in logs and observability tools.

```typescript
import { cloneWorkflow } from "@mastra/core/workflows";

const step1 = createStep({...});

const parentWorkflow = createWorkflow({...})
const clonedWorkflow = cloneWorkflow(parentWorkflow, { id: "cloned-workflow" });

export const testWorkflow = createWorkflow({...})
  .then(step1)
  .then(clonedWorkflow)
  .commit();
```

### Registering a workflow

Register your workflow in the Mastra instance to make it available throughout your application. Once registered, it can be called from agents or tools and has access to shared resources such as logging and observability features:

```typescript
import { Mastra } from '@mastra/core/mastra'
import { testWorkflow } from './workflows/test-workflow'

export const mastra = new Mastra({
  workflows: { testWorkflow },
})
```

### Referencing a workflow

You can run workflows from agents, tools, the Mastra Client, or the command line. Get a reference by calling `.getWorkflow()` on your `mastra` or `mastraClient` instance, depending on your setup:

```typescript
const testWorkflow = mastra.getWorkflow('testWorkflow')
```

> **Note:** `mastra.getWorkflow()` is preferred over a direct import for two reasons:
>
> 1. It provides access to the Mastra instance configuration (logger, telemetry, storage, registered agents, and vector stores)
> 2. It provides full TypeScript type inference for workflow input and output schemas
>
> Use `getWorkflow()` with the workflow's **registration key** (the key used when adding it to Mastra). `getWorkflowById()` retrieves workflows by their `id` property, but it doesn't provide the same level of type inference.

### Running workflows

Workflows can be run in two modes: start waits for all steps to complete before returning, while stream emits events during execution. Choose the approach that fits your use case: start when you only need the final result and stream when you want to monitor progress or trigger actions as steps complete.

**.start()**:

Create a workflow run instance using `createRun()`, then call `.start()` with `inputData` matching the workflow's `inputSchema`. The workflow executes all steps and returns the final result.

```typescript
const run = await testWorkflow.createRun()

const result = await run.start({
  inputData: {
    message: 'Hello world',
  },
})

if (result.status === 'success') {
  console.log(result.result)
}
```

**.stream()**:

Create a workflow run instance using `.createRun()`, then call `.stream()` with `inputData` matching the workflow's `inputSchema`. Iterate over `fullStream` to track progress, then await `result` to get the final workflow result.

```typescript
const run = await testWorkflow.createRun()

const stream = run.stream({
  inputData: {
    message: 'Hello world',
  },
})

for await (const chunk of stream.fullStream) {
  console.log(chunk)
}

// Get the final result (same type as run.start())
const result = await stream.result

if (result.status === 'success') {
  console.log(result.result)
}
```

#### Workflow result type

Both `run.start()` and `stream.result` return a discriminated union based on the `status` property, which can be `success`, `failed`, `suspended`, `tripwire`, or `paused`. You can always safely access `result.status`, `result.input`, `result.steps`, and optionally `result.state` regardless of the status.

Additionally, depending on the status, different properties are available:

| Status      | Unique properties             | Description                                              |
| ----------- | ----------------------------- | -------------------------------------------------------- |
| `success`   | `result`                      | The workflow's output data                               |
| `failed`    | `error`                       | The error that caused the failure                        |
| `tripwire`  | `tripwire`                    | Contains `reason`, `retry?`, `metadata?`, `processorId?` |
| `suspended` | `suspendPayload`, `suspended` | Suspension data and array of suspended step paths        |
| `paused`    | _(none)_                      | Only common properties available                         |

To access status-specific properties, check the `status` first:

```typescript
const result = await run.start({ inputData: { message: 'Hello world' } })

if (result.status === 'success') {
  console.log(result.result) // Only available when status is "success"
} else if (result.status === 'failed') {
  console.log(result.error.message)
} else if (result.status === 'suspended') {
  console.log(result.suspendPayload)
}
```

#### Workflow output

Here's an example of a successful workflow result, showing the `input`, `steps`, and `result` properties:

```json
{
  "status": "success",
  "steps": {
    "step-1": {
      "status": "success",
      "payload": {
        "message": "Hello world"
      },
      "output": {
        "formatted": "HELLO WORLD"
      }
    },
    "step-2": {
      "status": "success",
      "payload": {
        "formatted": "HELLO WORLD"
      },
      "output": {
        "emphasized": "HELLO WORLD!!!"
      }
    }
  },
  "input": {
    "message": "Hello world"
  },
  "result": {
    "emphasized": "HELLO WORLD!!!"
  }
}
```

### Streaming

For generic `writer` API usage, see [Streaming](https://mastra.ai/docs/guides/streaming).

#### Inspecting workflow stream payloads

Events written to the stream are included in the emitted chunks. Inspect these chunks to access custom fields such as event types, intermediate values, or step-specific data.

```typescript
const testWorkflow = mastra.getWorkflow('testWorkflow')

const run = await testWorkflow.createRun()

const stream = await run.stream({
  inputData: {
    value: 'initial data',
  },
})

for await (const chunk of stream) {
  console.log(chunk)
}

if (result!.status === 'suspended') {
  // if the workflow is suspended, we can resume it with the resumeStream method
  const resumedStream = await run.resumeStream({
    resumeData: { value: 'resume data' },
  })

  for await (const chunk of resumedStream) {
    console.log(chunk)
  }
}
```

#### Resuming an interrupted workflow stream

If a workflow stream is closed or interrupted for any reason, you can resume it with the `resumeStream` method. This will return a new `ReadableStream` that you can use to observe the workflow events.

```typescript
const newStream = await run.resumeStream()

for await (const chunk of newStream) {
  console.log(chunk)
}
```

#### Workflow using an agent

Pipe an agent's `textStream` to the workflow step's `writer`. This streams partial output, and Mastra automatically aggregates the agent's usage into the workflow run.

```typescript
import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'

export const testStep = createStep({
  execute: async ({ inputData, mastra, writer }) => {
    const { city } = inputData

    const testAgent = mastra?.getAgent('testAgent')
    const stream = await testAgent?.stream(`What is the weather in ${city}?`)

    await stream!.textStream.pipeTo(writer!)

    return {
      value: await stream!.text,
    }
  },
})
```

### Restarting active workflow runs

When a workflow run loses connection to the server and it can be restarted from the last active step. This is useful for long-running workflows that might still be running when the server loses connection. Restarting a workflow run will resume execution from the last active step, plus the workflow will continue from there.

#### Restarting all active workflow runs of a workflow with `restartAllActiveWorkflowRuns()`

Use `restartAllActiveWorkflowRuns()` to restart all active workflow runs of a workflow. This helps restart all active workflow runs of a workflow, without having to manually loop through each run and restart.

```typescript
workflow.restartAllActiveWorkflowRuns()
```

Runs restart concurrently, up to `recovery.workflowConcurrency` at a time (default `5`). Set it to `1` in the Mastra config if your runs share side effects that must not run in parallel.

To exclude a workflow from automatic boot-time restarts triggered by `Mastra.restartAllActiveWorkflowRuns()`, set `autoRestartActiveRuns: false` in the workflow's `options`. This is useful for workflows with side effects that must not be re-driven by a blanket restart. Durable agent workflows set this automatically because their recovery is owned by the opt-in `recovery.durableAgents: 'auto'` path.

#### Restarting an active workflow run with `restart()`

Use `restart()` to restart an active workflow run from the last active step. This will resume execution from the last active step, and the workflow will continue from there.

```typescript
const run = await workflow.createRun()

const result = await run.start({ inputData: { value: 'initial data' } })

const restartedResult = await run.restart()
```

#### Identifying active workflow runs

When a workflow run is active, it will have a `status` of `running` or `waiting`. You can check the workflow's `status` to confirm it's active, and use `active` to identify the active workflow run.

```typescript
const activeRuns = await workflow.listActiveWorkflowRuns()
if (activeRuns.runs.length > 0) {
  console.log(activeRuns.runs)
}
```

> **Note:** When running the local mastra server, all active workflow runs will be restarted automatically when the server starts.

### Using `RequestContext`

Use [RequestContext](https://mastra.ai/docs/server/request-context) to access request-specific values. This lets you conditionally adjust behavior based on the context of the request.

```typescript
export type UserTier = {
  'user-tier': 'enterprise' | 'pro'
}

const step1 = createStep({
  execute: async ({ requestContext }) => {
    const userTier = requestContext.get('user-tier') as UserTier['user-tier']

    const maxResults = userTier === 'enterprise' ? 1000 : 50

    return { maxResults }
  },
})
```

Visit [Request Context](https://mastra.ai/docs/server/request-context) for more information.

> **Tip:** For type-safe request context schema validation, see [Schema Validation](https://mastra.ai/docs/server/request-context).

### Related

For a closer look at workflows, see our [Workflow Guide](https://mastra.ai/blog/building-an-ai-recruiter), which walks through the core concepts with a practical example.

- [Workflow State](https://mastra.ai/docs/workflows/workflow-state)
- [Control Flow](https://mastra.ai/docs/workflows/control-flow)
- [Suspend and Resume](https://mastra.ai/docs/workflows/suspend-and-resume)
- [Error Handling](https://mastra.ai/docs/workflows/error-handling)
- [Workers](https://mastra.ai/docs/deployment/workers): Run workflow execution in dedicated background processes
- 📹 [Agentic workflows with Mastra workshop](https://www.youtube.com/watch?v=HGt8pVPpX9g)

---

## Source: Workflow State (`docs/workflows/workflow-state`)

Canonical URL: `https://mastra.ai/docs/workflows/workflow-state.md`

## Workflow state

Workflow state lets you share values across steps without passing them through every step's inputSchema and outputSchema. This is useful for tracking progress or accumulating results, or alternatively sharing configuration across the entire workflow.

### State vs step input/output

It's important to understand the difference between **state** and **step input/output**:

- **Step input/output**: Data flows sequentially between steps. Each step receives the previous step's output as its `inputData`, and returns an output for the next step.
- **State**: A shared store that all steps can read and update via `state` and `setState`. State persists across the entire workflow run, including suspend/resume cycles.

```typescript
const step1 = createStep({
  id: 'step-1',
  inputSchema: z.object({ workflowInput: z.string() }),
  outputSchema: z.object({ step1Output: z.string() }),
  stateSchema: z.object({ sharedCounter: z.number() }),
  execute: async ({ inputData, state, setState }) => {
    // inputData comes from workflow input or previous step's output
    console.log(inputData.workflowInput)

    // state is the shared workflow state
    console.log(state.sharedCounter)

    // Update state for subsequent steps
    await setState({ sharedCounter: state.sharedCounter + 1 })

    // Return output that flows to next step's inputData
    return { step1Output: 'processed' }
  },
})
```

### Defining state schemas

Define a `stateSchema` on both the workflow and individual steps. The workflow's stateSchema is the master schema containing all possible state values, while each step declares only the subset it needs:

```typescript
const step1 = createStep({
  stateSchema: z.object({
    processedItems: z.array(z.string()),
  }),
  execute: async ({ inputData, state, setState }) => {
    const { message } = inputData
    const { processedItems } = state

    await setState({
      processedItems: [...processedItems, 'item-1', 'item-2'],
    })

    return {
      formatted: message.toUpperCase(),
    }
  },
})

const step2 = createStep({
  stateSchema: z.object({
    metadata: z.object({
      processedBy: z.string(),
    }),
  }),
  execute: async ({ inputData, state }) => {
    const { formatted } = inputData
    const { metadata } = state

    return {
      emphasized: `${formatted}!! ${metadata.processedBy}`,
    }
  },
})

export const testWorkflow = createWorkflow({
  stateSchema: z.object({
    processedItems: z.array(z.string()),
    metadata: z.object({
      processedBy: z.string(),
    }),
  }),
})
  .then(step1)
  .then(step2)
  .commit()
```

### Setting initial state

Pass `initialState` when starting a workflow run to set the starting values:

```typescript
const run = await workflow.createRun()

const result = await run.start({
  inputData: { message: 'Hello' },
  initialState: {
    processedItems: [],
    metadata: { processedBy: 'system' },
  },
})
```

The `initialState` object should match the structure defined in the workflow's `stateSchema`.

### State persistence across suspend/resume

State automatically persists across suspend and resume cycles. When a workflow suspends and later resumes, all state updates made before the suspension are preserved:

```typescript
const step1 = createStep({
  id: 'step-1',
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  stateSchema: z.object({ count: z.number(), items: z.array(z.string()) }),
  resumeSchema: z.object({ proceed: z.boolean() }),
  execute: async ({ state, setState, suspend, resumeData }) => {
    if (!resumeData) {
      // First run: update state and suspend
      await setState({ count: state.count + 1, items: [...state.items, 'item-1'] })
      await suspend({})
      return {}
    }
    // After resume: state changes are preserved (count: 1, items: ["item-1"])
    return {}
  },
})
```

### State in nested workflows

When using nested workflows, state propagates from parent to child. Changes made by the parent workflow before calling a nested workflow are visible to steps inside the nested workflow:

```typescript
const nestedStep = createStep({
  id: 'nested-step',
  inputSchema: z.object({}),
  outputSchema: z.object({ result: z.string() }),
  stateSchema: z.object({ sharedValue: z.string() }),
  execute: async ({ state }) => {
    // Receives state modified by parent workflow
    return { result: `Received: ${state.sharedValue}` }
  },
})

const nestedWorkflow = createWorkflow({
  id: 'nested-workflow',
  inputSchema: z.object({}),
  outputSchema: z.object({ result: z.string() }),
  stateSchema: z.object({ sharedValue: z.string() }),
})
  .then(nestedStep)
  .commit()

const parentStep = createStep({
  id: 'parent-step',
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  stateSchema: z.object({ sharedValue: z.string() }),
  execute: async ({ state, setState }) => {
    // Modify state before nested workflow runs
    await setState({ sharedValue: 'modified-by-parent' })
    return {}
  },
})

const parentWorkflow = createWorkflow({
  id: 'parent-workflow',
  inputSchema: z.object({}),
  outputSchema: z.object({ result: z.string() }),
  stateSchema: z.object({ sharedValue: z.string() }),
})
  .then(parentStep)
  .then(nestedWorkflow)
  .commit()
```

### Related

- [Workflows overview](https://mastra.ai/docs/workflows/overview)
- [Suspend and Resume](https://mastra.ai/docs/workflows/suspend-and-resume)
- [Step Class](https://mastra.ai/reference/workflows/step)
- [Workflow Class](https://mastra.ai/reference/workflows/workflow)

---

## Source: Control Flow (`docs/workflows/control-flow`)

Canonical URL: `https://mastra.ai/docs/workflows/control-flow.md`

## Control flow

Workflows give you control over predefined tasks by dividing each task into **steps**. Those steps can run sequentially or in parallel, and they can follow conditional paths.

Each step connects to the next in the workflow through defined schemas that keep data controlled and consistent.

### Core principles

- The first step’s `inputSchema` must match the workflow’s `inputSchema`.
- The final step’s `outputSchema` must match the workflow’s `outputSchema`.
- Each step’s `outputSchema` must match the next step’s `inputSchema`.
  - If it doesn’t, use [Input data mapping](#input-data-mapping) to transform the data into the required shape.

### Chaining steps with `.then()`

Use `.then()` to run steps in order, allowing each step to access the result of the step before it.

```typescript
const step1 = createStep({
  inputSchema: z.object({
    message: z.string(),
  }),
  outputSchema: z.object({
    formatted: z.string(),
  }),
})

const step2 = createStep({
  inputSchema: z.object({
    formatted: z.string(),
  }),
  outputSchema: z.object({
    emphasized: z.string(),
  }),
})

export const testWorkflow = createWorkflow({
  inputSchema: z.object({
    message: z.string(),
  }),
  outputSchema: z.object({
    emphasized: z.string(),
  }),
})
  .then(step1)
  .then(step2)
  .commit()
```

### Simultaneous steps with `.parallel()`

Use `.parallel()` to run steps simultaneously. All parallel steps must complete before the workflow continues to the next step. Each step's `id` is used when defining a following step's `inputSchema` and becomes the key on the `inputData` object used to access the previous step's values. The outputs of parallel steps can then be referenced or combined by a following step.

```typescript
const step1 = createStep({
  id: 'step-1',
})

const step2 = createStep({
  id: 'step-2',
})

const step3 = createStep({
  id: 'step-3',
  inputSchema: z.object({
    'step-1': z.object({
      formatted: z.string(),
    }),
    'step-2': z.object({
      emphasized: z.string(),
    }),
  }),
  outputSchema: z.object({
    combined: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { formatted } = inputData['step-1']
    const { emphasized } = inputData['step-2']
    return {
      combined: `${formatted} | ${emphasized}`,
    }
  },
})

export const testWorkflow = createWorkflow({
  inputSchema: z.object({
    message: z.string(),
  }),
  outputSchema: z.object({
    combined: z.string(),
  }),
})
  .parallel([step1, step2])
  .then(step3)
  .commit()
```

#### Output structure

When steps run in parallel, the output is an object where each key is the step's `id` and the value is that step's output. You can access each parallel step's result independently.

```typescript
const step1 = createStep({
  id: 'format-step',
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ formatted: z.string() }),
  execute: async ({ inputData }) => ({
    formatted: inputData.message.toUpperCase(),
  }),
})

const step2 = createStep({
  id: 'count-step',
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ count: z.number() }),
  execute: async ({ inputData }) => ({
    count: inputData.message.length,
  }),
})

const step3 = createStep({
  id: 'combine-step',
  // The inputSchema must match the structure of parallel outputs
  inputSchema: z.object({
    'format-step': z.object({ formatted: z.string() }),
    'count-step': z.object({ count: z.number() }),
  }),
  outputSchema: z.object({ result: z.string() }),
  execute: async ({ inputData }) => {
    // Access each parallel step's output by its id
    const formatted = inputData['format-step'].formatted
    const count = inputData['count-step'].count
    return {
      result: `${formatted} (${count} characters)`,
    }
  },
})

export const testWorkflow = createWorkflow({
  id: 'parallel-output-example',
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ result: z.string() }),
})
  .parallel([step1, step2])
  .then(step3)
  .commit()

// When executed with { message: "hello" }
// The parallel output structure will be:
// {
//   "format-step": { formatted: "HELLO" },
//   "count-step": { count: 5 }
// }
```

**Key points:**

- Each parallel step's output is keyed by its `id`
- All parallel steps execute simultaneously
- The next step receives an object containing all parallel step outputs
- You must define the `inputSchema` of the following step to match this structure

#### Handling step failures

If any parallel step throws an error, the entire parallel block fails. To build resilient parallel workflows where some steps may fail, for example, multiple research agents where one might have an expired auth token, handle errors inside the step itself using try/catch:

```typescript
const resilientStep = createStep({
  id: 'researcher',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({
    brief: z.string().nullable(),
    failed: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    try {
      const result = await fetchExternalData(inputData.query)
      return { brief: result, failed: false }
    } catch {
      return { brief: null, failed: true }
    }
  },
})
```

This way the step always succeeds with a typed result, and the downstream step can filter out failed results:

```typescript
const writerStep = createStep({
  id: 'writer',
  inputSchema: z.object({
    'researcher-a': z.object({ brief: z.string().nullable(), failed: z.boolean() }),
    'researcher-b': z.object({ brief: z.string().nullable(), failed: z.boolean() }),
  }),
  outputSchema: z.object({ synthesis: z.string() }),
  execute: async ({ inputData }) => {
    const briefs = Object.values(inputData)
      .filter(v => !v.failed && v.brief)
      .map(v => v.brief)
    return { synthesis: briefs.join('; ') }
  },
})
```

Visit [Choosing the right pattern](#choosing-the-right-pattern) to understand when to use `.parallel()` vs `.foreach()`.

### Conditional logic with `.branch()`

Use `.branch()` to choose which step to run based on a condition. All steps in a branch need the same `inputSchema` and `outputSchema` because branching requires consistent schemas so workflows can follow different paths.

```typescript
const step1 = createStep({...})

const stepA = createStep({
  inputSchema: z.object({
    value: z.number()
  }),
  outputSchema: z.object({
    result: z.string()
  })
});

const stepB = createStep({
  inputSchema: z.object({
    value: z.number()
  }),
  outputSchema: z.object({
    result: z.string()
  })
});

export const testWorkflow = createWorkflow({
  inputSchema: z.object({
    value: z.number()
  }),
  outputSchema: z.object({
    result: z.string()
  })
})
  .then(step1)
  .branch([
    [async ({ inputData: { value } }) => value > 10, stepA],
    [async ({ inputData: { value } }) => value <= 10, stepB]
  ])
  .commit();
```

#### Route with a classifier

A configured classifier can produce typed answers before `.branch()`. Route on the answer field that matches each question type: `choice`, `score`, or `probability`.

```typescript
import { Classifier } from '@mastra/core/classifier'
import { typeSafeAi } from '@ai-sdk/typesafe-ai'
import { createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'

const router = new Classifier({
  id: 'ticket-router',
  model: typeSafeAi.decisionModel('jev-latest'),
  questions: {
    route: {
      type: 'choice',
      criteria: {
        billing: 'Billing, invoices, refunds, and payments',
        support: 'Account access and product help',
        other: 'Anything else',
      },
    },
  },
})

export const ticketTriage = createWorkflow({
  id: 'ticket-triage',
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.any(),
})
  .map({ message: { initData: true, path: 'message' } })
  .classifier(router)
  .branch([
    [async ({ inputData }) => inputData.answers.route.choice === 'billing', billingStep],
    [async ({ inputData }) => inputData.answers.route.choice === 'support', supportStep],
    [async ({ inputData }) => inputData.answers.route.choice === 'other', fallbackStep],
  ])
  .commit()
```

The `choice` field retains the configured criteria-key union, so `inputData.answers.route.choice` is typed as `'billing' | 'support' | 'other'`. Score answers expose `score`. Boolean answers expose the `P(true)` value as `probability`. Apply an explicit threshold when routing.

#### Output structure

When using conditional branching, only one branch executes based on which condition evaluates to `true` first. The output structure is similar to `.parallel()`, where the result is keyed by the executed step's `id`.

```typescript
const step1 = createStep({
  id: 'initial-step',
  inputSchema: z.object({ value: z.number() }),
  outputSchema: z.object({ value: z.number() }),
  execute: async ({ inputData }) => inputData,
})

const highValueStep = createStep({
  id: 'high-value-step',
  inputSchema: z.object({ value: z.number() }),
  outputSchema: z.object({ result: z.string() }),
  execute: async ({ inputData }) => ({
    result: `High value: ${inputData.value}`,
  }),
})

const lowValueStep = createStep({
  id: 'low-value-step',
  inputSchema: z.object({ value: z.number() }),
  outputSchema: z.object({ result: z.string() }),
  execute: async ({ inputData }) => ({
    result: `Low value: ${inputData.value}`,
  }),
})

const finalStep = createStep({
  id: 'final-step',
  // The inputSchema must account for either branch's output
  inputSchema: z.object({
    'high-value-step': z.object({ result: z.string() }).optional(),
    'low-value-step': z.object({ result: z.string() }).optional(),
  }),
  outputSchema: z.object({ message: z.string() }),
  execute: async ({ inputData }) => {
    // Only one branch will have executed
    const result = inputData['high-value-step']?.result || inputData['low-value-step']?.result
    return { message: result }
  },
})

export const testWorkflow = createWorkflow({
  id: 'branch-output-example',
  inputSchema: z.object({ value: z.number() }),
  outputSchema: z.object({ message: z.string() }),
})
  .then(step1)
  .branch([
    [async ({ inputData }) => inputData.value > 10, highValueStep],
    [async ({ inputData }) => inputData.value <= 10, lowValueStep],
  ])
  .then(finalStep)
  .commit()

// When executed with { value: 15 }
// Only the high-value-step executes, output structure:
// {
//   "high-value-step": { result: "High value: 15" }
// }

// When executed with { value: 5 }
// Only the low-value-step executes, output structure:
// {
//   "low-value-step": { result: "Low value: 5" }
// }
```

**Key points:**

- Only one branch executes based on condition evaluation order
- The output is keyed by the executed step's `id`
- Subsequent steps should handle all possible branch outputs
- Use optional fields in the `inputSchema` when the next step needs to handle multiple possible branches
- Conditions are evaluated in the order they're defined

### Input data mapping

When using `.then()`, `.parallel()`, or `.branch()`, it's sometimes necessary to transform the output of a previous step to match the input of the next. In these cases you can use `.map()` to access the `inputData` and transform it to create a suitable data shape for the next step.

```typescript
const step1 = createStep({...});
const step2 = createStep({...});

export const testWorkflow = createWorkflow({...})
  .then(step1)
  .map(async ({ inputData }) => {
    const { foo } = inputData;
    return {
      bar: `new ${foo}`,
    };
  })
  .then(step2)
  .commit();
```

The `.map()` method provides additional helper functions for more complex mapping scenarios.

**Available helper functions:**

- [`getStepResult()`](https://mastra.ai/reference/workflows/workflow-methods/map): Access a specific step's full output
- [`getInitData<any>()`](https://mastra.ai/reference/workflows/workflow-methods/map): Access the workflow's initial input data
- [`mapVariable()`](https://mastra.ai/reference/workflows/workflow-methods/map): Use declarative object syntax to extract and rename fields

#### Parallel and Branch outputs

Both `.parallel()` and `.branch()` return an object keyed by child step `id`. Use `.map()` to reshape that output for the next operation. This example maps two parallel results into the shared input required by `.branch()`:

```typescript
import { createStep, createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'

const orderSchema = z.object({ amount: z.number(), inventory: z.number() })
const routingSchema = z.object({ riskScore: z.number(), inStock: z.boolean() })
const decisionSchema = z.object({ action: z.enum(['review', 'approve']) })

const scoreRisk = createStep({
  id: 'score-risk',
  inputSchema: orderSchema,
  outputSchema: z.object({ riskScore: z.number() }),
  execute: async ({ inputData }) => ({
    riskScore: inputData.amount >= 1_000 ? 80 : 20,
  }),
})

const checkInventory = createStep({
  id: 'check-inventory',
  inputSchema: orderSchema,
  outputSchema: z.object({ inStock: z.boolean() }),
  execute: async ({ inputData }) => ({ inStock: inputData.inventory > 0 }),
})

const manualReview = createStep({
  id: 'manual-review',
  inputSchema: routingSchema,
  outputSchema: decisionSchema,
  execute: async () => ({ action: 'review' as const }),
})

const autoApprove = createStep({
  id: 'auto-approve',
  inputSchema: routingSchema,
  outputSchema: decisionSchema,
  execute: async () => ({ action: 'approve' as const }),
})

export const orderRoutingWorkflow = createWorkflow({
  id: 'order-routing',
  inputSchema: orderSchema,
  outputSchema: z.object({
    'manual-review': decisionSchema.optional(),
    'auto-approve': decisionSchema.optional(),
  }),
})
  .parallel([scoreRisk, checkInventory])
  .map(async ({ inputData }) => ({
    riskScore: inputData['score-risk'].riskScore,
    inStock: inputData['check-inventory'].inStock,
  }))
  .branch([
    [async ({ inputData }) => inputData.riskScore >= 70 || !inputData.inStock, manualReview],
    [async ({ inputData }) => inputData.riskScore < 70 && inputData.inStock, autoApprove],
  ])
  .commit()
```

The parallel output has this shape before `.map()`:

```typescript
{
  'score-risk': { riskScore: 80 },
  'check-inventory': { inStock: true },
}
```

The mapped `{ riskScore, inStock }` object is passed to every branch condition and branch step, so their `inputSchema` values must match `routingSchema`. A `.map()` placed after `.branch()` works the same way. Read branch output with `inputData['manual-review']` or `getStepResult(manualReview)`.

### Looping steps

Workflows support different looping methods that let you repeat steps until or while a condition is met, or iterate over arrays. Loops can be combined with other control methods like `.then()`.

#### Looping with `.dountil()`

Use `.dountil()` to run a step repeatedly until a condition becomes true.

```typescript
const step1 = createStep({...});

const step2 = createStep({
  execute: async ({ inputData }) => {
    const { number } = inputData;
    return {
      number: number + 1
    };
  }
});

export const testWorkflow = createWorkflow({})
  .then(step1)
  .dountil(step2, async ({ inputData: { number } }) => number > 10)
  .commit();
```

#### Looping with `.dowhile()`

Use `.dowhile()` to run a step repeatedly while a condition remains true.

```typescript
const step1 = createStep({...});

const step2 = createStep({
  execute: async ({ inputData }) => {
    const { number } = inputData;
    return {
      number: number + 1
    };
  }
});

export const testWorkflow = createWorkflow({})
  .then(step1)
  .dowhile(step2, async ({ inputData: { number } }) => number < 10)
  .commit();
```

#### Passing data between iterations

Each iteration of `.dountil()` or `.dowhile()` receives the previous iteration's output as its `inputData`. When input validation is enabled (the default), that output is validated against the loop body's `inputSchema` before the body runs. With an object schema such as `z.object()`, keys the schema doesn't declare are removed. Schemas that allow unknown keys, such as `.passthrough()`, keep them.

When the loop body is a nested workflow, the output is validated against the nested workflow's `inputSchema` and then against its first step's `inputSchema`. A value is only available on the next iteration if the nested workflow returns it and both schemas declare it. This includes values produced inside the nested workflow, such as feedback from a step that suspended and resumed.

To carry data across iterations, declare it in the body's `inputSchema` and return it from the body's last step:

```typescript
const loopSchema = z.object({
  draft: z.string(),
  feedback: z.string().optional(),
  attempts: z.number(),
})

const reviewStep = createStep({
  id: 'review',
  inputSchema: loopSchema,
  outputSchema: loopSchema,
  execute: async ({ inputData }) => {
    // ...
    return { draft, feedback, attempts: inputData.attempts + 1 }
  },
})
```

For values that don't belong in the step's input, such as counters or audit data, use [workflow state](https://mastra.ai/docs/workflows/workflow-state) instead.

#### Looping with `.foreach()`

Use `.foreach()` to run the same step for each item in an array. The input must be of type `array` so the loop can iterate over its values, applying the step's logic to each one. See [Choosing the right pattern](#choosing-the-right-pattern) for guidance on when to use `.foreach()` vs other methods.

```typescript
const step1 = createStep({
  inputSchema: z.string(),
  outputSchema: z.string(),
  execute: async ({ inputData }) => {
    return inputData.toUpperCase();
  }
});

const step2 = createStep({...});

export const testWorkflow = createWorkflow({
  inputSchema: z.array(z.string()),
  outputSchema: z.array(z.string())
})
  .foreach(step1)
  .then(step2)
  .commit();
```

##### Output structure

The `.foreach()` method always returns an array containing the output of each iteration. The order of outputs matches the order of inputs.

```typescript
const addTenStep = createStep({
  id: 'add-ten',
  inputSchema: z.object({ value: z.number() }),
  outputSchema: z.object({ value: z.number() }),
  execute: async ({ inputData }) => ({
    value: inputData.value + 10,
  }),
})

export const testWorkflow = createWorkflow({
  id: 'foreach-output-example',
  inputSchema: z.array(z.object({ value: z.number() })),
  outputSchema: z.array(z.object({ value: z.number() })),
})
  .foreach(addTenStep)
  .commit()

// When executed with [{ value: 1 }, { value: 22 }, { value: 333 }]
// Output: [{ value: 11 }, { value: 32 }, { value: 343 }]
```

##### Concurrency limits

Use `concurrency` to control the number of array items processed. The default is `1`, which runs steps sequentially. Increasing the value allows `.foreach()` to process multiple items simultaneously.

```typescript
const step1 = createStep({...})

export const testWorkflow = createWorkflow({...})
  .foreach(step1, { concurrency: 4 })
  .commit();
```

##### Aggregating results after `.foreach()`

Since `.foreach()` outputs an array, you can use `.then()` or `.map()` to aggregate or transform the results. The step following `.foreach()` receives the entire array as its input.

```typescript
const processItemStep = createStep({
  id: 'process-item',
  inputSchema: z.object({ value: z.number() }),
  outputSchema: z.object({ processed: z.number() }),
  execute: async ({ inputData }) => ({
    processed: inputData.value * 2,
  }),
})

const aggregateStep = createStep({
  id: 'aggregate',
  // Input is an array of outputs from foreach
  inputSchema: z.array(z.object({ processed: z.number() })),
  outputSchema: z.object({ total: z.number() }),
  execute: async ({ inputData }) => ({
    // Sum all processed values
    total: inputData.reduce((sum, item) => sum + item.processed, 0),
  }),
})

export const testWorkflow = createWorkflow({
  id: 'foreach-aggregate-example',
  inputSchema: z.array(z.object({ value: z.number() })),
  outputSchema: z.object({ total: z.number() }),
})
  .foreach(processItemStep)
  .then(aggregateStep) // Receives the full array from foreach
  .commit()

// When executed with [{ value: 1 }, { value: 2 }, { value: 3 }]
// After foreach: [{ processed: 2 }, { processed: 4 }, { processed: 6 }]
// After aggregate: { total: 12 }
```

You can also use `.map()` to transform the array output:

```typescript
export const testWorkflow = createWorkflow({...})
  .foreach(processItemStep)
  .map(async ({ inputData }) => ({
    // Transform the array into a different structure
    values: inputData.map(item => item.processed),
    count: inputData.length
  }))
  .then(nextStep)
  .commit();
```

##### Chaining multiple `.foreach()` calls

When you chain `.foreach()` calls, each operates on the array output of the previous step. This is useful when each item in your array needs to be transformed by multiple steps in sequence.

```typescript
const chunkStep = createStep({
  id: 'chunk',
  // Takes a document, returns an array of chunks
  inputSchema: z.object({ content: z.string() }),
  outputSchema: z.array(z.object({ chunk: z.string() })),
  execute: async ({ inputData }) => {
    // Split document into chunks
    const chunks = inputData.content.match(/.{1,100}/g) || []
    return chunks.map(chunk => ({ chunk }))
  },
})

const embedStep = createStep({
  id: 'embed',
  // Takes a single chunk, returns embedding
  inputSchema: z.object({ chunk: z.string() }),
  outputSchema: z.object({ embedding: z.array(z.number()) }),
  execute: async ({ inputData }) => ({
    embedding: [/* vector embedding */],
  }),
})

// For a single document that produces multiple chunks:
export const singleDocWorkflow = createWorkflow({
  id: 'single-doc-rag',
  inputSchema: z.object({ content: z.string() }),
  outputSchema: z.array(z.object({ embedding: z.array(z.number()) })),
})
  .then(chunkStep) // Returns array of chunks
  .foreach(embedStep) // Process each chunk -> array of embeddings
  .commit()
```

For processing multiple documents where each produces multiple chunks, you have options:

**Option 1: Process all documents in a single step with batching control**

```typescript
const downloadAndChunkStep = createStep({
  id: "download-and-chunk",
  inputSchema: z.array(z.string()),  // Array of URLs
  outputSchema: z.array(z.object({ chunk: z.string(), source: z.string() })),
  execute: async ({ inputData: urls }) => {
    // Control batching/parallelization within the step
    const allChunks = [];
    for (const url of urls) {
      const content = await fetch(url).then(r => r.text());
      const chunks = content.match(/.{1,100}/g) || [];
      allChunks.push(...chunks.map(chunk => ({ chunk, source: url })));
    }
    return allChunks;
  }
});

export const multiDocWorkflow = createWorkflow({...})
  .then(downloadAndChunkStep)  // Returns flat array of all chunks
  .foreach(embedStep, { concurrency: 10 })  // Embed each chunk in parallel
  .commit();
```

**Option 2: Use foreach for documents and aggregate chunks, plus then foreach for embeddings**

```typescript
const downloadStep = createStep({
  id: 'download',
  inputSchema: z.string(), // Single URL
  outputSchema: z.object({ content: z.string(), source: z.string() }),
  execute: async ({ inputData: url }) => ({
    content: await fetch(url).then(r => r.text()),
    source: url,
  }),
})

const chunkDocStep = createStep({
  id: 'chunk-doc',
  inputSchema: z.object({ content: z.string(), source: z.string() }),
  outputSchema: z.array(z.object({ chunk: z.string(), source: z.string() })),
  execute: async ({ inputData }) => {
    const chunks = inputData.content.match(/.{1,100}/g) || []
    return chunks.map(chunk => ({ chunk, source: inputData.source }))
  },
})

export const multiDocWorkflow = createWorkflow({
  id: 'multi-doc-rag',
  inputSchema: z.array(z.string()), // Array of URLs
  outputSchema: z.array(z.object({ embedding: z.array(z.number()) })),
})
  .foreach(downloadStep, { concurrency: 5 }) // Download docs in parallel
  .foreach(chunkDocStep) // Chunk each doc -> array of chunk arrays
  .map(async ({ inputData }) => {
    // Flatten nested arrays: [[chunks], [chunks]] -> [chunks]
    return inputData.flat()
  })
  .foreach(embedStep, { concurrency: 10 }) // Embed all chunks
  .commit()
```

**Key points about chaining `.foreach()`:**

- Each `.foreach()` operates on the array from the previous step
- If a step inside `.foreach()` returns an array, the output becomes an array of arrays
- Use `.map()` with `.flat()` to flatten nested arrays when needed
- For complex RAG pipelines, Option 1 (handling batching in a single step) often provides better control

##### Nested workflows inside foreach

The step after `.foreach()` only executes after all iterations complete. If you need to run multiple sequential operations per item, use a nested workflow instead of chaining multiple `.foreach()` calls. This keeps all operations for each item together and makes the data flow clearer.

```typescript
// Define a workflow that processes a single document
const processDocumentWorkflow = createWorkflow({
  id: 'process-document',
  inputSchema: z.object({ url: z.string() }),
  outputSchema: z.object({
    embeddings: z.array(z.array(z.number())),
    metadata: z.object({ url: z.string(), chunkCount: z.number() }),
  }),
})
  .then(downloadStep) // Download the document
  .then(chunkStep) // Split into chunks
  .then(embedChunksStep) // Embed all chunks for this document
  .then(formatResultStep) // Format the final output
  .commit()

// Use the nested workflow inside foreach
export const batchProcessWorkflow = createWorkflow({
  id: 'batch-process-documents',
  inputSchema: z.array(z.object({ url: z.string() })),
  outputSchema: z.array(
    z.object({
      embeddings: z.array(z.array(z.number())),
      metadata: z.object({ url: z.string(), chunkCount: z.number() }),
    }),
  ),
})
  .foreach(processDocumentWorkflow, { concurrency: 3 })
  .commit()

// Each document goes through all 4 steps before the next document starts (with concurrency: 1)
// With concurrency: 3, up to 3 documents process their full pipelines in parallel
```

**Why use nested workflows:**

- **Better parallelism**: With `concurrency: N`, multiple items run their full pipelines simultaneously. Chained `.foreach().foreach()` processes all items through step 1, waits, then all through step 2 - nested workflows let each item progress independently
- All steps for one item complete together before results are collected
- Cleaner than multiple `.foreach()` calls which create nested arrays
- Each nested workflow execution is independent with its own data flow
- Easier to test and reuse the per-item logic separately

**How it works:**

1. The parent workflow passes each array item to an instance of the nested workflow
2. Each nested workflow runs its full step sequence for that item
3. With `concurrency > 1`, multiple nested workflows execute in parallel
4. The nested workflow's final output becomes one element in the result array
5. After all nested workflows complete, the next step in the parent receives the full array

### Labeling control-flow entries

Every control-flow method accepts an optional final argument with a stable `id`, a `description`, and JSON-serializable `metadata`. These fields identify and describe the graph entry itself, separate from the steps inside it. They survive serialization and storage and appear in `serializedStepGraph`. They have no effect on execution.

```typescript
workflow
  .parallel([validateStep, enrichStep], {
    id: 'independent-enrichment',
    description: 'Run independent enrichment tasks concurrently',
    metadata: { title: 'Independent enrichment' },
  })
  .sleep(5000, { id: 'wait-before-retry', description: 'Pause before retrying' })
```

Visual editors and review tools can key layout and selection state by `id` and render `metadata.title` as a display label. For `.foreach()`, pass the fields in the same options object as `concurrency`. For `.map()`, `.sleep()`, and `.sleepUntil()`, a supplied `id` replaces the generated entry id.

### Choosing the right pattern

Use this section as a reference for selecting the appropriate control flow method.

#### Quick reference

| Method              | Purpose                            | Input | Output                | Concurrency               |
| ------------------- | ---------------------------------- | ----- | --------------------- | ------------------------- |
| `.then(step)`       | Sequential processing              | `T`   | `U`                   | N/A (one at a time)       |
| `.parallel([a, b])` | Different operations on same input | `T`   | `{ a: U, b: V }`      | All run simultaneously    |
| `.foreach(step)`    | Same operation on each array item  | `T[]` | `U[]`                 | Configurable (default: 1) |
| `.branch([...])`    | Conditional path selection         | `T`   | `{ selectedStep: U }` | Only one branch runs      |

#### `.parallel()` vs `.foreach()`

**Use `.parallel()` when you have one input that needs different processing:**

```typescript
// Same user data processed differently in parallel
workflow.parallel([validateStep, enrichStep, scoreStep]).then(combineResultsStep)
```

**Use `.foreach()` when you have many inputs that need the same processing:**

```typescript
// Multiple URLs each processed the same way
workflow.foreach(downloadStep, { concurrency: 5 }).then(aggregateStep)
```

#### When to use nested workflows

**Inside `.foreach()`** - when each array item needs multiple sequential steps:

```typescript
// Each document goes through a full pipeline
const processDocWorkflow = createWorkflow({...})
  .then(downloadStep)
  .then(parseStep)
  .then(embedStep)
  .commit();

workflow.foreach(processDocWorkflow, { concurrency: 3 })
```

The single `.foreach()` keeps the result flat. Chaining `.foreach().foreach()` creates nested arrays.

**Inside `.parallel()`** - when a parallel branch needs its own multi-step pipeline:

```typescript
const pipelineA = createWorkflow({...}).then(step1).then(step2).commit();
const pipelineB = createWorkflow({...}).then(step3).then(step4).commit();

workflow.parallel([pipelineA, pipelineB])
```

#### Chaining patterns

| Pattern                | What happens                      | Common use case                                        |
| ---------------------- | --------------------------------- | ------------------------------------------------------ |
| `.then().then()`       | Sequential steps                  | Simple pipelines                                       |
| `.parallel().then()`   | Run in parallel, then combine     | Fan-out/fan-in                                         |
| `.foreach().then()`    | Process all items, then aggregate | Map-reduce                                             |
| `.foreach().foreach()` | Creates array of arrays           | Avoid - use nested workflow or `.map()` with `.flat()` |
| `.foreach(workflow)`   | Full pipeline per item            | Multi-step processing per array item                   |

#### Synchronization: when does the next step run?

Both `.parallel()` and `.foreach()` are synchronization points. The next step in the workflow only executes after all parallel branches or all array iterations have completed.

```typescript
workflow
  .parallel([stepA, stepB, stepC]) // All 3 run simultaneously
  .then(combineStep) // Waits for ALL 3 to finish before running
  .commit()

workflow
  .foreach(processStep, { concurrency: 5 }) // Up to 5 items process at once
  .then(aggregateStep) // Waits for ALL items to finish before running
  .commit()
```

This means:

- `.parallel()` collects all branch outputs into an object, then passes it to the next step
- `.foreach()` collects all iteration outputs into an array, then passes it to the next step
- Results can't be "streamed" to the next step as they complete

#### Concurrency behavior

| Method                          | Behavior                                                        |
| ------------------------------- | --------------------------------------------------------------- |
| `.then()`                       | Sequential - one step at a time                                 |
| `.parallel()`                   | All branches run simultaneously (no limit option)               |
| `.foreach()`                    | Controlled via `{ concurrency: N }` - default is 1 (sequential) |
| Nested workflow in `.foreach()` | Respects parent's concurrency setting                           |

**Performance tip:** For I/O-bound operations in `.foreach()`, increase concurrency to process items in parallel:

```typescript
// Process up to 10 items simultaneously
workflow.foreach(fetchDataStep, { concurrency: 10 })
```

### Loop management

Loop conditions can be implemented in different ways depending on how you want the loop to end.

Common patterns check values returned in `inputData` and set a maximum number of iterations. They can also abort execution when a limit is reached.

#### Aborting loops

Use `iterationCount` to limit how many times a loop runs. If the count exceeds your threshold, throw an error to fail the step and stop the workflow.

```typescript
const step1 = createStep({...});

export const testWorkflow = createWorkflow({...})
  .dountil(step1, async ({ inputData: { userResponse, iterationCount } }) => {
    if (iterationCount >= 10) {
      throw new Error("Maximum iterations reached");
    }
    return userResponse === "yes";
  })
  .commit();
```

### Related

- [Suspend and Resume](https://mastra.ai/docs/workflows/suspend-and-resume)
- [Human-in-the-loop](https://mastra.ai/docs/workflows/human-in-the-loop)

---

## Source: Agents and Tools (`docs/workflows/agents-and-tools`)

Canonical URL: `https://mastra.ai/docs/workflows/agents-and-tools.md`

## Agents and tools

Workflow steps can call agents to use LLM reasoning or call tools for type-safe logic. You can either invoke them from within a step's `execute()` function or compose them directly as steps using `createStep()`.

### Using agents in workflows

Use agents in workflow steps when you need reasoning, language generation, or other LLM-based tasks. Call from a step's `execute()` function for more control over the agent call (e.g., track message history or return structured output). Compose agents as steps when you don't need to modify how the agent is invoked.

#### Calling agents

Call agents inside a step's `execute()` function using `.generate()` or `.stream()`. This lets you modify the agent call and handle the response before passing it to the next step.

```typescript
const step1 = createStep({
  execute: async ({ inputData, mastra }) => {
    const { message } = inputData

    const testAgent = mastra.getAgent('testAgent')
    const response = await testAgent.generate(
      `Convert this message into bullet points: ${message}`,
      {
        memory: {
          thread: 'user-123',
          resource: 'test-123',
        },
      },
    )

    return {
      list: response.text,
    }
  },
})
```

#### Agents as steps

Compose an agent as a step using `createStep()` when you don't need to modify the agent call. Use `.map()` to transform the previous step's output into a `prompt` the agent can use.

```typescript
import { testAgent } from '../agents/test-agent'
const step1 = createStep(testAgent)

export const testWorkflow = createWorkflow({})
  .map(async ({ inputData }) => {
    const { message } = inputData
    return {
      prompt: `Convert this message into bullet points: ${message}`,
    }
  })
  .then(step1)
  .then(step2)
  .commit()
```

Visit [Input Data Mapping](https://mastra.ai/docs/workflows/control-flow) for more information.

When no `structuredOutput` option is provided, Mastra agents use a default schema that expects a `prompt` string as input and returns a `text` string as output:

```typescript
{
  inputSchema: {
    prompt: string
  },
  outputSchema: {
    text: string
  }
}
```

#### Agents with structured output

When you need the agent to return structured data instead of plain text, pass the `structuredOutput` option to `createStep()`. The step's output schema will match your provided schema, enabling type-safe chaining to subsequent steps.

```typescript
const articleSchema = z.object({
  title: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
})

const agentStep = createStep(testAgent, {
  structuredOutput: { schema: articleSchema },
})

// Next step receives typed structured data
const processStep = createStep({
  id: 'process',
  inputSchema: articleSchema, // Matches agent's outputSchema
  outputSchema: z.object({ tagCount: z.number() }),
  execute: async ({ inputData }) => ({
    tagCount: inputData.tags.length, // Fully typed
  }),
})

export const testWorkflow = createWorkflow({})
  .map(async ({ inputData }) => ({
    prompt: `Generate an article about: ${inputData.topic}`,
  }))
  .then(agentStep)
  .then(processStep)
  .commit()
```

The `structuredOutput.schema` option accepts any Standard JSON Schema. The agent will generate output conforming to this schema, and the step's `outputSchema` will be automatically set to match. Visit [Structured Output](https://mastra.ai/docs/agents/structured-output) for more options like error handling strategies and streaming with structured output.

#### The `.agent()` shorthand

Add an agent directly with `.agent()` instead of wrapping it in `createStep()`. It accepts the same options as `createStep(agent, options)`, plus an agent ID string in place of the instance:

```typescript
import { testAgent } from '../agents/test-agent'

export const testWorkflow = createWorkflow({})
  .map(async ({ inputData }) => ({
    prompt: `Generate an article about: ${inputData.topic}`,
  }))
  .agent(testAgent, { structuredOutput: { schema: articleSchema } })
  .commit()
```

`.agent()` records a declarative entry in the workflow graph rather than an opaque step, so workflows built this way can be persisted as [dynamic workflows](https://mastra.ai/docs/workflows/dynamic-workflows). Visit [Workflow.agent()](https://mastra.ai/reference/workflows/workflow-methods/agent) for all parameters.

### Using tools in workflows

Use tools in workflow steps to use existing tool logic. Call from a step's `.execute()` function when you need to prepare context or process responses. Compose tools as steps when you don't need to modify how the tool is used.

#### Calling tools

Call tools inside a step's `.execute()` function. You get more control over the tool's input context, or process its response before passing it to the next step.

```typescript
import { testTool } from '../tools/test-tool'

const step2 = createStep({
  execute: async ({ inputData, requestContext }) => {
    const { text } = inputData

    const response = await testTool.execute({ text }, { requestContext })

    return {
      emphasized: response.emphasized,
    }
  },
})
```

#### Tools as steps

Compose a tool as a step using `createStep()` when the previous step's output matches the tool's input context. You can use `.map()` to transform the previous step's output if they don't.

```typescript
import { testTool } from '../tools/test-tool'

const step2 = createStep(testTool)

export const testWorkflow = createWorkflow({})
  .then(step1)
  .map(async ({ inputData }) => {
    const { formatted } = inputData
    return {
      text: formatted,
    }
  })
  .then(step2)
  .commit()
```

Visit [Input Data Mapping](https://mastra.ai/docs/workflows/control-flow) for more information.

#### The `.tool()` shorthand

Add a tool directly with `.tool()` instead of wrapping it in `createStep()`. It accepts a tool instance or a registered tool ID string, plus step-level `retries` and `metadata`:

```typescript
import { testTool } from '../tools/test-tool'

export const testWorkflow = createWorkflow({}).then(step1).tool(testTool).commit()
```

Like `.agent()`, `.tool()` records a declarative entry, so the workflow can be persisted as a [dynamic workflow](https://mastra.ai/docs/workflows/dynamic-workflows). Visit [Workflow.tool()](https://mastra.ai/reference/workflows/workflow-methods/tool) for all parameters.

### Related

- [Using Agents](https://mastra.ai/docs/agents/overview)
- [MCP Overview](https://mastra.ai/docs/connections/mcp)

---

## Source: Dynamic Workflows (`docs/workflows/dynamic-workflows`)

Canonical URL: `https://mastra.ai/docs/workflows/dynamic-workflows.md`

## Dynamic workflows

> **Beta:** Breaking changes may occur without a major version bump until the API is stable.

Dynamic workflows are workflow definitions expressed as data instead of code. A definition is a JSON document that describes the workflow's schemas and step graph. Mastra validates the definition and registers it as a runnable workflow, then persists it in storage so it survives process restarts.

Because a definition contains no JavaScript closures, anything that produces JSON can author a workflow. Sources include an HTTP client or LLM. A visual editor or your own tooling can also produce the definition. Once registered, a dynamic workflow runs through the same execution API as a code-defined workflow.

### When to use dynamic workflows

Use dynamic workflows when users, agents, visual editors, or external systems need to create workflows without changing application code or deploying again.

Keep defining workflows with [`createWorkflow()`](https://mastra.ai/docs/workflows/overview) when the workflow belongs in your application source or needs custom step functions. Dynamic workflows can invoke agents, tools, and workflows that are already registered on the `Mastra` instance.

### Quickstart

The following example registers a tool and invokes it from a dynamic workflow. It then runs the workflow. `LibSQLStore` persists the definition in `mastra.db`, so Mastra can restore it after a restart.

```typescript
import { Mastra } from '@mastra/core/mastra'
import { createTool } from '@mastra/core/tools'
import { LibSQLStore } from '@mastra/libsql'
import { z } from 'zod'

const greetingTool = createTool({
  id: 'create-greeting',
  description: 'Create a greeting for a name',
  inputSchema: z.object({
    name: z.string(),
  }),
  outputSchema: z.object({
    message: z.string(),
  }),
  execute: async ({ name }) => ({
    message: `Hello, ${name}!`,
  }),
})

const mastra = new Mastra({
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: 'file:./mastra.db',
  }),
  tools: { 'create-greeting': greetingTool },
})

await mastra.addDynamicWorkflow({
  id: 'greeting-workflow',
  description: 'Create a greeting for the supplied name',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
    },
    required: ['name'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      message: { type: 'string' },
    },
    required: ['message'],
  },
  graph: [
    {
      type: 'tool',
      id: 'greet',
      toolId: 'create-greeting',
    },
  ],
})

const workflow = mastra.getWorkflow('greeting-workflow')
const run = await workflow.createRun()
const result = await run.start({
  inputData: { name: 'Ada' },
})

if (result.status === 'success') {
  console.log(result.result.message)
}
```

The workflow prints `Hello, Ada!`. Calling [`addDynamicWorkflow()`](https://mastra.ai/reference/core/addDynamicWorkflow) validates the definition before it changes storage or the live workflow registry.

The definition uses JSON Schema because it must survive a JSON round trip. The `graph` describes which registered components to invoke and how data moves between them. See the [dynamic workflow definition reference](https://mastra.ai/reference/workflows/dynamic-workflow-definition) for every field and graph entry.

### Build and update definitions

A definition can come from any source that produces JSON. For example, an API route can accept a definition created by a visual editor and register it directly:

```typescript
const definition = await request.json()
await mastra.addDynamicWorkflow(definition)
```

#### Register dependencies first

Register referenced components on the same `Mastra` instance before adding the dynamic workflow. Agent and nested workflow entries use their intrinsic IDs. A tool entry uses its key from the `Mastra` `tools` object. The quickstart registers the tool under `create-greeting` before referencing that key with `toolId`.

Use a `mapping` entry when one step's output doesn't match the next step's input. Mapping entries can read data from the workflow input and previous step results, along with workflow state and request context. The [definition reference](https://mastra.ai/reference/workflows/dynamic-workflow-definition) lists the supported mapping descriptors.

#### Replace a workflow

Add a new definition with the same `id` to replace the persisted definition and live registration:

```typescript
await mastra.addDynamicWorkflow(updatedDefinition)
```

New runs use the updated graph. Runs that already started continue with their original graph.

#### Add nested workflows together

When a root workflow references helper workflows that aren't registered yet, add the full set with [`addDynamicWorkflows()`](https://mastra.ai/reference/core/addDynamicWorkflows):

```typescript
await mastra.addDynamicWorkflows([rootDefinition, helperDefinition])
```

Mastra validates the bundle as a unit and determines the registration order from the dependencies. If validation fails, none of the definitions are registered.

#### Manage definitions over HTTP

Applications don't need direct access to the `Mastra` instance to manage dynamic workflows. Use one of these interfaces:

- [Client SDK workflows API](https://mastra.ai/reference/client-js/workflows): Call `upsertDynamicWorkflow()` from a JavaScript or TypeScript client.
- [Server routes](https://mastra.ai/reference/server/routes): Send definitions to `POST /api/stored/workflows`.

On authenticated servers, dynamic-workflow management requires the `stored-workflows:read` and `stored-workflows:write` permissions. Running the registered workflow requires `workflows:execute`.

#### Persist definitions

Stored definitions use the `workflowDefinitions` storage domain. On startup, Mastra loads active definitions from storage and registers them in dependency order.

Without a storage adapter that supports this domain, `addDynamicWorkflow()` still registers the workflow in memory, but the definition is lost when the process restarts. See the [storage reference](https://mastra.ai/reference/storage/overview) for adapter support.

### Related

- [Dynamic workflow definition](https://mastra.ai/reference/workflows/dynamic-workflow-definition)
- [`Mastra.addDynamicWorkflow()`](https://mastra.ai/reference/core/addDynamicWorkflow)
- [`Mastra.addDynamicWorkflows()`](https://mastra.ai/reference/core/addDynamicWorkflows)
- [Client SDK workflows API](https://mastra.ai/reference/client-js/workflows)
- [Server routes](https://mastra.ai/reference/server/routes)

---

## Source: Snapshots (`docs/workflows/snapshots`)

Canonical URL: `https://mastra.ai/docs/workflows/snapshots.md`

## Snapshots

In Mastra, a snapshot is a serializable representation of a workflow's complete execution state at a specific point in time. Snapshots capture all the information needed to resume a workflow from exactly where it left off, including:

- The current state of each step in the workflow
- The outputs of completed steps
- The execution path taken through the workflow
- Any suspended steps and their metadata
- The remaining retry attempts for each step
- Additional contextual data needed to resume execution

Snapshots are automatically created and managed by Mastra whenever a workflow is suspended, and are persisted to the configured storage system.

### The role of snapshots in suspend and resume

Snapshots are the key mechanism enabling Mastra's suspend and resume capabilities. When a workflow step calls `await suspend()`:

1. The workflow execution is paused at that exact point
2. The current state of the workflow is captured as a snapshot
3. The snapshot is persisted to storage
4. The workflow step is marked as "suspended" with a status of `'suspended'`
5. Later, when `resume()` is called on the suspended step, the snapshot is retrieved
6. The workflow execution resumes from exactly where it left off

The mechanism provides a powerful way to implement human-in-the-loop workflows, handle rate limiting, wait for external resources, and implement complex branching workflows that may need to pause for extended periods.

### Snapshot anatomy

Each snapshot includes the `runId`, input, step status (`success`, `suspended`, etc.), any suspend and resume payloads, and the final output. As a result, full context is available when resuming execution.

```json
{
  "runId": "34904c14-e79e-4a12-9804-9655d4616c50",
  "status": "success",
  "value": {},
  "context": {
    "input": {
      "value": 100,
      "user": "Michael",
      "requiredApprovers": ["manager", "finance"]
    },
    "approval-step": {
      "payload": {
        "value": 100,
        "user": "Michael",
        "requiredApprovers": ["manager", "finance"]
      },
      "startedAt": 1758027577955,
      "status": "success",
      "suspendPayload": {
        "message": "Workflow suspended",
        "requestedBy": "Michael",
        "approvers": ["manager", "finance"]
      },
      "suspendedAt": 1758027578065,
      "resumePayload": { "confirm": true, "approver": "manager" },
      "resumedAt": 1758027578517,
      "output": { "value": 100, "approved": true },
      "endedAt": 1758027578634
    }
  },
  "activePaths": [],
  "serializedStepGraph": [
    {
      "type": "step",
      "step": {
        "id": "approval-step",
        "description": "Accepts a value, waits for confirmation"
      }
    }
  ],
  "suspendedPaths": {},
  "waitingPaths": {},
  "result": { "value": 100, "approved": true },
  "requestContext": {},
  "timestamp": 1758027578740
}
```

### How snapshots are saved and retrieved

Snapshots are saved to the configured storage system. By default, they use libSQL, but you can configure Upstash, PostgreSQL, or OracleDB instead. Each snapshot is saved in the `workflow_snapshots` table and identified by the workflow's `runId`.

Read more about:

- [libSQL Storage](https://mastra.ai/integrations/databases/libsql)
- [Upstash Storage](https://mastra.ai/integrations/databases/upstash)
- [PostgreSQL Storage](https://mastra.ai/integrations/databases/postgresql)
- [OracleDB Storage](https://mastra.ai/integrations/databases/oracledb)

#### Saving snapshots

When a workflow is suspended, Mastra automatically persists the workflow snapshot with these steps:

1. The `suspend()` function in a step execution triggers the snapshot process
2. The `WorkflowInstance.suspend()` method records the suspended machine
3. `persistWorkflowSnapshot()` is called to save the current state
4. The snapshot is serialized and stored in the configured database in the `workflow_snapshots` table
5. The storage record includes the workflow name, run ID, and the serialized snapshot

#### Retrieving snapshots

When a workflow is resumed, Mastra retrieves the persisted snapshot with these steps:

1. The `resume()` method is called with a specific step ID
2. The snapshot is loaded from storage using `loadWorkflowSnapshot()`
3. The snapshot is parsed and prepared for resumption
4. The workflow execution is recreated with the snapshot state
5. The suspended step is resumed, and execution continues

```typescript
const storage = mastra.getStorage()
const workflowStore = await storage?.getStore('workflows')

const snapshot = await workflowStore?.loadWorkflowSnapshot({
  runId: '<run-id>',
  workflowName: '<workflow-id>',
})

console.log(snapshot)
```

### Storage options for snapshots

Snapshots are persisted using a `storage` instance configured on the `Mastra` class. This storage layer is shared across all workflows registered to that instance. Mastra supports multiple storage options for flexibility in different environments.

```typescript
import { Mastra } from '@mastra/core'
import { LibSQLStore } from '@mastra/libsql'
import { approvalWorkflow } from './workflows'

export const mastra = new Mastra({
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: ':memory:',
  }),
  workflows: { approvalWorkflow },
})
```

- [libSQL Storage](https://mastra.ai/integrations/databases/libsql)
- [PostgreSQL Storage](https://mastra.ai/integrations/databases/postgresql)
- [OracleDB Storage](https://mastra.ai/integrations/databases/oracledb)
- [MongoDB Storage](https://mastra.ai/integrations/databases/mongodb)
- [Upstash Storage](https://mastra.ai/integrations/databases/upstash)
- [Cloudflare D1](https://mastra.ai/integrations/databases/cloudflare-d1)
- [DynamoDB](https://mastra.ai/integrations/databases/dynamodb)
- [More storage providers](https://mastra.ai/docs/storage)

### Best practices

1. **Ensure Serializability**: Any data that needs to be included in the snapshot must be serializable (convertible to JSON).
2. **Minimize Snapshot Size**: Avoid storing large data objects directly in the workflow context. Instead, store references to them (like IDs) and retrieve the data when needed.
3. **Handle Resume Context Carefully**: When resuming a workflow, carefully consider what context to provide. This will be merged with the existing snapshot data.
4. **Set Up Proper Monitoring**: Implement monitoring for suspended workflows and especially long-running ones, plus to ensure they're properly resumed.
5. **Consider Storage Scaling**: For applications with many suspended workflows, ensure your storage solution is appropriately scaled.

### Custom snapshot metadata

You can attach custom metadata when suspending a workflow by defining a `suspendSchema`. This metadata is stored in the snapshot and made available when the workflow is resumed.

```typescript
import { createWorkflow, createStep } from '@mastra/core/workflows'
import { z } from 'zod'

const approvalStep = createStep({
  id: 'approval-step',
  description: 'Accepts a value, waits for confirmation',
  inputSchema: z.object({
    value: z.number(),
    user: z.string(),
    requiredApprovers: z.array(z.string()),
  }),
  suspendSchema: z.object({
    message: z.string(),
    requestedBy: z.string(),
    approvers: z.array(z.string()),
  }),
  resumeSchema: z.object({
    confirm: z.boolean(),
    approver: z.string(),
  }),
  outputSchema: z.object({
    value: z.number(),
    approved: z.boolean(),
  }),
  execute: async ({ inputData, resumeData, suspend }) => {
    const { value, user, requiredApprovers } = inputData
    const { confirm } = resumeData ?? {}

    if (!confirm) {
      return await suspend({
        message: 'Workflow suspended',
        requestedBy: user,
        approvers: [...requiredApprovers],
      })
    }

    return {
      value,
      approved: confirm,
    }
  },
})
```

#### Providing resume data

Use `resumeData` to pass structured input when resuming a suspended step. It must match the step’s `resumeSchema`.

```typescript
const workflow = mastra.getWorkflow('approvalWorkflow')

const run = await workflow.createRun()

const result = await run.start({
  inputData: {
    value: 100,
    user: 'Michael',
    requiredApprovers: ['manager', 'finance'],
  },
})

if (result.status === 'suspended') {
  const resumedResult = await run.resume({
    step: 'approval-step',
    resumeData: {
      confirm: true,
      approver: 'manager',
    },
  })
}
```

### Related

- [Control Flow](https://mastra.ai/docs/workflows/control-flow)
- [Suspend and Resume](https://mastra.ai/docs/workflows/suspend-and-resume)
- [Time Travel](https://mastra.ai/docs/workflows/time-travel)
- [Human-in-the-loop](https://mastra.ai/docs/workflows/human-in-the-loop)

---

## Source: Suspend and Resume (`docs/workflows/suspend-and-resume`)

Canonical URL: `https://mastra.ai/docs/workflows/suspend-and-resume.md`

## Suspend and resume

Pause a workflow at any step to collect additional data, wait for an API callback, throttle a costly operation, or request [human-in-the-loop](https://mastra.ai/docs/workflows/human-in-the-loop) input. Suspension saves the current execution state as a snapshot. Later, resume from a [specific step ID](https://mastra.ai/docs/workflows/snapshots) to restore the exact captured state. [Snapshots](https://mastra.ai/docs/workflows/snapshots) are stored in your configured storage provider and persist across deployments and application restarts.

### Pausing a workflow with `suspend()`

Use `suspend()` to pause workflow execution at a specific step. You can define a suspend condition in the step’s `execute` block using values from `resumeData`.

- If the condition isn’t met, the workflow pauses and returns `suspend()`.
- If the condition is met, the workflow continues with the remaining logic in the step.

```typescript
const step1 = createStep({
  id: 'step-1',
  inputSchema: z.object({
    userEmail: z.string(),
  }),
  outputSchema: z.object({
    output: z.string(),
  }),
  resumeSchema: z.object({
    approved: z.boolean(),
  }),
  execute: async ({ inputData, resumeData, suspend }) => {
    const { userEmail } = inputData
    const { approved } = resumeData ?? {}

    if (!approved) {
      return await suspend({})
    }

    return {
      output: `Email sent to ${userEmail}`,
    }
  },
})

export const testWorkflow = createWorkflow({
  id: 'test-workflow',
  inputSchema: z.object({
    userEmail: z.string(),
  }),
  outputSchema: z.object({
    output: z.string(),
  }),
})
  .then(step1)
  .commit()
```

### Restarting a workflow with `resume()`

Use `resume()` to restart a suspended workflow from the step where it paused. Pass `resumeData` matching the step's `resumeSchema` to satisfy the suspend condition and continue execution.

```typescript
import { step1 } from './workflows/test-workflow'

const workflow = mastra.getWorkflow('testWorkflow')
const run = await workflow.createRun()

await run.start({
  inputData: {
    userEmail: 'alex@example.com',
  },
})

const handleResume = async () => {
  const result = await run.resume({
    step: step1,
    resumeData: { approved: true },
  })
}
```

Passing the `step` object provides full type-safety for `resumeData`. Alternatively, you can pass a step ID for more flexibility when the ID comes from user input or a database.

```typescript
const result = await run.resume({
  step: 'step-1',
  resumeData: { approved: true },
})
```

If only one step is suspended, you can omit the step argument entirely and Mastra will resume the last suspended step in the workflow.

When resuming with only a `runId`, create a run instance first using `createRun()`.

```typescript
const workflow = mastra.getWorkflow('testWorkflow')
const run = await workflow.createRun({ runId: '123' })

const stream = run.resume({
  resumeData: { approved: true },
})
```

You can call `resume()` from anywhere in your application, such as an HTTP endpoint or event handler. Timers and code responding to [human input](https://mastra.ai/docs/workflows/human-in-the-loop) can also resume a workflow.

```typescript
const midnight = new Date()
midnight.setUTCHours(24, 0, 0, 0)

setTimeout(async () => {
  await run.resume({
    step: 'step-1',
    resumeData: { approved: true },
  })
}, midnight.getTime() - Date.now())
```

### Accessing suspend data with `suspendData`

When a step is suspended, you may want to access the data that was provided to `suspend()` when the step is later resumed. Use the `suspendData` parameter in your step's execute function to access this data.

```typescript
const approvalStep = createStep({
  id: 'user-approval',
  inputSchema: z.object({
    requestId: z.string(),
  }),
  resumeSchema: z.object({
    approved: z.boolean(),
  }),
  suspendSchema: z.object({
    reason: z.string(),
    requestDetails: z.string(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ inputData, resumeData, suspend, suspendData }) => {
    const { requestId } = inputData
    const { approved } = resumeData ?? {}

    // On first execution, suspend with context
    if (!approved) {
      return await suspend({
        reason: 'User approval required',
        requestDetails: `Request ${requestId} pending review`,
      })
    }

    // On resume, access the original suspend data
    const suspendReason = suspendData?.reason || 'Unknown'
    const details = suspendData?.requestDetails || 'No details'

    return {
      result: `${details} - ${suspendReason} - Decision: ${approved ? 'Approved' : 'Rejected'}`,
    }
  },
})
```

The `suspendData` parameter is automatically populated when a step is resumed and contains the exact data that was passed to the `suspend()` function during the original suspension. You can maintain context about why the workflow was suspended and use that information during the resume process.

### Identifying suspended executions

When a workflow is suspended, it restarts from the step where it paused. You can check the workflow's `status` to confirm it's suspended, and use `suspended` to identify the paused step or [nested workflow](https://mastra.ai/docs/workflows/overview).

```typescript
const workflow = mastra.getWorkflow('testWorkflow')
const run = await workflow.createRun()

const result = await run.start({
  inputData: {
    userEmail: 'alex@example.com',
  },
})

if (result.status === 'suspended') {
  console.log(result.suspended[0])
  await run.resume({
    step: result.suspended[0],
    resumeData: { approved: true },
  })
}
```

#### Example output

The `suspended` array contains the IDs of any suspended workflows and steps from the run. These can be passed to the `step` parameter when calling `resume()` to target and resume the suspended execution path.

```typescript
['nested-workflow', 'step-1']
```

### Recovering suspended runs

Use `workflow.getWorkflowRunById()` with `createWorkflowStateReader()` when your application needs to recover a suspended run from storage. The reader exposes suspended steps, resume labels, step payloads, and step outputs without reading the raw snapshot shape.

```typescript
import { createWorkflowStateReader } from '@mastra/core/workflows'

const workflow = mastra.getWorkflow('testWorkflow')
const state = await workflow.getWorkflowRunById('run-123')

if (state?.status === 'suspended') {
  const reader = createWorkflowStateReader(state)
  const suspendedStep = reader.getSuspendedStep()
  const approvalLabel = reader.getResumeLabel('approve')
  const run = await workflow.createRun({ runId: state.runId })

  await run.resume({
    step: approvalLabel?.stepId ?? suspendedStep?.path,
    resumeData: { approved: true },
    forEachIndex: approvalLabel?.foreachIndex,
  })
}
```

For nested workflows, `suspendedStep.path` contains the resume path. For `foreach` suspensions, matching resume labels include `foreachIndex` when the label points to a specific iteration.

### Sleep

Sleep methods can be used to pause execution at the workflow level, which sets the status to `waiting`. By comparison, `suspend()` pauses execution within a specific step and sets the status to `suspended`.

**Available methods:**

- [`.sleep()`](https://mastra.ai/reference/workflows/workflow-methods/sleep): Pause for a specified number of milliseconds
- [`.sleepUntil()`](https://mastra.ai/reference/workflows/workflow-methods/sleepUntil): Pause until a specific date

### Related

- [Control Flow](https://mastra.ai/docs/workflows/control-flow)
- [Human-in-the-loop](https://mastra.ai/docs/workflows/human-in-the-loop)
- [Snapshots](https://mastra.ai/docs/workflows/snapshots)
- [Time Travel](https://mastra.ai/docs/workflows/time-travel)
- [Workflow state reader](https://mastra.ai/reference/workflows/workflow-state-reader)

---

## Source: Human-in-the-Loop (`docs/workflows/human-in-the-loop`)

Canonical URL: `https://mastra.ai/docs/workflows/human-in-the-loop.md`

## Human-in-the-loop

Some workflows need to pause for human input before continuing. When a workflow is [suspended](https://mastra.ai/docs/workflows/suspend-and-resume), it can return a message explaining why it paused and what’s needed to proceed. The workflow can then either [resume](#resuming-workflows-with-human-input) or [bail](#handling-human-rejection-with-bail) based on the input received. This approach works well for manual approvals, rejections, gated decisions, or any step that requires human oversight.

### Pausing workflows for human input

Human-in-the-loop (HITL) input works much like [pausing a workflow](https://mastra.ai/docs/workflows/suspend-and-resume) using `suspend()`. The key difference is that when human input is required, you can return `suspend()` with a payload that provides context or guidance to the user on how to continue.

```typescript
import { createWorkflow, createStep } from '@mastra/core/workflows'
import { z } from 'zod'

const step1 = createStep({
  id: 'step-1',
  inputSchema: z.object({
    userEmail: z.string(),
  }),
  outputSchema: z.object({
    output: z.string(),
  }),
  resumeSchema: z.object({
    approved: z.boolean(),
  }),
  suspendSchema: z.object({
    reason: z.string(),
  }),
  execute: async ({ inputData, resumeData, suspend }) => {
    const { userEmail } = inputData
    const { approved } = resumeData ?? {}

    if (!approved) {
      return await suspend({
        reason: 'Human approval required.',
      })
    }

    return {
      output: `Email sent to ${userEmail}`,
    }
  },
})

export const testWorkflow = createWorkflow({
  id: 'test-workflow',
  inputSchema: z.object({
    userEmail: z.string(),
  }),
  outputSchema: z.object({
    output: z.string(),
  }),
})
  .then(step1)
  .commit()
```

### Providing user feedback

When a workflow is suspended, you can access the payload returned by `suspend()` by identifying the suspended step and reading its `suspendPayload`.

```typescript
const workflow = mastra.getWorkflow('testWorkflow')
const run = await workflow.createRun()

const result = await run.start({
  inputData: {
    userEmail: 'alex@example.com',
  },
})

if (result.status === 'suspended') {
  const suspendStep = result.suspended[0]
  const suspendedPayload = result.steps[suspendStep[0]].suspendPayload

  console.log(suspendedPayload)
}
```

#### Example output

The data returned by the step can include a reason and help the user understand what's needed to resume the workflow.

```typescript
{
  reason: 'Confirm to send email.'
}
```

### Resuming workflows with human input

As with [restarting a workflow](https://mastra.ai/docs/workflows/suspend-and-resume), use `resume()` with `resumeData` to continue a workflow after receiving input from a human. The workflow resumes from the step where it was paused.

```typescript
const workflow = mastra.getWorkflow('testWorkflow')
const run = await workflow.createRun()

await run.start({
  inputData: {
    userEmail: 'alex@example.com',
  },
})

const handleResume = async () => {
  const result = await run.resume({
    step: 'step-1',
    resumeData: { approved: true },
  })
}
```

#### Handling human rejection with `bail()`

Use `bail()` to stop workflow execution at a step without triggering an error. This can be useful when a human explicitly rejects an action. The workflow completes with a `success` status, and any logic after the call to `bail()` is skipped.

```typescript
const step1 = createStep({
  execute: async ({ inputData, resumeData, suspend, bail }) => {
    const { userEmail } = inputData
    const { approved } = resumeData ?? {}

    if (approved === false) {
      return bail({
        reason: 'User rejected the request.',
      })
    }

    if (!approved) {
      return await suspend({
        reason: 'Human approval required.',
      })
    }

    return {
      message: `Email sent to ${userEmail}`,
    }
  },
})
```

### Multi-turn human input

For workflows that require input at multiple stages, the suspend pattern remains the same. Each step defines a `resumeSchema`, and `suspendSchema` typically with a reason that can be used to provide user feedback.

```typescript
const step1 = createStep({...});

const step2 = createStep({
  id: "step-2",
  inputSchema: z.object({
    message: z.string()
  }),
  outputSchema: z.object({
    output: z.string()
  }),
  resumeSchema: z.object({
    approved: z.boolean()
  }),
  suspendSchema: z.object({
    reason: z.string()
  }),
  execute: async ({ inputData, resumeData, suspend }) => {
    const { message } = inputData;
    const { approved } = resumeData ?? {};

    if (!approved) {
      return await suspend({
        reason: "Human approval required."
      });
    }

    return {
      output: `${message} - Deleted`
    };
  }
});

export const testWorkflow = createWorkflow({
  id: "test-workflow",
  inputSchema: z.object({
    userEmail: z.string()
  }),
  outputSchema: z.object({
    output: z.string()
  })
})
  .then(step1)
  .then(step2)
  .commit();
```

Each step must be resumed in sequence, with a separate call to `resume()` for each suspended step. This approach helps manage multi-step approvals with consistent UI feedback and clear input handling at each stage.

```typescript
const handleResume = async () => {
  const result = await run.resume({
    step: 'step-1',
    resumeData: { approved: true },
  })
}

const handleDelete = async () => {
  const result = await run.resume({
    step: 'step-2',
    resumeData: { approved: true },
  })
}
```

### Related

- [Control Flow](https://mastra.ai/docs/workflows/control-flow)
- [Suspend and Resume](https://mastra.ai/docs/workflows/suspend-and-resume)

---

## Source: Time Travel (`docs/workflows/time-travel`)

Canonical URL: `https://mastra.ai/docs/workflows/time-travel.md`

## Time travel

Time travel allows you to re-execute a workflow starting from any specific step, using either stored snapshot data or custom context you provide.

This is useful for debugging failed workflows or testing individual steps with different inputs, or alternatively recovering from errors without re-running the entire workflow. You can also use time travel to execute a workflow that hasn't been run yet, starting from any specific step.

### How time travel works

When you call `timeTravel()` on a workflow run:

1. The workflow loads the existing snapshot from storage (if available)
2. Step results before the target step are reconstructed from the snapshot or provided context
3. Execution begins from the specified step with the provided or reconstructed input data
4. The workflow continues to completion from that point forward

If the workflow definition has changed since the run was recorded (for example, a step was renamed), or the recorded run never reached a step that precedes the target, time travel fails with a descriptive error before anything executes, and the stored snapshot is left unchanged.

Time travel requires storage to be configured since it relies on persisted workflow snapshots.

### Basic usage

Use `run.timeTravel()` to re-execute a workflow from a specific step:

```typescript
import { mastra } from './mastra'

const workflow = mastra.getWorkflow('myWorkflow')
const run = await workflow.createRun()

const result = await run.timeTravel({
  step: 'step2',
  inputData: { previousStepResult: 'custom value' },
})
```

### Specifying the target step

You can specify the target step using either a step reference or a step ID:

#### Using step reference

```typescript
const result = await run.timeTravel({
  step: step2,
  inputData: { value: 10 },
})
```

#### Using step ID

```typescript
const result = await run.timeTravel({
  step: 'step2',
  inputData: { value: 10 },
})
```

#### Nested workflow steps

For steps inside nested workflows, use dot notation, an array of step IDS or an array of step references:

```typescript
// Using dot notation
const result = await run.timeTravel({
  step: 'nestedWorkflow.step3',
  inputData: { value: 10 },
})

// Using array of step IDs
const result = await run.timeTravel({
  step: ['nestedWorkflow', 'step3'],
  inputData: { value: 10 },
})

// Using array of step references
const result = await run.timeTravel({
  step: [nestedWorkflow, step3],
  inputData: { value: 10 },
})
```

### Providing execution context

You can provide context to specify the state of previous steps when time traveling:

```typescript
const result = await run.timeTravel({
  step: 'step2',
  context: {
    step1: {
      status: 'success',
      payload: { value: 0 },
      output: { step1Result: 2 },
      startedAt: Date.now(),
      endedAt: Date.now(),
    },
  },
})
```

The context object contains step results keyed by step ID. Each step result includes:

- `status`: The step's execution status. Commonly `success`, `failed`, or `suspended`, but any workflow run status is accepted: `running`, `success`, `failed`, `tripwire`, `suspended`, `waiting`, `pending`, `canceled`, `bailed`, `paused`, or `skipped`
- `payload`: The input data passed to the step
- `output`: The step's output data (for successful steps)
- `startedAt`: Timestamp when the step started
- `endedAt`: Timestamp when the step ended (for completed steps)
- `suspendPayload`: Data passed to `suspend()` (for suspended steps)
- `resumePayload`: Data passed to `resume()` (for resumed steps)

### Re-running failed workflows

Time travel is particularly useful for debugging and recovering from failed workflow executions:

```typescript
const workflow = mastra.getWorkflow('myWorkflow')
const run = await workflow.createRun()

// Initial run fails at step2
const failedResult = await run.start({
  inputData: { value: 1 },
})

if (failedResult.status === 'failed') {
  // Re-run from step2 with corrected input
  const recoveredResult = await run.timeTravel({
    step: 'step2',
    inputData: { step1Result: 5 }, // Provide corrected input
  })
}
```

### Time travel with suspended workflows

You can time travel to resume a suspended workflow from an earlier step:

```typescript
const run = await workflow.createRun()

// Start workflow - suspends at promptAgent step
const initialResult = await run.start({
  inputData: { input: 'test' },
})

if (initialResult.status === 'suspended') {
  // Time travel back to an earlier step with resume data
  const result = await run.timeTravel({
    step: 'getUserInput',
    resumeData: {
      userInput: 'corrected input',
    },
  })
}
```

### Streaming time travel results

Use `timeTravelStream()` to receive streaming events during time travel execution:

```typescript
const run = await workflow.createRun()

const stream = run.timeTravelStream({
  step: 'step2',
  inputData: { value: 10 },
})

for await (const event of stream.fullStream) {
  console.log(event.type, event.payload)
}

const result = await stream.result

if (result.status === 'success') {
  console.log(result.result)
}
```

### Time travel with initial state

You can provide initial state when time traveling to set workflow-level state:

```typescript
const result = await run.timeTravel({
  step: 'step2',
  inputData: { value: 10 },
  initialState: {
    counter: 5,
    metadata: { source: 'time-travel' },
  },
})
```

### Error handling

Time travel throws errors in specific situations. It rejects a call that observes a running snapshot, but it doesn't atomically claim the run. Concurrent calls can both pass the status check and proceed, so guard against duplicates in your application. See [Concurrent time travel calls](https://mastra.ai/reference/workflows/run-methods/timeTravel).

#### Running workflow

You can't time travel to a workflow that's currently running:

```typescript
try {
  await run.timeTravel({ step: 'step2' })
} catch (error) {
  // "This workflow run is still running, cannot time travel"
}
```

#### Invalid step ID

Time travel throws if the target step doesn't exist in the current workflow definition:

```typescript
try {
  await run.timeTravel({ step: 'nonExistentStep' })
} catch (error) {
  // "Cannot time travel to step 'nonExistentStep': the step does not exist in the current execution graph. ..."
}
```

The error also lists up to 10 of the step IDs recorded in the run's snapshot (with a count of any remaining IDs), and confirms that the stored snapshot wasn't modified. If the run has no recorded step results, the error reads `Time travel target step not found in execution graph: 'nonExistentStep'. Verify the step id/path.` instead.

#### Invalid input data

When `validateInputs` is enabled, time travel validates the input data against the step's schema:

```typescript
try {
  await run.timeTravel({
    step: 'step2',
    inputData: { invalidField: 'value' },
  })
} catch (error) {
  // "Invalid inputData: \n- step1Result: Required"
}
```

### Nested workflows context

When time traveling into a nested workflow, you can provide context for both the parent and nested workflow steps:

```typescript
const result = await run.timeTravel({
  step: 'nestedWorkflow.step3',
  context: {
    step1: {
      status: 'success',
      payload: { value: 0 },
      output: { step1Result: 2 },
      startedAt: Date.now(),
      endedAt: Date.now(),
    },
    nestedWorkflow: {
      status: 'running',
      payload: { step1Result: 2 },
      startedAt: Date.now(),
    },
  },
  nestedStepsContext: {
    nestedWorkflow: {
      step2: {
        status: 'success',
        payload: { step1Result: 2 },
        output: { step2Result: 3 },
        startedAt: Date.now(),
        endedAt: Date.now(),
      },
    },
  },
})
```

### Use cases

#### Debugging failed steps

Re-run a failed step with the same or modified input to diagnose issues:

```typescript
const result = await run.timeTravel({
  step: failedStepId,
  context: originalContext, // Use context from the failed run
})
```

#### Testing step logic on new workflow run

Test individual steps with specific inputs on a new workflow run, useful for testing a step logic without starting workflow execution from the beginning.

```typescript
const result = await run.timeTravel({
  step: 'processData',
  inputData: { testData: 'specific test case' },
})
```

#### Recovering from transient failures

Re-run steps that failed due to temporary issues (network errors, rate limits):

```typescript
// After fixing the external service issue
const result = await run.timeTravel({
  step: 'callExternalApi',
  inputData: savedInputData,
})
```

### Related

- [Snapshots](https://mastra.ai/docs/workflows/snapshots)
- [Suspend and Resume](https://mastra.ai/docs/workflows/suspend-and-resume)
- [Error Handling](https://mastra.ai/docs/workflows/error-handling)
- [Control Flow](https://mastra.ai/docs/workflows/control-flow)

---

## Source: Error Handling (`docs/workflows/error-handling`)

Canonical URL: `https://mastra.ai/docs/workflows/error-handling.md`

## Error handling

Mastra workflows support error handling through result status checks after execution, retry policies for transient failures, and lifecycle callbacks for centralized error logging or alerting.

### Handling workflow results

When you run a workflow, the result object contains the status and any errors that occurred.

#### Checking the result status

```typescript
import { mastra } from './mastra'

const workflow = mastra.getWorkflow('myWorkflow')
const run = await workflow.createRun()
const result = await run.start({ inputData: { value: 'test' } })

switch (result.status) {
  case 'success':
    console.log('Workflow completed:', result.result)
    break
  case 'failed':
    console.error('Workflow failed:', result.error)
    break
  case 'suspended':
    console.log('Workflow suspended, waiting for resume')
    break
}
```

#### Result object structure

The result object contains:

- `status` - The workflow status: `'success'`, `'failed'`, `'suspended'`, or `'tripwire'`
- `result` - The workflow output (when status is `'success'`)
- `error` - Error details (when status is `'failed'`)
- `steps` - Individual step results with their status and output

#### Accessing step results

You can inspect individual step results to understand where a failure occurred:

```typescript
const result = await run.start({ inputData: { value: 'test' } })

if (result.status === 'failed') {
  // Find which step failed
  for (const [stepId, stepResult] of Object.entries(result.steps)) {
    if (stepResult.status === 'failed') {
      console.error(`Step ${stepId} failed:`, stepResult.error)
    }
  }
}
```

### Lifecycle callbacks

For scenarios where you need to handle workflow completion without awaiting the result, such as background jobs, fire-and-forget workflows, or centralized logging, you can use lifecycle callbacks.

Lifecycle callbacks are awaited, but they aren't durable or retried. Use workflow steps for work that must complete reliably.

#### `onFinish`

Called when a workflow completes with any status (success, failed, suspended, or tripwire):

```typescript
import { createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'

const orderWorkflow = createWorkflow({
  id: 'order-processing',
  inputSchema: z.object({ orderId: z.string() }),
  outputSchema: z.object({ orderId: z.string(), status: z.string() }),
  options: {
    onFinish: async result => {
      if (result.status === 'success') {
        await db.updateOrderStatus(result.result.orderId, result.status)
      }
      await analytics.track('workflow_completed', {
        workflowId: 'order-processing',
        status: result.status,
      })
    },
  },
})
```

The `onFinish` callback receives:

- `status` - The workflow status
- `result` - The workflow output (on success)
- `error` - Error details (on failure)
- `steps` - Individual step results
- `tripwire` - Tripwire info (if status is `'tripwire'`)
- `runId` - The unique identifier for this workflow run
- `workflowId` - The workflow's identifier
- `resourceId` - Optional resource identifier (if provided when creating the run)
- `getInitData<any>()` - Function that returns the initial input data
- `mastra` - The Mastra instance (if workflow is registered with Mastra)
- `requestContext` - Request-scoped context data
- `logger` - The workflow's logger instance
- `state` - The workflow's current state object

#### `onError`

Called only when a workflow fails (status is `'failed'` or `'tripwire'`):

```typescript
import { createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'

const paymentWorkflow = createWorkflow({
  id: 'payment-processing',
  inputSchema: z.object({ amount: z.number() }),
  outputSchema: z.object({ transactionId: z.string() }),
  options: {
    onError: async errorInfo => {
      await alertService.notify({
        channel: 'payments-alerts',
        message: `Payment workflow failed: ${errorInfo.error?.message}`,
      })
      await errorTracker.capture(errorInfo.error)
    },
  },
})
```

The `onError` callback receives:

- `status` - Either `'failed'` or `'tripwire'`
- `error` - Error details
- `steps` - Individual step results
- `tripwire` - Tripwire info (if status is `'tripwire'`)
- `runId` - The unique identifier for this workflow run
- `workflowId` - The workflow's identifier
- `resourceId` - Optional resource identifier (if provided when creating the run)
- `getInitData<any>()` - Function that returns the initial input data
- `mastra` - The Mastra instance (if workflow is registered with Mastra)
- `requestContext` - Request-scoped context data
- `logger` - The workflow's logger instance
- `state` - The workflow's current state object

#### Using both callbacks

You can use both callbacks together:

```typescript
import { createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'

const pipelineWorkflow = createWorkflow({
  id: 'data-pipeline',
  inputSchema: z.object({ source: z.string() }),
  outputSchema: z.object({ recordsProcessed: z.number() }),
  options: {
    onFinish: async result => {
      // Always log completion
      await logger.info('Pipeline completed', { status: result.status })
    },
    onError: async errorInfo => {
      // Alert on failures
      await pagerDuty.alert('Data pipeline failed', errorInfo.error)
    },
  },
})
```

#### Error handling in callbacks

Errors thrown inside callbacks are caught and logged, they won't affect the workflow result or cause it to fail. As a result, callback issues don't break your workflows in production.

```typescript
options: {
  onFinish: async (result) => {
    // If this throws, it's logged but the workflow result is unchanged
    await externalService.notify(result);
  },
}
```

### Retries

Mastra has a retry mechanism for workflows or steps that fail due to transient errors, for example when steps interact with external services or resources that may be temporarily unavailable.

### Workflow-level using `retryConfig`

You can configure retries at the workflow level, which applies to all steps in the workflow:

```typescript
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({...});

export const testWorkflow = createWorkflow({
  retryConfig: {
    attempts: 5,
    delay: 2000
  }
})
  .then(step1)
  .commit();
```

### Step-level using `retries`

You can configure retries for individual steps using the `retries` property. This overrides the workflow-level retry configuration for that specific step:

```typescript
import { createWorkflow, createStep } from '@mastra/core/workflows'
import { z } from 'zod'

const step1 = createStep({
  execute: async () => {
    const response = await fetch('example-url')

    if (!response.ok) {
      throw new Error('Error')
    }

    return {
      value: '',
    }
  },
  retries: 3,
})
```

### Conditional branching

You can create alternative workflow paths based on the success or failure of previous steps using conditional logic:

```typescript
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({
  execute: async () => {
    try {
      const response = await fetch('example-url');

      if (!response.ok) {
        throw new Error('error');
      }

      return {
        status: "ok"
      };
    } catch (error) {
      return {
        status: "error"
      };
    }
  }
});

const step2 = createStep({...});
const fallback = createStep({...});

export const testWorkflow = createWorkflow({})
  .then(step1)
  .branch([
    [async ({ inputData: { status } }) => status === "ok", step2],
    [async ({ inputData: { status } }) => status === "error", fallback]
  ])
  .commit();
```

### Check previous step results

Use `getStepResult()` to inspect a previous step’s results.

```typescript
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({...});

const step2 = createStep({
  execute: async ({ getStepResult }) => {
    const step1Result = getStepResult(step1);

    return {
      value: ""
    };
  }
});
```

### Exiting early with `bail()`

Use `bail()` in a step to exit early with a successful result. This returns the provided payload as the step output and ends workflow execution.

```typescript
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({
  id: 'step1',
  execute: async ({ bail }) => {
    return bail({ result: 'bailed' });
  },
  inputSchema: z.object({ value: z.string() }),
  outputSchema: z.object({ result: z.string() }),
});

export const testWorkflow = createWorkflow({...})
  .then(step1)
  .commit();
```

### Exiting early with `Error()`

Use `throw new Error()` in a step to exit with an error.

```typescript
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({
  id: 'step1',
  execute: async () => {
    throw new Error('error');
  },
  inputSchema: z.object({ value: z.string() }),
  outputSchema: z.object({ result: z.string() }),
});

export const testWorkflow = createWorkflow({...})
  .then(step1)
  .commit();
```

\## Monitor errors with `stream()`

You can monitor workflows for errors using `stream`:

```typescript
import { mastra } from '../src/mastra'

const workflow = mastra.getWorkflow('testWorkflow')

const run = await workflow.createRun()

const stream = await run.stream({
  inputData: {
    value: 'initial data',
  },
})

for await (const chunk of stream.stream) {
  console.log(chunk.payload.output.stats)
}
```

### Related

- [Control Flow](https://mastra.ai/docs/workflows/control-flow)
- [Suspend and Resume](https://mastra.ai/docs/workflows/suspend-and-resume)
- [Time Travel](https://mastra.ai/docs/workflows/time-travel)
- [Human-in-the-loop](https://mastra.ai/docs/workflows/human-in-the-loop)

---

## Source: Scheduled Workflows (`docs/workflows/scheduled-workflows`)

Canonical URL: `https://mastra.ai/docs/workflows/scheduled-workflows.md`

## Scheduled workflows

Declare a `schedule` field on a workflow and Mastra will fire it on the cron you specify. The same workflow remains callable directly with `workflow.start()`, scheduled fires and manual runs share a single execution path.

### Quickstart

The following workflow runs every day at 9am New York time. Register it on `Mastra` as you would any other workflow, the scheduler picks it up automatically.

```typescript
import { createWorkflow, createStep } from '@mastra/core/workflows'
import { z } from 'zod'

const sendReport = createStep({
  id: 'send-report',
  inputSchema: z.object({ userId: z.string() }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ inputData }) => {
    // ...send the report for inputData.userId
    return { ok: true }
  },
})

export const dailyReport = createWorkflow({
  id: 'daily-report',
  inputSchema: z.object({ userId: z.string() }),
  outputSchema: z.object({ ok: z.boolean() }),
  schedule: {
    cron: '0 9 * * *',
    timezone: 'America/New_York',
    inputData: { userId: 'system' },
  },
})
  .then(sendReport)
  .commit()
```

A separate "register schedule" call won't happen. The scheduler reads `schedule` straight off the workflow when `Mastra` boots.

### Execution engine

Declaring `schedule` doesn't change how the workflow runs. Scheduled fires run in-process on the host that runs the scheduler, the same way `workflow.start()` or an HTTP-triggered run does. A workflow that declares `schedule` needs no extra storage or worker setup to run directly.

Split-worker deployments are the exception. When the [`MASTRA_WORKERS`](https://mastra.ai/reference/workers/overview) environment variable is set to any value, including `false`, `createWorkflow` builds scheduled workflows on the **evented execution engine** so that every process in the deployment runs them the same way. Scheduled fires then run on the [orchestration worker](https://mastra.ai/docs/deployment/workers), and Mastra logs a warning to the console when the workflow is created. The public API (`workflow.start()`, `workflow.startAsync()`, `resume()`) doesn't change.

Evented runs require a storage adapter that applies concurrent updates atomically, such as `@mastra/libsql` or `@mastra/pg`. With any other adapter, `createRun()` throws an error that lists the supported adapters.

Only the environment variable triggers the switch, because `createWorkflow` runs before `Mastra` reads its `workers` option. If you split workers with the `workers` option instead, import `createWorkflow` from `@mastra/core/workflows/evented` for your scheduled workflows.

### Single schedule

Pass an object to `schedule` for a workflow that fires on one cadence:

```typescript
const dailyReport = createWorkflow({
  id: 'daily-report',
  schedule: {
    cron: '0 9 * * *',
    timezone: 'America/New_York',
    inputData: { userId: 'system' },
  },
  // ...
})
```

Fields:

- `cron` (required): a 5-, 6-, or 7-part cron expression. Validated at workflow construction time.
- `timezone` (optional): IANA timezone, for example `America/New_York`. Defaults to the host's local timezone. Set this explicitly in production so fire times don't depend on server locale.
- `inputData` (optional): payload passed as the workflow's input on every fire.
- `initialState` (optional): initial state for the run.
- `requestContext` (optional): request context attached to the run.
- `metadata` (optional): arbitrary metadata persisted alongside the schedule row.

### Multiple schedules

Pass an array to fire the same workflow on multiple cadences. Each entry needs a unique stable `id`:

```typescript
const statusCheck = createWorkflow({
  id: 'status-check',
  schedule: [
    { id: 'morning', cron: '0 9 * * *', inputData: { window: 'morning' } },
    { id: 'evening', cron: '0 18 * * *', inputData: { window: 'evening' } },
  ],
  // ...
})
```

Each entry creates an independent schedule row and fires on its own cron, plus shows up separately in the Studio Schedules view.

### Viewing schedules in Studio

Studio surfaces schedules as a top-level area, not as a tab inside a workflow:

- **All schedules**: open `/workflows/schedules` for a cross-workflow list. Each row shows the workflow id, cron, next fire, and the most recent run's status. The list answers "is anything broken?" at a glance.
- **Filtered by workflow**: append `?workflowId=<id>` to scope the list to a single workflow, for example `/workflows/schedules?workflowId=daily-report`.
- **Schedule detail**: Select any row to open `/workflows/schedules/:scheduleId`. The page shows schedule metadata and **Pause** / **Resume** controls, followed by the full trigger history.

A workflow's header includes a **Schedules** action when the workflow has at least one schedule:

- When one schedule matches, the action links straight to its detail page.
- Multiple schedules: the action links to the workflow-filtered list at `/workflows/schedules?workflowId=<id>`.
- No schedules: the action is hidden.

#### Trigger history

Every fire records a trigger row with the run id, scheduled time, actual fire time, and publish status. The schedule detail page joins each trigger to the corresponding workflow run and shows:

- The run's status (`running`, `success`, `failed`, `suspended`, `canceled`) as a badge.
- The run's start time and duration.
- A link to the run's full graph view at `/workflows/:workflowId/graph/:runId`.
- A `pending` badge for triggers whose run record hasn't been written yet, due to a race between trigger publish and run snapshot.
- A `publish failed` badge with the publish error when the scheduler couldn't enqueue the run at all.

Triggers in a non-terminal state cause the panel to poll every five seconds until they reach a terminal state. The list paginates, so long-running schedules don't load thousands of rows up front.

### Pausing a schedule at runtime

When a scheduled workflow misfires in production, you don't have to redeploy or hand-edit the database. Pause it from the SDK:

```typescript
import { MastraClient } from '@mastra/client-js'

const client = new MastraClient({ baseUrl: 'http://localhost:4111' })

// Schedule ids are derived from the workflow id: `wf_<workflowId>` for a
// single declarative schedule, or `wf_<workflowId>__<scheduleId>` when you
// declare multiple schedules per workflow as an array.
await client.pauseSchedule('wf_daily-report')
// ...investigate, ship a fix, then:
await client.resumeSchedule('wf_daily-report')
```

In Studio, open the schedule detail page and select **Pause** or **Resume** in the header.

A few rules to know:

- Pause is durable. The status is written to the schedules table and survives process restarts and redeploys. The declarative-config upsert never overwrites a user-set status, even when you change `cron`, `timezone`, or other fields.
- Resume recomputes `nextFireAt` from now. A schedule paused for a week doesn't fire seven backlogged runs the moment you resume it. It fires on the next regular cron tick.
- Unpause with `resumeSchedule` or the **Resume** button in Studio. Editing the workflow's `schedule` config doesn't unpause a paused row.
- Pause and resume are idempotent. Calling pause on an already-paused schedule is a no-op.
- This operational override controls existing schedules. Author declarative schedules in code. Declarative schedules are created, deleted, and edited in code via the `schedule` field on `createWorkflow`. To create schedules imperatively at runtime instead, use the unified [`mastra.schedules`](https://mastra.ai/docs/harness/schedules) service with a `workflowId`.

The underlying HTTP routes are `POST /api/schedules/:scheduleId/pause` and `POST /api/schedules/:scheduleId/resume`. Both require the `schedules:write` permission.

### Redeploying with changes

When you change the `schedule` config and redeploy, Mastra diffs the existing schedule row against the new config:

- If `cron` or `timezone` changed, `nextFireAt` is recomputed. A cadence with no future occurrence completes the schedule. A recomputed cadence that can still fire reactivates a completed schedule.
- If only `inputData`, `initialState`, or `metadata` changed, the row is patched in place and the next fire time is preserved.
- User-set status (for example, paused via `client.pauseSchedule`) and fire history are never overwritten, unless the cadence change above requires a status update.

Removing a schedule entry from a workflow's `schedule` array deletes its row on the next boot.

### Deployment topology

The built-in scheduler uses a `setInterval` tick loop to poll the schedules table and claim due rows. It dispatches workflow runs through the in-process pubsub. It assumes a long-lived host process.

#### Long-lived host (recommended)

Deploy targets such as Fly Machines, Railway, Render, AWS ECS, GKE, or your own server keep the Mastra process alive between cron ticks. The server generated by `mastra build` starts the scheduler automatically, so schedules work without extra setup.

If you run Mastra with a [server adapter](https://mastra.ai/docs/server/server-adapters), call `mastra.startWorkers()` after your server starts listening. Adapters don't start the scheduler, and schedules never fire without this call. See [Start background workers](https://mastra.ai/docs/server/server-adapters).

For production deployments, you can run the scheduler as a [dedicated worker process](https://mastra.ai/docs/deployment/workers) to isolate it from the API layer.

#### Serverless platforms

Functions-as-a-service platforms such as Vercel, Netlify, AWS Lambda, and Cloudflare Workers shut the process down after each request, so the tick loop doesn't get a second tick and schedules declared in code don't fire with the built-in scheduler today. Direct runs still work: calling `run.start()` from an HTTP route runs a workflow that declares `schedule` in-process, like any other workflow.

For cron fires on these platforms, use [`@mastra/inngest`](#inngest-workflows) instead. Inngest is serverless-native and holds the cron state for you.

### Inngest workflows

The `schedule` field documented on this page drives Mastra's built-in scheduler. If you use `@mastra/inngest`, scheduled workflows are configured through Inngest's own `cron` field on `createFunction` and fire on Inngest's scheduler instead.

Practical implications:

- Inngest schedules don't appear in Studio's `/workflows/schedules` view.
- The workflow header **Schedules** action doesn't show for Inngest workflows.
- `client.pauseSchedule` and `client.resumeSchedule` don't control Inngest schedules.

Manage Inngest schedules from the [Inngest dashboard](https://www.inngest.com/docs/guides/scheduled-functions). Use Mastra schedules when you want Mastra to own scheduling end to end.

### Related

- [Workflow overview](https://mastra.ai/docs/workflows/overview)
- [Suspend and resume](https://mastra.ai/docs/workflows/suspend-and-resume)
- [Workers](https://mastra.ai/docs/deployment/workers): The [scheduler worker](https://mastra.ai/docs/deployment/workers) runs cron schedules in a dedicated process
- [Agent schedules](https://mastra.ai/docs/harness/schedules): Run an agent rather than a workflow on a cron schedule, and manage both schedule types at runtime through `mastra.schedules`.
