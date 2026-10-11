# ERP grid and edit panel standards

Checked against implementation: 2026-10-05.

This guide describes the shared ERP record UI and the standard to follow for new
record lists and editors. Reference implementations are GL Account Types and Subledger Account Types for
Setup definition lists, and sub-ledger accounts and accounting objects for record
editors. Reports share the full-width list and right-anchored editor structure.
Inspect the rendered reference screen as well as its markup: some tabs and controls
are installed by JavaScript after page load. Resource Role and intake dialogs are
separate workflows with centred backdrops, not the default for definition editors.

## Mandatory agent workflow

1. Read this guide before editing an ERP grid, list, form, tab or editor.
2. Identify the matching reference screen: Setup definition or business record.
   Inspect `index.html`, its initialisation/render handlers in `app.js`, and the
   matching selectors in `style.css`; do not copy markup alone.
3. List the applicable features before implementing: list width, search, + action,
   row activation, panel placement, tabs, Scope/modules, footer, close, resizing,
   save lifecycle and context reset. Resolve business ambiguities with the user.
4. Reuse existing helpers and classes. Extend a shared helper centrally when needed;
   do not create another competing grid, module checklist or sizing implementation.
5. Verify the entire screen with the editor closed and open, against the reference,
   at desktop and narrow widths. A screenshot of the editor alone is insufficient.
6. Update this guide when shared behaviour changes and report what was verified.
   Do not claim conformity based solely on syntax checks or helper class names.

The instructions below are required for new compatible screens. Existing exceptions
are identified explicitly; they are not permission to omit required features.

## Grid structure and behaviour

Register the view in both shared CSS selector groups: `position: relative` on
the view and `grid-template-columns: 1fr` on its `.split`. The generic `.split`
default is two columns; omitting the override leaves the grid at half width even
when the editor is hidden, and omitting relative positioning anchors the editor
to the wrong ancestor. Register desktop and responsive editor selectors too.

Use a `.view` containing `.split`, with a `.panel` for the list and a sibling
hidden `.panel.form` for the editor. `.panel-head` contains the title and
`.panel-actions`; creation uses a `type="button"` `.add-record-button` with `+`,
an accessible name and a title. Put `.grid-search` below the heading and the
list container below the search. Keep the list visible while editing.

Render lists through `table(target, columns, rows, onClick)` in `public/app.js`.
It uses `.data-grid`, `.grid-wrap`, safe text cells, an empty-state message and
focusable rows. Click, Enter or Space opens a record; row keyboard activation
only applies when the row itself is the event target. Interactive cell controls
must stop propagation so their actions do not also open the record editor.
Use human-readable labels rather than internal source identifiers when available.
Search filters loaded rows without changing the open edit buffer or saved data.
Use the relevant object's existing type selector when its list is type-scoped;
report definitions have no such type selector.

## Editor placement and layout

The record editor is an absolute overlay anchored to the right of its view.
There is no dimming backdrop, focus trap or `aria-modal` claim. Other page controls
remain usable. Existing CSS places the editor at top 22px/right 34px, z-index 20,
with width up to 820px and viewport-bounded height and internal scrolling. Reuse
these shared selectors when adding an editor; do not duplicate a centred modal.
At the existing responsive breakpoint the editor has 12px left/right insets and
an automatic width. Use theme variables and the shared panel shadow.

Use `.accounting-record-editor` for the single-column form layout. Content aligns
at the top with natural height and 20px spacing. Extra editor height must not
stretch tabs or fields. Labels appear to the left of their controls, with controls in the right column. Preserve existing
schema field width rules and use the central renderer for schema-generated fields.
See [ERP Schema JSON](schema-json.md) for custom field presentation and validation.

## Tabs and actions

Choose the existing tab family appropriate to the editor:

| Editor family | Shared implementation | Tab structure |
| --- | --- | --- |
| Setup types | `installSetupTypeTabs`, `showSetupTypeTab`, `installSetupTypeEditors` | `.tabs.setup-type-tabs`, `.tab`, `.setup-type-panel` |
| Business records | `installResourceAssignmentTab`, account/record tab handlers | `.account-fixed-tabs.account-editor-tabs`, `.account-detail-tab` |
| Report definitions | `createReportBuilder` in `report-builder.js` | Currently uses the account editor tab styling with Details, Columns, Filters and parameters, Sorting, Scope |

Do not copy the report controller as a universal Setup type tab implementation.
Use the shared Setup helper for new type editors, retaining any required accessible
keyboard behaviour when extending it. Report tab styling is a current implementation
variation; the surrounding grid/panel requirements still apply.
The strip scrolls horizontally, with tabs kept on one line. Switch panels without
rebuilding inputs or losing unsaved values. Open on the identification/details tab
when selecting an existing record or creating a new one. Hidden panels must not
consume layout space. Report tabs expose tablist/tab/tabpanel roles, selected state,
roving tabindex and arrow/Home/End navigation; retain these accessibility behaviours
in new tab implementations. Older object tab handlers do not all provide this
complete keyboard convention yet.

Use `.actions.account-editor-actions` for the sticky footer, with actions aligned
right, a top border and the themed panel background. Save applies to the whole
record, including hidden tabs. Validate all fields and reveal the tab containing
an invalid control before focusing it. Keep the editor and inputs open on failure.
Close and Cancel discard the edit buffer without saving. Report Save refreshes the
list and closes on success. Existing object forms may keep the editor open or have
a New action; follow the relevant record lifecycle rather than changing it globally.
Use a top-right `.panel-close` button with an accessible name. Report Escape closes
the editor; its focus returns to the opening control when that control still exists.

## Scope and other applicable tabs

Scope is required for definitions that support allocation to modules. Reuse
`fillModuleSelect(id, selectedIds)` and `selectedModuleIds(id)` with a
`.module-checklist`; `ensureModuleSelect` can construct existing Setup controls.
Allow multiple organisation modules. Load saved allocations when editing and
persist them on Save. Validate IDs on the server against the current tenant and
organisation, not only the browser's checkbox options. Copy allocations with
organisation setup using destination identities, not source UUIDs. Document any
inactive-module handling and whether zero allocations are allowed.

Module allocation controls menu navigation. It must not substitute for individual
report/division permissions. Reports are organisation-level definitions; organisation
and division remain runtime context, not editable report parameters. Reports allow
zero allocations and currently list active modules in their checklist. Their API
rejects inactive or foreign module IDs; the allocation table is `erp_report_module`.

Use the reference's actual capabilities, rather than adding every possible tab:

- Subledger Account Types and accounting object/dimension types have Definition,
  Scope, Roles and Design tabs.
- GL Account Types currently have Definition and Roles; do not invent Scope there.
- Roles on type definitions configure Resource role mappings, not security-role
  grants. Report access is assigned in the Permissions role editor.
- Design on custom types uses the existing schema renderer/preview/editor. Read
  `schema-json.md`; do not create a second UI schema definition.
- Record tabs such as Resources, Documents and Versions apply only where supported
  by the object lifecycle and endpoints. Report definitions do not inherit them
  merely because their panel uses record-editor styling.

## Resizing and context changes

Reuse `installResizableObjectEditors()` in `public/app.js`: register the form ID
rather than implementing another resize handler. It inserts `.object-editor-resize`
in the action footer. Drag the bottom-left grip to resize towards the left/down;
arrow keys adjust by 20px, or 50px with Shift. Clamp to the view and viewport,
re-clamp when the window changes size, and reset dimensions when visibility changes.
Sizing is runtime-only and is not persisted. Reports share this helper with accounts,
accounting objects and accounting dimensions.

Organisation/context changes must clear editor/list state and invalidate in-flight
requests. Do not let a response from the previous context overwrite the current UI.
Client visibility is not authorisation: retain server-side organisation, division,
role and administrative checks. Report definitions remain organisation-level.

## Integration checklist: do not omit any applicable registration

| Concern | Where to register or reuse | Failure if omitted |
| --- | --- | --- |
| View containing block | `style.css` view group with `position: relative` | Editor anchors to the wrong ancestor |
| Full-width grid | View's `.split` group with `grid-template-columns: 1fr` | List occupies roughly half the screen |
| Desktop panel | Absolute editor group and appropriate width group | Panel uses normal document layout or wrong dimensions |
| Responsive panel | Existing responsive editor group (currently within the 980px media rule) | Editor overflows or retains desktop offsets |
| Top alignment | `.accounting-record-editor` and shared tab/panel styles | Extra height stretches content |
| Close | `addPanelCloseButtons` registration or an existing explicit close handler | No consistent dismissal |
| Sticky footer | `.actions.account-editor-actions` | Actions disappear with long content |
| Resize | `installResizableObjectEditors` form registration and CSS sizing/alignment selectors | Missing grip or inconsistent constraints |
| Scope | Shared checklist, saved IDs, API validation and copy remapping | Allocations disappear or cross organisation boundaries |
| Navigation and refresh | Existing menu/view loading, post-save refresh and cache versions | Saved changes or UI fixes remain stale |
| Context reset | Existing reset path and async response guard | Previous organisation data reappears |

The default absolute editor width group is 520px; the wider group is 820px.
Choose the matching reference group rather than assuming all editors are 820px.
Subledger type editors inside `.editor-stack` use the stack's placement rules.
Reports and accounting record editors use the wider group. Preserve the responsive
rule ordering: a desktop-width selector appended after a media rule can override it.

## Implementation and verification

- Markup: `Volumes/Core-ERP/public/index.html`.
- Shared grid, object tab assembly, close buttons and resize helper:
  `Volumes/Core-ERP/public/app.js` (`table`, `installResourceAssignmentTab`,
  `addPanelCloseButtons`, `installResizableObjectEditors`).
- Shared panel placement, responsive rules, tabs and sticky footer:
  `Volumes/Core-ERP/public/style.css`.
- Report state, search, tabs, save and context reset:
  `Volumes/Core-ERP/public/report-builder.js`.
- Browser regression: `node Tools/ERP-Acceptance/test/report-builder.browser.js`.
  Set `ERP_BROWSER_EXECUTABLE` to an installed Chromium/Edge executable if required.

Verify search, +/row opening, tab changes preserving values, Save and failed Save,
Close/Cancel, keyboard activation, invalid controls in hidden tabs, right-anchored
resizing, context reset and narrow viewport layout. Inspect the rendered layout;
syntax checks alone do not establish panel behaviour. The report browser fixture
uses real markup/CSS/controller, the shared resize helper and role tree, with mocked
API responses; it is not a deployed-server or live-database smoke test.

## Change history

- 2026-10-11: Currencies gains an Exchange rates tab and right-anchored rate editor.
  It reuses the grid, Setup tabs, `.erp-field-rows`, caption markers, close/cancel
  and resize helpers. Details and read-only Change history retain edit values.
  No Scope is applicable to these organisation-level currency definitions.
  The legacy currency-definition editor retains its existing stacked fields;
  that is an existing exception, not the pattern for the new rate editor.
  See [Exchange rates](exchange-rates.md) for storage, audit, migration and checks.

- 2026-10-11: Recovery menu adds Initialise Template Org Example Data using the shared menu action rendering and binding. All three initialisation actions ask for confirmation and use existing error/status messaging. Template initialisation confirmation now describes definition reset and record preservation. Verified with production markup/CSS/controller, mocked APIs and full-screen closed/open organisation fixtures at 1440px and 390px; the existing menu supplies full aria-label/title text when sidebar labels are truncated. This is fixture verification, not a live deployment test.

- 2026-10-11: Removed the tour-specific action panel, status column and Save refresh integration. Tour seed records use the standard accounting-object editor and workflow UI. No tour-specific managed-field behaviour remains.

- 2026-10-05: Documented the implemented record panel pattern and aligned report
  definitions with searchable grids, right-anchored tabbed editors and shared resizing.

### Required evidence before completion

Check the closed list occupies the same content width as the reference; check its
heading, + button, search, column labels, row spacing and empty state. Long values
may need horizontal scrolling, but a half-width list must not be mistaken for that.
With the editor open, verify its position relative to the view, grid visibility,
close button, initial tab, sticky footer and responsive sizing. Check every tab's
saved values, Scope persistence, invalid hidden controls, errors retaining input,
keyboard opening/closing and context changes. Check the resize grip only where it
is registered. Use meaningful browser assertions for layout regressions such as
list width and the editor's containing block, then visually inspect the full page.

Run tests covering modified behaviour. For storage or permission changes, run the
relevant database/API tests as well as browser tests. Mocked browser tests cannot
prove database persistence or live deployment. Record browser, fixture/live status,
viewport checks and unavailable verification in the completion report.

Documentation-only edits require source/link verification; they do not require
rerunning application tests when behaviour has not changed.

## Mandatory field alignment

Edit forms use a label-left/control-right row, not stacked label/control blocks.
The four shared record/report editors use a responsive caption column (90px minimum,
up to 160px or 35% of the row) and a flexible control column, with a 16px gap.
The side-by-side relationship is retained on narrow screens; do not apply the old
600px stacked-field rule to these editors. Captions align at the top for multiline
controls. Help text occupies the control column below the control. Existing semantic
field widths still cap short/medium/wide controls; they must not overflow their column.
Report column/filter/sort rows stack their labelled fields vertically within each
row group so every caption shares the same horizontal alignment.

Exceptions: checkbox checklists retain their inline checkbox/caption pattern;
child collection table cells use column headings rather than repeated left captions.
Do not override `.schema-grid` cell styling with the ordinary field-row rule.
Test both static built-in fields and dynamically rendered schema/report controls
at desktop and narrow viewport sizes. Explicitly check that the control starts to
the right of its caption; an editor screenshot without field alignment checks is
insufficient. The shared implementation currently targets `account-form`,
`accounting-object-form`, `accounting-dimension-form` and `report-definition-form`;
new edit forms must reuse the same convention rather than introducing stacked labels.

### 2026-10-05 — Shared field captions and required markers

All four record/report editors use the central caption helper for built-in and
dynamic fields. Required markers remain inside the caption; captions and controls
occupy the same grid row. Report field hints occupy the control column and the row
source hint is associated through aria-describedby. Checkbox checklists and child
grid cells retain their existing presentation. This changes presentation only;
no stored values, seed definitions or migrations change. Browser checks use the
production required-marker helper at desktop and narrow widths:
`node Tools/ERP-Acceptance/test/edit-field-alignment.browser.js` and
`node Tools/ERP-Acceptance/test/report-builder.browser.js`.


### 2026-10-05 — Shared record code assignment controls

GL, subledger, accounting object and dimension type Definition tabs reuse
`installCodeNumberingFields`, `loadCodeNumberingFields` and
`collectCodeNumberingFields`. The four type editors also use the shared sticky `account-editor-actions` footer
and a viewport-bounded scrolling height, recalculated on opening and resizing.
The `.code-numbering-fields` section uses the central
caption/required-marker helper and label-left/control-right rows at desktop and
narrow widths. Automatic-only inputs are hidden and disabled in manual mode;
invalid numbering reveals Definition before focus, and tab changes retain values.
Record inputs use `updateRecordCodeField` for manual required/editable versus
automatic read-only states, refreshed when opening/resetting records or changing
types. Show only the next candidate or exhausted status under the settings;
omit explanatory assignment text. The candidate is not a reserved code.

Run `node Tools/ERP-Acceptance/test/code-numbering.browser.js` (Playwright, optional
`ERP_BROWSER_EXECUTABLE`). Actual markup/CSS and shared helpers are checked on all
four closed/open screens at 1440px and 390px for list width, editor bounds, field
alignment, tab retention, invalid hidden controls, exhaustion and reset. Full-page
screenshots are written to `tmp/code-numbering-browser` for visual QA. This fixture
is not deployed-server verification. See [Record code numbering](code-numbering.md)
for PostgreSQL/API checks and storage behaviour.

Report Columns configuration is an editable table: one row per selected column,
with Field, Column heading and Actions headers. Table headers replace repeated
field captions. Up/Down change row order; boundary moves are disabled. Remove
removes only that row. The table scrolls horizontally on narrow screens. Filter
and sorting editors continue using labelled field rows. This table is a collection
editor exception to the label-left convention, not a change to ordinary edit fields.

Filters and user parameters use a shared editable grid: Field, Condition, Input,
Fixed value, Parameter key, Parameter label, Required and Actions. Parameter
configuration remains on the condition row; irrelevant controls are disabled to
preserve column alignment. Blank/not-blank conditions disable both input variants.
Sorting uses a Field/Direction/Actions grid; Up/Down specify sort priority.
Both tables scroll horizontally on narrow screens and retain saved definitions.

### 2026-10-05 — Fiscal year and period setup

Fiscal setup now uses the shared `table` renderer for both year and period lists.
Each year has a period-count expand/collapse control and Edit/Delete actions.
Expanded periods appear in a labelled nested table with Add period and explicit
Edit/Delete actions. Click, Enter or Space opens either record; button activation
does not also open its row. Search matches years or their periods and preserves
the current edit buffer. Nested tables scroll within the full-width list.

Year and period forms reuse `.accounting-record-editor` and the reusable
`.erp-field-rows` opt-in for caption-left/control-right rows with required markers
inside captions. The existing fiscal editor stack remains the right-anchored
container; only one of its panels is shown. Period editors identify the parent
year and its date range. Both forms use `.account-editor-actions`, close and
Cancel. Save errors retain the edit buffer; successful saves refresh the list.
Monthly generation is offered for new years only; editing a year does not
re-create intentionally deleted periods. Existing period codes are preserved
when editing dates/status. Periods do not have module allocation or Scope tabs.
Fiscal resizing is not registered, consistent with the existing editor stack.

Delete asks for confirmation. Deleting an unused year removes its child periods;
any referenced journal, including draft/deleted/reversed statuses, blocks deletion
with a transaction count. See [Fiscal setup](fiscal-setup.md) for the fixed broker
operation, server protections and verification limits. Browser regression:
`node Tools/ERP-Acceptance/test/fiscal-setup.browser.js`; isolated PostgreSQL:
`node Tools/ERP-Acceptance/test/fiscal-setup.database.js` (PGlite on NODE_PATH).
