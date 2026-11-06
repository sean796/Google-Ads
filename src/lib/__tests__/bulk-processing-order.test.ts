import { describe, expect, it } from 'vitest';
import {
  applyRowOrder,
  buildBulkBaseRows,
  identityRowOrder,
  shuffleRowOrder,
} from '@/lib/bulk-processing-order';
import type { CSVRow } from '@/lib/bulk-auto-generate';

const row = (title: string): CSVRow => ({
  title,
  keyword: 'k',
  meta_description: '',
});

describe('buildBulkBaseRows', () => {
  it('returns csv rows in csv mode', () => {
    const r = [row('a'), row('b')];
    const out = buildBulkBaseRows('csv', r, [], new Set());
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.baseRows).toEqual(r);
      expect(out.baseDisplayIndices).toBeUndefined();
    }
  });

  it('fails when csv empty', () => {
    const out = buildBulkBaseRows('csv', [], [row('x')], new Set());
    expect(out.ok).toBe(false);
    if (out.ok === false) expect(out.reason).toBe('csv_empty');
  });

  it('uses selection in prompt mode', () => {
    const g = [row('0'), row('1'), row('2')];
    const out = buildBulkBaseRows('prompt', [], g, new Set([2, 0]));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.baseRows.map((x) => x.title)).toEqual(['0', '2']);
      expect(out.baseDisplayIndices).toEqual([0, 2]);
    }
  });

  it('uses all generated when no selection', () => {
    const g = [row('a'), row('b')];
    const out = buildBulkBaseRows('prompt', [], g, new Set());
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.baseRows).toEqual(g);
      expect(out.baseDisplayIndices).toBeUndefined();
    }
  });
});

describe('applyRowOrder', () => {
  it('reorders rows and parallel display indices', () => {
    const base = [row('a'), row('b'), row('c')];
    const disp = [10, 20, 30];
    const { orderedRows, orderedDisplayIndices } = applyRowOrder(base, disp, [2, 0, 1]);
    expect(orderedRows.map((x) => x.title)).toEqual(['c', 'a', 'b']);
    expect(orderedDisplayIndices).toEqual([30, 10, 20]);
  });

  it('falls back to identity when order length mismatches', () => {
    const base = [row('a'), row('b')];
    const { orderedRows } = applyRowOrder(base, undefined, [0]);
    expect(orderedRows.map((x) => x.title)).toEqual(['a', 'b']);
  });
});

describe('shuffleRowOrder', () => {
  it('returns a permutation of length n', () => {
    const n = 8;
    const s = shuffleRowOrder(n);
    expect(s).toHaveLength(n);
    const sorted = [...s].sort((a, b) => a - b);
    expect(sorted).toEqual(identityRowOrder(n));
  });
});
