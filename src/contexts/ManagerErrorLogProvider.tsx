import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  MAX_ENTRIES,
  ManagerErrorLogContext,
  type ManagerErrorLogEntry,
} from "./manager-error-log-context";

export function ManagerErrorLogProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [entries, setEntries] = useState<ManagerErrorLogEntry[]>([]);
  const seqRef = useRef(0);

  const reportError = useCallback((message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setEntries((prev) => {
      if (prev[0]?.message === trimmed) return prev;
      const next: ManagerErrorLogEntry = {
        id: `manager-error-${++seqRef.current}`,
        message: trimmed,
        at: Date.now(),
      };
      return [next, ...prev].slice(0, MAX_ENTRIES);
    });
  }, []);

  const clearErrors = useCallback(() => {
    setEntries([]);
  }, []);

  const value = useMemo(
    () => ({
      entries,
      reportError,
      clearErrors,
    }),
    [clearErrors, entries, reportError],
  );

  return <ManagerErrorLogContext.Provider value={value}>{children}</ManagerErrorLogContext.Provider>;
}
