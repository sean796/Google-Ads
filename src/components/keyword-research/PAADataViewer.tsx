import { logger } from "@/lib/logger";
import { Card } from "@/ui";


interface PAADataViewerProps {
  rawResponse: unknown;
}

export function PAADataViewer({
  rawResponse,
}: PAADataViewerProps) {
  // Safely stringify the response with error handling
  const getFormattedResponse = () => {
    if (!rawResponse) {
      return 'No raw response data available. The API call may not have completed yet.';
    }
    
    try {
      return JSON.stringify(rawResponse, null, 2);
    } catch (error) {
      // Handle circular references or other stringify errors
      try {
        // Try with a replacer function to handle circular references
        const seen = new WeakSet();
        return JSON.stringify(rawResponse, (key, value) => {
          if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
              return '[Circular Reference]';
            }
            seen.add(value);
          }
          return value;
        }, 2);
      } catch (secondError) {
        return `Error formatting response: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  };

  try {
    return (
      <div className="space-y-3">
        <Card className="p-4">
          <div>
            <h4 className="text-sm font-semibold mb-2">Raw SERP Data from DataForSEO:</h4>
            <pre className="bg-muted p-4 rounded overflow-auto text-xs" style={{ maxHeight: '600px', whiteSpace: 'pre-wrap' }}>
              {getFormattedResponse()}
            </pre>
          </div>
        </Card>
      </div>
    );
  } catch (error) {
    logger.error('[PAADataViewer] Render error:', error);
    return (
      <div className="space-y-3">
        <Card className="p-4 border-destructive">
          <div>
            <h4 className="text-sm font-semibold mb-2 text-destructive">Error displaying PAA data:</h4>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : String(error)}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Check the browser console for more details.
            </p>
          </div>
        </Card>
      </div>
    );
  }
}

