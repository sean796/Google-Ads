type FaqEntry = { question: string; answer: string };

/** Convert Overview FAQ text (Q:/A: pairs or plain text) into Google-compliant FAQPage JSON-LD. */
export function faqTextToJsonLd(rawFaq: string | undefined | null): string | null {
  if (!rawFaq) return null;
  const trimmed = rawFaq.trim();
  if (!trimmed) return null;

  if (/FAQPage/.test(trimmed) && /"mainEntity"/.test(trimmed)) {
    return trimmed;
  }

  let jsonCandidate = trimmed;
  const scriptMatch = jsonCandidate.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  if (scriptMatch?.[1]) {
    jsonCandidate = scriptMatch[1].trim();
  }
  try {
    const parsed = JSON.parse(jsonCandidate);
    if (parsed && typeof parsed === "object" && parsed["@type"] === "FAQPage") {
      return trimmed;
    }
  } catch {
    // fall through
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const entries: FaqEntry[] = [];
  let current: FaqEntry | null = null;

  for (const line of lines) {
    if (/^Q[:-]/i.test(line)) {
      if (current) entries.push(current);
      current = { question: line.replace(/^Q[:-]\s*/i, "").trim(), answer: "" };
    } else if (/^A[:-]/i.test(line)) {
      if (!current) {
        current = { question: "", answer: line.replace(/^A[:-]\s*/i, "").trim() };
      } else {
        current.answer = line.replace(/^A[:-]\s*/i, "").trim();
      }
    } else {
      if (current && current.question && !current.answer) {
        current.question = `${current.question} ${line}`.trim();
      } else if (current && current.answer) {
        current.answer = `${current.answer} ${line}`.trim();
      } else {
        current = { question: line, answer: "" };
      }
    }
  }
  if (current) entries.push(current);

  const cleaned = entries
    .map((e) => ({
      question: e.question.trim(),
      answer: e.answer.trim(),
    }))
    .filter((e) => e.question && e.answer);

  if (!cleaned.length) return trimmed;

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: cleaned.map((e) => ({
      "@type": "Question",
      name: e.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: e.answer,
      },
    })),
  };

  const json = JSON.stringify(faqSchema);
  return `<script type="application/ld+json">${json}</script>`;
}
