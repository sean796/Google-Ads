import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  PropertiesDashboardChromeContext,
  type PropertiesWorkspaceToolbarState,
} from "./PropertiesDashboardChromeContext";

export function PropertiesDashboardChromeProvider({ children }: { children: ReactNode }) {
  const [toolbarState, setToolbarState] = useState<PropertiesWorkspaceToolbarState | null>(null);
  const value = useMemo(
    () => ({
      toolbarState,
      setToolbarState,
    }),
    [toolbarState],
  );
  return (
    <PropertiesDashboardChromeContext.Provider value={value}>
      {children}
    </PropertiesDashboardChromeContext.Provider>
  );
}
