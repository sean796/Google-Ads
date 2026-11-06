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
  RailButton: {
    layer: "primitive",
    use: "Green sidebar rail launcher, icon above label",
    options: ["icon", "label", "selected"],
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
  VendorButton: {
    layer: "primitive",
    use: "Radix-style button base (vendor) for dialogs and menus; toolbar buttons use Button",
    options: ["variant: default | outline | ghost | destructive | secondary | link", "size: default | sm | lg | icon"],
  },
  Accordion: {
    layer: "primitive",
    use: "Radix accordion base (vendor): AccordionItem, AccordionTrigger, AccordionContent",
    options: ["type: single | multiple", "collapsible"],
  },
  Alert: {
    layer: "primitive",
    use: "Inline alert base (vendor): Alert, AlertDescription",
    options: ["variant: default | destructive"],
  },
  AlertDialog: {
    layer: "primitive",
    use: "Radix alert-dialog base (vendor) for confirmations",
    options: ["AlertDialogContent", "AlertDialogAction", "AlertDialogCancel"],
  },
  Avatar: {
    layer: "primitive",
    use: "Avatar base (vendor): AvatarImage, AvatarFallback",
    options: [],
  },
  Badge: {
    layer: "primitive",
    use: "Badge base (vendor)",
    options: ["variant: default | secondary | destructive | outline"],
  },
  Calendar: {
    layer: "primitive",
    use: "Calendar base (vendor, react-day-picker)",
    options: ["mode: single | range", "selected", "onSelect"],
  },
  Card: {
    layer: "primitive",
    use: "Card base (vendor): CardHeader, CardTitle, CardDescription, CardContent",
    options: [],
  },
  ChartContainer: {
    layer: "primitive",
    use: "Recharts container base (vendor): ChartTooltip, ChartTooltipContent",
    options: ["config"],
  },
  useBoxReady: {
    layer: "primitive",
    use: "Chart box readiness hook (vendor): reports when a chart container has size",
    options: [],
  },
  Checkbox: {
    layer: "primitive",
    use: "Radix checkbox base (vendor); labelled checkboxes use CheckField",
    options: ["checked", "onCheckedChange"],
  },
  Collapsible: {
    layer: "primitive",
    use: "Radix collapsible base (vendor): CollapsibleTrigger, CollapsibleContent",
    options: ["open", "onOpenChange"],
  },
  Command: {
    layer: "primitive",
    use: "cmdk palette base (vendor): CommandInput, CommandList, CommandItem, CommandGroup, CommandEmpty",
    options: [],
  },
  Dialog: {
    layer: "primitive",
    use: "Radix dialog base (vendor): DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogPortal; flat dialogs use DialogShell",
    options: ["open", "onOpenChange"],
  },
  DropdownMenu: {
    layer: "primitive",
    use: "Radix dropdown menu base (vendor): DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuSub",
    options: [],
  },
  FloatingLabelInput: {
    layer: "primitive",
    use: "Floating-label input base (vendor)",
    options: ["label"],
  },
  FloatingLabelTextarea: {
    layer: "primitive",
    use: "Floating-label textarea base (vendor)",
    options: ["label"],
  },
  Input: {
    layer: "primitive",
    use: "Raw input base (vendor); placeholder-labelled fields use Field",
    options: ["type", "InputProps"],
  },
  Label: {
    layer: "primitive",
    use: "Radix label base (vendor)",
    options: [],
  },
  Popover: {
    layer: "primitive",
    use: "Radix popover base (vendor): PopoverTrigger, PopoverAnchor, PopoverContent",
    options: ["open", "onOpenChange"],
  },
  Progress: {
    layer: "primitive",
    use: "Radix progress base (vendor)",
    options: ["value"],
  },
  RadioGroup: {
    layer: "primitive",
    use: "Radix radio group base (vendor): RadioGroupItem",
    options: ["value", "onValueChange"],
  },
  ResizablePanelGroup: {
    layer: "primitive",
    use: "Resizable panels base (vendor): ResizablePanel, ResizableHandle",
    options: ["direction: horizontal | vertical"],
  },
  ScrollArea: {
    layer: "primitive",
    use: "Radix scroll area base (vendor)",
    options: [],
  },
  Select: {
    layer: "primitive",
    use: "Radix select base (vendor): SelectTrigger, SelectValue, SelectContent, SelectItem; flat wells use SelectField",
    options: ["value", "onValueChange"],
  },
  Separator: {
    layer: "primitive",
    use: "Radix separator base (vendor)",
    options: ["orientation: horizontal | vertical"],
  },
  Slider: {
    layer: "primitive",
    use: "Radix slider base (vendor)",
    options: ["value", "onValueChange", "min", "max", "step"],
  },
  Switch: {
    layer: "primitive",
    use: "Radix switch base (vendor); labelled switches use SwitchField",
    options: ["checked", "onCheckedChange"],
  },
  Table: {
    layer: "primitive",
    use: "Table base (vendor): TableHeader, TableBody, TableRow, TableHead, TableCell",
    options: [],
  },
  Tabs: {
    layer: "primitive",
    use: "Radix tabs base (vendor): TabsList, TabsTrigger, TabsContent",
    options: ["value", "onValueChange"],
  },
  Textarea: {
    layer: "primitive",
    use: "Raw textarea base (vendor); placeholder-labelled fields use TextareaField",
    options: ["rows"],
  },
  Tooltip: {
    layer: "primitive",
    use: "Radix tooltip base (vendor): TooltipProvider, TooltipTrigger, TooltipContent",
    options: [],
  },
  AEOIcon: {
    layer: "primitive",
    use: "Blog shortcut icon (vendor): AEO",
    options: ["className"],
  },
  LocalIcon: {
    layer: "primitive",
    use: "Blog shortcut icon (vendor): Local",
    options: ["className"],
  },
  VersusIcon: {
    layer: "primitive",
    use: "Blog shortcut icon (vendor): Versus",
    options: ["className"],
  },
} as const satisfies Record<string, UiRegistryEntry>;

export type UiComponentName = keyof typeof UI_REGISTRY;
