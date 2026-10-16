import { Textarea } from "@/components/ui/textarea";
import { HOST_SURFACE, MY_SITES_FIELD } from "@/components/hosting/my-sites/my-sites-theme";
import type { VideoBrief } from "@/lib/video-generator/video-generator-types";
import type {
  VideoAspect,
  VideoLengthSeconds,
  VideoResolution,
} from "@/lib/video-generator/video-model-defaults";
import { cn } from "@/lib/utils";

type VideoBriefPanelProps = {
  brief: VideoBrief;
  videoModel: string;
  disabled: boolean;
  onPromptChange: (v: string) => void;
  onLengthChange: (v: VideoLengthSeconds) => void;
  onAspectChange: (v: VideoAspect) => void;
  onResolutionChange: (v: VideoResolution) => void;
};

export function VideoBriefPanel({
  brief,
  disabled,
  onPromptChange,
}: VideoBriefPanelProps) {
  return (
    <div className={cn(HOST_SURFACE, "flex flex-col gap-3 p-4")}>
      <Textarea
        value={brief.prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        disabled={disabled}
        rows={6}
        aria-label="Video brief"
        placeholder="Describe the video you want: subject, story, mood, audience, where it will run"
        className={cn(MY_SITES_FIELD, "h-auto min-h-[9rem] resize-y py-2")}
      />
    </div>
  );
}
