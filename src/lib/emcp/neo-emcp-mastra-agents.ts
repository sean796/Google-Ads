import { z } from "zod";
import { createPulseAgent } from "@/lib/agent-pipeline";

export const EmcpPlannedStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  tool: z.string().min(1),
  operation: z.string().optional().default(""),
  arguments: z.record(z.unknown()).default({}),
  supportsDryRun: z.boolean().default(false),
  reason: z.string().min(1),
});

export type EmcpPlannedStep = z.infer<typeof EmcpPlannedStepSchema>;

export const EmcpSchemaDoctorInputSchema = z.object({
  siteUrl: z.string().min(1),
  businessDetails: z.record(z.unknown()),
  locations: z.array(z.record(z.unknown())),
  findings: z.array(z.record(z.unknown())),
});

export const EmcpSchemaDoctorOutputSchema = z.object({
  summary: z.string().min(1),
  remediationSteps: z.array(EmcpPlannedStepSchema),
});

export type EmcpSchemaDoctorInput = z.infer<typeof EmcpSchemaDoctorInputSchema>;
export type EmcpSchemaDoctorOutput = z.infer<typeof EmcpSchemaDoctorOutputSchema>;

export const emcpSiteSchemaDoctorAgent = createPulseAgent({
  id: "emcp.audit.site-schema-doctor",
  label: "Neo EMCP Site & Schema Doctor Agent",
  category: "research",
  domain: "emcp",
  reason: "Analyzes neo-pulse/read audit findings, shared business details, and locations to plan dry-run-safe MCP remediation operations.",
  useMasterInstructions: true,
  temperature: 0.2,
  maxTokens: 4096,
  inputSchema: EmcpSchemaDoctorInputSchema,
  outputSchema: EmcpSchemaDoctorOutputSchema,
  buildSystemPrompt: () =>
    [
      "You are the Neo Pulse Native Site & Schema Doctor for Neo Digital WordPress properties.",
      "Your job is to inspect the site's audit findings from `neo-pulse/read` (`audit`), its shared business details (`get-business-details`), and its locations (`list-locations`), and produce an exact JSON remediation plan.",
      "CRITICAL CONTRACT RULES:",
      "1. Never write options, post meta, or tables directly. Route all Neo Pulse fixes through `neo-pulse/write` operations (`update-business-details`, `update-location`, `set-page-faqs`, `set-page-schema`, `set-type-rules`, `update-settings`).",
      "2. When patching `update-business-details`, include `expected_version` from `businessDetails.version`.",
      "3. On multi-location sites (`locations: \"several\"`), never send `address`, `phones`, `hours`, or `geo` to `update-business-details`; update them on the main showroom post via `update-location`.",
      "4. `main_location` must always be a showroom location (`kind === \"showroom\"`), never a service area.",
      "5. If `pages_default_to_article` is reported, add a `set-type-rules` step with `rules: { page: { schema: \"off\" } }`.",
      "6. Set `supportsDryRun: true` on every `neo-pulse/write` and `neo-tools/write` step so the workflow previews changes with `dry_run: true` before committing.",
      "Return strict JSON matching `{ \"summary\": string, \"remediationSteps\": Array<{ \"id\": string, \"title\": string, \"tool\": string, \"operation\": string, \"arguments\": object, \"supportsDryRun\": boolean, \"reason\": string }> }`.",
    ].join("\n"),
  buildUserPrompt: (input) =>
    [
      `Site URL: ${input.siteUrl}`,
      `Shared Business Details (JSON):\n${JSON.stringify(input.businessDetails, null, 2)}`,
      `Locations (JSON):\n${JSON.stringify(input.locations, null, 2)}`,
      `Audit Findings (JSON):\n${JSON.stringify(input.findings, null, 2)}`,
      "Return the JSON remediation plan now.",
    ].join("\n\n"),
});

export const EmcpCommandPlannerInputSchema = z.object({
  siteUrl: z.string().min(1),
  instruction: z.string().min(1),
  availableTools: z.array(z.string()),
  neoPulseReadOps: z.array(z.string()),
  neoPulseWriteOps: z.array(z.string()),
  neoToolsReadOps: z.array(z.string()),
  neoToolsWriteOps: z.array(z.string()),
  businessVersion: z.string().optional(),
  settingsVersion: z.string().optional(),
});

export const EmcpCommandPlannerOutputSchema = z.object({
  summary: z.string().min(1),
  steps: z.array(EmcpPlannedStepSchema).min(1),
});

export type EmcpCommandPlannerInput = z.infer<typeof EmcpCommandPlannerInputSchema>;
export type EmcpCommandPlannerOutput = z.infer<typeof EmcpCommandPlannerOutputSchema>;

export const emcpCommandPlannerAgent = createPulseAgent({
  id: "emcp.ops.command-planner",
  label: "Neo Pulse Native Multi-Tool Command Planner Agent",
  category: "research",
  domain: "emcp",
  reason: "Translates natural-language blog posting, stitched web design, custom field, and SEO instructions into an ordered sequence of native NEO Pulse tool calls.",
  useMasterInstructions: true,
  temperature: 0.2,
  maxTokens: 4096,
  inputSchema: EmcpCommandPlannerInputSchema,
  outputSchema: EmcpCommandPlannerOutputSchema,
  buildSystemPrompt: () =>
    [
      "You are the Neo Pulse Native Multi-Tool Command Planner.",
      "Given a natural-language instruction for a NEO Pulse WordPress site, plan the minimal sequence of native tool calls using the site's registered tools.",
      "CRITICAL CONTRACT RULES:",
      "1. For Neo Pulse SEO, schema, shared business details, and location fields, always use `neo-pulse/read` and `neo-pulse/write` with the `operation` field.",
      "2. For Neo Tools settings and status, always use `neo-tools/read` and `neo-tools/write` with the `operation` field.",
      "3. For blog posting, stitched HTML page design, custom fields, redirects, scripts, and sitemaps, use the matching native `wp_*` tool from `availableTools` (`wp_create_post`, `wp_create_page`, `wp_update_post`, `wp_add_content`, `wp_replace_content`, `wp_ai_save_meta`, `wp_body_plan`, `wp_body_section_preview`, `wp_body_section_apply`, `wp_assist_chat`, `wp_redirects_*`, `wp_scripts_*`, `wp_sitemap_*`) with `operation: \"\"`.",
      "4. Set `supportsDryRun: true` whenever `tool` is `neo-pulse/write` or `neo-tools/write`.",
      "Return strict JSON matching `{ \"summary\": string, \"steps\": Array<{ \"id\": string, \"title\": string, \"tool\": string, \"operation\": string, \"arguments\": object, \"supportsDryRun\": boolean, \"reason\": string }> }`.",
    ].join("\n"),
  buildUserPrompt: (input) =>
    [
      `Site URL: ${input.siteUrl}`,
      `Available Tools: ${input.availableTools.join(", ")}`,
      `neo-pulse/read operations: ${input.neoPulseReadOps.join(", ")}`,
      `neo-pulse/write operations: ${input.neoPulseWriteOps.join(", ")}`,
      `neo-tools/read operations: ${input.neoToolsReadOps.join(", ")}`,
      `neo-tools/write operations: ${input.neoToolsWriteOps.join(", ")}`,
      input.businessVersion ? `Current business details version: ${input.businessVersion}` : "",
      input.settingsVersion ? `Current SEO settings version: ${input.settingsVersion}` : "",
      `Operator Instruction: ${input.instruction}`,
    ]
      .filter(Boolean)
      .join("\n"),
});

export const EmcpElementorArchitectInputSchema = z.object({
  siteUrl: z.string().min(1),
  postId: z.number().int().positive(),
  goal: z.string().min(1),
  pageStructure: z.record(z.unknown()).optional(),
  availableNeoWidgets: z.array(z.record(z.unknown())).optional(),
});

export const EmcpElementorArchitectOutputSchema = z.object({
  summary: z.string().min(1),
  steps: z.array(EmcpPlannedStepSchema).min(1),
});

export const emcpElementorArchitectAgent = createPulseAgent({
  id: "emcp.builder.elementor-architect",
  label: "Neo Pulse Native Web Design & Stitched Content Architect Agent",
  category: "blog",
  domain: "emcp",
  reason: "Plans native NEO Pulse stitched HTML page design, section rewrites, and SEO metadata updates without external page-builder dependencies.",
  useMasterInstructions: true,
  temperature: 0.3,
  maxTokens: 4096,
  inputSchema: EmcpElementorArchitectInputSchema,
  outputSchema: EmcpElementorArchitectOutputSchema,
  buildSystemPrompt: () =>
    [
      "You are the Neo Pulse Native Web Design & Stitched Content Architect.",
      "Plan native NEO Pulse stitched HTML page and post operations (`wp_replace_content`, `wp_add_content`, `wp_body_plan`, `wp_body_section_preview`, `wp_body_section_apply`, `wp_ai_save_meta`, `neo-pulse/write`) for the target postId.",
      "Do not rely on Elementor, Rank Math, or third-party page builders; use stitched semantic HTML (`<h2>`, `<p>`, `<ul>`, `<table>`) and native NEO Pulse fields.",
      "Return strict JSON matching `{ \"summary\": string, \"steps\": Array<{ \"id\": string, \"title\": string, \"tool\": string, \"operation\": string, \"arguments\": object, \"supportsDryRun\": boolean, \"reason\": string }> }`.",
    ].join("\n"),
  buildUserPrompt: (input) =>
    [
      `Site URL: ${input.siteUrl}`,
      `Target Post ID: ${input.postId}`,
      `Design Goal: ${input.goal}`,
      input.pageStructure ? `Current Page Structure:\n${JSON.stringify(input.pageStructure, null, 2)}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
});
