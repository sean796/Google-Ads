---
name: emcp-tablepress
description: Build and edit TablePress (free) tables through EMCP's tablepress-read and tablepress-write tools - create a table from data, change it whole or cell by cell, insert and delete rows and columns, import a CSV, HTML, JSON, XLSX or ODS file from pasted data or a URL, export it, check how it renders, style tables with TablePress custom CSS, and put a table on an Elementor or Gutenberg page. Covers versions and conflicts, formulas, sanitizing, and what History can undo.
---

# TablePress

EMCP drives TablePress free 3.4 and later through TablePress's own table model, so TablePress validates, sanitizes and stores every change the way its editor does.

| Tool | Default |
|---|---|
| `tablepress-read` | on |
| `tablepress-write` | off: the site owner enables it under Neo EMCP > Tools > Plugins > TablePress |

Call either tool with no operation to list its operations and their arguments. Pass arguments as `{operation, arguments}`. Rows and columns are numbered from 1.

## Read first

- `get-setup`: the operations you may run (TablePress's own capabilities decide), the default table options and the shortcode parameters you can use with `render-table` and `place-table`.
- `list-tables`: id, name, size and shortcode of each table; `search` matches name and description.
- `get-table`: the cells (500 rows per call, follow `next_cursor`), visibility, options and the table's **version**.

## Build a table

1. `create-table` with `name`, `description` and `data` (rows of cell strings). The first row is the header row by default (`options.table_head` 1). For an empty grid pass `rows` and `columns`. The answer gives the `id`, the `shortcode` and the `version`.
2. `render-table` to see the HTML visitors get, with formulas worked out.
3. `place-table` with `post_id`: an Elementor page gets the TablePress widget (in `container_id`, or a new container at the end), any other page the TablePress block. `position: "prepend"` puts it first. `parameters` are shortcode parameters from `get-setup`, for example `{"hide_columns": "3", "print_name": true}`.

## Change a table

Every write to an existing table needs the `version` you read. If someone changed the table after your read, the write is a `conflict` and nothing is written: read it again, then write. `force: true` writes anyway; use it only when the person agrees.

- `edit-cells` with `cells: [{row, column, value}]` for a few cells (up to 5000).
- `insert-rows` (`at`, `rows` or `count`), `delete-rows` (`rows: [n, ...]`), `insert-columns` (`at`, `columns`: one array per new column, top to bottom, or `count`), `delete-columns`. `hidden: true` inserts hidden rows or columns. `at` is the number the first new row or column gets; the number of rows (or columns) plus 1 appends.
- `update-table` for the whole grid or for name, description, visibility and options. Fields you leave out keep their values.
- `dry_run: true` on `create-table`, `update-table`, `edit-cells` and `delete-table` shows what would change.

Each answer carries the new `version`; use it for the next write.

## Cells

- A cell starting with `=` is a formula, worked out when the table is shown: `=B2+B3`, `=SUM(B2:B9)`. Start a cell with `'=` to show it as text.
- Shortcodes in cells run when the table is shown.
- Users without the `unfiltered_html` capability get their cells cleaned by TablePress (scripts and unsafe attributes removed); the answer lists those cells under `sanitized`.
- `privileged_content`: the table holds HTML that only users with `unfiltered_html` may save, and TablePress would strip it from the whole table on your save. Nothing was written; an administrator has to make the change. `force` does not help.
- DataTables custom commands (`options.datatables_custom_commands`, JavaScript) can only be changed by users with `unfiltered_html`; otherwise they stay as stored and the answer says `custom_commands_kept`.

## Import and export

- `import-table` takes one file per call, from `data` (the file's content, up to 5 MB) or a `url` (http or https). Formats: CSV, HTML table, JSON (rows, or a TablePress JSON export), XLSX and ODS (by URL). Archives are refused.
- `mode`: `add` (default) makes a new table; `replace` swaps the cells of `table_id` and keeps its name; `append` adds the imported rows to `table_id`. replace and append need the `version`.
- `append` adds every row it reads: send the rows **without a header row**, or the header lands in the middle of the table.
- An `id` inside a JSON file is ignored: the target is always the table you name, or a new one.
- A URL import needs TablePress's URL-import capability (administrators and editors by default).
- `export-table` gives CSV (`delimiter`: comma, semicolon or tab), HTML or JSON.

## Copy, rename, delete

- `copy-table` (optional new `name`).
- `change-table-id` with `new_id` and `confirm: true`: pages that show the table by its old id stop showing it; the answer lists them under `pages_using_old_id`. Use `find-usage` first and tell the person.
- `delete-table` with `version` and `confirm: true`; `dry_run: true` lists the pages that show it (`used_on`).

## Custom CSS

`get-custom-css` and `update-custom-css` (`custom_css`, `use_custom_css`) set TablePress's site-wide table CSS; TablePress sanitizes and minifies it and serves it from a file when it can. Target tables with `.tablepress` or one table with `.tablepress-id-{id}`.

## History

Every write is in History and can be undone: edits restore the earlier table, a created or copied table is deleted, a deleted table comes back under its old id, an id change is changed back, and the CSS is put back. An undo is refused when the table changed again since (a newer change is never overwritten unless the person forces it), and never writes privileged content for a user without `unfiltered_html`. Placing a table is a page edit, undone like any other page change.

## Errors

| Code | Meaning |
|---|---|
| `conflict` | the table changed since it was read (`current_version` in the error) |
| `missing_version` | pass the version from get-table |
| `privileged_content` | only a user with unfiltered_html can change this table |
| `tablepress_busy` | another TablePress change is running; try again |
| `out_of_range`, `too_wide`, `too_long`, `would_empty`, `too_many_cells`, `too_large`, `invalid_visibility`, `unknown_option`, `unknown_parameter` | fix the arguments |
| `save_failed`, `save_incomplete`, `create_failed`, `history_unavailable` | TablePress or History failed; `restored` / `cleaned_up` say whether everything was put back |
| `archive_refused`, `import_failed`, `download_failed`, `invalid_url`, `table_import_url_host_blocked` | the import file or URL |
| `id_taken` | another table has that id |
