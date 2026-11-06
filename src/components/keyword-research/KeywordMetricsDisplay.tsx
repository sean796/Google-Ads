import { Card, Badge, Progress } from "@/ui";



import { BarChart3, Target } from "lucide-react";
import type { KeywordData } from "@/lib/keyword-types";
import { getDifficultyColor, getDifficultyLabel } from "@/lib/keyword-display-utils";

interface KeywordMetricsDisplayProps {
  keywordData: KeywordData;
  searchIntent: string;
}

export function KeywordMetricsDisplay({
  keywordData,
  searchIntent,
}: KeywordMetricsDisplayProps) {
  return (
    <>
      {/* Keyword Difficulty */}
      <Card variant="neonFlat" className="p-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              <h3 className="font-semibold">Keyword Difficulty</h3>
            </div>
            <Badge
              variant={
                keywordData.difficulty < 30
                  ? "default"
                  : keywordData.difficulty < 70
                  ? "secondary"
                  : "destructive"
              }
            >
              {getDifficultyLabel(keywordData.difficulty)}
            </Badge>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Difficulty Score</span>
              <span className={getDifficultyColor(keywordData.difficulty)}>
                {keywordData.difficulty}/100
              </span>
            </div>
            <Progress value={keywordData.difficulty} />
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Search Volume</div>
              <div className="font-semibold">
                {keywordData.searchVolume.toLocaleString()}/mo
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">CPC</div>
              <div className="font-semibold">${keywordData.cpc.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Competition</div>
              <div className="font-semibold">{keywordData.competition}</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Search Intent */}
      <Card variant="neonFlat" className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Target className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">Search Intent</h3>
        </div>
        <Badge variant="outline" className="mt-2">
          {searchIntent.charAt(0).toUpperCase() + searchIntent.slice(1)}
        </Badge>
      </Card>
    </>
  );
}

