import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DASHBOARD_SETTINGS_GROUP_CLASS } from "@/components/manager/dashboard/dashboard-panel-styles";
import { slugToHeadingId } from "@/lib/api-docs/parse-frontmatter";
import { cn } from "@/lib/utils";

const API_DOCS_LINK_CLASS =
  "font-medium text-primary underline-offset-4 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45";

const components: Components = {
  h2: ({ children }) => {
    const text = String(children);
    const id = slugToHeadingId(text);
    return (
      <h2 id={id} className="mb-3 mt-10 scroll-mt-24 font-sans text-2xl font-normal text-white">
        {children}
      </h2>
    );
  },
  h3: ({ children }) => {
    const text = String(children);
    const id = slugToHeadingId(text);
    return (
      <h3 id={id} className="mb-2 mt-6 scroll-mt-24 font-sans text-xl font-normal text-white">
        {children}
      </h3>
    );
  },
  p: ({ children }) => <p className="mb-4 text-base leading-relaxed text-white">{children}</p>,
  ul: ({ children }) => <ul className="mb-4 list-disc space-y-2 pl-6 text-base text-white">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 list-decimal space-y-2 pl-6 text-base text-white">{children}</ol>,
  li: ({ children }) => <li className="text-base leading-relaxed">{children}</li>,
  a: ({ href, children }) => (
    <a href={href} className={API_DOCS_LINK_CLASS}>
      {children}
    </a>
  ),
  code: ({ className, children, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code className="bg-ui-field px-1.5 py-0.5 font-mono text-base text-white" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className={cn("font-mono text-base text-white", className)} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className={cn(DASHBOARD_SETTINGS_GROUP_CLASS, "mb-4 overflow-x-auto p-4 font-mono text-base text-white")}>
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mb-6 overflow-x-auto rounded-lg border border-white/[0.08]">
      <table className="w-full min-w-[20rem] text-left text-base text-white">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-ui-field/50 text-white">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 text-base font-normal">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 align-top text-base">{children}</td>,
  tr: ({ children }) => <tr className="even:bg-black">{children}</tr>,
};

const METHOD_PATH_LINE = /^(GET|POST|PUT|PATCH|DELETE|ANY)\s+`\/api\/[^`]+`\.\s*$/;

function stripDuplicateMethodLine(content: string): string {
  const lines = content.split("\n");
  if (lines.length > 0 && METHOD_PATH_LINE.test(lines[0].trim())) {
    return lines.slice(1).join("\n").replace(/^\n+/, "");
  }
  return content;
}

export function ApiDocsMarkdown({ content }: { content: string }) {
  const body = stripDuplicateMethodLine(content);
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {body}
    </ReactMarkdown>
  );
}
