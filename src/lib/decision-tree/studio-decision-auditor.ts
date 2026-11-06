/**
 * Studio Decision Auditor
 *
 * Embeds the Decision Agent (Liquid d1.1) throughout Neo Pulse Studios:
 * - Blog Ideas Studio (ideation check, on-brief alignment, CTR score, policy check)
 * - Import Drafts Studio (quality check, depth, voice match)
 * - Press Release Studio (newsworthiness & PR policy)
 * - Proposal Research Studio (relevance & feasibility)
 */

export type { AuditedCSVRow, IdeaAuditSummary } from './studio-decision-auditor-ideas';
export {
  auditBlogIdeasWithDecisionAgent,
  auditSingleIdeaWithDecisionAgent,
} from './studio-decision-auditor-ideas';
export {
  auditImportDraftWithDecisionTree,
  auditPressReleaseWithDecisionTree,
  auditBulkRowContentWithDecisionTree,
} from './studio-decision-auditor-pipelines';
export type { ProposalAuditSummary } from './studio-decision-auditor-proposal';
export { auditProposalWithDecisionAgent } from './studio-decision-auditor-proposal';
export type { VideoPlanAuditSummary } from './studio-decision-auditor-video';
export { auditVideoPlanWithDecisionAgent } from './studio-decision-auditor-video';
export type { SceneClipAuditSummary } from './studio-decision-auditor-clip';
export {
  ANTI_MORPHING_GUARDRAIL_CLAUSE,
  ZERO_PEOPLE_GUARDRAIL_CLAUSE,
  auditSceneClipWithDecisionAgent,
} from './studio-decision-auditor-clip';
