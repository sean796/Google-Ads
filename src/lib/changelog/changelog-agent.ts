/**
 * OpenRouter agent (research category): turns a pack of git commits into
 * one reader-friendly changelog entry for the Neo Pulse web app.
 *
 * The commit pack is the only allowed source of facts. Dates, ranges, and
 * commit counts are owned by code; the model writes only the words.
 */

import { z } from "zod";
import { createPulseAgent } from "@/lib/agent-pipeline";

export const changelogCommitSchema = z.object({
  hash: z.string().min(1),
  date: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().default(""),
  files: z.array(z.string()).default([]),
});

export type ChangelogCommit = z.infer<typeof changelogCommitSchema>;

export const changelogDraftSchema = z.object({
  title: z.string().min(1).max(300),
  summary: z.string().min(1).max(4000),
  highlights: z.array(z.string().min(1)).min(1).max(10),
  sections: z
    .array(
      z.object({
        heading: z.string().min(1).max(120),
        items: z.array(z.string().min(1)).min(1).max(12),
      }),
    )
    .min(1)
    .max(6),
});

export type ChangelogDraft = z.infer<typeof changelogDraftSchema>;

const changelogInputSchema = z.object({
  commits: z.array(changelogCommitSchema).min(1).max(500),
  coveredThrough: z.string().nullable().default(null),
});

export type ChangelogAgentInput = z.infer<typeof changelogInputSchema>;

const SYSTEM = `You write one changelog entry for the Neo Pulse web app, for a non-technical reader (the agency owner).

Grounding rules (non-negotiable):
- The commit pack in the user message is the ONLY source of facts. Never name a feature, fix, file, screen, or improvement that is not supported by a commit subject, body, or file list in the pack.
- Never invent dates, counts, or version numbers. If the pack is thin, write a shorter entry; do not pad it.
- Group related commits into themes. Use only these section headings, and only when the pack supports them: "New", "Improved", "Fixed", "Behind the scenes".
- Write plain, warm, concrete language. Say what changed for the person using the app, not how the code works. Avoid file names and developer jargon unless a commit is purely technical, in which case put it under "Behind the scenes" in one plain sentence.
- Never use the em dash character. Use commas, periods, or parentheses instead.

Output (JSON only, no markdown fences):
{
  "title": "Short entry title naming the main theme (max 12 words)",
  "summary": "Two or three sentences covering the whole period",
  "highlights": ["The 3 to 6 most important changes, one short sentence each"],
  "sections": [{ "heading": "New", "items": ["One change per item, one sentence each"] }]
}`;

function buildUserPrompt(input: ChangelogAgentInput): string {
  const lines = input.commits.map((c) => {
    const files = c.files.length > 0 ? ` [files: ${c.files.slice(0, 8).join(", ")}]` : "";
    const body = c.body.trim() ? `\n  ${c.body.trim().replace(/\s+/g, " ").slice(0, 400)}` : "";
    return `- ${c.date} ${c.subject}${files}${body}`;
  });
  const from = input.commits[0]?.date ?? "";
  const to = input.commits[input.commits.length - 1]?.date ?? "";
  return `Covered period: ${from} to ${to} (${input.commits.length} commits). Previous archive coverage ended: ${input.coveredThrough ?? "never (first entry)"}.

Commit pack (oldest first):
${lines.join("\n")}

Write the changelog entry JSON now.`;
}

export const appChangelogWriterAgent = createPulseAgent<ChangelogAgentInput, ChangelogDraft>({
  id: "reporting.changelog.app-update-log",
  label: "App Changelog Writer",
  category: "research",
  domain: "reporting",
  reason:
    "Turns git commits since the last archived entry into one plain-language changelog entry for the Neo Pulse web app, grouped into themes with highlights.",
  inputSchema: changelogInputSchema,
  outputSchema: changelogDraftSchema,
  temperature: 0.3,
  maxTokens: 4096,
  buildSystemPrompt: () => SYSTEM,
  buildUserPrompt: (input) => buildUserPrompt(input),
});

/**
 * Build the archive entry around a model draft. Code owns every fact:
 * the id, the entry date, the covered range, and the commit count all
 * come from the pack, never from the model.
 */
export function buildChangelogEntry(
  draft: ChangelogDraft,
  commits: ChangelogCommit[],
  entryDate: string,
): {
  id: string;
  date: string;
  rangeFrom: string;
  rangeTo: string;
  commitCount: number;
  title: string;
  summary: string;
  highlights: string[];
  sections: { heading: string; items: string[] }[];
} {
  const rangeFrom = commits[0]?.date ?? entryDate;
  const rangeTo = commits[commits.length - 1]?.date ?? entryDate;
  return {
    id: `${rangeFrom}..${rangeTo}`,
    date: entryDate,
    rangeFrom,
    rangeTo,
    commitCount: commits.length,
    title: draft.title,
    summary: draft.summary,
    highlights: [...draft.highlights],
    sections: draft.sections.map((section) => ({
      heading: section.heading,
      items: [...section.items],
    })),
  };
}
