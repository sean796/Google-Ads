import { useApiDocsSlug, setApiDocsHash } from "@/lib/api-docs/api-docs-hash";
import { apiDocsManifest } from "@/lib/api-docs/api-docs-manifest";
import type { ApiDocNavItem, ApiDocNavSection } from "@/lib/api-docs/types";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

const NAV_ROW_BASE =
  "block w-full rounded-none border-0 px-3 py-2.5 text-left text-base font-normal outline-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-0";

function isSlugActive(currentSlug: string, itemSlug: string): boolean {
  return currentSlug === itemSlug || currentSlug.startsWith(`${itemSlug}/`);
}

function NavButton({ item, currentSlug }: { item: ApiDocNavItem; currentSlug: string }) {
  const active = isSlugActive(currentSlug, item.slug);

  return (
    <button
      type="button"
      onClick={() => setApiDocsHash(item.slug)}
      className={cn(
        NAV_ROW_BASE,
        active
          ? "bg-primary font-normal text-black hover:bg-primary hover:text-black"
          : "bg-zinc-900/55 text-white hover:bg-zinc-800 hover:text-white",
      )}
    >
      <span className="block truncate text-base">{item.title}</span>
      {item.method ? (
        <span className={cn("mt-0.5 block font-mono text-base", active ? "text-black/70" : "text-white/70")}>
          {item.method}
        </span>
      ) : null}
    </button>
  );
}

function SectionGroup({
  section,
  currentSlug,
  defaultOpen,
}: {
  section: ApiDocNavSection;
  currentSlug: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasActive = section.items.some((item) => isSlugActive(currentSlug, item.slug));

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 rounded-none border-0 px-2 py-2.5 text-left text-base font-normal text-white outline-none transition-colors",
          "bg-zinc-900 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-0",
          hasActive && "bg-zinc-800",
        )}
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        {section.label}
      </button>
      {open ? (
        <div className="mt-1 space-y-1">
          {section.items.map((item) => (
            <NavButton key={item.slug} item={item} currentSlug={currentSlug} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ApiDocsSidebar() {
  const currentSlug = useApiDocsSlug();

  return (
    <aside className="flex h-full min-h-0 w-72 shrink-0 flex-col border-r border-white/[0.08] bg-black">
      <div className="px-4 pb-2 pt-2">
        <p className="text-base font-normal uppercase tracking-wide text-white">Topics</p>
      </div>
      <nav aria-label="API documentation" className="flex-1 overflow-y-auto px-3 pb-8">
        {apiDocsManifest.sections.map((section) => (
          <SectionGroup
            key={section.id}
            section={section}
            currentSlug={currentSlug}
            defaultOpen={
              section.id === "getting-started" ||
              section.id === "aiseo" ||
              section.id === "mastra" ||
              section.items.some((i) => isSlugActive(currentSlug, i.slug))
            }
          />
        ))}
      </nav>
    </aside>
  );
}
