import React from "react";

import { ExternalLink, Download, Trash2, Clock, CheckCircle2, XCircle, AlertCircle, Copy } from "lucide-react";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_URL_COPIED } from "@/lib/notify-messages";
import { format } from "date-fns";
import { type WordPressSite } from "../types";
import { cn } from "@/lib/utils";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/ui";

export interface OptimizationHistoryEntry {
  id: string;
  url: string;
  title?: string;
  timestamp: number;
  status: 'success' | 'failed' | 'in-progress';
  fileCount?: number;
  files?: Array<{ name: string; content: string; type: string }>;
  error?: string;
}

interface OptimizationHistoryPanelProps {
  site: WordPressSite;
  history: OptimizationHistoryEntry[];
  onViewDetails?: (entry: OptimizationHistoryEntry) => void;
  onDownloadFiles?: (entry: OptimizationHistoryEntry) => void;
  onClearHistory?: () => void;
  disabled?: boolean;
}

export const OptimizationHistoryPanel: React.FC<OptimizationHistoryPanelProps> = ({
  site: _site,
  history,
  onViewDetails,
  onDownloadFiles,
  onClearHistory,
  disabled = false,
}) => {
  const getStatusIcon = (status: OptimizationHistoryEntry['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-3 w-3 text-primary dark:text-primary" />;
      case 'failed':
        return <XCircle className="h-3 w-3 text-destructive" />;
      case 'in-progress':
        return <Clock className="h-3 w-3 text-semantic-warning dark:text-semantic-warning" />;
      default:
        return <AlertCircle className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const getStatusLabel = (status: OptimizationHistoryEntry['status']) => {
    switch (status) {
      case 'success':
        return 'Success';
      case 'failed':
        return 'Failed';
      case 'in-progress':
        return 'In Progress';
      default:
        return 'Unknown';
    }
  };

  return (
    <Card className="mt-2 w-full">
      <CardHeader className="py-3">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider">
          Optimization History
          <span className="ml-2 text-xs font-normal normal-case text-muted-foreground">({history.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="max-h-[400px] space-y-2 overflow-y-auto pt-0">
        {history.map((entry) => (
          <div
            key={entry.id}
            className={cn(
              "space-y-1.5 rounded-md border border-border bg-card p-2 text-xs",
              entry.status === 'success' && "bg-muted/20",
              entry.status === 'failed' && "border-destructive/30 bg-destructive/5",
              entry.status === 'in-progress' && "bg-semantic-warning/5"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  {getStatusIcon(entry.status)}
                  <span
                    className={cn(
                      "break-words font-medium",
                      entry.status === 'success' && "text-primary dark:text-primary",
                      entry.status === 'failed' && "text-destructive",
                      entry.status === 'in-progress' && "text-semantic-warning dark:text-semantic-warning-foreground"
                    )}
                  >
                    {entry.title || entry.url}
                  </span>
                </div>
                <div className="mb-1 flex items-start gap-1.5">
                  <span className="flex-1 break-all font-mono text-sm text-muted-foreground">
                    {entry.url}
                  </span>
                  <Button
                    variant="quiet"
                    onClick={() => {
                      navigator.clipboard.writeText(entry.url);
                      notify.success(NOTIFY_URL_COPIED);
                    }}
                    title="Copy URL"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>{format(new Date(entry.timestamp), "MMM d, yyyy 'at' h:mm a")}</span>
                  <span
                    className={cn(
                      entry.status === 'success' && "text-primary dark:text-primary",
                      entry.status === 'failed' && "text-destructive",
                      entry.status === 'in-progress' && "text-semantic-warning dark:text-semantic-warning-foreground"
                    )}
                  >
                    {getStatusLabel(entry.status)}
                  </span>
                  {entry.fileCount !== undefined && entry.fileCount > 0 && (
                    <span>
                      {entry.fileCount} file{entry.fileCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {entry.error && (
                  <div className="mt-1 break-words text-sm text-destructive">
                    {entry.error}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 pt-1">
              <Button
                onClick={() => window.open(entry.url, '_blank')}
                title="Open URL"
              >
                <ExternalLink className="mr-1 h-3 w-3" />
                Open
              </Button>
              {entry.status === 'success' && entry.fileCount && entry.fileCount > 0 && onDownloadFiles && (
                <Button
                  onClick={() => onDownloadFiles(entry)}
                  title="Download files"
                >
                  <Download className="mr-1 h-3 w-3" />
                  Download
                </Button>
              )}
              {onViewDetails && (
                <Button
                  onClick={() => onViewDetails(entry)}
                  title="View details"
                >
                  Details
                </Button>
              )}
            </div>
          </div>
        ))}

        {onClearHistory && (
          <Button
            onClick={onClearHistory}
            disabled={disabled}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Clear History
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
