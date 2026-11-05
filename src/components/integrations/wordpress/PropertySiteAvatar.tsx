import React from "react";
import { cn } from "@/lib/utils";
import type { WordPressSite } from "../types";
import { wordpressSiteDisplayName } from "@/lib/wordpress-site-display-name";

export type PropertySiteAvatarProps = {
  site: WordPressSite;
  size?: "sm" | "lg";
  className?: string;
};

function propertySiteDisplayInitials(displayName: string): string {
  const parts = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}

const sizeClass = {
  sm: "h-10 w-10 min-h-10 min-w-10 text-base",
  lg: "h-16 w-16 min-h-16 min-w-16 text-base",
} as const;

export function PropertySiteAvatar({ site, size = "lg", className }: PropertySiteAvatarProps) {
  const label = wordpressSiteDisplayName(site);
  const initials = propertySiteDisplayInitials(label);

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full bg-ui-field-hover tabular-nums",
        sizeClass[size],
        className,
      )}
    >
      <span
        className="flex h-full w-full items-center justify-center font-semibold text-white"
        aria-label={label}
      >
        {initials}
      </span>
    </div>
  );
}
