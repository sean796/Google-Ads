import { z } from "zod";
import type { AgentConfig } from "@/types/agent-config";
import { truncateTitleForSEO } from "./content-generation/content-sanitizer";
import {
  enforceForbiddenWordsOnBlueprint,
  sanitizeBlueprintAgentsForPipeline,
  sanitizeForbiddenHeadingTitle,
} from "@/lib/content-word-blocklist";
import {
  extractChecklistItemTitle,
} from "@/lib/post-creator/post-creator-checklist-post-process";
import {
  isLlmAuditAuthorityDumpChecklistItem,
  isLlmAuditAuthorityDumpTitle,
} from "@/lib/content-optimization/harness-heading-titles";
import { ensureConnectedSiteHarnessMarkers } from "@/lib/bulk/connected-site-harness-markers";
import { LINK_FEATURE_PLACEHOLDER } from "./blog-template-checklist-prompts";
import { agentFromChecklistRow, buildBlueprintFromChecklistRows } from "./blog-template-checklist-rows";
import type { BlogTemplateContext } from "./blog-template-builder-types";

export function parseBlueprintModelResponse(args: {
  content: string;
  checklist: string[];
  context: BlogTemplateContext;
  sapEntity: string | undefined;
  entity: string | undefined;
  isGSCReport: boolean;
}): { title?: string; purpose?: string; agents: AgentConfig[] } {
  const checklist = args.checklist;
  const context = args.context;
  const sapEntity = args.sapEntity;
  const options = { entity: args.entity };
  const isGSCReport = args.isGSCReport;
  let cleanedResponse = args.content.trim();
  cleanedResponse = cleanedResponse.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?\s*```\s*$/, "");
  if (!cleanedResponse.trimStart().startsWith("{")) {
    const firstBrace = cleanedResponse.indexOf("{");
    const lastBrace = cleanedResponse.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      cleanedResponse = cleanedResponse.slice(firstBrace, lastBrace + 1);
    }
  }

  let parsed: { title?: string; purpose?: string; agents?: unknown[] };
  try {
    parsed = JSON.parse(cleanedResponse) as typeof parsed;
  } catch (parseErr) {
    const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    throw new Error(`Blueprint response was not valid JSON: ${msg}. Head: ${cleanedResponse.slice(0, 240)}`);
  }

  const blueprintShape = z
    .object({
      title: z.string().min(1),
      purpose: z.string().optional(),
      agents: z.array(z.unknown()).min(1),
    })
    .safeParse(parsed);
  if (!blueprintShape.success) {
    throw new Error(
      `Blueprint response did not match the blueprint schema: ${blueprintShape.error.issues.map((i) => i.path.join(".") || "root").join(", ")}`,
    );
  }

  let agents: AgentConfig[] = Array.isArray(parsed.agents)
    ? sanitizeBlueprintAgentsForPipeline(
        parsed.agents.map((agentRaw: unknown, index: number) => {
          const agent = (agentRaw && typeof agentRaw === "object" ? agentRaw : {}) as {
            id?: string;
            step?: number;
            title?: unknown;
            description?: string;
            features?: unknown;
            h2Count?: number;
            h3Count?: number;
            h3Enabled?: boolean;
            headingLevel?: number;
            maxTokens?: number;
          };
          const features = (Array.isArray(agent.features) ? agent.features : []).filter(
            (f): f is string => typeof f === "string",
          );

          const hasLinkFeature = features.some(
            (f: string) => typeof f === "string" && f.toLowerCase().trim().startsWith("[link]"),
          );
          if (!hasLinkFeature) {
            features.push(LINK_FEATURE_PLACEHOLDER);
          }

          const modelTitle = sanitizeForbiddenHeadingTitle(
            extractChecklistItemTitle(String(agent.title ?? "").trim()),
          ).trim();
          const checklistLine = checklist[index]?.trim() ?? "";
          const checklistTitle = checklistLine
            ? sanitizeForbiddenHeadingTitle(extractChecklistItemTitle(checklistLine)).trim()
            : "";
          const afterNumber = checklistLine.replace(/^\d+\.\s*/, "").trim();
          const beforeMarker = afterNumber.split("[")[0]?.trim() ?? "";
          const agentTitle =
            modelTitle || checklistTitle || beforeMarker || afterNumber.slice(0, 80).trim();

          const isFAQ =
            features?.some(
              (f: string) =>
                typeof f === "string" &&
                (f.toLowerCase().includes("[faq]") || f.toLowerCase().includes("faq")),
            ) ?? false;
          return {
            id: agent.id || `agent-${index + 1}`,
            step: agent.step || index + 1,
            title: agentTitle,
            description: agent.description || "",
            features: features,
            h2Count: agent.h2Count ?? 1,
            h3Count: isFAQ ? 0 : Math.min(agent.h3Count ?? 0, 5),
            h3Enabled: isFAQ ? false : (agent.h3Enabled ?? false),
            headingLevel: agent.headingLevel ?? 1,
            maxTokens: agent.maxTokens ?? 2000,
          };
        }),
        { allowFaqAgents: isGSCReport },
      )
    : [];

  if (agents.length < checklist.length) {
    const extra = checklist
      .slice(agents.length)
      .filter((item) => !isLlmAuditAuthorityDumpChecklistItem(item));
    agents = [...agents, ...extra.map((item, i) => agentFromChecklistRow(item, agents.length + i))];
  }
  agents = agents.filter((agent) => !isLlmAuditAuthorityDumpTitle(agent.title));

  if (agents.length === 0) {
    return buildBlueprintFromChecklistRows(checklist, context, sapEntity);
  }

  const isEntityPage = !!options.entity;
  if (isEntityPage) {
    agents.forEach((agent) => {
      if (agent.headingLevel && agent.headingLevel > 1) agent.headingLevel = 1;
    });
  } else {
    const h3Agents = agents.filter((a) => a.headingLevel && a.headingLevel > 1);
    if (agents.length > 0 && h3Agents.length > agents.length * 0.6) {
      h3Agents.forEach((a) => {
        a.headingLevel = 1;
      });
    }
  }

  agents.forEach((agent, index) => {
    agent.step = index + 1;
  });

  let finalTitle = parsed.title || context.flowTitle || "Untitled Article";
  finalTitle = truncateTitleForSEO(finalTitle);

  return enforceForbiddenWordsOnBlueprint(
    {
      title: finalTitle,
      purpose: parsed.purpose || context.flowPurpose || "Not specified",
      agents: ensureConnectedSiteHarnessMarkers(agents, sapEntity),
    },
    { sapEntity },
  );
}
