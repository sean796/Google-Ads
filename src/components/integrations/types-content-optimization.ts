export interface ContentOptimizationProgress {
  step: string;
  progress: number;
  message?: string;
}

export interface ContentOptimizationResult {
  success: boolean;
  postId?: number;
  link?: string;
  title?: string;
  status?: string;
  primaryKeyword?: string;
  optimizedTitle?: string;
  error?: string;
}

// GSC Report AI Analysis Types (simplified - AI handles everything)
export interface AIReportAnalysis {
  executiveSummary: {
    bullets: string[];
    aiInsight: string;
  };
  newTermsTable: string;
  newTermsInsight: string;
  topPerformersTable: string;
  topPerformersInsight: string;
  localSEOTable: string;
  localSEOInsight: string;
  trafficTable: string;
  trafficInsight: string;
  growthOpportunities: string[];
  lookingAheadInsight: string;
}

// Legacy types kept for compatibility but simplified
export interface NewTermsAnalysis {
  newTerms: NewTermWithAnalysis[];
  categories: Record<string, string[]>;
  localTerms: string[];
  aiInsights: string;
  totalNewTerms: number;
  topOpportunities: NewTermWithAnalysis[];
}

export interface NewTermWithAnalysis {
  term: string;
  category: string;
  categoryEmoji: string;
  intent: 'informational' | 'transactional' | 'navigational' | 'local';
  intentEmoji: string;
  opportunityScore: number;
  opportunityEmoji: string;
  impressions?: number;
  clicks?: number;
  position?: number;
}

export interface LocalSEOInsights {
  locationTerms: LocationTerm[];
  serviceAreaExpansion: string[];
  localIntentBreakdown: {
    commercial: number;
    informational: number;
    navigational: number;
  };
  napSignals: string[];
  aiLocalInsights: string;
}

export interface LocationTerm {
  term: string;
  locationType: 'city' | 'region' | 'neighborhood' | 'state' | 'general';
  emoji: string;
  impressions?: number;
  position?: number;
}

export interface EnhancedMetrics {
  metric: string;
  currentValue: string;
  previousValue: string;
  change: string;
  changePercent: string;
  emoji: string;
  isPositive: boolean;
  aiInsight?: string;
}

export interface GSCReportSection {
  title: string;
  emoji: string;
  bullets: string[];
  table?: string;
  aiAnalysis?: string;
}
