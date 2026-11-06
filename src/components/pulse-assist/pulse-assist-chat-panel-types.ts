import type { PlatformDataResearchMeta } from "@/lib/platform-data/types";
import type {
  AssistCardStep,
  AssistHistoryMessage,
} from "@/lib/pulse-assist/types";

export type Turn =
  | { kind: "user"; text: string }
  | ({ kind: "card"; card: NonNullable<AssistHistoryMessage["card"]> } & PlatformDataResearchMeta)
  | { kind: "ack"; text: string }
  | { kind: "thinking"; title: string; steps: AssistCardStep[] };
