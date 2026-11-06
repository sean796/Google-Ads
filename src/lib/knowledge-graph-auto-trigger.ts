/**
 * Utility to automatically trigger knowledge graph generation and save to KB
 * Can be called from anywhere, doesn't require component mounting
 */

import { initializeNAPAutoTrigger } from "@/lib/knowledge-graph-auto-trigger-nap-trigger";

export { saveGraphToKnowledgeBase } from "@/lib/knowledge-graph-auto-trigger-save";
export {
  extractNAPAndSaveToKB,
  extractNAPAndSaveToSiteSilent,
} from "@/lib/knowledge-graph-auto-trigger-nap";
export {
  extractNAPAndLinkGraph,
  triggerKnowledgeGraphWorkflow,
} from "@/lib/knowledge-graph-auto-trigger-workflow";
export {
  initializeNAPAutoTrigger,
  manuallyTriggerKnowledgeGraphForNAP,
} from "@/lib/knowledge-graph-auto-trigger-nap-trigger";

// Initialize on module load
if (typeof window !== 'undefined') {
  initializeNAPAutoTrigger();
}
