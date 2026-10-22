# Core-ERP application instructions

## Working with the owner

- Interrogate requests. Ask questions to clarify requirements, approach, and expected outcomes; do not guess unresolved business rules.
- Before implementing changes, list the high-level areas of change and obtain confirmation. Existing explicit confirmation remains valid for its agreed scope.
- Standardisation is important. Prefer reusable code and established application patterns over duplicated or feature-specific implementations.
- Distinguish the owner's intended business rules from the current implementation. If they conflict, explain the discrepancy and confirm the proposed resolution before changing behaviour.

- Standardise panel and dialog dismissal on the accessible × close button. Do not add Cancel buttons. Closing does not undo saved changes; preserve existing dismissal behaviour and unsaved-change handling.

### Change presentation and confirmation

Before implementing changes, present the proposed changes for owner confirmation using these six categories, clearly distinguishing each category and marking those with no proposed changes as not applicable:

1. **Infrastructure** — API changes, Docker image changes, folder structure changes, and anything requiring a service restart. API changes belong here even when the Runtime loads them without a restart.
2. **UI changes** — Changes confined to the `public/` folder. Identify related API or other changes separately under their applicable categories.
3. **Database changes** — Schema changes requiring **Initialise Schema**.
4. **Template seeding** — Template-definition changes requiring **Initialise Template Org**.
5. **Example org data** — Changes or actions creating real business records in the template organisation, distinct from template definitions.
6. **Other** — Changes outside the categories above, including tests, documentation, and tooling.

For each applicable category, describe the proposed scope, resulting behaviour or effects, and required owner or deployment actions, including service restarts and initialisation actions. Identify all applicable categories when a feature spans several areas. Obtain confirmation before implementation; existing explicit confirmation remains valid for its agreed scope.

In delivery reports, distinguish source changes from actions actually executed. State whether service restarts, Initialise Schema, Initialise Template Org, and example-data creation were performed when applicable. These presentation categories do not replace the changelog categories or relax infrastructure protection and database-change rules below.

### UI mockups before approval

When a requested change updates the UI or introduces a feature that affects the UI, automatically generate a mockup of the proposed interface before requesting implementation approval. Prefer interactive HTML when applicable; use static images when interactive HTML is unsuitable. Present the mockup alongside the six-category change proposal as supplementary approval material, including affected states and interactions where needed to make the proposed behaviour clear.

Create approval mockups without modifying application source. Mockup preparation is part of preparing the proposal and does not require separate implementation approval. Obtain owner confirmation before implementing the proposed application changes; the mockup does not replace the existing confirmation requirements.

## Purpose and platform

Core-ERP is the foundation for building a tenant-scoped ERP system within SaaS14 Core. Core provides central management of applications, users, and tenants (shared workspaces).

The platform uses Node.js application code, PostgreSQL, Docker deployment, and Git. The Gateway image proxies requests to applications. The Runtime image loads application APIs and public content from mounted application volumes, allowing applications to change without rebuilding the Runtime image.

Keep ERP business logic in this application's API layer. Define the user interface in its public HTML, CSS, JavaScript, and assets. Browser code may provide presentation and interaction, but authoritative validation, permissions, and business rules belong in the APIs. Retrieve deployment configuration dynamically from JSON configuration files; do not hard-code deployment-specific settings or embed passwords in source code.

## Accounting object classes

Preserve these distinct business roles:

- **Sub-ledgers:** Account definition and transactional allocation of balance-sheet transactions.
- **Accounting objects:** Account definition and transactional allocation of income-statement transactions.
- **Accounting dimensions:** Classification of transactions across either category.
- **Transaction Type:** Definition of transaction structure, permitted classifications, posting rules, and workflow.

Where account-level allocation is required, balance-sheet transactions must use sub-ledgers. This does not require a sub-ledger on every balance-sheet journal line; follow the configured line and GL-account requirements. Income-statement allocations must use accounting objects. Dimensions classify transactions and must not substitute for either allocation class.

Transaction Types govern how transactions are structured, classified, posted, and progressed through workflow. Their definitions must preserve the allocation roles of sub-ledgers and accounting objects and the classification role of accounting dimensions.

Preserve the distinction between these classes and the general-ledger account and account-type definitions used for posting and financial reporting. Reuse the application's configurable type, schema, transaction-line, and module mechanisms when extending these classes. Do not introduce a parallel account or classification model without agreement.

## Organisation definition and management

Organisation setup includes:

- Organisation identification details.
- Tax types and tax rates.
- Countries.
- Currencies and exchange rates.
- Fiscal years and periods.
- Resource (people) roles.
- Permission roles.
- Divisions.
- Modules.
- Workflow definitions.
- Transaction groups.
- Chart of accounts (general-ledger accounts and account types).
- Financial statement formats.
- Report definitions.

Treat resource roles as distinct from user access roles. Preserve the relationship between an organisation, its divisions, and its tenant. Validate references against their applicable tenant and organisation scope.

## Existing application capabilities

The application currently contains the following capability areas. Extend their existing mechanisms rather than creating competing implementations:

- **Organisation setup and templates:** Organisation context, template initialisation, example seeds, copying organisation setup, chart import, and organisation data management.
- **Divisions and legal entities:** Division hierarchy; legal-entity details, identifications, addresses, and relationships.
- **Accounting configuration:** General-ledger accounts and types; sub-ledger accounts and types; accounting objects and dimensions with configurable types, attributes, grids, references, and versions.
- **Transaction configuration and capture:** Transaction groups, transaction types, line definitions, permitted classifications, journal capture and detail, and journal workflows.
- **Fiscal and currency management:** Fiscal years and periods; currencies, countries, tax types and rates; exchange rates and their change history.
- **Workflows:** Configurable paths, steps, transitions, status management, and history.
- **Modules and access:** Organisation modules, user roles, role permissions, module access, and tenant/organisation context.
- **Resources:** People/resources, resource roles, and assignments to objects.
- **Supporting information:** Document upload, listing and deletion; notes; document intake analysis and confirmation; organisation OpenAI settings.
- **Reporting:** Dashboard summaries, trial balance, configurable financial statement formats, report definitions and catalogue, report execution, and spreadsheet export.
- **Navigation:** Configurable menus and user favourites.

This inventory describes existing areas; it does not authorise changes to each area or define new business rules.

## Configurable types, records, and modules

Object types define reusable schemas, attributes, grids, references, and applicable behaviour. Individual records hold business data governed by those definitions. Keep type configuration distinct from record data. Normal application operations must respect record integrity; development/test schema changes follow the database-change policy below.

Modules connect object types, transaction types, permission roles, resource roles, and reports. Preserve and validate these relationships when introducing or changing configuration. Module membership does not replace permission checks.

Use the existing manual and automatic code-numbering mechanisms for supported object classes. Preserve configured ranges, uniqueness, and existing record codes. Automatic allocation must remain safe under concurrent requests; do not replace it with browser-generated or independently calculated sequence values.

## Transaction line definitions

Transaction Types define required, optional, repeatable, and generated lines. Preserve the distinction between manually entered amounts and generated balancing amounts, together with configured GL accounts, debit/credit sides, and additional-line permissions.

Enforce configured sub-ledger requirements and permitted or mandatory accounting-object and dimension types in the API. Validate related-object consistency. Changes to line definitions must be reviewed for their effects on capture, journal validation, posting, and reports.

## Templates and seeding

Treat `seeds/template-defaults.json` and the existing seeding services as the source of template defaults. Keep definitions, module mappings, permissions, resource-role mappings, line classifications, reports, and their references consistent.

Template definition initialisation and optional example-record initialisation are separate operations. Example data requires an existing template organisation. Preserve their existing confirmation and administrator-access requirements.

Reinitialising definitions can overwrite seeded configuration and rebuild relationships even where record IDs and business records are retained. Review these effects before executing initialisation; do not assume repeated seeding preserves local customisation. Keep example-record bindings distinct from definition defaults.

Property, insurance, tours, assets, and projects are seeded configurations of the reusable ERP model. Prefer extending shared configuration mechanisms for these domains. A seeded module or example does not establish that every business process in that domain is implemented.

## History and effective dates

Preserve object version snapshots, including their schema and resource-assignment context, for supported versioned object classes. Keep grid projections consistent with saved records using the existing shared services.

Respect effective dates and validity periods for configuration and assignments. Do not introduce an implicit latest-record or effective-on-date selection rule where none is defined.

Preserve exchange-rate correction history, revision checks, and reasons for corrections. The existing correction mechanism keeps the currency pair and effective date fixed; use a new entry when those identifiers change. Reuse the existing currency-format and exchange-rate helpers to preserve precision and rounding conventions.

## Application structure and reuse

- `api/`: Application endpoints, grouped by capability.
- `api/_shared/`: Shared tenant and application utilities.
- `api/_shared/erp/`: Shared ERP services for access, schema, workflows, journals, reporting, configuration, and other cross-endpoint behaviour.
- `public/`: Browser interface and reusable presentation helpers.
- `config/`: Application JSON deployment configuration.
- `schema/`: PostgreSQL application schema.
- `seeds/`: Template and default data definitions.
- `test/`: Existing application tests using Node.js test facilities.
- `logs/`: Operational log output.

Use existing shared services and endpoint conventions. Extract repeated behaviour into an appropriately scoped shared helper. Prefer configurable definitions and schemas where the application already supports them, while keeping business validation explicit. Keep schema, seeds, API behaviour, and UI representations consistent when an agreed change affects them.

## UI: shared field layout — mandatory

- All scalar edit fields, including transaction capture and schema-generated fields, must place the caption to the left of the control.
- Reuse the shared `erp-field-rows` layout. Schema-generated record fields must also use the shared `schema-record-fields` presentation.
- Preserve the responsive caption column and 16px horizontal gap at desktop and narrow widths. Controls must shrink; captions may wrap. Do not switch to captions above controls.
- Honour configured short, medium, wide and full control widths.
- Preserve checkbox layouts and grid/table column headings; do not convert grid cells into caption/control rows.
- New renderer integrations must apply the shared presentation classes, not merely reuse the rendering function.
- Before delivery, verify caption/control geometry at desktop and narrow widths. Extend existing browser checks when introducing another editor or renderer integration. Report when browser verification was not performed.
- Mockups must follow these same rules.

## UI: record edit panels

Apply these shared presentation specifications to sub-ledger object, accounting object, and accounting dimension record editors. Keep type-definition editors distinct from record editors.

- Use the existing shared single-column editor layout: heading, optional type description, full-width tab bar, selected tab content, and action footer. Tabs must sit above fields, never beside them. Use the shared 20px editor gap and 9px identification-row gap.
- Place a non-editable object class/type subheading directly beneath the heading and above the description, using `Object class / Object type` without literal brackets (for example, `Sub Ledger / Asset`, `Accounting Object / Project`, or `Accounting Dimension / Region`). Reuse the shared context/description renderer.
- Group these three lines in the shared `record-editor-header` rather than separate outer grid rows. Use an 18px, medium-weight (500) heading in the primary text colour; a 13px, regular-weight (400), muted class/type line 6px below it; and a 13px, regular-weight, muted description 8px below that with 1.5 line spacing. Leave 16px between the header block and tabs, allow text to wrap, and reserve space for the close button.
- While transaction capture is open, use `Transaction Capture` as the page heading and show the selected transaction type name and its explanatory description in the shared panel header above the tabs. Keep the transaction-type selector and transaction description input in their existing capture positions. Preserve transaction-list headings when capture is closed.
- Do not display Family or object/dimension type as a field in these record editors. Keep type identifiers internally for schema rendering and saving. Dimension type is fixed for both creation (from the type selected before opening) and editing (from the existing record); changing a list/menu selection must not retype an open record.
- Align captions to the left of controls using the shared responsive label-column rules and 16px horizontal gap. Keep this alignment on narrow panels; controls must shrink to fit the available space.
- Reuse `detail-field` and the existing width classes instead of adding editor-specific sizing rules: `detail-field--short` for Code and dates (up to 180px), `detail-field--medium` for type/family, owner division, legal entity, and required sub-ledger selections (up to 340px), and `detail-field--wide` for Name and parent-object search (up to 500px).
- Use the standard shared 34px minimum height for identification inputs and selects. Do not add a sub-ledger-only height override. Preserve configured textarea sizes and schema-grid presentation.
- Render configured detail fields through the shared schema renderer and honour their configured short, medium, wide, or full widths.
- Use the shared tab styling and horizontal scrolling when tabs exceed the available width. Start with Identification, followed by configured detail tabs, Resources, Documents where supported, and Versions. Preserve differences in supported capabilities; accounting dimensions currently have no Documents tab.
- Use the shared sticky, right-aligned footer for the save action. Use the standard × panel-close button to dismiss editors; do not add Cancel buttons. Preserve existing save labels: `Save account`, `Save Object`, and `Save Dimension`.
- Preserve class-specific fields, required markers, validation, and permissions. Presentation consistency does not require identical business fields or adding capabilities.
- Check affected editors at desktop and narrow panel widths when browser verification is available; report explicitly when it has not been performed.

## Organisation setup UI

Keep organisation SVG upload, markup, removal, colour selection, and preview in the dedicated Icon tab. Use a `Use system colour` checkbox, checked by default for new organisations and existing organisations without a custom colour. Hide custom colour controls when checked; when unchecked, show the picker, Choose colour button, and hex field. Existing custom colours open with the checkbox unchecked. Store the optional `organisation_icon_colour` separately from the sanitised SVG. System-colour mode saves null and preserves the existing SVG/system rendering; a validated six-digit hex colour overrides rendered fills/strokes without colouring organisation text or replacing `none` paints. Apply the same icon renderer to organisation tabs, overflow entries, and previews. Preserve administrator and tenant checks and omitted-setting compatibility in the save API.

Use the shared `erp-field-rows` left-caption/right-control layout for all edit panels under Setup → Organisation: Organisations, Divisions, Fiscal Years and Periods, Countries, Currencies and Exchange Rates, Tax Types, Resource Roles, and Financial Statement Formats. Apply it to nested scalar fields as well as the main fields. Reuse the responsive caption column and 16px horizontal gap; keep captions left of controls on narrow panels and allow controls to shrink. Use `organisation-setup-editor` for the additional shared setup-editor presentation rules. Keep module-selection captions left of their checklists. Preserve checkbox layouts and table/grid column headings, including tax-rate and financial-format line grids; do not convert these grids into scalar field rows. Presentation changes must preserve validation, values, permissions, and behaviour.

## Database changes in development/test

- Core-ERP currently operates in a development/test environment. Migration compatibility and preservation of old data are not requirements when implementing agreed database changes.
- Always apply database changes through the application's **Initialise Schema** action. Keep the required changes in `schema/erp-schema.sql`, which that action executes through the existing ERP API and Broker.
- Do not introduce standalone migration scripts or require a separate migration step. Do not apply schema changes directly through SQL clients or other database-update paths.
- Ensure Initialise Schema can update the existing development/test schema to the agreed definition; changing only a `CREATE TABLE IF NOT EXISTS` definition does not update an existing table.
- Prefer a clear, standard schema implementation over compatibility layers or data-preservation workarounds. Keep schema, seeds, APIs, and UI consistent and validate reference integrity for the resulting schema.
- This policy does not authorise unrelated resets or deletion outside the agreed task scope. Preserve normal application validation, permissions, accounting rules, and audit behaviour. Report whether Initialise Schema was actually executed; do not imply database verification from source checks alone.

## Data integrity and access

- Every saved record editor under Setup must offer permanent deletion with explicit user confirmation naming the entry and warning that data will be destroyed, lost permanently, and cannot be recovered by closing the panel. New unsaved entries do not need a database-delete action. Keep recovery/bulk-delete operations distinct from individual deletion.
- Use the shared Setup deletion service and confirmation control. Enforce administrator access and tenant/organisation boundaries in the API. Delete only the selected entry and its explicitly owned configuration; block references from other setup definitions, assignments, business records, and independent history rather than cascading into them. Permanent exchange-rate deletion includes its owned correction history, which the confirmation must explicitly disclose. Organisation deletion may remove its owned setup and navigation configuration but must be blocked by business data or independent history. Preserve atomicity and concurrent-reference checks. Never delete live records merely to test a Delete button.

- Use existing authentication, tenant-session, organisation-access, and permission helpers. Do not rely on browser controls to enforce access.
- Validate tenant and organisation ownership for reads, writes, linked records, documents, assignments, reports, and copied configuration.
- Use the existing Broker APIs and configured database profile for PostgreSQL access.
- Parameterise SQL values. Restrict dynamic SQL identifiers to trusted, validated definitions.
- Use transactions for related writes that must succeed or fail together.
- Preserve applicable workflow, fiscal-period, journal-balance, reference-consistency, and audit-history rules.
- Do not treat existing destructive schema or reset code as blanket authorisation to delete unrelated data. Keep database changes within the agreed scope and use Initialise Schema under the development/test policy above.

## Infrastructure protection

All implementation changes for this application must stay within `Volumes/Core-ERP/`.

The following infrastructure paths are protected:

- `Applications/Core-Gateway/**`
- `Applications/Core-Runtime/**`
- `Volumes/Core-Gateway/**`
- `Volumes/Core-Broker/**`
- `Volumes/Core-SMTP/**`

Keep ERP business logic out of infrastructure. Use existing configuration and APIs. If a requirement appears to need an infrastructure change, stop before editing, explain why, list the proposed files and effects, and obtain explicit user authorisation.

Gateway route registrations, Broker database profiles, SMTP profiles, and changes to `compose.yaml` also require explicit user authorisation. Gateway registrations and Compose application definitions must be manually aligned for security.

## Verification and delivery

- Run checks appropriate to the agreed change and the affected existing tests. Use the existing Node.js test conventions; do not invent a new test framework without agreement.
- For accounting changes, verify the relevant allocation distinctions, balanced journals, fiscal restrictions, and reporting effects.
- For access or reference changes, verify tenant and organisation boundaries and permissions.
- For schema or seed changes, review resulting reference integrity and effects on application behaviour. Apply database updates through Initialise Schema; migration compatibility and preservation of old development/test data are not required.
- Report what changed, how it was verified, and any unresolved limitations. Never claim runtime, database, or browser verification that was not performed.

## Mandatory change logging

- For every applied ERP change, update `CHANGELOG.md` under **Unreleased** before completing the task. This includes fixes, features, refactoring, schema/seeding changes, tests, tooling, configuration, and documentation. Investigation-only work does not require an entry.
- Describe the resulting behaviour, affected capability, verification actually performed, and material limitations. Group related edits; do not create an entry for every file or tool call. Update an existing entry when continuing the same change rather than duplicating it.
- Categorise individual changes, not whole commits. Each entry must use exactly one change type (`Added`, `Changed`, `Fixed`, or `Removed`) and one primary category from the table below. Add secondary categories only when useful. Split unrelated changes into separate entries.
- Use the format `**Fixed · Reporting** — Description.` Optional secondary categories follow the primary label as `Secondary: Access & Security, Database Schema.` Use the category names exactly as listed.
- Include a commit reference when known. Keep uncommitted work under Unreleased; record deployment dates only when verified. Do not attribute unrelated existing workspace changes to the current task or claim historical/runtime/database verification from source inspection.
- Preserve historical entries marked proposed until the owner reviews them. Never record passwords, keys, sensitive business data, or operational log contents.
- This instruction requires agent-maintained entries; it does not install a Git hook or enforce logging for changes made outside an agent task. Commit-check enforcement requires a separately agreed implementation.

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
