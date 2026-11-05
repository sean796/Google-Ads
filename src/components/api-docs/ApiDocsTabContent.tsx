import { useEffect, useState } from "react";
import { ApiDocsBreadcrumbs } from "@/components/api-docs/ApiDocsBreadcrumbs";
import { ApiDocsCallout } from "@/components/api-docs/ApiDocsCallout";
import { ApiDocsMarkdown } from "@/components/api-docs/api-docs-markdown";
import { ApiDocsSidebar } from "@/components/api-docs/ApiDocsSidebar";
import { ApiDocsToc } from "@/components/api-docs/ApiDocsToc";
import { SEO_WORKSPACE_TYPO_CLASS } from "@/components/seo/seo-workspace-layout";
import { getArticleToc, loadApiDocArticle } from "@/lib/api-docs";
import { setApiDocsHash, useApiDocsSlug } from "@/lib/api-docs/api-docs-hash";
import type { ApiDocArticle } from "@/lib/api-docs/types";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

const API_DOCS_LINK_CLASS =
  "font-medium text-primary underline-offset-4 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45";

function ApiDocsArticle({ article }: { article: ApiDocArticle }) {
  const toc = getArticleToc(article.slug);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 gap-8">
      <article className="min-w-0 flex-1">
        <ApiDocsBreadcrumbs article={article} />
        <h1 className="mb-6 font-sans text-4xl font-normal tracking-tight text-white">{article.title}</h1>
        {article.path ? (
          <ApiDocsCallout auth={article.auth} method={article.method} path={article.path} />
        ) : null}
        <ApiDocsMarkdown content={article.body} />
        {article.related && article.related.length > 0 ? (
          <section className="mt-12">
            <h2 className="mb-4 font-sans text-2xl font-normal text-white">Related articles</h2>
            <ul className="space-y-2">
              {article.related.map((rel) => (
                <li key={rel}>
                  <Button
                    onClick={() => setApiDocsHash(rel)}
                  >
                    {rel}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
      <ApiDocsToc entries={toc} />
    </div>
  );
}

function ApiDocsNotFound({ slug }: { slug: string }) {
  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <div className="text-center">
        <h1 className="mb-2 font-sans text-2xl font-normal text-white">Article not found</h1>
        <p className="mb-6 text-base text-white">No documentation for `{slug}`.</p>
        <Button
          onClick={() => setApiDocsHash("getting-started")}
        >
          Go to Introduction
        </Button>
      </div>
    </div>
  );
}

export function ApiDocsTabContent() {
  const resolved = useApiDocsSlug();
  const [article, setArticle] = useState<ApiDocArticle | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadApiDocArticle(resolved).then((loaded) => {
      if (!cancelled) {
        setArticle(loaded);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [resolved]);

  return (
    <div className={cn("neo-pulse-api-tab flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden font-sans text-base", SEO_WORKSPACE_TYPO_CLASS)}>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ApiDocsSidebar />
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-6 text-white">
          {loading ? null : article ? <ApiDocsArticle article={article} /> : <ApiDocsNotFound slug={resolved} />}
        </div>
      </div>
    </div>
  );
}
