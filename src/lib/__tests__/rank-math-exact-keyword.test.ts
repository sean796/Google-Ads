import { describe, it, expect } from 'vitest';
import {
  truncatePreservingMandatorySubstring,
  formatKeywordForDisplay,
  ensureExactKeywordInSeoTitle,
  ensureExactKeywordInMetaDescription,
  focusKeywordRepresentedInSeoTitle,
} from "../content-generation/pulse-seo-exact-keyword";

describe('truncatePreservingMandatorySubstring', () => {
  it('keeps needle verbatim when shortening from the left', () => {
    const text =
      'Intro text here and more filler before Edmonton dental implants guide for patients';
    const needle = 'Edmonton dental implants';
    const out = truncatePreservingMandatorySubstring(text, needle, 40);
    expect(out.length).toBe(40);
    expect(out.includes(needle)).toBe(true);
  });

  it('returns full needle when needle is longer than maxLen', () => {
    const needle = 'a'.repeat(70);
    const text = `prefix ${needle} suffix`;
    expect(truncatePreservingMandatorySubstring(text, needle, 60)).toBe(needle);
  });

  it('plain truncates when needle is empty', () => {
    expect(truncatePreservingMandatorySubstring('hello world', '', 5)).toBe('hello');
  });
});

describe('formatKeywordForDisplay', () => {
  it('title-cases each word', () => {
    expect(formatKeywordForDisplay('de waard tents')).toBe('De Waard Tents');
    expect(formatKeywordForDisplay('EDMONTON dentist')).toBe('Edmonton Dentist');
  });
});

describe('ensureExactKeywordInSeoTitle', () => {
  it('prepends title-cased keyword when missing', () => {
    const out = ensureExactKeywordInSeoTitle('Complete Guide to Smiles', 'Edmonton dentist', 60);
    expect(out.toLowerCase()).toContain('edmonton dentist');
    expect(out.startsWith('Edmonton Dentist:')).toBe(true);
  });

  it('weaves with " in " and strips redundant chiropractor/near when keyword already covers them', () => {
    const out = ensureExactKeywordInSeoTitle(
      'Chiropractor Near Beltline Calgary',
      'chiropractic near me',
      60
    );
    expect(out).toBe('Chiropractic Near Me in Beltline Calgary');
    expect(out.toLowerCase()).toContain('chiropractic near me');
  });

  it('does not duplicate when phrase differs only by casing from focus keyword', () => {
    const out = ensureExactKeywordInSeoTitle(
      'De Waard Tents vs. Modern Options',
      'de waard tents',
      60
    );
    expect(out).toBe('De Waard Tents vs. Modern Options');
  });

  it('does not duplicate when keyword already present', () => {
    const out = ensureExactKeywordInSeoTitle('Best Edmonton dentist Near You', 'Edmonton dentist', 60);
    expect(out.includes('Edmonton dentist')).toBe(true);
    expect(out.split('Edmonton dentist').length - 1).toBe(1);
  });

  it('uses truncateTitleForSEO when exactKw is empty', () => {
    const long = 'Word '.repeat(30).trim();
    const out = ensureExactKeywordInSeoTitle(long, '', 50);
    expect(out.length).toBeLessThanOrEqual(50);
  });

  it('does not colon-merge SAP near titles when keyword embeds place tokens', () => {
    const title = 'Advanced Window Coverings Near Plum Coulee, MB';
    const kw = 'advanced window coverings plum coulee';
    expect(focusKeywordRepresentedInSeoTitle(title, kw)).toBe(true);
    expect(ensureExactKeywordInSeoTitle(title, kw, 120)).toBe(title);
  });
});

describe('ensureExactKeywordInMetaDescription', () => {
  it('prepends title-cased keyword with period when missing', () => {
    const out = ensureExactKeywordInMetaDescription(
      'Learn about services and booking today at our clinic.',
      'Edmonton dentist',
      160
    );
    expect(out.toLowerCase()).toContain('edmonton dentist');
    expect(out.startsWith('Edmonton Dentist.')).toBe(true);
  });

  it('preserves keyword under tight 160 limit', () => {
    const filler = 'x'.repeat(200);
    const kw = 'exact phrase match';
    const out = ensureExactKeywordInMetaDescription(`${filler} ${kw} tail`, kw, 160);
    expect(out.includes(kw)).toBe(true);
    expect(out.length).toBeLessThanOrEqual(160);
  });
});
