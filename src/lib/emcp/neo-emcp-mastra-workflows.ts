import { z } from "zod";
import { createStep, createWorkflow } from "@/lib/agent-pipeline";
import {
  executeEmcpBatch,
  executeEmcpTool,
  fetchEmcpSiteCatalog,
  type EmcpAuditReport,
  type EmcpBatchStepResult,
} from "@/lib/emcp/neo-emcp-api";
import {
  emcpCommandPlannerAgent,
  emcpSiteSchemaDoctorAgent,
  EmcpPlannedStepSchema,
  type EmcpPlannedStep,
} from "@/lib/emcp/neo-emcp-mastra-agents";

const SiteCredsSchema = z.object({
  siteId: z.string().optional(),
  siteUrl: z.string().min(1),
  username: z.string().min(1),
  appPassword: z.string().min(1),
  dryRunOnly: z.boolean().default(true),
});

const AuditSnapshotSchema = SiteCredsSchema.extend({
  auditReport: z.custom<EmcpAuditReport>(),
  businessDetails: z.record(z.unknown()),
  locations: z.array(z.record(z.unknown())),
});

const PlannedRemediationSchema = AuditSnapshotSchema.extend({
  planSummary: z.string(),
  remediationSteps: z.array(EmcpPlannedStepSchema),
});

const ExecutedRemediationSchema = z.object({
  siteUrl: z.string(),
  dryRunOnly: z.boolean(),
  planSummary: z.string(),
  findingCount: z.number(),
  dryRunResults: z.array(z.custom<EmcpBatchStepResult>()),
  committedResults: z.array(z.custom<EmcpBatchStepResult>()),
});

const stepCollectSiteAudit = createStep({
  id: "emcp-collect-site-audit",
  title: "Read site schema & SEO audit",
  inputSchema: SiteCredsSchema,
  outputSchema: AuditSnapshotSchema,
  artifact: (out) => ({
    name: "neo-emcp-site-audit.json",
    content: JSON.stringify(out.auditReport, null, 2),
    mimeType: "application/json",
  }),
  execute: async ({ inputData, context }) => {
    const [auditRes, bizRes, locRes] = await Promise.all([
      executeEmcpTool<EmcpAuditReport>(
        {
          siteUrl: inputData.siteUrl,
          username: inputData.username,
          appPassword: inputData.appPassword,
          tool: "neo-pulse/read",
          operation: "audit",
        },
        context.signal,
      ),
      executeEmcpTool<Record<string, unknown>>(
        {
          siteUrl: inputData.siteUrl,
          username: inputData.username,
          appPassword: inputData.appPassword,
          tool: "neo-pulse/read",
          operation: "get-business-details",
        },
        context.signal,
      ),
      executeEmcpTool<{ locations?: Array<Record<string, unknown>> }>(
        {
          siteUrl: inputData.siteUrl,
          username: inputData.username,
          appPassword: inputData.appPassword,
          tool: "neo-pulse/read",
          operation: "list-locations",
        },
        context.signal,
      ),
    ]);

    return {
      ...inputData,
      auditReport: auditRes.data,
      businessDetails: bizRes.data ?? {},
      locations: Array.isArray(locRes.data?.locations) ? locRes.data.locations : [],
    };
  },
});

const stepPlanAuditRemediation = createStep({
  id: "emcp-plan-remediation",
  title: "Plan MCP schema & business fixes",
  inputSchema: AuditSnapshotSchema,
  outputSchema: PlannedRemediationSchema,
  artifact: (out) => ({
    name: "neo-emcp-remediation-plan.json",
    content: JSON.stringify(
      { summary: out.planSummary, steps: out.remediationSteps },
      null,
      2,
    ),
    mimeType: "application/json",
  }),
  execute: async ({ inputData, context }) => {
    const findings = Array.isArray(inputData.auditReport?.findings)
      ? inputData.auditReport.findings
      : [];
    if (findings.length === 0) {
      return {
        ...inputData,
        planSummary: "No schema or business detail issues detected.",
        remediationSteps: [],
      };
    }

    const plan = await emcpSiteSchemaDoctorAgent.run(
      {
        siteUrl: inputData.siteUrl,
        businessDetails: inputData.businessDetails,
        locations: inputData.locations,
        findings: findings as Array<Record<string, unknown>>,
      },
      {
        apiKey: context.apiKey,
        siteId: inputData.siteId ?? context.siteId,
        signal: context.signal,
      },
    );

    return {
      ...inputData,
      planSummary: plan.summary,
      remediationSteps: plan.remediationSteps,
    };
  },
});

const stepExecuteAuditRemediation = createStep({
  id: "emcp-execute-remediation",
  title: "Preview dry_run & apply MCP fixes",
  inputSchema: PlannedRemediationSchema,
  outputSchema: ExecutedRemediationSchema,
  artifact: (out) => ({
    name: "neo-emcp-remediation-results.json",
    content: JSON.stringify(out, null, 2),
    mimeType: "application/json",
  }),
  execute: async ({ inputData, context }) => {
    const findingCount = inputData.auditReport?.finding_count ?? 0;
    if (inputData.remediationSteps.length === 0) {
      return {
        siteUrl: inputData.siteUrl,
        dryRunOnly: inputData.dryRunOnly,
        planSummary: inputData.planSummary,
        findingCount,
        dryRunResults: [],
        committedResults: [],
      };
    }

    const dryRunSteps = inputData.remediationSteps.map((s) => ({
      id: `${s.id}_dry_run`,
      tool: s.tool,
      operation: s.operation || undefined,
      arguments: s.supportsDryRun ? { ...s.arguments, dry_run: true } : s.arguments,
    }));

    const dryBatch = await executeEmcpBatch(
      {
        siteUrl: inputData.siteUrl,
        username: inputData.username,
        appPassword: inputData.appPassword,
        steps: dryRunSteps,
        stopOnError: true,
      },
      context.signal,
    );

    if (inputData.dryRunOnly || !dryBatch.ok) {
      return {
        siteUrl: inputData.siteUrl,
        dryRunOnly: true,
        planSummary: inputData.planSummary,
        findingCount,
        dryRunResults: dryBatch.results,
        committedResults: [],
      };
    }

    const commitSteps = inputData.remediationSteps.map((s) => {
      const cleanArgs = { ...s.arguments };
      delete cleanArgs.dry_run;
      return {
        id: s.id,
        tool: s.tool,
        operation: s.operation || undefined,
        arguments: cleanArgs,
      };
    });

    const commitBatch = await executeEmcpBatch(
      {
        siteUrl: inputData.siteUrl,
        username: inputData.username,
        appPassword: inputData.appPassword,
        steps: commitSteps,
        stopOnError: true,
      },
      context.signal,
    );

    return {
      siteUrl: inputData.siteUrl,
      dryRunOnly: false,
      planSummary: inputData.planSummary,
      findingCount,
      dryRunResults: dryBatch.results,
      committedResults: commitBatch.results,
    };
  },
});

export const neoEmcpAuditAndFixWorkflow = createWorkflow({
  id: "emcp.audit-and-fix.workflow",
  inputSchema: SiteCredsSchema,
  outputSchema: ExecutedRemediationSchema,
})
  .then(stepCollectSiteAudit)
  .then(stepPlanAuditRemediation)
  .then(stepExecuteAuditRemediation)
  .commit();

const CommandInputSchema = SiteCredsSchema.extend({
  instruction: z.string().min(1),
});

const CommandPlannedSchema = CommandInputSchema.extend({
  summary: z.string(),
  steps: z.array(EmcpPlannedStepSchema),
});

const CommandOutputSchema = z.object({
  siteUrl: z.string(),
  summary: z.string(),
  dryRunOnly: z.boolean(),
  plannedSteps: z.array(EmcpPlannedStepSchema),
  results: z.array(z.custom<EmcpBatchStepResult>()),
});

const stepPlanCommand = createStep({
  id: "emcp-plan-command",
  title: "Discover site MCP catalog & plan steps",
  inputSchema: CommandInputSchema,
  outputSchema: CommandPlannedSchema,
  artifact: (out) => ({
    name: "neo-emcp-command-plan.json",
    content: JSON.stringify({ summary: out.summary, steps: out.steps }, null, 2),
    mimeType: "application/json",
  }),
  execute: async ({ inputData, context }) => {
    const catalog = await fetchEmcpSiteCatalog(
      {
        siteUrl: inputData.siteUrl,
        username: inputData.username,
        appPassword: inputData.appPassword,
      },
      context.signal,
    );

    const plan = await emcpCommandPlannerAgent.run(
      {
        siteUrl: inputData.siteUrl,
        instruction: inputData.instruction,
        availableTools: catalog.tools.map((t) => t.name),
        neoPulseReadOps: Object.keys(catalog.neoPulseRead?.operations ?? {}),
        neoPulseWriteOps: Object.keys(catalog.neoPulseWrite?.operations ?? {}),
        neoToolsReadOps: Object.keys(catalog.neoToolsRead?.operations ?? {}),
        neoToolsWriteOps: Object.keys(catalog.neoToolsWrite?.operations ?? {}),
      },
      {
        apiKey: context.apiKey,
        siteId: inputData.siteId ?? context.siteId,
        signal: context.signal,
      },
    );

    return {
      ...inputData,
      summary: plan.summary,
      steps: plan.steps,
    };
  },
});

const stepExecuteCommand = createStep({
  id: "emcp-execute-command",
  title: "Execute Neo EMCP tool sequence",
  inputSchema: CommandPlannedSchema,
  outputSchema: CommandOutputSchema,
  artifact: (out) => ({
    name: "neo-emcp-command-results.json",
    content: JSON.stringify(out, null, 2),
    mimeType: "application/json",
  }),
  execute: async ({ inputData, context }) => {
    const batchSteps = inputData.steps.map((s: EmcpPlannedStep) => ({
      id: s.id,
      tool: s.tool,
      operation: s.operation || undefined,
      arguments:
        inputData.dryRunOnly && s.supportsDryRun
          ? { ...s.arguments, dry_run: true }
          : s.arguments,
    }));

    const batch = await executeEmcpBatch(
      {
        siteUrl: inputData.siteUrl,
        username: inputData.username,
        appPassword: inputData.appPassword,
        steps: batchSteps,
        stopOnError: true,
      },
      context.signal,
    );

    return {
      siteUrl: inputData.siteUrl,
      summary: inputData.summary,
      dryRunOnly: inputData.dryRunOnly,
      plannedSteps: inputData.steps,
      results: batch.results,
    };
  },
});

export const neoEmcpCommandWorkflow = createWorkflow({
  id: "emcp.command.workflow",
  inputSchema: CommandInputSchema,
  outputSchema: CommandOutputSchema,
})
  .then(stepPlanCommand)
  .then(stepExecuteCommand)
  .commit();
