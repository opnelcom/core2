# Core-ERP changelog

Started 2026-10-15. Historical entries below are **proposed**, reconstructed from local Git changes affecting `Volumes/Core-ERP/`, and await owner review. Dates are Git commit dates, not verified deployment dates. Commit subjects are retained as references; the descriptions summarise the source changes rather than repeating those subjects.

This is an application changelog, not a record of every platform change. The complete per-commit ERP file inventory and review evidence are in [docs/change-history-review.md](docs/change-history-review.md). Historical tests were inspected as evidence of intended coverage; they were not rerun at their original revisions. No historical runtime, deployment, or database verification is implied.

## Categories and entry format

Each change has one type: **Added**, **Changed**, **Fixed**, or **Removed**, and one primary category. Optional secondary categories identify other affected areas. Categorise individual changes rather than whole commits. The canonical policy and definitions are maintained in [AGENTS.md](AGENTS.md#mandatory-change-logging).

| Category | Scope |
| --- | --- |
| UI | Layout, navigation, styling, editors, and browser interactions |
| Organisation Setup | Organisation, division, fiscal, currency, tax, and other setup behaviour |
| Template & Seeding | Template definitions, defaults, example records, and initialisation |
| ERP Structure | Shared application architecture, object models, reusable services, and module relationships |
| Database Schema | Tables, columns, constraints, indexes, and Initialise Schema |
| Accounting & Transactions | Capture, allocations, balancing, posting, and accounting validation |
| Workflow | Status definitions, transitions, approvals, and workflow history |
| Access & Security | Permissions, tenant/organisation boundaries, and authentication |
| Reporting | Report definitions, calculations, statements, drill-down, and exports |
| Documents & Intake | Attachments, document analysis, and intake confirmation |
| Maintenance & Tooling | Tests, development tools, configuration, and documentation |

Format: `**Fixed · Reporting** · Secondary: Access & Security — Description.`

## Unreleased

- **Added · Maintenance & Tooling** — Added `FEATURES.md`, a source-based catalogue of ERP capabilities with template-definition and optional example-record illustrations. Covers editor/grid views, allocation classes, configuration, workflows, accounting, reporting, access and domain examples while distinguishing manual processes and seeded configuration from automation. Verification: reviewed local implementation and seed definitions and checked all 22 document links resolve locally; no runtime, browser or database verification performed. Documentation only; no restart, Initialise Schema, Initialise Template Org or example-data creation performed or required.

- **Added · UI** — Shared schema object-reference dropdowns, including grid references, now show a focusable circled question mark beside the selection with source class/type names on hover and keyboard focus. Multiple sources are listed; unrestricted sources show All types and unavailable type names fall back to configured codes. Tooltips use the browser top layer above scrollable grids, prefer placement above the control, stay within viewport edges, and dismiss on Escape, scrolling or resizing; duplicate native tooltips are removed. Existing reference loading and stored selection values are preserved. Verification: all 11 schema-renderer tests (including tooltip positioning and dismissal) and JavaScript syntax check passed; desktop and narrow-panel browser verification was not performed. No service restart, Initialise Schema, Initialise Template Org, or example-data creation was performed or required.

- **Changed · UI** — Shared record-editor view controls now use tabbed-panel and Layers icons in compact, right-aligned buttons, with tooltips and accessible labels; removed the visible “Editor layout” caption while preserving layout switching and selected-state behaviour. Verification: JavaScript syntax check and existing record-editor-layout tests (5 passed, 1 browser test skipped because Playwright was unavailable). Desktop and narrow-panel browser verification was not performed. No service restart, Initialise Schema, Initialise Template Org, or example-data creation was performed or required.

- **Changed · UI** — Custom-schema currency-code fields list active organisation currencies; currency, enum, and reference dropdowns show code and label while closed controls show only the label (blank when absent). Currency and enum codes remain unchanged in collected data; references retain UUIDs. Shared native-select presentation covers fields and grid cells, and object/type views load organisation currencies before rendering. Secondary: ERP Structure. Verified JavaScript syntax and focused renderer, reference UUID, long currency code, active-filter, missing-label, grid, visibility, and seed checks: 28 passed, two browser tests skipped because Playwright is unavailable. The broader schema-fields suite has seven passes and one failure on missing length attributes in untouched sales text definitions. Desktop/narrow browser and live database verification were not performed.
- **Changed · Template & Seeding** — Updated 29 template currency-code definitions to `currency_code`, including fixed currency choice lists, and removed currency-code length/pattern restrictions. Existing records and schemas were not updated. No API or database schema source changes, service restart, Initialise Schema, Initialise Template Org, or example-data creation were performed. Updated defaults require template initialisation to apply; no initialisation was executed.

- **Added · UI** — Floating ERP edit panels can be dragged by their heading or moved with arrow keys on the shared move control (Shift uses larger steps). One presentation helper covers record, Setup, fiscal-wrapper, resource-role, transaction-capture and modal editors, keeps panels within the visible workspace, cooperates with existing resizing, and restores normal positioning on closing/reopening. Position changes remain in memory and do not save settings or business data. Existing controls, dismissal, validation, fields and Tabs/Stacked behaviour remain authoritative. Secondary: Maintenance & Tooling. Verification: browser checks exercise all 28 existing floating editor surfaces, intake and native modal dialogs, boundary limits, narrow-screen resizing, keyboard movement, existing resize grips, resetting, and unsaved field/grid retention with both record layouts. Complete startup and affected regression tests passed (56 tests), with movement/layout/startup checks rerun after preserving the existing resize minimums. No API, database or seed changes; no service restarts, Initialise Schema, Initialise Template Org, example-data creation or live data writes performed.

- **Fixed · UI** — ERP startup now places the transaction-type permanent-delete control in its existing header action container instead of assuming a footer that the editor has removed. The shared deletion initializer accepts an explicit action container without changing confirmation, access checks or deletion behaviour. Added a complete browser startup regression using all real application scripts and mocked read-only bootstrap data; it verifies organisation bootstrap is reached, all 21 Setup deletion controls and three record-layout switches install, and type layout defaults appear on their Definition tabs. Verification: startup, Setup deletion and record-layout tests passed. No live records deleted, service restart, schema/template initialisation or example-data creation performed. Secondary: Maintenance & Tooling.

- **Added · UI** — Sub-ledger, accounting-object and accounting-dimension record editors support Tabs and Stacked layouts using shared controls and the existing fields, grids, validation and actions. Stacked sections start expanded and collapse independently; each section has a rounded outer border and a subtly filled, joined header with a divider when expanded and consistent content padding. Switching retains unsaved values and grid rows, including existing `+ Add row` controls. Headers and save footers remain visible around one content scroller. Each type's Definition tab sets its default in existing UI configuration JSON, validated by its administrator-only save API; reopening restores that default without remembering user overrides. Template JSON seeds Tabs for all three classes; transactions are unchanged. Secondary: ERP Structure, Template & Seeding. Verification: 80 focused and affected regression tests passed, including API/default/seeding tests and browser checks against the real editor markup and schema renderer at desktop and narrow widths, including conditional visibility, typing focus, collapsed-field validation, grid retention and fixed-chrome scrolling. The bordered-header follow-up passed 12 affected tests, with desktop and narrow screenshots visually inspected for the shared styling. No database schema change, service restart, Initialise Schema, Initialise Template Org or example-data creation performed; live-service persistence was not verified.

- **Added · Organisation Setup** — Added shared permanent deletion for 22 Setup entry kinds, with Delete controls across saved setup editors, report definitions, exchange rates, and tax-rate details. Confirmation names the entry and explicitly warns of irreversible destruction and data loss. The ERP API requires scoped administrator access and explicit confirmation, plans atomic writes, locks dependency tables, and blocks foreign-key and applicable logical/configuration references. Explicitly owned configuration is removed with an unused parent; organisation deletion also removes its owned setup/navigation configuration but is blocked by business records and history. Secondary: Access & Security, UI, ERP Structure. Updated permanent-deletion instructions. Verification: 10 focused Node tests passed, covering all registered kinds, owned schema relationships, confirmation cancellation, permissions, tenant/organisation scope, dependency blocking, and transaction conflict handling; full suite: 242 passed, 2 unchanged failures (seeded schema maxLength and missing schema-audit tool), 3 skipped. Browser and live PostgreSQL deletion verification were not performed; no live records were deleted. No schema changes, Initialise Schema, template initialisation, example-data creation, Docker changes, or service restarts were performed.

- **Changed · Template & Seeding** — Expanded all 28 seeded workflow-status descriptions with potential business contexts, including master data, maintenance, insurance claims, sales leads, opportunities, and accounting transactions. Shared statuses describe alternative uses; conversion wording does not imply automatic record creation. Availability and visibility settings are unchanged. Verification: checked context coverage for all statuses and confirmed no other seed values changed; targeted status, Sales, and Maintenance tests passed (one browser test skipped). Initialise Template Org was not executed; applying the descriptions through template initialisation can overwrite customised template configuration.

- **Changed · UI** — Standardised editor and transaction-line selection dismissal on the × close button and removed all Cancel buttons, including those generated by shared record and organisation setup helpers. Workflow Status now receives the shared panel-close control; existing close handlers and save behaviour are preserved. Secondary: Maintenance & Tooling. Updated the editor instructions and comments fixture. Verification: JavaScript syntax checks passed, targeted execution confirmed both workflow editors receive one accessible working close button, and the full Node suite returned 232 passed, 2 failed, 3 skipped. The existing failures concern seeded schema maxLength and a missing schema-audit module. Browser verification was not performed. No API, database, seeding, service restart, or example-data actions were required or executed.

- **Changed · Maintenance & Tooling** — Updated `AGENTS.md` to require owner confirmation with six distinct change categories: Infrastructure, UI changes, Database changes, Template seeding, Example org data, and Other. Proposals must identify effects and required actions; delivery reports must distinguish source edits from executed actions. Verification: reviewed documentation against the owner's requested categories; no runtime or database actions performed.

- **Added · Workflow** — Workflow Status defines Enabled for Use (default off) and Displayed (default on). New workflow current statuses copy availability defaults while preserving editable overrides. Shared record grids use catalogue visibility and offer Show hidden records; authorised workflow-managed object and transaction lists include hidden records for this control. Existing lookup availability rules remain in place. Secondary: UI, Database Schema. Verification: workflow, grid, API defaulting and permission checks passed; full Node suite: 232 passed, 2 failed (seeded schema maxLength assertion and missing Tools/ERP/audit-template-schemas), 3 skipped. Browser verification and Initialise Schema were not performed.
- **Changed · Template & Seeding** — All 28 workflow statuses have descriptions and availability/visibility defaults. Deleted and Archived are hidden; Won and Lost disable use in the catalogue and Sales Opportunity workflow. Other workflow overrides remain intact. Organisation setup copying preserves both settings. Secondary: Workflow. Verification: seed and workflow tests passed. Template initialisation was not executed. Apply database columns through Initialise Schema before template-definition initialisation; template initialisation can overwrite customised configuration.

- **Added · Template & Seeding** — Added Sales Lead and Sales Opportunity accounting-object definitions with prospect/follow-up details, optional customer and originating-Lead references, closure/loss reason fields, automatic numbering, Sales permissions and account-manager resource mappings. Seeded manual Lead and Opportunity workflows support conversion/closure outcomes, stage skipping and reopening; all stages permit accounting use. Optional classifications support allocation on cash-sale revenue, customer-invoice revenue and supplier-invoice expense lines. Definitions only; no example records, structural, conversion API or UI changes. Verification: 50 targeted Node seed, workflow, numbering and template tests passed, with two browser tests skipped; no browser/database execution or template initialisation performed. Automatic conversion and status-dependent mandatory reasons are not implemented by seeding. Secondary: Workflow, Accounting & Transactions.
- **Changed · Template & Seeding** — Consolidated default CRM module mappings into Sales and retire the seeded CRM module when template definitions are initialised. Existing non-template organisations and custom CRM modules are not rewritten. Verified through seed planning tests; template initialisation was not executed against a database.

### 2026-10-15 — Changelog and logging policy

- **Added · Maintenance & Tooling** — Created the ERP changelog and supporting historical file inventory; reconstructed proposed entries for all eight locally available ERP commits, separate from confirmed unreleased work.
- **Changed · Maintenance & Tooling** — Categorised the existing entries using the approved category set and change types, and added a mandatory changelog-update rule and category definitions to ERP's `AGENTS.md`. Commit-check enforcement remains a separate implementation.

Verification: checked historical commit coverage, entry types and categories, and documentation links. Documentation-only changes; no application or database execution required.

### 2026-10-15 — Object Statement fixes

- **Fixed · Reporting** — Fixed the Object Statement SQL parameter contract: explicitly declare the child-object flag as boolean for sub-ledgers, accounting objects, and accounting dimensions, avoiding PostgreSQL's `could not determine data type of parameter $6` error.
- **Added · Maintenance & Tooling** · Secondary: Reporting — Added regression coverage for all ten statement parameters and for sub-ledger/dimension statements with and without a GL-account filter.
- **Fixed · UI** — Removed the duplicate Object Statement heading, aligned the From date control with the other controls while retaining both dates on one row, and vertically centred the parameter labels. Retained the full-width panel and updated browser asset versions.
- **Fixed · Maintenance & Tooling** · Secondary: UI — Corrected the UI fixture width so it can exercise desktop and narrower layouts.

Verification recorded in this chat: 16 statement/trial-balance tests passed for the query fix; 13 statement/trial-balance UI tests passed for the presentation change; JavaScript syntax checks passed. The local UI fixture was inspected at desktop and 768px viewport widths. Live application and PostgreSQL execution were not verified.

Scope note: the Object Statement feature itself and many other workspace changes already existed uncommitted. This entry records only the fixes confirmed in this chat; it does not attribute or describe all outstanding work. Other uncommitted changes need a separate review before inclusion.

## Historical entries — proposed for review

### 2026-10-11 — Configurable records, reports, currencies, and template initialisation

Commit: `7754082` · Original subject: “clean up and fixes” · 98 ERP file changes.

- **Added · ERP Structure** · Secondary: Accounting & Transactions — Added configurable manual/automatic code numbering for GL accounts, sub-ledgers, accounting objects, and dimensions, including ranges, prefixes, padding, and guarded allocation during record saves.
- **Changed · ERP Structure** · Secondary: Database Schema, UI — Extended configurable schemas with field validation, widths and ordering, grids, reference lookups, reference consistency checks, and grid-data projections. Added record version snapshots and version retrieval for supported object classes.
- **Added · Reporting** · Secondary: Template & Seeding — Added a report catalogue, configurable report definitions, report execution, a browser report builder, and spreadsheet export. Added report/module mappings and example report definitions.
- **Added · Reporting** · Secondary: Access & Security — Added trial balance reporting with date or fiscal-period ranges, prior-period opening balances, account drill-down, paginated journal detail, transaction navigation, and CSV export. Added shared transaction-visibility SQL used by reporting.
- **Fixed · Reporting** · Secondary: Access & Security — Updated financial reporting and journal detail access to recognise applicable view/status/wildcard/inherited grants and posted reversal history. Added tests covering denied, expired, future, and unrelated permissions.
- **Added · Organisation Setup** · Secondary: UI — Added exchange-rate entry and correction history, correction reasons and revision checks, and exact decimal/reciprocal helpers. Currency pairs and effective dates remain fixed when correcting a rate. Added editable currency formatting and shared amount helpers.
- **Added · Organisation Setup** · Secondary: Accounting & Transactions — Added fiscal-year/period deletion endpoints which reject deletion when transaction records reference the affected periods.
- **Added · UI** · Secondary: Access & Security — Added user favourites scoped to tenant, organisation, and authenticated user.
- **Changed · Template & Seeding** · Secondary: Database Schema — Split template definition initialisation from optional example-record initialisation, with explicit confirmation and administrator checks. Definition initialisation upserts the template organisation while rebuilding configured relationships; it can overwrite seeded configuration. Example initialisation requires an existing template organisation. Removed template seeding from Initialise Schema.
- **Added · Template & Seeding** — Expanded seeded configurations for capital projects, property, insurance, and tours, including types, classifications, transactions, reports, and examples. These are configurations of the shared ERP model, not evidence that complete industry processes were implemented.
- **Changed · Accounting & Transactions** · Secondary: UI, Documents & Intake — Improved transaction capture from configured line definitions, balancing lines, required sub-ledgers and classifications, transaction-type copying, and editor validation messages. Expanded accounting-object document support and permission checks.
- **Changed · Access & Security** · Secondary: Organisation Setup — Reused the platform tenant-session API for authentication. Made new organisation creation, root division creation, and assignment of its creator as Security Administrator one atomic SQL operation.
- **Added · Maintenance & Tooling** · Secondary: Database Schema — Added Node.js tests for accounting rules, access, schemas and grids, references, documents, numbering, currencies, reporting, favourites, and template operations. Added schema/configuration changes supporting these capabilities.

Principal evidence: `api/_shared/erp/` new shared services; `api/reports/`, `api/report-definitions/`, `api/schema-records/`, `api/exchange-rates/`, `api/navigation/favourites.js`, `api/setup/`; `public/` report/currency/exchange-rate helpers; schema, seeds, and added tests. Full paths are in the review inventory.

### 2026-10-02 — Resources, resource roles, and object assignments

Commit: `cc30d08` · Original subject: “resources” · 30 ERP file changes.

- **Added · Organisation Setup** · Secondary: Access & Security — Added the resource directory and resource-role management, distinct from user permission roles. Added resource details and optional application-user links, with validation against duplicate active links.
- **Added · ERP Structure** · Secondary: Organisation Setup — Added resource-role mappings to configurable object types and resource assignments to GL accounts, sub-ledgers, accounting objects, and dimensions, with validity-date and role-mapping validation.
- **Added · UI** · Secondary: Organisation Setup — Added assignment listing/options APIs, Resources tabs in supported record editors, and an assignment overview.
- **Changed · Access & Security** · Secondary: UI — Extended permission management and menus for resource access and resource-role module membership.
- **Changed · Template & Seeding** · Secondary: Organisation Setup, Database Schema — Extended organisation setup copying, resets, schema initialisation, and template seeding to include resource-role definitions and mappings. Added resource assignment tests.

Principal evidence: `api/_shared/erp/resource-assignments.js`, `api/resources/`, object/type save endpoints, `api/permissions/save.js`, `api/organisations/copy-organisation-setup.js`, setup endpoints, `public/`, schema, seeds, and `test/resource-assignments.test.js`.

### 2026-10-01 — Organisation icons and ERP interface refresh

Commit: `b6c27c7` · Original subject: “New ERP UI” · 7 ERP file changes.

- **Added · UI** · Secondary: Access & Security, Template & Seeding — Added optional organisation SVG icons, server-side sanitisation and a 32KB size limit, icon editing/preview, and rendering in organisation navigation. Added a default template organisation icon.
- **Changed · UI** — Updated the ERP page markup and styling for organisation tabs, division context, sidebar navigation, themes, and editors. Much of the large JavaScript diff is reformatting rather than separate functionality.
- **Added · Database Schema** · Secondary: Organisation Setup — Added organisation icon storage to the schema and preserved saved icons when updates omit the icon setting.

Principal evidence: `api/_shared/svg-icon.js`, `api/organisations/save.js`, `api/setup/init-template.js`, `public/app.js`, `public/index.html`, `public/style.css`, and `schema/erp-schema.sql`.

### 2026-10-01 — Persisted workspace context and explicit setup operations

Commit: `92ee22c` · Original subject: “fixed ERP UI” · 21 ERP file changes.

- **Added · Organisation Setup** · Secondary: Database Schema — Added server-side user preferences for the active organisation and each organisation's division/child-division selection, including context validation and bootstrap restoration.
- **Changed · ERP Structure** · Secondary: Reporting — Applied selected division and optional descendant scope to accounting-object, dimension, sub-ledger and journal lists, dashboard counts, and financial reports.
- **Changed · UI** — Refined organisation/division navigation, theme controls, sidebar behaviour, and confirmation when changing context with unsaved edits.
- **Changed · Database Schema** · Secondary: Access & Security — Removed automatic schema initialisation from ordinary authentication; schema changes run through the explicit setup action. Updated initial bootstrap to handle a schema that has not yet been initialised.
- **Changed · Access & Security** — Centralised ERP setup-administrator/bootstrap checks and required administrator access to permission and role-module listings.
- **Fixed · ERP Structure** — Fixed module-link deletion to bind the parameter positions used by the selected link-table query.

Principal evidence: `api/context/save.js`, access/auth/schema/module helpers, bootstrap/schema/template endpoints, scoped list/report endpoints, `public/`, and user-context schema tables.

### 2026-09-30 — Separate accounting classes, configurable workflows, and transaction lines

Commit: `90235f0` · Original subject: “refreshed permissions and fixed template” · 63 ERP file changes.

- **Changed · ERP Structure** · Secondary: Database Schema, Accounting & Transactions — Replaced the legacy combined account/ledger-family endpoints with separate GL-account and sub-ledger account/type endpoints, and updated journals, reporting, chart import, and setup copying to the revised model. Removed legacy master-data endpoints.
- **Added · Workflow** · Secondary: Access & Security — Added configurable workflow paths, steps, transitions and history, linked workflows to configurable types, and added accounting-object workflow transitions with permission and concurrent-change checks.
- **Added · Accounting & Transactions** · Secondary: Database Schema — Added transaction line definitions for required, optional, repeatable, and generated lines; configured GL accounts, debit/credit direction, balancing amounts, sub-ledger requirements, and accounting-object/dimension classifications.
- **Changed · Accounting & Transactions** · Secondary: UI — Enforced configured line rules and classification references in journal saves, persisted allocation relationships, and updated capture editors and transaction-type setup accordingly.
- **Added · Access & Security** · Secondary: Workflow, UI — Added organisation-level resource permission helpers, role-module retrieval, and workflow-aware permission presentation.
- **Changed · Template & Seeding** · Secondary: Organisation Setup — Reworked template initialisation and setup reset/copy operations for the new account, workflow, and transaction-line relationships. Added municipal-services transaction configuration and example bindings; removed the former example-organisation endpoint.

Principal evidence: `api/_shared/erp/workflow.js`, accounting/GL/sub-ledger endpoints, journal and transaction-type endpoints, permissions, setup/copy/import/report endpoints, `public/`, schema, and seeds.

### 2026-09-12 — Modules and configurable accounting objects/dimensions

Commit: `a772088` · Original subject: “Latest Module based changes” · 46 ERP file changes.

- **Added · ERP Structure** · Secondary: Access & Security — Added organisation modules and module links for roles, transaction types and configurable accounting types, with validation that selected modules are active and belong to the organisation.
- **Added · ERP Structure** · Secondary: UI, Access & Security — Added accounting-object and dimension type/record APIs and editors with configurable schemas, owner divisions, validity dates, and module access checks.
- **Added · ERP Structure** · Secondary: UI — Added accounting-object parent selection/search, same-organisation validation, and rejection of self-parenting and hierarchy cycles.
- **Added · Access & Security** · Secondary: UI — Added business-data/module access helpers and integrated module checks into affected APIs. Added module/role navigation and module SVG icon editing.
- **Changed · Template & Seeding** · Secondary: Organisation Setup, UI — Expanded template defaults, organisation copying, and example setup to include modules, accounting objects/dimensions, and their relationships. Refined schema-driven field controls and sidebar presentation.

Principal evidence: `api/_shared/erp/modules.js`, access/auth helpers, `api/modules/`, `api/navigation/menu.js`, `api/accounting-objects/`, `api/accounting-dimensions/`, setup/copy/permission changes, `public/`, schema, and seeds.

### 2026-09-06 — Setup, documents, intake, and configurable financial statements

Commit: `5a42378` · Original subject: “Add ERP setup and intake features” · 55 ERP file changes.

- **Changed · ERP Structure** · Secondary: Access & Security — Split the original shared ERP service into reusable authentication, access, journal, schema, seeding, and validation helpers. Added resource permission checks to affected operations.
- **Added · Documents & Intake** · Secondary: Organisation Setup, Access & Security — Added document upload/list/delete support and AI-assisted legal-entity document intake with draft analysis, review, and confirmation. Added organisation OpenAI settings with encrypted API-key storage.
- **Added · Reporting** · Secondary: Organisation Setup, UI — Added tax-type/rate management and configurable financial statement formats, line mappings, formulas, period ranges, and comparisons, replacing the earlier fixed financial report definitions.
- **Changed · Accounting & Transactions** — Strengthened journal saves with required transaction context, balanced debit/credit validation, GL/sub-ledger validation, and atomic header/line writes.
- **Added · Organisation Setup** · Secondary: Database Schema, Access & Security, Template & Seeding — Added explicit schema setup, administrator claiming when no ERP administrator exists, a template-derived example organisation operation, and expanded copy/delete setup options.
- **Added · Database Schema** · Secondary: Template & Seeding, UI — Introduced the application schema file and JSON template-defaults file, and updated the browser interface for these setup and intake features.

Principal evidence: `api/_shared/erp/`, `api/_shared/openai-settings.js`, document/intake/tax/financial-format APIs, journals, reports, setup, permissions, `public/`, `schema/erp-schema.sql`, and `seeds/template-defaults.json`.

### 2026-08-25 — Initial Core-ERP application baseline

Commit: `7067cbe` · Original subject: “Initial project commit” · 50 ERP file additions.

- **Added · ERP Structure** · Secondary: Organisation Setup, Accounting & Transactions, Reporting, Access & Security, UI — Established tenant-scoped ERP APIs and a browser interface for organisations, divisions, countries/currencies, fiscal years/periods, legal entities, accounts and account types, master data, transactions, permissions, dashboard summaries, and financial reporting.
- **Added · Accounting & Transactions** · Secondary: Workflow, Organisation Setup, Template & Seeding — Added journal capture, detail and workflow operations, fiscal-period checks, schema validation, notes, chart import, organisation setup copying/deletion, and template seeding.
- **Added · Maintenance & Tooling** · Secondary: ERP Structure — Added initial application configuration and shared ERP utilities. This entry records the baseline present in Git; it does not establish when each capability was first developed or deployed.

Principal evidence: the initial 50 ERP files, including `api/_shared/erp.js`, capability endpoints, `config/config.json`, and `public/app.js`, `public/index.html`, and `public/style.css`.

## Maintaining this log

- Follow the mandatory logging policy in `AGENTS.md`. Use the agreed change types, primary category, and optional secondary categories for every entry. Add meaningful applied changes under Unreleased, grouped by capability and describing the resulting behaviour. Include verification actually performed and any material limitations.
- Record a commit reference once a change is committed. Record deployment/release dates only when independently confirmed; a commit alone does not establish deployment.
- Keep historical wording marked proposed until reviewed. Correct entries when stronger evidence or owner clarification is available.
- Keep unrelated uncommitted work out of confirmed entries until reviewed. Do not include passwords, keys, personal data, operational logs, or generated artifacts.
