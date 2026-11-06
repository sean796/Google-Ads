import { runDecisionTreePipeline } from './decision-tree-runner';
import type { DecisionTreeState } from './decision-tree-types';

/**
 * Runs an imported article draft through the full Decision Tree QA Pipeline.
 */
export async function auditImportDraftWithDecisionTree(args: {
  title: string;
  keyword: string;
  content: string;
  siteId?: string | null;
  apiKey?: string;
}): Promise<DecisionTreeState> {
  return runDecisionTreePipeline({
    brief: {
      topicTitle: args.title,
      primaryKeyword: args.keyword,
      existingDraft: args.content,
      searchIntent: 'informational',
    },
    draftText: args.content,
    siteId: args.siteId,
    openRouterApiKey: args.apiKey,
  });
}

/**
 * Runs a press release draft through the Decision Tree QA Pipeline.
 */
export async function auditPressReleaseWithDecisionTree(args: {
  headline: string;
  body: string;
  siteId?: string | null;
  apiKey?: string;
}): Promise<DecisionTreeState> {
  return runDecisionTreePipeline({
    brief: {
      topicTitle: args.headline,
      primaryKeyword: args.headline,
      existingDraft: args.body,
      searchIntent: 'commercial',
    },
    draftText: args.body,
    thresholds: {
      thinContentFloor: 1.0, // PRs are typically tighter
      publishReadyThreshold: 0.80,
    },
    siteId: args.siteId,
    openRouterApiKey: args.apiKey,
  });
}


/**
 * Runs the full Decision Tree QA on a generated blog post in the Bulk CSV Pipeline.
 */
export async function auditBulkRowContentWithDecisionTree(args: {
  title: string;
  keyword: string;
  markdownContent: string;
  siteId?: string | null;
  apiKey?: string;
}): Promise<DecisionTreeState> {
  return runDecisionTreePipeline({
    brief: {
      topicTitle: args.title,
      primaryKeyword: args.keyword,
      existingDraft: args.markdownContent,
      searchIntent: 'informational',
    },
    draftText: args.markdownContent,
    siteId: args.siteId,
    openRouterApiKey: args.apiKey,
  });
}
