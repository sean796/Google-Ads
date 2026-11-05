import React from 'react';
import { ShieldCheck, ShieldAlert, AlertTriangle, Sparkles, CheckCircle2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { IdeaAuditSummary } from '@/lib/decision-tree/studio-decision-auditor';

export interface DecisionAuditRowBadgeProps {
  auditJson?: string;
  className?: string;
  showScores?: boolean;
}

export function parseDecisionAuditJson(raw?: string): IdeaAuditSummary | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && ('verdict' in parsed || 'terminalState' in parsed || 'pacingFitScore' in parsed)) {
      if ('pacingFitScore' in parsed) {
        return {
          keyword: parsed.planTitle ?? '',
          title: parsed.planTitle ?? '',
          onBriefProbability: parsed.productionReadyProbability ?? 0.95,
          intentScore: parsed.storyArcScore ?? 2.5,
          clickAppealScore: parsed.pacingFitScore ?? 2.5,
          policySafeProbability: parsed.brandSafetyProbability ?? 0.98,
          verdict: parsed.verdict ?? 'approved',
          reasoning: parsed.reasoning ?? '',
        };
      }
      if ('terminalState' in parsed) {
        const isReady = parsed.terminalState === 'PUBLISH_READY';
        const isReview = parsed.terminalState === 'EXIT_HUMAN_REVIEW';
        return {
          keyword: parsed.brief?.primaryKeyword ?? '',
          title: parsed.brief?.topicTitle ?? '',
          onBriefProbability: parsed.thresholds?.onBriefFloor ?? 0.85,
          intentScore: 2.5,
          clickAppealScore: 2.5,
          policySafeProbability: 0.98,
          verdict: isReady ? 'approved' : isReview ? 'review_recommended' : 'rejected',
          reasoning: `Decision Tree: ${parsed.terminalState} (QA: ${(Number(parsed.qaScore ?? 0.85) * 100).toFixed(0)}%)`,
        };
      }
      return parsed as IdeaAuditSummary;
    }
  } catch {
    /* ignore json parse error */
  }
  return null;
}

export const DecisionAuditRowBadge: React.FC<DecisionAuditRowBadgeProps> = ({
  auditJson,
  className,
  showScores = false,
}) => {
  const audit = parseDecisionAuditJson(auditJson);
  if (!audit) return null;

  const isApproved = audit.verdict === 'approved';
  const isReview = audit.verdict === 'review_recommended';
  const isRejected = audit.verdict === 'rejected';

  const badgeColor = isApproved
    ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-400 hover:bg-emerald-900/60'
    : isReview
      ? 'border-amber-500/40 bg-amber-950/60 text-amber-400 hover:bg-amber-900/60'
      : 'border-rose-500/40 bg-rose-950/60 text-rose-400 hover:bg-rose-900/60';

  const label = isApproved ? 'd1.1 Passed' : isReview ? 'd1.1 Review' : 'd1.1 Flagged';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono tracking-tight border transition-colors select-none cursor-help',
            badgeColor,
            className,
          )}
        >
          {isApproved ? (
            <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden />
          ) : isReview ? (
            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
          ) : (
            <ShieldAlert className="h-3 w-3 shrink-0" aria-hidden />
          )}
          <span>{label}</span>
          {showScores && (
            <span className="text-[10px] opacity-80 border-l border-white/20 pl-1">
              {(audit.onBriefProbability * 100).toFixed(0)}%
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs bg-zinc-900 border border-zinc-700 p-2.5 text-xs text-zinc-200">
        <div className="font-semibold text-white mb-1 flex items-center justify-between">
          <span>Decision Model (Liquid d1.1)</span>
          <span className="capitalize text-[11px] text-zinc-400">{audit.verdict.replace('_', ' ')}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] font-mono text-zinc-300">
          <div>On-Brief: {(audit.onBriefProbability * 100).toFixed(0)}%</div>
          <div>Policy Safe: {(audit.policySafeProbability * 100).toFixed(0)}%</div>
          <div>Intent Fit: {audit.intentScore.toFixed(1)}/3</div>
          <div>Click Appeal: {audit.clickAppealScore.toFixed(1)}/3</div>
        </div>
        {audit.reasoning && (
          <p className="mt-1.5 text-[11px] text-zinc-400 border-t border-zinc-800 pt-1">
            {audit.reasoning}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
};
