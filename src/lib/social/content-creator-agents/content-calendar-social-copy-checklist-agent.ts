import { getCompetitorReportMaxOutputTokens } from "@/lib/competitor-research/competitor-report-openrouter-limits";
import { appendMasterInstructionsToSystemPrompt, ensureMasterInstructionsInMemory } from "@/lib/master-instructions-storage";
import { callContentCreatorJsonCompletion } from "@/lib/social/content-creator-prompt-builder";
import type { ContentCreatorSocialBrief } from "@/lib/social/content-creator-social-brief";
import {
  CONTENT_CREATOR_IG_MAX_CHARS,
  countSentences,
} from "@/lib/social/content-creator-social-copy-limits";
import { cellString } from "@/lib/social/content-creator-types";

export type ContentCreatorSocialCopyChecklistItem = {
  id: string;
  label: string;
  detail?: string;
};

function buildLocalChecklist(options: {
  caption: string;
  keyword: string;
  brief: ContentCreatorSocialBrief;
  hasEventContext: boolean;
}): ContentCreatorSocialCopyChecklistItem[] {
  const items: ContentCreatorSocialCopyChecklistItem[] = [];
  const caption = options.caption;
  const keyword = cellString(options.keyword).toLowerCase();

  if (caption.length > CONTENT_CREATOR_IG_MAX_CHARS) {
    items.push({
      id: "length",
      label: "Caption too long",
      detail: `Max ${CONTENT_CREATOR_IG_MAX_CHARS} characters including hashtags.`,
    });
  }

  const bodyOnly = caption.split("\n").slice(0, -1).join("\n") || caption;
  if (countSentences(bodyOnly) > 3) {
    items.push({
      id: "sentences",
      label: "Too many sentences",
      detail: "Instagram caption should be hook plus at most one support line.",
    });
  }

  if (keyword.length > 0 && caption.toLowerCase().includes(keyword)) {
    items.push({
      id: "keyword-paste",
      label: "Raw keyword pasted",
      detail: "Rewrite the keyword into natural English.",
    });
  }

  const hook = cellString(options.brief.captionHook).toLowerCase();
  if (hook.length > 0 && !caption.toLowerCase().includes(hook.slice(0, Math.min(24, hook.length)))) {
    items.push({
      id: "hook-mismatch",
      label: "Caption does not expand brief hook",
      detail: "Sentence 1 should match the brief captionHook angle.",
    });
  }

  if (!options.hasEventContext && /\b(holiday|labour day|christmas|thanksgiving|seasonal|event)\b/i.test(caption)) {
    items.push({
      id: "invented-event",
      label: "Event mentioned without Event context",
      detail: "Remove holiday or seasonal references unless user provided Events.",
    });
  }

  const emojiCount = (caption.match(/[\u{1F300}-\u{1FAFF}]/gu) ?? []).length;
  if (emojiCount > 1) {
    items.push({
      id: "emoji-spam",
      label: "Too many emojis",
      detail: "Use zero or one emoji in Instagram captions.",
    });
  }

  const hashtagCount = (caption.match(/#[\w\d_]+/g) ?? []).length;
  if (hashtagCount > 5) {
    items.push({
      id: "hashtag-spam",
      label: "Too many hashtags",
      detail: "Use 3 to 5 hashtags on the last line.",
    });
  }

  return items;
}

export async function runContentCalendarSocialCopyChecklistAgent(options: {
  apiKey: string;
  model: string;
  siteId?: string;
  keyword: string;
  socialBrief: ContentCreatorSocialBrief;
  fbInstagramContent: string;
  hasEventContext: boolean;
  signal?: AbortSignal;
}): Promise<ContentCreatorSocialCopyChecklistItem[]> {
  const localItems = buildLocalChecklist({
    caption: options.fbInstagramContent,
    keyword: options.keyword,
    brief: options.socialBrief,
    hasEventContext: options.hasEventContext,
  });

  if (localItems.length > 0) return localItems;

  if (typeof options.apiKey !== "string" || options.apiKey.length === 0) {
    return [];
  }

  await ensureMasterInstructionsInMemory(options.siteId ?? null);

  const system = appendMasterInstructionsToSystemPrompt(
    `You validate Instagram calendar captions against a strategy brief.
Return JSON: { "items": [{ "id": string, "label": string, "detail": optional string }] }.
Return an empty items array if the caption passes.`,
    options.siteId ?? null,
  );

  const user = JSON.stringify({
    task: "content_creator_social_copy_checklist",
    keyword: options.keyword,
    brief: options.socialBrief,
    fbInstagramContent: options.fbInstagramContent,
    hasEventContext: options.hasEventContext,
    rules: [
      "Caption max 300 chars total",
      "Hook plus at most one support line",
      "No raw keyword paste",
      "No events unless hasEventContext is true",
      "3 to 5 hashtags max",
    ],
  });

  const raw = await callContentCreatorJsonCompletion({
    apiKey: options.apiKey,
    model: options.model,
    system,
    user,
    maxTokens: Math.min(512, getCompetitorReportMaxOutputTokens(options.model)),
    temperature: 0.2,
    errorLabel: "Content social copy checklist agent",
    signal: options.signal,
  });

  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items
    .filter((item): item is ContentCreatorSocialCopyChecklistItem => {
      const row = item as ContentCreatorSocialCopyChecklistItem;
      return typeof row?.id === "string" && typeof row?.label === "string";
    })
    .slice(0, 8);
}

export function formatContentCreatorChecklistFeedback(
  items: ContentCreatorSocialCopyChecklistItem[],
): string {
  return items
    .map((item, index) => `${index + 1}. ${item.label}${item.detail ? `: ${item.detail}` : ""}`)
    .join("\n");
}
