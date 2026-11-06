import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { MobilePushDeepLink } from "@/lib/mobile-push/types";

type MobilePushContextValue = {
  pendingDeepLink: MobilePushDeepLink | null;
  applyDeepLink: (link: MobilePushDeepLink) => void;
  consumeDeepLink: () => MobilePushDeepLink | null;
  pushReady: boolean;
  setPushReady: (ready: boolean) => void;
};

export const MobilePushContext = createContext<MobilePushContextValue | null>(null);



export function useMobilePushContext(): MobilePushContextValue {
  const ctx = useContext(MobilePushContext);
  if (!ctx) {
    throw new Error("useMobilePushContext must be used within MobilePushProvider");
  }
  return ctx;
}
