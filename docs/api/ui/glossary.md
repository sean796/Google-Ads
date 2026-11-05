---
title: Pulse UI Glossary
slug: ui/glossary
section: UI
order: 1
related:
  - ui/overview
  - ui/registry
---

<!-- manual -->

The shared language. Say these names; the look follows.

## Primitives

### Button
Toolbar button. `variant`: `tool` (grey well), `run` (primary), `danger` (destructive text). `size`: `text` (default) or `icon` (icon only, `aria-label` required). `icon` adds a leading icon. `reserved` keeps the box but hides and disables the control.

```tsx
<Button variant="run" onClick={save}>Save New</Button>
<Button variant="danger" reserved={!running} onClick={cancel}>Cancel</Button>
<Button size="icon" icon={Trash2} aria-label="Clear" onClick={clear} />
```

### ActionButton
One button that cycles labels. Pass every label in `states` and the current one in `state`. The box is the longest label in every state.

```tsx
const STATES = ["Generate", "Approve", "Publish"] as const;
<ActionButton states={STATES} state={step} onClick={advance} />
```

### Field
Flat well. `placeholder` is the label and is required. `size`: `grow` (fills the row) or `count` (narrow, tabular numbers). Any input attribute except `className` and `style`.

### SelectField
Flat dropdown. `placeholder` names the field. `options` is `{ value, label }[]`. `width`: `sm` or `md`.

### Pill
Mode or category toggle (the existing `WorkspacePill`). Props: `label`, `active`, `onClick`, optional `tone`, `icon`, `iconOnly`, `disabled`.

### DetailsDrawer
Details content column inside the right sidebar Details tab. Holds progress logs and batch status only.

## Patterns

### DetailsDockPortal
Publishes a workspace's Details content into the right sidebar Details tab. Every workspace's Details goes through it (via UnifiedWorkspaceChrome or UniversalStudioHeader); do not build a toggle or overlay drawer in the page.

### FilterRow
One toolbar row of related controls. `align="end"` is the right-aligned action cluster. `FilterRowDivider` separates unrelated groups.

### FormSection
Fields row, then one action row. `children` are fields, `actions` are buttons.

### UnifiedWorkspaceChrome
Three-band page header. See the universal workspace header rule.

## Words to avoid

| Do not say | Say |
|---|---|
| "spinner on the button" | `ActionButton` with a busy state label |
| "label above the input" | `Field` / `SelectField` placeholder |
| "hide the button until X" | `Button reserved` |
| "grey button" | `Button variant="tool"` |
| "green button" | `Button variant="run"` |

### Rule: run buttons share the longest width
Any green run button that cycles labels uses ActionButton with all labels in states, so every state has the width of the longest label (zero CLS). Pages never hand-size or hand-swap run button labels.

