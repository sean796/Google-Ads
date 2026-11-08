import type { ReactNode } from "react";
import { Check, Link2, Search, Sparkles, Upload } from "lucide-react";
import type { BulkSplashVisualKind } from "@/lib/bulk/bulk-splash-status-agent";
import { cn } from "@/lib/utils";

function Bar({ className }: { className?: string }) {
  return <div className={cn("h-2.5 rounded-sm bg-zinc-700 animate-pulse", className)} />;
}

function SlotRow() {
  return (
    <div className="flex items-start gap-3">
      <div className="h-10 w-10 shrink-0 rounded-sm bg-zinc-700 animate-pulse" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          <div className="h-3 w-16 rounded-sm bg-zinc-600 animate-pulse" />
        </div>
        <Bar className="w-full" />
        <Bar className="w-2/3" />
      </div>
    </div>
  );
}

function IdeasVisual() {
  return (
    <div className="flex w-full flex-col gap-4">
      <SlotRow />
      <SlotRow />
    </div>
  );
}

function ResearchVisual() {
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex h-8 items-center gap-2 rounded-full bg-zinc-800 px-3">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <Bar className="w-32" />
      </div>
      {[1, 2, 3].map((rank) => (
        <div key={rank} className="flex items-start gap-3">
          <span className="w-5 shrink-0 text-base font-semibold text-primary">{rank}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Bar className="w-3/4 bg-zinc-600" />
            <Bar className="w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function AuditVisual() {
  const dots = ["bg-primary", "bg-sky-400", "bg-violet-400"];
  return (
    <div className="flex w-full flex-col gap-3.5">
      {dots.map((dot, i) => (
        <div key={dot} className="flex items-center gap-3">
          <span className={cn("h-3 w-3 shrink-0 rounded-full animate-pulse", dot)} />
          <Bar className={i === 1 ? "w-1/2" : "w-2/3"} />
          {i === 2 ? (
            <span className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20">
              <Check className="h-4 w-4 text-primary" aria-hidden />
            </span>
          ) : null}
        </div>
      ))}
      <Bar className="ml-6 w-2/3" />
    </div>
  );
}

function MetaVisual() {
  return (
    <div className="flex w-full flex-col gap-2.5">
      <div className="flex items-start justify-between gap-3">
        <Bar className="w-24 bg-primary/60" />
        <span className="shrink-0 bg-primary px-1.5 text-base font-bold leading-6 text-black">
          #1
        </span>
      </div>
      <div className="h-3.5 w-52 max-w-full rounded-sm bg-sky-400/70 animate-pulse" />
      <Bar className="w-full" />
      <Bar className="w-5/6" />
      <Bar className="w-2/3" />
    </div>
  );
}

function WritingVisual({ generic = false }: { generic?: boolean }) {
  return (
    <div className="flex w-full flex-col gap-2.5">
      <div className="h-4 w-2/3 rounded-sm bg-zinc-500 animate-pulse" />
      <Bar className="w-full" />
      <Bar className="w-11/12" />
      <Bar className="w-4/5" />
      {generic ? null : <div className="mt-1 h-3.5 w-1/3 rounded-sm bg-zinc-500 animate-pulse" />}
      <Bar className="w-full" />
      <Bar className="w-3/5" />
    </div>
  );
}

function ImageVisual() {
  return (
    <svg
      viewBox="0 0 288 128"
      className="h-full w-full animate-pulse"
      role="presentation"
      aria-hidden="true"
    >
      <rect x="0" y="0" width="288" height="128" rx="6" fill="#27272a" />
      <circle cx="216" cy="38" r="14" fill="#a1a1aa" />
      <polygon points="0,128 92,52 150,128" fill="#52525b" />
      <polygon points="96,128 196,36 288,128" fill="#3f3f46" />
    </svg>
  );
}

function FaqVisual() {
  return (
    <div className="flex w-full flex-col gap-4">
      {[0, 1].map((row) => (
        <div key={row} className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center bg-primary/20 text-base font-bold text-primary">
            ?
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Bar className="w-3/4 bg-zinc-600" />
            <Bar className="w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function LinksVisual() {
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center">
        {[0, 1, 2].map((node) => (
          <div key={node} className="flex items-center last:flex-none flex-1">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-700 animate-pulse">
              <Link2 className="h-4 w-4 text-primary" aria-hidden />
            </span>
            {node < 2 ? <span className="h-px min-w-6 flex-1 bg-zinc-600" /> : null}
          </div>
        ))}
      </div>
      <Bar className="w-full" />
      <Bar className="w-2/3" />
    </div>
  );
}

function PublishVisual() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 animate-pulse">
        <Upload className="h-5 w-5 text-primary" aria-hidden />
      </span>
      <Bar className="w-40" />
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20">
          <Check className="h-4 w-4 text-primary" aria-hidden />
        </span>
        <Bar className="w-24 bg-zinc-600" />
      </div>
    </div>
  );
}

const VISUALS: Record<BulkSplashVisualKind, ReactNode> = {
  ideas: <IdeasVisual />,
  research: <ResearchVisual />,
  audit: <AuditVisual />,
  meta: <MetaVisual />,
  writing: <WritingVisual />,
  image: <ImageVisual />,
  faq: <FaqVisual />,
  links: <LinksVisual />,
  publish: <PublishVisual />,
  generic: <WritingVisual generic />,
};

/**
 * Breathing placeholder graphic paired with the AI splash status line.
 * Every kind renders inside the same fixed-size card so swapping kinds
 * never moves the logo or the status text.
 */
export function BulkSplashVisual({ kind }: { kind: BulkSplashVisualKind }) {
  return (
    <div
      className="flex h-44 w-80 max-w-[calc(100vw-3rem)] items-center justify-center rounded-lg bg-zinc-900/70 p-4"
      aria-hidden="true"
    >
      <style>{`
        @keyframes bulkSplashVisualBreathe {
          0%, 100% { transform: scale(0.99); opacity: 0.88; }
          50% { transform: scale(1.01); opacity: 1; }
        }
      `}</style>
      <div
        className="flex h-full w-full items-center justify-center"
        style={{ animation: "bulkSplashVisualBreathe 2.2s ease-in-out infinite" }}
      >
        {VISUALS[kind]}
      </div>
    </div>
  );
}
