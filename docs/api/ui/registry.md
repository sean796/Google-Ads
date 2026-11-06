---
title: Pulse UI Registry
slug: ui/registry
section: UI
order: 2
related:
  - ui/overview
  - ui/glossary
---

<!-- manual -->

The approved catalog lives in `src/ui/registry.ts` (`UI_REGISTRY`) and is exported from `@/ui`. This page is the human index.

<!-- ui-catalog:start -->

| Name | Layer | File | Story |
|---|---|---|---|
| `Button` | primitive | `src/ui/primitives/Button.tsx` | `Button.stories.tsx` |
| `ActionButton` | primitive | `src/ui/primitives/ActionButton.tsx` | `ActionButton.stories.tsx` |
| `Field` | primitive | `src/ui/primitives/Field.tsx` | `Field.stories.tsx` |
| `SelectField` | primitive | `src/ui/primitives/SelectField.tsx` | `SelectField.stories.tsx` |
| `CheckField` | primitive | `src/ui/primitives/CheckField.tsx` | `CheckField.stories.tsx` |
| `TextareaField` | primitive | `src/ui/primitives/TextareaField.tsx` | `TextareaField.stories.tsx` |
| `SwitchField` | primitive | `src/ui/primitives/SwitchField.tsx` | `SwitchField.stories.tsx` |
| `DialogShell` | pattern | `src/ui/primitives/DialogShell.tsx` | `DialogShell.stories.tsx` |
| `TextButton` | primitive | `src/ui/primitives/TextButton.tsx` | `TextButton.stories.tsx` |
| `RowButton` | primitive | `src/ui/primitives/RowButton.tsx` | `RowButton.stories.tsx` |
| `RailButton` | primitive | `src/ui/primitives/RailButton.tsx` | `RailButton.stories.tsx` |
| `FileInput` | primitive | `src/ui/primitives/FileInput.tsx` | `FileInput.stories.tsx` |
| `SwatchButton` | primitive | `src/ui/primitives/SwatchButton.tsx` | `SwatchButton.stories.tsx` |
| `Pill` | primitive | `src/ui/primitives/Pill.tsx` | `Pill.stories.tsx` |
| `DetailsDrawer` | primitive | `src/ui/primitives/DetailsDrawer.tsx` | `DetailsDrawer.stories.tsx` |
| `DetailsDockPortal` | pattern | `src/components/pulse-assist/details-dock.tsx` | `none yet` |
| `FilterRow` | pattern | `src/ui/patterns/FilterRow.tsx` | `FilterRow.stories.tsx` |
| `FormSection` | pattern | `src/ui/patterns/FormSection.tsx` | `FormSection.stories.tsx` |
| `UnifiedWorkspaceChrome` | pattern | `src/components/shared/UnifiedWorkspaceChrome.tsx` | `none yet` |
| `VendorButton` | primitive | `src/ui/vendor/button.tsx` | `VendorButton.stories.tsx` |
| `Accordion` | primitive | `src/ui/vendor/accordion.tsx` | `Accordion.stories.tsx` |
| `Alert` | primitive | `src/ui/vendor/alert.tsx` | `Alert.stories.tsx` |
| `AlertDialog` | primitive | `src/ui/vendor/alert-dialog.tsx` | `AlertDialog.stories.tsx` |
| `Avatar` | primitive | `src/ui/vendor/avatar.tsx` | `Avatar.stories.tsx` |
| `Badge` | primitive | `src/ui/vendor/badge.tsx` | `Badge.stories.tsx` |
| `Calendar` | primitive | `src/ui/vendor/calendar.tsx` | `Calendar.stories.tsx` |
| `Card` | primitive | `src/ui/vendor/card.tsx` | `Card.stories.tsx` |
| `ChartContainer` | primitive | `src/ui/vendor/chart.tsx` | `ChartContainer.stories.tsx` |
| `useBoxReady` | primitive | `src/ui/vendor/chart-box-ready.ts` | `useBoxReady.stories.tsx` |
| `Checkbox` | primitive | `src/ui/vendor/checkbox.tsx` | `Checkbox.stories.tsx` |
| `Collapsible` | primitive | `src/ui/vendor/collapsible.tsx` | `Collapsible.stories.tsx` |
| `Command` | primitive | `src/ui/vendor/command.tsx` | `Command.stories.tsx` |
| `Dialog` | primitive | `src/ui/vendor/dialog.tsx` | `Dialog.stories.tsx` |
| `DropdownMenu` | primitive | `src/ui/vendor/dropdown-menu.tsx` | `DropdownMenu.stories.tsx` |
| `FloatingLabelInput` | primitive | `src/ui/vendor/floating-label-input.tsx` | `FloatingLabelInput.stories.tsx` |
| `FloatingLabelTextarea` | primitive | `src/ui/vendor/floating-label-textarea.tsx` | `FloatingLabelTextarea.stories.tsx` |
| `Input` | primitive | `src/ui/vendor/input.tsx` | `Input.stories.tsx` |
| `Label` | primitive | `src/ui/vendor/label.tsx` | `Label.stories.tsx` |
| `Popover` | primitive | `src/ui/vendor/popover.tsx` | `Popover.stories.tsx` |
| `Progress` | primitive | `src/ui/vendor/progress.tsx` | `Progress.stories.tsx` |
| `RadioGroup` | primitive | `src/ui/vendor/radio-group.tsx` | `RadioGroup.stories.tsx` |
| `ResizablePanelGroup` | primitive | `src/ui/vendor/resizable.tsx` | `ResizablePanelGroup.stories.tsx` |
| `ScrollArea` | primitive | `src/ui/vendor/scroll-area.tsx` | `ScrollArea.stories.tsx` |
| `Select` | primitive | `src/ui/vendor/select.tsx` | `Select.stories.tsx` |
| `Separator` | primitive | `src/ui/vendor/separator.tsx` | `Separator.stories.tsx` |
| `Slider` | primitive | `src/ui/vendor/slider.tsx` | `Slider.stories.tsx` |
| `Switch` | primitive | `src/ui/vendor/switch.tsx` | `Switch.stories.tsx` |
| `Table` | primitive | `src/ui/vendor/table.tsx` | `Table.stories.tsx` |
| `Tabs` | primitive | `src/ui/vendor/tabs.tsx` | `Tabs.stories.tsx` |
| `Textarea` | primitive | `src/ui/vendor/textarea.tsx` | `Textarea.stories.tsx` |
| `Tooltip` | primitive | `src/ui/vendor/tooltip.tsx` | `Tooltip.stories.tsx` |
| `AEOIcon` | primitive | `src/ui/vendor/blog-shortcut-icons.tsx` | `AEOIcon.stories.tsx` |
| `LocalIcon` | primitive | `src/ui/vendor/blog-shortcut-icons.tsx` | `LocalIcon.stories.tsx` |
| `VersusIcon` | primitive | `src/ui/vendor/blog-shortcut-icons.tsx` | `VersusIcon.stories.tsx` |

<!-- ui-catalog:end -->

## Adding a component

1. Add the entry to `UI_REGISTRY` with its closed option list.
2. Build it from `src/ui/tokens.ts`. No raw palette classes, no spinners, no truncation, no arbitrary font sizes (ESLint enforces this in `src/ui/**`).
3. Add a story that shows every state.
4. Export it from `src/ui/index.ts` and add it to the glossary.

## Converted pages (registry-only, lint enforced)

- `src/components/knowledge-base/KnowledgeBaseToolbar.tsx`
