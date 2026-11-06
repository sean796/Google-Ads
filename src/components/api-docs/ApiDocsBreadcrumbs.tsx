import { ChevronRight } from "lucide-react";
import type { ApiDocArticle } from "@/lib/api-docs/types";
import { setApiDocsRoute } from "@/lib/api-docs/api-docs-route";
import { cn } from "@/lib/utils";
import { TextButton } from "@/ui";

const API_DOCS_LINK_CLASS =
  "font-medium text-primary underline-offset-4 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45";

export function ApiDocsBreadcrumbs({ article }: { article: ApiDocArticle }) {
  const parts = article.slug.split("/").filter(Boolean);
  const crumbs: { label: string; slug: string }[] = [{ label: "API", slug: "getting-started" }];

  if (parts[0] === "getting-started") {
    if (parts.length === 1) {
      crumbs.push({ label: article.title, slug: article.slug });
    } else {
      crumbs.push({ label: "Getting started", slug: "getting-started" });
      crumbs.push({ label: article.title, slug: article.slug });
    }
  } else {
    crumbs.push({ label: article.section, slug: parts[0] });
    crumbs.push({ label: article.title, slug: article.slug });
  }

  return (
    <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-1 text-base text-white">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.slug + i} className="flex items-center gap-1">
            {i > 0 ? <ChevronRight className="h-4 w-4 shrink-0 text-white/50" aria-hidden /> : null}
            {isLast ? (
              <span className="font-medium text-white">{crumb.label}</span>
            ) : (
              <TextButton
                type="button"
                onClick={() => setApiDocsRoute(crumb.slug)}
              >
                {crumb.label}
              </TextButton>
            )}
          </span>
        );
      })}
    </nav>
  );
}
