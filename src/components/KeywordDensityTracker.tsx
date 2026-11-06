import { useMemo } from "react";
import { Card, Badge, Progress, ScrollArea, Alert, AlertDescription } from "@/ui";





import { BarChart3, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { useKeywordDensity } from "@/hooks/use-keyword-density";
import type { KeywordData } from "@/lib/keyword-types";

interface KeywordDensityTrackerProps {
  content: string;
  keywords: KeywordData[] | undefined;
  enabled?: boolean;
}

export const KeywordDensityTracker: React.FC<KeywordDensityTrackerProps> = ({
  content,
  keywords,
  enabled = true,
}) => {
  const { densityAnalysis, isAnalyzing, overallScore, allRecommendations } =
    useKeywordDensity({
      content,
      keywords,
      enabled,
    });

  const getStatusColor = (
    density: number,
    optimalRange: { min: number; max: number }
  ) => {
    if (density >= optimalRange.min && density <= optimalRange.max) {
      return "text-primary";
    }
    if (density < optimalRange.min) {
      return "text-semantic-warning";
    }
    return "text-ui-danger";
  };

  const getStatusIcon = (
    density: number,
    optimalRange: { min: number; max: number }
  ) => {
    if (density >= optimalRange.min && density <= optimalRange.max) {
      return <CheckCircle2 className="w-4 h-4 text-primary" />;
    }
    if (density < optimalRange.min) {
      return <AlertCircle className="w-4 h-4 text-semantic-warning" />;
    }
    return <AlertCircle className="w-4 h-4 text-ui-danger" />;
  };

  const getStatusLabel = (
    density: number,
    optimalRange: { min: number; max: number }
  ) => {
    if (density >= optimalRange.min && density <= optimalRange.max) {
      return "Optimal";
    }
    if (density < optimalRange.min) {
      return "Too Low";
    }
    return "Too High";
  };

  if (!enabled || !keywords || keywords.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No keywords to track</p>
        </div>
      </Card>
    );
  }

  if (isAnalyzing) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <span className="text-sm">Analyzing keyword density...</span>
        </div>
      </Card>
    );
  }

  if (densityAnalysis.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No content to analyze</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall Score */}
      {overallScore !== null && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              <span className="font-semibold">Overall Optimization Score</span>
            </div>
            <Badge
              variant={
                overallScore >= 80
                  ? "default"
                  : overallScore >= 50
                  ? "secondary"
                  : "destructive"
              }
            >
              {overallScore}%
            </Badge>
          </div>
          <Progress value={overallScore} className="mt-2" />
        </Card>
      )}

      {/* Keyword Density Table */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4">Keyword Density Analysis</h3>
        <ScrollArea className="h-[400px]">
          <div className="space-y-4">
            {densityAnalysis.map((analysis, index) => (
              <div
                key={index}
                className="p-4 rounded border bg-card space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(analysis.density, analysis.optimalRange)}
                    <span className="font-medium">{analysis.keyword}</span>
                  </div>
                  <Badge
                    variant={
                      analysis.density >= analysis.optimalRange.min &&
                      analysis.density <= analysis.optimalRange.max
                        ? "default"
                        : "outline"
                    }
                  >
                    {getStatusLabel(analysis.density, analysis.optimalRange)}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Density</span>
                    <span
                      className={getStatusColor(
                        analysis.density,
                        analysis.optimalRange
                      )}
                    >
                      {analysis.density.toFixed(2)}%
                    </span>
                  </div>
                  <div className="relative">
                    <Progress
                      value={Math.min(
                        (analysis.density / analysis.optimalRange.max) * 100,
                        100
                      )}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>Optimal: {analysis.optimalRange.min}%</span>
                      <span>Max: {analysis.optimalRange.max}%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Occurrences</span>
                    <span className="font-medium">{analysis.occurrences}</span>
                  </div>
                </div>

                {analysis.recommendations.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">
                      Recommendations:
                    </div>
                    <ul className="text-xs space-y-1">
                      {analysis.recommendations.map((rec, recIndex) => (
                        <li key={recIndex} className="flex items-start gap-2">
                          <span className="text-primary mt-0.5">•</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </Card>

      {/* Recommendations Summary */}
      {allRecommendations.length > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-1">
              <div className="font-medium mb-2">Key Recommendations:</div>
              <ul className="text-sm space-y-1">
                {allRecommendations.slice(0, 5).map((rec, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

