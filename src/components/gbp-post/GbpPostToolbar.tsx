import { Shuffle } from "lucide-react";
import { Button, CheckField, Field } from "@/ui";
import {
  GBP_ROSTER_LIST_INSET_CLASS,
  GBP_ROSTER_TOOLBAR_BLEED_CLASS,
  GBP_ROSTER_TOOLBAR_GRID_CLASS,
} from "@/components/gbp-post/gbp-post-roster-layout";
import { clampNumberOfGbpPosts } from "@/lib/gbp-post/gbp-schedule-plan";
import { cn } from "@/lib/utils";

export type GbpPostToolbarProps = {
  disabled: boolean;
  isBusy: boolean;
  isPosting: boolean;
  postLabel: string;
  selectedCount: number;
  rosterSiteCount: number;
  allClientsSelected: boolean;
  someClientsSelected: boolean;
  onSelectAllChange: (selectAll: boolean) => void;
  numberOfPosts: number;
  onNumberOfPostsChange: (value: number) => void;
  onPost: () => void;
  onShuffleLandingPages?: () => void;
  shuffleDisabled?: boolean;
};

export function GbpPostToolbar({
  disabled,
  isBusy,
  isPosting,
  postLabel,
  selectedCount,
  rosterSiteCount,
  allClientsSelected,
  someClientsSelected,
  onSelectAllChange,
  numberOfPosts,
  onNumberOfPostsChange,
  onPost,
  onShuffleLandingPages,
  shuffleDisabled = false,
}: GbpPostToolbarProps) {
  const controlsDisabled = disabled || isBusy;
  const postDisabled = controlsDisabled || isPosting || selectedCount === 0;
  const selectAllChecked: boolean | "indeterminate" =
    allClientsSelected ? true : someClientsSelected ? "indeterminate" : false;

  return (
    <div className={cn("min-w-0 shrink-0", GBP_ROSTER_TOOLBAR_BLEED_CLASS)}>
      <div className={cn("w-full min-w-0", GBP_ROSTER_LIST_INSET_CLASS)}>
        <div className={GBP_ROSTER_TOOLBAR_GRID_CLASS} role="group" aria-label="Post settings">
          <div className="flex items-center justify-center">
            <CheckField
              aria-label="Select all clients"
              title="Select all"
              checked={selectAllChecked}
              disabled={controlsDisabled || rosterSiteCount === 0}
              onCheckedChange={onSelectAllChange}
            />
          </div>

          <div aria-hidden />

          <div className="col-span-2 flex min-w-0 items-center justify-end gap-2 sm:gap-3">
            <Field
              type="number"
              size="count"
              min={1}
              max={10}
              placeholder="Posts"
              aria-label="How many GBP posts"
              value={numberOfPosts}
              disabled={controlsDisabled}
              onChange={(e) => onNumberOfPostsChange(clampNumberOfGbpPosts(Number(e.target.value)))}
            />

            {onShuffleLandingPages ? (
              <Button
                variant="tool"
                size="icon"
                icon={Shuffle}
                disabled={shuffleDisabled}
                aria-label="Shuffle landing pages"
                title="Shuffle landing pages"
                onClick={onShuffleLandingPages}
              />
            ) : null}

            <Button variant="run" disabled={postDisabled} onClick={onPost}>
              {postLabel}
            </Button>
          </div>

          <div aria-hidden />
        </div>
      </div>
    </div>
  );
}
