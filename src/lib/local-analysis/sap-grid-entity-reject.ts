/** Head token (first comma segment) for entity labels like "Millwood, Naples, FL". */
export function sapGridEntityHead(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "";
  return trimmed.split(",")[0]?.trim() ?? "";
}

const REJECTED_HEAD_PATTERN =
  /\b(police|sheriff|fire department|fire station|courthouse|jail|prison|detention|correctional|embassy|consulate|military base|army base|naval base|air force base|city hall|town hall|municipal hall|post office|dmv|department of|ministry of|murder|shooting|trial|disaster|accident|serial killer|sex offender)\b/i;

const REJECTED_WHOLE_PATTERN =
  /\b(conference|disambiguation|list of|biography|born \d{4}|died \d{4})\b/i;

/** Abstract or non-place topics that sometimes appear in Wikipedia harvest. */
const REJECTED_ABSTRACT_HEAD =
  /^(multiculturalism|globalization|capitalism|socialism|feminism|democracy|philosophy|religion)$/i;

const GEO_PLACE_TAIL =
  /^(bay|beach|park|hills|grove|village|estates|heights|island|landing|point|springs|walk|woods|center|centre|district|quarter|crossing|commons|meadows|trace|trail|creek|ridge|valley|harbour|harbor|lake|river|field|gate|gardens|manor|square|terrace|view|villas|downtown|midtown|uptown|north|south|east|west)$/i;

/** Two-token Title Case with no geographic tail (common biography disambiguation leak). */
function looksLikePersonNameHead(head: string): boolean {
  const parts = head.trim().split(/\s+/).filter(Boolean);
  if (parts.length !== 2) return false;
  const [a, b] = parts;
  if (!a || !b) return false;
  if (!/^[A-Z][a-zA-Z'-]+$/.test(a) || !/^[A-Z][a-zA-Z'-]+$/.test(b)) return false;
  if (GEO_PLACE_TAIL.test(b)) return false;
  return true;
}

/**
 * Reject entity labels that are not sensible local grid targets for service-area pages
 * (law enforcement, jails, news/crime, abstract topics, instruction leaks).
 */
export function isRejectedSapGridEntityLabel(label: string): boolean {
  const trimmed = label.trim();
  if (!trimmed) return true;
  const head = sapGridEntityHead(trimmed);
  if (!head) return true;
  if (head.length > 80) return true;
  if (REJECTED_WHOLE_PATTERN.test(trimmed)) return true;
  if (REJECTED_HEAD_PATTERN.test(head) || REJECTED_HEAD_PATTERN.test(trimmed)) return true;
  if (REJECTED_ABSTRACT_HEAD.test(head)) return true;
  if (looksLikePersonNameHead(head)) return true;
  return false;
}

/** Same rules for Wikipedia article titles before they enter the harvest pool or pick list. */
export function isRejectedSapGridWikiTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return true;
  if (/\(disambiguation\)$/i.test(t)) return true;
  if (isRejectedSapGridEntityLabel(t)) return true;
  if (/\bdepartment of\b/i.test(t)) return true;
  if (/\bpolice department\b/i.test(t)) return true;
  if (/\bsheriff'?s office\b/i.test(t)) return true;
  if (/\bjustice\b/i.test(t) && !/\bpark\b/i.test(t)) return true;
  return false;
}
