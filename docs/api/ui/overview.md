---
title: Pulse UI Overview & Architecture
slug: ui/overview
section: UI
order: 0
related:
  - ui/glossary
  - ui/registry
  - ui/audit
---

<!-- manual -->

Pulse UI is the front-end counterpart of the Mastra agent setup: one shared vocabulary so every page is built from the same named pieces instead of re-typed class strings.

| Mastra (agents) | Pulse UI |
|---|---|
| `PULSE_AGENT_REGISTRY` | `src/ui/registry.ts` (`UI_REGISTRY`) |
| `createTool` | primitives in `src/ui/primitives/` |
| `createWorkflow` | patterns in `src/ui/patterns/` and `UnifiedWorkspaceChrome` |
| Category model variables | tokens in `src/ui/tokens.ts` plus `--ui-*` in `src/index.css` |
| Mastra Studio | Storybook (`npm run storybook`) |
| Guardrails and evals | ESLint scope on `src/ui/**` and converted pages, plus state-cycle stories |

## Layers

1. **Tokens** (`src/ui/tokens.ts`): the only place palette values and control geometry live. Colors resolve through `ui.*` Tailwind colors backed by CSS variables.
2. **Primitives** (`src/ui/primitives/`): `Button`, `ActionButton`, `Field`, `SelectField`, `Pill`, `DetailsDrawer`. Each takes a closed set of options and accepts no `className`.
3. **Patterns** (`src/ui/patterns/`): `FilterRow`, `FormSection`, plus `UnifiedWorkspaceChrome` re-exported from `@/ui`.
4. **Pages**: a `*WorkspaceHeader.tsx` plus a thin shell, importing only from `@/ui`.

## Rules in one line each

- Import UI from `@/ui`. If it is not in `UI_REGISTRY`, add it there with a story first.
- Labels are placeholders inside the field. There is no stacked label.
- Busy state is a label change (`Start` to `Scraping`), never a spinner.
- A conditional control keeps its box with `reserved`, so nothing shifts.
- Type is 1rem minimum; no arbitrary font sizes.

## Relationship to shadcn

`src/components/ui/*` (shadcn) stays as the base for dialogs, tables, and other non-toolbar UI. `Field` and `SelectField` wrap the shadcn `Input` and `Select`. Toolbar pages use the Pulse UI primitives instead of shadcn plus class constants.

## Legacy names

`BULK_HEADER_*` in `bulk-workspace-header-styles.ts` are aliases of the `UI_*` tokens so the 67 files that import them keep working.
