import React from "react";
import type { TaskTag } from "@/lib/tasks-types";
import { SwatchButton } from "@/ui";

export type TaskTagPickerProps = {
  tags: TaskTag[];
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  variant?: "stack" | "inline";
};

export function TaskTagPicker({
  tags,
  selectedTagIds,
  onChange,
  variant = "stack",
}: TaskTagPickerProps): React.ReactElement {
  const toggle = (keyword: string) => {
    if (selectedTagIds.includes(keyword)) {
      onChange(selectedTagIds.filter((id) => id !== keyword));
    } else {
      onChange([...selectedTagIds, keyword]);
    }
  };

  const pills = (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => {
        const active = selectedTagIds.includes(tag.keyword);
        return (
          <SwatchButton
            key={tag.keyword}
            onClick={() => toggle(tag.keyword)}
            selected={active}
            swatch={{ backgroundColor: tag.color, color: "#fff" }}
          >
            {tag.name}
          </SwatchButton>
        );
      })}
    </div>
  );

  if (variant === "inline") {
    return pills;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-base font-semibold text-white">Tags</p>
      {pills}
    </div>
  );
}
