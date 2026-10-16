import { loadApiKey } from "@/lib/api";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { resolveModelForAgentCategory } from "@/lib/openrouter-agent-category-api";
import type { ChatCallTranscriptLine } from "@/lib/chat-call-types";

export type ChatCallSummaryResult = {
  summary: string;
  actionItems: Array<{ owner: string; task: string }>;
};

function parseSummaryJson(raw: string): ChatCallSummaryResult | null {
  try {
    const data = JSON.parse(raw) as {
      summary?: unknown;
      actionItems?: unknown;
    };
    if (typeof data.summary !== "string") return null;
    const items: ChatCallSummaryResult["actionItems"] = [];
    if (Array.isArray(data.actionItems)) {
      for (const item of data.actionItems) {
        if (
          item &&
          typeof item === "object" &&
          typeof (item as { owner?: unknown }).owner === "string" &&
          typeof (item as { task?: unknown }).task === "string"
        ) {
          items.push({
            owner: (item as { owner: string }).owner,
            task: (item as { task: string }).task,
          });
        }
      }
    }
    return { summary: data.summary.trim(), actionItems: items };
  } catch {
    return null;
  }
}

export function formatCallSummaryMessage(
  summary: ChatCallSummaryResult,
  participantNames: string[],
  durationSec: number,
): string {
  const mins = Math.floor(durationSec / 60);
  const secs = durationSec % 60;
  const durationLabel = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  const lines: string[] = [
    `<p><strong>Call notes</strong> (${durationLabel})</p>`,
    `<p>${escapeHtml(summary.summary)}</p>`,
  ];
  if (summary.actionItems.length > 0) {
    lines.push("<p><strong>Action items</strong></p><ul>");
    for (const item of summary.actionItems) {
      lines.push(`<li><strong>${escapeHtml(item.owner)}:</strong> ${escapeHtml(item.task)}</li>`);
    }
    lines.push("</ul>");
  } else {
    lines.push("<p><strong>Action items:</strong> None noted.</p>");
  }
  if (participantNames.length > 0) {
    lines.push(`<p><em>Participants: ${escapeHtml(participantNames.join(", "))}</em></p>`);
  }
  return lines.join("");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function summarizeChatCall(
  transcript: ChatCallTranscriptLine[],
  participantNames: string[],
  durationSec: number,
  signal?: AbortSignal,
): Promise<{ ok: true; result: ChatCallSummaryResult; bodyHtml: string } | { ok: false; error: string }> {
  const apiKey = loadApiKey().trim();
  if (!apiKey) {
    return { ok: false, error: "No OpenRouter API key" };
  }

  if (transcript.length === 0) {
    const fallback: ChatCallSummaryResult = {
      summary: "No transcript was captured for this call.",
      actionItems: [],
    };
    return {
      ok: true,
      result: fallback,
      bodyHtml: formatCallSummaryMessage(fallback, participantNames, durationSec),
    };
  }

  const lines = transcript.map(
    (line) => `[${line.spokenAtMs}ms] ${line.displayName}: ${line.text}`,
  );

  const system = `You summarize workplace voice calls. Each transcript line includes the speaker display name. Return JSON only with keys "summary" (string, 2-4 sentences) and "actionItems" (array of { "owner": string, "task": string }). Use speaker names from the transcript for owner when clear; otherwise "Unassigned".`;

  const user = `Participants: ${participantNames.join(", ")}
Call duration: ${durationSec} seconds

Transcript (speaker-labeled):
${lines.join("\n")}

Return JSON: { "summary": "...", "actionItems": [{ "owner": "...", "task": "..." }] }`;

  try {
    const { content } = await callOpenRouterChatCompletion({
      apiKey,
      model: resolveModelForAgentCategory("report"),
      system,
      user,
      maxTokens: 1024,
      temperature: 0.2,
      responseFormat: { type: "json_object" },
      signal,
    });
    const parsed = parseSummaryJson(content);
    if (!parsed) {
      return { ok: false, error: "Could not parse summary" };
    }
    return {
      ok: true,
      result: parsed,
      bodyHtml: formatCallSummaryMessage(parsed, participantNames, durationSec),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Summary failed";
    return { ok: false, error: msg };
  }
}
