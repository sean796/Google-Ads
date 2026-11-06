import React, { useEffect, useState } from "react";

import { takeRandomSample } from "@/lib/wordpress-optimization-package";
import { Button, Field, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/ui";

export interface MultiSiteOptimizationSamplePayload {
  siteName: string;
  urls: string[];
  /** Upper bound for how many URLs the user may run (remaining quota). */
  maxSelectable: number;
  phaseLabel: string;
}

interface MultiSiteOptimizationSampleDialogProps {
  open: boolean;
  payload: MultiSiteOptimizationSamplePayload | null;
  onConfirm: (sampledUrls: string[]) => void;
  onCancel: () => void;
}

export const MultiSiteOptimizationSampleDialog: React.FC<MultiSiteOptimizationSampleDialogProps> = ({
  open,
  payload,
  onConfirm,
  onCancel,
}) => {
  const maxN = payload ? Math.min(payload.maxSelectable, payload.urls.length) : 0;
  const [countStr, setCountStr] = useState("");

  useEffect(() => {
    if (open && payload) {
      const d = Math.min(payload.maxSelectable, payload.urls.length);
      setCountStr(String(Math.max(1, d)));
    }
  }, [open, payload]);

  if (!payload) return null;

  const parsed = parseInt(countStr.trim(), 10);
  const count = Number.isFinite(parsed) ? parsed : NaN;
  const valid = Number.isInteger(count) && count >= 1 && count <= maxN;

  const handleConfirm = () => {
    if (!valid) return;
    onConfirm(takeRandomSample(payload.urls, count));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="bg-card text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Random sample</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-1">
          <p className="text-base text-muted-foreground">
            <span className="font-medium text-foreground">{payload.siteName}</span>
            {payload.phaseLabel ? ` · ${payload.phaseLabel}` : ""}: pick how many URLs to optimize (up to{" "}
            {maxN}).
          </p>
          <div className="grid gap-2">
            <label htmlFor="ms-opt-sample-count" className="text-foreground">
              Count (1–{maxN})
            </label>
            <Field
              placeholder="Sample count"
              id="ms-opt-sample-count"
              type="number"
              min={1}
              max={maxN}
              value={countStr}
              onChange={(e) => setCountStr(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="run" type="button" disabled={!valid} onClick={handleConfirm}>
            Optimize {valid ? count : "…"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
