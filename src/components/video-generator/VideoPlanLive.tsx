import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import type { OpenRouterAppStreamDelta } from "@/lib/openrouter-app-api";

/**
 * Live Director stream rendered only inside the Center Stage Monitor while the scene plan is being drafted.
 * Single scroll container, no duplicate header.
 */
export function VideoPlanLive({ live }: { live: OpenRouterAppStreamDelta }) {
  const endRef = useRef<HTMLDivElement>(null);
  const [showReasoning, setShowReasoning] = useState(true);
  const hasJson = live.content.trim().length > 0;
  const totalChars = live.reasoning.length + live.content.length;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [live.reasoning.length, live.content.length]);

  return (
    <div className="flex h-full w-full min-h-0 flex-col overflow-hidden bg-zinc-950 text-base">
      <div className="flex h-9 shrink-0 items-center justify-between bg-zinc-900/80 px-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
          <span className="font-medium text-white">
            {hasJson ? "Writing structured scene plan JSON…" : "Director reasoning through shots and beat timing…"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {live.reasoning ? (
            <button
              type="button"
              onClick={() => setShowReasoning((v) => !v)}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-white"
            >
              <span>{showReasoning ? "Hide notes" : "Show notes"}</span>
              {showReasoning ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          ) : null}
          <span className="tabular-nums text-muted-foreground">{totalChars.toLocaleString()} chars</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {live.reasoning && showReasoning ? (
          <pre className="whitespace-pre-wrap break-words bg-zinc-900/60 p-3 font-sans text-base leading-relaxed text-muted-foreground">
            {live.reasoning}
          </pre>
        ) : null}
        {live.content ? (
          <pre className="whitespace-pre-wrap break-words bg-zinc-900 p-3 font-mono text-base leading-relaxed text-primary">
            {live.content}
          </pre>
        ) : null}
        <div ref={endRef} />
      </div>
    </div>
  );
}
