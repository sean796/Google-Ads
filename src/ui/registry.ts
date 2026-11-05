/**
 * Approved Pulse UI vocabulary. If a component is not listed here, add it here first
 * (with a story) before using it in a page. Mirrors PULSE_AGENT_REGISTRY for agents.
 */

export type UiLayer = "primitive" | "pattern";

export type UiRegistryEntry = {
  layer: UiLayer;
  /** What it is, in one line. */
  use: string;
  /** Closed list of options the component accepts. */
  options: readonly string[];
};

export const UI_REGISTRY = {
  Button: {
    layer: "primitive",
    use: "Toolbar button with text or icon only",
    options: ["variant: tool | run | danger | ready | quiet", "size: text | icon", "icon", "reserved", "pressed"],
  },
  ActionButton: {
    layer: "primitive",
    use: "One button that cycles labels in a fixed box",
    options: ["states", "state", "variant: tool | run", "icon"],
  },
  Field: {
    layer: "primitive",
    use: "Flat text or number well, placeholder is the label",
    options: ["placeholder", "size: grow | keyword | url | short | count"],
  },
  SelectField: {
    layer: "primitive",
    use: "Dropdown styled as a flat well, placeholder is the label",
    options: ["placeholder", "options (value, label, disabled, icon)", "width: xs | sm | md | full"],
  },
  CheckField: {
    layer: "primitive",
    use: "Square checkbox with optional inline label (select all, toggles)",
    options: ["checked", "label", "disabled"],
  },
  TextareaField: {
    layer: "primitive",
    use: "Flat multi-line well, placeholder is the label",
    options: ["placeholder", "rows"],
  },
  SwitchField: {
    layer: "primitive",
    use: "Switch with an inline label, same box on and off",
    options: ["checked", "label", "disabled"],
  },
  DialogShell: {
    layer: "pattern",
    use: "Flat dialog: title, body, one action row",
    options: ["title", "description", "size: sm | md | lg | xl", "actions"],
  },
  TextButton: {
    layer: "primitive",
    use: "Inline text action inside copy",
    options: ["tone: link | muted | plain", "icon"],
  },
  RowButton: {
    layer: "primitive",
    use: "Full-width clickable list row",
    options: ["selected"],
  },
  FileInput: {
    layer: "primitive",
    use: "Hidden file picker opened from a Button",
    options: ["accept", "onChange"],
  },
  SwatchButton: {
    layer: "primitive",
    use: "Color tile for data-driven colors (theme, tag, series)",
    options: ["swatch", "selected"],
  },
  Pill: {
    layer: "primitive",
    use: "Mode or category toggle",
    options: ["label", "active", "tone", "icon", "iconOnly"],
  },
  DetailsDrawer: {
    layer: "primitive",
    use: "Details content column inside the right sidebar Details tab",
    options: ["id", "className"],
  },
  DetailsDockPortal: {
    layer: "pattern",
    use: "Publishes a workspace Details content into the right sidebar Details tab",
    options: ["id", "children"],
  },
  FilterRow: {
    layer: "pattern",
    use: "One toolbar row of related controls, plus FilterRowDivider",
    options: ["align: start | end"],
  },
  FormSection: {
    layer: "pattern",
    use: "Fields row plus one action row",
    options: ["children", "actions"],
  },
  UnifiedWorkspaceChrome: {
    layer: "pattern",
    use: "Three-band page header (title, toolbar, progress)",
    options: ["see src/components/shared/UnifiedWorkspaceChrome.tsx"],
  },
} as const satisfies Record<string, UiRegistryEntry>;

export type UiComponentName = keyof typeof UI_REGISTRY;
