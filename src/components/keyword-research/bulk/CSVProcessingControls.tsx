
import { Play, Square } from 'lucide-react';
import {
  REPORTING_TOOLBAR_BTN,
} from '@/components/research/reporting/reporting-toolbar-styles';
import { cn } from '@/lib/utils';
import { Button } from "@/ui";

interface CSVProcessingControlsProps {
  inputMode: 'csv' | 'prompt';
  rows: Array<unknown>;
  displayRows: Array<unknown>;
  isProcessing: boolean;
  apiKey?: string;
  openRouterApiKey?: string;
  handleStartProcessing: () => Promise<void>;
  cancelProcessing: () => void;
}

export function CSVProcessingControls({
  inputMode,
  rows,
  displayRows,
  isProcessing,
  apiKey,
  openRouterApiKey,
  handleStartProcessing,
  cancelProcessing,
}: CSVProcessingControlsProps) {
  if (inputMode !== 'csv' || rows.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="run"
        onClick={handleStartProcessing}
        disabled={isProcessing || displayRows.length === 0 || !apiKey || !openRouterApiKey}
      >
        {isProcessing ? (
          <>
            
            Processing...
          </>
        ) : (
          <>
            <Play className="h-4 w-4 mr-2" />
            Start Processing
          </>
        )}
      </Button>
      {isProcessing && (
        <Button
          variant="danger"
          onClick={cancelProcessing}
        >
          <Square className="h-4 w-4 mr-2" />
          Cancel
        </Button>
      )}
    </div>
  );
}
