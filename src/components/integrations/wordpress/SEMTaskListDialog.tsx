import React, { useState, useCallback, useRef, useEffect } from "react";
import { ActionButton, Button, CheckField, DialogShell, TextareaField, FileInput } from "@/ui";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_NO_PENDING_TASKS_TO_FIX, NOTIFY_PASTE_OR_UPLOAD_A_TASK_LIST_FIRST, NOTIFY_SHEET_EXPORTED, notifyFixRunCompleteXTaskSProcessed, notifyInterpretedXTaskS } from "@/lib/notify-messages";
import { Wrench, Upload, FileText, Download, Printer, Check, Circle, ChevronDown, ChevronUp } from "lucide-react";
import type { WordPressSite } from "@/components/integrations/types";
import { interpretSemTaskList, type InterpretedSemTask } from "@/lib/sem-task-interpreter";
import { SEM_FOCUS_CATEGORIES, deriveSuggestedFocusFromFileName, deriveFocusFromTask } from "@/lib/sem-categories";
import { useWordPressOptimization } from "@/contexts/wordpress-optimization-context";

export type SemTaskRow = InterpretedSemTask & {
  status: "pending" | "fixing" | "done" | "error";
  changeSummary?: string;
  error?: string;
  /** Per-row checklist completion (one boolean per checklist item) */
  checklistDone: boolean[];
  /** Tech spec prompt sent to AI (for "View prompt" expandable) */
  promptSent?: { system: string; user: string };
};

/** Full-post optimizer (content optimizer flow) with optional SEM task context. SEM fix path returns optimizationChanges. */
type OnOptimizeContent = (
  site: WordPressSite,
  url: string,
  updateMode: "update" | "draft",
  setGscQueriesForSelection: (prev: any) => any,
  setIsKeywordSelectionOpen: (prev: any) => any,
  setGscClusterAnalysis: (prev: any) => any,
  setIsAnalyzingClusters: (prev: any) => any,
  skipOnNoGSC: boolean,
  optimizationOptions?: { optimizeTitle?: boolean; optimizeMeta?: boolean; optimizeExcerpt?: boolean; optimizeContent?: boolean },
  inContentImageRequest?: { imageType: string; userPrompt?: string },
  resolvedPost?: { id: number; subtype: string; link?: string; slug?: string; endpoint?: string },
  testMode?: boolean,
  semTaskContext?: { suggestedAction: string; checklist?: string[]; promptModifier?: string; focusCategories?: string[] }
) => Promise<{ optimizationChanges?: Record<string, unknown> } | void | undefined>;

interface SEMTaskListDialogProps {
  site: WordPressSite;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOptimizeContent: OnOptimizeContent;
  setGscQueriesForSelection: (prev: any) => any;
  setIsKeywordSelectionOpen: (prev: any) => any;
  setGscClusterAnalysis: (prev: any) => any;
  setIsAnalyzingClusters: (prev: any) => any;
}

const STATUS_CLASS: Record<SemTaskRow["status"], string> = {
  pending: "text-muted-foreground",
  fixing: "text-primary",
  done: "text-primary",
  error: "text-ui-danger",
};
const INTERPRET_STATES = ["Interpret list", "Interpreting"] as const;
const FIX_STATES = ["Fix it (AI Technical Mechanic)", "Fixing"] as const;
const CELL = "bg-ui-field p-2 text-left align-top text-base";

function TaskTable({ tasks, expandedPromptKey, onTogglePrompt }: { tasks: SemTaskRow[]; expandedPromptKey?: string | null; onTogglePrompt?: (key: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-px text-base">
        <thead>
          <tr>
            {["#", "URL", "Action", "Checklist", "Status", "Change"].map((h) => (<th key={h} className={`${CELL} font-semibold`}>{h}</th>))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((t, idx) => {
            const key = `${t.lineIndex}-${t.url}`;
            const open = expandedPromptKey === key;
            return (
              <tr key={`${key}-${idx}`}>
                <td className={`${CELL} text-muted-foreground`}>{t.lineIndex}</td>
                <td className={`${CELL} break-all text-muted-foreground`} title={t.url}>{t.url}</td>
                <td className={`${CELL} text-muted-foreground`}>{t.suggestedAction}</td>
                <td className={CELL}>
                  <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                    {(t.checklist ?? []).map((item, i) => (
                      <li key={i} className="flex items-start gap-1">
                        {t.checklistDone?.[i] ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                        <span className={t.checklistDone?.[i] ? "text-muted-foreground line-through" : "text-muted-foreground"}>{item}</span>
                      </li>
                    ))}
                  </ul>
                </td>
                <td className={`${CELL} ${STATUS_CLASS[t.status]}`}>{t.status}</td>
                <td className={`${CELL} text-muted-foreground`}>
                  <div className="flex flex-col gap-1">
                    <span>{t.changeSummary ?? (t.error ? t.error : " - ")}</span>
                    {onTogglePrompt && t.promptSent ? (
                      <Button variant="tool" icon={open ? ChevronUp : ChevronDown} onClick={() => onTogglePrompt(key)}>
                        {open ? "Hide prompt" : "View prompt"}
                      </Button>
                    ) : null}
                    {open && t.promptSent ? (
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap bg-ui-field-hover p-2 font-mono text-base">
                        <span className="text-primary">System:</span>{"\n"}{t.promptSent.system}{"\n\n"}
                        <span className="text-primary">User:</span>{"\n"}{t.promptSent.user}
                      </pre>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const SEMTaskListDialog: React.FC<SEMTaskListDialogProps> = ({
  site,
  open,
  onOpenChange,
  onOptimizeContent,
  setGscQueriesForSelection,
  setIsKeywordSelectionOpen,
  setGscClusterAnalysis,
  setIsAnalyzingClusters,
}) => {
  // Access pendingOptimization reactively from hook
  const { pendingOptimization } = useWordPressOptimization();
  
  // Store changes by URL for tracking (persists after cleanup)
  const [changesByUrl, setChangesByUrl] = useState<Record<string, { titleChanged?: boolean; metaChanged?: boolean; contentChanged?: boolean; title?: string; meta?: string; postUpdated?: boolean; promptSent?: { system: string; user: string } }>>({});
  
  // Watch for changes in pendingOptimization and store them
  useEffect(() => {
    const pending = pendingOptimization[site.id];
    if (pending?.optimizationChanges && pending.url) {
      setChangesByUrl(prev => ({
        ...prev,
        [pending.url]: pending.optimizationChanges
      }));
    }
  }, [pendingOptimization, site.id]);
  const [rawList, setRawList] = useState("");
  const [tasks, setTasks] = useState<SemTaskRow[]>([]);
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [focusCategories, setFocusCategories] = useState<string[]>([]);
  const [suggestedFocusFromFile, setSuggestedFocusFromFile] = useState<string | null>(null);
  const [suggestedFocusFileName, setSuggestedFocusFileName] = useState<string | null>(null);
  const [promptModifier, setPromptModifier] = useState("");
  const [expandedPromptKey, setExpandedPromptKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleFocusCategory = useCallback((category: string) => {
    setFocusCategories((prev) => {
      const has = prev.includes(category);
      if (has) return prev.filter((c) => c !== category);
      return [...prev, category];
    });
  }, []);

  const hasAtLeastOneCategory = focusCategories.length > 0;
  // When no focus selected, we derive focus from each task's suggestedAction/checklist (no double list)

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const suggested = deriveSuggestedFocusFromFileName(file.name);
      setFocusCategories((prev) => {
        const merged = [...new Set([...suggested, ...prev])];
        return merged.length > 0 ? merged : prev;
      });
      setSuggestedFocusFromFile(suggested.length > 0 ? suggested.join(", ") : null);
      setSuggestedFocusFileName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        const text = (reader.result as string) ?? "";
        setRawList(text);
        notify.success(suggested.length > 0 ? `List loaded. Suggested focus: ${suggested.join(", ")} (you can add more)` : "List loaded");
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
    // No longer require focus selection: we derive focus from each task's action/checklist when fixing
    setIsInterpreting(true);
    try {
      const interpreted = await interpretSemTaskList(
        rawList,
        site.siteUrl,
        focusCategories,
        promptModifier.trim() || undefined
      );
      setTasks(
        interpreted.map((t) => ({
          ...t,
          status: "pending" as const,
          changeSummary: undefined,
          error: undefined,
          checklistDone: (t.checklist ?? []).map(() => false),
        }))
      );
      notify.success(notifyInterpretedXTaskS(interpreted.length));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Interpretation failed.";
      notify.error(msg);
    } finally {
      setIsInterpreting(false);
    }
  }, [rawList, site.siteUrl, focusCategories, promptModifier, hasAtLeastOneCategory]);

  const runFixForTask = useCallback(
    async (task: SemTaskRow) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.url === task.url && t.lineIndex === task.lineIndex
            ? { ...t, status: "fixing" as const }
            : t
        )
      );
      try {
        // Use task's checklist as single source of truth: derive focus from task when user hasn't selected focus areas (no double list)
        const effectiveFocus =
          focusCategories.length > 0
            ? focusCategories
            : deriveFocusFromTask(task.suggestedAction ?? "", task.checklist ?? []);

        // Map focus to optimization options
        const shouldOptimizeTitle = effectiveFocus.some(
          (cat) => cat.includes("Title") || cat.includes("meta description")
        );
        const shouldOptimizeMeta = effectiveFocus.some(
          (cat) => cat.includes("Title") || cat.includes("meta description")
        );
        const shouldOptimizeContent = effectiveFocus.some(
          (cat) => cat.includes("Content") || cat.includes("keyword optimization")
        );

        const result = await onOptimizeContent(
          site,
          task.url,
          "update",
          setGscQueriesForSelection,
          setIsKeywordSelectionOpen,
          setGscClusterAnalysis,
          setIsAnalyzingClusters,
          true,
          {
            optimizeTitle: shouldOptimizeTitle,
            optimizeMeta: shouldOptimizeMeta,
            optimizeExcerpt: shouldOptimizeMeta,
            optimizeContent: shouldOptimizeContent,
          },
          undefined,
          undefined,
          false,
          {
            suggestedAction: task.suggestedAction ?? "",
            checklist: task.checklist ?? [],
            promptModifier: promptModifier.trim() || undefined,
            focusCategories: effectiveFocus, // Pass derived or selected focus so backend respects it
          }
        );

        // Use returned optimizationChanges from SEM fix path (avoids stale state in poll)
        let changes: any = null;
        if (result != null && typeof result === "object" && "optimizationChanges" in result) {
          changes = (result as { optimizationChanges: Record<string, unknown> }).optimizationChanges;
        }
        if (changes) {
          setChangesByUrl(prev => ({ ...prev, [task.url]: changes }));
        }
        // Fallback: poll for changes (e.g. full optimization path)
        if (!changes) {
          for (let i = 0; i < 50; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const pending = pendingOptimization[site.id];
            if (pending?.optimizationChanges) {
              changes = pending.optimizationChanges;
              setChangesByUrl(prev => ({ ...prev, [task.url]: pending.optimizationChanges }));
              break;
            }
            if (changesByUrl[task.url]) {
              changes = changesByUrl[task.url];
              break;
            }
          }
        }
        
        // Change summary: show what we changed (cached original vs final); postUpdated => "Post has been updated" + details
        const changeParts: string[] = [];
        if (changes?.titleChanged && changes.title) {
          changeParts.push(`Title: "${changes.title.substring(0, 40)}${changes.title.length > 40 ? '...' : ''}"`);
        }
        if (changes?.metaChanged && changes.meta) {
          changeParts.push(`Meta: "${changes.meta.substring(0, 40)}${changes.meta.length > 40 ? '...' : ''}"`);
        }
        if (changes?.contentChanged) {
          changeParts.push("Content updated");
        }
        let changeSummary: string;
        if (changes?.postUpdated === true) {
          changeSummary = changeParts.length > 0 ? `Post updated - ${changeParts.join("; ")}` : "Post has been updated";
        } else {
          changeSummary = changeParts.length > 0 ? changeParts.join("; ") : "No changes detected";
        }
        
        // Map checklist items to actual changes
        const checklistDone = (task.checklist ?? []).map((item, idx) => {
          const itemLower = item.toLowerCase();
          if (itemLower.includes('title')) {
            return changes?.titleChanged === true;
          }
          if (itemLower.includes('meta') || itemLower.includes('description')) {
            return changes?.metaChanged === true;
          }
          if (itemLower.includes('content') || itemLower.includes('keyword')) {
            return changes?.contentChanged === true;
          }
          // If we don't know, assume it was done if any change occurred
          return changes?.titleChanged || changes?.metaChanged || changes?.contentChanged || false;
        });
        
        setTasks((prev) =>
          prev.map((t) =>
            t.url === task.url && t.lineIndex === task.lineIndex
              ? {
                  ...t,
                  status: "done" as const,
                  changeSummary,
                  checklistDone,
                  promptSent: changes?.promptSent,
                }
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
    [site, promptModifier, onOptimizeContent, setGscQueriesForSelection, setIsKeywordSelectionOpen, setGscClusterAnalysis, setIsAnalyzingClusters]
  );

  const handleFixIt = useCallback(async () => {
    const pending = tasks.filter((t) => t.status === "pending");
    if (pending.length === 0) {
      notify.info(NOTIFY_NO_PENDING_TASKS_TO_FIX);
      return;
    }
    setIsFixing(true);
    for (const task of pending) {
      await runFixForTask(task);
    }
    setIsFixing(false);
    notify.success(notifyFixRunCompleteXTaskSProcessed(pending.length));
  }, [tasks, runFixForTask]);

  const handleExportSheet = useCallback(() => {
    const header = "lineIndex,url,suggestedAction,checklist,checklistDone,status,changeSummary,error\n";
    const rows = tasks.map(
      (t) =>
        `${t.lineIndex},"${(t.url || "").replace(/"/g, '""')}","${(t.suggestedAction || "").replace(/"/g, '""')}","${(t.checklist ?? []).join("; ").replace(/"/g, '""')}","${(t.checklistDone ?? []).map((d) => (d ? "1" : "0")).join("")}",${t.status},"${(t.changeSummary ?? "").replace(/"/g, '""')}","${(t.error ?? "").replace(/"/g, '""')}"`
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
      <DialogShell
        open={open}
        onOpenChange={onOpenChange}
        size="xl"
        title={`SEM Task List - ${site.name}`}
        description="Upload a list of URLs or issues; AI interprets and fixes content on this WordPress site."
      >
        {!hasTasks ? (
          <>
            <p className="text-base font-semibold">Focus areas (optional, leave unchecked to use each task&apos;s action)</p>
            {suggestedFocusFromFile ? (
              <p className="text-base text-muted-foreground">
                From file &quot;{suggestedFocusFileName}&quot;: <span className="text-primary">{suggestedFocusFromFile}</span>. Add or change focus below.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {SEM_FOCUS_CATEGORIES.map((cat) => (
                <CheckField
                  key={cat}
                  label={cat}
                  checked={focusCategories.includes(cat)}
                  onCheckedChange={() => toggleFocusCategory(cat)}
                />
              ))}
            </div>
          </>
        ) : (
          <p className="text-base text-muted-foreground">
            Using each task&apos;s action and checklist. Fix runs only what the checklist says. Change column shows exactly what was updated.
          </p>
        )}

        <TextareaField
          rows={2}
          placeholder="Optional prompt modifier, e.g. Set title to 'agentic agent'; prefer canonical URLs"
          value={promptModifier}
          onChange={(e) => setPromptModifier(e.target.value)}
        />

        <div className="flex items-center gap-1.5">
          <FileInput ref={fileInputRef} accept=".csv,.txt" onChange={handleFileUpload} aria-hidden />
          <Button variant="tool" icon={Upload} onClick={() => fileInputRef.current?.click()}>
            Upload
          </Button>
          <ActionButton
            variant="tool"
            states={INTERPRET_STATES}
            state={isInterpreting ? "Interpreting" : "Interpret list"}
            icon={FileText}
            disabled={!rawList.trim() || isInterpreting}
            onClick={handleInterpretList}
          />
          <ActionButton
            states={FIX_STATES}
            state={isFixing ? "Fixing" : "Fix it (AI Technical Mechanic)"}
            icon={Wrench}
            disabled={pendingCount === 0 || isFixing || !hasTasks}
            onClick={handleFixIt}
          />
        </div>
        <TextareaField
          rows={5}
          placeholder="Task list (paste or upload CSV/text, one item per line), e.g. https://example.com/page, Fix title and meta"
          aria-label="Task list"
          value={rawList}
          onChange={(e) => setRawList(e.target.value)}
        />

        {hasTasks ? (
          <>
            <TaskTable
              tasks={tasks}
              expandedPromptKey={expandedPromptKey}
              onTogglePrompt={(key) => setExpandedPromptKey((k) => (k === key ? null : key))}
            />
            <div className="flex items-center gap-1.5">
              <Button variant="tool" icon={Download} onClick={handleExportSheet}>
                Export sheet
              </Button>
              <Button variant="tool" icon={Printer} onClick={handlePrintSheet}>
                Print sheet
              </Button>
            </div>
          </>
        ) : null}
      </DialogShell>

      <DialogShell
        open={printDialogOpen}
        onOpenChange={setPrintDialogOpen}
        size="xl"
        title="SEM Task List - Print"
        description="Print or save as PDF from your browser."
        actions={
          <Button variant="run" icon={Printer} onClick={() => window.print()}>
            Print
          </Button>
        }
      >
        <TaskTable tasks={tasks} />
      </DialogShell>
    </>
  );
};