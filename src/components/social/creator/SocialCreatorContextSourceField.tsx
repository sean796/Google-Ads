import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { PPC_DETAIL_INPUT_CLASS } from "@/components/ppc/google/google-ads-row-details-styles";
import type { MetaAdContextSource } from "@/lib/social/social-creator-types";
import { cn } from "@/lib/utils";
import { Button, Field, RowButton } from "@/ui";

const META_CONTEXT_OPTIONS: Array<{
  value: MetaAdContextSource;
  label: string;
  hint: string;
}> = [
  {
    value: "neo-pulse_app",
    label: "NEO Pulse app",
    hint: "Built-in marketing context",
  },
  {
    value: "custom",
    label: "Custom URL",
    hint: "Research any page with DataForSEO",
  },
];

export type SocialCreatorContextSourceFieldProps = {
  contextSource: MetaAdContextSource;
  contextUrl?: string;
  disabled?: boolean;
  onContextSourceChange?: (source: MetaAdContextSource) => void;
  onContextUrlChange?: (url: string) => void;
};

export function SocialCreatorContextSourceField({
  contextSource,
  contextUrl,
  disabled,
  onContextSourceChange,
  onContextUrlChange,
}: SocialCreatorContextSourceFieldProps) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isCustom = contextSource === "custom";

  const handleOpenChange = (nextOpen: boolean) => {
    if (disabled) return;
    setOpen(nextOpen);
  };

  const closePickerIfBlurred = () => {
    window.setTimeout(() => {
      const active = document.activeElement;
      if (anchorRef.current?.contains(active)) return;
      if (contentRef.current?.contains(active)) return;
      setOpen(false);
    }, 0);
  };

  const pickSource = (source: MetaAdContextSource) => {
    onContextSourceChange?.(source);
    setOpen(false);
    if (source === "custom") {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const openMenu = () => {
    if (disabled) return;
    setOpen(true);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Anchor asChild>
        <div
          ref={anchorRef}
          data-meta-context-picker
          className={cn(
            PPC_DETAIL_INPUT_CLASS,
            "flex h-8 w-full min-w-0 items-stretch overflow-hidden p-0",
            disabled && "opacity-50",
          )}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Field
            ref={inputRef}
            value={isCustom ? (contextUrl ?? "") : "NEO Pulse app"}
            readOnly={!isCustom || disabled}
            disabled={disabled}
            placeholder={isCustom ? "Context URL" : undefined}
            aria-label={isCustom ? "Context URL" : "Context source"}
            aria-expanded={open}
            aria-haspopup="listbox"
            onClick={(e) => {
              e.stopPropagation();
              if (!isCustom && !disabled) openMenu();
            }}
            onFocus={() => {
              if (!isCustom && !disabled) openMenu();
            }}
            onKeyDown={(e) => e.stopPropagation()}
            onBlur={closePickerIfBlurred}
            onChange={(e) => {
              if (!isCustom) return;
              onContextUrlChange?.(e.target.value);
            }}
          />
          <Button
            size="icon" icon={ChevronDown}
            variant="quiet"
            disabled={disabled}
            aria-label={open ? "Close context options" : "Open context options"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              if (open) {
                setOpen(false);
                return;
              }
              setOpen(true);
              if (isCustom) {
                inputRef.current?.focus();
              }
            }}
          ></Button>
        </div>
      </PopoverPrimitive.Anchor>
      <PopoverContent
        ref={contentRef}
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] max-w-[var(--radix-popover-trigger-width)] rounded-none border-0 bg-ui-field p-1.5 shadow-lg"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (anchorRef.current?.contains(e.target as Node)) {
            e.preventDefault();
          }
        }}
      >
        <div className="space-y-0.5" role="listbox" aria-label="Context source">
          {META_CONTEXT_OPTIONS.map((option) => {
            const selected = contextSource === option.value;
            return (
              <RowButton
                selected={Boolean(selected)}
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={(e) => {
                  e.stopPropagation();
                  pickSource(option.value);
                }}
              >
                <span className="text-base">{option.label}</span>
                <span className="text-base text-muted-foreground">{option.hint}</span>
              </RowButton>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
