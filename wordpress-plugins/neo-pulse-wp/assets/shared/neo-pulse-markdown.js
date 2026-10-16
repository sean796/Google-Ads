/**
 * Lightweight markdown for Flow Assist answer cards (bold, links, lists, tables, headings).
 */
(function (global) {
  'use strict';

  function decodeDisplayText(text) {
    if (global.NeoPulseDisplayText && typeof global.NeoPulseDisplayText.decode === 'function') {
      return global.NeoPulseDisplayText.decode(text);
    }
    return text == null ? '' : String(text);
  }

  // Escapes quotes too: the output is used inside href="..." attributes.
  function esc(text) {
    return String(decodeDisplayText(text))
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Only http(s), mailto, tel and site-relative links are ever rendered as <a>.
  function safeHref(url) {
    var u = String(url == null ? '' : url).trim();
    if (/^(https?:\/\/|mailto:|tel:)/i.test(u)) {
      return u;
    }
    if (/^\/(?!\/)/.test(u) || /^#/.test(u)) {
      return u;
    }
    return '';
  }

  function linkHtml(label, url) {
    var href = safeHref(url);
    return href ? '<a href="' + href + '">' + label + '</a>' : label;
  }

  function telHref(raw) {
    var digits = String(raw).replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      return '';
    }
    if (/^\s*\+/.test(raw)) {
      return 'tel:+' + digits;
    }
    return 'tel:' + digits;
  }

  function autoLinkContacts(html) {
    var saved = [];
    html = html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, function (match) {
      var id = saved.length;
      saved.push(match);
      return '\x00LINK' + id + '\x00';
    });

    html = html.replace(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g, function (_, email) {
      return '<a href="mailto:' + email + '">' + email + '</a>';
    });

    html = html.replace(/(?:\+?\d{1,3}[-.\s]?)?(?:\([0-9]{3}\)|[0-9]{3})[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g, function (match) {
      var href = telHref(match);
      if (!href) {
        return match;
      }
      return '<a href="' + href + '">' + match + '</a>';
    });

    html = html.replace(/\x00LINK(\d+)\x00/g, function (_, id) {
      return saved[Number(id)];
    });

    return html;
  }

  function repairOrphanLinkTails(text) {
    return String(text)
      .replace(/\[\[([^\]]+)\]\((https?:\/\/[^)]+)\)\]\((https?:\/\/[^)]+)\)/g, '[$1]($2)')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)\]\((https?:\/\/[^)]+)\)/g, '[$1]($2)')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)\((https?:\/\/[^)]+)\)/g, '[$1]($2)')
      .replace(/\[([^\]]+):\]\((https?:\/\/[^)]+)\)/g, '[$1]($2):')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)([a-z]{1,3})(?=\s|:|,|\.|$|\))/gi, '[$1$3]($2)');
  }

  function protectMarkdownLinks(text) {
    var saved = [];
    var out = String(text).replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, function (match) {
      var id = saved.length;
      saved.push(match);
      return '\x00MDLINK' + id + '\x00';
    });
    return { text: out, saved: saved };
  }

  function restoreMarkdownLinks(text, saved) {
    return String(text).replace(/\x00MDLINK(\d+)\x00/g, function (_, id) {
      return saved[Number(id)];
    });
  }

  function inlineMarkdown(text) {
    var s = esc(text);
    s = repairOrphanLinkTails(s);
    var protectedLinks = protectMarkdownLinks(s);
    s = protectedLinks.text;
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = restoreMarkdownLinks(s, protectedLinks.saved);
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, function (_, label, url) {
      return linkHtml(label, url);
    });
    s = s.replace(/\[([^\]]+)\]\((mailto:[^)]+)\)/gi, function (_, label, url) {
      return linkHtml(label, url);
    });
    s = s.replace(/\[([^\]]+)\]\((tel:[^)]+)\)/gi, function (_, label, url) {
      return linkHtml(label, url);
    });
    return autoLinkContacts(s);
  }

  function isTableRow(line) {
    return /^\|.+\|$/.test(String(line).trim());
  }

  function isTableSeparator(line) {
    return /^\|[\s\-:|]+\|$/.test(String(line).trim());
  }

  function parseTableCells(line) {
    return String(line).trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (cell) {
      return cell.trim();
    });
  }

  function renderTableHtml(tableLines) {
    if (!tableLines || !tableLines.length) {
      return '';
    }

    var separatorIdx = -1;
    for (var j = 0; j < tableLines.length; j++) {
      if (isTableSeparator(tableLines[j])) {
        separatorIdx = j;
        break;
      }
    }

    var html = ['<div class="fcw-md-table-wrap"><table class="fcw-md-table">'];
    var bodyStart = 0;

    if (separatorIdx > 0) {
      html.push('<thead><tr>');
      parseTableCells(tableLines[separatorIdx - 1]).forEach(function (cell) {
        html.push('<th>' + inlineMarkdown(cell) + '</th>');
      });
      html.push('</tr></thead>');
      bodyStart = separatorIdx + 1;
    }

    html.push('<tbody>');
    for (var k = bodyStart; k < tableLines.length; k++) {
      if (isTableSeparator(tableLines[k])) {
        continue;
      }
      html.push('<tr>');
      parseTableCells(tableLines[k]).forEach(function (cell) {
        html.push('<td>' + inlineMarkdown(cell) + '</td>');
      });
      html.push('</tr>');
    }
    html.push('</tbody></table></div>');

    return html.join('');
  }

  function renderMarkdown(text) {
    if (text == null || text === '') {
      return '';
    }

    var lines = String(text).split('\n');
    var out = [];
    var inUl = false;
    var inOl = false;
    var paraLines = [];
    var i = 0;

    function closeLists() {
      if (inUl) {
        out.push('</ul>');
        inUl = false;
      }
      if (inOl) {
        out.push('</ol>');
        inOl = false;
      }
    }

    function flushParagraph() {
      if (!paraLines.length) {
        return;
      }
      var content = paraLines.map(function (line) {
        return inlineMarkdown(line.trim());
      }).join(' ');
      out.push('<p class="fcw-md-p">' + content + '</p>');
      paraLines = [];
    }

    while (i < lines.length) {
      var trimmed = lines[i].trim();

      if (isTableRow(trimmed)) {
        flushParagraph();
        closeLists();
        var tableLines = [];
        while (i < lines.length && isTableRow(lines[i].trim())) {
          tableLines.push(lines[i].trim());
          i++;
        }
        out.push(renderTableHtml(tableLines));
        continue;
      }

      var headingMatch = trimmed.match(/^###\s+(.+)$/);
      if (headingMatch) {
        flushParagraph();
        closeLists();
        out.push('<h3 class="fcw-md-heading">' + inlineMarkdown(headingMatch[1]) + '</h3>');
        i++;
        continue;
      }

      var ulMatch = trimmed.match(/^[*\-]\s+(.+)$/);
      if (ulMatch) {
        flushParagraph();
        if (inOl) {
          out.push('</ol>');
          inOl = false;
        }
        if (!inUl) {
          out.push('<ul class="fcw-md-list">');
          inUl = true;
        }
        out.push('<li>' + inlineMarkdown(ulMatch[1]) + '</li>');
        i++;
        continue;
      }

      var olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
      if (olMatch) {
        flushParagraph();
        if (inUl) {
          out.push('</ul>');
          inUl = false;
        }
        if (!inOl) {
          out.push('<ol class="fcw-md-list fcw-md-list--ordered">');
          inOl = true;
        }
        out.push('<li>' + inlineMarkdown(olMatch[1]) + '</li>');
        i++;
        continue;
      }

      closeLists();

      if (trimmed === '') {
        flushParagraph();
        i++;
        continue;
      }

      paraLines.push(lines[i]);
      i++;
    }

    flushParagraph();
    closeLists();

    return out.join('');
  }

  global.NeoPulseMarkdown = {
    render: renderMarkdown,
    inline: inlineMarkdown,
    escape: esc,
    safeHref: safeHref
  };
})(typeof window !== 'undefined' ? window : this);
