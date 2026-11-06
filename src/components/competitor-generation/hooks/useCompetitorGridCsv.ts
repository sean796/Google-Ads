import { useCallback, useState } from "react";
import Papa from "papaparse";
import type { WordPressSite } from "@/components/integrations/types";
import { notify } from "@/lib/app-notifications";
import { notifyFileTooLargeMaxXMb } from "@/lib/notify-messages";
import {
  filterPlacesExcludingConnectedSite,
  GRID_ONLY_CONNECTED_SITE_MESSAGE,
} from "@/lib/competitor-research/filter-connected-site-competitors";
import {
  GRID_CSV_MAX_PLACES_DEFAULT,
  parseCompetitorGridTopPlaces,
  type CompetitorGridPlaceRow,
} from "@/lib/competitor-research/local-dominator-grid-parse";
import { MAX_LOCAL_CSV_FILE_BYTES } from "@/lib/local-dominator-csv";

function rowKeyMap(row: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.trim().replace(/^\uFEFF/g, "").toLowerCase(), v]),
  );
}

function pickKeywordFromRow(row: Record<string, string>): string {
  const lower = rowKeyMap(row);
  for (const key of ["keyword", "search term", "query"]) {
    const v = lower[key];
    if (v?.trim()) return v.trim();
  }
  return "";
}

export function parseKeywordFromGridCsv(csvText: string): string {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h) => h.trim().replace(/^\uFEFF/g, ""),
  });
  for (const row of parsed.data ?? []) {
    const kw = pickKeywordFromRow(row);
    if (kw) return kw;
  }
  return "";
}

function looksLikeBulkExportCsv(csvText: string): boolean {
  const parsed = Papa.parse<string[]>(csvText, {
    preview: 1,
    skipEmptyLines: true,
  });
  const header = (parsed.data?.[0] ?? []).map((h) => h.trim().replace(/^\uFEFF/g, "").toLowerCase());
  if (header.length < 3) return false;
  const hasEntity = header.includes("entity");
  const hasTitle = header.includes("title");
  const hasModifier = header.includes("modifier");
  const hasBulkKeyword = header.includes("keyword");
  return hasEntity && hasTitle && hasModifier && hasBulkKeyword;
}

export type CompetitorGridCsvLoadResult =
  | { ok: true; keyword: string; placeCount: number; fileName: string }
  | { ok: false; error: string };

export function useCompetitorGridCsv() {
  const [gridPlaces, setGridPlaces] = useState<CompetitorGridPlaceRow[]>([]);
  const [gridCsvName, setGridCsvName] = useState<string | null>(null);
  const [gridParseError, setGridParseError] = useState<string | null>(null);
  const [gridKeywordFromCsv, setGridKeywordFromCsv] = useState("");
  const [csvParsing, setCsvParsing] = useState(false);

  const loadGridCsvFile = useCallback(
    async (
      file: File | null,
      maxPlaces = GRID_CSV_MAX_PLACES_DEFAULT,
      site?: WordPressSite,
    ): Promise<CompetitorGridCsvLoadResult> => {
      if (!file) {
        return { ok: false, error: "No file selected." };
      }
      if (file.size > MAX_LOCAL_CSV_FILE_BYTES) {
        const msg = notifyFileTooLargeMaxXMb(MAX_LOCAL_CSV_FILE_BYTES / (1024 * 1024));
        notify.error(msg);
        return { ok: false, error: msg };
      }
      setCsvParsing(true);
      setGridParseError(null);
      try {
        const text = await file.text();
        if (looksLikeBulkExportCsv(text)) {
          const msg = "Upload a Local Dominator grid CSV, not a Bulk CSV export.";
          setGridParseError(msg);
          notify.error(msg);
          return { ok: false, error: msg };
        }
        const keyword = parseKeywordFromGridCsv(text);
        const parseLimit = Math.max(maxPlaces, GRID_CSV_MAX_PLACES_DEFAULT);
        const parsed = parseCompetitorGridTopPlaces(text, parseLimit);
        const places = site
          ? filterPlacesExcludingConnectedSite(parsed.places, site)
          : parsed.places;
        if (places.length === 0) {
          const msg = site
            ? GRID_ONLY_CONNECTED_SITE_MESSAGE
            : (parsed.error ?? "No competitor businesses found in grid CSV.");
          setGridParseError(msg);
          notify.error(msg);
          return { ok: false, error: msg };
        }
        setGridPlaces(places);
        setGridCsvName(file.name);
        setGridKeywordFromCsv(keyword);
        if (parsed.error) setGridParseError(parsed.error);
        return { ok: true, keyword, placeCount: places.length, fileName: file.name };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setGridParseError(msg);
        notify.error(msg);
        return { ok: false, error: msg };
      } finally {
        setCsvParsing(false);
      }
    },
    [],
  );

  const clearGridCsv = useCallback(() => {
    setGridPlaces([]);
    setGridCsvName(null);
    setGridParseError(null);
    setGridKeywordFromCsv("");
  }, []);

  return {
    gridPlaces,
    gridCsvName,
    gridParseError,
    gridKeywordFromCsv,
    csvParsing,
    loadGridCsvFile,
    clearGridCsv,
    setGridPlaces,
  };
}
