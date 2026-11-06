import { Progress, Badge } from "@/ui";


import { ProgressMetrics, formatTime } from "@/hooks/use-generation-progress";
import { CheckCircle2, AlertCircle } from "lucide-react";

interface GenerationProgressProps {
  progress: ProgressMetrics;
  className?: string;
  compact?: boolean;
}

export const GenerationProgress: React.FC<GenerationProgressProps> = ({
  progress,
  className = "",
  compact = false,
}) => {
  const { percentage, stageLabel, stageDescription, timeElapsed, estimatedTimeRemaining } = progress;

  const getStageIcon = () => {
    if (progress.stage === 'complete') {
      return <CheckCircle2 className="w-4 h-4 text-primary" />;
    }
    if (progress.stage === 'error') {
      return <AlertCircle className="w-4 h-4 text-ui-danger" />;
    }
    if (progress.stage === 'idle') {
      return null;
    }
    return null;
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {getStageIcon()}
        <div className="flex-1 min-w-0">
          <Progress value={percentage} className="h-1.5" />
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {percentage}%
        </span>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getStageIcon()}
          <span className="text-sm font-medium text-foreground">{stageLabel}</span>
          <Badge variant="secondary" className="text-xs">
            {percentage}%
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {timeElapsed > 0 && (
            <span>Elapsed: {formatTime(timeElapsed)}</span>
          )}
          {estimatedTimeRemaining !== null && estimatedTimeRemaining > 0 && (
            <span>Est. remaining: {formatTime(estimatedTimeRemaining)}</span>
          )}
        </div>
      </div>
      
      <Progress value={percentage} className="h-2" />
      
      <p className="text-xs text-muted-foreground">{stageDescription}</p>
    </div>
  );
};
