import React, { useState, useCallback, useRef } from "react";

import { notify } from "@/lib/app-notifications";
import { NOTIFY_LIST_LOADED, NOTIFY_NO_PENDING_TASKS_TO_FIX, NOTIFY_PASTE_OR_UPLOAD_A_TASK_LIST_FIRST, NOTIFY_SELECT_A_WORDPRESS_SITE_FIRST, NOTIFY_SHEET_EXPORTED, notifyFixRunCompleteXTaskSProcessed, notifyInterpretedXTaskS } from "@/lib/notify-messages";
import { Wrench, Upload, FileText, Download, Printer } from "lucide-react";
import { getStoredSites } from "@/components/integrations/storage";
import type { WordPressSite } from "@/components/integrations/types";
import { interpretSemTaskList, type InterpretedSemTask } from "@/lib/sem-task-interpreter";
import { useContentOptimization } from "@/hooks/use-content-optimization";
import type {
  GSCQuery,
  GSCQueryClusterAnalysis,
} from "@/lib/gsc-query-clustering";
import { Button, FileInput, SelectField, TextareaField, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/ui";

export type SemTaskRow = InterpretedSemTask & {
  status: "pending" | "fixing" | "done" | "error";
  changeSummary?: string;
  error?: string;
};

export const SEMFeature: React.FC = () => {
  const sites = getStoredSites();
  const [selectedSite, setSelectedSite] = useState<WordPressSite | null>(null);
  const [rawList, setRawList] = useState("");
  const [tasks, setTasks] = useState<SemTaskRow[]>([]);
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { handleOptimizeContent } = useContentOptimization();

  const [, setGscQueriesForSelection] = useState<Record<string, GSCQuery[]>>(() => ({}));
  const [, setIsKeywordSelectionOpen] = useState<Record<string, boolean>>(() => ({}));
  const [, setGscClusterAnalysis] = useState<Record<string, GSCQueryClusterAnalysis>>(() => ({}));
  const [, setIsAnalyzingClusters] = useState<Record<string, boolean>>(() => ({}));

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = (reader.result as string) ?? "";
        setRawList(text);
        notify.success(NOTIFY_LIST_LOADED);
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    []
  );

  const handleInterpretList = useCallback(async () => {
    if (!rawList.trim()) {
      notify.error(NOTIFY_PASTE_OR_UPLOAD_A_TASK_LIST_FIRST);
      return;
    }
    setIsInterpreting(true);
    try {
      const interpreted = await interpretSemTaskList(
        rawList,
        selectedSite?.siteUrl
      );
      setTasks(
        interpreted.map((t) => ({
          ...t,
          status: "pending" as const,
          changeSummary: undefined,
          error: undefined,
        }))
      );
      notify.success(notifyInterpretedXTaskS(interpreted.length));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Interpretation failed.";
      notify.error(msg);
    } finally {
      setIsInterpreting(false);
    }
  }, [rawList, selectedSite?.siteUrl]);

  const runFixForTask = useCallback(
    async (task: SemTaskRow, site: WordPressSite) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.url === task.url && t.lineIndex === task.lineIndex
            ? { ...t, status: "fixing" as const }
            : t
        )
      );
      try {
        await handleOptimizeContent(
          site,
          task.url,
          "update",
          setGscQueriesForSelection,
          setIsKeywordSelectionOpen,
          setGscClusterAnalysis,
          setIsAnalyzingClusters,
          true,
          {
            optimizeTitle: true,
            optimizeMeta: true,
            optimizeExcerpt: true,
            optimizeContent: true,
          },
          undefined,
          undefined,
          false
        );
        setTasks((prev) =>
          prev.map((t) =>
            t.url === task.url && t.lineIndex === task.lineIndex
              ? { ...t, status: "done" as const, changeSummary: "Optimized" }
              : t
          )
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Optimization failed.";
        setTasks((prev) =>
          prev.map((t) =>
            t.url === task.url && t.lineIndex === task.lineIndex
              ? { ...t, status: "error" as const, error: msg }
              : t
          )
        );
      }
    },
    [handleOptimizeContent]
  );

  const handleFixIt = useCallback(async () => {
    if (!selectedSite) {
      notify.error(NOTIFY_SELECT_A_WORDPRESS_SITE_FIRST);
      return;
    }
    const pending = tasks.filter((t) => t.status === "pending");
    if (pending.length === 0) {
      notify.info(NOTIFY_NO_PENDING_TASKS_TO_FIX);
      return;
    }
    setIsFixing(true);
    for (const task of pending) {
      await runFixForTask(task, selectedSite);
    }
    setIsFixing(false);
    notify.success(notifyFixRunCompleteXTaskSProcessed(pending.length));
  }, [selectedSite, tasks, runFixForTask]);

  const handleExportSheet = useCallback(() => {
    const header = "lineIndex,url,suggestedAction,status,changeSummary,error\n";
    const rows = tasks.map(
      (t) =>
        `${t.lineIndex},"${(t.url || "").replace(/"/g, '""')}","${(t.suggestedAction || "").replace(/"/g, '""')}",${t.status},"${(t.changeSummary ?? "").replace(/"/g, '""')}","${(t.error ?? "").replace(/"/g, '""')}"`
    );
    const csv = header + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sem-task-list-results.csv";
    a.click();
    URL.revokeObjectURL(url);
    notify.success(NOTIFY_SHEET_EXPORTED);
  }, [tasks]);

  const handlePrintSheet = useCallback(() => {
    setPrintDialogOpen(true);
  }, []);

  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const hasTasks = tasks.length > 0;

  return (
    <>
      <div className="bg-card p-6 rounded-lg border border-border">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              SEM Task List
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Upload a list of URLs or issues; AI interprets and fixes content on
              your WordPress site.
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <Button
              onClick={handleFixIt}
              disabled={
                !selectedSite ||
                pendingCount === 0 ||
                isFixing ||
                !hasTasks
              }
            >
              {isFixing ? (
                <>
                  
                  Fixing...
                </>
              ) : (
                <>
                  <Wrench className="h-4 w-4 mr-2" />
                  Fix it (AI Technical Mechanic)
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-sm text-muted-foreground">
              WordPress site
            </label>
            <SelectField placeholder="Select site" value={selectedSite?.id ?? ""} onValueChange={(id) => {
                const site = sites.find((s) => s.id === id) ?? null;
                setSelectedSite(site);
              }} options={sites.map((s) => ({ value: s.id, label: s.name }))} />
          </div>

          <div>
            <label className="text-sm text-muted-foreground">
              Task list (paste or upload CSV/text, one item per line)
            </label>
            <div className="flex gap-2 mt-1">
              <FileInput
                ref={fileInputRef}
                accept=".csv,.txt"
                onChange={handleFileUpload}
                aria-hidden
              />
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-1" />
                Upload
              </Button>
              <Button
                type="button"
                onClick={handleInterpretList}
                disabled={!rawList.trim() || isInterpreting}
              >
                {isInterpreting ? (
                  null
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-1 inline" />
                    Interpret list
                  </>
                )}
              </Button>
            </div>
            <TextareaField
              placeholder="Paste URLs or lines like: https://example.com/page, Fix title and meta"
              value={rawList}
              onChange={(e) => setRawList(e.target.value)}
            />
          </div>

          {hasTasks && (
            <>
              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2">#</th>
                      <th className="text-left p-2">URL</th>
                      <th className="text-left p-2">Action</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t, idx) => (
                      <tr key={`${t.lineIndex}-${t.url}-${idx}`} className="border-b">
                        <td className="p-2">{t.lineIndex}</td>
                        <td className="p-2 max-w-[200px] break-words" title={t.url}>
                          {t.url}
                        </td>
                        <td className="p-2">{t.suggestedAction}</td>
                        <td className="p-2">
                          {t.status === "fixing" && (
                            null
                          )}
                          {t.status !== "fixing" && t.status}
                        </td>
                        <td className="p-2">
                          {t.changeSummary ?? (t.error ? t.error : " - ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={handleExportSheet}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Export sheet
                </Button>
                <Button
                  type="button"
                  onClick={handlePrintSheet}
                >
                  <Printer className="h-4 w-4 mr-1" />
                  Print sheet
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>SEM Task List – Print</DialogTitle>
            <DialogDescription>
              Print or save as PDF from your browser.
            </DialogDescription>
          </DialogHeader>
          <div className="border rounded-md overflow-x-auto print:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">URL</th>
                  <th className="text-left p-2">Action</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Change</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t, idx) => (
                  <tr key={`print-${t.lineIndex}-${t.url}-${idx}`} className="border-b">
                    <td className="p-2">{t.lineIndex}</td>
                    <td className="p-2 max-w-[200px] break-words" title={t.url}>
                      {t.url}
                    </td>
                    <td className="p-2">{t.suggestedAction}</td>
                    <td className="p-2">{t.status}</td>
                    <td className="p-2">
                      {t.changeSummary ?? (t.error ? t.error : " - ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            variant="run"
            type="button"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
};
