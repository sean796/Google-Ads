
import { CONTENT_OPTIMIZER_ROW_SHELL_CLASS } from "@/components/overview/overview-tab/overview-tab-content-constants";
import { cn } from "@/lib/utils";
import { TextareaField } from "@/ui";

export type KnowledgeBaseTextPanelProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function KnowledgeBaseTextPanel({
  value,
  onChange,
  disabled = false,
}: KnowledgeBaseTextPanelProps) {
  return (
    <div className={cn(CONTENT_OPTIMIZER_ROW_SHELL_CLASS, "min-h-[min(60vh,32rem)]")}>
      <TextareaField
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter your knowledge base content here..."
        disabled={disabled}
      />
    </div>
  );
}
