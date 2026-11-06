import type { WordPressSite } from "@/components/integrations/types";
import type {
  ClientTagEntry,
  VerticalBenchmarkContentKind,
  VerticalBenchmarkExportGscResult,
} from "@/lib/vertical-benchmark/vertical-benchmark-types";

/** Same-origin in dev (Vite proxy); optional absolute API host in production builds. */
const VERTICAL_BENCHMARK_API_BASE =
  import.meta.env.VITE_MCP_API_BASE?.replace(/\/api\/mcp\/?$/, "") || "";

function url(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = VERTICAL_BENCHMARK_API_BASE.replace(/\/$/, "");
  return base ? `${base}/api/vertical-benchmarks${p}` : `/api/vertical-benchmarks${p}`;
}

async function parseJson<T>(res: Response): Promise<T & { ok?: boolean; error?: string }> {
  return (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
}

function headers(openRouterApiKey?: string): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (openRouterApiKey?.trim()) {
    h["X-OpenRouter-Api-Key"] = openRouterApiKey.trim();
  }
  return h;
}

export async function classifyVerticalBenchmarkClients(args: {
  sites: WordPressSite[];
  openRouterApiKey: string;
  model?: string;
}): Promise<ClientTagEntry[]> {
  const res = await fetch(url("/classify-clients"), {
    method: "POST",
    credentials: "include",
    headers: headers(args.openRouterApiKey),
    body: JSON.stringify({ sites: args.sites, model: args.model }),
  });
  const data = await parseJson<{ clients?: ClientTagEntry[] }>(res);
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data.clients ?? [];
}

async function consumeExportNdjson(
  body: ReadableStream<Uint8Array>,
  onProgress: (done: number, total: number, siteId?: string) => void,
): Promise<VerticalBenchmarkExportGscResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let rows: VerticalBenchmarkExportGscResult["rows"] = [];
  let extendedRows: VerticalBenchmarkExportGscResult["extendedRows"] = [];
  let results: VerticalBenchmarkExportGscResult["results"] = [];
  let dateRange: VerticalBenchmarkExportGscResult["dateRange"];

  while (true) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed) as {
          type: string;
          done?: number;
          total?: number;
          siteId?: string;
          rows?: VerticalBenchmarkExportGscResult["rows"];
          extendedRows?: VerticalBenchmarkExportGscResult["extendedRows"];
          results?: VerticalBenchmarkExportGscResult["results"];
          dateRange?: VerticalBenchmarkExportGscResult["dateRange"];
          error?: string;
        };
        if (obj.type === "progress" && typeof obj.done === "number" && typeof obj.total === "number") {
          onProgress(obj.done, obj.total, obj.siteId);
        } else if (obj.type === "done") {
          rows = obj.rows ?? [];
          extendedRows = obj.extendedRows ?? [];
          results = obj.results ?? [];
          dateRange = obj.dateRange;
        }
      } catch {
        /* skip malformed ndjson line */
      }
    }
    if (done) break;
  }

  if (buffer.trim()) {
    try {
      const obj = JSON.parse(buffer.trim()) as {
        type: string;
        rows?: VerticalBenchmarkExportGscResult["rows"];
        extendedRows?: VerticalBenchmarkExportGscResult["extendedRows"];
        results?: VerticalBenchmarkExportGscResult["results"];
        dateRange?: VerticalBenchmarkExportGscResult["dateRange"];
        error?: string;
      };
      if (obj.type === "done") {
        rows = obj.rows ?? [];
        extendedRows = obj.extendedRows ?? [];
        results = obj.results ?? [];
        dateRange = obj.dateRange;
      }
    } catch {
      /* ignore trailing parse noise */
    }
  }

  return { rows, extendedRows, results, dateRange };
}

export async function exportVerticalBenchmarkGscCsv(args: {
  sites: WordPressSite[];
  siteIds?: string[];
  contentKinds?: VerticalBenchmarkContentKind[];
  clientTagBySiteId?: Record<string, string>;
  clientTagLabelBySiteId?: Record<string, string>;
  openRouterApiKey: string;
  model?: string;
  onProgress?: (done: number, total: number, siteId?: string) => void;
}): Promise<VerticalBenchmarkExportGscResult> {
  const res = await fetch(url("/export-gsc-csv"), {
    method: "POST",
    credentials: "include",
    headers: headers(args.openRouterApiKey),
    body: JSON.stringify({
      sites: args.sites,
      siteIds: args.siteIds,
      contentKinds: args.contentKinds,
      clientTagBySiteId: args.clientTagBySiteId,
      clientTagLabelBySiteId: args.clientTagLabelBySiteId,
      model: args.model,
    }),
  });

  const contentType = res.headers.get("Content-Type") ?? "";
  if (!res.ok) {
    const data = await parseJson<{ error?: string }>(res);
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  if (contentType.includes("ndjson") && res.body) {
    return consumeExportNdjson(res.body, (done, total, siteId) => {
      args.onProgress?.(done, total, siteId);
    });
  }

  const data = await parseJson<VerticalBenchmarkExportGscResult & { ok?: boolean }>(res);
  if (data.ok === false) {
    throw new Error(data.error || "Export failed");
  }
  return {
    rows: data.rows ?? [],
    extendedRows: data.extendedRows ?? [],
    results: data.results ?? [],
    dateRange: data.dateRange,
  };
}
