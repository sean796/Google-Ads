/**
 * Enforce Overview key-point shape: each <li> starts with <strong>Label</strong>: …
 * Colon after the bold label (never a comma). Deterministic HTML fix when the model drifts.
 */

function liInnerStartsWithBold(inner: string): boolean {
  const t = inner.trimStart().toLowerCase();
  return t.startsWith("<strong") || t.startsWith("<b>") || t.startsWith("<b ");
}

/** First colon or comma not inside an HTML tag (colon preferred when both exist earlier). */
function indexOfLabelSeparatorOutsideTags(s: string): number {
  let inTag = false;
  let commaAt = -1;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]!;
    if (ch === "<") {
      inTag = true;
      continue;
    }
    if (ch === ">") {
      inTag = false;
      continue;
    }
    if (inTag) continue;
    if (ch === ":") return i;
    if (ch === "," && commaAt < 0) commaAt = i;
  }
  return commaAt;
}

/** After </strong> or </b>, force `:` (replace a mistaken comma). */
function forceColonAfterBoldClose(s: string): string {
  const lower = s.toLowerCase();
  let closeAt = -1;
  let closeLen = 0;
  const strongClose = lower.indexOf("</strong>");
  const bClose = lower.indexOf("</b>");
  if (strongClose >= 0 && (bClose < 0 || strongClose <= bClose)) {
    closeAt = strongClose;
    closeLen = "</strong>".length;
  } else if (bClose >= 0) {
    closeAt = bClose;
    closeLen = "</b>".length;
  }
  if (closeAt < 0) return s;

  const afterClose = s.slice(closeAt + closeLen);
  let i = 0;
  while (i < afterClose.length && (afterClose[i] === " " || afterClose[i] === "\t")) i += 1;
  if (i >= afterClose.length) return `${s.slice(0, closeAt + closeLen)}:`;
  const ch = afterClose[i]!;
  if (ch === ":") return s;
  if (ch === ",") {
    return `${s.slice(0, closeAt + closeLen)}${afterClose.slice(0, i)}:${afterClose.slice(i + 1)}`;
  }
  if (ch === "\u2014" || ch === "\u2013" || ch === "-") {
    let j = i + 1;
    while (j < afterClose.length && (afterClose[j] === " " || afterClose[j] === "\t")) j += 1;
    return `${s.slice(0, closeAt + closeLen)}:${afterClose.slice(j) ? ` ${afterClose.slice(j)}` : ""}`;
  }
  return `${s.slice(0, closeAt + closeLen)}:${afterClose.slice(i) ? ` ${afterClose.slice(i)}` : ""}`;
}

/** Convert leading markdown bold **Label** to <strong>Label</strong> inside list item text. */
function stripMarkdownBoldPrefix(inner: string): string {
  const t = inner.trimStart();
  const lead = inner.slice(0, inner.length - t.length);
  const md = t.match(/^\*\*([^*]+)\*\*(.*)$/s);
  if (!md) return inner;
  const label = md[1]!.trim();
  let rest = (md[2] ?? "").trimStart();
  if (rest.startsWith(",")) rest = rest.slice(1).trimStart();
  if (!rest.startsWith(":")) rest = rest ? `: ${rest}` : ":";
  return `${lead}<strong>${label}</strong>${rest}`;
}

function boldLabelOneLiInner(inner: string): string {
  const trimmedStart = inner.trimStart();
  const leadingWs = inner.slice(0, inner.length - trimmedStart.length);
  if (!trimmedStart) return inner;

  if (/^\*\*[^*]+\*\*/.test(trimmedStart)) {
    return stripMarkdownBoldPrefix(inner);
  }

  if (liInnerStartsWithBold(trimmedStart)) {
    return `${leadingWs}${forceColonAfterBoldClose(trimmedStart)}`;
  }

  const sepAt = indexOfLabelSeparatorOutsideTags(trimmedStart);
  if (sepAt <= 0) {
    return inner;
  }

  const label = trimmedStart.slice(0, sepAt).trim();
  const rest = trimmedStart.slice(sepAt + 1);
  if (!label) return inner;
  return `${leadingWs}<strong>${label}</strong>:${rest.startsWith(" ") ? rest : ` ${rest}`}`;
}

/**
 * Walk every <li>…</li> and ensure each starts with <strong>Label</strong>: …
 */
/** All document <li> labels: same repair as Overview bullets (alias for harness QC). */
export function ensureHarnessListItemBoldLabels(html: string): string {
  return ensureOverviewBulletBoldLabels(html);
}

export function ensureOverviewBulletBoldLabels(html: string): string {
  const src = html ?? "";
  if (!src.trim()) return src;
  const lower = src.toLowerCase();
  let out = "";
  let cursor = 0;
  let searchFrom = 0;

  while (true) {
    const openAt = lower.indexOf("<li", searchFrom);
    if (openAt < 0) {
      out += src.slice(cursor);
      break;
    }
    const openEnd = src.indexOf(">", openAt);
    if (openEnd < 0) {
      out += src.slice(cursor);
      break;
    }
    const closeAt = lower.indexOf("</li>", openEnd + 1);
    if (closeAt < 0) {
      out += src.slice(cursor);
      break;
    }

    out += src.slice(cursor, openEnd + 1);
    const inner = src.slice(openEnd + 1, closeAt);
    out += boldLabelOneLiInner(inner);
    out += src.slice(closeAt, closeAt + "</li>".length);

    cursor = closeAt + "</li>".length;
    searchFrom = cursor;
  }

  return out;
}

/** True when Overview has 3+ <li> and every <li> starts with <strong> or <b>. */
export function overviewBulletsHaveBoldLabels(html: string): boolean {
  const lower = (html ?? "").toLowerCase();
  let searchFrom = 0;
  let liCount = 0;
  let boldCount = 0;
  while (true) {
    const openAt = lower.indexOf("<li", searchFrom);
    if (openAt < 0) break;
    const openEnd = lower.indexOf(">", openAt);
    if (openEnd < 0) break;
    const closeAt = lower.indexOf("</li>", openEnd + 1);
    if (closeAt < 0) break;
    liCount += 1;
    const inner = html.slice(openEnd + 1, closeAt);
    if (liInnerStartsWithBold(inner)) boldCount += 1;
    searchFrom = closeAt + 5;
  }
  return liCount >= 3 && boldCount === liCount;
}
