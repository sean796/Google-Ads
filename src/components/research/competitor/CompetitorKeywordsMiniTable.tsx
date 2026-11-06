import type { CompetitorKeywordRow } from "@/lib/competitor-research/types";
import { fmtNum } from "@/components/research/competitor/competitor-site-grid-helpers";

export function KeywordsMiniTable({ title, rows }: { title?: string; rows: CompetitorKeywordRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="space-y-1.5">
      {title ? (
        <div className="min-h-[1rem] text-base font-medium uppercase leading-normal tracking-wide text-muted-foreground">
          {title}
        </div>
      ) : null}
      <div className="overflow-x-auto rounded border border-border/40 bg-black/20">
        <table className="w-full min-w-[320px] border-collapse text-left text-base leading-normal">
          <thead>
            <tr className="border-b border-border/40 text-muted-foreground">
              <th className="px-2 py-1 font-medium">Keyword</th>
              <th className="px-2 py-1 font-medium">Volume</th>
              <th className="px-2 py-1 font-medium">Traffic est.</th>
              <th className="px-2 py-1 font-medium">Pos.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((k, i) => (
              <tr key={`${title}-${i}`} className="border-b border-border/20 last:border-0">
                <td className="max-w-[220px] px-2 py-1 text-foreground/90">{k.phrase}</td>
                <td className="px-2 py-1 font-mono">{fmtNum(k.volume)}</td>
                <td className="px-2 py-1 font-mono">{fmtNum(k.traffic)}</td>
                <td className="px-2 py-1 font-mono">{fmtNum(k.position)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

