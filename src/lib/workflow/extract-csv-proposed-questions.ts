import { z } from "zod";
import { createPulseAgent } from "@/lib/agent-pipeline";

const QUESTIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

const SYSTEM = `You extract proposed FAQ / conversational search questions from an article audit or SWOT.

Return JSON only: { "questions": string[] }.
Each item is one complete question a searcher or AI assistant would ask.
Use only questions that appear in the source (FAQ lists, quoted queries, "target conversational" items).
Do not invent questions. Do not include the original grade-the-article prompt.`;

const CsvProposedQuestionsInputSchema = z.object({
  research: z.string().min(1),
});

const CsvProposedQuestionsOutputSchema = z.object({
  questions: z.array(z.string()),
});

export const csvProposedQuestionsAgent = createPulseAgent({
  id: "workflow.csv.proposed-questions",
  label: "Workflow CSV Proposed Questions Extractor",
  category: "research",
  domain: "aiseo",
  reason: "Extracts proposed conversational search and FAQ questions from upstream CSV research cells for DFS LLM article audits.",
  temperature: 0,
  maxTokens: 1200,
  responseFormat: {
    type: "json_schema",
    json_schema: {
      name: "csv_proposed_questions",
      strict: true,
      schema: QUESTIONS_SCHEMA,
    },
  },
  inputSchema: CsvProposedQuestionsInputSchema,
  outputSchema: CsvProposedQuestionsOutputSchema,
  buildSystemPrompt: () => SYSTEM,
  buildUserPrompt: (input) => `Extract proposed questions from this audit:\n\n${input.research}`,
});

export async function extractCsvProposedQuestions(research: string): Promise<string[]> {
  const source = research.trim();
  if (!source) {
    throw new Error("CSV research is empty; cannot extract proposed questions.");
  }

  const parsed = await csvProposedQuestionsAgent.run({ research: source });
  const questions = parsed.questions.map((item) => item.trim()).filter(Boolean);
  if (questions.length === 0) {
    throw new Error("OpenRouter returned no proposed questions from the CSV research.");
  }
  return questions;
}
