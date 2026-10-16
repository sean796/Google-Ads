import { z } from "zod";
import { createPulseAgent } from "@/lib/agent-pipeline";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import {
  buildBlogImportRowFromDraft,
  processBlogImportFile,
  type BlogImportFormState,
} from "@/lib/bulk/blog-import-parse";
import {
  importedDraftToCsvRow,
  isBlogImportFileAccepted,
  parseImportedBlogHtml,
  parseImportedBlogMarkdown,
  validateImportedBlogDraft,
  type ImportedBlogDraft,
} from "@/lib/bulk/blog-import-parser";
import { resolveBlogImportRowViaOpenRouter } from "@/lib/bulk/blog-import-openrouter-run";
import { parseJsonWithRepair } from "@/lib/json-repair-utility";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import {
  fetchAgentMailInbound,
  type AgentMailInboundAttachment,
  type AgentMailInboundRecord,
} from "@/lib/agentmail/agentmail-inbound-api";

export type AgentMailIntakeSource =
  | { kind: "attachment"; filename: string; treatment: "import_draft" | "context_only" }
  | { kind: "body"; treatment: "import_draft" | "context_only" };

export type AgentMailIntakeClassification = {
  isBlogRequest: boolean;
  reason: string;
  intent: string;
  sources: AgentMailIntakeSource[];
};

export type AgentMailEmailIntakeResult = {
  classification: AgentMailIntakeClassification;
  rows: CSVRow[];
  contextNotes: string;
};

const CLASSIFY_SYSTEM = `You analyze inbound emails for a blog automation workflow. Read the full email (subject, body, attachment filenames/types) and return JSON only.

Determine if the sender is requesting blog content creation or publishing. Requests may include draft files attached, draft text in the email body, or instructions to create blogs from intent.

Return JSON:
{
  "isBlogRequest": boolean,
  "reason": string,
  "intent": string,
  "sources": [
    { "kind": "attachment", "filename": "draft.md", "treatment": "import_draft" | "context_only" },
    { "kind": "body", "treatment": "import_draft" | "context_only" }
  ]
}

Rules:
- import_draft: publishable blog draft source (markdown/docx/html drafts, or body text with blog sections)
- context_only: briefs, images, PDFs, or reference material that is not itself a blog draft
- Include kind body when the email body contains substantive blog draft content
- intent: what blogs they want (topics, audience, tone, count hints)`;

const defaultImportForm = (): BlogImportFormState => ({
  focusKeyword: "",
  titleOverride: "",
  featuredImageMode: "y",
  entity: "",
});

function attachmentToFile(attachment: AgentMailInboundAttachment): File | null {
  const filename = attachment.filename?.trim();
  const base64 = attachment.dataBase64?.trim();
  if (!filename || !base64) return null;
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], filename, {
      type: attachment.contentType?.trim() || "application/octet-stream",
    });
  } catch {
    return null;
  }
}

function bodyDraftFromEmail(inbound: AgentMailInboundRecord): ImportedBlogDraft | null {
  const text = inbound.text?.trim() || stripHtml(inbound.html);
  if (!text) return null;
  try {
    const draft =
      text.includes("<h2") || text.includes("<H2")
        ? parseImportedBlogHtml(text, "email-body.html")
        : parseImportedBlogMarkdown(text, "email-body.md");
    validateImportedBlogDraft(draft);
    return draft;
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return String(html ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const AgentMailClassifierInputSchema = z.object({
  subject: z.string(),
  from: z.string(),
  bodyText: z.string(),
  attachmentLines: z.array(z.string()),
});

const AgentMailClassifierOutputSchema = z.object({
  isBlogRequest: z.boolean(),
  reason: z.string(),
  intent: z.string(),
  sources: z.array(
    z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("attachment"),
        filename: z.string().min(1),
        treatment: z.enum(["import_draft", "context_only"]),
      }),
      z.object({
        kind: z.literal("body"),
        treatment: z.enum(["import_draft", "context_only"]),
      }),
    ]),
  ),
});

export const agentmailIntakeClassifierAgent = createPulseAgent({
  id: "workflow.agentmail.intake-classifier",
  label: "AgentMail Inbound Blog Request Classifier",
  category: "research",
  domain: "blog-generator",
  reason: "Classifies inbound AgentMail messages and attachments into blog creation requests, draft sources, and context briefs.",
  temperature: 0.2,
  maxTokens: 2000,
  responseFormat: { type: "json_object" },
  inputSchema: AgentMailClassifierInputSchema,
  outputSchema: AgentMailClassifierOutputSchema,
  buildSystemPrompt: () => CLASSIFY_SYSTEM,
  buildUserPrompt: (input) =>
    [
      `Subject: ${input.subject}`,
      `From: ${input.from}`,
      "",
      "Body:",
      input.bodyText || "(empty)",
      "",
      "Attachments:",
      input.attachmentLines.length ? input.attachmentLines.join("\n") : "(none)",
    ].join("\n"),
  parseOutput: (rawContent) => {
    const { parsed } = parseJsonWithRepair<{
      isBlogRequest?: boolean;
      reason?: string;
      intent?: string;
      sources?: Array<{
        kind?: string;
        filename?: string;
        treatment?: string;
      }>;
    }>(rawContent);

    const sources: AgentMailIntakeSource[] = [];
    for (const source of parsed?.sources ?? []) {
      const kind = source.kind === "body" ? "body" : "attachment";
      const treatment = source.treatment === "context_only" ? "context_only" : "import_draft";
      if (kind === "body") {
        sources.push({ kind: "body", treatment });
      } else if (source.filename?.trim()) {
        sources.push({ kind: "attachment", filename: source.filename.trim(), treatment });
      }
    }

    return {
      isBlogRequest: parsed?.isBlogRequest === true,
      reason: String(parsed?.reason ?? "").trim(),
      intent: String(parsed?.intent ?? "").trim(),
      sources,
    };
  },
});

async function classifyAgentMailEmail(
  inbound: AgentMailInboundRecord,
  openRouterApiKey: string,
): Promise<AgentMailIntakeClassification> {
  const attachmentLines = (inbound.attachments ?? []).map(
    (item) => `- ${item.filename} (${item.contentType}, ${item.size} bytes)`,
  );
  const bodyText = inbound.text?.trim() || stripHtml(inbound.html) || inbound.preview || "(empty)";

  return agentmailIntakeClassifierAgent.run(
    {
      subject: inbound.subject,
      from: inbound.from,
      bodyText,
      attachmentLines,
    },
    {
      apiKey: openRouterApiKey,
    },
  );
}

async function rowFromAttachment(
  attachment: AgentMailInboundAttachment,
  form: BlogImportFormState,
  openRouterApiKey: string,
): Promise<CSVRow> {
  const file = attachmentToFile(attachment);
  if (!file) {
    throw new Error(`Could not read attachment ${attachment.filename}`);
  }
  if (isBlogImportFileAccepted(file)) {
    const parsed = await processBlogImportFile(file, form, openRouterApiKey);
    return parsed.row;
  }
  return resolveBlogImportRowViaOpenRouter(file, form, openRouterApiKey);
}

async function rowFromBody(
  inbound: AgentMailInboundRecord,
  form: BlogImportFormState,
  openRouterApiKey: string,
): Promise<CSVRow> {
  const structured = bodyDraftFromEmail(inbound);
  if (structured) {
    return buildBlogImportRowFromDraft(structured, form);
  }
  const text = inbound.text?.trim() || stripHtml(inbound.html);
  if (!text) {
    throw new Error("Email body is empty");
  }
  const file = new File([text], "email-body.txt", { type: "text/plain" });
  return resolveBlogImportRowViaOpenRouter(file, form, openRouterApiKey);
}

export async function runAgentMailEmailIntake(
  teamId: number,
  messageId: string,
): Promise<AgentMailEmailIntakeResult> {
  const inbound = await fetchAgentMailInbound(teamId, messageId);
  const openRouterApiKey = await resolveOpenRouterApiKeyForHarness();
  const classification = await classifyAgentMailEmail(inbound, openRouterApiKey);

  if (!classification.isBlogRequest) {
    throw new Error(
      classification.reason.trim() || "Email is not a blog creation request.",
    );
  }

  const form = defaultImportForm();
  const rows: CSVRow[] = [];
  const contextParts: string[] = [];

  const attachmentByName = new Map(
    (inbound.attachments ?? []).map((item) => [item.filename.toLowerCase(), item]),
  );

  for (const source of classification.sources) {
    if (source.treatment === "context_only") {
      if (source.kind === "body") {
        contextParts.push(inbound.text?.trim() || stripHtml(inbound.html));
      } else {
        contextParts.push(`Attachment reference: ${source.filename}`);
      }
      continue;
    }

    if (source.kind === "body") {
      rows.push(await rowFromBody(inbound, form, openRouterApiKey));
      continue;
    }

    const attachment = attachmentByName.get(source.filename.toLowerCase());
    if (!attachment) {
      throw new Error(`Attachment not found: ${source.filename}`);
    }
    rows.push(await rowFromAttachment(attachment, form, openRouterApiKey));
  }

  if (rows.length === 0) {
    const fallback = bodyDraftFromEmail(inbound);
    if (fallback) {
      rows.push(importedDraftToCsvRow(fallback, undefined, { featuredImage: "y" }));
    } else if ((inbound.attachments ?? []).length > 0) {
      const first = inbound.attachments[0]!;
      rows.push(await rowFromAttachment(first, form, openRouterApiKey));
    } else {
      throw new Error("No blog draft sources found in the email.");
    }
  }

  return {
    classification,
    rows,
    contextNotes: contextParts.filter(Boolean).join("\n\n"),
  };
}

export { classifyAgentMailEmail };
