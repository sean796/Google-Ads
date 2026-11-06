import { useState, useEffect, useMemo } from "react";
import { logger } from "@/lib/logger";
import type { KeywordData, KeywordDensityAnalysis } from "@/lib/keyword-types";
import { analyzeKeywordDensity } from "@/lib/keyword-density-analyzer";

interface UseKeywordDensityProps {
  content: string;
  keywords: KeywordData[] | undefined;
  enabled?: boolean;
}

export function useKeywordDensity({
  content,
  keywords,
  enabled = true,
}: UseKeywordDensityProps) {
  const [densityAnalysis, setDensityAnalysis] = useState<KeywordDensityAnalysis[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    if (!enabled || !content || !keywords || keywords.length === 0) {
      setDensityAnalysis([]);
      return;
    }

    setIsAnalyzing(true);
    
    // Use setTimeout to avoid blocking UI during analysis
    const timeoutId = setTimeout(() => {
      try {
        const analysis = analyzeKeywordDensity(content, keywords);
        setDensityAnalysis(analysis);
      } catch (error) {
        logger.error("Error analyzing keyword density:", error);
        setDensityAnalysis([]);
      } finally {
        setIsAnalyzing(false);
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [content, keywords, enabled]);

  const overallScore = useMemo(() => {
    if (densityAnalysis.length === 0) return null;

    // Calculate average score based on how many keywords are in optimal range
    const inRange = densityAnalysis.filter(
      (analysis) =>
        analysis.density >= analysis.optimalRange.min &&
        analysis.density <= analysis.optimalRange.max
    ).length;

    return Math.round((inRange / densityAnalysis.length) * 100);
  }, [densityAnalysis]);

  const allRecommendations = useMemo(() => {
    return densityAnalysis.flatMap((analysis) => analysis.recommendations);
  }, [densityAnalysis]);

  return {
    densityAnalysis,
    isAnalyzing,
    overallScore,
    allRecommendations,
  };
}

