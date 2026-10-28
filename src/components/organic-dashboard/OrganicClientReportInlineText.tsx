import type { ReactNode } from "react";

/** Renders model **bold** spans only; no other markdown. */
export function OrganicClientReportInlineText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  const nodes: ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? "";
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    if (bold) {
      nodes.push(<strong key={i}>{bold[1]}</strong>);
    } else if (part) {
      nodes.push(part);
    }
  }
  return <>{nodes}</>;
}
