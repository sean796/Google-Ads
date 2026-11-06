export interface MasterInstructionsFileMeta {
  name: string;
  uploadedAt: number;
}

export type MasterInstructionSourceKind =
  | "pdf-summary"
  | "openrouter-section-summary"
  | "semantic-triples"
  | "gbp-address-json";

/** One uploaded document; content kept so files can be removed individually. */
export interface MasterInstructionSource extends MasterInstructionsFileMeta {
  content: string;
  /** AI-processed: legacy markdown, flat triples, or nested [subject] + predicate<TAB>object blocks. */
  kind?: MasterInstructionSourceKind;
  /** Character count of extracted text before AI summary (when kind is set). */
  originalExtractedChars?: number;
}

export interface MasterInstructionsPayload {
  sources: MasterInstructionSource[];
}

export type GbpMasterRulesGrounding = {
  businessName: string;
  latitude: number;
  longitude: number;
  placeId: string | null;
  cid: string | null;
};
