# Administrator-defined reports: design specification

Status: first release implemented, 2026-10-05. This document records the design;
see [the implemented report builder](report-builder.md) for the workflow, current
capabilities, limitations and deployment steps. The project database has not been
migrated by this work.

## Agreed requirements

- Reports are first-class objects. Each saved report is an implementation of the
  Report class, with its own identity and role grants.
- Administrators create and maintain definitions in Setup.
- Organisation and division are permanent, required execution parameters.
- Divisional permissions apply to report execution.
- A report grant can expose its defined data even when the user cannot access
  the underlying records or transactions directly.
- Available sources include schema-based object types, custom fields and child
  collections, transactions/journals, GL accounts and Resources.
- Results are flat tables with Excel exports.
- Reports query current saved data at execution time and accommodate typed user
  parameters, including reporting dates. Historical object snapshots are not
  an agreed source.

## Permission boundary

Introduce resource_kind `report`, with resource_code identifying the saved
report by immutable report ID. Report code/name are editable identification
fields, not the permission identity.

Resolve grants across currently valid user-role assignments and valid role
permissions in the selected organisation. Respect active roles, exact division
grants, ancestor division grants and applies_to_children using the existing
permission convention. A grant for another report or organisation does not
authorize execution. Administrator maintenance follows the existing
organisation-specific Setup administrator rule.

Underlying object/type/transaction permissions do not limit columns and rows
explicitly exposed by an authorized report. Direct record endpoints retain their
existing permissions. Report execution and export must use the same authorization
and data-scope implementation. Parameter lookup lists are also part of this
boundary; existing master-list endpoints cannot simply be reused for report-only
users without considering what they expose.

Never let callers submit a replacement report definition, additional columns,
relationships or arbitrary filters to the execution endpoint. Read the saved
definition on the server. Runtime parameter values may narrow its fixed scope,
never override it. Always bind tenant, organisation and permitted division scope
on the server, including related records and child collections.

If child divisions are included, authorize each returned division for that
report; permission to run at a parent division alone must not bypass a grant
whose applies_to_children is false. Validate division membership before using
administrator permission shortcuts.

## Shared implementation

Use one centrally maintained dataset catalogue and query compiler for definition
validation, designer choices, preview, execution and export. Schema fields come
from the active type's schema_json; do not duplicate schema definitions or create
a separate UI schema. Built-in fields come from explicit server-side dataset
metadata rather than exposing every database column.

Suggested definition storage: erp_report with report_id, tenant_id,
organisation_id, report_code, report_name, description, definition_json,
definition_version, is_active and creation/update actor and timestamps. Any future
report-data schema remains distinct from the configuration of the report engine.

The declarative definition contains a primary dataset, optional type restriction,
ordered columns and headings, mandatory filters, typed user parameters, sort
rules and any supported grouping/aggregation. SQL identifiers, relationships,
operators and conversions are allowlisted. Values use bound query parameters.

Choose one explicit row grain: parent record, one child collection row,
transaction header or transaction line. Parent fields may accompany child rows.
Multiple one-to-many collections must not be freely joined, because that
multiplies rows and distorts totals. Reference label lookups must follow explicit
relationships and scope rules. Unsupported combinations should fail validation.

In the current implementation, transaction instances use erp_journal and their
lines use erp_journal_line. Present transaction headers and transaction lines as
distinct datasets; do not duplicate Transactions and Journals as unrelated
sources. Transaction types remain setup definitions.

## Dates and realtime execution

Realtime describes when data is queried; it does not force a filter to today's
date. Administrators map date parameters to specific dataset fields. A transaction
date range can select earlier postings from today's saved data.

Do not implicitly equate transaction dates, fiscal periods, observation dates,
effective periods and record-version capture times. Effective-on-date and latest
observation rules require explicit supported semantics. Plain date-field filters
do not reconstruct historical master data.

Browser execution should paginate deterministically. Excel export should run the
same definition and parameters and disclose any enforced size limit rather than
silently truncate. A new run/export may differ if saved data changes between them;
do not promise a shared snapshot without implementing one. Preserve decimal and
currency precision and prevent spreadsheet formula interpretation of text.

## Confirmed scope for organisation-level sources

GL accounts have no owner_division_id. Resource master records also have no
owner division; their assignments can supply division context.

A division-scoped report grant permits all organisation-level GL account and
Resource master records, including unused accounts and unassigned Resources.
Division-owned records, financial activity and assignments to division-owned
records remain filtered to authorized divisions. Selecting a module does not
grant a report; roles assign individual reports in a dedicated Reports tab.

## Integration and verification requirements

Extend the database resource-kind constraint, role editor, role save validation,
permission labels, navigation and runtime access checks together. Ensure report
grants remain available for users with no source-record permission.
Non-administrator roles retain the required module assignment, but report
execution does not check module membership. Existing non-report module access
checks remain outside this change.

Organisation setup copying copies selected report definitions and remaps report
grant IDs by report code. Copies remain inactive until administrator review;
fixed record-ID filter values are not automatically remapped.
Schema initialization must preserve report permission rows on repeated runs.

Verify cross-tenant/organisation denial, missing and foreign division denial,
report-only access, inherited and non-inherited division grants, combined roles,
expired grants, inactive definitions, parameter tampering, schema drift, child
row counts and totals, query injection rejection, pagination and export parity.
Run meaningful browser and isolated database checks before declaring the
runtime implementation complete.
