import { z } from "zod";
import {
  callAgentCategoryOpenRouterChat,
  resolveModelForAgentCategory,
  streamAgentCategoryOpenRouterChat,
  type AgentOpenRouterCategory,
} from "@/lib/openrouter-agent-category-api";
import type {
  OpenRouterAppReasoning,
  OpenRouterAppResponseFormat,
  OpenRouterAppStreamDelta,
} from "@/lib/openrouter-app-api";
import { parseJsonStrict } from "@/lib/json-repair-utility";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";

export type PulseAgentDomain =
  | "aiseo"
  | "blog-generator"
  | "entity-sap"
  | "sitemap-optimizer"
  | "competitor-research"
  | "reporting"
  | "ppc-ads"
  | "social"
  | "video"
  | "wikipedia"
  | "emcp";

export type PulseAgentMetadata = {
  id: string;
  label: string;
  category: AgentOpenRouterCategory;
  domain: PulseAgentDomain;
  reason: string;
  useMasterInstructions?: boolean;
  useWordBlacklist?: boolean;
};

export type PulseAgentRunContext = {
  apiKey?: string;
  siteId?: string | null;
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  reasoning?: OpenRouterAppReasoning;
  onDelta?: (delta: OpenRouterAppStreamDelta) => void;
};

export type CreatePulseAgentConfig<TInput, TOutput> = PulseAgentMetadata & {
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: OpenRouterAppResponseFormat;
  buildSystemPrompt: (input: TInput, context: PulseAgentRunContext) => string;
  buildUserPrompt: (input: TInput, context: PulseAgentRunContext) => string;
  parseOutput?: (rawContent: string, input: TInput) => TOutput;
};

export type PulseAgent<TInput, TOutput> = PulseAgentMetadata & {
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  resolveModel: (siteId?: string | null) => string;
  run: (input: TInput, context?: PulseAgentRunContext) => Promise<TOutput>;
  stream: (
    input: TInput,
    context: PulseAgentRunContext & { onDelta: (delta: OpenRouterAppStreamDelta) => void },
  ) => Promise<TOutput>;
};

const runtimeRegisteredAgents = new Map<string, PulseAgentMetadata>();

export function getRuntimeRegisteredAgents(): PulseAgentMetadata[] {
  return [...runtimeRegisteredAgents.values()];
}

export function createPulseAgent<TInput, TOutput>(
  config: CreatePulseAgentConfig<TInput, TOutput>,
): PulseAgent<TInput, TOutput> {
  if (!config.id.trim()) {
    throw new Error("createPulseAgent requires a non-empty id.");
  }
  if (!config.reason.trim()) {
    throw new Error(`createPulseAgent("${config.id}") requires a non-empty reason.`);
  }

  const metadata: PulseAgentMetadata = {
    id: config.id.trim(),
    label: config.label.trim(),
    category: config.category,
    domain: config.domain,
    reason: config.reason.trim(),
    useMasterInstructions: config.useMasterInstructions,
    useWordBlacklist: config.useWordBlacklist,
  };
  runtimeRegisteredAgents.set(metadata.id, metadata);

  const decodeOutput = (rawContent: string, validatedInput: TInput): TOutput => {
    if (config.parseOutput) {
      return config.outputSchema.parse(config.parseOutput(rawContent, validatedInput));
    }
    if (config.outputSchema instanceof z.ZodString) {
      return config.outputSchema.parse(rawContent.trim());
    }
    const parsedJson = parseJsonStrict<unknown>(rawContent);
    return config.outputSchema.parse(parsedJson);
  };

  const defaultResponseFormat = (): OpenRouterAppResponseFormat | undefined => {
    if (config.responseFormat) return config.responseFormat;
    if (config.outputSchema instanceof z.ZodString) return undefined;
    return { type: "json_object" };
  };

  return {
    ...metadata,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    resolveModel: (siteId?: string | null) =>
      resolveModelForAgentCategory(config.category, siteId),
    async run(input: TInput, context: PulseAgentRunContext = {}): Promise<TOutput> {
      const validatedInput = config.inputSchema.parse(input);
      const system = config.buildSystemPrompt(validatedInput, context);
      const user = config.buildUserPrompt(validatedInput, context);
      const { content } = await callAgentCategoryOpenRouterChat({
        category: config.category,
        siteId: context.siteId,
        apiKey: context.apiKey,
        system,
        user,
        temperature: context.temperature ?? config.temperature,
        maxTokens: context.maxTokens ?? config.maxTokens,
        responseFormat: defaultResponseFormat(),
        reasoning: context.reasoning,
        useMasterInstructions: config.useMasterInstructions,
        useWordBlacklist: config.useWordBlacklist,
        signal: context.signal,
      });
      return decodeOutput(content, validatedInput);
    },
    async stream(
      input: TInput,
      context: PulseAgentRunContext & { onDelta: (delta: OpenRouterAppStreamDelta) => void },
    ): Promise<TOutput> {
      const validatedInput = config.inputSchema.parse(input);
      const system = config.buildSystemPrompt(validatedInput, context);
      const user = config.buildUserPrompt(validatedInput, context);
      const { content } = await streamAgentCategoryOpenRouterChat({
        category: config.category,
        siteId: context.siteId,
        apiKey: context.apiKey,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: context.temperature ?? config.temperature,
        maxTokens: context.maxTokens ?? config.maxTokens,
        responseFormat: defaultResponseFormat(),
        reasoning: context.reasoning,
        useMasterInstructions: config.useMasterInstructions,
        useWordBlacklist: config.useWordBlacklist,
        signal: context.signal,
        onDelta: context.onDelta,
      });
      return decodeOutput(content, validatedInput);
    },
  };
}

export type PulseStepArtifact = {
  name: string;
  content: string;
  mimeType: string;
};

export type PulseWorkflowStepProgress = {
  stepId: string;
  title: string;
  sectionIndex: number;
  totalSections: number;
  phase: "start" | "done" | "error";
  message?: string;
};

export type PulseWorkflowContext = PulseAgentRunContext & {
  onStepProgress?: (event: PulseWorkflowStepProgress) => void;
  onArtifact?: (file: PulseStepArtifact) => void;
};

export type PulseStep<TInput, TOutput> = {
  id: string;
  title: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  artifact?: (output: TOutput, input: TInput) => PulseStepArtifact | PulseStepArtifact[] | null;
  execute: (params: { inputData: TInput; context: PulseWorkflowContext }) => Promise<TOutput>;
};

export function createStep<TInput, TOutput>(
  step: PulseStep<TInput, TOutput>,
): PulseStep<TInput, TOutput> {
  if (!step.id.trim() || !step.title.trim()) {
    throw new Error("createStep requires non-empty id and title.");
  }
  return step;
}

type WorkflowNode =
  | { kind: "single"; step: PulseStep<any, any> }
  | { kind: "parallel"; steps: PulseStep<any, any>[] }
  | {
      kind: "branch";
      branches: Array<{
        condition: (input: any, context: PulseWorkflowContext) => boolean | Promise<boolean>;
        step: PulseStep<any, any>;
      }>;
    };

export type PulseWorkflow<TInput, TOutput> = {
  id: string;
  runKind?: BulkOptimizationState["runKind"];
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  getPipelineTitles: () => string[];
  run: (
    inputData: TInput,
    context?: PulseWorkflowContext,
  ) => Promise<{ output: TOutput; artifacts: PulseStepArtifact[] }>;
};

export class PulseWorkflowBuilder<TInitialInput, TCurrentOutput> {
  private readonly nodes: WorkflowNode[] = [];

  constructor(
    private readonly config: {
      id: string;
      runKind?: BulkOptimizationState["runKind"];
      inputSchema: z.ZodType<TInitialInput>;
      outputSchema: z.ZodType<any>;
    },
  ) {}

  then<TNextOutput>(
    step: PulseStep<TCurrentOutput, TNextOutput>,
  ): PulseWorkflowBuilder<TInitialInput, TNextOutput> {
    this.nodes.push({ kind: "single", step });
    return this as unknown as PulseWorkflowBuilder<TInitialInput, TNextOutput>;
  }

  parallel<TSteps extends readonly PulseStep<TCurrentOutput, any>[]>(
    steps: TSteps,
  ): PulseWorkflowBuilder<TInitialInput, Record<string, any>> {
    this.nodes.push({ kind: "parallel", steps: [...steps] });
    return this as unknown as PulseWorkflowBuilder<TInitialInput, Record<string, any>>;
  }

  branch<TBranchOutput>(
    branches: Array<{
      condition: (input: TCurrentOutput, context: PulseWorkflowContext) => boolean | Promise<boolean>;
      step: PulseStep<TCurrentOutput, TBranchOutput>;
    }>,
  ): PulseWorkflowBuilder<TInitialInput, TBranchOutput> {
    this.nodes.push({ kind: "branch", branches });
    return this as unknown as PulseWorkflowBuilder<TInitialInput, TBranchOutput>;
  }

  commit(): PulseWorkflow<TInitialInput, TCurrentOutput> {
    const nodes = [...this.nodes];
    const { id, runKind, inputSchema, outputSchema } = this.config;

    const getPipelineTitles = (): string[] => {
      const titles: string[] = [];
      for (const node of nodes) {
        if (node.kind === "single") {
          titles.push(node.step.title);
        } else if (node.kind === "parallel") {
          for (const s of node.steps) titles.push(s.title);
        } else if (node.kind === "branch") {
          for (const b of node.branches) titles.push(b.step.title);
        }
      }
      return titles;
    };

    return {
      id,
      runKind,
      inputSchema,
      outputSchema: outputSchema as z.ZodType<TCurrentOutput>,
      getPipelineTitles,
      async run(
        inputData: TInitialInput,
        context: PulseWorkflowContext = {},
      ): Promise<{ output: TCurrentOutput; artifacts: PulseStepArtifact[] }> {
        let current: any = inputSchema.parse(inputData);
        const artifacts: PulseStepArtifact[] = [];
        const allTitles = getPipelineTitles();
        const totalSections = allTitles.length;
        let sectionCursor = 0;

        const runOneStep = async (step: PulseStep<any, any>, stepInput: any, sectionIndex: number) => {
          context.onStepProgress?.({
            stepId: step.id,
            title: step.title,
            sectionIndex,
            totalSections,
            phase: "start",
          });
          try {
            const parsedIn = step.inputSchema.parse(stepInput);
            const rawOut = await step.execute({ inputData: parsedIn, context });
            const parsedOut = step.outputSchema.parse(rawOut);
            if (step.artifact) {
              const built = step.artifact(parsedOut, parsedIn);
              const list = Array.isArray(built) ? built : built ? [built] : [];
              for (const file of list) {
                artifacts.push(file);
                context.onArtifact?.(file);
              }
            }
            context.onStepProgress?.({
              stepId: step.id,
              title: step.title,
              sectionIndex,
              totalSections,
              phase: "done",
            });
            return parsedOut;
          } catch (err) {
            context.onStepProgress?.({
              stepId: step.id,
              title: step.title,
              sectionIndex,
              totalSections,
              phase: "error",
              message: err instanceof Error ? err.message : String(err),
            });
            throw err;
          }
        };

        for (const node of nodes) {
          if (node.kind === "single") {
            const idx = sectionCursor++;
            current = await runOneStep(node.step, current, idx);
          } else if (node.kind === "parallel") {
            const baseIdx = sectionCursor;
            sectionCursor += node.steps.length;
            const results = await Promise.all(
              node.steps.map(async (s, i) => [s.id, await runOneStep(s, current, baseIdx + i)] as const),
            );
            current = Object.fromEntries(results);
          } else if (node.kind === "branch") {
            let matched = false;
            for (const b of node.branches) {
              const idx = sectionCursor++;
              if (!matched && (await b.condition(current, context))) {
                matched = true;
                current = await runOneStep(b.step, current, idx);
              }
            }
          }
        }

        const finalOutput = outputSchema.parse(current) as TCurrentOutput;
        return { output: finalOutput, artifacts };
      },
    };
  }
}

export function createWorkflow<TInput, TOutput>(config: {
  id: string;
  runKind?: BulkOptimizationState["runKind"];
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
}): PulseWorkflowBuilder<TInput, TInput> {
  if (!config.id.trim()) {
    throw new Error("createWorkflow requires a non-empty id.");
  }
  return new PulseWorkflowBuilder<TInput, TInput>(config);
}
