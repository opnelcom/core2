# ERP Schema JSON — version 1

Last checked against implementation: 2026-10-11.

This document defines the project's custom schema convention. It combines data
attributes, validation and presentation in one JSON object. It is inspired by
JSON Schema, but custom types and partial keyword support mean it is **not a
complete implementation of standard JSON Schema**. Version 1 is a documentation
designation; there is no runtime schema-version negotiation or required version
property today.

## Initialisation operations (2026-10-11)

- **Initialise Schema** performs structural DDL and compatibility migrations only. It does not read template JSON, seed workflows, initialise organisations or update custom type schemas.
- **Initialise Template Org** creates or reuses **TEMPLATE ORG** (code TEMPLATE) and resets JSON-defined configuration, schemas and mappings from the single template-defaults.json. Existing organisation/definition IDs and business example records are preserved. Other organisations are unaffected.
- **Initialise Template Org Example Data** asks for confirmation, then adds missing JSON example records to TEMPLATE ORG. Existing records are preserved, including edits. Run template definition initialisation first.

All scenarios share the same class-based seed path. No tour/insurance addon seeder is installed. Currencies, countries, taxes, chart of accounts, workflow paths, reference vocabularies, fiscal configuration and report definitions are setup configuration; legal entities, subledger accounts, accounting objects and guide Resources in exampleData are loaded only by the example-data action.

Record-dependent defaults live in exampleDataBindings. Template definitions use captured classifications without referring to example records; after adding example data, the example action binds the configured example defaults. Resets preserve examples; new mandatory schema fields can therefore make an existing example invalid, and the user must edit it separately.

Template actions are planned and validated in ERP, then submitted through the
generic Core-Broker SQL batch endpoint. The batch locks affected tables and
verifies preparation inputs before writes, with administrator checks, confirmation
and atomic rollback. Broker does not import or dispatch ERP code. See
[ERP transaction batches](transaction-batches.md). This architecture correction
does not change the schema convention or stored example values. No live
initialisation was performed during this cleanup.

## Scope and template examples

Subledger account types, accounting object types and accounting dimension types
store their definitions in `schema_json`. Record values are stored in
`additional_data`. Built-in fields such as code, name and owner division remain
outside the custom schema. An object class's purpose is not changed by its schema.
Built-in record codes can use manual entry or independent per-type sequential
numbering, configured outside `schema_json`; see [Record code numbering](code-numbering.md)
for constraints, migration and template recommendations.
Transaction posting rules remain separate line definitions; this convention does
not automatically configure transaction capture headers or posting rules.

The template organisation is a recommended starting configuration and a collection
of business scenarios, not a universal business policy. Refer to
[`template-defaults.json`](../../Volumes/Core-ERP/seeds/template-defaults.json):

- `ledgerFamilySchemas.bank`: bank codes, names and account information.
- `ledgerFamilySchemas.asset`: whole-number useful-life months and currency residual value.
- Asset `location` is a reference to a Property accounting object (`target.class:
  "accounting_object"`, `target.types: ["property"]`), storing its UUID. This is a
  template recommendation; organisations can choose a different location model.
- `ledgerFamilySchemas.loan`: currency principal and decimal interest rate.
- `accountingObjectTypeMetadata.contract.schema_json`: contract references, dates and value.
- Property demonstrates market-value observations, grouped measurement periods and feature counts without periods.
- Utility Meter demonstrates cumulative readings, reading methods and meter events; no consumption calculation is performed.
- Measurement Type, Measurement Unit, Property Feature Type and Valuation Method are seeded accounting dimension types used as shared reference vocabularies.
- Tour Management demonstrates tour definitions/itineraries, dated scheduled/private
  departures, guide Resource profiles, vehicle/asset links, booking manifests and
  manual payment rows, job-card allocation grids, and quotes/invoices with price
  lines. See [Tour management](tour-management.md) for its seed configuration and
  stored example totals; no tour-specific actions calculate totals, reserve resources or post invoices.

Seed choices such as text limits, positive amounts and field widths are examples;
they are configurable. The underlying type and attribute validation is an
application rule. Legacy `ui_schema_json` values remain stored and submitted for
API compatibility, but do not drive the generated forms or have editable fields.

## Root definition

| Attribute | Convention and current behaviour |
| --- | --- |
| `type` | Use `"object"` for the root. Record data must be a JSON object. |
| `properties` | Object mapping stable field keys to field definitions. Direct properties generate controls; a grid's rowSchema properties generate its columns. |
| `required` | Array of field keys. Missing, `null` and empty-string values fail server validation. `false` and zero are valid present values. |
| `additionalProperties` | `false` rejects unconfigured keys on the server. Omitted or true does not reject extra keys. |
| `tabs` | Ordered array of `{ "label": "…", "fields": ["fieldKey"] }` describing custom field tabs. |

Use meaningful camelCase property keys and human-readable titles. Renaming a key
changes the storage key and requires a compatibility decision. Avoid putting a
field in multiple tabs: this can create duplicate controls and ambiguous collection.

## Field types and storage

| `type` | Control | Collected JSON value |
| --- | --- | --- |
| `short_text` | Compact text input by default | String |
| `text` | Text input | String |
| `long_text` | Textarea | String |
| `integer` | Number input, step 1 | Number; server requires a safe whole integer |
| `number` | Number input, arbitrary step unless configured | Finite number; legacy/general numeric type |
| `decimal` | Text input with decimal keyboard and precision validation | Normalised decimal string |
| `currency` | Decimal input; pads fractional places on display/blur | Normalised decimal string |
| `boolean` | Checkbox | Boolean; missing initial value displays false |
| `date` | Date picker | `YYYY-MM-DD` string |
| `date_time` | Local date/time picker | Date/time string; no automatic timezone conversion |
| `email` | Email input | String |
| `url` | URL input | String; server permits HTTP/HTTPS URLs |
| `select` | Dropdown when non-empty `options` or `enum` is provided | String code |
| `reference` | Selector listing accessible ERP records | Stable UUID string, not the displayed name |
| `grid` | Add/remove rows with ordinary field controls as columns | Array of row objects under the grid field key |
| `object`, `array` | Raw JSON textarea, not nested generated forms | Parsed JSON object or array |

Optional empty numeric/decimal controls collect `null`; text-like controls collect
`""`. Raw object/array fields parse JSON; server validation currently checks their
outer type only. The form uses saved values first, then a field's `default`, then
false for boolean or an empty value. Defaults are a form convenience, not a
server-side mechanism for populating missing properties.

### Decimal and currency conventions

`precision` counts total digits; `scale` counts fractional places. Defaults are
14 and 2 for both types. `precision: 14, scale: 2` allows 12 digits before the
decimal, up to `999999999999.99`. Definition validation permits precision 1–38
and scale 0 through precision minus 1. Fractions beyond the scale are rejected,
not rounded. A minus sign is allowed unless `minimum` prohibits negative values.

Use ungrouped decimal text such as `"12345.60"`; commas and currency symbols are
not accepted in the input. `currencyCode: "ZAR"` appends the code to the field
label. It does not convert currency, enforce an ISO code, select another field's
currency or store a currency alongside the amount automatically.

The UI stores decimal/currency values as strings to preserve cents. The server
also accepts legacy numeric values if they satisfy precision/scale. Bounds use
JavaScript numeric comparison; arbitrary-precision arithmetic and exact bound
comparison at very high precision are not implemented.

## Field attributes

| Attribute | Effect and validation |
| --- | --- |
| `title` | Label; omitted titles are derived from the property key. |
| `default` | Initial form value only when saved data has no such key. |
| `maxLength`, `minLength` | Non-negative integer text limits; enforced on strings by the server and supported text controls by the browser. Lengths use JavaScript UTF-16 string length. Optional blank values skip value validation. |
| `pattern` | Regular-expression string; server matches the whole value. JSON backslashes must be escaped. Browser pattern support can differ from the server's JavaScript engine. Decimal/currency controls use their generated precision pattern instead. |
| `minimum`, `maximum` | Finite numeric bounds for integer, number, decimal and currency. Minimum cannot exceed maximum. |
| `precision`, `scale` | Decimal/currency limits described above. |
| `options` | Prefer string codes: `[{"code":"active","description":"Active"}]`. Alternative `value`/`label` keys and scalar options are supported. |
| `enum`, `enumNames` | Alternative allowed values and corresponding display labels. Use one choice convention per field. |
| `sortOrder` | Optional non-negative integer; ascending presentation order for ordinary fields and grid columns. Ties use field key; omitted values appear last, ordered by key. Explicit tab `fields` arrays retain their order. |
| `uiWidth` | `short`, `medium`, `wide`, `full`; presentation only. |
| `rows` | Positive integer initial textarea height in text lines; default 4. Applies to independent fields and grid columns, including previews. Schema textareas use a 34px minimum rather than the global 160px minimum. Users can resize vertically; rows does not limit stored text. |
| `placeholder` | Input example; not a value or default. |
| `helpText` | Tooltip and inline help for ordinary inputs/textareas. Dropdowns and checkboxes currently do not render inline help. |
| `description` | Tooltip fallback when `helpText` is absent; distinct from a stored description field. |
| `currencyCode` | Currency label suffix; presentation only. |
| `step` | Browser increment/validity for `number`; integer always uses 1. Server does not validate step multiples. |
| `target` | Required for references: ERP class and optional permitted type codes, or `anyOf` alternatives; selection is permission-checked. |
| `referenceSource` | Optional reference membership rule: root reference `field`, saved referenced record `grid`, and reference `column`. Applied by UI and server. |
| `rowSchema` | Required for grids: ordinary field definitions and row validation rules. |
| `periodControl` | Optional grid date mappings, grouping columns and overlap policy. |
| `uniqueBy` | Optional grid column combinations that must be unique, independent of dates. |
| `minRows`, `maxRows` | Optional non-negative grid row-count limits. |
| `x-searchable`, `x-reportable`, `x-listView` | Used by the shared top-level search extraction helper. Do not imply automatic search, reporting or list columns in every consumer. |

Non-empty choices render a dropdown regardless of the underlying type. Optional
dropdowns have a blank “None” option. The server validates configured options and
enum values using strict equality; string codes avoid number/string mismatches.
Using both options and enum imposes both server constraints. A `select` without
choices falls back to a text input; do not rely on that as a configured dropdown.

## Layout and rendering

Fields follow tab order and each tab's `fields` order. Unknown field names and
empty tabs are ignored. Unassigned properties are collected into a final
“Details” tab in sortOrder order (field key breaks ties). Without configured tabs, properties use that
default section. Label/title/name are accepted as tab caption aliases.

The fixed record tab is “Identification”. Custom tabs appear alongside it,
Resources and any Documents tab supported by that class. A custom tab named
“General” is displayed as “Type details” to distinguish it from built-in fields.

The standard record editors and type previews show one label/field pair per row,
with labels on the left and a 160px label column plus a 16px gap. Controls have
maximum widths of 180px (short), 340px (medium), 500px (wide), or the available
field-column width (full). They shrink to fit available space. Width is separate
from `maxLength`; text limits do not automatically calculate visual width.

Absent `uiWidth`, short_text defaults to short, long_text/textarea to full, and
other types to medium. Labels stack above controls at viewport widths of 600px
or less. Other consumers of the renderer may use different grid placement;
check their CSS before claiming these editor dimensions apply everywhere.

Subledger, accounting object and accounting dimension record editors have a
bottom-left resize handle in their action footer. Drag it to change width and
height, or focus it and use arrow keys (20px steps; Shift uses 50px). The panel
stays anchored on the right and is constrained to the available view and
viewport. Internal content scrolls. Sizing is runtime only and resets when the
editor closes or reopens; no user preference or schema attribute is stored.
Resizing vertically keeps the title, tabs, fields and action footer at their
natural heights with standard 20px gaps. Spare height remains below the content
rather than stretching the rows. Labels and controls in these three record
editors align at the top, including multiline fields. Tab strips and their
content panels also align at the top; increasing panel height does not centre
them vertically.

Type editors provide a disabled live field preview. JSON parse errors are shown
there; a successful preview does not establish that the definition or existing
record values pass server validation. Empty schemas expose an “Additional data
JSON” editor on records; this is not a nested form designer.

## Schema UI Tester

Setup → Accounting Model → Schema UI Tester accepts schema JSON and renders
interactive custom fields, tabs and grids using `renderSchemaDetailFields`, the
same renderer as object editors. Click Render preview after changing the JSON;
rendering resets preview values. Clear removes both input and preview. Invalid
JSON or rendering errors clear the previous preview and show a message.

This is visual testing only: no type definitions, records, versions or preview
values are saved. No save endpoint or browser storage is used for tester contents.
Navigating away retains the current DOM until reload/Clear. Reference selectors
perform permission-checked GET lookups in the active organisation; they do not
write records. Saved-grid membership references can be exercised by selecting
an accessible saved parent object in the preview.

The tester renders custom schema fields, not built-in Identification, Resources,
Documents or Versions panels. It does not validate server constraints, post
transactions or prove that a schema will pass definition/record validation.
The menu uses the existing Setup administrator visibility rule.

## Grids and reference columns

A grid defines `type: "grid"`, a title, `uiWidth: "full"` and `rowSchema`.
The row schema declares `type: "object"`, `properties`, `required` and
`additionalProperties`. Each property becomes a column and uses the same types,
choices, length limits, precision, bounds and defaults as an ordinary field.
Row-specific required values apply only to rows the user adds. Grids are optional
unless the parent schema requires them; an empty array is valid unless `minRows`
requires rows. `minRows`/`maxRows` are optional non-negative limits. Nested grids
are not supported. Raw `object`/`array` columns remain JSON controls.

The editor holds ordinary fields and all grid rows in one form. Add/remove and
cell edits change the draft only. There is no row Save endpoint. The parent Save
validates everything before one database transaction writes the record, resource
assignment changes, reporting projections and complete object snapshot. A failed
write rolls back all of these. Errors identify the grid, row and column or the
conflicting row numbers. Decimal/currency columns retain exact decimal strings.
Large tables scroll within their grid; ordinary field labels remain on the left.
Type previews and historical snapshots disable editing and row actions.

`reference` fields require `target.class`: `resource`, `accounting_object`,
`accounting_dimension`, `subledger_account`, `gl_account` or `legal_entity`.
Optional `target.types` restricts selection to type codes (resource types for
Resources, entity types for Legal Entities). Selection lists any accessible
record in the same tenant and organisation, regardless of the parent division;
server saves recheck existence, class/type and permissions. The renderer shows
a single dropdown with all eligible records, without a separate search box or
a 100-candidate cap. The API retains its optional search parameter for callers.
Normal lists omit inactive
Resources and deleted/archived/blocked records. An accessible existing selection
can be retained when inactive; deleted or inaccessible targets fail Save.
Names displayed by selectors are current names, not historical label snapshots.
References do not create permissions or financial postings.

### Mixed references and saved-grid membership

A reference may use `target.anyOf` to offer different classes in one selector:

```json
"item": {
  "type": "reference", "title": "Insured item", "sortOrder": 10,
  "target": { "anyOf": [
    { "class": "subledger_account", "types": ["asset"] },
    { "class": "accounting_object", "types": ["property"] }
  ] },
  "uiWidth": "wide"
}
```

Single-class references still store a UUID string. Mixed references store
`class:UUID`, such as `subledger_account:...`. The class prefix prevents ambiguity
and is required on Save. Neither names nor source organisation IDs are stored as
substitutes for the reference. These are ERP extensions, not general JSON Schema
`anyOf` validation rules. `target.class` and `target.anyOf` cannot be combined.

For a claim affected-item column, add:

```json
"referenceSource": {
  "field": "policy", "grid": "insuredItems", "column": "item"
}
```

`field` must name an independent/root reference to a single versioned class
(accounting object, dimension or subledger). Its saved record must be readable.
Only accessible target records whose stored reference value occurs in that saved
grid column are offered/accepted. Changing the parent selection refreshes dependent
selectors. A previously selected item that is no longer eligible remains marked
unavailable; Save rejects it. The source must be saved first. This rule does not
filter by incident date, close periods, calculate coverage or reserve claim amounts.
There is no unlisted-item exception workflow in this first implementation.

Organisation copies remap schema references in ordinary fields and recursively
in grid rows using reusable ERP server code (`copy-schema-references.js`), matching
class, type code and record code. ERP allocates IDs for new destination records
before transformation and retains IDs of matching existing records. Preparation
inputs are rechecked under table locks before the atomic copy batch writes through
the generic Broker endpoint. References with no
matching destination record are cleared to null; copy the relevant master records
or reselect them afterwards. Copied grid projections are rebuilt for reporting.
Copying does not clone version history; normal Save establishes the destination's
history. Mixed references and single-class references retain their respective formats.

Initialise Schema removes the retired `erp_remap_schema_references(jsonb,jsonb,jsonb)`
function from existing databases. Fresh schemas do not create it. Stored values
do not require conversion; copies keep the existing UUID and `class:UUID` formats.
Deploy the updated ERP server before applying this cleanup. Division creation/copying
still precedes the main guarded record batch; this change does not make those
earlier division writes part of the atomic record batch.

### Optional period control

Grids without `periodControl` have no effective-period validation, even when
they contain dates. Market valuations and meter readings are dated observations;
property features have no dates. Measurements and fixed contract charges use
explicit period control:

```json
"periodControl": {
  "from": "effectiveFrom",
  "to": "effectiveTo",
  "groupBy": ["dimensionType"],
  "allowOverlap": false
}
```

`from` and `to` must name different `date` columns. Start dates are required for
every period-controlled row. End dates may be blank/null/absent, meaning
indefinitely. Both endpoints are inclusive; an end cannot precede its start.
`groupBy` must name columns; an empty array groups the whole grid. Different
groups can overlap. `allowOverlap: false` rejects overlaps within a group;
omitted/true permits them. Gaps are permitted. Previous periods are never
automatically closed. Optional `uniqueBy: ["columnKey"]` prevents duplicate
column combinations independently of period control.

### Example: property measurements and features

```json
{
  "type": "object",
  "properties": {
    "measurements": {
      "type": "grid", "title": "Measurements", "uiWidth": "full",
      "periodControl": { "from": "effectiveFrom", "to": "effectiveTo", "groupBy": ["dimensionType"], "allowOverlap": false },
      "rowSchema": {
        "type": "object",
        "properties": {
          "dimensionType": { "type": "reference", "title": "Dimension type", "target": { "class": "accounting_dimension", "types": ["measurement_type"] }, "uiWidth": "medium" },
          "effectiveFrom": { "type": "date", "title": "Effective from", "uiWidth": "short" },
          "effectiveTo": { "type": "date", "title": "Effective to", "uiWidth": "short" },
          "quantity": { "type": "decimal", "title": "Quantity", "precision": 14, "scale": 4, "minimum": 0, "uiWidth": "short" },
          "unit": { "type": "reference", "title": "Unit", "target": { "class": "accounting_dimension", "types": ["measurement_unit"] }, "uiWidth": "medium" }
        },
        "required": ["dimensionType", "effectiveFrom", "quantity", "unit"],
        "additionalProperties": false
      }
    },
    "features": {
      "type": "grid", "title": "Features", "uiWidth": "full",
      "rowSchema": {
        "type": "object",
        "properties": {
          "featureType": { "type": "reference", "title": "Feature type", "target": { "class": "accounting_dimension", "types": ["property_feature_type"] }, "uiWidth": "medium" },
          "value": { "type": "integer", "title": "Value", "minimum": 0, "uiWidth": "short" }
        },
        "required": ["featureType", "value"], "additionalProperties": false
      }
    }
  },
  "required": [], "additionalProperties": false
}
```

Reference values are the selected records' UUIDs. This example intentionally
omits uniqueness on features; duplicate types are permitted unless configured.

## Whole-object data versions and reporting

Versioning applies to the record Save endpoints for subledgers, accounting
objects and accounting dimensions. Each successful Save captures the complete
persisted row (including `additional_data` and every grid), the schema at that
Save, resource assignments, actor and capture time in `erp_object_data_version`.
Versions are append-only through these APIs; there is no per-grid-row revision
system, restore action or concurrency/locking feature. Saving unchanged values
also creates a version. Workflow actions and document uploads have their own
histories and are not captured as new data versions by this implementation.

New records begin at version 1. The first edit of an existing unversioned record
captures a baseline before the update, then the updated version in the same
transaction. The baseline capture time is not its historical creation time;
changes made before versioning cannot be reconstructed. Baselines capture the
schema available at capture time. The Versions tab provides read-only snapshots
using their saved schemas. API access checks current and historical owner/type
permissions before returning snapshots.

The canonical grid arrays remain in `additional_data` so the form and full
snapshot preserve one complete data payload. `erp_schema_grid_row` contains
transactionally maintained child rows for reporting; it is not a separate edit
workflow. `erp_schema_grid_report` joins each row to its current parent's code,
name, division, type and custom data. Each grid is a separate dataset: combining
several grids requires explicit joins/aggregation to avoid multiplying rows.

`GET schema-records/grid-data?organisation_id=...&object_kind=accounting_object&field_key=measurements&as_at=2026-09-30`
returns accessible current rows. `as_at` applies only to grids with period
control; observation grids are not automatically reduced to their latest value.
Optional `object_id` and `type_id` UUID filters restrict the dataset to a parent
record or object type.
The API returns pages of up to 100 scanned rows with `next_offset`; permission
filtering can produce shorter or empty pages, so continue until `next_offset` is
null. Reference values in reporting data are IDs and can be joined to permitted
reference datasets. The separate [administrator report builder](report-builder.md)
provides flat reports over current canonical grids with report-specific division
grants; it does not change this endpoint's record permissions. Automatic
valuation/consumption/billing calculations are not implemented. Historical rows are available through
version snapshots rather than this current-row endpoint.

Deploy the code and run **Initialise Schema** before using the new Save paths.
It creates the version/projection tables and view, adds the four reference types
and example records to template organisations, and appends missing seeded grids
and tabs there. Existing grid definitions/custom tabs are preserved. Existing
non-template schemas are not given new grids; future copies of the updated
template inherit them. Existing non-template roles are not granted new type
permissions automatically. Record versions start on the next supported Save;
records written by imports/direct SQL do not automatically create versions or
reporting projections and must use the shared save mechanism if those behaviours
are required. Organisation copying rebuilds grid projections but does not copy
version history. Insurance and tour example creation use the shared save mechanism. Grids are optional, so existing empty custom data
remains valid. No existing single fields or stored values are removed.

## Example: contract commercial attributes

```json
{
  "type": "object",
  "tabs": [
    { "label": "Commercial", "fields": ["contractNumber", "contractValue", "termMonths", "notes"] }
  ],
  "properties": {
    "contractNumber": { "type": "short_text", "title": "Contract number", "maxLength": 30, "uiWidth": "short" },
    "contractValue": { "type": "currency", "title": "Contract value", "precision": 14, "scale": 2, "minimum": 0, "currencyCode": "ZAR", "uiWidth": "medium" },
    "termMonths": { "type": "integer", "title": "Term in months", "minimum": 1, "maximum": 600, "uiWidth": "short" },
    "notes": { "type": "long_text", "title": "Notes", "maxLength": 4000, "rows": 4, "uiWidth": "full", "helpText": "Describe any special terms." }
  },
  "required": ["contractNumber"],
  "additionalProperties": false
}
```

Example record values: `{"contractNumber":"LEASE-001","contractValue":"12345.60","termMonths":24,"notes":"Annual review."}`.
This combines supported attributes for illustration; use the actual contract
seed as the business starting point.

## Compatibility and limitations

- Legacy types `string` and `textarea` remain supported. Prefer the documented semantic types for new schemas.
- Legacy `format` values date, date-time, email, uri and textarea select specialised controls.
- Renderer aliases `uiType`/`x-ui-type` and width/ui-width variants exist, but server validation uses the declared `type`. Prefer explicit `type` and `uiWidth`.
- Nested validation is implemented for grid row schemas only. Arbitrary nested item/property validation, `$ref`, composition keywords, conditional schemas and a full JSON Schema dialect are not implemented.
- Unknown types/keywords are not comprehensively rejected by definition validation. Acceptance of JSON does not establish support.
- Boolean required means a value must be present, not that its checkbox must be checked.
- Adding required fields, shortening lengths, changing choices or renaming keys can invalidate existing records. Establish a migration before making such changes.
- Initialise Schema changes database structure only. Initialise Template Org resets JSON-defined template schemas and mappings. Initialise Template Org Example Data separately adds example records after confirmation; existing record values are not converted.

## Implementation and verification

### Canonical template authoring

Seeded schemas use semantic types without redundant legacy `format` aliases.
Define dropdown choices once, using `options` for code/label pairs or `enum`.
Provide explicit field titles and `uiWidth`, text length limits, decimal/currency
precision and scale, and multiline row counts. Declare root `type`, `properties`,
`required` and `additionalProperties`. Tab references must name existing fields
and must not repeat a field across tabs.

Empty schemas are valid, but validity alone does not establish business
completeness. Additional fields and mandatory values need business requirements
and compatible sample records. See the [template audit](template-schema-audit.md)
for the inventory, amendments and outstanding decisions.

| Responsibility | Source |
| --- | --- |
| Form controls, defaults, tabs, collection and type preview | [public/app.js](../../Volumes/Core-ERP/public/app.js): schemaFields, schemaTabs, renderDetailInput, applyDetailAttributes, collectSchemaDetail, installSchemaDesignEditors |
| Field widths and responsive rendering | [public/style.css](../../Volumes/Core-ERP/public/style.css) |
| Definition and record validation | [utils.js](../../Volumes/Core-ERP/api/_shared/erp/utils.js): validateSchemaDefinition, validateSchema |
| Type save validation | accounting-objects/save-type.js, accounting-dimensions/save-type.js, subledger-account-types/save.js under Volumes/Core-ERP/api |
| Record save validation | accounting-objects/save.js, accounting-dimensions/save.js, subledger-accounts/save.js under Volumes/Core-ERP/api |
| Seed upgrades | [schema-attributes.js](../../Volumes/Core-ERP/api/_shared/erp/schema-attributes.js), setup/schema.js |
| Seed definitions | [template-defaults.json](../../Volumes/Core-ERP/seeds/template-defaults.json) |
| Grid rules and reference validation | schema-grids.js, schema-references.js under api/_shared/erp |
| Atomic snapshots and reporting projections | object-versions.js under api/_shared/erp; schema/erp-schema.sql |
| References, version history and report datasets | api/schema-records/references.js, versions.js, grid-data.js |

Run from the repository root:

```powershell
node Tools/ERP/audit-template-schemas.js
node --test Volumes/Core-ERP/test/template-schema-audit.test.js
node --test Volumes/Core-ERP/test/schema-fields.test.js Volumes/Core-ERP/test/schema-renderer.test.js
node --test Volumes/Core-ERP/test/schema-grids.test.js
node --check Volumes/Core-ERP/public/app.js
git diff --check
```

Tests cover current seed definitions, renderer attributes, decimal boundaries,
record validation and preservation of custom schema settings. They do not replace
visual browser verification or a database migration check.

Optional integration checks under Tools/ERP-Acceptance/test:
`schema-grid-editor.browser.js` requires Playwright (set ERP_BROWSER_EXECUTABLE
for a system browser); `schema-grid-storage.database.js` requires PGlite and
uses an isolated PostgreSQL instance, never the project database. Make dependencies
available through normal package resolution or NODE_PATH. The database check
omits only pgcrypto extension installation; UUID generation uses PostgreSQL's
built-in function. It checks schema idempotency, all three class Save paths,
reference access, snapshots, baseline capture, period reporting and rollback.

## Maintenance and change history

- 2026-10-11: Moved organisation-copy reference transformation from PostgreSQL to
  reusable ERP server code. New record IDs are allocated before transformation;
  input snapshots are rechecked under locks in the final batch. Initialise Schema
  removes the retired function; existing stored reference formats are unchanged.

- 2026-10-11: Retained eight Tour Management schemas and draft examples as template recommendations only. Removed tour-specific server workflow and editor protections. Operational status, document links and monetary totals are ordinary schema data; no tour-specific automatic conversion, calculation, reservation or copy reset is applied. Shared example creation serves insurance and tours. See [Tour template seeding](tour-management.md).

- 2026-10-08: Changed the template asset `location` from free text to a single-class
  Property reference, retaining its key, title, width and tab placement. Full
  template definition initialisation applies the new definition; ordinary schema DDL preserves an
  existing explicit `text` type and does not migrate stored values. Before
  reseeding a template with existing asset locations, map each non-empty text
  value to an accessible Property record UUID in the same organisation, or clear
  it to null. Unmapped text fails reference validation on subsequent asset Save.
  No automatic text-to-property conversion or non-template schema change is made.

Schema or UI rendering changes must update this document in the same change,
including affected types, defaults, storage, examples, limitations and migration
instructions. Update tests and seeds where applicable. Link the relevant code in
the review description, and report any unverified browser/database behaviour.

- 2026-10-05: Added the separate administrator report builder and report resource
  permissions. It reads schema fields and one canonical child collection per
  dataset without changing schema conventions, stored values or existing grid
  endpoint access. See its guide for scope, date filters and export limitations.

- 2026-10-05: Added eight template report examples to demonstrate parent fields,
  child rows, fixed filters, typed parameters and controlled resource relationships.
  Report definition seeding runs through Initialise Template Org and resets JSON-defined reports and mappings. It is template-only. Initialise Schema does not seed reports. Existing
  custom schemas and values are unchanged; unavailable example fields are reported
  as skipped rather than altering schemas.
This rule is also mandatory in the repository's AGENTS.md.

- 2026-10-04: Added grid row schemas, optional grouped period/uniqueness rules,
  accessible ERP references, whole-object snapshots and current grid reporting
  projections. Expanded template examples to 31 types and 44 grids, with four
  shared reference vocabularies. Existing non-template schemas are preserved.

- 2026-10-04: Audited all 27 seeded custom-schema types (104 fields), removed
  20 redundant format aliases and three duplicate dropdown choice definitions.
  Added a reusable template audit and regression checks. Business enrichment of
  empty schemas remains pending requirements.

- 2026-10-04: Established version 1 documentation from the implemented renderer,
  validation and template seeds. Recorded decimal-string storage, supported
  layout attributes, legacy aliases and limitations.

### 2026-10-04 — Runtime editor resizing

Added shared pointer and keyboard resizing to the three object record editors,
with viewport bounds and reset on close/reopen. Schema and stored data are unchanged.

### 2026-10-04 — Resized editor whitespace

Object editor grid content aligns at the top so additional panel height does
not stretch the space between its title, tabs, fields and actions.

### 2026-10-04 — Reference dropdown simplification

Removed the separate reference search input in record fields and grid columns.
Dropdowns list all eligible accessible records; the lookup no longer truncates
at 100 candidates. Large lists may require a future searchable selector.

### 2026-10-04 — Explicit field ordering

Added optional `sortOrder` to the shared renderer and schema definition validation.
Editors, previews and historical schema rendering use the same rule. All seeded
custom properties and grid columns have explicit values in increments of 10.
Market values use valuationDate (10), amount (20), currencyCode (30), method (40),
valuer (50), notes (60). JSONB object key order is not a presentation contract.
Initialise Template Org resets seeded field and grid-column ordering from the JSON. Initialise Schema does not alter custom definitions. Non-template organisations are unaffected. Existing schemas without sortOrder use field-key order outside explicit tabs.
Run `node Tools/ERP/seed-template-sort-order.js` after adding seed fields, and
update explicit ordering deliberately when changing an existing recommended order.

### 2026-10-04 — Textarea rows height

Schema-generated textareas now respect rows without the global 160px minimum
overriding it. The shared control styling applies in grids, independent fields,
type previews and historical snapshots.

### 2026-10-04 — Insurance template and reusable references

Added policy/claim accounting object types, cover/cause dimensions, six insurance
GL accounts, nine transaction types, required transaction object classifications
and reference examples. Template upgrades are additive and preserve existing
non-template organisation configuration. Added mixed-class references, saved-grid
membership filtering/validation and schema-aware organisation-copy remapping.
Transaction Save/posting also check consistency of jointly captured accounting
objects against their single-class root object reference fields with explicit
target type codes (for example a claim and its policy).
See [Insurance management](insurance-management.md) for workflow, postings and limitations.

### 2026-10-04 — Insurance module separation

Seeded insurance object/dimension/transaction types now belong exclusively to
Insurance Management. Additive template updates move existing insurance-specific
mappings out of other modules without changing non-template organisations or
shared asset/property/vendor type mappings. No schema attributes changed.

### 2026-10-04 — Setup Schema UI Tester

Added a runtime-only interactive schema sandbox using the shared renderer.
No database schema, seeding or save behaviour changed.

### 2026-10-05 — Edit field alignment

Sub-ledger, accounting object, accounting dimension and report editors use
caption-left/control-right field rows at desktop and narrow widths. Captions and
controls align at the top; help text stays beneath controls in the right column.
Semantic field widths and child grid cells retain their existing rules. This is
presentation only, with no stored-value or seed-schema migration.
See [Edit panel standards](grid-edit-panel-standards.md).

### 2026-10-05 — Shared field captions and required markers

Built-in and generated fields in the four record/report editors use the central
caption helper. Required markers stay inside captions and controls share the
caption row. Report hints align under controls; checkbox checklists and child
grid cells retain their presentation. This is presentation only: stored values
and seeds are unchanged and no migration is required. See the grid/edit panel
guide for the production-helper browser checks.


### 2026-10-05 — Built-in record code numbering

Added shared manual/automatic code assignment settings on the Definition tab of
all four object type classes, with inclusive ranges, optional prefix and padding.
Automatic record code inputs are read-only; existing codes are not converted.
Custom schema rendering and seed codes are unchanged. See [Record code numbering](code-numbering.md)
for transactional allocation, GL uniqueness, exhaustion and compatibility.

### 2026-10-05 — Reusable ordinary field rows

`.erp-field-rows` extends the existing caption/required-marker convention to
ordinary forms, first used by fiscal year and period setup. The shared schema
renderer, grid cells, stored values and seed definitions are unchanged. See the
[grid/edit panel guide](grid-edit-panel-standards.md) for fiscal UI behaviour.
