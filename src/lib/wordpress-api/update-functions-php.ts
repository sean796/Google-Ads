import { loadApiKey } from '@/lib/api';
import { callOpenRouterChatCompletion } from '@/lib/competitor-research/competitor-report-openrouter';
import { getResearchModel } from '@/lib/optimization-settings-storage';
import functionsUpdaterInstructions from '@/fixtures/functions-updater-instructions.md?raw';
import canonicalFunctionsPhp from '@/fixtures/hello-elementor-child-functions.example.php?raw';
import { normalizeFunctionsPhpOutput } from './normalize-functions-php';

export type UpdateFunctionsPhpResult = {
  updatedFunctionsPhp: string;
  version: string;
  changesSummary: string;
  model: string;
};

const SYSTEM_PROMPT =
  'You are a senior WordPress/PHP engineer updating Hello Elementor Child functions.php for NEO Pulse SEO sites. '
  + 'MERGE strategy: start from the source file and output a complete merged PHP file. '
  + 'Keep ALL valid site-specific code from the source (Google Maps shortcodes, custom hooks, capability filters, '
  + 'site-specific constants, WP Engine cache, NEO Pulse redirect sync). '
  + 'Upgrade only FAQ/schema helpers, inject_custom_acf_schemas, acf/format_value hide filters, '
  + 'REST update_callback (update_field + update_post_meta for scalars), and sync_acf_metadata_to_post. '
  + 'Remove broken raw FAQ echo only. Use faq field only (no seo_faq). '
  + 'Do not replace the whole file with the canonical template alone. '
  + 'Target PHP 7.4: never use array_is_list() (PHP 8.1+); use hello_elementor_child_is_list_array(). '
  + 'Put <?php on its own line with a newline before the file header comment. '
  + 'Output ONLY the complete merged functions.php file as raw PHP. '
  + 'No JSON. No markdown fences. No commentary before or after the file. '
  + 'The response must start with <?php and include every line through the end of the source file.';

function readChildThemeVersion(php: string): string {
  const markers = [
    "define( 'HELLO_ELEMENTOR_CHILD_VERSION'",
    'define( "HELLO_ELEMENTOR_CHILD_VERSION"',
  ];
  for (const marker of markers) {
    const start = php.indexOf(marker);
    if (start === -1) continue;
    const comma = php.indexOf(',', start + marker.length);
    const close = php.indexOf(')', comma + 1);
    if (comma === -1 || close === -1) continue;
    let literal = php.slice(comma + 1, close).trim();
    if (
      (literal.startsWith("'") && literal.endsWith("'"))
      || (literal.startsWith('"') && literal.endsWith('"'))
    ) {
      literal = literal.slice(1, -1);
    }
    return literal.trim();
  }
  return '';
}

function buildUserPrompt(sourcePhp: string): string {
  return [
    '## Update contract',
    functionsUpdaterInstructions.trim(),
    '',
    '## Canonical reference (match this FAQ/ACF/schema pattern)',
    '```php',
    canonicalFunctionsPhp.trim(),
    '```',
    '',
    '## Source file to update (keep all valid site-specific code from this file)',
    'Apply the contract. Output = source site-specific blocks + upgraded FAQ/REST/schema code from the canonical pattern.',
    'Reply with the full merged functions.php only (raw PHP, starts with <?php, no JSON, no markdown fences).',
    '',
    '```php',
    sourcePhp.trim(),
    '```',
  ].join('\n');
}

export async function updateFunctionsPhp(
  sourcePhp: string,
  siteId: string,
): Promise<UpdateFunctionsPhpResult> {
  const apiKey = loadApiKey().trim();
  const model = getResearchModel(siteId);
  const trimmed = sourcePhp.trim();

  if (!apiKey) {
    throw new Error('OpenRouter API key is required. Add it under Dashboard → API Keys.');
  }
  if (!trimmed) {
    throw new Error('Paste your functions.php content first.');
  }
  if (!trimmed.includes('<?php')) {
    throw new Error('Paste must be a PHP file starting with <?php');
  }

  const userPrompt = buildUserPrompt(trimmed);

  const { content } = await callOpenRouterChatCompletion({
    apiKey,
    model,
    system: SYSTEM_PROMPT,
    user: userPrompt,
    maxTokens: 32768,
    temperature: 0.1,
  });

  const updatedPhp = content.trim();

  if (!updatedPhp.includes('<?php')) {
    throw new Error('Research model did not return a complete functions.php file.');
  }

  return {
    updatedFunctionsPhp: normalizeFunctionsPhpOutput(updatedPhp),
    version: readChildThemeVersion(updatedPhp),
    changesSummary: '',
    model,
  };
}
