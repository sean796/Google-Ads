import { describe, expect, it } from 'vitest';
import { stitchHarnessSections } from '@/lib/bulk/bulk-harness-outline';
import { stripFooterElementsFromHarnessSectionHtml } from '@/lib/bulk/harness-html-strip-footer';
import { generateSingleSectionPrompt, generateSectionsPrompt, SYSTEM_PROMPT_CORE, sectionAllowsThreeParagraphs } from '@/lib/prompt-builders';
import { buildSystemPrompt, buildBulkHarnessSectionUserPrompt } from '@/lib/prompt-builders/system-user';
import type { AgentConfig } from '@/types/agent-config';
import { BLOG_HARNESS_SUMMARY_AGENT_ID } from '@/lib/bulk/blog-harness-summary-agent';

describe('stitchHarnessSections', () => {
  it('preserves input order and joins with blank line', () => {
    const a = '## First\n\nParagraph a.';
    const b = '## Second\n\nParagraph b.';
    expect(stitchHarnessSections([a, b])).toBe(`${a}\n\n${b}`);
  });

  it('strips outer whitespace on pieces and drops empties', () => {
    expect(stitchHarnessSections(['  ## x\n\nBody  ', '', '  '])).toBe('## x\n\nBody');
  });
});

describe('stripFooterElementsFromHarnessSectionHtml', () => {
  it('unwraps footer inner HTML into the section', () => {
    const input =
      '<h2>Topic</h2><p>Body</p><footer><p>Wrap-up line.</p></footer>';
    expect(stripFooterElementsFromHarnessSectionHtml(input)).toBe(
      '<h2>Topic</h2><p>Body</p><p>Wrap-up line.</p>',
    );
  });

  it('removes multiple footer blocks', () => {
    const input = '<p>a</p><footer><p>b</p></footer><p>c</p><footer><p>d</p></footer>';
    expect(stripFooterElementsFromHarnessSectionHtml(input)).toBe('<p>a</p><p>b</p><p>c</p><p>d</p>');
  });

  it('leaves sections without footer unchanged', () => {
    const input = '<h2>Only</h2><p>Paragraph.</p>';
    expect(stripFooterElementsFromHarnessSectionHtml(input)).toBe(input);
  });
});

describe('generateSingleSectionPrompt', () => {
  const agentA: AgentConfig = {
    id: 'a',
    step: 1,
    title: 'Alpha Topic',
    description: 'About alpha',
    features: ['[LIST] bullets'],
  };
  const agentB: AgentConfig = {
    id: 'b',
    step: 2,
    title: 'Beta Topic',
    description: 'About beta only',
    features: ['[TABLE] comparison'],
  };

  it('does not embed the other agent title or description', () => {
    const one = generateSingleSectionPrompt(agentA, 'markdown');
    expect(one).toContain('Alpha Topic');
    expect(one).not.toContain('Beta Topic');
    expect(one).not.toContain('About beta');
    const two = generateSingleSectionPrompt(agentB, 'markdown');
    expect(two).toContain('Beta Topic');
    expect(two).not.toContain('Alpha Topic');
    expect(two).not.toContain('About alpha');
  });

  it('generateSectionsPrompt equals per-agent prompts joined', () => {
    const agents = [agentA, agentB];
    expect(generateSectionsPrompt(agents, 'markdown')).toBe(
      [generateSingleSectionPrompt(agentA, 'markdown'), generateSingleSectionPrompt(agentB, 'markdown')].join('\n\n'),
    );
  });

  it('excludes [FORBIDDEN_WORDS] metadata from section prompt text', () => {
    const agent: AgentConfig = {
      id: 'c',
      step: 3,
      title: '5 New PST Categories',
      description: 'PST rules',
      features: ['[LIST] bullets', '[FORBIDDEN_WORDS - MANDATORY GLOBAL]: compact policy tag'],
    };
    const prompt = generateSingleSectionPrompt(agent, 'markdown');
    expect(prompt).not.toMatch(/WORD BLACKLIST \(mandatory/i);
    expect(prompt).not.toMatch(/\[FORBIDDEN_WORDS/i);
    expect(prompt).toContain('5 New PST Categories');
  });
});

describe('buildSystemPrompt', () => {
  it('prepends WORD BLACKLIST once in system prompt', async () => {
    const prompt = await buildSystemPrompt('', 'test-key');
    expect(prompt).toMatch(/WORD BLACKLIST \(mandatory/i);
    expect(prompt.match(/WORD BLACKLIST \(mandatory/g)?.length).toBe(1);
  });

  it('harness_section mode uses single-section contract not full-article first paragraph rule', async () => {
    const prompt = await buildSystemPrompt(
      '',
      'test-key',
      { name: 'Site', siteUrl: 'https://example.com' },
      undefined,
      undefined,
      undefined,
      undefined,
      'dentist ebbers edmonton',
      undefined,
      undefined,
      undefined,
      undefined,
      'harness_section',
    );
    expect(prompt).toContain('HARNESS MODE');
    expect(prompt).toContain('exactly ONE section');
    expect(prompt).not.toContain('FIRST PARAGRAPH RULE');
    expect(prompt).toContain('EXACT PRIMARY IN THIS SECTION');
    expect(prompt).not.toMatch(/CRITICAL_LINK_RULE|You MUST include exactly.*internal links/i);
    expect(prompt).toContain('Per-section link rules');
    expect(prompt).toContain('HTML ONLY');
  });

  it('includes keyword punctuation block when primaryKeyword has xray', async () => {
    const prompt = await buildSystemPrompt(
      '',
      'test-key',
      { name: 'Site', siteUrl: 'https://example.com' },
      undefined,
      undefined,
      undefined,
      undefined,
      'dental xray safety',
    );
    expect(prompt).toContain('KEYWORD PUNCTUATION');
    expect(prompt).toContain('Dental X-Ray Safety');
  });
});

describe('buildBulkHarnessSectionUserPrompt', () => {
  it('starts with read-only WORD BLACKLIST RAG block', () => {
    const prompt = buildBulkHarnessSectionUserPrompt(
      'Article Title',
      'Focused guide (max 3200 words) about topic',
      '## Section\n\nBody',
      '=== OUTLINE ===',
      ['Other Section'],
      1,
      3,
      { name: 'Site', siteUrl: 'https://example.com' },
      undefined,
      undefined,
      true,
      'https://example.com/post/',
    );
    expect(prompt.startsWith('=== WORD BLACKLIST (READ ONLY')).toBe(true);
    expect(prompt).toMatch(/WORD BLACKLIST \(mandatory/i);
    expect(prompt).toContain('start the line with > then a space then the sentence');
    expect(prompt).toContain('wrapping the quote with the word blockquote');
    expect(prompt).not.toContain('blockquotes (>)');
  });

  it('uses H2 plan block instead of full outline when allSectionTitles provided', () => {
    const prompt = buildBulkHarnessSectionUserPrompt(
      'Article Title',
      'Focused guide (max 3200 words) about topic',
      '## Alpha Topic\n\nBody',
      'legacy outline should not appear',
      ['Beta Topic'],
      1,
      3,
      { name: 'Site', siteUrl: 'https://example.com' },
      undefined,
      undefined,
      true,
      'https://example.com/post/',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'Alpha Topic',
      'topic keyword',
      ['Overview', 'Alpha Topic', 'Beta Topic'],
    );
    expect(prompt).toContain('ARTICLE H2 PLAN');
    expect(prompt).toContain('YOU WRITE THIS ONE ONLY');
    expect(prompt).toContain('FORBIDDEN IN YOUR OUTPUT');
    expect(prompt).toContain('Any ## heading except "Alpha Topic"');
    expect(prompt).not.toContain('FULL ARTICLE OUTLINE');
    expect(prompt).not.toContain('legacy outline should not appear');
    expect(prompt).toContain('- Beta Topic');
    expect(prompt).toContain('These must NOT appear as ## heading text in your output');
  });

  it('Overview section requires contextual bullet list from model', () => {
    const prompt = buildBulkHarnessSectionUserPrompt(
      'Article Title',
      'Focused guide (max 3200 words) about topic',
      '## Overview\n\nLead\n\n- **Label**: Context with [care options](#body-section).',
      '',
      ['Body Section'],
      0,
      2,
      { name: 'Site', siteUrl: 'https://example.com' },
      'Edmonton, AB',
      undefined,
      true,
      'https://example.com/post/',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      '=== OVERVIEW SCROLL-LINK TARGETS ===\nSection 1 → #body-section → "Body Section"\n=== END ===',
      'https://en.wikipedia.org/wiki/Edmonton',
    );
    expect(prompt).toContain('bullet list');
    expect(prompt).toMatch(/never "see below"/i);
    expect(prompt).not.toContain('inserted automatically');
    expect(prompt).toContain('Stop after the bullet list');
  });

  it('body section harness prompt uses 1-2 link placeholders', () => {
    const prompt = buildBulkHarnessSectionUserPrompt(
      'Article Title',
      'Focused guide (max 3200 words) about topic',
      '## Alpha Topic\n\nBody',
      'legacy outline',
      ['Beta Topic'],
      1,
      3,
      { name: 'Site', siteUrl: 'https://example.com' },
      undefined,
      undefined,
      true,
      'https://example.com/post/',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'Alpha Topic',
      'topic keyword',
      ['Overview', 'Alpha Topic', 'Beta Topic'],
    );
    expect(prompt).toContain('at least 1 [[LINK:');
    expect(prompt).not.toContain('3–5 [[LINK:');
    expect(prompt).toContain('never {{LINK:');
  });

  it('illustrative harness section includes persona scenario rule only when marked illustrative', () => {
    const illustrativePrompt = buildBulkHarnessSectionUserPrompt(
      'Article Title',
      'Purpose',
      '## Choosing Panels\n\n[ILLUSTRATIVE SCENARIO]',
      '',
      ['Costs'],
      1,
      3,
      { name: 'Site', siteUrl: 'https://example.com' },
    );
    expect(illustrativePrompt).toContain('ILLUSTRATIVE OUTPUT SHAPE');
    expect(illustrativePrompt).toContain('ILLUSTRATIVE PERSONA + SITE RECOMMENDATION');

    const costPrompt = buildBulkHarnessSectionUserPrompt(
      'Article Title',
      'Purpose',
      '## Blinds Costs\n\nBody prose only.',
      '',
      ['Choosing Panels'],
      2,
      3,
      { name: 'Site', siteUrl: 'https://example.com' },
    );
    expect(costPrompt).not.toContain('ILLUSTRATIVE OUTPUT SHAPE');
    expect(costPrompt).toContain('NO DUPLICATE HYPOTHETICAL');
  });

  it('includes mandatory LLM audit block when llmAuditSummary is provided', () => {
    const prompt = buildBulkHarnessSectionUserPrompt(
      'Article Title',
      'Focused guide (max 3200 words) about topic',
      '## Alpha Topic\n\nBody',
      'legacy outline',
      ['Beta Topic'],
      1,
      3,
      { name: 'Site', siteUrl: 'https://example.com' },
      'Plum Coulee, MB',
      undefined,
      true,
      'https://example.com/post/',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'Alpha Topic',
      'custom window treatments plum coulee',
      ['Overview', 'Alpha Topic', 'Beta Topic'],
      '## ChatGPT\nLocals call it "The Avenue".',
    );
    expect(prompt).toContain('LLM AUDIT REFERENCE (section-scoped');
    expect(prompt).toContain('The Avenue');
    expect(prompt).toContain('AUTHENTICITY (NON-NEGOTIABLE)');
  });
});

describe('generateSingleSectionPrompt harness contract', () => {
  it('includes exact ## lock and length contract for body sections', () => {
    const agent: AgentConfig = {
      id: 'body-1',
      step: 3,
      title: 'Dental Services Offered',
      description: 'List services',
      features: ['[TABLE] services'],
    };
    const prompt = generateSingleSectionPrompt(agent, 'markdown');
    expect(prompt).toContain('NON-NEGOTIABLE OUTPUT CONTRACT');
    expect(prompt).toContain('Dental Services Offered');
    expect(prompt).toContain('never nest ## inside ##');
    expect(prompt).toContain('STOP: after your last');
    expect(prompt).toContain('AUTHENTICITY (NON-NEGOTIABLE)');
    expect(prompt).toContain('SECTION OPENING');
    expect(prompt).toContain('At most **3** paragraphs');
    expect(prompt).not.toContain('Beta Topic');
  });

  it('later body sections must not keyword-lead the first sentence', () => {
    const later = generateSingleSectionPrompt(
      {
        id: 'body-2',
        step: 2,
        title: 'Residential Solar Costs and Potential Savings',
        description: 'Costs',
        features: ['[TABLE] cost drivers'],
      },
      'markdown',
    );
    expect(later).toContain('SECTION OPENING');
    expect(later).toContain('not in the first sentence');
    expect(later).not.toContain('CRITICAL FIRST BODY SECTION');

    const opener = generateSingleSectionPrompt(
      {
        id: 'body-1',
        step: 1,
        title: 'Your Guide to Residential Solar in Alberta',
        description: 'Intro',
        features: [],
      },
      'markdown',
    );
    expect(opener).toContain('CRITICAL FIRST BODY SECTION');
    expect(opener).toContain("sourced fact NEW to this H2's job");
    expect(opener).toContain('"{keyword} offers/provides/involves"');
    expect(opener).not.toContain('SECTION OPENING');
  });

  it('allows 3 paragraphs for [DECISION] and [NUMBERS] sections and 2 otherwise', () => {
    expect(
      sectionAllowsThreeParagraphs({
        title: 'How to Choose',
        features: ['[DECISION]: If you have / choose table'],
      }),
    ).toBe(true);
    expect(
      sectionAllowsThreeParagraphs({
        title: 'Solar Battery Cost',
        features: ['[NUMBERS]: cost and ROI bands'],
      }),
    ).toBe(true);
    expect(
      sectionAllowsThreeParagraphs({
        title: 'Conclusion and Next Steps',
        features: ['[LINK]: 3-5 internal links'],
      }),
    ).toBe(false);
    const decisionPrompt = generateSingleSectionPrompt(
      {
        id: 'd1',
        step: 2,
        title: 'How to Choose',
        description: 'Chooser',
        features: ['[DECISION]: If you have / choose table'],
      },
      'markdown',
    );
    expect(decisionPrompt).toContain('At most **3** paragraphs');
    expect(decisionPrompt).toContain('required table or list');
    const htmlDecision = generateSingleSectionPrompt(
      {
        id: 'd1',
        step: 2,
        title: 'How to Choose',
        description: 'Chooser',
        features: ['[DECISION]: If you have / choose table'],
      },
      'html',
    );
    expect(htmlDecision).toContain('3 <p> + table/list');
  });

  it('maps [BLOCKQUOTE] to a > quote line and forbids the word wrapper', () => {
    const prompt = generateSingleSectionPrompt(
      {
        id: 'q1',
        step: 2,
        title: 'What is Solar Panel Efficiency?',
        description: 'Explain efficiency',
        features: ['[BLOCKQUOTE]: entity fact about yield'],
      },
      'markdown',
    );
    expect(prompt).toContain('QUOTE FORMAT');
    expect(prompt).toContain('> We size each array for the roof');
    expect(prompt).toContain('wrapping the quote with the word blockquote');
    expect(prompt).not.toMatch(/Key points: \[BLOCKQUOTE\]: entity fact/i);
  });

  it('recasts anti-conditional into one allowed decision object', () => {
    expect(SYSTEM_PROMPT_CORE).toContain('filler hedges');
    expect(SYSTEM_PROMPT_CORE).toContain('one decision object');
    expect(SYSTEM_PROMPT_CORE).not.toMatch(/Never utilize conditional phrasing/i);
  });

  it('Overview agent prompt requires contextual scroll-link bullets', () => {
    const agent: AgentConfig = {
      id: BLOG_HARNESS_SUMMARY_AGENT_ID,
      step: 4,
      title: 'Overview',
      description: 'Summary',
      features: [],
    };
    const prompt = generateSingleSectionPrompt(agent, 'markdown');
    expect(prompt).toContain('bullet list');
    expect(prompt).toContain('exactly ONE');
    expect(prompt).toContain('FORBIDDEN per bullet: two links');
    expect(prompt).toContain('em dashes (Unicode');
    expect(prompt).toContain('WORD BLACKLIST');
    expect(prompt).toContain('Stop after the bullet list');
    expect(prompt).not.toContain('AUTHENTICITY (NON-NEGOTIABLE)');
  });
});

describe('press release harness linking (same as blogs)', () => {
  it('generateSingleSectionPrompt requires [[LINK:]] and forbids competitor markdown urls', () => {
    const agent: AgentConfig = {
      id: 'pr-body',
      step: 3,
      title: 'Section 3',
      description: 'Practical context',
      features: ['[LINK]'],
    };
    const prompt = generateSingleSectionPrompt(agent, 'markdown', 'press_release', 'blinds');
    expect(prompt).toContain('[[LINK:query|anchor]]');
    expect(prompt).toContain('never a raw URL');
    expect(prompt).toContain('third-party or competitor');
    expect(prompt).not.toContain('[anchor](exact-url)');
  });

  it('user prompt with inventory requires [[LINK:]] and no markdown externals', () => {
    const prompt = buildBulkHarnessSectionUserPrompt(
      'blinds',
      'Editorial press release centered on: blinds.',
      '## Section\n\nBody',
      'outline',
      [],
      2,
      6,
      { name: 'In the Shade', siteUrl: 'https://intheshadeflorida.com' },
      undefined,
      undefined,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'press_release',
      'blinds',
    );
    expect(prompt).toContain('at least 1 [[LINK:');
    expect(prompt).toContain('No third-party external links');
    expect(prompt).toContain('NEVER link to competitors');
    expect(prompt).not.toContain('[anchor](exact-url)');
    expect(prompt).not.toContain('Approved external URL');
    expect(prompt).not.toContain('Do NOT add internal links');
  });

  it('system prompt for press_release harness_section includes internal link placeholders', async () => {
    const prompt = await buildSystemPrompt(
      '',
      'test-key',
      { name: 'In the Shade', siteUrl: 'https://intheshadeflorida.com' },
      [
        {
          id: 2,
          slug: 'custom-blinds',
          title: 'Custom blinds',
          excerpt: '',
          link: 'https://intheshadeflorida.com/custom-blinds/',
          date_gmt: '',
        },
      ],
      undefined,
      undefined,
      undefined,
      'blinds',
      undefined,
      undefined,
      undefined,
      'press_release',
      'harness_section',
    );
    expect(prompt).toContain('INTERNAL LINK PLACEHOLDERS');
    expect(prompt).toContain('PRESS RELEASE MODE');
    expect(prompt).toContain('[[LINK:query|anchor]]');
    expect(prompt).toContain('[[LINK:PAGES title words|short anchor]]');
  });
});
