import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { knowledgeBaseDetailsCanOpen } from "@/components/knowledge-base/knowledge-base-details-can-open";
import { notify } from "@/lib/app-notifications";
import {
  NOTIFY_A_SCRAPE_IS_ALREADY_RUNNING,
  NOTIFY_CONTENT_CLEARED,
  NOTIFY_FAILED_TO_START_SITE_SCRAPER,
  NOTIFY_FILE_DELETED,
  NOTIFY_PLEASE_ENTER_A_PROFILE_NAME,
  NOTIFY_PLEASE_ENTER_A_URL_TO_SCRAPE,
  NOTIFY_PLEASE_SELECT_A_PROFILE_TO_UPDATE,
  NOTIFY_PROFILE_SAVED,
  NOTIFY_PROFILE_UPDATED,
  NOTIFY_SCRAPER_FINISHED_BUT_NO_PAGES_WERE_STORE,
  NOTIFY_SITE_SCRAPER_FAILED_SEE_CONSOLE_FOR_DETA,
  NOTIFY_SITE_SCRAPE_CANCELLED,
  NOTIFY_STREAMING_NOT_SUPPORTED_IN_THIS_BROWSER,
  notifyScrapedXPageSIntoKnowledgeBase,
  notifyXFileSUploadedPotentiallyMultipleC,
  notifyXKnowledgeBaseFilesBrutallyWipedFr,
  notifyXUnstarredFileSCleared,
} from "@/lib/notify-messages";
import { processCSVToChunks, processSingleFile } from "@/lib/file-processing";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import type {
  KnowledgeBaseSectionId,
  KnowledgeProfile,
  ScraperLogEntry,
  StoredFile,
} from "@/lib/knowledge-base/types";
import {
  CSV_CHUNK_THRESHOLD,
  KB_FILES_STORAGE_KEY,
  KB_PROFILES_STORAGE_KEY,
  formatKbFileSize,
  saveFilesToLocalStorage,
} from "@/lib/knowledge-base/storage";
import type { ScraperStepKey } from "@/lib/knowledge-base/scraper-constants";
import { buildKnowledgeBaseMicroSnapshot } from "@/lib/knowledge-base/knowledge-base-header-progress";

export type UseKnowledgeBaseArgs = {
  currentFiles: StoredFile[];
  onFilesUpdate: (files: StoredFile[]) => void;
  onManualContentUpdate: (content: string) => void;
};

export function useKnowledgeBase({
  currentFiles,
  onFilesUpdate,
  onManualContentUpdate,
}: UseKnowledgeBaseArgs) {
  const [activeSection, setActiveSection] = useState<KnowledgeBaseSectionId>("text");
  const [profiles, setProfiles] = useState<KnowledgeProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState("");
  const [newProfileName, setNewProfileName] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [files, setFiles] = useState<StoredFile[]>(currentFiles);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [scraperUrl, setScraperUrl] = useState("");
  const [scraperMaxPages, setScraperMaxPages] = useState(1);
  const [scraperRunning, setScraperRunning] = useState(false);
  const [scraperProgress, setScraperProgress] = useState(0);
  const [scraperStep, setScraperStep] = useState<ScraperStepKey | null>(null);
  const [scraperLog, setScraperLog] = useState<ScraperLogEntry[]>([]);
  const scraperAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const storedProfiles = localStorage.getItem(KB_PROFILES_STORAGE_KEY);
    if (storedProfiles) {
      try {
        setProfiles(JSON.parse(storedProfiles) as KnowledgeProfile[]);
      } catch (e) {
        console.error("Error loading profiles:", e);
      }
    }
    setFiles(currentFiles);
  }, [currentFiles]);

  useEffect(() => {
    const loadFilesFromStorage = () => {
      try {
        const storedFilesString = localStorage.getItem(KB_FILES_STORAGE_KEY) || "[]";
        const storedFiles = JSON.parse(storedFilesString) as StoredFile[];
        setFiles(storedFiles);
        onFilesUpdate(storedFiles);
      } catch (error) {
        console.error("Error loading files from localStorage:", error);
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === KB_FILES_STORAGE_KEY && e.newValue) {
        try {
          const newFiles = JSON.parse(e.newValue) as StoredFile[];
          setFiles(newFiles);
          onFilesUpdate(newFiles);
        } catch (error) {
          console.error("Error parsing files from storage event:", error);
        }
      }
    };

    const handleKBFilesUpdate = () => {
      loadFilesFromStorage();
    };

    loadFilesFromStorage();
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("kb-files-updated", handleKBFilesUpdate as EventListener);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("kb-files-updated", handleKBFilesUpdate as EventListener);
    };
  }, [onFilesUpdate]);

  useEffect(() => {
    if (selectedProfile) {
      const profile = profiles.find((p) => p.id === selectedProfile);
      if (profile) {
        setManualContent(profile.content);
      }
    }
  }, [selectedProfile, profiles]);

  useEffect(() => {
    onManualContentUpdate(manualContent);
  }, [manualContent, onManualContentUpdate]);

  useEffect(() => {
    onFilesUpdate(files);
  }, [files, onFilesUpdate]);

  const saveProfile = useCallback(
    (isNew: boolean) => {
      if (isNew && !newProfileName.trim()) {
        notify.error(NOTIFY_PLEASE_ENTER_A_PROFILE_NAME);
        return;
      }

      if (isNew) {
        const newProfile: KnowledgeProfile = {
          id: `profile-${Date.now()}`,
          name: newProfileName.trim(),
          content: manualContent,
        };
        const updated = [...profiles, newProfile];
        setProfiles(updated);
        localStorage.setItem(KB_PROFILES_STORAGE_KEY, JSON.stringify(updated));
        setSelectedProfile(newProfile.id);
        setNewProfileName("");
        notify.success(NOTIFY_PROFILE_SAVED);
      } else {
        if (!selectedProfile) {
          notify.error(NOTIFY_PLEASE_SELECT_A_PROFILE_TO_UPDATE);
          return;
        }
        const updated = profiles.map((p) =>
          p.id === selectedProfile ? { ...p, content: manualContent } : p,
        );
        setProfiles(updated);
        localStorage.setItem(KB_PROFILES_STORAGE_KEY, JSON.stringify(updated));
        notify.success(NOTIFY_PROFILE_UPDATED);
      }
    },
    [newProfileName, manualContent, profiles, selectedProfile],
  );

  const clearContent = useCallback(() => {
    setManualContent("");
    notify.success(NOTIFY_CONTENT_CLEARED);
  }, []);

  const handleUpload = useCallback(
    async (fileList: FileList | null) => {
      const uploadedFiles = Array.from(fileList || []);
      if (uploadedFiles.length === 0) return;

      setIsProcessing(true);
      setProgress(0);

      const allNewFiles: StoredFile[] = [];
      const totalFiles = uploadedFiles.length;

      for (let i = 0; i < totalFiles; i++) {
        const file = uploadedFiles[i];
        if (file.name.toLowerCase().endsWith(".csv") && file.size > CSV_CHUNK_THRESHOLD) {
          const chunks = await processCSVToChunks(file);
          allNewFiles.push(...chunks);
        } else {
          const singleFile = await processSingleFile(file);
          allNewFiles.push(...singleFile);
        }
        setProgress(Math.round(((i + 1) / totalFiles) * 100));
      }

      const updatedFiles = [...files, ...allNewFiles];
      setFiles(updatedFiles);
      saveFilesToLocalStorage(updatedFiles);
      notify.success(notifyXFileSUploadedPotentiallyMultipleC(allNewFiles.length));
      setIsProcessing(false);
      setProgress(0);
    },
    [files],
  );

  const handleFileSelectorChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      await handleUpload(e.target.files);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [handleUpload],
  );

  const handleDropZoneClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files) {
        await handleUpload(e.dataTransfer.files);
      }
    },
    [handleUpload],
  );

  const toggleStar = useCallback(
    (fileName: string) => {
      const updatedFiles = files.map((f) =>
        f.name === fileName ? { ...f, starred: !f.starred } : f,
      );
      setFiles(updatedFiles);
      saveFilesToLocalStorage(updatedFiles);
    },
    [files],
  );

  const downloadFile = useCallback((file: StoredFile) => {
    const blob = new Blob([file.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const deleteFile = useCallback(
    (fileName: string) => {
      const updatedFiles = files.filter((f) => f.name !== fileName);
      setFiles(updatedFiles);
      saveFilesToLocalStorage(updatedFiles);
      notify.success(NOTIFY_FILE_DELETED);
    },
    [files],
  );

  const nukeKnowledgeBaseCache = useCallback(() => {
    const fileCount = files.length;
    setFiles([]);
    saveFilesToLocalStorage([]);
    notify.success(
      notifyXKnowledgeBaseFilesBrutallyWipedFr(fileCount > 0 ? fileCount : "0"),
    );
  }, [files]);

  const clearUnstarredFiles = useCallback(() => {
    const unstarredFiles = files.filter((f) => !f.starred);
    const filesToKeep = files.filter((f) => f.starred);
    const fileCount = unstarredFiles.length;
    if (fileCount === 0) return;
    setFiles(filesToKeep);
    saveFilesToLocalStorage(filesToKeep);
    notify.success(notifyXUnstarredFileSCleared(fileCount));
  }, [files]);

  const unstarredCount = files.filter((f) => !f.starred).length;
  const totalSize = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);

  const handleStartScrape = useCallback(async () => {
    const trimmed = scraperUrl.trim();
    if (!trimmed) {
      notify.error(NOTIFY_PLEASE_ENTER_A_URL_TO_SCRAPE);
      return;
    }
    if (scraperRunning) {
      notify.error(NOTIFY_A_SCRAPE_IS_ALREADY_RUNNING);
      return;
    }

    try {
      setScraperRunning(true);
      setScraperProgress(0);
      setScraperStep("init");
      setScraperLog([]);

      const controller = new AbortController();
      scraperAbortRef.current = controller;

      const apiBase = BACKEND_API_BASE || "";
      const response = await fetch(`${apiBase}/api/site-scraper/scrape`, {
        method: "POST",
        headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ url: trimmed, maxPages: scraperMaxPages }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        try {
          const json = JSON.parse(errorText);
          notify.error(json.error || "Failed to start site scraper");
        } catch {
          notify.error(NOTIFY_FAILED_TO_START_SITE_SCRAPER);
        }
        setScraperRunning(false);
        setScraperProgress(0);
        setScraperStep(null);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        notify.error(NOTIFY_STREAMING_NOT_SUPPORTED_IN_THIS_BROWSER);
        setScraperRunning(false);
        setScraperProgress(0);
        setScraperStep(null);
        return;
      }

      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      const newFiles: StoredFile[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) continue;

          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(line) as Record<string, unknown>;
          } catch {
            continue;
          }

          if (payload.type === "step") {
            setScraperStep((payload.step as ScraperStepKey) || "init");
            if (typeof payload.progress === "number") {
              setScraperProgress(Math.max(0, Math.min(100, payload.progress)));
            }
          } else if (payload.type === "page") {
            const index =
              typeof payload.index === "number" ? payload.index : newFiles.length + 1;
            const total =
              typeof payload.total === "number" ? payload.total : scraperMaxPages;
            const title = (payload.title as string) || (payload.url as string) || `Page ${index}`;
            const markdown = (payload.markdown as string) || "";
            const pageUrl = (payload.url as string) || "";

            let domain = "";
            let urlPath = "";
            try {
              const parsed = new URL(pageUrl);
              domain = parsed.hostname.replace(/^www\./, "");
              urlPath = parsed.pathname.replace(/^\/|\/$/g, "");
            } catch {
              domain = "";
              urlPath = "";
            }

            const safeDomain = domain.replace(/[^a-z0-9\-_.]+/gi, "-").replace(/-+/g, "-");
            const safePath = urlPath
              ? urlPath
                  .replace(/[^a-z0-9\-_/]+/gi, "-")
                  .replace(/\//g, "_")
                  .replace(/-+/g, "-")
                  .replace(/^-|-$/g, "")
              : "index";
            const fileNameBase = safeDomain
              ? `${safeDomain}__${safePath}`
              : safePath || `scraped-page-${index}`;

            const file: StoredFile = {
              name: `scraped_${fileNameBase}.md`,
              size: markdown.length,
              content: markdown,
              starred: false,
              timestamp: Date.now() + index,
              sourceUrl: pageUrl,
              sourceDomain: domain,
            };
            newFiles.push(file);
            setScraperLog((prev) => [
              ...prev,
              { url: pageUrl, title, index, total },
            ]);
            if (typeof payload.progress === "number") {
              setScraperProgress(Math.max(0, Math.min(100, payload.progress)));
            }
          } else if (payload.type === "done") {
            setScraperStep("complete");
            setScraperProgress(100);
          } else if (payload.type === "error") {
            notify.error((payload.message as string) || "Site scraper error");
          }
        }
      }

      if (newFiles.length > 0) {
        const updatedFiles = [...files, ...newFiles];
        setFiles(updatedFiles);
        saveFilesToLocalStorage(updatedFiles);
        notify.success(notifyScrapedXPageSIntoKnowledgeBase(newFiles.length));
      } else {
        notify.message(NOTIFY_SCRAPER_FINISHED_BUT_NO_PAGES_WERE_STORE);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        notify.message(NOTIFY_SITE_SCRAPE_CANCELLED);
      } else {
        console.error("Site scraper error:", err);
        notify.error(NOTIFY_SITE_SCRAPER_FAILED_SEE_CONSOLE_FOR_DETA);
      }
    } finally {
      setScraperRunning(false);
      scraperAbortRef.current = null;
    }
  }, [scraperUrl, scraperMaxPages, scraperRunning, files]);

  const handleCancelScrape = useCallback(async () => {
    if (!scraperRunning) return;
    try {
      scraperAbortRef.current?.abort();
      const apiBase = BACKEND_API_BASE || "";
      fetch(`${apiBase}/api/site-scraper/cancel`, {
        method: "POST",
        headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      }).catch(() => {});
    } finally {
      setScraperRunning(false);
      setScraperProgress(0);
      setScraperStep(null);
    }
  }, [scraperRunning]);

  const workspaceBusy = isProcessing || scraperRunning;

  const progressSnapshot = useMemo(
    () =>
      buildKnowledgeBaseMicroSnapshot({
        isUploading: isProcessing,
        uploadProgress: progress,
        isScraping: scraperRunning,
        scraperProgress,
        scraperStep,
      }),
    [isProcessing, progress, scraperRunning, scraperProgress, scraperStep],
  );

  const canOpenDetails = knowledgeBaseDetailsCanOpen(
    Boolean(selectedProfile),
    isProcessing,
    scraperRunning,
    scraperLog.length > 0,
  );

  return {
    activeSection,
    setActiveSection,
    profiles,
    selectedProfile,
    setSelectedProfile,
    newProfileName,
    setNewProfileName,
    manualContent,
    setManualContent,
    files,
    isDragging,
    isProcessing,
    progress,
    fileInputRef,
    scraperUrl,
    setScraperUrl,
    scraperMaxPages,
    setScraperMaxPages,
    scraperRunning,
    scraperProgress,
    scraperStep,
    scraperLog,
    saveProfile,
    clearContent,
    handleFileSelectorChange,
    handleDropZoneClick,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    toggleStar,
    downloadFile,
    deleteFile,
    nukeKnowledgeBaseCache,
    clearUnstarredFiles,
    unstarredCount,
    totalSize,
    formatSize: formatKbFileSize,
    handleStartScrape,
    handleCancelScrape,
    workspaceBusy,
    progressSnapshot,
    canOpenDetails,
  };
}

export type KnowledgeBaseController = ReturnType<typeof useKnowledgeBase>;
