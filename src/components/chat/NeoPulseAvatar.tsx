import React from "react";
import { Sparkles } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { NEO_PULSE_BOT_DISPLAY_NAME } from "@/lib/chat-neo-pulse";

export type NeoPulseAvatarProps = {
  avatarUrl?: string | null;
  displayName?: string;
  className?: string;
};

export function isNeoPulseBotDisplayName(displayName: string): boolean {
  const normalized = displayName.trim().toUpperCase();
  return normalized === NEO_PULSE_BOT_DISPLAY_NAME.toUpperCase() || normalized === "FLO";
}

/** @deprecated Use isNeoPulseBotDisplayName */
export const isFloDisplayName = isNeoPulseBotDisplayName;

export function NeoPulseAvatar({
  avatarUrl,
  displayName,
  className,
}: NeoPulseAvatarProps): React.ReactElement {
  return (
    <Avatar className={cn("h-9 w-9 shrink-0", className)}>
      {avatarUrl ? (
        <AvatarImage src={avatarUrl} alt={displayName ?? NEO_PULSE_BOT_DISPLAY_NAME} />
      ) : null}
      <AvatarFallback className="bg-ui-field-hover text-primary">
        <Sparkles className="h-4 w-4" aria-hidden />
      </AvatarFallback>
    </Avatar>
  );
}

/** @deprecated Use NeoPulseAvatar */
export const FloAvatar = NeoPulseAvatar;
export type FloAvatarProps = NeoPulseAvatarProps;
