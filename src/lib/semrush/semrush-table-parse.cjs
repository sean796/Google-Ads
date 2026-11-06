/**
 * Shared Semrush CSV / table row parsing (execute_report text or structured rows).
 */

/**
 * @param {string} line
 * @returns {string[]}
 */
function splitCsvLine(line) {
  if (line.includes(';')) return line.split(';');
  return line.split(',');
}

/**
 * @param {string} sampleLine
 * @returns {string}
 */
function guessCsvDelimiter(sampleLine) {
  const line = (sampleLine || '').trim();
  if (!line) return ',';
  const semi = (line.match(/;/g) || []).length;
  const comma = (line.match(/,/g) || []).length;
  if (semi > comma && semi >= 1) return ';';
  if (comma > 0) return ',';
  return semi > 0 ? ';' : ',';
}

/**
 * Flatten nested objects (Semrush/MCP sometimes nests metrics).
 * @param {Record<string, unknown>} row
 * @param {number} depth
 * @returns {Record<string, unknown>}
 */
function flattenTableRow(row, depth = 0) {
  if (!row || typeof row !== 'object' || depth > 4) return row;
  const out = { ...row };
  for (const [k, v] of Object.entries(row)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v)) {
        const kk = String(k2).replace(/^\ufeff/, '').trim().toLowerCase();
        if (!(kk in out)) out[kk] = v2;
      }
    }
  }
  return out;
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function cellValueToString(v) {
  if (v == null) return '';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.length ? String(v[0]) : '';
  if (typeof v === 'object') {
    const o = /** @type {Record<string, unknown>} */ (v);
    if (o.value != null && typeof o.value !== 'object') return String(o.value);
    if (o.raw != null && typeof o.raw !== 'object') return String(o.raw);
    const vals = Object.values(o).filter((x) => x == null || typeof x !== 'object');
    if (vals.length === 1 && vals[0] != null) return String(vals[0]);
  }
  return '';
}

/**
 * @param {string} text
 * @returns {Record<string, string>[]}
 */
function rowsFromSemrushCsvText(text) {
  if (!text || typeof text !== 'string') return [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const firstLine = lines[0] || '';
  const delimiter = guessCsvDelimiter(firstLine);

  try {
    const Papa = require('papaparse');
    const parsed = Papa.parse(text, {
      header: true,
      skipEmptyLines: 'greedy',
      delimiter,
      transformHeader: (h) => String(h).replace(/^\ufeff/, '').trim().toLowerCase(),
    });
    const data = Array.isArray(parsed.data) ? parsed.data : [];
    /** @type {Record<string, string>[]} */
    const out = [];
    for (const row of data) {
      if (!row || typeof row !== 'object') continue;
      /** @type {Record<string, string>} */
      const rec = {};
      for (const [k, v] of Object.entries(row)) {
        const key = String(k).replace(/^\ufeff/, '').trim().toLowerCase();
        rec[key] = v != null ? String(v) : '';
      }
      out.push(rec);
    }
    return out;
  } catch {
    /* fall back */
  }
  if (lines.length < 2) return [];
  /** Strip BOM; lowercase headers so Or/oc/... align with normalize*(). */
  const headerParts = splitCsvLine(lines[0]).map((x) => x.replace(/^\ufeff/, '').trim().toLowerCase());
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i]).map((x) => x.trim());
    /** @type {Record<string, string>} */
    const row = {};
    for (let j = 0; j < headerParts.length; j++) {
      row[headerParts[j]] = parts[j] != null ? parts[j] : '';
    }
    out.push(row);
  }
  return out;
}

/**
 * @param {unknown} parsed
 * @param {number} depth
 * @returns {Array<Record<string, unknown>> | null}
 */
function findFirstArrayOfObjects(parsed, depth = 0) {
  if (depth > 8 || parsed == null) return null;
  if (Array.isArray(parsed)) {
    if (parsed.length > 0 && parsed.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
      return /** @type {Array<Record<string, unknown>>} */ (parsed);
    }
    for (const el of parsed) {
      const r = findFirstArrayOfObjects(el, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof parsed === 'object') {
    const o = /** @type {Record<string, unknown>} */ (parsed);
    const rows = o.rows ?? o.data ?? o.items ?? o.result;
    if (Array.isArray(rows)) {
      const r = findFirstArrayOfObjects(rows, depth + 1);
      if (r) return r;
    }
    for (const k of Object.keys(o)) {
      const r = findFirstArrayOfObjects(o[k], depth + 1);
      if (r) return r;
    }
  }
  return null;
}

/**
 * @param {unknown} parsed
 * @returns {Record<string, string>[]}
 */
function extractRawTableRows(parsed) {
  if (parsed == null) return [];
  if (typeof parsed === 'string') {
    return rowsFromSemrushCsvText(parsed);
  }
  if (typeof parsed === 'object') {
    const o = /** @type {Record<string, unknown>} */ (parsed);
    if (typeof o.rawText === 'string') {
      return extractRawTableRows(o.rawText);
    }
    const rows = o.rows ?? o.data ?? o.items;
    // MCP sometimes returns rows: [] at the top level while the table lives in nested fields - do not short-circuit.
    if (Array.isArray(rows) && rows.length > 0) {
      const out = [];
      for (const row of rows) {
        if (row && typeof row === 'object') {
          const flat = flattenTableRow(/** @type {Record<string, unknown>} */ (row));
          /** @type {Record<string, string>} */
          const rec = {};
          for (const [k, v] of Object.entries(flat)) {
            const key = String(k).replace(/^\ufeff/, '').trim().toLowerCase();
            rec[key] = cellValueToString(v);
          }
          out.push(rec);
        }
      }
      return out;
    }
    if (typeof o.text === 'string' && o.text.trim()) {
      return extractRawTableRows(o.text);
    }
    if (typeof o.csv === 'string' && o.csv.trim()) {
      return extractRawTableRows(o.csv);
    }
    const found = findFirstArrayOfObjects(o);
    if (found && found.length) {
      const out = [];
      for (const row of found) {
        if (row && typeof row === 'object') {
          const flat = flattenTableRow(/** @type {Record<string, unknown>} */ (row));
          /** @type {Record<string, string>} */
          const rec = {};
          for (const [k, v] of Object.entries(flat)) {
            const key = String(k).replace(/^\ufeff/, '').trim().toLowerCase();
            rec[key] = cellValueToString(v);
          }
          out.push(rec);
        }
      }
      return out;
    }
  }
  return [];
}

module.exports = {
  splitCsvLine,
  guessCsvDelimiter,
  rowsFromSemrushCsvText,
  extractRawTableRows,
  findFirstArrayOfObjects,
  flattenTableRow,
  cellValueToString,
};
