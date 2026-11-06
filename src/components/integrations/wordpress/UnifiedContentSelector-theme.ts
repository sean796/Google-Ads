export function unifiedContentSelectorDefaultStyles(isDefault: boolean) {
  /** Default theme: requested flat #090909 surfaces (replaces muted grey panels); 1rem min type */
  return isDefault
    ? {
        bg: "bg-[#090909]",
        bgHover: "hover:bg-[#0c0c0c]",
        bgStripe: "bg-[#090909]",
        rowHover: "hover:bg-[#0c0c0c]",
        chipOn: "border border-border bg-[#0c0c0c] text-foreground shadow-sm",
        chipOff:
          "border border-transparent text-muted-foreground hover:border-border/50 hover:bg-[#0c0c0c] hover:text-foreground",
        text: "text-base",
        /** Override cmdk CommandItem `data-[selected]:bg-muted` (theme grey ≠ #090909) */
        itemRow: "bg-[#090909] data-[selected]:!bg-[#090909] hover:!bg-[#0c0c0c]",
        itemRowOn: "bg-[#0c0c0c] data-[selected]:!bg-[#0c0c0c] hover:!bg-[#121212]",
      }
    : null;
}

export type UnifiedContentSelectorDefaultStyles = ReturnType<
  typeof unifiedContentSelectorDefaultStyles
>;
