/**
 * Title Template Parser
 * 
 * Parses title templates with variables like [Entity], [Keyword], etc.
 * and replaces them with actual values.
 */
import { logger } from "@/lib/logger";

/**
 * Extracts all variable names from a template string
 * @param template - Template string with variables like "[Entity]", "[Keyword]"
 * @returns Array of variable names (without brackets)
 */
export function extractTemplateVariables(template: string): string[] {
  if (!template || typeof template !== 'string') {
    return [];
  }

  const variablePattern = /\[([^\]]+)\]/g;
  const variables: string[] = [];
  let match;

  while ((match = variablePattern.exec(template)) !== null) {
    const variableName = match[1].trim();
    if (variableName && !variables.includes(variableName)) {
      variables.push(variableName);
    }
  }

  return variables;
}

/**
 * Validates a title template syntax
 * @param template - Template string to validate
 * @returns Validation result with error message if invalid
 */
export function validateTemplate(template: string): { valid: boolean; error?: string } {
  if (!template || typeof template !== 'string') {
    return { valid: true }; // Empty template is valid (optional feature)
  }

  // Check for unmatched brackets
  const openBrackets = (template.match(/\[/g) || []).length;
  const closeBrackets = (template.match(/\]/g) || []).length;

  if (openBrackets !== closeBrackets) {
    return {
      valid: false,
      error: 'Unmatched brackets in template. Each [ must have a matching ].',
    };
  }

  // Check for nested brackets (not supported)
  if (template.includes('[[') || template.includes(']]')) {
    return {
      valid: false,
      error: 'Nested brackets are not supported.',
    };
  }

  // Check for empty variable names
  const emptyVariablePattern = /\[\s*\]/;
  if (emptyVariablePattern.test(template)) {
    return {
      valid: false,
      error: 'Empty variable names are not allowed. Use [Entity], [Keyword], etc.',
    };
  }

  return { valid: true };
}

/**
 * Replaces variables in a template with actual values
 * @param template - Template string with variables like "[Entity]", "[Keyword]"
 * @param variables - Object mapping variable names (without brackets) to their values
 * @returns Resolved title string with variables replaced
 */
export function parseTitleTemplate(
  template: string,
  variables: Record<string, string>
): string {
  if (!template || typeof template !== 'string') {
    return '';
  }

  // Validate template first
  const validation = validateTemplate(template);
  if (!validation.valid) {
    logger.warn('Invalid template:', validation.error);
    return template; // Return original template if invalid
  }

  let result = template;

  // Replace each variable in the template
  const variablePattern = /\[([^\]]+)\]/g;
  result = result.replace(variablePattern, (match, variableName) => {
    const key = variableName.trim();
    const value = variables[key];

    // If variable is not provided, leave it as-is or use empty string
    if (value === undefined || value === null) {
      logger.warn(`Variable [${key}] not found in provided variables`);
      return ''; // Remove the variable placeholder
    }

    return String(value);
  });

  // Clean up any extra spaces that might result from missing variables
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

/**
 * Gets a preview of how a template would render with example values
 * @param template - Template string
 * @param exampleVariables - Example values to use for preview
 * @returns Preview string
 */
export function getTemplatePreview(
  template: string,
  exampleVariables: Record<string, string> = {}
): string {
  if (!template || typeof template !== 'string') {
    return '';
  }

  // Default example values
  const defaults: Record<string, string> = {
    Entity: 'Los Angeles',
    Keyword: 'window blinds',
    Location: 'California',
    Number: '1',
  };

  const variables = { ...defaults, ...exampleVariables };
  return parseTitleTemplate(template, variables);
}

