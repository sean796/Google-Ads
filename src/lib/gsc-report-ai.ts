/**
 * GSC Report AI - Agentic AI-driven executive report generation
 * One AI agent per section (9 sections). Raw data → section agents → full markdown.
 */

import { COMPARE_SIGNALS_LEXICON } from "@/lib/gsc-reporting/gsc-reporting-compare-signals";
import { streamGeneration } from "./api";
import { AGENCY_NAME } from "./report-planner";
import {
  getScopedDataForSection,
  prebuiltTableForSection,
  resolveHeading,
  serializeRawData,
} from "./gsc-report-ai-data";
import { PROGRESS_REPORT_OUTLINE, REPORT_OUTLINE } from "./gsc-report-ai-types";
import type {
  GSCReportDiscoveryInput,
  RawReportData,
  ReportSectionDef,
  ReportType,
} from "./gsc-report-ai-types";

export { serializeRawData } from "./gsc-report-ai-data";
export type {
  GSCReportDiscoveryInput,
  RawReportData,
  ReportSectionDef,
  ReportType,
} from "./gsc-report-ai-types";

/** Build system and user prompts for one section agent */
function buildSectionPrompts(
  section: ReportSectionDef,
  rawData: RawReportData,
  scopedData: Record<string, unknown>
): { systemPrompt: string; userPrompt: string } {
  const heading = resolveHeading(section.heading, rawData);
  const rowCap = section.rowCap;
  const hasPositionColumn = section.tableColumns?.toLowerCase().includes("position");
  const tableRule =
    section.id === "10"
      ? " Output a full prompt for the infographic (design spec + actual stats from RAW_DATA). Self-contained."
      : section.tableColumns && rowCap
        ? ` Table: ${section.tableColumns}. Max ${rowCap} rows.${hasPositionColumn ? " Sort rows by Position ascending (best position first)." : ""} Start with 1 short overview paragraph (NO bullet points, NO numbered lists), then the table. Nothing after the table.`
        : section.tableColumns
          ? ` Table: ${section.tableColumns}. You MUST include EVERY row from SCOPE_DATA - do NOT truncate, summarize, or limit the table. If SCOPE_DATA has 20 rows, the table must have 20 rows. Minimum 10 rows if 10+ exist.${hasPositionColumn ? " Sort rows by Position ascending (best position first)." : ""} Start with 1 short overview paragraph (NO bullet points, NO numbered lists), then the table. Nothing after the table.`
          : " Write 1 short overview paragraph (NO bullet points, NO numbered lists). Nothing else.";

  const isProgress = section.id.startsWith("p");
  const reportContext = isProgress
    ? "a client-facing SEO progress report that demonstrates accomplishments over a multi-month period. The comparison period is the baseline (before work started) and the current period spans all months of active work."
    : "a GSC performance report.";

  const systemPrompt = `You are a senior SEO strategist at ${AGENCY_NAME}. You write ONE section of ${reportContext}

${rawData.compareSignals ? COMPARE_SIGNALS_LEXICON : ""}

ZERO HALLUCINATION:
- Every keyword, number, page, metric MUST exist in RAW_DATA or SCOPE_DATA. Never invent, guess, or fabricate.
- Never output placeholders such as [Value], [TBD], or bracketed stand-ins - only real numbers from RAW_DATA/SCOPE_DATA.
- If a list is empty, say so in one line and omit the table.
- If a metric is 0, report 0. Never substitute example data.

TONE - THIS IS MANDATORY, APPLIES TO PARAGRAPHS AND TABLES ALIKE:
- This is a POSITIVE performance report for a client. Focus ONLY on wins, improvements, and growth.
- NEVER mention ANY negative metric anywhere - not in paragraphs, not in tables, not in table rows, not in any form. No "loss", "decline", "dip", "drop", "decrease", "visibility loss", or negative numbers highlighted. If a keyword or metric went down, DO NOT INCLUDE IT AT ALL. Simply omit it. Do not reframe it, do not mention it.
- No "pros and cons" tables. No "challenges". No "areas of concern". No "Recommendation" columns that reference fixing problems.
- Every table row must showcase a positive result. If you cannot say something positive about a data point, leave it out entirely.
- The client should feel great reading every single line of this report.${isProgress ? "\n- Frame everything as accomplishments and progress. Use phrases like 'we achieved', 'your site now', 'growth of', 'expanded to'. The client should understand exactly what value has been delivered." : ""}

OUTPUT:
- Output ONLY this section. Start with ## ${heading}
- NEVER use ### subheadings. Only the single ## heading is allowed. Use paragraphs and tables ONLY - no sub-sections.
- ABSOLUTELY NO bullet point lists (- or *) or numbered lists (1. 2. 3.) in the prose/narrative paragraphs. Write flowing paragraphs ONLY. The ONLY place list-like formatting is allowed is inside markdown tables. No "key takeaways", no "follow-up points", no "action items", no enumerated insights after paragraphs. Just paragraphs of narrative text, then the table if one is required.
- Use only data from RAW_DATA and SCOPE_DATA below.${tableRule}
- Executive narrative tone. No placeholders. No invented data.`;

  const userPrompt = `SECTION: ${heading}

PURPOSE: ${section.purpose}

RAW_DATA (full dataset):
\`\`\`json
${JSON.stringify(rawData, null, 2)}
\`\`\`

${["3", "5", "p4", "p6", "p8", "p9"].includes(section.id) ? `SCOPE_DATA (filtered/sliced for this section - use this for the table rows):
\`\`\`json
${JSON.stringify(scopedData, null, 2)}
\`\`\`
` : ""}
Produce ONLY this section. Start with ## ${heading}. Use ONLY data above. No hallucination.`;

  return { systemPrompt, userPrompt };
}

/**
 * Generate one section's markdown via a single AI call.
 */
async function generateSectionContent(
  section: ReportSectionDef,
  rawData: RawReportData,
  apiKey: string,
  model: string,
  options?: { signal?: AbortSignal }
): Promise<string> {
  const prebuiltTable = prebuiltTableForSection(section.id, rawData);
  const scopedData = getScopedDataForSection(section.id, rawData);
  const { systemPrompt, userPrompt } = buildSectionPrompts(section, rawData, scopedData);

  const finalSystemPrompt = prebuiltTable
    ? systemPrompt + "\n\nCRITICAL: The table for this section is pre-built and will be appended automatically. Do NOT generate any table. Output ONLY the ## heading and 1 short overview paragraph. Nothing else."
    : systemPrompt;

  let sectionMarkdown = "";
  await streamGeneration({
    apiKey,
    model,
    systemPrompt: finalSystemPrompt,
    userPrompt,
    temperature: 0.7,
    maxTokens: 8000,
    topP: 0.9,
    onContentChunk: (chunk) => {
      sectionMarkdown += chunk;
    },
    signal: options?.signal,
  });

  let result = sectionMarkdown.trim();

  if (prebuiltTable) {
    // Strip any table the AI may have generated anyway
    result = result.replace(/\n*\|[^\n]+\|(\n\|[^\n]+\|)*/g, "").trim();
    result = result + "\n\n" + prebuiltTable;
  }

  return result;
}

/**
 * Generate full GSC report by running section agents in order and concatenating.
 */
export async function generateGSCReport(
  apiKey: string,
  model: string,
  discoveryData: GSCReportDiscoveryInput,
  options?: { signal?: AbortSignal; onProgress?: (current: number, total: number) => void; reportType?: ReportType }
): Promise<string> {
  const rawData = serializeRawData(discoveryData);
  const outline = options?.reportType === "progress" ? PROGRESS_REPORT_OUTLINE : REPORT_OUTLINE;
  const sections: string[] = [];
  const total = outline.length;
  options?.onProgress?.(0, total);

  for (let i = 0; i < outline.length; i++) {
    const section = outline[i];
    const sectionMarkdown = await generateSectionContent(
      section,
      rawData,
      apiKey,
      model,
      options
    );
    sections.push(sectionMarkdown);
    options?.onProgress?.(i + 1, total);
  }

  const fullContent = sections.join("\n\n");

  
  return fullContent;
}

/**
 * Parse markdown into sections by ## or # headings. Returns array of { title, content }.
 * Robust: handles ##, #, and ### as section breaks so we always get one agent per heading.
 */
export function parseReportIntoSections(
  markdown: string
): Array<{ title: string; content: string }> {
  const result: Array<{ title: string; content: string }> = [];
  const lines = markdown.split("\n");
  let currentTitle = "";
  let currentContent: string[] = [];

  const headingRegex = /^#{1,3}\s+(.+)$/;

  for (const line of lines) {
    const headingMatch = line.match(headingRegex);
    if (headingMatch) {
      if (currentTitle) {
        result.push({ title: currentTitle, content: currentContent.join("\n").trim() });
      }
      currentTitle = headingMatch[1].trim();
      currentContent = [];
    } else if (currentTitle) {
      currentContent.push(line);
    }
  }
  if (currentTitle) {
    result.push({ title: currentTitle, content: currentContent.join("\n").trim() });
  }

  if (result.length === 0 && markdown.trim()) {
    const firstLine = markdown.split("\n")[0]?.trim() || "Report";
    const title = firstLine.startsWith("#") ? firstLine.replace(/^#+\s*/, "") : firstLine;
    result.push({ title: title.slice(0, 80), content: markdown.trim() });
  }

  
  return result;
}
