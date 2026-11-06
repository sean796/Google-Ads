import type { HarnessSectionListItem } from "@/lib/bulk/harness-sections-reducer";
import type { AgentRunUploadedPost } from "@/lib/agent-runs-types";
import type {
  PostCreatorContentBucketProofFile,
  PostCreatorProofSnapshot,
} from "./agent-run-post-creator-proof-types";

export type ProofStoreEntry = {
  postCount: number;
  activeRowIndex: number | null;
  harnessByRow: Map<number, HarnessSectionListItem[]>;
  uploadedPosts: AgentRunUploadedPost[];
  featuredImageEnabled: boolean;
  contentBucketFiles: PostCreatorContentBucketProofFile[];
  snapshot: PostCreatorProofSnapshot;
};

export const proofByRunId = new Map<number, ProofStoreEntry>();
export const proofListenersByRunId = new Map<number, Set<() => void>>();

export function notifyProof(runId: number): void {
  for (const listener of proofListenersByRunId.get(runId) ?? []) {
    listener();
  }
}
