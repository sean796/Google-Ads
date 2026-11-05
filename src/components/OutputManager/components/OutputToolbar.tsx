import { X, Copy, Code, Check, XCircle, RotateCcw, Edit } from "lucide-react";
import { Button } from "@/ui";
import { handleCopy } from "../utils";

interface OutputToolbarProps {
  currentStage: 'idle' | 'planning' | 'plan_approval_pending' | 'drafting' | 'reviewing' | 'complete' | 'error';
  planApprovalStatus?: 'pending' | 'approved' | 'rejected' | null;
  plan?: string;
  finalOutput?: string;
  isGenerating: boolean;
  onApprovePlan?: () => void;
  onRejectPlan?: () => void;
  onRetryPlan?: () => void;
  onModifyPlan?: () => void;
  onModifyFinal?: () => void;
  onAbort: () => void;
}

export function OutputToolbar({
  currentStage,
  planApprovalStatus,
  plan,
  finalOutput,
  isGenerating,
  onApprovePlan,
  onRejectPlan,
  onRetryPlan,
  onModifyPlan,
  onModifyFinal,
  onAbort,
}: OutputToolbarProps) {
  return (
    <div className="flex flex-shrink-0 items-center justify-center gap-2 bg-background/50 px-6 py-4">
      <div className="flex flex-wrap justify-center gap-2">
        {/* Approval/Reject/Retry buttons */}
        {currentStage === 'plan_approval_pending' && planApprovalStatus === 'pending' && onApprovePlan && onRejectPlan && (
          <>
            <Button variant="run" icon={Check} onClick={onApprovePlan}>
              Approve Plan
            </Button>
            <Button variant="tool" icon={XCircle} onClick={onRejectPlan}>
              Reject Plan
            </Button>
          </>
        )}
        {planApprovalStatus === 'rejected' && onRetryPlan && (
          <>
            <Button variant="run" icon={RotateCcw} onClick={onRetryPlan}>
              Retry Plan
            </Button>
            {onModifyPlan && (
              <Button variant="tool" icon={Edit} onClick={onModifyPlan}>
                Modify Plan
              </Button>
            )}
          </>
        )}
        {/* Modify Plan and Modify Final buttons after completion */}
        {(currentStage === 'complete' || currentStage === 'error') && (
          <>
            {plan && onModifyPlan && (
              <Button variant="tool" icon={Edit} onClick={onModifyPlan}>
                Modify Plan
              </Button>
            )}
            {finalOutput && onModifyFinal && (
              <Button variant="tool" icon={Edit} onClick={onModifyFinal}>
                Modify Final Report
              </Button>
            )}
          </>
        )}

        <Button
          variant="tool"
          icon={Copy}
          onClick={() => handleCopy(finalOutput || '', 'markdown')}
          disabled={isGenerating || !finalOutput}
        >
          Copy Final Markdown
        </Button>

        <Button
          variant="tool"
          icon={Code}
          onClick={() => handleCopy(finalOutput || '', 'html')}
          disabled={isGenerating || !finalOutput}
        >
          Copy Final HTML
        </Button>

        {isGenerating && (
          <Button variant="run" icon={X} onClick={onAbort}>
            Abort Generation
          </Button>
        )}
      </div>
    </div>
  );
}
