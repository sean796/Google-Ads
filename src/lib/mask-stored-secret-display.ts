/** OpenRouter-style saved key line: prefix + dots + suffix (display only; copy uses full value). */
export function maskStoredSecretForDisplay(value: string): string {
  if (!value) return "";
  if (value.length <= 20) return value;
  const head = value.slice(0, 12);
  const tail = value.slice(-4);
  const hidden = value.length - head.length - tail.length;
  const dots = "•".repeat(Math.min(28, Math.max(12, hidden)));
  return `${head}${dots}${tail}`;
}
