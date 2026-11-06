import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ManagerErrorLogEntry = {
  id: string;
  message: string;
  at: number;
};

type ManagerErrorLogContextValue = {
  entries: ManagerErrorLogEntry[];
  reportError: (message: string) => void;
  clearErrors: () => void;
};

export const ManagerErrorLogContext = createContext<ManagerErrorLogContextValue | null>(null);

export const MAX_ENTRIES = 30;

export function useManagerErrorLog(): ManagerErrorLogContextValue {
  const value = useContext(ManagerErrorLogContext);
  if (!value) {
    return {
      entries: [],
      reportError: () => {},
      clearErrors: () => {},
    };
  }
  return value;
}


