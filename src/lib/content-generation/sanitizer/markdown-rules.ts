import { contentAlreadyHasBlockHtml } from "@/lib/content-generation/content-format";

/** Stats for convertAllMarkdownToHtml debugging */
interface MarkdownConversionStats {
  images: number;
  links: number;
  bold: number;
  italic: number;
  strikethrough: number;
  inlineCode: number;
  codeBlocks: number;
  headings: number;
  blockquotes: number;
  horizontalRules: number;
  unorderedListItems: number;
  orderedListItems: number;
  tables: number;
}

/**
 * Convert EVERY markdown link [text](url) to HTML. Runs in a loop until none left.
 * Use this as a final safety net so entity/Wikipedia links can never slip through.
 */
export function forceConvertMarkdownLinks(content: string): string {
  if (!content || !content.trim()) return content;
  let out = content;
  let prev = '';
  let iterations = 0;
  const maxIterations = 50;
  // Match [text](url) - optional whitespace before ( for model output
  const markdownLinkRegex = /\[([^\]]*)\]\s*\((https?:\/\/[^)]+)\)/g;
  const markdownHashLinkRegex = /\[([^\]]*)\]\s*\((#[^)]+)\)/g;
  while (out !== prev && iterations < maxIterations) {
    prev = out;
    out = out.replace(markdownLinkRegex, (_, text: string, url: string) => {
      const u = url.trim().replace(/"/g, '&quot;').replace(/&/g, '&amp;');
      const t = (text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<a href="${u}">${t}</a>`;
    });
    out = out.replace(markdownHashLinkRegex, (_, text: string, hash: string) => {
      const h = hash.trim().replace(/"/g, '&quot;');
      const t = (text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<a href="${h}">${t}</a>`;
    });
    iterations++;
  }
  return out;
}

/**
 * Convert ALL remaining markdown syntax to HTML. No exceptions.
 * Used before WordPress upload so that zero markdown appears on published pages.
 * Safe to run on already-HTML content (no-op when no markdown patterns found).
 */
export function convertAllMarkdownToHtml(content: string): string {
  if (!content || !content.trim()) return content;

  if (contentAlreadyHasBlockHtml(content)) {
    return forceConvertMarkdownLinks(content);
  }

  const stats: MarkdownConversionStats = {
    images: 0,
    links: 0,
    bold: 0,
    italic: 0,
    strikethrough: 0,
    inlineCode: 0,
    codeBlocks: 0,
    headings: 0,
    blockquotes: 0,
    horizontalRules: 0,
    unorderedListItems: 0,
    orderedListItems: 0,
    tables: 0,
  };

  let out = content;

  // 0. CRITICAL: Convert ALL markdown links first (entity/Wikipedia etc.) - no exceptions
  out = forceConvertMarkdownLinks(out);

  // 1. Code blocks (before inline code / other patterns so we don't alter content inside)
  out = out.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    stats.codeBlocks++;
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return `<pre><code${lang ? ` class="language-${lang}"` : ''}>${escaped}</code></pre>`;
  });

  // 2. Markdown images ![alt](url)
  out = out.replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, (_, alt, url) => {
    stats.images++;
    const safeUrl = (url || '').trim().replace(/"/g, '&quot;');
    const safeAlt = (alt || '').replace(/"/g, '&quot;');
    return `<img src="${safeUrl}" alt="${safeAlt}">`;
  });

  // 3. Markdown links [text](url) again (in case any appeared inside code blocks or after other edits)
  out = out.replace(/\[([^\]]+)\]\s*\((https?:\/\/[^)]+)\)/g, (_, text, url) => {
    stats.links++;
    const safeUrl = (url || '').trim().replace(/"/g, '&quot;').replace(/&/g, '&amp;');
    const safeText = (text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<a href="${safeUrl}">${safeText}</a>`;
  });
  // Final link pass so nothing survives
  out = forceConvertMarkdownLinks(out);

  // 4. Bold ***text*** and ___text___
  out = out.replace(/\*\*\*([^*]+)\*\*\*/g, (_, t) => {
    stats.bold++;
    stats.italic++;
    return `<strong><em>${t}</em></strong>`;
  });
  out = out.replace(/___([^_]+)___/g, (_, t) => {
    stats.bold++;
    stats.italic++;
    return `<strong><em>${t}</em></strong>`;
  });

  // 5. Bold **text** and __text__
  out = out.replace(/\*\*([^*]+)\*\*/g, (_, t) => {
    stats.bold++;
    return `<strong>${t}</strong>`;
  });
  out = out.replace(/__([^_]+)__/g, (_, t) => {
    stats.bold++;
    return `<strong>${t}</strong>`;
  });

  // 6. Strikethrough ~~text~~
  out = out.replace(/~~([^~]+)~~/g, (_, t) => {
    stats.strikethrough++;
    return `<del>${t}</del>`;
  });

  // 7. Italic *text* and _text_ (single; avoid matching ** or __)
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_, t) => {
    stats.italic++;
    return `<em>${t}</em>`;
  });
  out = out.replace(/(?<!_)_([^_]+)_(?!_)/g, (_, t) => {
    stats.italic++;
    return `<em>${t}</em>`;
  });

  // 8. Inline code `code`
  out = out.replace(/`([^`]+)`/g, (_, code) => {
    stats.inlineCode++;
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<code>${escaped}</code>`;
  });

  // 9. Headings (line-based)
  const lines = out.split('\n');
  const newLines = lines.map((line) => {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      stats.headings++;
      return `<h${level}>${match[2]}</h${level}>`;
    }
    return line;
  });
  out = newLines.join('\n');

  // 10. Horizontal rules (standalone ---, ***, ___)
  out = out.replace(/^(---|\*\*\*|___)\s*$/gm, () => {
    stats.horizontalRules++;
    return '<hr>';
  });

  // 11. Blockquotes > line
  out = out.replace(/^>\s?(.*)$/gm, (_, t) => {
    stats.blockquotes++;
    return `<blockquote>${t}</blockquote>`;
  });

  // 12. Markdown tables: pipe-delimited blocks -> HTML table
  const tableBlockRegex = /^(\s*)\|.+\|\s*$/gm;
  let tableStart: number;
  const lineArray = out.split('\n');
  const resultLines: string[] = [];
  let i = 0;
  while (i < lineArray.length) {
    const line = lineArray[i];
    if (/^\s*\|.+\|\s*$/.test(line)) {
      const tableLines: string[] = [];
      let j = i;
      while (j < lineArray.length && /^\s*\|.+\|\s*$/.test(lineArray[j])) {
        tableLines.push(lineArray[j]);
        j++;
      }
      const sepCount = tableLines.filter((l) => /^\s*\|[\s\-:]+\|\s*$/.test(l.trim())).length;
      if (tableLines.length >= 2 && sepCount >= 1) {
        const headerRow = tableLines[0].trim();
        const sepRow = tableLines[1].trim();
        const dataRows = tableLines.slice(2);
        const parseCells = (row: string) =>
          row
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((c) => c.trim());
        const headers = parseCells(headerRow);
        let html = '<table><thead><tr>';
        headers.forEach((h) => {
          html += `<th>${h}</th>`;
        });
        html += '</tr></thead><tbody>';
        dataRows.forEach((row) => {
          const cells = parseCells(row.trim());
          if (cells.some((c) => c)) {
            html += '<tr>';
            cells.forEach((c) => {
              html += `<td>${c}</td>`;
            });
            html += '</tr>';
          }
        });
        html += '</tbody></table>';
        resultLines.push(html);
        stats.tables++;
        i = j;
        continue;
      }
    }
    resultLines.push(line);
    i++;
  }
  out = resultLines.join('\n');

  // 13. Unordered list items (line starting with - or * or + followed by space)
  out = out.replace(/^(\s*)([-*+])\s+(.+)$/gm, (_, indent, bullet, rest) => {
    stats.unorderedListItems++;
    return `${indent}<ul><li>${rest}</li></ul>`;
  });

  // 14. Ordered list items
  out = out.replace(/^(\s*)\d+\.\s+(.+)$/gm, (_, indent, rest) => {
    stats.orderedListItems++;
    return `${indent}<ol><li>${rest}</li></ol>`;
  });

  const total =
    stats.images +
    stats.links +
    stats.bold +
    stats.italic +
    stats.strikethrough +
    stats.inlineCode +
    stats.codeBlocks +
    stats.headings +
    stats.blockquotes +
    stats.horizontalRules +
    stats.unorderedListItems +
    stats.orderedListItems +
    stats.tables;
  return out;
}

