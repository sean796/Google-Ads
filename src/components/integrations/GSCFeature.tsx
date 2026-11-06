import React from "react";
import {
  ANALYSIS_METHODS,
  type AnalysisMethod,
} from "@/lib/gsc-keyword-analyzer";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Checkbox } from "@/ui";
import { useGscServiceAccountIdentity } from "@/hooks/use-gsc-service-account-identity";
import { GSCConnectionCard, GSCSettingsConnectionSection } from "./GSCConnectionCard";
import { useGscFetchQueries } from "./use-gsc-fetch-queries";
import type { GSCFeatureProps } from "./gsc-feature-types";

export { GSCConnectionCard, GSCSettingsConnectionSection };

export const GSCFeature: React.FC<GSCFeatureProps> = ({ onRef, showConnectionCard = true }) => {
  const gscIdentity = useGscServiceAccountIdentity();
  const gscEmail = gscIdentity.email;
  const {
    handleFetchGSCQueries,
    gscAnalysisDialogOpen,
    setGscAnalysisDialogOpen,
    isFetchingGSC,
    handleOpenGSCAnalysisDialog,
    selectedAnalysisMethods,
    setSelectedAnalysisMethods,
    pendingGSCSite,
    setPendingGSCSite,
  } = useGscFetchQueries(gscEmail);
  
  // Store onRef in a ref to avoid infinite loop - refs don't trigger re-renders
  const onRefRef = React.useRef(onRef);
  React.useEffect(() => {
    onRefRef.current = onRef;
  }, [onRef]);

  // Expose ref to parent - update whenever isFetchingGSC changes
  // Use onRefRef.current instead of onRef in dependencies to break infinite loop
  React.useEffect(() => {
    if (onRefRef.current) {
      onRefRef.current({
        openDialog: handleOpenGSCAnalysisDialog,
        isFetchingGSC,
      });
    }
  }, [handleOpenGSCAnalysisDialog, isFetchingGSC]);


  return (
    <>
      {showConnectionCard ? <GSCConnectionCard identity={gscIdentity} /> : null}

      {/* GSC Analysis Dialog */}
      <Dialog open={gscAnalysisDialogOpen} onOpenChange={setGscAnalysisDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Analysis Methods</DialogTitle>
            <DialogDescription>
              Choose one or more analysis methods to analyze GSC queries for {pendingGSCSite?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {(Object.keys(ANALYSIS_METHODS) as AnalysisMethod[]).map((method) => {
              const methodInfo = ANALYSIS_METHODS[method];
              const isSelected = selectedAnalysisMethods.includes(method);
              
              return (
                <div
                  key={method}
                  className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                >
                  <Checkbox
                    id={method}
                    checked={isSelected}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedAnalysisMethods([...selectedAnalysisMethods, method]);
                      } else {
                        setSelectedAnalysisMethods(selectedAnalysisMethods.filter(m => m !== method));
                      }
                    }}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <label
                      htmlFor={method}
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      {methodInfo.label}
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                setGscAnalysisDialogOpen(false);
                setSelectedAnalysisMethods([]);
                setPendingGSCSite(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="run"
              onClick={() => {
                if (!pendingGSCSite) return;
                if (selectedAnalysisMethods.length === 0) {
                  // No methods selected, just fetch with keyword metrics
                  handleFetchGSCQueries(pendingGSCSite, []);
                } else {
                  // Methods selected, fetch and run analyses
                  handleFetchGSCQueries(pendingGSCSite, selectedAnalysisMethods);
                }
              }}
              disabled={!pendingGSCSite}
            >
              {selectedAnalysisMethods.length === 0 ? 'Fetch Queries Only' : `Fetch & Analyze (${selectedAnalysisMethods.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
