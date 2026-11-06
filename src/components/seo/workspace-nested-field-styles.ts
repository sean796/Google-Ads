import { cn } from "@/lib/utils";

/** Outer chrome for nested workspace fields (focus ring only; tone split inside). */
export const WORKSPACE_NESTED_FIELD_SHELL = cn(
  "overflow-hidden rounded-md border-0 shadow-none",
  "ring-0 ring-offset-0",
  "focus-within:ring-2 focus-within:ring-ring/60 focus-within:ring-offset-0",
);

/** Grey well shared by SEO workspace body fields (matches toolbar `BULK_HEADER_FIELD`). */
export const WORKSPACE_NESTED_FIELD_WELL = cn(
  WORKSPACE_NESTED_FIELD_SHELL,
  "bg-ui-field-hover",
);

/** Form labels on black bands: forced #fff (not muted / foreground). */
export const WORKSPACE_NESTED_FIELD_LABEL =
  "workspace-nested-label-band text-base font-normal leading-snug";

/** Label band: black beside the grey input well (two-tone only). */
export const WORKSPACE_NESTED_FIELD_LABEL_BAND = cn(
  WORKSPACE_NESTED_FIELD_LABEL,
  "flex items-center self-stretch bg-black px-2.5 py-2",
);

/** Input well: lighter grey nested beside the label band. */
export const WORKSPACE_NESTED_FIELD_INPUT_WELL =
  "flex min-w-0 flex-1 items-center self-stretch bg-ui-field-hover px-2.5 py-2";

/** Inline stat row label (same tone, truncates beside the value). */
export const WORKSPACE_NESTED_FIELD_LABEL_INLINE = WORKSPACE_NESTED_FIELD_LABEL;
