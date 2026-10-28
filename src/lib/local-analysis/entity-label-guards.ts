/** Reject model instruction echoes and chain-of-thought pasted into entity/keyword fields. */
export function isLeakedInstructionEntityLabel(label: string): boolean {
  const t = label.trim();
  if (!t) return true;
  if (t.length > 120) return true;
  const lower = t.toLowerCase();
  if (lower.startsWith("we need ")) return true;
  if (/\bvalid json\b/.test(lower)) return true;
  if (/\bneed plan\b/.test(lower)) return true;
  if (/\bsub-ad\b/.test(lower)) return true;
  if (/\bsampleaddresses\b/.test(lower)) return true;
  if (/\bgridlocations\b/.test(lower)) return true;
  if (/\bposweight\b/.test(lower)) return true;
  if (/\bentitiesalreadyused\b/.test(lower)) return true;
  if (/\blet's (check|recall|search|think|verify)\b/.test(lower)) return true;
  if (/\bhmm\b/.test(lower) && t.length > 80) return true;
  return false;
}
