/**
 * Bulk Import Clients Dialog
 * Upload CSV, preview as compact bulk rows, approve all, add all
 */

import React, { useState, useRef } from "react";
import { ActionButton, Button, CheckField, DialogShell, FileInput } from "@/ui";
import { Upload, Download } from "lucide-react";
import { notify, notifyHeaderError } from "@/lib/app-notifications";
import { NOTIFY_PLEASE_SELECT_A_CSV_FILE, NOTIFY_SELECT_AT_LEAST_ONE_CLIENT_TO_ADD, notifyAddedXClientS, notifyLoadedXClients, notifyLoadedXClientsXRowSSkipped } from "@/lib/notify-messages";
import Papa from "papaparse";
import { BulkImportClientRow, type BulkImportClient } from "./BulkImportClientRow";

const TEMPLATE_CSV = `name,siteUrl,username,appPassword,googleAdsCustomerId,primaryLocalKeyword
"My Client","https://example.com","admin","xxxx xxxx xxxx xxxx","1234567890","blinds near me"`;

function normalizeHeader(h: string): string {
  const s = (h || "").trim().toLowerCase().replace(/\s+/g, "");
  if (s === "name" || s === "sitename" || s === "client") return "name";
  if (s === "siteurl" || s === "url") return "siteUrl";
  if (s === "username" || s === "user") return "username";
  if (s === "apppassword" || s === "applicationpassword" || s === "apppass") return "appPassword";
  if (s === "googleadscustomerid" || s === "adscustomerid" || s === "googleadsid") return "googleAdsCustomerId";
  if (
    s === "primarylocalkeyword" ||
    s === "primarykeyword" ||
    s === "localgridkeyword" ||
    s === "localkeyword"
  ) {
    return "primaryLocalKeyword";
  }
  return s;
}

function ensureHttps(url: string): string {
  const u = url.trim();
  if (!u) return u;
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u}`;
}

function parseClientCSV(file: File): Promise<{ clients: BulkImportClient[]; skipped: number; errors: string[] }> {
  return new Promise((resolve, reject) => {
    const processRows = (
      rows: unknown[],
      headerMap: Record<string, string> | null
    ): { clients: BulkImportClient[]; skipped: number; errors: string[] } => {
      const clients: BulkImportClient[] = [];
      const errors: string[] = [];
      let skipped = 0;
      const hasHeaders = headerMap && ["name", "siteUrl", "username", "appPassword"].every((k) => headerMap[k]);

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        let name: string;
        let siteUrl: string;
        let username: string;
        let appPassword: string;
        let googleAdsCustomerId: string;
        let primaryLocalKeyword: string;

        if (hasHeaders && row && typeof row === "object" && !Array.isArray(row)) {
          const r = row as Record<string, string>;
          const get = (k: string) => (headerMap![k] ? (r[headerMap![k]] ?? "").trim() : "");
          name = get("name");
          siteUrl = get("siteUrl");
          username = get("username");
          appPassword = get("appPassword");
          googleAdsCustomerId = get("googleAdsCustomerId").replace(/\D/g, "");
          primaryLocalKeyword = get("primaryLocalKeyword");
        } else {
          const arr = Array.isArray(row) ? row : Object.values(row as Record<string, unknown>);
          name = String(arr[0] ?? "").trim();
          siteUrl = String(arr[1] ?? "").trim();
          username = String(arr[2] ?? "").trim();
          appPassword = String(arr[3] ?? "").trim();
          googleAdsCustomerId = "";
          primaryLocalKeyword = "";
        }

        siteUrl = ensureHttps(siteUrl);

        if (!name || !siteUrl || !username || !appPassword) {
          skipped++;
          errors.push(`Row ${i + 2}: Missing required field (name, siteUrl, username, appPassword)`);
          continue;
        }
        clients.push({
          name,
          siteUrl,
          username,
          appPassword,
          googleAdsCustomerId: googleAdsCustomerId || undefined,
          primaryLocalKeyword: primaryLocalKeyword || undefined,
        });
      }
      return { clients, skipped, errors };
    };

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const origHeaders = (results.meta?.fields as string[]) || [];
        const headerMap: Record<string, string> = {};
        origHeaders.forEach((orig) => {
          const norm = normalizeHeader(orig);
          if (norm && !headerMap[norm]) headerMap[norm] = orig;
        });

        const hasHeaders = ["name", "siteUrl", "username", "appPassword"].every((k) => headerMap[k]);
        const out = processRows(results.data as unknown[], hasHeaders ? headerMap : null);

        if (out.clients.length === 0 && results.data.length > 0 && !hasHeaders) {
          Papa.parse(file, {
            header: false,
            skipEmptyLines: true,
            complete: (r2) => {
              const rows = (r2.data as unknown[][]) || [];
              resolve(processRows(rows, null));
            },
            error: (err) => reject(new Error(`Failed to parse CSV: ${err.message}`)),
          });
        } else {
          resolve(out);
        }
      },
      error: (err) => reject(new Error(`Failed to parse CSV: ${err.message}`)),
    });
  });
}

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "clients-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

interface BulkImportClientsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddBulk: (clients: BulkImportClient[]) => Promise<void>;
}

export const BulkImportClientsDialog: React.FC<BulkImportClientsDialogProps> = ({
  open,
  onOpenChange,
  onAddBulk,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [clients, setClients] = useState<BulkImportClient[]>([]);
  const [approved, setApproved] = useState<Set<number>>(new Set());
  const [isAdding, setIsAdding] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      notify.error(NOTIFY_PLEASE_SELECT_A_CSV_FILE);
      return;
    }

    try {
      const { clients: parsed, skipped, errors } = await parseClientCSV(file);
      if (parsed.length === 0) {
        notify.error(
          errors.length > 0
            ? `No valid rows. ${skipped} skipped. First error: ${errors[0]}`
            : "No valid rows found in CSV"
        );
        return;
      }
      setClients(parsed);
      setApproved(new Set(parsed.map((_, i) => i)));
      if (skipped > 0) {
        notify.warning(notifyLoadedXClientsXRowSSkipped(parsed.length, skipped));
      } else {
        notify.success(notifyLoadedXClients(parsed.length));
      }
    } catch (err) {
      notifyHeaderError("CSV parse failed", err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleApproved = (index: number, checked: boolean) => {
    setApproved((prev) => {
      const next = new Set(prev);
      if (checked) next.add(index);
      else next.delete(index);
      return next;
    });
  };

  const toggleApprovedAll = (checked: boolean) => {
    if (checked) setApproved(new Set(clients.map((_, i) => i)));
    else setApproved(new Set());
  };

  const approvedList = clients.filter((_, i) => approved.has(i));

  const handleAddAll = async () => {
    if (approvedList.length === 0) {
      notify.error(NOTIFY_SELECT_AT_LEAST_ONE_CLIENT_TO_ADD);
      return;
    }
    setIsAdding(true);
    try {
      await onAddBulk(approvedList);
      notify.success(notifyAddedXClientS(approvedList.length));
      onOpenChange(false);
      setClients([]);
      setApproved(new Set());
    } catch (err) {
      notifyHeaderError("Add clients failed", err);
    } finally {
      setIsAdding(false);
    }
  };

  const allApproved = clients.length > 0 && approved.size === clients.length;
  const someApproved = approved.size > 0;

  const addStates = [`Add All (${approvedList.length})`, "Adding"] as const;

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Bulk Import Clients"
      description="Upload a CSV with columns: name, siteUrl, username, appPassword. Optional: googleAdsCustomerId, primaryLocalKeyword. Review and approve, then add all."
      actions={
        <>
          <Button variant="tool" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <ActionButton
            states={addStates}
            state={isAdding ? "Adding" : addStates[0]}
            disabled={!someApproved || isAdding}
            onClick={handleAddAll}
          />
        </>
      }
    >
      <FileInput ref={fileInputRef} accept=".csv" onChange={handleFileSelect} />
      <div className="flex items-center gap-1.5">
        <Button variant="run" icon={Upload} onClick={() => fileInputRef.current?.click()}>
          Choose CSV File
        </Button>
        <Button variant="tool" icon={Download} onClick={downloadTemplate}>
          Download Template
        </Button>
      </div>
      {clients.length > 0 ? (
        <>
          <div className="flex items-center justify-between pt-1.5">
            <span className="text-base font-semibold">Preview ({clients.length} clients)</span>
            <CheckField label="Approve all" checked={allApproved} onCheckedChange={toggleApprovedAll} />
          </div>
          <div className="flex max-h-[14rem] flex-col gap-1.5 overflow-y-auto">
            {clients.map((client, i) => (
              <BulkImportClientRow
                key={i}
                client={client}
                approved={approved.has(i)}
                onToggleApproved={(c) => toggleApproved(i, c)}
              />
            ))}
          </div>
        </>
      ) : null}
    </DialogShell>
  );
};