---
title: "Mastra Playbook: Evals, Scorers & Observability"
slug: mastra/playbook/evals-and-observability
section: Mastra
order: 100
related:
  - mastra/overview
  - mastra/playbook-index
  - mastra/workflows-and-steps
  - mastra/agents-and-models
---

<!-- manual -->

Scraped canonical Mastra documentation for **Mastra Playbook: Evals, Scorers & Observability** (17 upstream pages consolidated for NEO Pulse coding agents).

## Included Pages

- **Traces** (`docs/observability/overview` - source: `https://mastra.ai/docs/observability/overview.md`)
- **Usage** (`docs/observability/tracing/overview` - source: `https://mastra.ai/docs/observability/tracing/overview.md`)
- **Logging** (`docs/observability/logging` - source: `https://mastra.ai/docs/observability/logging.md`)
- **Feedback** (`docs/observability/feedback` - source: `https://mastra.ai/docs/observability/feedback.md`)
- **Storage** (`docs/observability/integrations/exporters/mastra-storage` - source: `https://mastra.ai/docs/observability/integrations/exporters/mastra-storage.md`)
- **Metrics** (`docs/observability/metrics/overview` - source: `https://mastra.ai/docs/observability/metrics/overview.md`)
- **Evals** (`docs/evals/overview` - source: `https://mastra.ai/docs/evals/overview.md`)
- **Built-in Scorers** (`docs/evals/built-in-scorers` - source: `https://mastra.ai/docs/evals/built-in-scorers.md`)
- **Quick Checks** (`docs/evals/quick-checks` - source: `https://mastra.ai/docs/evals/quick-checks.md`)
- **Gates and Verdicts** (`docs/evals/gates-and-verdicts` - source: `https://mastra.ai/docs/evals/gates-and-verdicts.md`)
- **Multi-turn Evals** (`docs/evals/multi-turn` - source: `https://mastra.ai/docs/evals/multi-turn.md`)
- **Custom Scorers** (`docs/evals/custom-scorers` - source: `https://mastra.ai/docs/evals/custom-scorers.md`)
- **Running in CI** (`docs/evals/running-in-ci` - source: `https://mastra.ai/docs/evals/running-in-ci.md`)
- **Vitest Integration** (`docs/evals/vitest-integration` - source: `https://mastra.ai/docs/evals/vitest-integration.md`)
- **Evals with Memory** (`docs/evals/evals-with-memory` - source: `https://mastra.ai/docs/evals/evals-with-memory.md`)
- **Datasets** (`docs/evals/datasets` - source: `https://mastra.ai/docs/evals/datasets.md`)
- **Experiments** (`docs/evals/experiments` - source: `https://mastra.ai/docs/evals/experiments.md`)

---

## Source: Traces (`docs/observability/overview`)

Canonical URL: `https://mastra.ai/docs/observability/overview.md`

## Observability

Mastra's observability system gives you visibility into every agent run, workflow step, tool call, and model interaction. Agent behavior depends on model responses, prompts, tools, memory, and workflow state, so observability helps you inspect runtime decisions from day one.

Start with the trace-correlated pages:

- [**Usage**](https://mastra.ai/docs/observability/tracing/overview): Inspect the span hierarchy, inputs, outputs, token usage, timing, and trace context for an execution.
- [**Logging**](https://mastra.ai/docs/observability/logging): Forward structured log entries from your application and Mastra internals, correlated to traces automatically.
- [**Feedback**](https://mastra.ai/docs/observability/feedback): Store ratings, comments, corrections, and other review signals linked to traces and spans.
- [**Storage**](#storage): Choose backends for persisted traces, logs, metrics aggregation, and feedback queries.

Use [**Metrics**](https://mastra.ai/docs/observability/metrics/overview) to analyze aggregate usage, performance, and cost data derived from spans. No additional instrumentation is required. Use [**Configuration**](#configuration) to enable the signals and exporters your application needs.

### When to use observability

- Debug unexpected agent behavior by inspecting the full decision path, tool calls, and model responses.
- Monitor latency across agents, workflows, and tools to identify bottlenecks.
- Track token consumption and estimated cost over time to control spending.
- Diagnose workflow failures by tracing execution through each step.
- Compare agent performance before and after prompt or model changes.

### How the pieces fit together

When observability is configured, every agent run, workflow execution, tool call, and model interaction produces a [span](https://opentelemetry.io/docs/concepts/signals/traces/#spans). Mastra organizes related spans into traces that show the full request lifecycle as a hierarchical timeline.

When a span ends, Mastra extracts duration, token counts, and cost estimates without any extra code. These metrics power the aggregate dashboards in [Studio](https://mastra.ai/docs/studio/observability).

Every `logger.info()`, `logger.warn()`, or `logger.error()` call within a traced context is tagged with the current trace and span IDs. You can move from a log entry directly to the trace that produced it.

Feedback records human review signals such as ratings, comments, and corrections. Feedback can be linked to traces and spans, then queried with the same observability store used for metrics.

These records share correlation fields such as trace ID, span ID, entity type, and entity name. You can use them to move from a metric spike to its traces, logs, and related feedback.

### Quickstart

Install `@mastra/observability` and storage backends that support traces and metrics:

**npm**:

```bash
npm install @mastra/observability @mastra/libsql @mastra/duckdb
```

**pnpm**:

```bash
pnpm add @mastra/observability @mastra/libsql @mastra/duckdb
```

**Yarn**:

```bash
yarn add @mastra/observability @mastra/libsql @mastra/duckdb
```

**Bun**:

```bash
bun add @mastra/observability @mastra/libsql @mastra/duckdb
```

Then configure observability in your Mastra instance. The following example uses composite storage to route observability data to DuckDB (which supports metrics aggregation) while keeping everything else in LibSQL:

```ts
import { Mastra } from '@mastra/core/mastra'
import { LibSQLStore } from '@mastra/libsql'
import { DuckDBStore } from '@mastra/duckdb'
import { MastraCompositeStore } from '@mastra/core/storage'
import {
  Observability,
  MastraStorageExporter,
  MastraPlatformExporter,
  SensitiveDataFilter,
} from '@mastra/observability'

export const mastra = new Mastra({
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new LibSQLStore({
      id: 'mastra-storage',
      url: 'file:./mastra.db',
    }),
    domains: {
      observability: await new DuckDBStore().getStore('observability'),
    },
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new MastraStorageExporter(), // Persists observability events to Mastra Storage
          new MastraPlatformExporter(), // Sends observability events to Mastra platform (if MASTRA_PLATFORM_ACCESS_TOKEN is set)
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
        ],
      },
    },
  }),
})
```

It enables tracing, log forwarding, and metrics. Mastra also supports external tracing providers like Langfuse, Datadog, and any OpenTelemetry-compatible platform. See [Maintaining Studio access](#maintaining-studio-access) to keep Mastra Studio access while sending data to an external provider.

### Configuration

Observability is configured once on your Mastra instance and applies across traces, logs, and metrics.

#### Basic config

An observability config usually contains:

- `serviceName`: The service identifier attached to exported observability data.
- `exporters`: One or more destinations for traces, logs, and derived metrics.
- `spanOutputProcessors`: Transformations that run before spans are exported.

#### Maintaining Studio access

When you add external exporters, keep `MastraStorageExporter` for Studio observability and/or `MastraPlatformExporter` for hosted Mastra platform observability.

The following example shows only the observability config. Configure storage separately.

```ts
import { Observability, MastraStorageExporter, MastraPlatformExporter } from '@mastra/observability'
import { ArizeExporter } from '@mastra/arize'

export const observability = new Observability({
  configs: {
    production: {
      serviceName: 'my-service',
      exporters: [
        new ArizeExporter({
          endpoint: process.env.PHOENIX_COLLECTOR_ENDPOINT,
          apiKey: process.env.PHOENIX_API_KEY,
        }),
        new MastraStorageExporter(),
        new MastraPlatformExporter(),
      ],
    },
  },
})
```

#### Flushing in serverless environments

In serverless environments, flush observability exporters before the runtime pauses or exits:

```ts
await mastra.observability.flush()
```

Use external storage in serverless environments instead of local file storage. See [Storage](#storage) for storage selection and routing.

#### Multi-config setup

Use multiple configs when different environments or request types need different exporters or sampling behavior. Select the active config at runtime with `configSelector`.

```ts
import { Mastra } from '@mastra/core'
import { Observability, MastraStorageExporter } from '@mastra/observability'
import { LangfuseExporter } from '@mastra/langfuse'

const storageExporter = new MastraStorageExporter()
const langfuseExporter = new LangfuseExporter()

export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      development: {
        serviceName: 'my-service-dev',
        exporters: [storageExporter],
      },
      production: {
        serviceName: 'my-service-prod',
        exporters: [storageExporter, langfuseExporter],
      },
    },
    configSelector: () => process.env.NODE_ENV || 'development',
  }),
})
```

For trace sampling, see [Tracing](https://mastra.ai/docs/observability/tracing/overview).

### Storage

Storage determines which observability signals persist, which queries are available, and whether metrics aggregation works. Use a dedicated observability store instead of your primary application store.

#### Signal support

Storage support depends on the signal and workload. `MastraStorageExporter` can persist traces to ClickHouse, PostgreSQL, MSSQL, MongoDB, and LibSQL. Metrics require an analytics-capable store:

- DuckDB: Recommended for local testing and development.
- ClickHouse: Recommended for high-volume production observability.
- `PostgresStoreVNext`: Supports metrics when the observability domain is enabled. Always provide a time range to avoid full partition scans.
- Mastra platform: Use `MastraPlatformExporter` for hosted observability without managing the backend yourself.

For the complete provider list and supported tracing strategies, see [Mastra Storage exporter](https://mastra.ai/docs/observability/integrations/exporters/mastra-storage). Use composite storage to route the `observability` domain separately when your primary store doesn't support observability or when the workload needs independent scaling.

#### Local development

For local development, use:

- `LibSQLStore` for primary application storage
- `DuckDBStore` for the `observability` domain
- `MastraStorageExporter` for local Studio access

#### Production deployment

Observability traffic is usually more write-heavy than the rest of the application. In production:

- Use `MastraStorageExporter` with ClickHouse for the `observability` domain when you keep observability in your own storage.
- Use `MastraPlatformExporter` for hosted Mastra platform observability instead of managing the backend yourself.
- Use composite storage when observability needs a different backend or scaling policy from your primary application data.

For backend compatibility details and exporter batching behavior, see [Mastra Storage exporter](https://mastra.ai/docs/observability/integrations/exporters/mastra-storage).

### Mastra platform

For hosted traces, logs, and metrics across projects and deploys, see [Observability on Mastra platform](https://mastra.ai/docs/mastra-platform/observability).

### Next steps

- [Tracing](https://mastra.ai/docs/observability/tracing/overview)
- [Logging](https://mastra.ai/docs/observability/logging)
- [Metrics](https://mastra.ai/docs/observability/metrics/overview)
- [Feedback](https://mastra.ai/docs/observability/feedback)
- [Mastra Studio](https://mastra.ai/docs/studio/observability)
- [Automatic metrics reference](https://mastra.ai/reference/observability/metrics/automatic-metrics)
- [Mastra platform observability](https://mastra.ai/docs/mastra-platform/observability)

---

## Source: Usage (`docs/observability/tracing/overview`)

Canonical URL: `https://mastra.ai/docs/observability/tracing/overview.md`

## Usage

Tracing is the observability signal that records how a request moves through agents, workflows, tools, and model calls. Mastra represents each operation as a span and groups related spans into a trace so you can inspect the full execution path.

This page focuses on trace-specific concepts: span hierarchy, sampling, metadata, filtering, trace IDs, and third-party trace context.

**For AI agents:** Run `npx mastra api trace list '{"page":0,"perPage":20}'` to inspect recent traces directly instead of opening Studio or writing a temporary script. The command requires a running Mastra server with observability configured; start the local server with `npx mastra dev`, or pass the reachable server's base URL with `--url`. Run `npx mastra api trace list --schema` before constructing different filters. Install Mastra's skill with `npx skills add mastra-ai/skills --skill mastra` for complete API CLI discovery, targeting, schema, authentication, and error-handling guidance.

### When to use tracing

- Debug unexpected agent or workflow behavior by inspecting the full execution path.
- Follow model calls, tool calls, and workflow steps inside a single request.
- Attach trace-specific metadata and tags for filtering and investigation.
- Connect Mastra traces to a third-party tracing system.

### Get started

To get started with tracing, configure observability in your Mastra instance and run an agent or workflow. You can configure behavior through the following features:

- [Configuration](https://mastra.ai/docs/observability/overview): Base observability config and multiple configs, plus serverless flushing
- [Storage](https://mastra.ai/docs/observability/overview): Storage routing for traces, logs, and metrics

### Sampling strategies

Sampling allows you to control which traces are collected, helping you balance between observability needs and resource costs.

In production environments with high traffic, collecting every trace can be expensive and unnecessary.

Sampling strategies let you capture a representative subset of traces while ensuring you don't miss critical information about errors or important operations.

You can configure sampling at the observability config level:

```ts
export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      '10_percent': {
        serviceName: 'my-service',
        // Sample 10% of traces
        sampling: {
          type: 'ratio',
          probability: 0.1,
        },
        exporters: [new MastraStorageExporter()],
      },
    },
  }),
})
```

The `sampling` option allows you to control which traces are collected, helping you balance between observability needs and resource costs. Mastra supports four sampling strategies:

1. **Always Sample**: Collects 100% of traces. Best for development, debugging, or low-traffic scenarios where you need complete visibility.

   ```ts
   sampling: {
     type: 'always'
   }
   ```

2. **Never Sample**: Disables tracing entirely. Useful for specific environments where tracing adds no value or when you need to temporarily disable tracing without removing configuration.

   ```ts
   sampling: {
     type: 'never'
   }
   ```

3. **Ratio-Based Sampling**: Randomly samples a percentage of traces. Ideal for production environments where you want statistical insights without the cost of full tracing. The probability value ranges from 0 (no traces) to 1 (all traces).

   ```ts
   sampling: {
     type: 'ratio',
     probability: 0.1  // Sample 10% of traces
   }
   ```

4. **Custom Sampling**: Implements your own sampling logic based on request context, metadata, or business rules. Perfect for complex scenarios like sampling based on user tier, request type, or error conditions.

   ```ts
   sampling: {
     type: 'custom',
     sampler: (options) => {
       // Sample premium users at higher rate
       if (options?.metadata?.userTier === 'premium') {
         return Math.random() < 0.5; // 50% sampling
       }

       // Default 1% sampling for others
       return Math.random() < 0.01;
     }
   }
   ```

### Adding custom metadata

Add custom metadata to record application-specific context in your traces for debugging production issues.

Metadata can include business logic and performance metrics. It can also carry user context or any other information that explains what happened during execution.

You can add metadata to any span using the tracing context:

```ts
execute: async (inputData, context) => {
  const startTime = Date.now()
  const response = await fetch(inputData.endpoint)

  // Add custom metadata to the current span
  context?.tracingContext.currentSpan?.update({
    metadata: {
      apiStatusCode: response.status,
      endpoint: inputData.endpoint,
      responseTimeMs: Date.now() - startTime,
      userTier: inputData.userTier,
      region: process.env.AWS_REGION,
    },
  })

  return await response.json()
}
```

Metadata set here will be shown in all configured exporters.

#### Tagging traces with the deployment environment

Set the top-level `environment` field on Mastra to automatically attach the deployment environment to all observability signals without passing `tracingOptions.metadata.environment` on each call.

```ts
export const mastra = new Mastra({
  environment: 'production',
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'my-service',
        exporters: [new MastraStorageExporter()],
      },
    },
  }),
})
```

If `environment` isn't set, runs started through `mastra dev` resolve to `development` (even though the dev server itself runs with `NODE_ENV=production`); otherwise Mastra falls back to `process.env.NODE_ENV`. If none of these are set, the field is left undefined rather than guessed.

Per-call `tracingOptions.metadata.environment` always takes precedence, so individual calls can override the value when needed.

#### Automatic metadata from `RequestContext`

Instead of manually adding metadata to each span, you can configure Mastra to automatically extract values from RequestContext and attach them as metadata to all spans in a trace. This is useful for consistently tracking user identifiers and environment information, along with feature flags or other request-scoped data across your entire trace.

##### Configuration-level extraction

Define which RequestContext keys to extract in your tracing configuration. These keys will be automatically included as metadata for all spans created with this configuration:

```ts
export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'my-service',
        requestContextKeys: ['userId', 'environment', 'tenantId'],
        exporters: [new MastraStorageExporter()],
      },
    },
  }),
})
```

Now when you execute agents or workflows with a RequestContext, these values are automatically extracted:

```ts
const requestContext = new RequestContext()
requestContext.set('userId', 'user-123')
requestContext.set('environment', 'production')
requestContext.set('tenantId', 'tenant-456')

// All spans in this trace automatically get userId, environment, and tenantId metadata
const result = await agent.generate('Hello', {
  requestContext,
})
```

##### Per-request additions

You can add trace-specific keys using `tracingOptions.requestContextKeys`. These are merged with the configuration-level keys:

```ts
const requestContext = new RequestContext()
requestContext.set('userId', 'user-123')
requestContext.set('environment', 'production')
requestContext.set('experimentId', 'exp-789')

const result = await agent.generate('Hello', {
  requestContext,
  tracingOptions: {
    requestContextKeys: ['experimentId'], // Adds to configured keys
  },
})

// All spans now have: userId, environment, AND experimentId
```

##### Nested value extraction

Use dot notation to extract nested values from RequestContext:

```ts
export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      default: {
        requestContextKeys: ['user.id', 'session.data.experimentId'],
        exporters: [new MastraStorageExporter()],
      },
    },
  }),
})

const requestContext = new RequestContext()
requestContext.set('user', { id: 'user-456', name: 'John Doe' })
requestContext.set('session', { data: { experimentId: 'exp-999' } })

// Metadata will include: { user: { id: 'user-456' }, session: { data: { experimentId: 'exp-999' } } }
```

##### How it works

1. **TraceState Computation**: At the start of a trace (root span creation), Mastra computes which keys to extract by merging configuration-level and per-request keys
2. **Automatic Extraction**: Root spans (agent runs, workflow executions) automatically extract metadata from RequestContext
3. **Child Span Extraction**: Child spans can also extract metadata if you pass `requestContext` when creating them
4. **Metadata Precedence**: Explicit metadata passed to span options always takes precedence over extracted metadata

#### Adding tags to traces

Tags are string labels that help you categorize and filter traces. Unlike metadata (which contains structured key-value data), tags are plain strings designed for quick filtering and organization.

Use `tracingOptions.tags` to add tags when executing agents or workflows:

```ts
// With agents
const result = await agent.generate('Hello', {
  tracingOptions: {
    tags: ['production', 'experiment-v2', 'user-request'],
  },
})

// With workflows
const run = await mastra.getWorkflow('myWorkflow').createRun()
const result = await run.start({
  inputData: { data: 'process this' },
  tracingOptions: {
    tags: ['batch-processing', 'priority-high'],
  },
})
```

##### How tags work

- **Root span only**: Tags are applied only to the root span of a trace (the agent run or workflow run span)

- **Widely supported**: Tags are supported by most exporters for filtering and searching traces:

  - **Braintrust**: Native `tags` field
  - **Langfuse**: Native `tags` field on traces
  - **ArizeExporter**: `tag.tags` OpenInference attribute
  - **OtelExporter**: `mastra.tags` span attribute
  - **OtelBridge**: `mastra.tags` span attribute

- **Combinable with metadata**: You can use both `tags` and `metadata` in the same `tracingOptions`

```ts
const result = await agent.generate([{ role: 'user', content: 'Analyze this' }], {
  tracingOptions: {
    tags: ['production', 'analytics'],
    metadata: { userId: 'user-123', experimentId: 'exp-456' },
  },
})
```

##### Common tag patterns

- **Environment**: `"production"`, `"staging"`, `"development"`
- **Feature flags**: `"feature-x-enabled"`, `"beta-user"`
- **Request types**: `"user-request"`, `"batch-job"`, `"scheduled-task"`
- **Priority levels**: `"priority-high"`, `"priority-low"`
- **Experiments**: `"experiment-v1"`, `"control-group"`, `"treatment-a"`

#### Naming a trace

Every run of the same agent or workflow gets the same root span name by default, for example `workflow run: 'skill-analyze'`. When one workflow runs over many subjects, set `rootSpanName` in `tracingOptions` to label each run. The name replaces the root span name in Studio's trace list and in exporters that display span names.

```ts
const run = await mastra.getWorkflow('skillAnalyze').createRun()

await run.start({
  inputData: { skillId: 'typescript' },
  tracingOptions: {
    rootSpanName: 'skill-analyze: typescript',
  },
})
```

The name applies to the root span only. Child spans keep their default names. Entity filters keep working because the workflow or agent id is stored separately as `entityId` and `entityName`.

OpenTelemetry-based exporters and the Langfuse exporter build their span and trace names from the entity id, so they're not affected. To name a Langfuse trace, set `metadata.traceName` as described in the [Langfuse integration](https://mastra.ai/integrations/observability/langfuse).

#### Hiding sensitive input/output

When processing sensitive data, you may want to prevent input and output values from being logged to your observability platforms. Use `hideInput` and `hideOutput` in `tracingOptions` to exclude this data from all spans in a trace:

```ts
// Hide input data (e.g., user credentials, PII)
const result = await agent.generate([{ role: 'user', content: 'Process this sensitive data' }], {
  tracingOptions: {
    hideInput: true, // Input will be hidden from all spans
  },
})

// Hide output data (e.g., generated secrets, confidential results)
const result = await agent.generate([{ role: 'user', content: 'Generate API keys' }], {
  tracingOptions: {
    hideOutput: true, // Output will be hidden from all spans
  },
})

// Hide both input and output
const result = await agent.generate([{ role: 'user', content: 'Handle confidential request' }], {
  tracingOptions: {
    hideInput: true,
    hideOutput: true,
  },
})
```

##### How it works

- **Trace-wide effect**: When set on the root span and these options apply to all child spans in the trace (tool calls, plus model generations, etc.)
- **Export-time filtering**: The data remains available internally during execution but is excluded when spans are exported to observability platforms
- **Combinable with other options**: You can use `hideInput`/`hideOutput` alongside `tags`, `metadata`, and other `tracingOptions`

```ts
const result = await agent.generate([{ role: 'user', content: 'Sensitive operation' }], {
  tracingOptions: {
    hideInput: true,
    hideOutput: true,
    tags: ['sensitive-operation', 'pii-handling'],
    metadata: { operationType: 'credential-processing' },
  },
})
```

For more fine-grained control over sensitive data, consider using the [Sensitive Data Filter](https://mastra.ai/reference/observability/tracing/processors/sensitive-data-filter) processor, which can redact specific fields (like passwords, tokens, and keys) while preserving the rest of the input/output.

##### Child spans and metadata extraction

When creating child spans within tools or workflow steps, you can pass the `requestContext` parameter to enable metadata extraction:

```ts
execute: async (inputData, context) => {
  // Create child span WITH requestContext - gets metadata extraction
  const dbSpan = context?.tracingContext.currentSpan?.createChildSpan({
    type: 'generic',
    name: 'database-query',
    requestContext: context?.requestContext, // Pass to enable metadata extraction
  })

  const results = await db.query('SELECT * FROM users')
  dbSpan?.end({ output: results })

  // Or create child span WITHOUT requestContext - no metadata extraction
  const cacheSpan = context?.tracingContext.currentSpan?.createChildSpan({
    type: 'generic',
    name: 'cache-check',
    // No requestContext - won't extract metadata
  })

  return results
}
```

You get fine-grained control over which child spans include RequestContext metadata. Root spans (agent/workflow executions) always extract metadata automatically, while child spans only extract when you explicitly pass `requestContext`.

### Creating child spans

Child spans allow you to track fine-grained operations within your workflow steps or tools. They provide visibility into sub-operations like database queries and API calls, as well as file operations or complex calculations. This hierarchical structure helps you identify performance bottlenecks and understand the exact sequence of operations.

Create child spans inside a tool call or workflow step to track specific operations:

```ts
execute: async (inputData, context) => {
  // Create another child span for the main database operation
  const querySpan = context?.tracingContext.currentSpan?.createChildSpan({
    type: 'generic',
    name: 'database-query',
    input: { query: inputData.query },
    metadata: { database: 'production' },
  })

  try {
    const results = await db.query(inputData.query)
    querySpan?.end({
      output: results.data,
      metadata: {
        rowsReturned: results.length,
        queryTimeMs: results.executionTime,
        cacheHit: results.fromCache,
      },
    })
    return results
  } catch (error) {
    querySpan?.error({
      error,
      metadata: { retryable: isRetryableError(error) },
    })
    throw error
  }
}
```

Child spans automatically inherit the trace context from their parent, maintaining the relationship hierarchy in your observability platform.

### Span formatting

Mastra provides two ways to transform span data before it reaches your observability platform: **span processors** and **custom span formatters**. Both allow you to modify, filter, or enrich trace data, but they operate at different levels and serve different purposes.

| Feature             | Span Processors                 | Custom Span Formatters                         |
| ------------------- | ------------------------------- | ---------------------------------------------- |
| Configuration level | Observability config            | Per-exporter                                   |
| Operates on         | Internal `Span` object          | Exported `ExportedSpan` data                   |
| Applies to          | All exporters                   | Single exporter                                |
| Async support       | No                              | Yes                                            |
| Use case            | Security, filtering, enrichment | Platform-specific formatting, async enrichment |

Use **span processors** for synchronous transformations that should apply to all exporters (like redacting sensitive data). Use **custom span formatters** when different exporters need different representations of the same data (like plain text for one platform and structured data for another), or when you need to perform asynchronous operations like fetching data from external APIs.

#### Span processors

Span processors transform, filter, or enrich trace data before it's exported. They act as a pipeline between span creation and export, enabling you to modify spans for security, compliance, or debugging purposes. Processors run once and affect all exporters.

##### Built-in processors

- [Sensitive Data Filter](https://mastra.ai/reference/observability/tracing/processors/sensitive-data-filter) redacts sensitive information. It's enabled in the default observability config.

##### Creating custom processors

You can create custom span processors by implementing the `SpanOutputProcessor` interface. Here's a basic example that converts all input text in spans to lowercase:

```ts
import type { SpanOutputProcessor, AnySpan } from '@mastra/core/observability'

export class LowercaseInputProcessor implements SpanOutputProcessor {
  name = 'lowercase-processor'

  process(span: AnySpan): AnySpan {
    span.input = `${span.input}`.toLowerCase()
    return span
  }

  async shutdown(): Promise<void> {
    // Cleanup if needed
  }
}

// Use the custom processor
export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      development: {
        spanOutputProcessors: [new LowercaseInputProcessor(), new SensitiveDataFilter()],
        exporters: [new MastraStorageExporter()],
      },
    },
  }),
})
```

`process()` must mutate the span it receives and return the same instance, or return `undefined` to drop the span. Don't return a copy (for example `{ ...span, input: '...' }`): `exportSpan()` and `isValid` are instance members of the live span, so a copy can't be exported. Mastra logs a processor error and drops the span in that case.

Processors are executed in the order they're defined, allowing you to chain multiple transformations. Common use cases include:

- Redacting sensitive data (passwords, tokens, API keys)
- Adding environment-specific metadata
- Filtering out spans based on criteria
- Normalizing data formats
- Enriching spans with business context

### Span filtering

Span filtering lets you reduce noise and per-span costs before data reaches your observability platform. Configure it per observability instance, so different exporters or environments can keep different levels of detail.

- Use `excludeSpanTypes` to drop entire categories of spans with minimal configuration.
- Use `spanFilter` when you need custom logic based on the exported span data.

The following example demonstrates how to combine both options in a single config:

```ts
import { Mastra } from '@mastra/core'
import { SpanType } from '@mastra/core/observability'
import { Observability, MastraStorageExporter } from '@mastra/observability'
import { LangfuseExporter } from '@mastra/langfuse'

export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'my-app',
        exporters: [new MastraStorageExporter(), new LangfuseExporter()],
        excludeSpanTypes: [SpanType.MODEL_CHUNK, SpanType.MODEL_STEP],
        spanFilter: span => {
          if (span.type === SpanType.TOOL_CALL && span.attributes?.success) {
            return false
          }

          return true
        },
      },
    },
  }),
})
```

Filtering happens at export time in this order:

1. Internal spans are dropped unless `includeInternalSpans` is `true`.
2. `excludeSpanTypes` removes matching span types.
3. `spanOutputProcessors` transform the remaining spans.
4. `spanFilter` decides whether to keep the final exported span.

If `spanFilter` throws, Mastra keeps the span and logs the error to avoid silent data loss. For the full span type list and more examples, see the [Span filtering reference](https://mastra.ai/reference/observability/tracing/span-filtering).

#### Custom span formatters

Custom span formatters transform how spans appear in specific observability platforms. Unlike span processors, formatters are configured per-exporter, allowing different formatting for different destinations. Formatters support both synchronous and asynchronous operations.

##### Use cases

- **Extract plain text from AI SDK messages**: Convert structured message arrays to readable text
- **Transform input/output formats**: Customize how data displays in specific platforms
- **Platform-specific field mapping**: Add or remove fields based on platform requirements
- **Async data enrichment**: Fetch additional context from external APIs or databases

##### Configuration

Add a `customSpanFormatter` to any exporter configuration:

```ts
import { BraintrustExporter } from '@mastra/braintrust'
import { LangfuseExporter } from '@mastra/langfuse'
import { SpanType } from '@mastra/core/observability'
import type { CustomSpanFormatter } from '@mastra/core/observability'

// Formatter that extracts plain text from AI messages
const plainTextFormatter: CustomSpanFormatter = span => {
  if (span.type === SpanType.AGENT_RUN && Array.isArray(span.input)) {
    const userMessage = span.input.find(m => m.role === 'user')
    return {
      ...span,
      input: userMessage?.content ?? span.input,
    }
  }
  return span
}

export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'my-service',
        exporters: [
          // Braintrust gets plain text formatting
          new BraintrustExporter({
            customSpanFormatter: plainTextFormatter,
          }),
          // Langfuse keeps the original structured format
          new LangfuseExporter(),
        ],
      },
    },
  }),
})
```

##### Chaining multiple formatters

Use `chainFormatters` to combine multiple formatters. Chains support both sync and async formatters:

```ts
import { chainFormatters } from '@mastra/observability'

const inputFormatter: CustomSpanFormatter = span => ({
  ...span,
  input: extractPlainText(span.input),
})

const outputFormatter: CustomSpanFormatter = span => ({
  ...span,
  output: extractPlainText(span.output),
})

const exporter = new BraintrustExporter({
  customSpanFormatter: chainFormatters([inputFormatter, outputFormatter]),
})
```

##### Async formatters

Custom span formatters support asynchronous operations, enabling use cases like fetching data from external APIs or databases to enrich your spans:

```ts
import type { CustomSpanFormatter } from '@mastra/core/observability'

// Async formatter that enriches spans with user data
const userEnrichmentFormatter: CustomSpanFormatter = async span => {
  const userId = span.metadata?.userId
  if (!userId) return span

  // Fetch user data from your API or database
  const userData = await fetchUserData(userId)

  return {
    ...span,
    metadata: {
      ...span.metadata,
      userName: userData.name,
      userEmail: userData.email,
      department: userData.department,
    },
  }
}

// Async formatter that looks up additional context
const contextEnrichmentFormatter: CustomSpanFormatter = async span => {
  if (span.type !== SpanType.AGENT_RUN) return span

  // Fetch experiment configuration
  const experimentConfig = await getExperimentConfig(span.metadata?.experimentId)

  return {
    ...span,
    metadata: {
      ...span.metadata,
      experimentVariant: experimentConfig?.variant,
      experimentGroup: experimentConfig?.group,
    },
  }
}

// Use async formatters with an exporter
const exporter = new BraintrustExporter({
  customSpanFormatter: userEnrichmentFormatter,
})

// Or chain sync and async formatters together
const exporter = new LangfuseExporter({
  customSpanFormatter: chainFormatters([
    plainTextFormatter, // sync
    userEnrichmentFormatter, // async
    contextEnrichmentFormatter, // async
  ]),
})
```

> **Note:** Async formatters add latency to span export. Keep async operations fast (under 100ms) to avoid slowing down your application. Consider using caching for frequently accessed data.

### Serialization options

Serialization options control how span data (input, output, and attributes) is truncated before export. This is useful when working with large payloads, deeply nested objects, or when you need to optimize trace storage.

#### Configuration

Add `serializationOptions` to your observability configuration:

```ts
export const mastra = new Mastra({
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'my-service',
        serializationOptions: {
          maxStringLength: 2048, // Maximum length for string values (default: 131072)
          maxDepth: 10, // Maximum depth for nested objects (default: 8)
          maxArrayLength: 100, // Maximum number of items in arrays (default: 50)
          maxObjectKeys: 75, // Maximum number of keys in objects (default: 50)
        },
        exporters: [new MastraStorageExporter()],
      },
    },
  }),
})
```

#### Available options

| Option            | Default         | Description                                                      |
| ----------------- | --------------- | ---------------------------------------------------------------- |
| `maxStringLength` | 131072 (128 KB) | Maximum length for string values. Longer strings are truncated.  |
| `maxDepth`        | 8               | Maximum depth for nested objects. Deeper levels are omitted.     |
| `maxArrayLength`  | 50              | Maximum number of items in arrays. Additional items are omitted. |
| `maxObjectKeys`   | 50              | Maximum number of keys in objects. Additional keys are omitted.  |

#### Use cases

**Increasing limits for debugging**: Increase these limits to capture more context for large documents and API responses, as well as other data structures:

```ts
serializationOptions: {
  maxStringLength: 262144, // Capture longer text content (256 KB)
  maxDepth: 12,            // Handle deeply nested JSON responses
  maxArrayLength: 200,     // Keep more items from large lists
}
```

**Reducing trace size for production**: Lower these values to reduce storage costs and improve performance when you don't need full payload visibility:

```ts
serializationOptions: {
  maxStringLength: 256,   // Truncate strings aggressively
  maxDepth: 3,            // Shallow object representation
  maxArrayLength: 10,     // Keep only first few items
  maxObjectKeys: 20,      // Limit object keys
}
```

All options are optional, if not specified, they fall back to the defaults shown above.

### Retrieving trace IDs

When you execute agents or workflows with tracing enabled, the response includes a `traceId` that you can use to look up the full trace in your observability platform. This is useful for debugging or customer support, or alternatively correlating traces with other events in your system.

#### Agent trace IDs

Both `generate` and `stream` methods return the trace ID in their response:

```ts
// Using generate
const result = await agent.generate('Hello')

console.log('Trace ID:', result.traceId)

// Using stream
const streamResult = await agent.stream('Tell me a story')

console.log('Trace ID:', streamResult.traceId)
```

#### Workflow trace IDs

Workflow executions also return trace IDs:

```ts
// Create a workflow run
const run = await mastra.getWorkflow('myWorkflow').createRun()

// Start the workflow
const result = await run.start({
  inputData: { data: 'process this' },
})

console.log('Trace ID:', result.traceId)

// Or stream the workflow
const { stream, getWorkflowState } = run.stream({
  inputData: { data: 'process this' },
})

// Get the final state which includes the trace ID
const finalState = await getWorkflowState()
console.log('Trace ID:', finalState.traceId)
```

#### Using trace IDs

Once you have a trace ID, you can:

1. **Look up traces in Studio**: Navigate to the traces view and search by ID
2. **Query traces in external platforms**: Use the ID in Langfuse, Braintrust, MLflow, or your observability platform
3. **Correlate with logs**: Include the trace ID in your application logs for cross-referencing
4. **Share for debugging**: Provide trace IDs to support teams or developers for investigation

The trace ID is only available when tracing is enabled. If tracing is disabled or sampling excludes the request, `traceId` will be `undefined`.

### Integrating with external tracing systems

If your application already uses distributed tracing, such as OpenTelemetry or Datadog, you can connect Mastra traces to the parent trace context. This lets you follow a request through your application and its Mastra agent or workflow calls.

#### Passing external trace IDs

Use the `tracingOptions` parameter to specify the trace context from your parent system:

```ts
// Get trace context from your existing tracing system
const parentTraceId = getCurrentTraceId() // Your tracing system
const parentSpanId = getCurrentSpanId() // Your tracing system

// Execute Mastra operations as part of the parent trace
const result = await agent.generate('Analyze this data', {
  tracingOptions: {
    traceId: parentTraceId,
    parentSpanId: parentSpanId,
  },
})

// The Mastra trace will now appear as a child in your distributed trace
```

#### OpenTelemetry integration

Integration with OpenTelemetry allows Mastra traces to appear directly in your existing observability platform:

```ts
import { trace } from '@opentelemetry/api'

// Get the current OpenTelemetry span
const currentSpan = trace.getActiveSpan()
const spanContext = currentSpan?.spanContext()

if (spanContext) {
  const result = await agent.generate(userMessage, {
    tracingOptions: {
      traceId: spanContext.traceId,
      parentSpanId: spanContext.spanId,
    },
  })
}
```

#### Workflow integration

Workflows support the same pattern for trace propagation:

```ts
const workflow = mastra.getWorkflow('data-pipeline')
const run = await workflow.createRun()

const result = await run.start({
  inputData: { data: '...' },
  tracingOptions: {
    traceId: externalTraceId,
    parentSpanId: externalSpanId,
  },
})
```

#### Nesting a run under an earlier Mastra run

A `parentSpanId` can point at two kinds of spans. The span can belong to your own tracing system, as in the examples above. Mastra then treats the run as the top of the trace it exports, and the run sets the trace's name, input, output, and tags.

The span can also be an earlier Mastra run in the same trace, such as an LLM judge that scores a finished turn. Set `nestUnderParent: true` for this case. The new run becomes a child of that span, and the trace keeps the name, input, output, tags, user, and session of the run that started it.

```ts
const turn = await assistant.generate('When does my order ship?')

await judge.generate(`Grade this answer: ${turn.text}`, {
  tracingOptions: {
    traceId: turn.traceId,
    parentSpanId: turn.spanId,
    nestUnderParent: true,
  },
})
```

The `nestUnderRun()` helper builds the same options from the earlier run's result:

```ts
import { nestUnderRun } from '@mastra/core/observability'

await judge.generate(`Grade this answer: ${turn.text}`, {
  tracingOptions: nestUnderRun(turn),
})
```

Both runs can be in different processes. Mastra ignores `nestUnderParent` when `traceId` or `parentSpanId` is missing or not valid. It also ignores the option when a tracing bridge starts the run in a different trace. The [Langfuse](https://mastra.ai/integrations/observability/langfuse) and [Braintrust](https://mastra.ai/integrations/observability/braintrust) exporters use this option. In other exporters, only the tags rule applies.

#### ID format requirements

Mastra validates trace and span IDs to ensure compatibility:

- **Trace IDs**: 1-32 hexadecimal characters (OpenTelemetry uses 32)
- **Span IDs**: 1-16 hexadecimal characters (OpenTelemetry uses 16)

Invalid IDs are handled gracefully, Mastra logs an error and continues:

- Invalid trace ID → generates a new trace ID
- Invalid parent span ID → ignores the parent relationship

As a result, tracing never crashes your application, even with malformed input.

#### Example: Express middleware

Here's a complete example showing trace propagation in an Express application:

```ts
import { trace } from '@opentelemetry/api'
import express from 'express'

const app = express()

app.post('/api/analyze', async (req, res) => {
  // Get current OpenTelemetry context
  const currentSpan = trace.getActiveSpan()
  const spanContext = currentSpan?.spanContext()

  const result = await agent.generate(req.body.message, {
    tracingOptions: spanContext
      ? {
          traceId: spanContext.traceId,
          parentSpanId: spanContext.spanId,
        }
      : undefined,
  })

  res.json(result)
})
```

This creates a single distributed trace that includes both the HTTP request handling and the Mastra agent execution, viewable in your observability platform of choice.

#### MCP calls

Model Context Protocol (MCP) calls link the caller's trace and the server's trace without any setup. When an agent or workflow calls a tool through `MCPClient`, the `MCPServer` that handles it keeps its own trace and records a link to the tool call span, and the tool call span links back to the server's span. Each side keeps its own trace, root span, and trace summary. When the server uses a tracing bridge and its HTTP instrumentation continues the caller's trace, the request joins that trace instead. Mastra storage saves the links with the spans, and exporters with span link support send them too.

This also works with non-Mastra software on either side. See the [`MCPServer` reference](https://mastra.ai/reference/tools/mcp-server) for details, and the [`MCPClient` reference](https://mastra.ai/reference/tools/mcp-client) to send your own trace context.

### What gets traced

Mastra automatically creates spans for:

#### Agent operations

- **Agent runs**: Complete execution with instructions and tools
- **LLM calls**: Model interactions with tokens and parameters
- **Tool executions**: Function calls with inputs and outputs
- **Memory operations**: Thread and semantic recall

#### Workflow operations

- **Workflow runs**: Full execution from start to finish
- **Individual steps**: Step processing with inputs/outputs
- **Control flow**: Conditionals, loops, parallel execution
- **Wait operations**: Delays and event waiting

### See also

#### Reference documentation

- [Configuration API](https://mastra.ai/reference/observability/tracing/configuration): ObservabilityConfig details
- [Tracing Classes](https://mastra.ai/reference/observability/tracing/instances): Core classes and methods
- [Span Interfaces](https://mastra.ai/reference/observability/tracing/spans): Span types and lifecycle
- [Type Definitions](https://mastra.ai/reference/observability/tracing/interfaces): Complete interface reference
- [Span filtering](https://mastra.ai/reference/observability/tracing/span-filtering): Filtering behavior and span types, plus examples

---

## Source: Logging (`docs/observability/logging`)

Canonical URL: `https://mastra.ai/docs/observability/logging.md`

## Logging

Mastra's logging system captures function execution, input data, and output responses in a structured format.

When deploying to the Mastra platform, logs are shown in the dashboard. In self-hosted or custom environments, logs can be directed to files or external services depending on the configured transports.

**For AI agents:** Run `npx mastra api log list '{"level":"error","page":0,"perPage":50}'` to inspect recent error logs directly instead of opening Studio or writing a temporary script. The command requires a running Mastra server with observability logging configured; start the local server with `npx mastra dev`, or pass the reachable server's base URL with `--url`. Run `npx mastra api log list --schema` before constructing different filters. Install Mastra's skill with `npx skills add mastra-ai/skills --skill mastra` for complete API CLI discovery, targeting, schema, authentication, and error-handling guidance.

### Configuring logs with `PinoLogger`

When [initializing a new Mastra project](https://mastra.ai/docs) using the CLI, `PinoLogger` is included by default.

```typescript
import { Mastra } from '@mastra/core/mastra'
import { PinoLogger } from '@mastra/loggers'

export const mastra = new Mastra({
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
})
```

Visit [PinoLogger](https://mastra.ai/reference/logging/pino-logger) for all available configuration options.

### Logging to observability storage

When [observability](https://mastra.ai/docs/observability/overview) is configured, by default all logger calls are automatically forwarded to your observability storage. Every `debug`, `info`, `warn`, `error`, and `trackException` call from your application and from Mastra's internal components is stored alongside your traces.

No code changes are required. Loggers with adapter support (`PinoLogger` and `ConsoleLogger`) write each record to their own destinations and derive the exported log from that same record. Custom loggers without adapter support are wrapped so they write to both the original logger and the observability system simultaneously.

#### Trace-correlated log output

When a log call happens inside a traced operation (an agent run, workflow step, or tool call), Mastra injects `trace_id` and `span_id` into the logger's native output. The fields use W3C trace context format and match the trace shown in Studio, so you can correlate a stdout log line with its trace directly.

To get machine-parseable JSON on stdout, configure `PinoLogger` with `prettyPrint: false`, pretty printing is enabled by default and produces human-readable text instead of JSON:

```typescript
export const mastra = new Mastra({
  logger: new PinoLogger({ name: 'Mastra', level: 'info', prettyPrint: false }),
})
```

The record then looks like this:

```json
{
  "level": 30,
  "time": 1755522000000,
  "name": "Mastra",
  "trace_id": "0af7651916cd43dd8448eb211c80319c",
  "span_id": "b7ad6b7169203331",
  "msg": "tool executed"
}
```

Outside a traced operation, the fields are omitted. `ConsoleLogger` appends the same fields as an object argument to its console output instead. With `PinoLogger`, the fields reach every destination: stdout, files, and custom transports. If you supply your own pino `mixin`, its fields are preserved, but `trace_id` and `span_id` win on conflicts.

Correlation and export can be controlled independently with the `loggerOptions` configuration:

```typescript
import { Mastra } from '@mastra/core/mastra'
import { PinoLogger } from '@mastra/loggers'

export const mastra = new Mastra({
  logger: new PinoLogger({ name: 'Mastra', level: 'info' }),
  loggerOptions: {
    correlation: true, // inject trace_id/span_id into native log output (default: true)
    export: false, // keep trace-correlated output without storing logs in observability (default: true)
  },
})
```

#### Custom loggers

Custom `IMastraLogger` implementations keep working: Mastra uses a deprecated dual-write fallback that forwards log calls to observability without adding `trace_id` or `span_id` to the logger's native output. To get trace-correlated output, implement the `__attachObservability()` adapter hook from `@mastra/core/logger`:

```typescript
import { MastraLogger, buildLogRecordData } from '@mastra/core/logger'
import type { LoggerAdapterContext } from '@mastra/core/logger'

class MyLogger extends MastraLogger {
  #adapterContext?: LoggerAdapterContext

  __attachObservability(ctx: LoggerAdapterContext): void {
    this.#adapterContext = ctx
  }

  #log(level: 'debug' | 'info' | 'warn' | 'error', message: string, args: unknown[]): void {
    const ctx = this.#adapterContext
    // Inject trace fields into your native record when correlation is enabled
    const traceFields = ctx?.options.correlation ? ctx.resolveTraceFields() : undefined
    console[level === 'debug' ? 'info' : level](
      message,
      ...args,
      ...(traceFields ? [traceFields] : []),
    )
    // Export the same record to observability when export is enabled
    if (ctx?.options.export) {
      ctx.getLogSink()?.[level](message, buildLogRecordData(args))
    }
  }

  debug(message: string, ...args: unknown[]): void {
    this.#log('debug', message, args)
  }

  info(message: string, ...args: unknown[]): void {
    this.#log('info', message, args)
  }

  warn(message: string, ...args: unknown[]): void {
    this.#log('warn', message, args)
  }

  error(message: string, ...args: unknown[]): void {
    this.#log('error', message, args)
  }
}
```

#### Configuring observability log level

You can control which log levels reach observability storage independently from your console logger. Add a `logging` option to your observability instance configuration:

```typescript
import { Mastra } from '@mastra/core/mastra'
import { PinoLogger } from '@mastra/loggers'
import { Observability, MastraStorageExporter } from '@mastra/observability'

export const mastra = new Mastra({
  logger: new PinoLogger({ name: 'Mastra', level: 'debug' }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'my-app',
        exporters: [new MastraStorageExporter()],
        logging: {
          enabled: true, // set to false to disable log forwarding
          level: 'info', // minimum level: 'debug' | 'info' | 'warn' | 'error' | 'fatal'
        },
      },
    },
  }),
})
```

In this example, the console logger outputs all levels starting from `debug`, but only `info` and above are written to observability storage. This keeps your storage clean while still having verbose console output during development.

| Option    | Type       | Default   | Description                                                            |
| --------- | ---------- | --------- | ---------------------------------------------------------------------- |
| `enabled` | `boolean`  | `true`    | Set to `false` to disable all log forwarding to observability storage. |
| `level`   | `LogLevel` | `'debug'` | Minimum severity level. Logs below this level are discarded.           |

#### Querying logs

Logs written to observability storage are queryable through the Mastra client SDK:

```typescript
import { MastraClient } from '@mastra/client-js'

const client = new MastraClient()

const logs = await client.listLogsVNext({
  filters: { level: 'error' },
  pagination: { page: 1, perPage: 50 },
  orderBy: { field: 'timestamp', direction: 'desc' },
})
```

When using a persistent storage backend like DuckDB or ClickHouse, logs survive restarts and are available for historical analysis.

### Customizing logs

Mastra provides access to a logger instance via the `mastra.getLogger()` method, available inside both workflow steps and tools. The logger supports standard severity levels: `debug`, `info`, `warn`, and `error`.

#### Logging from workflow steps

Within a workflow step, access the logger via the `mastra` parameter inside the `execute` function. You can log messages relevant to the step's execution.

```typescript
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({
  execute: async ({ mastra }) => {
    const logger = mastra.getLogger();
    logger.info("workflow info log");

    return {
      output: ""
    };
  }
});

export const testWorkflow = createWorkflow({...})
  .then(step1)
  .commit();
```

#### Logging from tools

Similarly, tools have access to the logger instance via the `mastra` parameter. Use this to log tool-specific activity during execution.

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

export const testTool = createTool({
  execute: async (inputData, context) => {
    const logger = context?.mastra.getLogger()
    logger?.info('tool info log')

    return {
      output: '',
    }
  },
})
```

#### Logging with additional data

Logger methods accept an optional second argument for additional data. Pass a structured object to make logs filterable in observability storage.

```typescript
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({
  execute: async ({ mastra }) => {
    const testAgent = mastra.getAgent("testAgent");
    const logger = mastra.getLogger();

    logger.info("workflow info log", { agent: testAgent });

    return {
      output: ""
    };
  }
});

export const testWorkflow = createWorkflow({...})
  .then(step1)
  .commit();
```

---

## Source: Feedback (`docs/observability/feedback`)

Canonical URL: `https://mastra.ai/docs/observability/feedback.md`

## Feedback

Feedback records capture human-in-the-loop signals such as thumbs, ratings, comments, and corrections. Use feedback when you need to attach user, QA, Studio, or system review data to a trace or span and query that data alongside other observability signals.

Unlike metrics and scores, feedback is usually supplied by a person or review workflow. Numeric feedback values can be aggregated, grouped, charted over time, and queried for percentiles.

### When to use feedback

- Collect user satisfaction ratings for agent responses.
- Store QA comments or corrections next to the trace they review.
- Build dashboards for ratings by agent, environment, or experiment.

### Add feedback

Use `mastra.observability.addFeedback()` when you want to annotate a persisted trace or span from app code. The helper is optional on the observability entrypoint, so check that the active observability implementation supports it. See the [client SDK observability reference](https://mastra.ai/reference/client-js/observability) for all client methods.

```typescript
if (!mastra.observability.addFeedback) {
  throw new Error('Feedback is not supported by the active observability implementation')
}

await mastra.observability.addFeedback({
  traceId: 'trace-123',
  spanId: 'span-456',
  feedback: {
    feedbackSource: 'user',
    feedbackType: 'rating',
    value: 1,
    comment: 'The answer solved my issue.',
  },
})
```

When you pass only `traceId` and `spanId`, `addFeedback()` rehydrates the target from configured observability storage before emitting the feedback event. Configure [`MastraStorageExporter`](https://mastra.ai/docs/observability/integrations/exporters/mastra-storage) when feedback is added after the traced execution has finished. If the trace isn't available in storage, Mastra logs a warning and drops the feedback event.

During a live traced execution, you can pass its `correlationContext` to emit feedback without rehydrating the trace from storage. This path is useful when the active request collects feedback before its tracing context ends.

### Find the trace for a message

Feedback is usually collected against a message a user has already read, so you need the `traceId` for that message. Assistant messages carry it in `content.metadata`, both in the stream result and when the message is recalled later from memory:

```typescript
const agent = mastra.getAgent('weatherAgent')
const memory = await agent.getMemory()

const { messages } = await memory!.recall({ threadId, perPage: false })

const message = messages.find(m => m.id === messageId)
const traceId = message?.content.metadata?.traceId
```

The value is the same trace the run reports as `traceId` on its result, so feedback collected at generation time and feedback collected later against a stored message anchor to the same trace. Messages produced while tracing is disabled have no `traceId`.

#### Read the trace ID in `useChat`

[`chatRoute()`](https://mastra.ai/reference/ai-sdk/chat-route) and [`handleChatStream()`](https://mastra.ai/reference/ai-sdk/handle-chat-stream) pass the run's `traceId` to your `messageMetadata` callback. Return it on the `start` part so the client has it on the live message without a server lookup:

```typescript
chatRoute({
  path: '/chat/:agentId',
  messageMetadata: ({ part, traceId }) => (part.type === 'start' ? { traceId } : undefined),
})
```

```tsx
const { messages } = useChat<UIMessage<{ traceId?: string }>>()

const lastMessage = messages.at(-1)
const traceId = lastMessage?.role === 'assistant' ? lastMessage.metadata?.traceId : undefined
```

If you validate metadata with `messageMetadataSchema`, add `traceId: z.string().optional()` to it. Send the `traceId` with the user's vote to your own route, then call `addFeedback()` there. Check that the caller owns a message with that `traceId` before adding feedback, because the value comes from the client.

### Create feedback

Every `createFeedback()` requires `feedbackType` and `value`. Add `traceId` or `spanId` when the feedback should be anchored to a trace or a specific span. Use `feedbackSource` as optional string metadata, such as `user`, `qa`, `studio`, or `system`.

For storage-level writes, include `timestamp` because the method writes directly to the store.

```typescript
const observability = await mastra.getStorage()!.getStore('observability')

await observability!.createFeedback({
  feedback: {
    feedbackId: 'feedback-rating-1',
    timestamp: new Date(),
    traceId: 'trace-123',
    spanId: 'span-456',
    feedbackSource: 'user',
    feedbackType: 'rating',
    value: 1,
    comment: 'The answer solved my issue.',
    tags: ['production'],
  },
})

await observability!.createFeedback({
  feedback: {
    feedbackId: 'feedback-comment-1',
    timestamp: new Date(),
    feedbackSource: 'qa',
    feedbackType: 'comment',
    value: 'Needs a citation before shipping.',
    experimentId: 'support-agent-eval',
  },
})
```

### List feedback

Use `listFeedback()` to page through raw records or poll with delta mode.

```typescript
const result = await observability!.listFeedback({
  filters: {
    feedbackType: 'rating',
    feedbackSource: 'user',
    timestamp: { start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
  },
  pagination: { page: 0, perPage: 20 },
  orderBy: { field: 'timestamp', direction: 'DESC' },
})

console.log(result.feedback, result.pagination?.hasMore)
```

Filters include target fields such as `traceId` and `spanId`, feedback fields such as `feedbackType`, `feedbackSource`, and `feedbackUserId`, and shared context fields such as `entityName`, `environment`, `experimentId`, and `tags`. See [`FeedbackFilter`](https://mastra.ai/reference/observability/feedback) for every filter field. Over HTTP, the same fields are passed as query parameters, for example `GET /api/observability/feedback?traceId=trace-123&environment=production`. See [list query parameters](https://mastra.ai/reference/observability/feedback).

```typescript
await observability!.listFeedback({
  filters: {
    traceId: 'trace-123',
    feedbackType: ['rating', 'thumbs'],
    tags: ['production'],
  },
})
```

### Delete feedback

Use `deleteFeedback()` to delete feedback records by id. This is useful when a comment contains sensitive data. Each request accepts at most 1,000 `feedbackIds`, and deletion is idempotent. The optional `organizationId` field filters by organization, and the optional `resourceId` field filters by resource. You can supply either filter independently or use both together. In Studio, each comment on a trace or span **Feedback** tab has a delete action. Deleting a trace with `deleteTraces()` also deletes the feedback linked to it. See [Deleting traces](https://mastra.ai/reference/client-js/observability).

```typescript
await observability!.deleteFeedback({
  feedbackIds: ['feedback-1', 'feedback-2'],
})
```

Deleted records also disappear from feedback analytics. ClickHouse uses a lightweight delete to hide rows without guaranteeing immediate physical removal, so open-source deployments must configure an [observability retention period](https://mastra.ai/reference/storage/retention) to physically purge them. Each request is marked applied once its delete succeeds; if the delete fails, the request stays unapplied, doesn't block updates to the still-visible feedback, and you retry by calling the delete API again. On ClickHouse, the next review update also retries the delete and reports the feedback as not found if the retry succeeds, or saves the new status and returns the delete's error if it fails again. Open-source deployments have no background reconciler. Configure retention for every observability signal to expire deletion requests after the signal rows they protect. If any signal is unbounded, deletion requests also remain unbounded to prevent deleted data from being reintroduced. On ClickHouse, delete APIs leave the separate delta cursor table untouched. Its rows contain identifiers rather than feedback payloads and expire within two days.

### Query feedback analytics

OLAP feedback queries operate on numeric `value` fields. Use them for ratings, thumbs encoded as `1` and `-1`, numeric QA scores, or other numeric feedback types.

```typescript
const rating = await observability!.getFeedbackAggregate({
  feedbackType: 'rating',
  feedbackSource: 'user',
  aggregation: 'avg',
  comparePeriod: 'previous_day',
})

const byAgent = await observability!.getFeedbackBreakdown({
  feedbackType: 'rating',
  groupBy: ['entityName'],
  aggregation: 'avg',
  filters: { environment: 'production' },
})

const ratingsOverTime = await observability!.getFeedbackTimeSeries({
  feedbackType: 'rating',
  aggregation: 'avg',
  interval: '1h',
  groupBy: ['feedbackSource'],
})
```

See the [feedback reference](https://mastra.ai/reference/observability/feedback) for all fields, filters, return types, and percentile query parameters.

The local runtime exposes the list route at `/api/observability/feedback` and analytics under its related paths. See the [HTTP routes table](https://mastra.ai/reference/observability/feedback) and [list query parameters](https://mastra.ai/reference/observability/feedback). Mastra Platform provides a separate, unversioned hosted query API. See the [Feedback API](https://mastra.ai/docs/mastra-platform/api) for regional endpoints, authentication, and project scoping.

### Export feedback to Mastra Platform

[`MastraPlatformExporter`](https://mastra.ai/reference/observability/tracing/exporters/mastra-platform-exporter) forwards emitted feedback events to Mastra Platform automatically because the hosted query API doesn't provide a creation route.

If your application adds feedback after an agent or workflow response using only its `traceId`, configure `MastraStorageExporter` alongside `MastraPlatformExporter`. The storage exporter keeps the trace available for `addFeedback()` to rehydrate, while the Platform exporter forwards the resulting feedback event without adding the trace to the application's local storage.

See [Observability on Mastra Platform](https://mastra.ai/docs/mastra-platform/observability) for the combined exporter configuration.

### Export feedback to external platforms

Feedback flows through the observability event bus, so exporters that support feedback forward it automatically. The [PostHog exporter](https://mastra.ai/reference/observability/tracing/exporters/posthog) sends feedback as native `$ai_feedback` events that appear on the linked trace in PostHog.

### Related

- [Observability overview](https://mastra.ai/docs/observability/overview)
- [Traces usage](https://mastra.ai/docs/observability/tracing/overview)
- [Metrics overview](https://mastra.ai/docs/observability/metrics/overview)
- [Client SDK observability reference](https://mastra.ai/reference/client-js/observability)
- [Feedback reference](https://mastra.ai/reference/observability/feedback)

---

## Source: Storage (`docs/observability/integrations/exporters/mastra-storage`)

Canonical URL: `https://mastra.ai/docs/observability/integrations/exporters/mastra-storage.md`

## Storage exporter

The `MastraStorageExporter` persists traces to your configured storage backend, making them accessible through Studio. It requires no external services.

> **Note:** `MastraStorageExporter` was previously called `DefaultExporter`. The original `DefaultExporter` class is still exported from `@mastra/observability` for backward compatibility, but it's deprecated. New code should use `MastraStorageExporter`.

> **Production Observability:** Observability data can quickly overwhelm general-purpose databases in production. For high-traffic applications, route the observability storage domain to [ClickHouse](https://mastra.ai/integrations/databases/clickhouse) through [composite storage](https://mastra.ai/reference/storage/composite). See [Production Recommendations](#production-recommendations) for details.

### Configuration

#### Prerequisites

1. **Storage Backend**: Configure a storage provider (libSQL, PostgreSQL, etc.)
2. **Studio**: Install for viewing traces locally

#### Basic Setup

```typescript
import { Mastra } from '@mastra/core'
import { Observability, MastraStorageExporter } from '@mastra/observability'
import { LibSQLStore } from '@mastra/libsql'

export const mastra = new Mastra({
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: 'file:./mastra.db', // Required for trace persistence
  }),
  observability: new Observability({
    configs: {
      local: {
        serviceName: 'my-service',
        exporters: [new MastraStorageExporter()],
      },
    },
  }),
})
```

#### Recommended Configuration

Include MastraStorageExporter in your observability configuration:

```typescript
import { Mastra } from '@mastra/core'
import {
  Observability,
  MastraStorageExporter,
  MastraPlatformExporter,
  SensitiveDataFilter,
} from '@mastra/observability'
import { LibSQLStore } from '@mastra/libsql'

export const mastra = new Mastra({
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: 'file:./mastra.db',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new MastraStorageExporter(), // Persists observability events to Mastra Storage
          new MastraPlatformExporter(), // Sends observability events to Mastra platform (requires MASTRA_PLATFORM_ACCESS_TOKEN)
        ],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
})
```

### Studio

Access your traces through Studio:

1. Start Studio
2. Navigate to Observability
3. Filter and search your local traces
4. Inspect detailed span information

### Tracing strategies

MastraStorageExporter automatically selects the optimal tracing strategy based on your storage provider. You can also override this selection if needed.

#### Available Strategies

| Strategy               | Description                                                                           | Use Case                                   |
| ---------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------ |
| **realtime**           | Process each event immediately                                                        | Development, debugging, low traffic        |
| **batch-with-updates** | Buffer events and batch write with full lifecycle support                             | Low volume Production                      |
| **insert-only**        | Only process completed spans, ignore updates                                          | High volume Production                     |
| **event-sourced**      | Write one row when a span starts and another when it ends, then collapse them on read | High volume Production, in-progress traces |

#### Strategy Configuration

```typescript
new MastraStorageExporter({
  strategy: 'auto', // Default - let storage provider decide
  // or explicitly set:
  // strategy: 'realtime' | 'batch-with-updates' | 'insert-only' | 'event-sourced'

  // Batching configuration (applies to both batch-with-updates and insert-only)
  maxBatchSize: 1000, // Max spans per batch
  maxBatchWaitMs: 5000, // Max wait before flushing
  maxBufferSize: 10000, // Max spans to buffer
})
```

### Storage provider support

Different storage providers support different tracing strategies. Some providers support observability for production workloads, while others are intended primarily for local development.

If you set the strategy to `'auto'`, the `MastraStorageExporter` automatically selects the optimal strategy for the storage provider. If you set an explicit strategy that the storage provider doesn't support, the exporter logs a warning and falls back to the provider's preferred strategy.

#### Providers with Observability Support

| Storage Provider                                                              | Preferred Strategy | Supported Strategies            | Recommended Use                       |
| ----------------------------------------------------------------------------- | ------------------ | ------------------------------- | ------------------------------------- |
| **[ClickHouse](https://mastra.ai/integrations/databases/clickhouse)**         | insert-only        | insert-only                     | Production (high-volume)              |
| **[PostgresStore](https://mastra.ai/integrations/databases/postgresql)**      | batch-with-updates | batch-with-updates, insert-only | Production (low volume)               |
| **[PostgresStoreVNext](https://mastra.ai/integrations/databases/postgresql)** | event-sourced      | event-sourced                   | Production (high-volume)              |
| **[MSSQL](https://mastra.ai/integrations/databases/mssql)**                   | batch-with-updates | batch-with-updates, insert-only | Production (low volume)               |
| **[MongoDB](https://mastra.ai/integrations/databases/mongodb)**               | batch-with-updates | batch-with-updates, insert-only | Production (low volume)               |
| **[OracleDB](https://mastra.ai/integrations/databases/oracledb)**             | batch-with-updates | batch-with-updates, insert-only | Production (low volume)               |
| **[libSQL](https://mastra.ai/integrations/databases/libsql)**                 | batch-with-updates | batch-with-updates, insert-only | Default storage, good for development |

> **Note:** Under `insert-only`, only completed spans are persisted, and span start and update events are ignored. A trace therefore becomes visible in Studio only after its root span ends, and filtering traces by `status: 'running'` returns no results. `PostgresStoreVNext` uses `event-sourced` tracing instead, so in-progress traces remain visible while preserving append-only writes.

#### Providers without Observability Support

The following storage providers **don't support** the observability domain. If you're using one of these providers and need observability, use [composite storage](https://mastra.ai/reference/storage/composite) to route observability data to a supported provider:

- [Convex](https://mastra.ai/integrations/databases/convex)
- [DynamoDB](https://mastra.ai/integrations/databases/dynamodb)
- [Cloudflare D1](https://mastra.ai/integrations/databases/cloudflare-d1)
- [Cloudflare Durable Objects](https://mastra.ai/integrations/databases/cloudflare-kv)
- [Upstash](https://mastra.ai/integrations/databases/upstash)
- [LanceDB](https://mastra.ai/integrations/databases/lancedb)

#### Strategy Benefits

- **realtime**: Immediate visibility, best for debugging
- **batch-with-updates**: 10-100x throughput improvement, full span lifecycle
- **insert-only**: Additional 70% reduction in database operations, perfect for analytics
- **event-sourced**: Append-only like insert-only, but in-progress traces stay visible in Studio while a run executes

### Production recommendations

Observability data grows quickly in production environments. A single agent interaction can generate hundreds of spans, and high-traffic applications can produce thousands of traces per day. Most general-purpose databases aren't optimized for this write-heavy, append-only workload.

#### Recommended: ClickHouse for High-Volume Production

[ClickHouse](https://mastra.ai/integrations/databases/clickhouse) is a columnar database designed for high-volume analytics workloads. It's the recommended choice for production observability because:

- **Optimized for writes**: Handles millions of inserts per second
- **Efficient compression**: Reduces storage costs for trace data
- **Fast queries**: Columnar storage enables quick trace lookups and aggregations
- **Time-series native**: Built-in support for time-based data retention and partitioning

#### Using Composite Storage

If you're using a provider without observability support (like Convex or DynamoDB) or want to optimize performance, use [composite storage](https://mastra.ai/reference/storage/composite) to route observability data to ClickHouse while keeping other data in your primary database.

### Batching behavior

#### Flush Triggers

For both batch strategies (`batch-with-updates` and `insert-only`), traces are flushed to storage when any of these conditions are met:

1. **Size trigger**: Buffer reaches `maxBatchSize` spans
2. **Time trigger**: `maxBatchWaitMs` elapsed since first event
3. **Emergency flush**: Buffer approaches `maxBufferSize` limit
4. **Shutdown**: Force flush all pending events

#### Error handling

The MastraStorageExporter includes reliable error handling for production use:

- **Retry Logic**: Exponential backoff (500ms, 1s, 2s, 4s)
- **Transient Failures**: Automatic retry with backoff
- **Persistent Failures**: Drop batch after 4 failed attempts
- **Buffer Overflow**: Prevent memory issues during storage outages

### Dropped observability events

`DefaultExporter` emits structured drop events when it can't persist observability data. Register an exporter or bridge with `onDroppedEvent` to forward these drops to alerting or monitoring.

For two reasons events are dropped:

- `unsupported-storage`: The storage provider doesn't implement the signal type.
- `retry-exhausted`: The exporter retried a batch up to `maxRetries` times and then dropped it.

The following example demonstrates forwarding drop details to a monitoring endpoint:

```typescript
import { BaseExporter } from '@mastra/observability'
import type { ObservabilityDropEvent, TracingEvent } from '@mastra/core/observability'

class DropAlertExporter extends BaseExporter {
  name = 'drop-alerts'

  async onDroppedEvent(event: ObservabilityDropEvent) {
    await fetch('https://monitoring.example.com/observability-drops', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        count: event.count,
        signal: event.signal,
        reason: event.reason,
        exporterName: event.exporterName,
      }),
    })
  }

  protected async _exportTracingEvent(_event: TracingEvent) {}
}
```

### Configuration examples

```typescript
// Zero config - recommended for most users
new MastraStorageExporter()

// Development override
new MastraStorageExporter({
  strategy: 'realtime', // Immediate visibility for debugging
})

// High-throughput production
new MastraStorageExporter({
  maxBatchSize: 2000, // Larger batches
  maxBatchWaitMs: 10000, // Wait longer to fill batches
  maxBufferSize: 50000, // Handle longer outages
})

// Low-latency production
new MastraStorageExporter({
  maxBatchSize: 100, // Smaller batches
  maxBatchWaitMs: 1000, // Flush quickly
})
```

### Related

- [Traces usage](https://mastra.ai/docs/observability/tracing/overview)
- [MastraPlatformExporter](https://mastra.ai/docs/mastra-platform/observability)
- [Composite Storage](https://mastra.ai/reference/storage/composite): Combine multiple storage providers
- [Storage Configuration](https://mastra.ai/docs/storage)

---

## Source: Metrics (`docs/observability/metrics/overview`)

Canonical URL: `https://mastra.ai/docs/observability/metrics/overview.md`

## Metrics

Mastra automatically derives metrics from spans as traced operations complete. No separate metric instrumentation is required.

Mastra emits:

- **Duration metrics** for agent runs, workflows, tools, model calls, and processors
- **Token usage metrics** for model input and output, including detailed token categories when the provider reports them
- **Cost estimates** calculated from token usage, provider, model, and model prices from [models.dev](https://models.dev) or from a [custom gateway](https://mastra.ai/models/gateways/custom-gateways)

Metrics retain trace correlation context, so you can investigate a change in a chart by finding the related span. See the [Automatic metrics reference](https://mastra.ai/reference/observability/metrics/automatic-metrics) for metric names, labels, and cost fields.

### When to use metrics

- Monitor latency across agents, tools, workflows, and model calls
- Track token consumption and estimated cost over time
- Compare success and error rates across agents or tools
- Measure the effect of prompt, model, or code changes

### Storage support

Metrics require an analytics-capable observability store:

- **DuckDB** through `@mastra/duckdb` is recommended for local development.
- **ClickHouse** through `@mastra/clickhouse` is recommended for high-volume production workloads.
- **PostgresStoreVNext** supports metrics when its observability domain is enabled.
- **In-memory storage** supports metrics, but its data is lost when the process restarts.
- **Google Cloud Spanner** disables metrics by default. Set `disableMetrics: false` only for light workloads, or route metrics to a dedicated OLAP store.

Other storage adapters, including LibSQL, MSSQL, and MongoDB, can store other observability signals but don't implement metric storage and queries.

### Set up local metrics

Install the observability, application storage, and DuckDB packages:

**npm**:

```bash
npm install @mastra/observability @mastra/libsql @mastra/duckdb
```

**pnpm**:

```bash
pnpm add @mastra/observability @mastra/libsql @mastra/duckdb
```

**Yarn**:

```bash
yarn add @mastra/observability @mastra/libsql @mastra/duckdb
```

**Bun**:

```bash
bun add @mastra/observability @mastra/libsql @mastra/duckdb
```

Configure a composite store that routes the observability domain to DuckDB:

```ts
import { Mastra } from '@mastra/core/mastra'
import { LibSQLStore } from '@mastra/libsql'
import { DuckDBStore } from '@mastra/duckdb'
import { MastraCompositeStore } from '@mastra/core/storage'
import { Observability, MastraStorageExporter, SensitiveDataFilter } from '@mastra/observability'

export const mastra = new Mastra({
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new LibSQLStore({
      id: 'mastra-storage',
      url: 'file:./mastra.db',
    }),
    domains: {
      observability: await new DuckDBStore().getStore('observability'),
    },
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [new MastraStorageExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
})
```

`MastraStorageExporter` persists metrics to the configured observability store and makes them available to Studio. Use `MastraPlatformExporter` instead, or alongside it, to send metrics to Mastra Platform.

### View and query metrics

Use the [Studio observability dashboard](https://mastra.ai/docs/studio/observability) to inspect KPI cards, breakdowns, and time-series charts. For custom dashboards and analysis, use the observability store, `@mastra/client-js`, HTTP endpoints, or CLI described in the [Metric queries reference](https://mastra.ai/reference/observability/metrics/queries).

In production, always include a timestamp range in metric queries. Time bounds limit the data scanned and allow partitioned backends to skip unrelated partitions or chunks.

### Related

- [Observability overview](https://mastra.ai/docs/observability/overview)
- [Traces usage](https://mastra.ai/docs/observability/tracing/overview)
- [MastraStorageExporter](https://mastra.ai/docs/observability/integrations/exporters/mastra-storage)

---

## Source: Evals (`docs/evals/overview`)

Canonical URL: `https://mastra.ai/docs/evals/overview.md`

## Evals

While traditional software tests have clear pass/fail conditions, AI outputs are non-deterministic, they can vary with the same input. **Scorers** help bridge this gap by providing quantifiable metrics for measuring agent quality.

Scorers are automated tests that evaluate Agents outputs using model-graded, rule-based, and statistical methods. Scorers return **scores**: numerical values (typically between 0 and 1) that quantify how well an output meets your evaluation criteria. These scores enable you to objectively track performance and compare different approaches while identifying areas for improvement in your AI systems. Scorers can be customized with your own prompts and scoring functions.

Scorers can run in the cloud to capture real-time results. Scorers can also be part of your CI/CD pipeline for testing and monitoring agents over time.

> **📹 Watch:** Watch [Mastra evals overview](https://www.youtube.com/watch?v=12WN6u2DrBk) for an introduction to evals and how to reason about agent quality.

### Types of scorers

Mastra provides different kinds of scorers, each serving a specific purpose. Here are some common types:

1. **Textual Scorers**: Evaluate accuracy, reliability, and context understanding of agent responses
2. **Classification Scorers**: Measure accuracy in categorizing data based on predefined categories
3. **Prompt Engineering Scorers**: Explore impact of different instructions and input formats

### Installation

To access Mastra's scorers feature install the `@mastra/evals` package.

**npm**:

```bash
npm install @mastra/evals@latest
```

**pnpm**:

```bash
pnpm add @mastra/evals@latest
```

**Yarn**:

```bash
yarn add @mastra/evals@latest
```

**Bun**:

```bash
bun add @mastra/evals@latest
```

### Live evaluations

**Live evaluations** allow you to automatically score AI outputs in real-time as your agents and workflows operate. Instead of running evaluations manually or in batches, scorers run asynchronously alongside your AI systems, providing continuous quality monitoring.

#### Adding scorers to agents

You can add built-in scorers to your agents to automatically evaluate their outputs. See the [full list of built-in scorers](https://mastra.ai/docs/evals/built-in-scorers) for all available options.

```typescript
import { Agent } from '@mastra/core/agent'
import { createAnswerRelevancyScorer, createToxicityScorer } from '@mastra/evals/scorers/prebuilt'

export const evaluatedAgent = new Agent({
  id: 'evaluated-agent',
  scorers: {
    relevancy: {
      scorer: createAnswerRelevancyScorer({ model: 'openai/gpt-5-mini' }),
      sampling: { type: 'ratio', rate: 0.5 },
    },
    safety: {
      scorer: createToxicityScorer({ model: 'openai/gpt-5-mini' }),
      sampling: { type: 'ratio', rate: 1 },
    },
  },
})
```

#### Adding scorers to workflow steps

You can also add scorers to individual workflow steps to evaluate outputs at specific points in your process. Each scorer receives that step's own input and output, so you can measure quality at each step instead of only scoring the final answer:

```typescript
import { createWorkflow, createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { customStepScorer } from '../scorers/custom-step-scorer'

const contentStep = createStep({
  id: 'content-step',
  inputSchema: z.object({ topic: z.string() }),
  outputSchema: z.object({ content: z.string() }),
  scorers: {
    customStepScorer: {
      scorer: customStepScorer(),
      sampling: {
        type: 'ratio',
        rate: 1, // Score every step execution
      },
    },
  },
  execute: async ({ inputData }) => {
    return { content: await generateContent(inputData.topic) }
  },
})

export const contentWorkflow = createWorkflow({
  id: 'content-workflow',
  inputSchema: z.object({ topic: z.string() }),
  outputSchema: z.object({ content: z.string() }),
})
  .then(contentStep)
  .commit()
```

For the step-level `scorers` API, see the [Step class reference](https://mastra.ai/reference/workflows/step).

#### How live evaluations work

**Asynchronous execution**: Live evaluations run in the background without blocking your agent responses or workflow execution. Your AI systems remain responsive while live evaluations monitor them.

**Sampling control**: The `sampling.rate` parameter (0-1) controls what fraction of outputs get scored:

- `1.0`: Score every single response (100%)
- `0.5`: Score half of all responses (50%)
- `0.1`: Score 10% of responses
- `0.0`: Disable scoring

Sampling is deterministic per trace: the decision is derived from the trace ID, not drawn at random. In practice:

- Scorers configured at the same rate score the same traces, so their scores are comparable on shared traffic.
- Re-running the same trace produces the same sampling decision, so sampled coverage is reproducible.

When a run has no trace (observability not configured), the decision is derived from the run ID instead. If [trace sampling](https://mastra.ai/docs/observability/tracing/overview) declined the trace, scorers skip that run entirely, so scores aren't created for traces that were never stored.

**Eligibility filters**: The optional `filter` parameter uses a declarative predicate over the run context to restrict scorer eligibility. Because filtering occurs before sampling, `sampling.rate` applies only to matching runs:

```typescript
export const myAgent = new Agent({
  // ...
  scorers: {
    relevancy: {
      scorer: createAnswerRelevancyScorer({ model: 'openai/gpt-5-mini' }),
      filter: {
        op: 'eq',
        left: { path: 'requestContext.plan' },
        right: { literal: 'enterprise' },
      },
      sampling: { type: 'ratio', rate: 0.1 },
    },
  },
})
```

This scores 10% of enterprise-plan traffic and none of the rest. To score different segments at different rates, bind the same scorer twice with complementary filters.

Predicates can reference `requestContext.*`, `entity.*`, `entityType`, `source`, `threadId`, `resourceId`, and `projectId`. They support comparisons (`eq`, `ne`, `lt`, `lte`, `gt`, `gte`), membership (`in`, `notIn`), existence (`exists`, `notExists`), truthiness (`truthy`, `falsy`), and boolean composition (`and`, `or`, `not`). A filter that references an unknown root fails at agent construction rather than silently skipping scoring at runtime. Filters are plain JSON, so they're unaffected by durable agent state serialization.

Eligibility filters decide _whether a scorer runs_; to filter _which messages a scorer sees_ once it runs, use [`filterRun()`](https://mastra.ai/reference/evals/filter-run). Filters can't see the run's input or output. When eligibility depends on what happened in the run, such as whether a specific tool was called, return [`notScorable()`](https://mastra.ai/reference/evals/not-scorable) from a scorer step instead: the remaining steps are skipped and no score is stored.

**Automatic storage**: All scoring results are automatically stored in the `mastra_scorers` table in your configured database, allowing you to analyze performance trends over time.

### Score persistence

Scores are persisted when the Mastra instance has `storage` configured, and when the scorer is registered on that instance. Registration is what lets Mastra resolve the scorer's metadata (name, description, type) through [`getScorerById()`](https://mastra.ai/reference/core/getScorerById) before writing the score.

Scorers you attach to an agent or a workflow step register themselves. Scorers you pass directly to [`runEvals()`](https://mastra.ai/reference/evals/run-evals), including [Quick Checks](https://mastra.ai/docs/evals/quick-checks), need the `scorers` option on the [`Mastra` class](https://mastra.ai/reference/core/mastra-class):

```typescript
import { Mastra } from '@mastra/core'
import { LibSQLStore } from '@mastra/libsql'
import { checks } from '@mastra/evals/checks'
import { createAnswerRelevancyScorer } from '@mastra/evals/scorers/prebuilt'
import { myAgent } from './agents/my-agent'

export const mastra = new Mastra({
  agents: { myAgent },
  storage: new LibSQLStore({ url: 'file:./mastra.db' }),
  scorers: {
    calledTool: checks.calledTool('get_weather'),
    includes: checks.includes('Brooklyn'),
    relevancy: createAnswerRelevancyScorer({ model: 'openai/gpt-5-mini' }),
  },
})
```

The lookup compares only scorer IDs, which allows the registered instance to use different configuration from the evaluated instance. Every `checks.calledTool()` instance uses the ID `check-called-tool`. Registering one therefore covers every tool name you evaluate.

The arguments still shape the `description` stored alongside each score, which comes from the registered instance, not the one you evaluate with. `checks.calledTool('')` is accepted and persists scores fine, but stores `Checks that "" was called`, so pass a representative value.

Skipping registration doesn't change scoring results, but each save fails with a `Scorer with id <id> not found` warning and the scores never reach the store.

### Trace evaluations

In addition to live evaluations, you can use scorers to evaluate historical traces from your agent interactions and workflows.

This is particularly useful for analyzing past performance or debugging issues, or alternatively running batch evaluations.

> **Observability required:** To score traces, you must first configure observability in your Mastra instance to collect trace data. See [Tracing documentation](https://mastra.ai/docs/observability/tracing/overview) for setup instructions.

### Studio

To score traces, you first need to register your scorers with your Mastra instance:

```typescript
const mastra = new Mastra({
  scorers: {
    answerRelevancy: myAnswerRelevancyScorer,
    responseQuality: myResponseQualityScorer,
  },
})
```

Once registered, you can score traces interactively within Studio under the **Observability** section. Open Studio to manage scorers and review scores, plus run experiments.

- **Scorers list**: Browse all registered scorers with their description, and the number of agents and workflows each scorer is attached to.
- **Score results**: Select a scorer to see a paginated list of every score it has produced. Click a row to open the detail panel, which shows the score value, reason, input, output, and the prompts used by the judge. From this panel, save any result as a dataset item for future experiments.
- **Agent Evaluate tab**: Open the Evaluate tab on any agent to manage scorers and datasets. You can also run experiments there. Experiment results display per-item scores alongside pass/fail status and version tags.
- **Trace scoring**: In the Observability section, run a scorer against any historical trace or span to evaluate past interactions. Filter scores by agent or workflow.

### Next steps

- Use [Quick Checks](https://mastra.ai/docs/evals/quick-checks) for fast, deterministic assertions on text and tool usage
- Add [gates and verdicts](https://mastra.ai/docs/evals/gates-and-verdicts) to enforce hard requirements and quality thresholds
- Test [multi-turn conversations](https://mastra.ai/docs/evals/multi-turn) where behavior emerges across sequential turns
- Learn how to create your own scorers in the [Creating Custom Scorers](https://mastra.ai/docs/evals/custom-scorers) guide
- Explore built-in scorers in the [Built-in Scorers](https://mastra.ai/docs/evals/built-in-scorers) section
- Test scorers with [Studio](https://mastra.ai/docs/studio/overview)
- 📹 [Mastra evals workshop](https://www.youtube.com/watch?v=OHOZ5PgPj5M\&t=3578s)

---

## Source: Built-in Scorers (`docs/evals/built-in-scorers`)

Canonical URL: `https://mastra.ai/docs/evals/built-in-scorers.md`

## Built-in scorers

Mastra provides a complete set of built-in scorers for evaluating AI outputs. These scorers are optimized for common evaluation scenarios and are ready to use in your agents and workflows.

To create your own scorers, see the [Custom Scorers](https://mastra.ai/docs/evals/custom-scorers) guide.

### Available scorers

#### Accuracy and reliability

These scorers evaluate how correct, truthful, and complete your agent's answers are:

- [`answer-relevancy`](https://mastra.ai/reference/evals/answer-relevancy): Evaluates how well responses address the input query (`0-1`, higher is better)
- [`answer-similarity`](https://mastra.ai/reference/evals/answer-similarity): Compares agent outputs against ground-truth answers for CI/CD testing using semantic analysis (`0-1`, higher is better)
- [`faithfulness`](https://mastra.ai/reference/evals/faithfulness): Measures how accurately responses represent provided context (`0-1`, higher is better)
- [`hallucination`](https://mastra.ai/reference/evals/hallucination): Detects factual contradictions and unsupported claims (`0-1`, lower is better)
- [`completeness`](https://mastra.ai/reference/evals/completeness): Checks if responses include all necessary information (`0-1`, higher is better)
- [`content-similarity`](https://mastra.ai/reference/evals/content-similarity): Measures textual similarity using character-level matching (`0-1`, higher is better)
- [`textual-difference`](https://mastra.ai/reference/evals/textual-difference): Measures textual differences between strings (`0-1`, higher means more similar)
- [`tool-call-accuracy`](https://mastra.ai/reference/evals/tool-call-accuracy): Evaluates whether the LLM selects the correct tool from available options (`0-1`, higher is better)
- [`trajectory-accuracy`](https://mastra.ai/reference/evals/trajectory-accuracy): Evaluates the expected action sequence for all span types. Covered spans include tool and model activity plus workflow steps (`0-1`, higher is better)
- [`prompt-alignment`](https://mastra.ai/reference/evals/prompt-alignment): Measures how well agent responses align with user prompt intent, requirements, completeness, and format (`0-1`, higher is better)
- [`multi-turn-judge`](https://mastra.ai/reference/evals/multi-turn-judge): Grades every assistant turn of a [multi-turn conversation](https://mastra.ai/docs/evals/multi-turn) against a plain-English criterion (`0` or `scale`, default `1`)

#### Context quality

These scorers evaluate the quality and relevance of context used in generating responses:

- [`context-precision`](https://mastra.ai/reference/evals/context-precision): Uses Mean Average Precision to evaluate context ranking. Relevant context receives a higher score when it occurs early (`0-1`, higher is better)
- [`context-relevance`](https://mastra.ai/reference/evals/context-relevance): Measures context utility through relevance levels and usage tracking. It also detects missing context (`0-1`, higher is better)

> **Context Scorer Selection:**
>
> - Use **Context Precision** when context ordering matters and you need standard IR metrics (ideal for RAG ranking evaluation)
> - Use **Context Relevance** when you need detailed relevance assessment and want to track context usage and identify gaps
>
> Both context scorers support:
>
> - **Static context**: Pre-defined context arrays
> - **Dynamic context extraction**: Extract context from runs using custom functions (ideal for RAG systems, vector databases, etc.)

#### Output quality

These scorers evaluate adherence to format, style, and safety requirements:

- [`tone-consistency`](https://mastra.ai/reference/evals/tone-consistency): Measures consistency in formality, complexity, and style (`0-1`, higher is better)
- [`toxicity`](https://mastra.ai/reference/evals/toxicity): Detects harmful or inappropriate content (`0-1`, lower is better)
- [`bias`](https://mastra.ai/reference/evals/bias): Detects potential biases in the output (`0-1`, lower is better)
- [`keyword-coverage`](https://mastra.ai/reference/evals/keyword-coverage): Assesses technical terminology usage (`0-1`, higher is better)

#### Quick Checks

Zero-LLM micro-scorers for fast, deterministic assertions. See the [Quick Checks](https://mastra.ai/docs/evals/quick-checks) guide for usage details.

- [`checks.includes`](https://mastra.ai/reference/evals/checks): Scores 1 if output contains a substring (`0` or `1`)
- [`checks.excludes`](https://mastra.ai/reference/evals/checks): Scores 1 if output doesn't contain a substring (`0` or `1`)
- [`checks.equals`](https://mastra.ai/reference/evals/checks): Scores 1 if output matches a string, ignoring case by default (`0` or `1`)
- [`checks.matches`](https://mastra.ai/reference/evals/checks): Scores 1 if output matches a regex (`0` or `1`)
- [`checks.similarity`](https://mastra.ai/reference/evals/checks): String similarity via Dice coefficient (`0-1`, or binary with threshold)
- [`checks.calledTool`](https://mastra.ai/reference/evals/checks): Scores 1 if a tool was called at least N times (`0` or `1`)
- [`checks.didNotCall`](https://mastra.ai/reference/evals/checks): Scores 1 if a tool wasn't called (`0` or `1`)
- [`checks.toolOrder`](https://mastra.ai/reference/evals/checks): Scores 1 if tools were called in order (`0` or `1`)
- [`checks.maxToolCalls`](https://mastra.ai/reference/evals/checks): Scores 1 if tool call count is within limit (`0` or `1`)
- [`checks.usedNoTools`](https://mastra.ai/reference/evals/checks): Scores 1 if no tools were called (`0` or `1`)
- [`checks.noToolErrors`](https://mastra.ai/reference/evals/checks): Scores 1 if no tool calls had errors (`0` or `1`)

---

## Source: Quick Checks (`docs/evals/quick-checks`)

Canonical URL: `https://mastra.ai/docs/evals/quick-checks.md`

## Quick checks

Quick Checks are composable micro-scorers for common assertions like "output contains X" or "agent called tool Y." They run instantly without an LLM and plug into the same `scorers: [...]` array as any other scorer.

### When to use Quick Checks

Use Quick Checks when you need fast, deterministic assertions:

- Verify output text contains or excludes specific strings
- Confirm an agent called (or avoided) specific tools
- Validate tool call ordering and count limits
- Gate CI pipelines with zero-cost binary checks
- Combine with LLM-based scorers for layered evaluation

For subjective or semantic evaluation, use [LLM-based scorers](https://mastra.ai/docs/evals/built-in-scorers) instead.

### Quickstart

```typescript
import { checks } from '@mastra/evals/checks'
import { runEvals } from '@mastra/core/evals'
import { weatherAgent } from '../agents'

const result = await runEvals({
  data: [{ input: 'What is the weather in Brooklyn?' }],
  target: weatherAgent,
  scorers: [checks.includes('Brooklyn'), checks.calledTool('get_weather'), checks.noToolErrors()],
})

console.log(result.scores)
// { 'check-includes': 1, 'check-called-tool': 1, 'check-no-tool-errors': 1 }
```

### Available checks

Quick Checks fall into these categories:

#### Text checks

These scorers evaluate the agent's text output:

| Check                    | What it does                          | Score                            |
| ------------------------ | ------------------------------------- | -------------------------------- |
| `checks.includes(str)`   | Output contains substring             | 1 or 0                           |
| `checks.excludes(str)`   | Output doesn't contain substring      | 1 or 0                           |
| `checks.equals(str)`     | Output exactly equals string          | 1 or 0                           |
| `checks.matches(regex)`  | Output matches regular expression     | 1 or 0                           |
| `checks.similarity(str)` | Dice coefficient similarity to string | 0-1 (or binary with `threshold`) |

#### Tool call checks

These scorers evaluate tool usage from the agent's run:

| Check                     | What it does                     | Score  |
| ------------------------- | -------------------------------- | ------ |
| `checks.calledTool(name)` | Tool was called at least N times | 1 or 0 |
| `checks.didNotCall(name)` | Tool wasn't called               | 1 or 0 |
| `checks.toolOrder([...])` | Tools called in expected order   | 1 or 0 |
| `checks.maxToolCalls(n)`  | No more than N tool calls total  | 1 or 0 |
| `checks.usedNoTools()`    | No tools called at all           | 1 or 0 |
| `checks.noToolErrors()`   | No tool invocations had errors   | 1 or 0 |

### Combining checks with LLM scorers

Checks compose with LLM-based scorers in a single `runEvals` call. Use checks for deterministic gates and LLM scorers for qualitative evaluation:

```typescript
import { checks } from '@mastra/evals/checks'
import { createFaithfulnessScorer } from '@mastra/evals/scorers/prebuilt'
import { runEvals } from '@mastra/core/evals'
import { myAgent } from '../agents'

const result = await runEvals({
  data: [
    {
      input: 'What is the weather in Brooklyn?',
      context: ['Brooklyn weather data: sunny, 72°F'],
    },
  ],
  target: myAgent,
  scorers: [
    // Deterministic checks (instant, free)
    checks.includes('Brooklyn'),
    checks.calledTool('get_weather'),
    checks.excludes('error'),
    checks.noToolErrors(),

    // LLM-based scorer (semantic, costs tokens)
    createFaithfulnessScorer({ model: 'openai/gpt-5-mini' }),
  ],
})
```

### Using checks in live scoring

Attach checks to agents for continuous monitoring:

```typescript
import { Agent } from '@mastra/core/agent'
import { checks } from '@mastra/evals/checks'

export const weatherAgent = new Agent({
  id: 'weather-agent',
  name: 'Weather Agent',
  instructions: 'Answer weather questions using the get_weather tool.',
  model: 'openai/gpt-5.6-sol',
  tools: { get_weather: weatherTool },
  scorers: {
    noErrors: {
      scorer: checks.noToolErrors(),
      sampling: { type: 'ratio', rate: 1 },
    },
    mentionCity: {
      scorer: checks.includes('Brooklyn'),
      sampling: { type: 'ratio', rate: 0.5 },
    },
  },
})
```

### How checks work

Each check is a standard `createScorer()` instance with a `preprocess` step and a `generateScore` step. They follow the same [four-step pipeline](https://mastra.ai/docs/evals/custom-scorers) as any other scorer:

1. **preprocess**: Extracts and normalizes relevant data from the agent run (text content, tool calls)
2. **generateScore**: Converts the preprocessed result into a score (typically binary 1 or 0)

Because checks skip the `analyze` and `generateReason` steps and make no LLM calls, they run in microseconds. Visit the [Quick Checks reference](https://mastra.ai/reference/evals/checks) for the full API, including all parameters and options for each check.

### Related

- [Quick Checks reference](https://mastra.ai/reference/evals/checks)
- [Built-in Scorers](https://mastra.ai/docs/evals/built-in-scorers)
- [Custom Scorers](https://mastra.ai/docs/evals/custom-scorers)
- [`runEvals()` reference](https://mastra.ai/reference/evals/run-evals)

---

## Source: Gates and Verdicts (`docs/evals/gates-and-verdicts`)

Canonical URL: `https://mastra.ai/docs/evals/gates-and-verdicts.md`

## Gates and verdicts

Gates and verdicts add severity semantics to `runEvals`. Gates are scorers that must score 1.0, hard requirements that block a run. Thresholds are lower and/or upper bounds on the average score of tracked metrics. The verdict summarizes the outcome as `passed`, `scored`, or `failed`.

### When to use gates and verdicts

- Enforce hard requirements in CI (e.g., "agent must call the right tool")
- Track quality metrics with minimum thresholds (e.g., "faithfulness above 0.7")
- Get a single verdict signal (`passed`, `scored`, or `failed`) from an eval run without writing custom assertion logic
- Separate "must pass" gates from "nice to have" tracked metrics

### Quickstart

```typescript
import { runEvals } from '@mastra/core/evals'
import { checks } from '@mastra/evals/checks'
import { weatherAgent } from '../agents'
import { faithfulnessScorer } from '../scorers'

const result = await runEvals({
  data: [{ input: 'What is the weather in Brooklyn?' }],
  target: weatherAgent,

  // Gates: must all score 1.0 or the run fails
  gates: [checks.calledTool('get_weather'), checks.noToolErrors()],

  // Scorers: tracked with optional thresholds
  scorers: [
    { scorer: faithfulnessScorer, threshold: 0.7 },
    checks.includes('Brooklyn'), // no threshold = tracked only
  ],
})

console.log(result.verdict) // 'passed' | 'scored' | 'failed'
```

### How verdicts work

The verdict is computed from gates and thresholds after all data items are processed:

- `failed`: At least one gate averaged below 1.0 across data items
- `scored`: All gates passed, but at least one threshold scorer missed its threshold
- `passed`: All gates scored 1.0 and all thresholds were met

The verdict field is omitted when no gates or threshold-bearing scorers are provided, and when every configured gate and threshold returned `notScorable()` (no numeric evidence). In those cases `runEvals` still returns `scores` and `summary`.

### Gates

Gates are scorers passed via the `gates` field. They run before regular scorers on each data item. A gate must average a score of 1.0 across the data items it could score to pass. Items where the gate returns `notScorable()` are excluded from the average, and a gate that throws an error counts as 0 for that item.

```typescript
import { runEvals } from '@mastra/core/evals'
import { checks } from '@mastra/evals/checks'

const result = await runEvals({
  data: [{ input: 'What is the weather?' }],
  target: weatherAgent,
  gates: [checks.calledTool('get_weather')],
  scorers: [qualityScorer],
})

// result.gateResults: [{ id: 'check-called-tool', passed: true, score: 1 }]
```

Any scorer works as a gate. Quick Checks are a natural fit because they return binary 1/0 scores. Visit [runEvals() reference](https://mastra.ai/reference/evals/run-evals) for the full parameter and return type documentation.

#### Gate-only runs

`scorers` is optional when at least one gate is provided. This is useful for deterministic CI checks where you only care about pass/fail gates and don't need to track any quality metrics.

```typescript
import { runEvals } from '@mastra/core/evals'
import { checks } from '@mastra/evals/checks'

const result = await runEvals({
  data: [{ input: 'What is the weather in Brooklyn?' }],
  target: weatherAgent,
  gates: [checks.calledTool('get_weather'), checks.noToolErrors()],
})
```

You must provide at least one scorer or gate, a run with neither throws an error.

### Thresholds

Wrap a scorer in `{ scorer, threshold }` to set pass/fail bounds. The threshold is compared against the scorer's average score across scored data items. Results that return `notScorable()` are left out of the average.

A `threshold` can be:

- **A number**: implies minimum (score at or above passes): `{ scorer, threshold: 0.7 }`
- **An object with `min` and/or `max`**: for range-based checks: `{ scorer, threshold: { max: 0.3 } }`

Use `max` for scorers where a high score is bad (e.g., hallucination, toxicity). Use `{ min, max }` when the score should fall within a specific band.

```typescript
import { runEvals } from '@mastra/core/evals'

const result = await runEvals({
  data: [{ input: 'Explain quantum computing' }],
  target: myAgent,
  scorers: [
    { scorer: faithfulnessScorer, threshold: 0.7 }, // min threshold (number shorthand)
    { scorer: hallucinationScorer, threshold: { max: 0.3 } }, // max threshold  -  high score = bad
    { scorer: verbosityScorer, threshold: { min: 0.3, max: 0.8 } }, // range threshold
    toneScorer, // bare scorer, no threshold  -  tracked only
  ],
})

// result.thresholdResults:
// [
//   { id: 'faithfulness', passed: true, averageScore: 0.85, threshold: 0.7 },
//   { id: 'hallucination', passed: true, averageScore: 0.1, threshold: { max: 0.3 } },
//   { id: 'verbosity', passed: false, averageScore: 0.9, threshold: { min: 0.3, max: 0.8 } },
// ]
```

A bare scorer (no threshold) still shows up in `result.scores` but doesn't affect the verdict.

### Using verdicts in CI

The verdict gives a single signal for CI pipelines:

```typescript
import { runEvals } from '@mastra/core/evals'
import { checks } from '@mastra/evals/checks'

const result = await runEvals({
  data: testDataset,
  target: myAgent,
  gates: [checks.calledTool('search'), checks.noToolErrors()],
  scorers: [{ scorer: faithfulnessScorer, threshold: 0.7 }],
})

if (result.verdict === 'failed') {
  console.error(
    'Gate failures:',
    result.gateResults?.filter(g => !g.passed),
  )
  process.exit(1)
}

if (result.verdict === 'scored') {
  console.warn(
    'Threshold misses:',
    result.thresholdResults?.filter(t => !t.passed),
  )
}
```

### Related

- [Quick Checks](https://mastra.ai/docs/evals/quick-checks): Zero-LLM micro-scorers that work well as gates
- [runEvals() reference](https://mastra.ai/reference/evals/run-evals): Full API documentation
- [Built-in scorers](https://mastra.ai/docs/evals/built-in-scorers): LLM-based and code-based scorers
- [Running evals in CI](https://mastra.ai/docs/evals/running-in-ci): CI integration patterns

---

## Source: Multi-turn Evals (`docs/evals/multi-turn`)

Canonical URL: `https://mastra.ai/docs/evals/multi-turn.md`

## Multi-turn evals

Multi-turn evals test agent behavior across a conversation. Instead of a single `input`, you provide an `inputs` array. Each entry is sent sequentially to the agent on the same thread, and scorers see the accumulated output from all turns.

### When to use multi-turn evals

- The agent uses memory and must recall context from earlier turns
- The agent handles follow-up questions that depend on prior responses
- You need to verify tool-call sequences across a conversation
- The agent runs a multi-step workflow (search, confirm, execute)

### Quickstart

```typescript
import { runEvals } from '@mastra/core/evals'
import { checks } from '@mastra/evals/checks'
import { weatherAgent } from '../agents'

const result = await runEvals({
  data: [
    {
      inputs: [
        'What is the weather in Brooklyn?',
        'What about tomorrow?',
        'Compare the two forecasts.',
      ],
    },
  ],
  target: weatherAgent,
  scorers: [checks.calledTool('get_weather', { times: 2 }), checks.includes('Brooklyn')],
})
```

Each turn runs `agent.generate()` with the same thread ID. The agent sees the full conversation history. Scorers receive the accumulated output messages from all turns.

> **Prebuilt LLM judges grade one turn:** Prebuilt LLM-judge scorers (rubric, answer relevancy, faithfulness, and the others listed in [Scorer compatibility](#scorer-compatibility)) read a single assistant message, so with `inputs` they grade only the last turn's response. For semantic grading across a conversation, use [`createMultiTurnJudgeScorer()`](https://mastra.ai/reference/evals/multi-turn-judge), which grades every assistant turn against one criterion, or per-turn [`turns[].scorers`](#per-turn-assertions-with-turns), where each turn grades its own output.

### Memory is required for cross-turn recall

Multi-turn recall depends on the agent having a **memory store configured**. The shared thread ID is what lets each turn see the earlier ones, but a thread only persists history when the agent has memory. If the agent has no memory configured, the turns still run sequentially and their outputs still accumulate for scoring, but the agent won't recall earlier turns (each input runs in isolation). `runEvals` logs a warning when you use `inputs` on an agent without memory.

`runEvals` manages conversation identity by generating the shared `threadId` and injecting a `resourceId`. Mastra memory scopes messages by resource and thread, so recall requires both values. By default, deriving the resource from the generated thread isolates each conversation. Pass `targetOptions.memory.resource` to pin a resource, such as when reusing an existing user's memory; `runEvals` still owns the thread, so you don't provide one:

```typescript
await runEvals({
  target: weatherAgent,
  data: [{ inputs: ['What is the weather in Brooklyn?', 'What about tomorrow?'] }],
  scorers: [checks.similarity('weather forecast')],
  targetOptions: { memory: { resource: 'user-42' } },
})
```

See [Memory](https://mastra.ai/docs/memory/overview) for how to configure a memory store.

### How it works

When a data item has an `inputs` array, `runEvals`:

1. Creates a fresh thread (unique `threadId`) and resource for the conversation (a caller-provided `targetOptions.memory.resource` is preserved)
2. Sends each input sequentially via `agent.generate()` on that thread
3. Accumulates all output messages across turns
4. Passes the full accumulated output to scorers for evaluation

Scorers see the complete conversation output, including every turn.

### Scoring semantics

These details matter when writing scorers for multi-turn items:

- **`run.output` is the accumulated output from every turn.** Output-based scorers: `checks.includes`, `checks.calledTool`, `checks.similarity`, and similar: evaluate the whole conversation. For example, `checks.calledTool('get_weather', { times: 2 })` counts calls across all turns.
- **`run.input` is only the first turn's input.** Scorers that compare input against output (faithfulness, answer relevancy, and other input-relative LLM scorers) only see the first user message, not the full conversation. Prefer output-based checks for multi-turn, or build scorers that read the accumulated `run.output` directly.

#### Scorer compatibility

Accumulated output only helps if the scorer reads all of it:

| Scorer                                                                                                                                                                                                                         | What it sees with `inputs`                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| [Quick Checks](https://mastra.ai/docs/evals/quick-checks): `checks.calledTool`, `checks.includes`, `checks.similarity`, `checks.noToolErrors`, and the rest                                                                    | The whole conversation. Tool-call checks count calls across every turn, and text checks search all assistant text |
| [Multi-turn Judge scorer](https://mastra.ai/reference/evals/multi-turn-judge)                                                                                                                                                  | Every assistant turn, graded together against one plain-English criterion                                         |
| Prebuilt LLM-judge scorers: rubric, answer relevancy, answer similarity, faithfulness, hallucination, bias, toxicity, context precision, context recall, context relevance, noise sensitivity, prompt alignment, summarization | Only the last assistant message that carries text. Input-relative judges also see only the first turn's input     |
| Trajectory scorers (`AgentScorerConfig.trajectory`)                                                                                                                                                                            | The last turn's span when traces are available, otherwise tool calls from all accumulated messages                |
| Custom scorers                                                                                                                                                                                                                 | Whatever they read from `run.output`                                                                              |

#### Grading a whole conversation

To judge every turn together, use [`createMultiTurnJudgeScorer()`](https://mastra.ai/reference/evals/multi-turn-judge). It builds a transcript of every assistant turn and asks a judge model whether the conversation satisfies one plain-English criterion, scoring `1` or `0`:

```typescript
import { runEvals } from '@mastra/core/evals'
import { createMultiTurnJudgeScorer } from '@mastra/evals/scorers/prebuilt'
import { weatherAgent } from '../agents'

const result = await runEvals({
  data: [
    {
      inputs: [
        "How's the weather in London?",
        'And Paris?',
        'Should I pack an umbrella for London?',
      ],
    },
  ],
  target: weatherAgent,
  scorers: [
    {
      scorer: createMultiTurnJudgeScorer({
        model: 'anthropic/claude-haiku-4-5',
        criterion:
          'The agent provided forecasts for London and Paris, and gave weather-appropriate packing advice.',
      }),
      threshold: 1,
    },
  ],
})
```

To grade something the criterion can't express, write your own scorer that reads the assistant messages out of `run.output`. [`extractAgentResponseMessages()`](https://mastra.ai/reference/evals/scorer-utils) returns the text of each assistant message, in order:

```typescript
import { createScorer } from '@mastra/core/evals'
import { extractAgentResponseMessages } from '@mastra/evals/scorers/utils'
import { z } from 'zod'

export const conversationJudge = createScorer({
  id: 'conversation-judge',
  name: 'Conversation Judge',
  description: 'Grades every assistant turn in a conversation against one criterion',
  type: 'agent',
  judge: {
    model: 'anthropic/claude-haiku-4-5',
    instructions: 'You grade multi-turn assistant transcripts against a single criterion.',
  },
})
  .analyze({
    description: 'Judge the transcript as a whole',
    outputSchema: z.object({ satisfied: z.boolean(), reason: z.string() }),
    createPrompt: ({ run }) => {
      const transcript = extractAgentResponseMessages(run.output)
        .map((text, index) => `Turn ${index + 1}: ${text}`)
        .join('\n\n')

      return `Grade this conversation:\n\n${transcript}\n\nCriterion: the assistant keeps the forecast consistent across turns.`
    },
  })
  .generateScore(({ results }) => (results.analyzeStepResult?.satisfied ? 1 : 0))
  .generateReason(({ results }) => results.analyzeStepResult?.reason ?? '')
```

Pass it to `runEvals` like any other scorer. See [Custom scorers](https://mastra.ai/docs/evals/custom-scorers) for the full `createScorer()` pipeline.

### Per-turn assertions with `turns`

The `inputs` form scores the **accumulated** output as a whole, a single score over every turn's output. That can hide per-turn failures: an output-based check like `checks.includes('Brooklyn')` passes if _any_ turn mentions Brooklyn, even when the follow-up turn is broken.

When you need to assert that a **specific turn** behaved correctly, use `turns` instead. Each turn is an object with its own `input` and optional `gates`/`scorers` that evaluate **only that turn's** input and output:

```typescript
import { runEvals } from '@mastra/core/evals'
import { checks } from '@mastra/evals/checks'
import { weatherAgent } from '../agents'

const result = await runEvals({
  data: [
    {
      turns: [
        {
          input: 'What is the weather in Brooklyn?',
          gates: [checks.calledTool('get_weather')],
        },
        {
          // The follow-up must call the tool again  -  it can't be satisfied
          // by the first turn's tool call.
          input: 'What about tomorrow?',
          gates: [checks.calledTool('get_weather')],
          scorers: [{ scorer: checks.similarity('tomorrow forecast'), threshold: 0.5 }],
        },
      ],
    },
  ],
  target: weatherAgent,
})

result.verdict // 'passed' | 'scored' | 'failed'
result.turnResults // per-turn gate/threshold/scorer outcomes
```

Semantics:

- A per-turn gate or scorer receives **only that turn's** `run.input` and `run.output`, rather than the accumulated conversation. A different turn's output can't satisfy the check, and `run.input` contains the input for the turn being evaluated.
- Per-turn outcomes fold into the [verdict](https://mastra.ai/docs/evals/gates-and-verdicts): a failing turn gate makes the verdict `failed`. A missed turn threshold (with gates passing) makes it `scored`.
- `result.turnResults[i]` reports each turn's `gateResults`, `thresholdResults`, and `scores`. A failure points at the exact turn. Across multiple conversations, turn results are averaged by turn index.
- A turn with no `gates` or `scorers` advances the conversation.
- Top-level `scorers`/`gates` still run as a whole over the accumulated output, so you can combine "this turn must call the tool" with "the answer mentions Brooklyn."
- When the agent has storage configured, each per-turn scorer/gate result is persisted like top-level scores, so per-turn outcomes appear in your scores store. Each stored per-turn score uses its turn index as a label (`metadata.turnIndex`) and shares the conversation's `threadId`. It also includes a link to that turn's trace span.

Use `inputs` when a single whole-conversation score over the whole conversation is enough. Use `turns` when correctness depends on individual turns. `turns` can't be combined with `input` or `inputs` in the same data item.

### Combining with gates and thresholds

Multi-turn data items work with [gates and verdicts](https://mastra.ai/docs/evals/gates-and-verdicts). Use output-based scorers so gating reflects the full conversation:

```typescript
import { runEvals } from '@mastra/core/evals'
import { checks } from '@mastra/evals/checks'

const result = await runEvals({
  data: [
    {
      inputs: ['My favorite city is Brooklyn.', 'What is the weather in my favorite city?'],
    },
  ],
  target: weatherAgent,
  gates: [checks.calledTool('get_weather')],
  scorers: [{ scorer: checks.similarity('Brooklyn weather forecast'), threshold: 0.5 }],
})

result.verdict // 'passed' | 'scored' | 'failed'
```

### Mixing single-turn and multi-turn

A single `runEvals` call can include both single-turn and multi-turn data items:

```typescript
const result = await runEvals({
  data: [
    { input: 'What is the weather in Brooklyn?' },
    {
      inputs: ['My favorite city is Brooklyn.', 'What is the weather in my favorite city?'],
    },
  ],
  target: weatherAgent,
  scorers: [checks.includes('Brooklyn')],
})
```

Single-turn items use `input` as usual. Multi-turn items use `inputs`, `input` can be omitted entirely.

### Validation

`runEvals` throws a `MastraError` if `inputs` is present but empty:

```typescript
// Throws: 'inputs' must be a non-empty array
await runEvals({
  data: [{ inputs: [] }],
  target: myAgent,
  scorers: [myScorer],
})
```

### Related

- [`runEvals()` reference](https://mastra.ai/reference/evals/run-evals): Full API for `runEvals` parameters and returns
- [Gates and verdicts](https://mastra.ai/docs/evals/gates-and-verdicts): Enforce hard requirements and quality thresholds
- [Quick Checks](https://mastra.ai/docs/evals/quick-checks): Zero-LLM composable micro-scorers
- [Scorer utilities](https://mastra.ai/reference/evals/scorer-utils): Helpers for reading messages out of a scorer run
- [Multi-turn Judge scorer](https://mastra.ai/reference/evals/multi-turn-judge): LLM judge that grades every assistant turn together

---

## Source: Custom Scorers (`docs/evals/custom-scorers`)

Canonical URL: `https://mastra.ai/docs/evals/custom-scorers.md`

## Custom scorers

Use `createScorer` to build custom evaluation logic. Each step can use a JavaScript function or an LLM-based prompt object, depending on what you're evaluating.

### The four-step pipeline

All scorers in Mastra follow a consistent four-step evaluation pipeline:

1. **preprocess** (optional): Prepare or transform input/output data
2. **analyze** (optional): Perform evaluation analysis and gather insights
3. **generateScore** (required): Convert analysis into a numerical score
4. **generateReason** (optional): Generate human-readable explanations

Combine **functions** and **prompt objects** within a scorer to use deterministic checks for some steps and LLM-based evaluation for others.

### Functions vs prompt objects

**Functions** use JavaScript for deterministic logic. They're ideal for:

- Algorithmic evaluations with clear criteria
- Performance-critical scenarios
- Integration with existing libraries
- Consistent, reproducible results

**Prompt Objects** use LLMs as judges for evaluation. They're perfect for:

- Subjective evaluations requiring human-like judgment
- Complex criteria difficult to code algorithmically
- Natural language understanding tasks
- Nuanced context evaluation

**What “prompt object” means:** Instead of a function, the step is an object with `description` + `createPrompt` (and `outputSchema` for `preprocess`/`analyze`). That object tells Mastra to run the judge LLM for the step and store the structured output in `results.<step>StepResult`.

You can mix and match approaches within a single scorer - for example, use a function for preprocessing data and an LLM for analyzing quality.

### Initializing a scorer

Every scorer starts with the `createScorer` factory function, which requires an id and description, and optionally accepts a type specification and judge configuration.

```typescript
import { createScorer } from '@mastra/core/evals';

const glutenCheckerScorer = createScorer({
  id: 'gluten-checker',
  description: 'Check if recipes contain gluten ingredients',
  judge: {                    // Optional: for prompt object steps
    model: 'openai/gpt-5.6-sol',
    instructions: 'You are a Chef that identifies if recipes contain gluten.'
  }
})
// Chain step methods here
.preprocess(...)
.analyze(...)
.generateScore(...)
.generateReason(...)
```

The judge configuration is only needed if you plan to use prompt objects in any step. Individual steps can override this default configuration with their own judge settings.

If all steps are function-based, the judge is never called and there is no judge output. To see LLM output, define at least one step as a prompt object and read the corresponding step result (for example, `results.analyzeStepResult`).

#### Minimal judge example (prompt object)

This example uses a prompt object in `analyze`, so the judge runs and its structured output is available as `results.analyzeStepResult`.

```typescript
import { createScorer } from '@mastra/core/evals'
import { z } from 'zod'

const quoteSourcesScorer = createScorer({
  id: 'quote-sources',
  description: 'Check if the response includes sources',
  judge: {
    model: 'openai/gpt-5-mini',
    instructions: 'You are a strict evaluator.',
  },
})
  .analyze({
    description: 'Detect whether sources are present',
    outputSchema: z.object({
      hasSources: z.boolean(),
      sources: z.array(z.string()),
    }),
    createPrompt: ({ run }) => `
Does the response contain sources? Extract them as a list.

Response:
${run.output}
`,
  })
  .generateScore(({ results }) => (results.analyzeStepResult.hasSources ? 1 : 0))

// Run the scorer and inspect judge output
const result = await quoteSourcesScorer.run({
  input: 'What is the capital of France?',
  output: 'Paris is the capital of France [1]. Source: [1] Wikipedia',
})

console.log(result.score) // 1
console.log(result.analyzeStepResult) // { hasSources: true, sources: ["Wikipedia"] }
```

#### Agent Type for Agent Evaluation

For type safety and compatibility with both live agent scoring and trace scoring, use `type: 'agent'` when creating scorers for agent evaluation. The same scorer can evaluate an agent and score traces:

```typescript
const myScorer = createScorer({
  type: 'agent', // Automatically handles agent input/output types
}).generateScore(({ run, results }) => {
  // run.output is automatically typed as ScorerRunOutputForAgent
  // run.input is automatically typed as ScorerRunInputForAgent
})
```

### Step-by-step breakdown

#### preprocess Step (Optional)

Prepares input/output data when you need to extract specific elements or filter content, or alternatively transform complex data structures.

**Functions:** `({ run, results }) => any`

```typescript
const glutenCheckerScorer = createScorer(...)
.preprocess(({ run }) => {
  // Extract and clean recipe text
  const recipeText = run.output.text.toLowerCase();
  const wordCount = recipeText.split(' ').length;

  return {
    recipeText,
    wordCount,
    hasCommonGlutenWords: /flour|wheat|bread|pasta/.test(recipeText)
  };
})
```

**Prompt Objects:** Use `description`, `outputSchema`, and `createPrompt` to structure LLM-based preprocessing.

```typescript
const glutenCheckerScorer = createScorer(...)
.preprocess({
  description: 'Extract ingredients from the recipe',
  outputSchema: z.object({
    ingredients: z.array(z.string()),
    cookingMethods: z.array(z.string())
  }),
  createPrompt: ({ run }) => `
    Extract all ingredients and cooking methods from this recipe:
    ${run.output.text}

    Return JSON with ingredients and cookingMethods arrays.
  `
})
```

**Data Flow:** Results are available to subsequent steps as `results.preprocessStepResult`

#### analyze Step (Optional)

Performs core evaluation analysis, gathering insights that will inform the scoring decision.

**Functions:** `({ run, results }) => any`

```typescript
const glutenCheckerScorer = createScorer({...})
.preprocess(...)
.analyze(({ run, results }) => {
  const { recipeText, hasCommonGlutenWords } = results.preprocessStepResult;

  // Simple gluten detection algorithm
  const glutenKeywords = ['wheat', 'flour', 'barley', 'rye', 'bread'];
  const foundGlutenWords = glutenKeywords.filter(word =>
    recipeText.includes(word)
  );

  return {
    isGlutenFree: foundGlutenWords.length === 0,
    detectedGlutenSources: foundGlutenWords,
    confidence: hasCommonGlutenWords ? 0.9 : 0.7
  };
})
```

**Prompt Objects:** Use `description`, `outputSchema`, and `createPrompt` for LLM-based analysis.

```typescript
const glutenCheckerScorer = createScorer({...})
.preprocess(...)
.analyze({
  description: 'Analyze recipe for gluten content',
  outputSchema: z.object({
    isGlutenFree: z.boolean(),
    glutenSources: z.array(z.string()),
    confidence: z.number().min(0).max(1)
  }),
  createPrompt: ({ run, results }) => `
    Analyze this recipe for gluten content:
    "${results.preprocessStepResult.recipeText}"

    Look for wheat, barley, rye, and hidden sources like soy sauce.
    Return JSON with isGlutenFree, glutenSources array, and confidence (0-1).
  `
})
```

**Data Flow:** Results are available to subsequent steps as `results.analyzeStepResult`

#### `generateScore` step (required)

Converts analysis results into a numerical score. This is the only required step in the pipeline.

**Functions:** `({ run, results }) => number`

```typescript
const glutenCheckerScorer = createScorer({...})
.preprocess(...)
.analyze(...)
.generateScore(({ results }) => {
  const { isGlutenFree, confidence } = results.analyzeStepResult;

  // Return 1 for gluten-free, 0 for contains gluten
  // Weight by confidence level
  return isGlutenFree ? confidence : 0;
})
```

**Prompt Objects:** See the [`createScorer`](https://mastra.ai/reference/evals/create-scorer) API reference for details on using prompt objects with generateScore, including required `calculateScore` function.

**Data Flow:** The score is available to generateReason as the `score` parameter

#### `generateReason` step (optional)

Generates human-readable explanations for the score, useful for debugging, transparency, or user feedback.

**Functions:** `({ run, results, score }) => string`

```typescript
const glutenCheckerScorer = createScorer({...})
.preprocess(...)
.analyze(...)
.generateScore(...)
.generateReason(({ results, score }) => {
  const { isGlutenFree, glutenSources } = results.analyzeStepResult;

  if (isGlutenFree) {
    return `Score: ${score}. This recipe is gluten-free with no harmful ingredients detected.`;
  } else {
    return `Score: ${score}. Contains gluten from: ${glutenSources.join(', ')}`;
  }
})
```

**Prompt Objects:** Use `description` and `createPrompt` for LLM-generated explanations.

```typescript
const glutenCheckerScorer = createScorer({...})
.preprocess(...)
.analyze(...)
.generateScore(...)
.generateReason({
  description: 'Explain the gluten assessment',
  createPrompt: ({ results, score }) => `
    Explain why this recipe received a score of ${score}.
    Analysis: ${JSON.stringify(results.analyzeStepResult)}

    Provide a clear explanation for someone with dietary restrictions.
  `
})
```

### Input filtering

Agent conversations can contain hundreds of messages whose tool calls and data parts are accompanied by system metadata. Most scorers need only a subset. Before the scorer pipeline executes, the `prepareRun` option transforms the run data to reduce noise and keep each scorer focused.

#### Declarative filtering with `filterRun()`

The [`filterRun()`](https://mastra.ai/reference/evals/filter-run) utility creates a `prepareRun` function from declarative options:

```typescript
import { createScorer, filterRun } from '@mastra/core/evals'

const toolScorer = createScorer({
  id: 'tool-quality',
  description: 'Evaluates tool usage quality',
  type: 'agent',
  prepareRun: filterRun({
    partTypes: ['tool-invocation', 'text'],
    maxRememberedMessages: 20,
  }),
}).generateScore(({ run }) => {
  // run.input.rememberedMessages has only tool and text messages, max 20
  return 1
})
```

Common options include:

- `partTypes`: Keep only messages with matching part types (e.g., `'tool-invocation'`, `'text'`, `'reasoning'`)
- `toolNames`: Keep only messages involving specific tools (e.g., `['write_file', 'execute_command']`)
- `maxRememberedMessages`: Limit context window size
- `dropRequestContext`, `dropGroundTruth`, `dropExpectedTrajectory`: Remove unused fields

See the [`filterRun()` reference](https://mastra.ai/reference/evals/filter-run) for the full list of options.

#### Custom `prepareRun` functions

For logic that `filterRun()` doesn't cover, write a `prepareRun` function directly:

```typescript
import { createScorer } from '@mastra/core/evals'

const customScorer = createScorer({
  id: 'recent-output',
  description: 'Scores only the last response',
  type: 'agent',
  prepareRun: run => ({
    ...run,
    output: run.output.slice(-1), // Keep only the last message
    requestContext: undefined,
  }),
}).generateScore(({ run }) => {
  return run.output.length > 0 ? 1 : 0
})
```

The `prepareRun` function can also be async.

> **System messages are always preserved:** `filterRun()` never filters `systemMessages` or `taggedSystemMessages`. These contain agent instructions and are critical context for scoring.

### Skipping runs that can't be scored

Some scorers only apply to a subset of runs. A scorer that judges how well a refund was handled has nothing to say about a run where no refund was requested.

Return [`notScorable()`](https://mastra.ai/reference/evals/not-scorable) from a function step to declare that the run has nothing to evaluate. Remaining steps are skipped and the run is left out of the scorer's aggregates:

```typescript
import { createScorer, notScorable } from '@mastra/core/evals'
import { extractToolCalls } from '@mastra/evals/scorers/utils'

export const refundJudge = createScorer({
  id: 'refund-judge',
  description: 'Judges how well refund requests were handled',
  type: 'agent',
  judge: {
    model: 'openai/gpt-5-mini',
    instructions: 'You are a strict QA reviewer for customer-support refund handling.',
  },
})
  .preprocess(({ run }) => {
    const { tools } = extractToolCalls(run.output)
    return tools.includes('refundCustomer')
      ? { tools }
      : notScorable('refundCustomer was not called')
  })
  .generateScore({
    description: 'Score the refund handling from 0 to 1',
    createPrompt: ({ run }) =>
      `Rate this refund handling from 0 to 1:\n${JSON.stringify(run.output)}`,
  })
```

Put the check in `preprocess` so it runs before any judge step. `notScorable()` is different from an [eligibility filter](https://mastra.ai/docs/evals/overview): filters decide from request context whether the scorer runs at all, while `notScorable()` lets the scorer inspect the run's input and output first.

See the [`notScorable()` reference](https://mastra.ai/reference/evals/not-scorable) for the result shape and how live scoring, `runEvals()`, and experiments treat a skipped run.

### Example: Create a custom scorer

A custom scorer in Mastra uses `createScorer` with four core components:

1. [**Judge Configuration**](#judge-configuration)
2. [**Analysis Step**](#analysis-step)
3. [**Score Generation**](#score-generation)
4. [**Reason Generation**](#reason-generation)

Together, these components allow you to define custom evaluation logic using LLMs as judges. Visit [createScorer](https://mastra.ai/reference/evals/create-scorer) for the full API and configuration options.

```typescript
import { createScorer } from '@mastra/core/evals'
import { z } from 'zod'

export const GLUTEN_INSTRUCTIONS = `You are a Chef that identifies if recipes contain gluten.`

export const generateGlutenPrompt = ({
  output,
}: {
  output: string
}) => `Check if this recipe is gluten-free.

Check for:
- Wheat
- Barley
- Rye
- Common sources like flour, pasta, bread

Example with gluten:
"Mix flour and water to make dough"
Response: {
  "isGlutenFree": false,
  "glutenSources": ["flour"]
}

Example gluten-free:
"Mix rice, beans, and vegetables"
Response: {
  "isGlutenFree": true,
  "glutenSources": []
}

Recipe to analyze:
${output}

Return your response in this format:
{
  "isGlutenFree": boolean,
  "glutenSources": ["list ingredients containing gluten"]
}`

export const generateReasonPrompt = ({
  isGlutenFree,
  glutenSources,
}: {
  isGlutenFree: boolean
  glutenSources: string[]
}) => `Explain why this recipe is${isGlutenFree ? '' : ' not'} gluten-free.

${glutenSources.length > 0 ? `Sources of gluten: ${glutenSources.join(', ')}` : 'No gluten-containing ingredients found'}

Return your response in this format:
"This recipe is [gluten-free/contains gluten] because [explanation]"`

export const glutenCheckerScorer = createScorer({
  id: 'gluten-checker',
  description: 'Check if the output contains any gluten',
  judge: {
    model: 'openai/gpt-5-mini',
    instructions: GLUTEN_INSTRUCTIONS,
  },
})
  .analyze({
    description: 'Analyze the output for gluten',
    outputSchema: z.object({
      isGlutenFree: z.boolean(),
      glutenSources: z.array(z.string()),
    }),
    createPrompt: ({ run }) => {
      const { output } = run
      return generateGlutenPrompt({ output: output.text })
    },
  })
  .generateScore(({ results }) => {
    return results.analyzeStepResult.isGlutenFree ? 1 : 0
  })
  .generateReason({
    description: 'Generate a reason for the score',
    createPrompt: ({ results }) => {
      return generateReasonPrompt({
        glutenSources: results.analyzeStepResult.glutenSources,
        isGlutenFree: results.analyzeStepResult.isGlutenFree,
      })
    },
  })
```

#### Judge Configuration

Sets up the LLM model and defines its role as a domain expert.

```typescript
judge: {
  model: 'openai/gpt-5-mini',
  instructions: GLUTEN_INSTRUCTIONS,
}
```

#### Analysis Step

Defines how the LLM should analyze the input and what structured output to return.

```typescript
.analyze({
  description: 'Analyze the output for gluten',
  outputSchema: z.object({
    isGlutenFree: z.boolean(),
    glutenSources: z.array(z.string()),
  }),
  createPrompt: ({ run }) => {
    const { output } = run;
    return generateGlutenPrompt({ output: output.text });
  },
})
```

The analysis step uses a prompt object to:

- Provide a clear description of the analysis task
- Define expected output structure with a Standard JSON Schema (both boolean result and list of gluten sources)
- Generate runtime prompts based on the input content

#### Score Generation

Converts the LLM's structured analysis into a numerical score.

```typescript
.generateScore(({ results }) => {
  return results.analyzeStepResult.isGlutenFree ? 1 : 0;
})
```

The score generation function takes the analysis results and applies business logic to produce a score. In this case, the LLM directly determines if the recipe is gluten-free, so we use that boolean result: 1 for gluten-free, 0 for contains gluten.

#### Reason Generation

Provides human-readable explanations for the score using another LLM call.

```typescript
.generateReason({
  description: 'Generate a reason for the score',
  createPrompt: ({ results }) => {
    return generateReasonPrompt({
      glutenSources: results.analyzeStepResult.glutenSources,
      isGlutenFree: results.analyzeStepResult.isGlutenFree,
    });
  },
})
```

The reason generation step creates explanations that help users understand why a score was assigned, using both the boolean result and the specific gluten sources identified by the analysis step.

### High gluten-free example

```typescript
const result = await glutenCheckerScorer.run({
  input: [{ role: 'user', content: 'Mix rice, beans, and vegetables' }],
  output: { text: 'Mix rice, beans, and vegetables' },
})

console.log('Score:', result.score)
console.log('Gluten sources:', result.analyzeStepResult.glutenSources)
console.log('Reason:', result.reason)
```

#### High gluten-free output

```typescript
{
  score: 1,
  analyzeStepResult: {
    isGlutenFree: true,
    glutenSources: []
  },
  reason: 'This recipe is gluten-free because rice, beans, and vegetables are naturally gluten-free ingredients that are safe for people with celiac disease.'
}
```

### Partial gluten example

```typescript
const result = await glutenCheckerScorer.run({
  input: [{ role: 'user', content: 'Mix flour and water to make dough' }],
  output: { text: 'Mix flour and water to make dough' },
})

console.log('Score:', result.score)
console.log('Gluten sources:', result.analyzeStepResult.glutenSources)
console.log('Reason:', result.reason)
```

#### Partial gluten output

```typescript
{
  score: 0,
  analyzeStepResult: {
    isGlutenFree: false,
    glutenSources: ['flour']
  },
  reason: 'This recipe is not gluten-free because it contains flour. Regular flour is made from wheat and contains gluten, making it unsafe for people with celiac disease or gluten sensitivity.'
}
```

### Low gluten-free example

```typescript
const result = await glutenCheckerScorer.run({
  input: [{ role: 'user', content: 'Add soy sauce and noodles' }],
  output: { text: 'Add soy sauce and noodles' },
})

console.log('Score:', result.score)
console.log('Gluten sources:', result.analyzeStepResult.glutenSources)
console.log('Reason:', result.reason)
```

#### Low gluten-free output

```typescript
{
  score: 0,
  analyzeStepResult: {
    isGlutenFree: false,
    glutenSources: ['soy sauce', 'noodles']
  },
  reason: 'This recipe is not gluten-free because it contains soy sauce, noodles. Regular soy sauce contains wheat and most noodles are made from wheat flour, both of which contain gluten and are unsafe for people with gluten sensitivity.'
}
```

**Examples and Resources:**

- [createScorer API Reference](https://mastra.ai/reference/evals/create-scorer): Complete technical documentation
- [Built-in Scorers Source Code](https://github.com/mastra-ai/mastra/tree/main/packages/evals/src/scorers): Real implementations for reference

---

## Source: Running in CI (`docs/evals/running-in-ci`)

Canonical URL: `https://mastra.ai/docs/evals/running-in-ci.md`

## Running scorers in CI

Running scorers in your CI pipeline provides quantifiable metrics for measuring agent quality over time. The `runEvals` function processes multiple test cases through your agent or workflow and returns aggregate scores.

### Basic setup

You can use any testing framework that supports ESM modules, such as [Vitest](https://vitest.dev/), [Jest](https://jestjs.io/), or [Mocha](https://mochajs.org/).

### Creating test cases

Use `runEvals` to evaluate your agent against multiple test cases. The function accepts an array of data items, each containing an `input` and optional `groundTruth` for scorer validation.

Resolve the `target` with `mastra.getAgent()` or `mastra.getWorkflow()` rather than importing it directly. A directly imported agent or workflow has no Mastra instance attached, so registry lookups inside steps or tools (such as `mastra.getAgent('weatherAgent')`) fail, scores aren't persisted, and trace-based trajectory scoring is unavailable.

```typescript
import { describe, it, expect } from 'vitest'
import { runEvals } from '@mastra/core/evals'
import { mastra } from '../src/mastra'
import { locationScorer } from '../src/mastra/scorers/location-scorer'

describe('Weather Agent Tests', () => {
  it('should correctly extract locations from queries', async () => {
    const result = await runEvals({
      data: [
        {
          input: 'weather in Berlin',
          groundTruth: { expectedLocation: 'Berlin', expectedCountry: 'DE' },
        },
        {
          input: 'weather in Berlin, Maryland',
          groundTruth: { expectedLocation: 'Berlin', expectedCountry: 'US' },
        },
        {
          input: 'weather in Berlin, Russia',
          groundTruth: { expectedLocation: 'Berlin', expectedCountry: 'RU' },
        },
      ],
      target: mastra.getAgent('weatherAgent'),
      scorers: [locationScorer],
    })

    // Assert aggregate score meets threshold
    expect(result.scores['location-accuracy']).toBe(1)
    expect(result.summary.totalItems).toBe(3)
  })
})
```

### Understanding results

The `runEvals` function returns an object with:

- `scores`: Average scores for each scorer across all test cases
- `summary.totalItems`: Total number of test cases processed

```typescript
{
  scores: {
    'location-accuracy': 1.0,  // Average score across all items
    'another-scorer': 0.85
  },
  summary: {
    totalItems: 3
  }
}
```

### Multiple test scenarios

Create separate test cases for different evaluation scenarios:

```typescript
describe('Weather Agent Tests', () => {
  const weatherAgent = mastra.getAgent('weatherAgent')

  it('should handle location disambiguation', async () => {
    const result = await runEvals({
      data: [
        {
          input: 'weather in Berlin',
          groundTruth: {/* ... */},
        },
        {
          input: 'weather in Berlin, Maryland',
          groundTruth: {/* ... */},
        },
      ],
      target: weatherAgent,
      scorers: [locationScorer],
    })

    expect(result.scores['location-accuracy']).toBe(1)
  })

  it('should handle typos and misspellings', async () => {
    const result = await runEvals({
      data: [
        {
          input: 'weather in Berln',
          groundTruth: { expectedLocation: 'Berlin', expectedCountry: 'DE' },
        },
        {
          input: 'weather in Parris',
          groundTruth: { expectedLocation: 'Paris', expectedCountry: 'FR' },
        },
      ],
      target: weatherAgent,
      scorers: [locationScorer],
    })

    expect(result.scores['location-accuracy']).toBe(1)
  })
})
```

### Next steps

- Learn about [creating custom scorers](https://mastra.ai/docs/evals/custom-scorers)
- Explore [built-in scorers](https://mastra.ai/docs/evals/built-in-scorers)
- Run scorers against [memory-enabled agents](https://mastra.ai/docs/evals/evals-with-memory)
- Read the [runEvals API reference](https://mastra.ai/reference/evals/run-evals)

---

## Source: Vitest Integration (`docs/evals/vitest-integration`)

Canonical URL: `https://mastra.ai/docs/evals/vitest-integration.md`

## Vitest integration

The `@mastra/evals/vitest` module integrates [`runEvals`](https://mastra.ai/reference/evals/run-evals) with [Vitest](https://vitest.dev/) so evaluations behave like regular tests. Fluent assertions fail the test when the eval doesn't pass, and a reporter prints a score table in the runner output.

To use it, install `@mastra/evals` and `vitest` (version 3 or 4):

```bash
npm install @mastra/evals vitest
```

### Configuring Vitest

Register the reporter and matchers in `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import { MastraEvalsReporter } from '@mastra/evals/vitest'

export default defineConfig({
  test: {
    reporters: ['default', new MastraEvalsReporter()],
    setupFiles: ['@mastra/evals/vitest/setup'],
  },
})
```

The setup file registers the custom matchers on `expect`. Alternatively, call `registerEvalMatchers()` from `@mastra/evals/vitest` in your own setup file.

### Asserting on a dataset with `expectEvals`

`expectEvals` runs a `runEvals` evaluation inside a regular `test()` and asserts a minimum pass rate. It accepts the same configuration as `runEvals`: a `target` agent or workflow, `data` items, and `scorers`, `gates`, or thresholds. Gates score each item pass/fail, so `toPass(0.8)` requires at least 80% of items to pass every gate. Scorer thresholds still compare the average score across items and must pass regardless of the rate:

```typescript
import { test } from 'vitest'
import { expectEvals } from '@mastra/evals/vitest'
import { checks } from '@mastra/evals/checks'
import { mastra } from '../src/mastra'

test('weather agent calls the tool and answers relevantly', { timeout: 60_000 }, async () => {
  await expectEvals({
    target: mastra.getAgent('weatherAgent'),
    data: [{ input: "What's the weather in London?" }],
    gates: [checks.calledTool('weatherTool'), checks.noToolErrors(), checks.includes('London')],
    scorers: [{ scorer: mastra.getScorer('answerRelevancyScorer'), threshold: 0.7 }],
  }).toPass(0.8)
})
```

`toPass()` without an argument requires every item to pass every gate. Always await the assertion: it resolves with the full `RunEvalsResult` for further checks and attaches the run's scores to the current test so `MastraEvalsReporter` displays them.

LLM-backed evals are far slower than Vitest's default 5-second timeout, so pass a per-test `timeout` (or set `testTimeout` in the Vitest config).

### Matrix testing with `expectEval`

`expectEval` is the single-item variant: `data` is one item instead of an array. Combine it with `test.for` (or `test.each`) to get one test (and one reporter entry) per data item instead of one aggregated result per dataset:

```typescript
import { test } from 'vitest'
import { expectEval } from '@mastra/evals/vitest'
import { checks } from '@mastra/evals/checks'
import { mastra } from '../src/mastra'

test.for([
  { input: "What's the weather in London?", groundTruth: 'London' },
  { input: "What's the weather in Tokyo?", groundTruth: 'Tokyo' },
  { input: "What's the weather in Sydney?", groundTruth: 'Sydney' },
])('weather agent: $input', { timeout: 60_000 }, async item => {
  await expectEval({
    target: mastra.getAgent('weatherAgent'),
    data: item,
    gates: [checks.calledTool('weatherTool'), checks.includes(item.groundTruth)],
  }).toPass()
})
```

Each item passes or fails independently. A single regression shows up as one failing test instead of a lowered aggregate pass rate.

### Asserting on results with matchers

For finer-grained control, call `runEvals` directly inside a regular `test()` and use the custom matchers on the result:

```typescript
import { test, expect } from 'vitest'
import { runEvals } from '@mastra/core/evals'
import { checks } from '@mastra/evals/checks'
import { mastra } from '../src/mastra'

test('weather agent quality', { timeout: 60_000 }, async () => {
  const result = await runEvals({
    target: mastra.getAgent('weatherAgent'),
    data: [{ input: "What's the weather in London?" }],
    scorers: [mastra.getScorer('answerRelevancyScorer')],
    gates: [checks.noToolErrors()],
  })

  expect(result).toHaveVerdict('passed')
  expect(result).toPassGates()
  expect(result).toHaveScoreAbove('answer-relevancy-scorer', 0.7)
})
```

Available matchers:

- `toHaveVerdict(verdict)`: asserts the run's verdict (`"passed"`, `"scored"`, or `"failed"`).
- `toHaveScoreAbove(scorerName, min)` / `toHaveScoreBelow(scorerName, max)`: asserts a scorer's average score. Categorized scorer configs use dot-paths, for example `"agent.my-scorer"` or `"steps.step-1.my-scorer"`.
- `toPassGates()`: asserts all gates passed. Fails when no gates were configured.
- `toPassThresholds()`: asserts all scorer thresholds passed. Fails when no thresholds were configured.

### Evaluating a workflow

Workflows are valid targets too. Use a `WorkflowScorerConfig` object for `scorers` to score the workflow output, individual steps, or the step execution trajectory, and reference nested scores with dot-paths in the matchers:

```typescript
import { test, expect } from 'vitest'
import { runEvals } from '@mastra/core/evals'
import { mastra } from '../src/mastra'

test('weather workflow runs fetch-weather then plan-activities', { timeout: 60_000 }, async () => {
  const result = await runEvals({
    target: mastra.getWorkflow('weatherWorkflow'),
    data: [
      {
        input: { city: 'London' },
        expectedTrajectory: {
          steps: [
            { stepType: 'workflow_step', name: 'fetch-weather' },
            { stepType: 'workflow_step', name: 'plan-activities' },
          ],
        },
      },
      {
        input: { city: 'Tokyo' },
        expectedTrajectory: {
          steps: [
            { stepType: 'workflow_step', name: 'fetch-weather' },
            { stepType: 'workflow_step', name: 'plan-activities' },
          ],
        },
      },
    ],
    scorers: {
      trajectory: [mastra.getScorer('trajectoryAccuracyScorer')],
    },
  })

  expect(result).toHaveScoreAbove('trajectory.code-trajectory-accuracy-scorer', 0.9)
})
```

The `plan-activities` step in this workflow calls `mastra.getAgent('weatherAgent')` at runtime, which only works because the target was resolved with `mastra.getWorkflow()`. See the [`runEvals` reference](https://mastra.ai/reference/evals/run-evals) for the full `WorkflowScorerConfig` shape.

### Reading the reporter output

`MastraEvalsReporter` prints a score table for every eval test after the run completes:

```text
Mastra Evals

✓ weather agent calls the tool and answers relevantly (1 item)
   check-called-tool (gate)                        1.0  ✓
   check-no-tool-errors (gate)                     1.0  ✓
   check-includes (gate)                           1.0  ✓
   answer-relevancy-scorer (threshold: min 0.7)    0.9  ✓

 Eval runs: 1 (1 passed)
```

Each entry shows the run's verdict, gates, thresholds, and the average score per scorer. The reporter reads the metadata that `expectEval`/`expectEvals` attach to `task.meta.mastraEval`, so it works with parallel test files and any test that populates that field.

### Rate limits and concurrency

Vitest runs test files in parallel, and `runEvals` accepts its own `concurrency` option, so total LLM traffic is multiplied across both. If you hit provider rate limits, lower `concurrency` in your eval options or set `fileParallelism: false` in the Vitest config.

---

## Source: Evals with Memory (`docs/evals/evals-with-memory`)

Canonical URL: `https://mastra.ai/docs/evals/evals-with-memory.md`

## Evals with memory

Agents that use memory in `thread` scope, including observational memory, require a thread ID at run time. When an eval invokes the agent without one, you'll see:

```text
ObservationalMemory (scope: 'thread') requires a threadId, but none was found in RequestContext or MessageList.
```

Choose an approach based on how you want to share memory across eval items. For runnable examples, see [`examples/evals-with-memory`](https://github.com/mastra-ai/mastra/tree/main/examples/evals-with-memory).

### When to use which approach

| Goal                                                     | Approach                                                                                      |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| One shared conversation across every item                | [`runEvals` with global `targetOptions.memory`](#shared-thread-with-runevals)                 |
| One independent thread per item, focused CI loop         | [`runEvals` per item](#per-item-threads-with-runevals)                                        |
| Fresh thread per item in a stored `Dataset`              | [`dataset.startExperiment` with a registered agent](https://mastra.ai/docs/evals/experiments) |
| Explicit thread selection per item in a stored `Dataset` | [`dataset.startExperiment` with an inline task](#dataset-experiments-with-an-inline-task)     |

Pre-seeding `RequestContext` with `MastraMemory` **isn't** a supported way to drive memory into an agent. Thread resolution reads `args.memory.thread`, `RequestContext.MastraMemory` is populated by `prepare-memory-step` after the agent has already resolved its thread.

### Shared thread with `runEvals`

`runEvals` accepts `targetOptions`, which is forwarded to `agent.generate()`. Passing `memory: { thread, resource }` runs every data item against the same thread, useful for testing recall across a multi-turn conversation.

```typescript
import { runEvals } from '@mastra/core/evals'
import { supportAgent } from './support-agent'
import { recallScorer } from '../scorers/recall-scorer'

const memory = await supportAgent.getMemory()
await memory!.createThread({ threadId: 'eval-thread', resourceId: 'ci-user' })

const result = await runEvals({
  target: supportAgent,
  scorers: [recallScorer],
  targetOptions: {
    memory: { thread: 'eval-thread', resource: 'ci-user' },
  },
  data: [
    { input: 'My order number is 12345' },
    { input: 'What is my order number?', groundTruth: '12345' },
  ],
})
```

`targetOptions` is **global per call**. No per-item override on `RunEvalsDataItem` is available today.

### Per-item threads with `runEvals`

When each data item needs its own thread (the common CI shape), call `runEvals` once per item with a unique `targetOptions.memory` and aggregate the scores yourself.

```typescript
import { randomUUID } from 'node:crypto'
import { runEvals } from '@mastra/core/evals'
import { supportAgent } from './support-agent'
import { recallScorer } from '../scorers/recall-scorer'

const memory = await supportAgent.getMemory()
const resourceId = 'ci-user'

const items = [
  { input: 'Cats are mammals', groundTruth: 'mammals' },
  { input: 'Dogs are mammals too', groundTruth: 'mammals' },
]

// `runEvals` returns `{ scores: Record<string, number>; summary: { totalItems } }`.
const scores: number[] = []
for (const item of items) {
  const threadId = `eval-${randomUUID()}`
  await memory!.createThread({ threadId, resourceId, title: item.input })

  const result = await runEvals({
    target: supportAgent,
    scorers: [recallScorer],
    targetOptions: { memory: { thread: threadId, resource: resourceId } },
    data: [item],
  })

  scores.push(result.scores[recallScorer.id])
}

const average = scores.reduce((a, b) => a + b, 0) / scores.length
```

> **Note:** Create the thread before running the eval. Observational memory in `thread` scope reads from a record that must already exist.

### Dataset experiments with an inline task

`dataset.startExperiment()` accepts `targetType` and `targetId` for a registered target, or an inline `task` function. For a registered memory-enabled agent, the runner creates a fresh thread per item by default. See [memory-enabled experiment targets](https://mastra.ai/docs/evals/experiments) for resource isolation and request context options.

To choose each item's thread explicitly through `agent.generate()`, use an inline `task` and store `{ threadId, resourceId }` in each item's `metadata`. The scorer pipeline still runs as normal.

```typescript
import { randomUUID } from 'node:crypto'
import { mastra } from '../index'
import { supportAgent } from '../agents/support-agent'
import { recallScorer } from '../scorers/recall-scorer'

const memory = await supportAgent.getMemory()
const resourceId = 'ci-user'

const items = [
  { input: 'Cats are mammals', groundTruth: 'mammals', thread: `ds-${randomUUID()}` },
  { input: 'Dogs are mammals too', groundTruth: 'mammals', thread: `ds-${randomUUID()}` },
]

for (const it of items) {
  await memory!.createThread({ threadId: it.thread, resourceId, title: it.input })
}

const dataset = await mastra.datasets.create({
  name: 'support-recall',
  description: 'Per-item memory via inline task + item metadata',
})

await dataset.addItems({
  items: items.map(it => ({
    input: it.input,
    groundTruth: it.groundTruth,
    metadata: { threadId: it.thread, resourceId },
  })),
})

const summary = await dataset.startExperiment({
  scorers: [recallScorer],
  task: async ({ input, metadata }) => {
    const { threadId, resourceId: rid } = (metadata ?? {}) as {
      threadId: string
      resourceId: string
    }
    const result = await supportAgent.generate(input as string, {
      memory: { thread: threadId, resource: rid },
    })
    return result.text
  },
})
```

The inline `task` receives the item's `metadata`, so each row can drive its own thread without changing the agent or any scorer. Visit [runEvals reference](https://mastra.ai/reference/evals/run-evals) and [Dataset reference](https://mastra.ai/reference/datasets/dataset) for full configuration.

### Related

- [Running scorers in CI](https://mastra.ai/docs/evals/running-in-ci)
- [Running experiments](https://mastra.ai/docs/evals/experiments)
- [Observational memory](https://mastra.ai/docs/memory/observational-memory)
- [runEvals API reference](https://mastra.ai/reference/evals/run-evals)

---

## Source: Datasets (`docs/evals/datasets`)

Canonical URL: `https://mastra.ai/docs/evals/datasets.md`

## Datasets

**Added in:** `@mastra/core@1.4.0`

Datasets are collections of test cases that you run experiments against to measure how well your agents and workflows perform. Each mutation creates a new version, so you can reproduce past experiments exactly. Pair datasets with [scorers](https://mastra.ai/docs/evals/overview) to track quality across prompts, models, or code changes.

**For AI agents:** Run `npx mastra api dataset create '{"name":"translation-pairs"}'` to create a dataset directly instead of opening Studio or writing a temporary script. The command requires a running Mastra server with a storage adapter that supports datasets; start the local server with `npx mastra dev`, or pass the reachable server's base URL with `--url`. Run `npx mastra api dataset create --schema` before adding different dataset fields. Install Mastra's skill with `npx skills add mastra-ai/skills --skill mastra` for complete API CLI discovery, targeting, schema, authentication, and error-handling guidance.

### Usage

#### Configure storage

Configure storage in your Mastra instance. Datasets require a storage adapter that provides the `datasets` domain:

```typescript
import { Mastra } from '@mastra/core'
import { LibSQLStore } from '@mastra/libsql'

export const mastra = new Mastra({
  storage: new LibSQLStore({
    id: 'my-store',
    url: 'file:./mastra.db',
  }),
})
```

#### Accessing the datasets API

All dataset operations are available through `mastra.datasets`:

```typescript
const datasets = mastra.datasets

// Create a dataset
const dataset = await datasets.create({ name: 'my-dataset' })

// Retrieve an existing dataset
const existing = await datasets.get({ id: 'dataset-id' })

// List all datasets
const { datasets: all } = await datasets.list()
```

Visit the [`DatasetsManager` reference](https://mastra.ai/reference/datasets/datasets-manager) for the full list of methods.

### Studio

You can also manage datasets in [Studio](https://mastra.ai/docs/studio/overview). After opening Studio, select **Datasets** from the sidebar to see all your available datasets or create a new one.

To get started, select **Create Dataset** and set a name, description, and optional schemas. After confirming, you'll see the dataset details page with two tabs: **Items** and [**Experiments**](https://mastra.ai/docs/evals/experiments).

In the **Items** view you can add, update, and delete items, and view version history. Select **Add Item** to insert a new item with JSON editors for input and ground truth. From this view you can also import items in bulk from a CSV or JSON file. When importing, map each column to the corresponding dataset field.

Select **Versions** to see the full history of changes to the dataset. After selecting **Compare Versions**, choose any two versions and select **Compare** to see a side-by-side diff of all items that were added, changed, or removed between those versions.

### Creating a dataset

Call [`create()`](https://mastra.ai/reference/datasets/create) with a name and optional description:

```typescript
import { mastra } from '../index'

const dataset = await mastra.datasets.create({
  name: 'translation-pairs',
  description: 'English to Spanish translation test cases',
})

console.log(dataset.id) // auto-generated UUID
```

#### Defining schemas

You can enforce the shape of `input` and `groundTruth` by passing a [Standard JSON Schema](https://standardschema.dev/json-schema) ([Zod](https://zod.dev/), [Valibot](https://valibot.dev/), [ArkType](https://arktype.io/), etc.) when creating the dataset:

```typescript
import { z } from 'zod'
import { mastra } from '../index'

const dataset = await mastra.datasets.create({
  name: 'translation-pairs',
  inputSchema: z.object({
    text: z.string(),
    sourceLang: z.string(),
    targetLang: z.string(),
  }),
  groundTruthSchema: z.object({
    translation: z.string(),
  }),
})
```

Items that don't match the schema are rejected at insert time.

### Adding items

Use [`addItem()`](https://mastra.ai/reference/datasets/addItem) for a single item or [`addItems()`](https://mastra.ai/reference/datasets/addItems) to insert in bulk:

```typescript
// Single item
await dataset.addItem({
  input: { text: 'Hello', sourceLang: 'en', targetLang: 'es' },
  groundTruth: { translation: 'Hola' },
})

// Bulk insert
await dataset.addItems({
  items: [
    {
      input: { text: 'Goodbye', sourceLang: 'en', targetLang: 'es' },
      groundTruth: { translation: 'Adiós' },
    },
    {
      input: { text: 'Thank you', sourceLang: 'en', targetLang: 'es' },
      groundTruth: { translation: 'Gracias' },
    },
  ],
})
```

#### Stored field values

In-memory, LibSQL, PostgreSQL, MySQL, MongoDB, and Spanner dataset storage preserve JSON `null` in `input`, `groundTruth`, and `expectedTrajectory`, along with empty strings, arrays, and objects. Omitted optional JSON fields remain absent when serialized. Dataset schemas still determine which values an item accepts.

Snapshot validation doesn't override database restrictions. MongoDB rejects object property names containing NUL (`\u0000`), even in valid JSON. A batch insert containing such keys fails without storing any items or advancing the dataset version.

For configuration updates, `null` clears schemas, tags, target type, target IDs, or scorer IDs. These adapters return cleared settings as `undefined`, while preserving empty arrays and objects. An item update with `scorerIds: null` removes its scorer override, whereas `scorerIds: []` disables scoring for that item. Omitted update fields leave existing values unchanged.

Retries with the same `externalId` retain the original item's representation. For backward compatibility, insert operations treat omitted and `null` payload fields as equivalent when comparing a retry with an existing item. For example, inserting an item without `groundTruth` and retrying with `groundTruth: null` returns the original item with no ground truth. Use an item update to store an explicit `null` instead.

Unset configuration now reads as `undefined` where some adapters previously returned `null`, so serialized responses omit those properties. Use nullish checks such as `value ?? fallback` rather than relying on an explicit `null` property. LibSQL also returns an omitted dataset description as `undefined`, matching its declared type.

Older LibSQL, PostgreSQL, MySQL, and Spanner writes stored optional JSON `null` values as SQL `NULL`. Those values remain indistinguishable from omitted fields. Older MongoDB writes stored omitted optional payload fields as BSON `null`. The storage fixes preserve new writes but don't reconstruct previously lost distinctions.

### Validate snapshot artifacts

Use `createDatasetSnapshot()` and `parseDatasetSnapshot()` from `@mastra/core/datasets` to create and validate a versioned JSON artifact. These are pure format utilities: they don't export from storage, import a dataset, allocate portable identities, or change Studio's JSON importer.

```typescript
import { createDatasetSnapshot, parseDatasetSnapshot } from '@mastra/core/datasets'

const snapshot = createDatasetSnapshot({
  formatVersion: 1,
  datasetIdentity: '00000000-0000-4000-8000-000000000001',
  configuration: { name: 'translation-pairs' },
  items: [
    {
      itemIdentity: '00000000-0000-4000-8000-000000000002',
      createdAt: '2026-09-01T09:00:00.123Z',
      updatedAt: '2026-09-10T10:00:00.456Z',
      payload: { input: 'Hello', groundTruth: 'Hola', scorerIds: [] },
    },
  ],
  provenance: {
    exportedAt: '2026-09-11T12:00:00Z',
    sourceDatasetId: 'dev-translations',
    itemVersion: 1,
    configurationBasis: 'export-time',
  },
})

const parsed = parseDatasetSnapshot(JSON.stringify(snapshot))
console.log(parsed.digest === snapshot.digest) // true
```

The artifact includes configuration, complete authored item payloads, portable UUIDs, and provenance. Supply stable lowercase UUIDs rather than generating new identities on every serialization. Authored `externalId` values are separate from portable identity and remain unchanged. Absent, `null`, and empty overrides remain distinct. Omit optional properties rather than assigning `undefined`. Dataset descriptions also preserve absent, `null`, and string values.

Each item requires `createdAt` and `updatedAt` as UTC ISO 8601 strings with millisecond precision, matching `Date.toISOString()` for four-digit years. Both timestamps are included in the integrity digest. They represent the item's actual dates, not transfer provenance: an importer must preserve them as the destination item's `createdAt` and `updatedAt`, rather than replacing them with import time. An importer records transfer time in a separate receipt, while later edits in the destination update `updatedAt` normally. Implementing storage import remains outside the scope of these format helpers.

This preservation applies to the supplied artifact content. Storage adapters may already have normalized values before capture. Format validation neither recovers those distinctions nor guarantees that ordinary dataset CRUD operations can restore them. PostgreSQL JSONB, for example, rejects strings containing the NUL character (`\u0000`) even though they're valid in an artifact. Validate destination storage restrictions before writing artifact contents.

Both helpers throw a Zod validation error for invalid content or size options. `datasetSnapshotContentSchema.safeParse()` validates unsigned content and identity uniqueness, while `datasetSnapshotSchema.safeParse()` additionally checks the digest. These schemas don't enforce a byte limit. Use `parseDatasetSnapshot()` for untrusted text to enforce a size budget before parsing and reject duplicate JSON property names.

The helpers default to a 4 MiB UTF-8 budget (`DATASET_SNAPSHOT_DEFAULT_MAX_BYTES`). Pass `{ maxBytes }` as the second argument to either helper to raise or lower it. The value must be a positive safe integer. This is an operational limit, not part of the v1 format or digest. For example, parse the snapshot above with an 8 MiB budget:

```typescript
const parsedWithLargerBudget = parseDatasetSnapshot(JSON.stringify(snapshot), {
  maxBytes: 8 * 1024 * 1024,
})
```

`createDatasetSnapshot()` measures the complete artifact's compact `JSON.stringify()` output, including the digest. `parseDatasetSnapshot()` measures the supplied text, including whitespace. Pretty-printing can exceed a budget that accepts the compact artifact. Neither helper truncates data. During creation, validation, cloning, and hashing happen before the byte-size check. Because shared references can expand during JSON serialization, the budget limits output size without bounding CPU time or peak memory. When adding a transport, configure HTTP request-body limits separately from this budget.

Artifacts have a maximum nesting depth of 100, measured from the envelope root. They reject unknown structural fields, duplicate item identities or non-null `externalId` values, non-JSON values, and invalid Unicode. Programmatic content must use plain objects and standard arrays, not class instances or array subclasses. Arbitrary JSON inside authored payloads remains intact, including trajectory expectations. Dataset schemas are preserved as JSON objects, but these utilities don't compile them or validate items against them. Destination authorization, reference resolution, and storage support also require separate preflight checks.

The digest is a lowercase hexadecimal SHA-256 hash of the RFC 8785 canonical JSON representation of the envelope without `digest`. Items are sorted by portable identity for hashing, while authored array order is preserved. Provenance is covered, so a new capture time changes the digest. A matching digest verifies integrity but doesn't establish authorship or approval. Review sensitive data before creating an artifact, as the utilities don't redact it.

### Updating, deleting, and purging items

[`updateItem()`](https://mastra.ai/reference/datasets/updateItem), [`deleteItem()`](https://mastra.ai/reference/datasets/deleteItem), and [`deleteItems()`](https://mastra.ai/reference/datasets/deleteItems) create new dataset versions as they modify or remove items:

```typescript
await dataset.updateItem({
  itemId: 'item-abc-123',
  groundTruth: { translation: '¡Hola!' },
})

await dataset.deleteItem({ itemId: 'item-abc-123' })

await dataset.deleteItems({ itemIds: ['item-1', 'item-2'] })
```

Deleting an item hides it from the current dataset version but retains its content in historical rows and the deletion tombstone. Use [`purgeItem()`](https://mastra.ai/reference/datasets/purgeItem) to redact the item's stored content across its existing history:

```typescript
await dataset.purgeItem({ itemId: 'item-abc-123' })
```

Purging replaces content in every historical row and deletion tombstone with redacted values, and scrubs linked experiment-result payloads, tags, and comments. Later experiment-result submissions for the item are also stored with redacted content.

Purge serializes or conflicts with concurrent dataset item writers without guaranteeing which operation completes first. If a mutating `updateItem()` call loses the race, it re-reads the purge marker and rejects with `DATASET_ITEM_PURGED`. `deleteItem()` remains idempotent, and any deletion tombstone created during the race stays redacted.

Normal item mutations use Slowly Changing Dimension Type 2 (SCD-2) versioning. Permanent purge intentionally overrides historical immutability for erasure while preserving item identity and the dataset version timeline. It doesn't create a dataset version and can't be undone. Experiment counters and review status are also preserved. Avoid storing sensitive data in `externalId`, which remains unchanged as the item's identity key.

MongoDB storage requires a replica set or sharded deployment with transaction support for this operation. Purging fails before changing data when MongoDB transactions aren't available.

### Listing and searching items

[`listItems()`](https://mastra.ai/reference/datasets/listItems) supports pagination and case-insensitive substring search:

```typescript
// Paginated list
const { items, pagination } = await dataset.listItems({
  page: 0,
  perPage: 50,
})

// Substring search
const { items: matches } = await dataset.listItems({
  search: 'Hello',
})

// Search and pagination can be combined with a specific version
const { items: v2Matches } = await dataset.listItems({
  version: 2,
  search: 'Hello',
  page: 0,
  perPage: 50,
})
```

Calling `listItems({ version })` without `search`, `page`, or `perPage` returns a bare `DatasetItem[]`. This form is deprecated. Pass `page` and `perPage` to always receive the paginated shape.

### Versioning

Adding, updating, or deleting dataset items bumps the dataset version. Purging an item's stored content with [`purgeItem()`](https://mastra.ai/reference/datasets/purgeItem) doesn't create a new version. This lets you pin experiments to a specific snapshot of the data while erasing sensitive content without changing the version history.

#### Listing versions

Use [`listVersions()`](https://mastra.ai/reference/datasets/listVersions) to see the paginated history of versions:

```typescript
const { versions, pagination } = await dataset.listVersions()

for (const v of versions) {
  console.log(`Version ${v.version}  -  created ${v.createdAt}`)
}
```

#### Viewing item history

See how a specific item changed across versions by calling [`getItemHistory()`](https://mastra.ai/reference/datasets/getItemHistory) with the `itemId`:

```typescript
const history = await dataset.getItemHistory({ itemId: 'item-abc-123' })

for (const row of history) {
  console.log(`Version ${row.datasetVersion}`, row.input, row.groundTruth)
}
```

#### Pinning to a version

Fetch the exact items that existed at a past version:

```typescript
const { items } = await dataset.listItems({ version: 2, page: 0, perPage: 100 })
```

You can also pin experiments to a version, see [running experiments](https://mastra.ai/docs/evals/experiments). Visit the [`Dataset` reference](https://mastra.ai/reference/datasets/dataset) for the full list of methods and parameters.

### Related

- [Experiments](https://mastra.ai/docs/evals/experiments)
- [Scorers overview](https://mastra.ai/docs/evals/overview)
- [DatasetsManager reference](https://mastra.ai/reference/datasets/datasets-manager)
- [Dataset reference](https://mastra.ai/reference/datasets/dataset)
- 📹 [Mastra evals, datasets, and experiments workshop](https://www.youtube.com/watch?v=Vla5LfmOOrM)

---

## Source: Experiments (`docs/evals/experiments`)

Canonical URL: `https://mastra.ai/docs/evals/experiments.md`

## Experiments

**Added in:** `@mastra/core@1.4.0`

An experiment runs every item in a dataset through a target (an agent, a workflow, or a scorer) and then optionally scores the outputs. Use a scorer as the target when you want to evaluate an LLM judge itself. By default, results are persisted to storage so you can compare runs across different prompts, models, or code changes.

**For AI agents:** Run `npx mastra api experiment run dataset_123 '{"name":"translation-baseline"}'` to start an experiment directly without opening Studio or writing a temporary script. Replace the sample ID with one returned by `npx mastra api dataset list`. This command needs a running Mastra server that has dataset storage and registered experiment targets. Start a local server with `npx mastra dev`, or use `--url` to pass the base URL of a reachable server. Before constructing different input, run `npx mastra api experiment run --schema`. Get user approval before starting an experiment because it can make model calls. Install Mastra's skill with `npx skills add mastra-ai/skills --skill mastra` for complete guidance on API CLI discovery and targeting, plus schema, authentication, and error handling.

### Basic experiment

Call [`startExperiment()`](https://mastra.ai/reference/datasets/startExperiment) with a target and scorers:

```typescript
import { mastra } from '../index'

const dataset = await mastra.datasets.get({ id: 'translation-dataset-id' })

const summary = await dataset.startExperiment({
  name: 'gpt-5.1-baseline',
  targetType: 'agent',
  targetId: 'translation-agent',
  scorers: ['accuracy', 'fluency'],
})

console.log(summary.status) // 'completed' | 'failed'
console.log(summary.succeededCount) // number of items that ran successfully
console.log(summary.failedCount) // number of items that failed
```

`startExperiment()` blocks until all items finish. For fire-and-forget execution, see [async experiments](#async-experiments).

### Run experiments in Studio

You can also run experiments in [Studio](https://mastra.ai/docs/studio/overview). After you've added a dataset item, open it and select **Run Experiment** and configure the target, scorers, and options.

To configure scorers for one item, edit the item and enable **Override dataset scorers**. Select one or more scorers, or leave the selection empty to run no scorers for that item.

After running an experiment, the **Experiments** tab shows all runs for that dataset (with status, counts, and timestamps). Select an experiment to see per-item results, scores, and execution traces.

In the **Experiments** tab, select **Compare** and choose two or more experiments to compare their scores and results side by side.

### Delete experiments

In Studio, open the global **Experiments** list and select **Delete experiment** on a row, or open the experiment and select **Delete Experiment**. The global list also lets you delete experiments orphaned by dataset deletion, which no longer have a dataset details page.

Deleting an experiment permanently removes its result records, plus the observability traces it produced and their associated spans, scores, feedback, metrics, and logs. A storage adapter without trace deletion support leaves the traces in place, logs a warning, and still deletes the experiment with its result records.

You can also delete experiments with the [Core API](https://mastra.ai/reference/datasets/deleteExperiment) or [Client SDK](https://mastra.ai/reference/client-js/datasets). The same operation is available through the [server routes](https://mastra.ai/reference/server/routes).

### Experiment targets

Use `targetType` and `targetId` to select an agent, workflow, or scorer registered on your Mastra instance. The target processes each dataset item. The experiment's `scorers` evaluate the target's output afterward.

For custom execution, pass an inline `task` function instead. See [dataset experiments with an inline task](https://mastra.ai/docs/evals/evals-with-memory) for an example that controls each item's memory thread.

#### Registered agent

Point to an agent registered on your Mastra instance:

```typescript
const summary = await dataset.startExperiment({
  name: 'agent-v2-eval',
  targetType: 'agent',
  targetId: 'translation-agent',
  scorers: ['accuracy'],
})
```

Each item's `input` is passed directly to the agent. Use a supported message format, such as a prompt string, a message object, or an array of messages. See the [`agent.generate()` reference](https://mastra.ai/reference/agents/generate) for accepted inputs.

##### Memory-enabled agents

When the target agent has its own memory, the experiment runner injects a fresh memory thread for each item and retry. Without a resource id in the request context, each thread gets an isolated, experiment-owned resource.

To run against an existing resource, set `MASTRA_RESOURCE_ID_KEY` in the experiment's `requestContext` or in an item's `requestContext`. Item values override experiment values. The runner still creates a fresh thread for each item and retry, but all threads using the same resource id share that resource's memory.

Injected threads are tagged so you can map them back to the run: thread metadata carries the `experimentId` and the dataset item's id as `experimentItemId`. No thread title is generated for them.

When items share a resource, resource-scoped memory features can read and write the same state:

- Resource-scoped working memory updates persist to the resource and can affect other items. Items run concurrently by default, so don't rely on an execution order.
- Resource-scoped semantic recall can surface the resource's prior conversations to the experiment, and experiment transcripts become recallable in that resource's later conversations.

Use this approach to evaluate an agent against a real user's accumulated context. To keep experiment runs from touching real user state, use a dedicated evaluation resource id instead.

Thread injection is skipped in the following cases:

- If the request context sets `MASTRA_THREAD_ID_KEY`, the runner uses that thread as-is. Items and retries using the same thread id share a conversation.
- If the agent has no memory, or the request context explicitly sets the resource id to an empty string or `null`, the runner skips thread injection.

#### Registered workflow

Point to a workflow registered on your Mastra instance:

```typescript
const summary = await dataset.startExperiment({
  name: 'workflow-eval',
  targetType: 'workflow',
  targetId: 'translation-workflow',
  scorers: ['accuracy'],
})
```

The workflow receives each item's `input` as `inputData` in `run.start()`. Structure the input to match the workflow's input schema.

#### Registered scorer

Use a scorer as the target to evaluate the judge itself. The runner calls `scorer.run(item.input)`, so the dataset item's `input` must contain the full payload the scorer expects.

This example assumes a registered `accuracy` scorer that accepts string `input`, `output`, and `groundTruth` fields. Adapt those fields to your scorer's expected shape:

```typescript
await dataset.addItem({
  input: {
    input: 'What is the capital of France?',
    output: 'Paris',
    groundTruth: 'Paris',
  },
  groundTruth: { score: 1 },
})

const summary = await dataset.startExperiment({
  name: 'judge-accuracy-eval',
  targetType: 'scorer',
  targetId: 'accuracy',
})
```

The two `groundTruth` fields serve different purposes:

- `input.groundTruth` is the reference answer passed to the judge: `'Paris'`.
- The top-level `groundTruth` is the expected result from the judge: `{ score: 1 }`. It isn't passed to the target scorer.

The target's output contains its `score` and `reason`. To evaluate that output against the top-level ground truth, add another scorer through the experiment's `scorers` option. Without an additional scorer, the experiment records the judge's output but doesn't score its agreement with the expected result.

### Scoring results

Scorers automatically run after each item's target execution. Pass scorer instances or registered scorer IDs:

**Scorer IDs**:

```typescript
// Reference scorers registered on the Mastra instance
const summary = await dataset.startExperiment({
  name: 'with-registered-scorers',
  targetType: 'agent',
  targetId: 'translation-agent',
  scorers: ['accuracy', 'fluency'],
})
```

**Scorer instances**:

```typescript
import { createAnswerRelevancyScorer } from '@mastra/evals/scorers/prebuilt'

const relevancy = createAnswerRelevancyScorer({ model: 'openai/gpt-5-mini' })

const summary = await dataset.startExperiment({
  name: 'with-scorer-instances',
  targetType: 'agent',
  targetId: 'translation-agent',
  scorers: [relevancy],
})
```

Each item's results include per-scorer scores:

```typescript
for (const item of summary.results) {
  console.log(item.itemId, item.output)
  for (const score of item.scores) {
    console.log(`  ${score.scorerName}: ${score.score}  -  ${score.reason}`)
  }
}
```

Visit the [Scorers overview](https://mastra.ai/docs/evals/overview) for details on available and custom scorers.

### Select scorers per item

Add registered scorer IDs to a dataset item to override the scorers attached to its dataset:

```typescript
await dataset.addItem({
  input: 'Translate "hello" to French.',
  scorerIds: ['accuracy', 'fluency'],
})
```

An experiment uses exactly one scorer source for each item, in this order:

1. The experiment's `scorers` option, when provided
2. The item's `scorerIds` field, when provided
3. The dataset's `scorerIds` field
4. No scorers

Mastra doesn't merge these sources. An explicit empty array at the run or item level selects no scorers and prevents fallback to the next source. An empty categorized run-level configuration has the same effect. Duplicate item or dataset IDs run once, in the order of their first occurrence.

The following updates switch between an explicit empty override and dataset inheritance:

```typescript
// Run no scorers for this item
await dataset.updateItem({
  itemId: 'translation-item-id',
  scorerIds: [],
})

// Remove the item override and inherit the dataset's scorers
await dataset.updateItem({
  itemId: 'translation-item-id',
  scorerIds: null,
})
```

Omitting `scorerIds` from an update preserves its current value. Each item version stores its scorer ID list, including an empty list. Scorer definitions aren't copied into the item version and continue to use their existing registry or Editor behavior.

Mastra resolves each item's scorer IDs before running its target. It checks registered scorers first, then asks the Editor to hydrate a stored scorer. A stale item-level ID produces the `EXPERIMENT_ITEM_SCORER_NOT_FOUND` code for that item. Mastra skips target execution without retrying that item, while the rest of the experiment continues.

A missing ID in the selected run-level or dataset-level source fails experiment setup. Mastra doesn't resolve IDs from lower-priority sources that the precedence rules ignore.

Workflow step scorers are available only through a run-level categorized `scorers` configuration. Item-level IDs apply to the flat agent, workflow, and trajectory scorer dispatch.

### Control persistence per run

Use `persistence` to skip storage writes for a specific run. Experiment records and score records can be disabled independently:

```typescript
const summary = await dataset.startExperiment({
  targetType: 'agent',
  targetId: 'translation-agent',
  scorers: ['accuracy'],
  persistence: {
    experiments: 'none',
    scores: 'none',
  },
})
```

The target and scorers still run, and `startExperiment()` still returns the item results and scores in `summary`. The settings are independent. For example, set only `scores: 'none'` to persist the experiment and its item results without creating score records.

Omitted settings default to `'default'`, which preserves the standard storage behavior. This policy only controls experiment and score records created by the run. It doesn't disable storage used by the target, such as agent memory, vectors, observability, or custom tool storage.

When `startExperimentAsync()` runs with `experiments: 'none'`, it doesn't persist an experiment record, progress updates, or item results. Score persistence remains controlled separately by `persistence.scores`. Without an experiment event observer, the run is fire-and-forget, and the experiment API can't report whether it completed or failed.

Use synchronous `startExperiment()` when the caller needs the returned summary. An experiment event observer can receive lifecycle events and the terminal summary.

### Observe experiment events

Use `onEvent` to receive versioned, JSON-safe lifecycle events while an experiment runs. This works with `startExperiment()`, `startExperimentAsync()`, and `runExperiment()`.

```typescript
import type { ExperimentEvent } from '@mastra/core/datasets'

const events: ExperimentEvent[] = []

await dataset.startExperimentAsync({
  task: async ({ input }) => processItem(input),
  persistence: { experiments: 'none' },
  onEvent: async event => {
    events.push(event)
    await publishEvent(event)
  },
})
```

The observer receives these event types:

- `experiment.run.started`: Identifies the run, target, resolved dataset version, and item count.
- `experiment.item.completed`: Reports a committed item result after scoring, including scores, errors, retry count, tool mock details, and stable item identity.
- `experiment.run.finished`: Reports the terminal outcome and summary counters.

Mastra awaits each observer call before delivering the next event. This serialized delivery applies backpressure and ensures event `sequence` values match delivery order, while item execution can remain concurrent.

If the observer throws or rejects, Mastra aborts the remaining run and rejects `runExperiment()` with a `MastraError` whose `id` is `EXPERIMENT_EVENT_OBSERVER_FAILED`. It doesn't send a terminal event through the failed observer. For `startExperimentAsync()`, the method has already returned when a detached observer fails, so handle delivery failures inside the observer when the caller needs direct error reporting.

The `experiment.run.finished` event is awaited before Mastra persists the final experiment status. Treat the event as the authoritative terminal signal when experiment persistence is disabled, but don't use it as a read-after-write signal for storage.

The exported event types are `ExperimentEvent`, `ExperimentRunStartedEvent`, `ExperimentItemCompletedEvent`, and `ExperimentRunFinishedEvent`. Use the discriminated `type` field to narrow an event before reading event-specific properties.

### Lifecycle hooks

Use lifecycle hooks to prepare state before a target runs and clean it up afterward. This is useful when an item can't be evaluated against an empty environment. A run might need a fixture file copied into the agent's workspace, or a sandbox provisioned before the agent can touch it.

Hooks run at two levels. `beforeAll` and `afterAll` run once per experiment, and `beforeEach` and `afterEach` run once per item:

```typescript
const summary = await dataset.startExperiment({
  targetType: 'agent',
  targetId: 'document-agent',
  scorers: ['accuracy'],
  beforeAll: async ({ experimentId }) => {
    await createWorkspace(experimentId)
  },
  beforeEach: async ({ item }) => {
    await copyFixture(item.metadata?.fixture)
  },
  afterEach: async ({ item, result }) => {
    await clearWorkspaceFiles(item.id)
  },
  afterAll: async ({ summary }) => {
    await deleteWorkspace(summary.experimentId)
  },
})
```

Every hook can be async. Each one receives the `experimentId`, the `mastra` instance, and the run-level `signal`, so long-running setup can be cancelled along with the experiment. The per-item hooks also receive `item`. The teardown hooks receive the result they follow: `afterEach` receives the item's `result` including scores, and `afterAll` receives the `summary` that's about to be returned.

The item passed to hooks exposes `id`, `input`, `groundTruth`, and `metadata`. Fields that control execution, such as tool mocks and scorer selection, aren't exposed, so a hook can't change how the item runs.

#### Hook failures

Each hook has a different consequence when it throws, based on how much of the run depends on it:

| Hook         | On failure                                                                       |
| ------------ | -------------------------------------------------------------------------------- |
| `beforeAll`  | Fails the experiment. No items run.                                              |
| `beforeEach` | Fails that item with `EXPERIMENT_ITEM_BEFORE_EACH_FAILED`. Other items continue. |
| `afterEach`  | Logged. The item's recorded outcome doesn't change.                              |
| `afterAll`   | Logged. The returned summary doesn't change.                                     |

When `beforeAll` fails, the experiment is marked failed and the `experiment.run.finished` event is still emitted before the error propagates.

When `beforeEach` fails, the target and its scorers are skipped for that item, since the item's preconditions were never met. `afterEach` is also skipped for that item, on the basis that setup which didn't finish owns its own cleanup.

Teardown failures are logged rather than propagated. By the time `afterEach` runs, the target has already produced a real result, and discarding it because cleanup was untidy would lose the data the experiment was run to collect.

`afterAll` runs on every exit path, including when the experiment fails, when `beforeAll` fails, and when an [event observer](#observe-experiment-events) fails, so teardown isn't skipped when something goes wrong. It runs at most once per experiment.

### Tool mocks

When an experiment runs an agent that calls side-effecting tools, attach static tool mocks to individual dataset items to make the run deterministic. During the experiment, a mocked tool returns its declared output instead of executing. Tools without a mock on the item run live by default.

Mocks are stored and versioned with the dataset item. Each mock specifies the tool name and expected arguments, along with the output to return:

```typescript
await dataset.addItem({
  input: 'What is the weather in Seattle?',
  toolMocks: [
    {
      toolName: 'getWeather',
      args: { city: 'Seattle' },
      output: { temperature: 60, conditions: 'rainy' },
    },
  ],
})
```

Tool mocks are supported for `agent` targets only.

#### Block undeclared tools

Set `unmockedToolPolicy: 'deny'` on an experiment to block every tool call that doesn't have a mock. This is useful when a live call could cause side effects:

```typescript
const summary = await dataset.startExperiment({
  targetType: 'agent',
  targetId: 'weather-agent',
  unmockedToolPolicy: 'deny',
})
```

The default policy is `'allow'`. You can override the experiment policy on an individual stored or inline item:

```typescript
await dataset.addItem({
  input: 'What is the weather in Seattle?',
  unmockedToolPolicy: 'allow',
})
```

The item value takes precedence over the experiment value. A denied call fails with `TOOL_MOCK_NOT_DECLARED` before the tool executes. The failure isn't retried or added to `liveCalls`.

#### Matching and consumption

Arguments are matched strictly: object key order is ignored, but array order matters. Values aren't coerced to other types. A mock is served only when the agent calls the tool with arguments that deep-equal the mock's `args`.

When an item declares several mocks for the same tool and arguments, they're consumed in order, the first call gets the first mock, the next call gets the second, and so on. Ordering is tracked per `(toolName, args)` group and is independent across different arguments.

#### Matching mode

By default each mock matches strictly on its `args`. Set `matchArgs: 'ignore'` to match on the tool name only, the mock's `args` aren't compared and the next unconsumed mock for that tool is served regardless of how the agent called it:

```typescript
const subAgentMock = {
  toolName: 'agent-balanceAgent',
  args: { prompt: 'look up the balance for YJ' },
  output: { text: "YJ's balance is $100." },
  matchArgs: 'ignore',
}
```

This is useful when a tool's arguments are noisy or generated by the model. The most common case is mocking a **sub-agent's response**. The parent sees a delegated sub-agent as an `agent-<name>` tool, and its arguments include an LLM-authored `prompt` plus runtime-injected fields. Mocking `agent-<name>` returns the canned response in place of running the sub-agent and its inner tools. When you create a mock from a trace, sub-agent delegation calls are derived with `matchArgs: 'ignore'` automatically. You can change it to `'strict'` to pin the exact arguments.

#### Failures

A tool call fails the item when it violates the mock configuration:

- `TOOL_MOCK_MISMATCH`: the tool was called with arguments that no mock matches.
- `TOOL_MOCK_EXHAUSTED`: every matching mock has already been consumed.
- `TOOL_MOCK_NOT_DECLARED`: the tool has no mock and the effective `unmockedToolPolicy` is `'deny'`.

On any of these failures, the agent run is aborted immediately, so the model can't go on to call any further tools, including unmocked, side-effecting tools that would otherwise run live. These failures are deterministic, so they're not retried. Mocks that are declared but never used don't fail the item, they're reported as unconsumed.

The agent's tools execute sequentially while mock interception is active, so repeated `(toolName, args)` mocks are consumed in the provider's call order. Interception is active when the item declares mocks or its effective `unmockedToolPolicy` is `'deny'`.

#### Diagnostics

Each item result includes a `toolMockReport` listing which mocks were used and which tool calls ran without a mock:

```typescript
for (const item of summary.results) {
  const report = item.toolMockReport
  if (!report) continue

  console.log(report.served) // mocks matched and returned
  console.log(report.unconsumed) // mocks declared but never used
  console.log(report.liveCalls) // undeclared tools allowed to run live
  console.log(report.failure) // the first deterministic mock failure, if any
}
```

In [Studio](https://mastra.ai/docs/studio/overview), edit a dataset item to author tool mocks as a JSON array, and open an experiment result to see the same report.

#### Limitations

- **No tool span for mocked calls.** A mocked call returns its output before the tool executes, so it doesn't create a tool span. Trajectory scorers backed by stored traces may therefore not see mocked tool calls. Trajectory extraction that falls back to the agent's message output still sees them, so trajectory scoring can differ depending on your observability configuration.
- **Storage support.** The LibSQL, PostgreSQL, MongoDB, and Spanner adapters persist tool mocks and tool mock reports, while the MySQL adapter rejects writes that carry either one. All dataset storage adapters persist `unmockedToolPolicy`.

### Async experiments

`startExperiment()` blocks until every item completes. For long-running datasets, use [`startExperimentAsync()`](https://mastra.ai/reference/datasets/startExperimentAsync) to start the experiment in the background:

```typescript
const { experimentId, status } = await dataset.startExperimentAsync({
  name: 'large-dataset-run',
  targetType: 'agent',
  targetId: 'translation-agent',
  scorers: ['accuracy'],
})

console.log(experimentId) // UUID
console.log(status) // 'pending'
```

Poll for completion using [`getExperiment()`](https://mastra.ai/reference/datasets/getExperiment):

```typescript
let experiment = await dataset.getExperiment({ experimentId })
if (!experiment) throw new Error('Experiment not found')

while (experiment.status === 'pending' || experiment.status === 'running') {
  await new Promise(resolve => setTimeout(resolve, 5000))
  experiment = await dataset.getExperiment({ experimentId })
  if (!experiment) throw new Error('Experiment not found')
}

console.log(experiment.status) // 'completed' | 'failed'
```

### Caller-driven experiments

`startExperiment()` puts Mastra in charge of the whole run. If a durable orchestrator (for example Temporal, Airflow, or a custom worker fleet) owns the loop instead, create the experiment first and drive it yourself in one of these shapes:

- **Caller drives the loop, Mastra runs each item.** Create the experiment with a target, then call [`runExperimentItem()`](https://mastra.ai/reference/datasets/runExperimentItem) once per item. Mastra executes the target and runs the scorers, then persists the result.
- **Caller runs everything.** Create the experiment without a target, execute and score items on your own infrastructure, and ingest each result with [`submitExperimentResult()`](https://mastra.ai/reference/datasets/submitExperimentResult).

Both shapes finish with [`finalizeExperiment()`](https://mastra.ai/reference/datasets/finalizeExperiment), and both write to the same tables as native runs, so Studio views, comparisons, and review summaries work unchanged.

#### Run items server-side

Create the experiment with [`createExperiment()`](https://mastra.ai/reference/datasets/createExperiment), passing the target and scorers. Pass your own `id` (for example a workflow run id) to make creation idempotent: retrying the call with the same id returns the existing experiment instead of failing.

```typescript
const dataset = await mastra.datasets.get({ id: 'translation-dataset-id' })

const { experimentId, totalItems, datasetVersion } = await dataset.createExperiment({
  id: 'temporal-wf-run-42', // optional: reuse your workflow run id for idempotent creates
  targetType: 'agent',
  targetId: 'translation-agent',
  scorers: ['accuracy'],
})
```

Then run each item from your orchestrator. Mastra resolves the item at the pinned dataset version and executes the target with the resolved scorers. The result upserts are keyed by `(experimentId, itemId, attempt)`. A retried activity converges on a single row:

```typescript
const { result, scores } = await dataset.runExperimentItem({
  experimentId,
  itemId: 'item-1',
})
```

Retries and timeouts belong to your orchestrator: each `runExperimentItem` call executes the item exactly once. Scorers resolve with the same precedence as native runs: experiment `scorers` win over item `scorerIds`, which win over dataset `scorerIds`.

#### Ingest external results

If your workers execute and score items themselves, create the experiment without a target:

```typescript
const { experimentId } = await dataset.createExperiment({
  id: 'temporal-wf-run-42',
  name: 'external-eval',
})
```

Submit one result per item with [`submitExperimentResult()`](https://mastra.ai/reference/datasets/submitExperimentResult). Submissions are upserts keyed by `(experimentId, itemId, attempt)`. A retried worker converges on a single row instead of duplicating results:

```typescript
await dataset.submitExperimentResult({
  experimentId,
  itemId: 'item-1',
  output: { translation: 'Hola' },
  scores: [{ scorerId: 'accuracy', score: 0.92, reason: 'Faithful translation' }],
})
```

`input` and `groundTruth` default to the dataset item's values at the experiment's pinned dataset version. Inline `scores` are persisted to the scores store under the experiment, so they show up in comparisons alongside native scorer runs. Experiments created with a target reject `submitExperimentResult` so two writers can't race on the same rows.

#### Finalize

When all items are done, call [`finalizeExperiment()`](https://mastra.ai/reference/datasets/finalizeExperiment). Mastra computes `succeededCount`, `failedCount`, and `skippedCount` from the persisted rows, so your workers never track completion bookkeeping. Finalization is idempotent. Calling it again returns the stored record:

```typescript
const experiment = await dataset.finalizeExperiment({ experimentId })

console.log(experiment.status) // 'completed'
console.log(experiment.succeededCount) // items with at least one attempt that didn't error
console.log(experiment.failedCount) // items where every attempt errored
console.log(experiment.skippedCount) // items never submitted
```

The same lifecycle is available over HTTP (`POST /api/datasets/:datasetId/experiments` with `start: false`, `POST .../experiments/:experimentId/items/:itemId/run`, `POST .../experiments/:experimentId/results`, `POST .../experiments/:experimentId/finalize`, see [Server routes](https://mastra.ai/reference/server/routes)) and through `@mastra/client-js` (see the [Datasets API](https://mastra.ai/reference/client-js/datasets)).

#### Retry and idempotency contract

Caller-driven calls are designed to be retried aggressively (for example by a Temporal retry policy). The exact guarantees:

- **Create is idempotent on `id`.** Calling `createExperiment` again with the same caller-supplied `id` returns the existing experiment. Reusing an `id` that belongs to another dataset or an experiment with a different target fails with `EXPERIMENT_ID_CONFLICT` (HTTP `409`).
- **Results upsert on `(experimentId, itemId, attempt)`.** Re-submitting the same key updates the existing row, and the last write wins for all mutable fields. A retried worker never creates duplicates.
- **`attempt` separates deliberate trials from retries.** Retries of the same run should reuse the same `attempt` (default `0`) so they converge. To record repeated trials of an item as separate rows, submit with `attempt: 0`, `attempt: 1`, and so on.
- **The dataset version is pinned at creation.** Submissions are validated against the items visible at that version, so editing or deleting items afterward doesn't affect an in-flight experiment. Submitting an `itemId` that isn't visible at the pinned version fails with `404`.
- **Finalize is idempotent and terminal.** Finalizing an already-completed experiment returns the stored record without recomputing. After finalization, further submissions are rejected with `EXPERIMENT_ALREADY_FINALIZED` (HTTP `409`).
- **Counts are server-computed and per-item.** At finalize time Mastra rolls attempts up per item: `succeededCount` (at least one attempt without an error), `failedCount` (every attempt errored), `skippedCount` (never submitted). `succeededCount + failedCount + skippedCount === totalItems` always holds, and callers keep no completion bookkeeping. Attempt-level rows remain available via `listExperimentResults`.

### Configuration options

#### Concurrency

Control how many items run in parallel (default: 5):

```typescript
const summary = await dataset.startExperiment({
  targetType: 'agent',
  targetId: 'translation-agent',
  maxConcurrency: 10,
})
```

#### Timeouts and retries

Set a per-item timeout (in milliseconds) and retry count:

```typescript
const summary = await dataset.startExperiment({
  targetType: 'agent',
  targetId: 'translation-agent',
  itemTimeout: 30_000, // 30 seconds per item
  maxRetries: 2, // retry failed items up to 2 times
})
```

Retries use exponential backoff. Abort errors are never retried.

#### Aborting an experiment

Pass an `AbortSignal` to cancel a running experiment:

```typescript
const controller = new AbortController()

// Cancel after 60 seconds
setTimeout(() => controller.abort(), 60_000)

const summary = await dataset.startExperiment({
  targetType: 'agent',
  targetId: 'translation-agent',
  signal: controller.signal,
})
```

Remaining items are marked as skipped in the summary.

#### Pinning a dataset version

Run against a specific snapshot of the dataset:

```typescript
const summary = await dataset.startExperiment({
  targetType: 'agent',
  targetId: 'translation-agent',
  version: 3, // use items from dataset version 3
})
```

### Viewing results

#### Listing experiments

```typescript
const { experiments, pagination } = await dataset.listExperiments({
  page: 0,
  perPage: 10,
})

for (const exp of experiments) {
  console.log(`${exp.name}  -  ${exp.status} (${exp.succeededCount}/${exp.totalItems})`)
}
```

#### Experiment details

```typescript
const experiment = await dataset.getExperiment({
  experimentId: 'exp-abc-123',
})
if (!experiment) throw new Error('Experiment not found')

console.log(experiment.status)
console.log(experiment.startedAt)
console.log(experiment.completedAt)
```

> **📹 Watch:** Watch [Mastra datasets and experiments workflow](https://www.youtube.com/watch?v=R6pjAdGhxhQ) to see how datasets and experiments help improve reliability.

#### Item-level results

```typescript
const { results, pagination } = await dataset.listExperimentResults({
  experimentId: 'exp-abc-123',
  page: 0,
  perPage: 50,
})

for (const result of results) {
  console.log(result.itemId, result.output, result.error)
}
```

### Understanding the summary

`startExperiment()` returns an `ExperimentSummary` with counts and per-item results:

- `completedWithErrors` is `true` when the experiment finished but some items failed.
- Items cancelled via `signal` appear in `skippedCount`.

Visit the [`startExperiment` reference](https://mastra.ai/reference/datasets/startExperiment) for the full parameter and return type documentation.

### Related

- [Datasets](https://mastra.ai/docs/evals/datasets)
- [Scorers overview](https://mastra.ai/docs/evals/overview)
- [`startExperiment` reference](https://mastra.ai/reference/datasets/startExperiment)
- [`listExperimentResults` reference](https://mastra.ai/reference/datasets/listExperimentResults)
