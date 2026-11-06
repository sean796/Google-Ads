export const TASK_PROJECT_DIALOG_CLASS =
  "flex max-h-[85vh] max-w-[1280px] w-[min(1280px,98vw)] flex-col gap-1 overflow-hidden rounded-none sm:rounded-none border-0 bg-black p-3 text-foreground [&>button]:rounded-none";

export const TASK_FORM_BAND_CLASS = "flex flex-col gap-0.5 rounded-none p-1";

export const TASK_FORM_BAND_FIELDS_CLASS = "flex w-full min-w-0 flex-col gap-0.5 rounded-none p-1";

export const TASK_FORM_COMPACT_CELL_CLASS =
  "flex min-h-10 min-w-0 flex-col justify-center rounded-none bg-ui-field px-2 py-1";

export const TASK_FORM_COMPACT_INFIELD_LABEL_CLASS = "text-base leading-tight text-muted-foreground";

export const TASK_FORM_CELL_CLASS =
  "flex min-h-12 min-w-0 flex-col justify-center rounded-none bg-ui-field px-2 py-1.5";

export const TASK_FORM_PLACEHOLDER_CELL_CLASS = "flex min-h-9 min-w-0 items-center rounded-none bg-ui-field";

export const TASK_FORM_DIALOG_BUTTON_CLASS = "rounded-none";

export const TASK_FORM_FLAT_CONTROL_CLASS =
  "h-9 min-h-9 w-full min-w-0 rounded-none border-0 bg-transparent px-2 py-0 text-base text-foreground shadow-none outline-none ring-0 focus-visible:ring-0";

export const TASK_FORM_PANEL_CLASS = "flex flex-col gap-1.5 rounded-none";
export const TASK_FORM_PANEL_INNER_CLASS = "flex flex-col gap-1.5 rounded-none";

export const TASK_FORM_INFIELD_SHELL_CLASS = "flex min-w-0 flex-col gap-0.5 rounded-none bg-ui-field px-3 py-2";

export const TASK_FORM_INFIELD_CONTROL_CLASS =
  "min-w-0 [&_input]:h-9 [&_input]:w-full [&_input]:border-0 [&_input]:bg-transparent [&_input]:p-0 [&_input]:text-base [&_input]:text-foreground [&_input]:shadow-none [&_input]:outline-none [&_input]:ring-0 [&_input]:focus-visible:ring-0 [&_textarea]:min-h-[2.5rem] [&_textarea]:w-full [&_textarea]:resize-none [&_textarea]:border-0 [&_textarea]:bg-transparent [&_textarea]:p-0 [&_textarea]:text-base [&_textarea]:text-foreground [&_textarea]:shadow-none [&_textarea]:outline-none [&_textarea]:ring-0 [&_textarea]:focus-visible:ring-0";

export const TASK_FORM_SELECT_CONTENT_CLASS = "border-0 bg-black text-foreground shadow-lg";

export const TASK_FORM_SELECT_ITEM_CLASS = "text-base text-foreground focus:bg-ui-field focus:text-foreground";

export const TASK_FORM_SELECT_TRIGGER_CLASS =
  "h-9 min-h-9 rounded-none border-0 bg-transparent p-0 text-base text-foreground shadow-none focus:ring-0 focus:ring-offset-0";

export const EMPTY_SELECT_VALUE = "__empty__";

export function toSelectValue(value: string): string {
  return value === "" ? EMPTY_SELECT_VALUE : value;
}

export function fromSelectValue(value: string): string {
  return value === EMPTY_SELECT_VALUE ? "" : value;
}

export type TaskFormInfieldSelectOption = { value: string; label: string };

export type TaskFormMultiSelectOption = { value: string; label: string };

