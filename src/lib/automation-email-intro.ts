import { z } from "zod";
import { createPulseAgent } from "@/lib/agent-pipeline";
import { parseJsonStrict } from "@/lib/json-repair-utility";
import type { GscClientQuestion } from "@/lib/gsc-reporting/gsc-reporting-meeting-script-markdown";
import type { TaskExecutionKind } from "@/lib/tasks-types";

export type AutomationEmailIntroResult = {
  intro: string;
  highlights: string[];
  subject?: string;
  bulletHeading?: string;
  talkingPoints?: string[];
  clientQuestions?: GscClientQuestion[];
};

const GSC_MEETING_BULLET_HEADING = "Quick preview:";

const AutomationEmailIntroInputSchema = z.object({
  executionKind: z.string(),
  siteName: z.string(),
  automationTitle: z.string(),
  summaryText: z.string(),
  compareLabel: z.string().optional(),
});

const AutomationEmailIntroOutputSchema = z.object({
  intro: z.string().min(1),
  highlights: z.array(z.string()),
  subject: z.string().optional(),
  bulletHeading: z.string().optional(),
  talkingPoints: z.array(z.string()).optional(),
  clientQuestions: z
    .array(
      z.object({
        question: z.string(),
        answer: z.string(),
      }),
    )
    .optional(),
});

function parseStringList(raw: unknown, maxItems: number): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}

function parseClientQuestions(raw: unknown, maxItems: number): GscClientQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: GscClientQuestion[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (!trimmed) continue;
      const splitAt = trimmed.indexOf("?");
      if (splitAt > 0 && splitAt < trimmed.length - 1) {
        out.push({
          question: trimmed.slice(0, splitAt + 1).trim(),
          answer: trimmed.slice(splitAt + 1).trim(),
        });
      } else {
        out.push({ question: trimmed, answer: "" });
      }
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const record = item as { question?: unknown; answer?: unknown };
    const question = typeof record.question === "string" ? record.question.trim() : "";
    const answer = typeof record.answer === "string" ? record.answer.trim() : "";
    if (question) out.push({ question, answer });
    if (out.length >= maxItems) break;
  }
  return out;
}

function parseIntroJson(raw: string, executionKind: TaskExecutionKind): AutomationEmailIntroResult {
  const parsed = parseJsonStrict<{
    intro?: unknown;
    highlights?: unknown;
    meetingPoints?: unknown;
    talkingPoints?: unknown;
    clientQuestions?: unknown;
    subject?: unknown;
  }>(raw);
  const intro = typeof parsed.intro === "string" ? parsed.intro.trim() : "";
  const subject = typeof parsed.subject === "string" ? parsed.subject.trim() : undefined;
  if (!intro) {
    throw new Error("OpenRouter email intro missing intro text.");
  }

  const isGsc = executionKind === "gsc_reporting" || executionKind === "ads_reporting";
  if (isGsc) {
    const highlights = parseStringList(parsed.highlights, 6);
    const talkingPoints =
      parseStringList(parsed.talkingPoints, 10).length > 0
        ? parseStringList(parsed.talkingPoints, 10)
        : parseStringList(parsed.meetingPoints, 10);
    const clientQuestions = parseClientQuestions(parsed.clientQuestions, 6);
    if (highlights.length === 0) {
      throw new Error("OpenRouter email intro missing GSC highlights.");
    }
    return {
      intro,
      highlights,
      talkingPoints,
      clientQuestions,
      subject,
      bulletHeading: GSC_MEETING_BULLET_HEADING,
    };
  }

  return {
    intro,
    highlights: parseStringList(parsed.highlights, 5),
    subject,
  };
}

function buildIntroSystemPrompt(executionKind: TaskExecutionKind): string {
  if (executionKind === "gsc_reporting") {
    return [
      "ROLE: You prepare client meeting notes for a marketing lead before a Google Search Console review.",
      "AUDIENCE: The lead presents to the business owner. Write prep notes, not a word-for-word script.",
      "Return JSON only with keys:",
      "intro (1 short sentence for the email teaser),",
      "highlights (3-5 short stat bullets from the report: clicks, impressions, queries, position, or clear themes with numbers when present),",
      "talkingPoints (6-10 discussion notes: what to cover, opportunities, context; do NOT write dialogue or lines starting with Say:),",
      "clientQuestions (4-6 objects with question and answer: likely client questions and concise answers grounded in the report),",
      "subject (optional short email subject).",
      "FORBIDDEN: verbatim script lines, stage directions, timing estimates, or telling the lead exactly what to say word for word.",
      "If the report discusses seasonality for this city and trade, include exactly one talking point that says busy or not busy. Do not say shoulder, peak, or slow. Do not invent a city or metrics.",
      "Ground everything in the report summary. Do not invent metrics, pages, or queries. No markdown. No em dashes.",
    ].join(" ");
  }

  return [
    "You write concise email copy for a marketing lead receiving an automation run summary.",
    "Return JSON only with keys: intro (2-4 conversational sentences), highlights (3-5 short bullet strings), subject (optional short subject line).",
    "Sound human and direct. No markdown. No em dashes.",
  ].join(" ");
}

function summaryLimitForKind(executionKind: TaskExecutionKind): number {
  return executionKind === "gsc_reporting" ? 14_000 : 6_000;
}

function maxTokensForKind(executionKind: TaskExecutionKind): number {
  return executionKind === "gsc_reporting" ? 2_000 : 900;
}

export const automationEmailIntroAgent = createPulseAgent({
  id: "reporting.automation.email-intro",
  label: "Automation Email Intro & Meeting Notes Agent",
  category: "report",
  domain: "reporting",
  reason: "Generates executive email intro copy, metric highlights, talking points, and client Q&A from completed automation deliverables.",
  temperature: 0.4,
  responseFormat: { type: "json_object" },
  inputSchema: AutomationEmailIntroInputSchema,
  outputSchema: AutomationEmailIntroOutputSchema,
  buildSystemPrompt: (input) => buildIntroSystemPrompt(input.executionKind as TaskExecutionKind),
  buildUserPrompt: (input) => {
    const executionKind = input.executionKind as TaskExecutionKind;
    const kindLabel = executionKind.replace(/_/g, " ").trim() || "automation";
    const compareLine = input.compareLabel?.trim()
      ? `Compare period: ${input.compareLabel.trim()}`
      : "";
    return [
      `Automation type: ${kindLabel}`,
      `Site: ${input.siteName}`,
      `Automation title: ${input.automationTitle}`,
      compareLine,
      "",
      "Run summary:",
      input.summaryText.slice(0, summaryLimitForKind(executionKind)),
    ]
      .filter(Boolean)
      .join("\n");
  },
  parseOutput: (raw, input) => parseIntroJson(raw, input.executionKind as TaskExecutionKind),
});

export async function buildAutomationEmailIntro(args: {
  apiKey: string;
  executionKind: TaskExecutionKind;
  siteName: string;
  automationTitle: string;
  summaryText: string;
  compareLabel?: string;
  signal?: AbortSignal;
}): Promise<AutomationEmailIntroResult> {
  return automationEmailIntroAgent.run(
    {
      executionKind: args.executionKind,
      siteName: args.siteName,
      automationTitle: args.automationTitle,
      summaryText: args.summaryText,
      compareLabel: args.compareLabel,
    },
    {
      apiKey: args.apiKey,
      maxTokens: maxTokensForKind(args.executionKind),
      signal: args.signal,
    },
  );
}

export { GSC_MEETING_BULLET_HEADING };
