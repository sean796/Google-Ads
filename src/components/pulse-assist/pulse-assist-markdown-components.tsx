import type { Components } from "react-markdown";
import type { AssistNavigateTarget } from "@/lib/pulse-assist/types";
import { isInAppAssistHref, isPulseAssistHref, parseAppHref, parsePulseAssistHref } from "@/lib/pulse-assist/navigation";
import { Button } from "@/ui";

function resolveNavigateTarget(href: string): AssistNavigateTarget | null {
  if (isPulseAssistHref(href)) {
    return parsePulseAssistHref(href);
  }
  return parseAppHref(href);
}

function createAnchorComponent(onNavigate?: (target: AssistNavigateTarget) => void) {
  return function PulseAssistAnchor({
    href,
    children,
  }: {
    href?: string;
    children?: React.ReactNode;
  }) {
    if (href && onNavigate && isInAppAssistHref(href)) {
      const target = resolveNavigateTarget(href);
      if (target) {
        return (
          <Button variant="quiet" onClick={() => onNavigate(target)}>
            {children}
          </Button>
        );
      }
    }
    const external = href && /^https?:\/\//i.test(href);
    if (external) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="fcw-md-link">
          {children}
        </a>
      );
    }
    if (href?.startsWith("#") && onNavigate) {
      const target = parseAppHref(href);
      if (target) {
        return (
          <Button variant="quiet" onClick={() => onNavigate(target)}>
            {children}
          </Button>
        );
      }
    }
    return (
      <a href={href} className="fcw-md-link">
        {children}
      </a>
    );
  };
}

/** Readable markdown inside Pulse Assist cards (lists, steps, tables, spacing). */
export function createPulseAssistMarkdownComponents(
  onNavigate?: (target: AssistNavigateTarget) => void,
): Components {
  return {
    h2: ({ children }) => <h2 className="fcw-md-h2">{children}</h2>,
    h3: ({ children }) => <h3 className="fcw-md-h3">{children}</h3>,
    h4: ({ children }) => <h4 className="fcw-md-h4">{children}</h4>,
    p: ({ children }) => <p className="fcw-md-p">{children}</p>,
    ul: ({ children }) => <ul className="fcw-md-ul">{children}</ul>,
    ol: ({ children }) => <ol className="fcw-md-ol">{children}</ol>,
    li: ({ children }) => <li className="fcw-md-li">{children}</li>,
    strong: ({ children }) => <strong className="fcw-md-strong">{children}</strong>,
    blockquote: ({ children }) => <blockquote className="fcw-md-blockquote">{children}</blockquote>,
    hr: () => <hr className="fcw-md-hr" />,
    pre: ({ children }) => <pre className="fcw-md-pre">{children}</pre>,
    code: ({ className, children }) => {
      const inline = !className;
      if (inline) {
        return <code className="fcw-md-code-inline">{children}</code>;
      }
      return <code className={className}>{children}</code>;
    },
    table: ({ children }) => (
      <div className="fcw-md-table-wrap">
        <table className="fcw-md-table">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="fcw-md-thead">{children}</thead>,
    tbody: ({ children }) => <tbody className="fcw-md-tbody">{children}</tbody>,
    tr: ({ children }) => <tr className="fcw-md-tr">{children}</tr>,
    th: ({ children }) => <th className="fcw-md-th">{children}</th>,
    td: ({ children }) => <td className="fcw-md-td">{children}</td>,
    a: createAnchorComponent(onNavigate),
  };
}

export const pulseAssistMarkdownComponents = createPulseAssistMarkdownComponents();
