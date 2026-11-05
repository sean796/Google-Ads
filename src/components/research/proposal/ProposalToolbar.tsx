import { type ChangeEvent, type ReactNode, type RefObject } from "react";
import { Copy, Download, Package, Sparkles, Upload } from "lucide-react";
import { Button, FileInput } from "@/ui";
import { GeneratorToolbarFrame } from "@/components/blog-generator/GeneratorToolbarFrame";

export type ProposalToolbarProps = {
  busy: boolean;
  phase: "idle" | "semrush" | "report";
  gridCsvBusy: boolean;
  hasSemrushRows: boolean;
  proposalPackageDisabled: boolean;
  hasCombinedMd: boolean;
  gridCsvFileRef: RefObject<HTMLInputElement | null>;
  onGridCsvFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onDownloadGridCsv: () => void;
  onAnalyze: () => void;
  onGenerateProposal: () => void;
  onCopyProposal: () => void;
  onDownloadProposalPackage: () => void;
  /** Research mode switch (Proposal / Citation / Backlinking), first in the row. */
  modeMenu?: ReactNode;
};

export function ProposalToolbar({
  busy,
  gridCsvBusy,
  hasSemrushRows,
  proposalPackageDisabled,
  hasCombinedMd,
  gridCsvFileRef,
  onGridCsvFileChange,
  onDownloadGridCsv,
  onAnalyze,
  onGenerateProposal,
  onCopyProposal,
  onDownloadProposalPackage,
  modeMenu,
}: ProposalToolbarProps) {
  return (
    <GeneratorToolbarFrame
      primary={
        <>
          {modeMenu}
          <FileInput
            ref={gridCsvFileRef}
            accept=".csv,text/csv"
            onChange={onGridCsvFileChange}
          />
          <Button
            variant="tool"
            icon={Upload}
            disabled={busy || gridCsvBusy}
            aria-label="Upload grid CSV"
            title="Upload grid CSV"
            onClick={() => gridCsvFileRef.current?.click()}
          >
            Grid
          </Button>
          <Button variant="tool" disabled={busy} title="Analyze with Semrush" onClick={onAnalyze}>
            Analyze
          </Button>
        </>
      }
      actions={
        <>
          <Button
            variant="tool"
            size="icon"
            icon={Download}
            disabled={busy || !hasSemrushRows}
            aria-label="Download grid CSV"
            title="Download grid CSV"
            onClick={onDownloadGridCsv}
          />
          <Button
            variant="tool"
            size="icon"
            icon={Copy}
            disabled={proposalPackageDisabled || !hasCombinedMd}
            aria-label="Copy proposal"
            title="Copy proposal"
            onClick={onCopyProposal}
          />
          <Button
            variant="tool"
            size="icon"
            icon={Package}
            disabled={proposalPackageDisabled}
            aria-label="Download proposal package"
            title="Download proposal package"
            onClick={onDownloadProposalPackage}
          />
          <Button
            variant="run"
            icon={Sparkles}
            disabled={busy}
            aria-label="Generate proposal"
            title="Includes DataForSEO speed + FAQ audit on up to 10 GSC top pages when connected"
            onClick={onGenerateProposal}
          >
            Proposal
          </Button>
        </>
      }
    />
  );
}
