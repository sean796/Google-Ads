
import { HOST_SURFACE, MY_SITES_FIELD } from "@/components/hosting/my-sites/my-sites-theme";
import { cn } from "@/lib/utils";
import { TextareaField } from "@/ui";

type VideoBrainstormPanelProps = {
  notes: string;
  disabled: boolean;
  onNotesChange: (v: string) => void;
};

/** Brainstorming: natural-language notes for the producer. Images and video are dropped in the left column. */
export function VideoBrainstormPanel({ notes, disabled, onNotesChange }: VideoBrainstormPanelProps) {
  return (
    <div className={cn(HOST_SURFACE, "p-4")}>
      <TextareaField
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        disabled={disabled}
        rows={6}
        aria-label="Brainstorm notes"
        placeholder="Tell the producer what this video is for, who the client is, what to copy from the video and how real it should look"
      />
    </div>
  );
}
