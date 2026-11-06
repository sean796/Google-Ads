import { useCallback, useState } from "react";
import { parseSemrushErrorCsv } from "@/lib/overview/parse-semrush-error-csv";
import type { OverviewRowErrorFilterKey } from "@/lib/overview/overview-row-error-filters";

export function useOverviewTabFilterState() {
  const [semrushFilterUrlKeys, setSemrushFilterUrlKeys] = useState<Set<string> | null>(null);
  const [semrushCsvFileName, setSemrushCsvFileName] = useState<string | null>(null);
  const [activeErrorFilters, setActiveErrorFilters] = useState<Set<OverviewRowErrorFilterKey>>(
    new Set(),
  );
  const setSemrushCsvUpload = useCallback((file: File) => {
    void file.text().then((text) => {
      setSemrushFilterUrlKeys(parseSemrushErrorCsv(text));
      setSemrushCsvFileName(file.name);
    });
  }, []);

  const clearSemrushCsvUpload = useCallback(() => {
    setSemrushFilterUrlKeys(null);
    setSemrushCsvFileName(null);
  }, []);

  const toggleErrorFilter = useCallback((key: OverviewRowErrorFilterKey) => {
    setActiveErrorFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearErrorFilters = useCallback(() => {
    setActiveErrorFilters(new Set());
  }, []);

  return {
    semrushFilterUrlKeys,
    semrushCsvFileName,
    activeErrorFilters,
    setSemrushCsvUpload,
    clearSemrushCsvUpload,
    toggleErrorFilter,
    clearErrorFilters,
  };
}
