import rawData from "./default-properties-seed.json";
import type { WordPressSite } from "./types";

export const DEFAULT_PROPERTIES_SEED_SITES: WordPressSite[] = (rawData.sites || []) as WordPressSite[];
