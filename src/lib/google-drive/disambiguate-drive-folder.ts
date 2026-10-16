import { z } from "zod";
import { createPulseAgent } from "@/lib/agent-pipeline";
import type { DriveFolderMatch } from "@/lib/google-drive/drive-folder-api";

export type DisambiguateDriveFolderInput = {
  apiKey: string;
  model: string;
  siteName: string;
  siteUrl?: string;
  purpose: string;
  candidates: DriveFolderMatch[];
  signal?: AbortSignal;
};

export type DisambiguateDriveFolderResult = {
  folderId: string;
  reason?: string;
};

const DriveFolderDisambiguatorInputSchema = z.object({
  siteName: z.string(),
  siteUrl: z.string().optional(),
  purpose: z.string(),
  candidates: z.array(
    z.object({
      folderId: z.string().min(1),
      name: z.string().min(1),
    }),
  ),
});

const DriveFolderDisambiguatorOutputSchema = z.object({
  folderId: z.string().min(1),
  reason: z.string().optional(),
});

export const driveFolderDisambiguatorAgent = createPulseAgent({
  id: "workflow.drive.folder-disambiguator",
  label: "Google Drive Folder Disambiguation Agent",
  category: "research",
  domain: "reporting",
  reason: "Selects the matching client and purpose Google Drive destination folder from multiple candidate folders.",
  temperature: 0,
  maxTokens: 300,
  responseFormat: { type: "json_object" },
  inputSchema: DriveFolderDisambiguatorInputSchema,
  outputSchema: DriveFolderDisambiguatorOutputSchema,
  buildSystemPrompt: () =>
    'Pick the best Google Drive folder for the client and purpose. Reply with JSON only: {"folderId":"...","reason":"..."}. folderId must match one candidate id exactly.',
  buildUserPrompt: (input) => {
    const candidateLines = input.candidates
      .map((candidate, index) => `${index + 1}. id=${candidate.folderId} name=${candidate.name}`)
      .join("\n");
    return [
      `Client: ${input.siteName}`,
      input.siteUrl ? `Site URL: ${input.siteUrl}` : "",
      `Purpose: ${input.purpose}`,
      "Candidates:",
      candidateLines,
    ]
      .filter(Boolean)
      .join("\n");
  },
});

export async function disambiguateDriveFolder(
  input: DisambiguateDriveFolderInput,
): Promise<DisambiguateDriveFolderResult> {
  if (input.candidates.length === 0) {
    throw new Error("No Google Drive folder candidates to disambiguate.");
  }
  if (input.candidates.length === 1) {
    return { folderId: input.candidates[0]!.folderId, reason: "single_match" };
  }

  const parsed = await driveFolderDisambiguatorAgent.run(
    {
      siteName: input.siteName,
      siteUrl: input.siteUrl,
      purpose: input.purpose,
      candidates: input.candidates.map((c) => ({ folderId: c.folderId, name: c.name })),
    },
    {
      apiKey: input.apiKey,
      signal: input.signal,
    },
  );

  const allowed = new Set(input.candidates.map((candidate) => candidate.folderId));
  if (!allowed.has(parsed.folderId)) {
    throw new Error("Drive folder disambiguation picked a folder outside the candidate list.");
  }
  return parsed;
}
