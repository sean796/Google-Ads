---
title: UI Audit (Phase 1 baseline)
slug: ui/audit
section: UI
order: 3
related:
  - ui/overview
  - ui/glossary
  - ui/registry
---

<!-- manual -->

Baseline measured 2026-11-04 on `B:\Neo Pulse` (git root; the app lives here, `pulse/` is a subfolder holding scripts and docs). Counts are legacy violations. Phase 1 does not auto-fix them. New lint rules apply only to `src/ui/**` and converted files.

## Starting point

- shadcn/ui already installed (`components.json`, 50 files in `src/components/ui/`), with Radix, `class-variance-authority`, `clsx`, `tailwind-merge`. No new UI dependency is needed for primitives.
- The flat toolbar look already exists as class constants: `BULK_HEADER_*` in `src/components/keyword-research/bulk/bulk-workspace-header-styles.ts` (used in 67 files) and `GENERATOR_*` in `src/components/blog-generator/generator-toolbar-theme.ts`.
- `UnifiedWorkspaceChrome` (three bands) is used by 18 files; 19 `*WorkspaceHeader.tsx` files exist.
- Storybook and a UI lint scope did not exist.

## Drift measurements (src, 752 `.tsx` files)

| Pattern | Occurrences (lines) | Files |
|---|---|---|
| `Loader2` | 296 | 97 |
| `animate-spin` | 210 | 104 |
| `truncate` | 340 | 169 |
| `line-clamp-` | 22 | n/a |
| `text-[Npx]` | 26 | 9 |
| `<Label` (stacked label risk) | 141 | 43 |
| raw `<button` | 362 | 177 |
| `@/components/ui/button` imports | 257 | 257 |
| `@/components/ui/select` imports | 65 | 65 |
| `@/components/ui/input` imports | 123 | 123 |
| `bg-zinc-900` literals | 464 | n/a |
| `rounded-none` literals | 426 | n/a |

Reading: the visual language (zinc wells, square corners, `h-8`) is already dominant, but it is re-typed as class strings in hundreds of places, and 97 files still render spinners.

## Proof page choice

`src/components/knowledge-base/KnowledgeBaseToolbar.tsx` (221 lines). It is the only header toolbar that exercises every phase 1 primitive in one file:

- Select, text field, numeric field, run button, quiet button, danger button, group divider.
- A spinner (`Loader2` + `animate-spin`) on the Start button that becomes a text-state `ActionButton` (Start, Scraping).
- Two conditionally mounted buttons (Cancel, Clear temp) that become reserved slots (zero CLS).

`BulkCsvWorkspaceHeader` named in the plan does not exist in this repo. `DashboardWorkspaceHeader` (34 lines) has no controls of its own. `PressReleaseWorkspaceHeader` delegates to shared `BulkGeneratorRunActions`, which is used by many pages and would widen the blast radius.

## Not in scope

- Auto-fixing the 97 spinner files, 169 truncate files, or the 43 `<Label` files.
- Replacing `src/components/ui/*` shadcn files (they stay as the base for non-toolbar UI).
