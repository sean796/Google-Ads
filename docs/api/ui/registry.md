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

| Name | Layer | File | Story |
|---|---|---|---|
| `Button` | primitive | `src/ui/primitives/Button.tsx` | `Button.stories.tsx` |
| `ActionButton` | primitive | `src/ui/primitives/ActionButton.tsx` | `ActionButton.stories.tsx` |
| `Field` | primitive | `src/ui/primitives/Field.tsx` | `Field.stories.tsx` |
| `SelectField` | primitive | `src/ui/primitives/SelectField.tsx` | `SelectField.stories.tsx` |
| `Pill` | primitive | `src/ui/primitives/Pill.tsx` | `Pill.stories.tsx` |
| `DetailsDrawer` | primitive | `src/ui/primitives/DetailsDrawer.tsx` | `DetailsDrawer.stories.tsx` |
| `FilterRow` | pattern | `src/ui/patterns/FilterRow.tsx` | `FilterRow.stories.tsx` |
| `FormSection` | pattern | `src/ui/patterns/FormSection.tsx` | `FormSection.stories.tsx` |
| `UnifiedWorkspaceChrome` | pattern | `src/components/shared/UnifiedWorkspaceChrome.tsx` | none yet |

## Adding a component

1. Add the entry to `UI_REGISTRY` with its closed option list.
2. Build it from `src/ui/tokens.ts`. No raw palette classes, no spinners, no truncation, no arbitrary font sizes (ESLint enforces this in `src/ui/**`).
3. Add a story that shows every state.
4. Export it from `src/ui/index.ts` and add it to the glossary.

## Converted pages (registry-only, lint enforced)

- `src/components/knowledge-base/KnowledgeBaseToolbar.tsx`
