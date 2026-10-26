# Shared ERP list grid

`public/standard-grid.js` and `public/standard-grid.css` own list-grid presentation,
sorting, filtering, resizing and TXT/CSV export. Accounting Objects was the pilot;
the approved rollout now covers the 29 main-list targets explicitly registered in
`public/standard-grid-lists.js`. This includes organisation setup, account and object
records, transactions, type definitions, workflow configuration, users/roles,
resource overviews and report definitions. Record editors, nested detail tables,
history/version tables, schema grids and generated report output are unchanged.

## Integration contract

Load the stylesheet after `style.css` and the script before its consumer. Call
`erpStandardGrid.render({target, toolbar, contextKey, columns, rows, onOpen,
beforeChange, exportName})`. Reuse the target to update data. Columns have:

| Property | Meaning |
| --- | --- |
| `key`, `label` | Stable identifier (use letters, digits and hyphens) and caption |
| `type` | `text`, `enum`, `number` or `date`; omit for action-only columns |
| `value(row)` | Raw scalar used for filtering, sorting and default export |
| `render(row)` | Optional display text or DOM node, retaining existing event handlers |
| `exportValue(row)` | Optional plain scalar for export and derived enum labels |
| `sortValue(row)` | Optional scalar for sorting by the displayed enum label |
| `options` | Optional enum array of values or `{value,label}` entries; current row values are also included |
| `width` | Default pixel width (150 if omitted); temporary resizing has a 90px minimum |
| `export`, `sort`, `filter` | Set to `false` to disable that column capability |

For existing workflow-aware lists, pass `standardGrid: {columns, exportName}` to
`erpObjectGridViews.render`. Its legacy display-column callbacks supply labels and
DOM rendering, and existing hidden-workflow/dashboard-status filtering runs first.
The application's shared `table` adapter also looks up registered list targets;
its existing workflow-aware renderers use that adapter in columnar mode. The
status-board view retains its existing implementation and hides the grid menu.
Record/transaction list controls share the filter row: search (where present,
up to 340px on desktop), Show hidden records, Refresh, Columnar/Status view
buttons and Grid options. Add, record count and Create from Document remain in
the heading row. Controls wrap at narrow widths; the existing Refresh button is
moved between the current view and top bar rather than duplicated.

List registration defines each column type explicitly, preserves code strings
(including numeric-looking country codes), and supplies raw balances/rates for
numeric operations. Owner/status enum values retain their identifiers while
labels are used for display, sorting and export. Monetary decimal strings are
compared exactly and exported without a conversion to binary floating point.

Only registered initial-list IDs are upgraded. Unregistered targets use the
existing table renderer. Add a list in the registry rather than duplicating grid
behaviour or inferring types from headings or sample values. A column-count
mismatch raises an error rather than silently attaching incorrect filters.

The adapter passes `afterRows({body,rows})` to the control for specialised display
behaviour. Fiscal-year expansion uses the filtered, sorted rows to attach nested
period tables to the correct year after every redraw. Nested periods are not
registered and retain their existing editor/actions.

Supply the **complete authorised dataset** for the current context, rather than a
single server page. Scope, permissions and business validation remain API-owned.
External search and hidden-status controls run before grid filters. Exports include
only the supplied rows that match applied column filters, in current sort order.
They never fetch additional data. Actions are excluded using `export: false`.

## Behaviour

- Heading clicks cycle ascending, descending, and unsorted. Only the active column
  shows a sort arrow. Missing values sort last; equal values retain input order.
- Column filter popovers stage changes. Apply commits and closes; Clear removes
  only that column's applied filter and closes; ×, Escape, or outside dismissal
  discards pending changes. Opening another popover discards the previous draft.
- Text wildcards match the complete value without case sensitivity: `*` is any
  text and `?` is one character. Use `*lease*` for contains.
- Numeric/date ranges are inclusive with either bound optional. Blank cells do
  not match an active range. Dates use ISO calendar dates; no timezone conversion.
- Enum checkboxes use OR within a column and AND across columns. Search narrows
  the option labels only. Select all/none affects **every** option, including
  hidden matches. All selected removes the filter; none selected matches no rows.
- The single grid menu resets widths, exports, or clears all column filters.
  It does not change external search, workflow visibility or division context.
- Exports are UTF-8 with BOM, headings and CRLF records. CSV uses commas; TXT uses
  tabs. Embedded delimiters, tabs, quotes and line breaks are quoted. Text that
  could be interpreted as spreadsheet formulas is prefixed with an apostrophe.
  Genuine numeric values are retained. There is no XLSX export or Rows selector.
- Rows open with click or Enter/Space. Embedded controls handle their own actions.
  Resize separators support dragging and Left/Right arrows (10px steps).

There is no localStorage or database persistence. Re-rendering the same context
preserves column filters, sorting and widths. A changed context resets all three.
Call `suspend(target)` when switching to another representation; this closes
popovers, hides the menu and resets widths. Call `destroy(target)` when leaving the
list permanently to discard its state and remove the menu. View navigation uses
`leave(target)` to clear temporary state/hide menus and `resume(target)` to restore
cached lists on return, without replacing a suspended status board. Organisation
or division context reset destroys all registered controls and popovers.

## Verification

Pure helpers use Node's test runner in `test/standard-grid.test.js` and
`test/standard-grid-lists.test.js`. Browser checks in `test/standard-grid-ui.test.js`
and `test/standard-grid-rollout-ui.test.js` use the repository's optional Playwright pattern;
set `NODE_PATH` to the available Playwright package and
`SHOWIF_BROWSER_CHANNEL=msedge` where required. They use fixture rows and the actual
Accounting Objects rendering function, all registered targets through the actual
table adapter, fiscal expansion and cached-view restoration. They do not save or
delete live records.
