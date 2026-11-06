import type * as React from "react";
import type { WordPressSite } from "../types";

export interface NeoFieldsTestResult {
  success: boolean;
  hasNeoFieldsSupport?: boolean;
  neoFields?: Record<string, unknown>;
  error?: string;
  requiredConfig?: { php: string[] };
}

export interface WordPressCardActionsProps {
  site: WordPressSite;
  isTesting: boolean;
  isDetecting: boolean;
  isExtractingNAPAndGraph: boolean;
  onTest: () => void;
  onDetect: () => void;
  onExtractNAPAndGraph?: () => void;
  onPatchSite?: (siteId: string, patch: Partial<WordPressSite>) => void;
  /** Embedded property panel on black: white labels, flat section chrome. */
  tone?: "card" | "propertyBlack";
  /** `profileCard`: host-style Connections card for the property profile page. */
  layout?: "default" | "profileCard";
}

export type ConnectionAction = {
    key: string;
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    disabled: boolean;
    className?: string;
    title?: string;
  };
