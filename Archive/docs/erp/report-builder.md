# Administrator-defined reports

Implemented first release: 2026-10-05. Deploy the code and run **Initialise Schema**
to install erp_report and the report permission resource kind. This work did not
migrate the project database or deploy the application.

## Identity and permissions

Report is a first-class object; each saved definition is an implementation with
an immutable report_id, editable code/name/description, active flag, JSON
configuration, definition version and actor/timestamps. Administrators maintain
definitions in Setup. Edits check the version originally loaded to prevent silent
concurrent overwrites.

Organisation and division are always required at execution. Role permissions use
resource_kind `report` and resource_code equal to the report UUID. Currently valid
user-role assignments and grants combine across active roles. Exact division and
ancestor grants use the existing applies_to_children convention. Each included
child division is independently checked; a non-inherited parent grant does not
authorize its children. Division membership is validated even for administrators.

A report grant exposes its configured data without requiring the user's source
record/type/transaction permissions. Tenant and organisation isolation always
apply. Direct record access and existing financial-report access retain their
existing checks. Execution reads the saved definition: client-supplied datasets,
columns, arbitrary SQL and replacement definitions are rejected.

Roles have a **Reports** tab listing all saved reports, including inactive ones,
under each division. Grants provide Run and export and an Include child divisions
checkbox. Inactive reports cannot run. Non-administrator roles still require a
module assignment as requested, but report execution does not check module
membership. Module assignment never grants a report. Defined reports are
reachable through module, role and technical menus. Existing module-based checks
for non-report ERP endpoints are unchanged by this release.

## Datasets and scope

One central catalogue/query compiler supplies designer metadata, validation,
execution and export. Custom attributes come from the active type's schema_json;
no duplicate schemas or UI schema editor are introduced. Built-in fields are an
explicit allowlist rather than unrestricted database-column access.

| Row source | Scope and row grain |
| --- | --- |
| Subledger, accounting object, accounting dimension | One record of the selected type; owner's division |
| A schema child collection | One row from that collection, with parent fields; parent's division |
| Resource assignments to these three classes | One assignment, with parent and resource/role fields; parent's division |
| Transaction / journal headers | One erp_journal record; source division |
| Transaction / journal lines | One erp_journal_line record, with header, GL code/name and division labels; line division |
| GL accounts | All organisation-level masters, including unused accounts |
| Resources | All organisation-level masters, including unassigned Resources |

An authorized division context is still required for organisation-wide datasets.
Deleted workflow records are excluded. Resource active/inactive status is a
selectable field and can be limited by a fixed administrator filter.

Each report selects one row source. Child rows come from the canonical
additional_data array, so projection rebuilds are not prerequisites. Multiple
child collections cannot be joined. Arbitrary relationships and reference-name
expansion are not implemented: custom references remain UUID or class:UUID
values. GL Resource assignments are not currently a dataset.

## Designer and execution

1. Setup → Accounting Model → Report definitions → New report.
2. Enter a lowercase underscore code, name, description and row source.
3. Select columns, optionally rename headings, and use Up/Down to order them.
4. Add fixed conditions or user parameters and sorting. All conditions are ANDed.
   User parameter types follow their selected fields; keys must be unique, labels
   are required and Required controls whether a blank parameter is accepted.
5. Save, then Setup → Permissions → select a role → Reports to assign the report
   in its permitted divisions. Save the role with its required module assignment.
6. Select the active organisation/division, open Defined reports, supply parameters
   and Run report. Pagination retains that run's parameters even if controls change.
7. Export Excel executes a new live query with the same saved definition and
   captured parameters. Data can change between runs and between pages.

Limits: 50 columns, 30 conditions, 20 parameters, 5 sort fields, 100 browser rows
per page and 10,000 Excel rows. Larger exports fail explicitly; no file is silently
truncated. Supported conditions: eq, ne, gt, gte, lt, lte, contains, is_blank,
not_blank. Contains requires text. Raw JSON fields cannot be filtered. Blank
optional parameters skip their conditions; zero and false are values.

Realtime describes query time. Administrators explicitly bind reporting-date
parameters to date fields. No implicit fiscal-period, effective-on-date,
latest-observation or historical-version semantics apply. No grouping, totals,
formula columns, OR condition groups or arbitrary joins are implemented.

Custom numeric fields use PostgreSQL numeric for filtering/sorting and return
decimal text without losing precision. Malformed saved numeric values appear
blank; this does not replace record validation. Custom JSON dates compare stored
strings after parameter date validation. Schema drift is checked on every run;
missing fields or inactive types require report-definition repair.

Excel files use inline text, so text beginning with '=' is not an executable
formula. Numeric values beyond Excel's 15-significant-digit capacity remain text.
Date values are exported as text. Browser and Excel share query/access logic.

## Configuration and API

### Template examples

Template defaults include eight editable examples demonstrating different designs.
They are recommendations, not mandatory organisation configuration.

| Example | What it demonstrates |
| --- | --- |
| Property register | Parent identification plus custom fields; optional text search |
| Property valuation history | One child observation per row; required date range and descending dates |
| Property measurement schedule | Decimal quantities, reference IDs and explicit period columns |
| Customer contacts with email | Parent/child fields; fixed not-blank filter plus optional role search |
| Approved transaction lines by date | Fixed status, required date range, optional GL code, debit/credit/currency |
| GL account directory | Organisation-wide masters including unused accounts; type labels and boolean field |
| Active Resource directory | Fixed boolean filter plus optional text search; includes unassigned Resources |
| Property Resource assignments | Controlled parent/resource/role relationships; optional exact role code |

**Initialise Template Org** resets JSON-defined report configuration and module allocations. Business example records are loaded separately through **Initialise Template Org Example Data**, after confirmation. **Initialise Schema** creates report structures only.

Definitions are validated against the actual organisation's catalogue before
insertion. If template customisation removed a required field/source, that example
is skipped. The report-definition helper adds no roles or grants. The separate ERP Administrator
permission seeder grants that operational role access. Setup Administrators can
run active template examples; other users require explicit report/division grants.
Empty datasets return empty reports: these seeds do not invent transactions or
master records. Custom references display stored IDs; valuation history shows all
matching observations, and measurement/assignment schedules show all saved periods.

Seeding source: reportSeeds in seeds/template-defaults.json and
api/_shared/erp/seed-reports.js.

Example definition:

```json
{
  "dataset": "accounting_object:property:marketValues",
  "columns": [
    { "field": "code", "label": "Property" },
    { "field": "row:valuationDate" },
    { "field": "row:amount" },
    { "field": "row:currencyCode" }
  ],
  "parameters": [
    { "key": "fromDate", "label": "From date", "type": "date", "required": true }
  ],
  "filters": [
    { "field": "row:valuationDate", "operator": "gte", "parameter": "fromDate" }
  ],
  "sort": [{ "field": "row:valuationDate", "direction": "asc" }]
}
```

GET report-definitions/catalogue and POST report-definitions/save require Setup
administrator access. GET report-definitions/list?setup=1 returns all definitions
to administrators. Ordinary listing requires organisation_id and division_id and
returns authorized active report identities, descriptions, parameters and versions.
POST reports/run takes report_id, organisation_id, division_id,
include_child_divisions, parameters and optional offset or export: "xlsx".

## Organisation copies and compatibility

Copy Selected Data includes a Report definitions option. Configuration is copied
by report code. Report grants are remapped to matching destination report UUIDs
when permissions are copied; unmatched grants are omitted. Copied definitions
are inactive until reviewed and saved active. Stable dataset keys carry type
codes, but fixed filters may contain organisation-specific IDs and are not
automatically remapped. Review them before activation. Schema reinitialization
preserves report definitions and grants. Existing object schemas and stored
custom values are unchanged. No report grants are automatically seeded.

## Implementation and verification

- api/_shared/erp/report-definitions.js: shared catalogue, validator, compiler and
  report division scope.
- api/_shared/erp/report-xlsx.js: reusable OOXML export.
- api/report-definitions/{catalogue,list,save}.js and api/reports/run.js: endpoints.
- public/report-builder.js: designer/runner; public/app.js: role/menu wiring.
- schema/erp-schema.sql: storage and permission migration.

From the repository root:

```powershell
node --test Volumes/Core-ERP/test/report-definitions.test.js
node Tools/ERP-Acceptance/test/report-builder.database.js
node Tools/ERP-Acceptance/test/report-builder.browser.js
node --check Volumes/Core-ERP/public/report-builder.js
node --check Volumes/Core-ERP/public/app.js
git diff --check
```

The optional isolated database check requires @electric-sql/pglite via NODE_PATH.
It runs the actual schema and endpoints, checks report-only access, organisation
scope, division inheritance, expiry, typed parameters, grid row grain, Excel and
schema idempotency. The browser fixture uses Playwright; ERP_BROWSER_EXECUTABLE
can point to system Edge. It checks designer controls, captured pagination
parameters, context clearing and individual report role grants. These checks pass;
live deployment/project-database migration and a live browser smoke test were not
performed.

Report definition editing in Setup follows the shared ERP grid/editor pattern:
a searchable grid with a + action, and a right-anchored overlay panel with Details,
Columns, Filters and parameters, and Sorting tabs. The grid remains visible without
a backdrop. The shared resize grip and sticky Save/Cancel footer are used. Escape
closes the editor; arrow keys navigate tabs; validation opens the affected tab.
See [Grid and edit panel standards](grid-edit-panel-standards.md).

The Scope tab allocates a report to zero or more active organisation modules using
the shared module checklist. Allocations persist in `erp_report_module` and add
Defined reports to matching module menus. They do not grant execution access;
report/division permissions remain mandatory. Copies remap allocations by module
code where a matching destination module exists. Initialise Schema creates the new
allocation table; it does not seed report definitions.

Template example module allocations are defined by `reportSeeds[].module_codes`:
property reports use Property Management, Asset Management and Finance; customer
contacts use Sales and CRM; approved transaction lines and GL directory use Finance;
active Resources use Corporate Administration. Template seeding resolves codes to
organisation module IDs. Missing/inactive modules skip the example with a reason.
Re-seeding fills empty allocations for unchanged example definitions and preserves
nonempty administrator allocations and edited definitions. Clearing all allocations
on an unchanged example allows re-seeding to restore defaults. The report-definition helper grants no permissions; template role permissions are
seeded separately.

Template organisation seeding grants the ERP Administrator operational role wildcard
master-data/transaction management and organisation-wide GL, legal entity and
Resource access, plus individual Run/export grants for every existing report
(including inactive definitions). Root-division grants include descendants. Re-seed
the template to add grants for reports created later. This explicit role remains
`is_admin=false`; it does not gain Setup Administrator privileges. Other roles
receive no report permissions automatically. Required ERP Administrator defaults
are restored to inherited, unexpired grants on re-seeding.

Menus list each active, accessible report by name. Module menus use Scope allocations;
role menus use individual role grants independently of module allocation; the technical
Reports group lists accessible reports. Each link selects its report in the runner.
The generic Defined reports link is removed. Server execution permissions still apply.

The Columns tab uses an editable grid. Row order is report/export column order;
Up/Down reorder rows, Remove deletes a column, and blank headings use field labels.

Filters and user parameters use a shared editable grid: Field, Condition, Input,
Fixed value, Parameter key, Parameter label, Required and Actions. Parameter
configuration remains on the condition row; irrelevant controls are disabled to
preserve column alignment. Blank/not-blank conditions disable both input variants.
Sorting uses a Field/Direction/Actions grid; Up/Down specify sort priority.
Both tables scroll horizontally on narrow screens and retain saved definitions.
