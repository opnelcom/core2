# Data Migration

Data Migration is a standalone Core Runtime service at `/migration/`, with a static
Tools → PostgreSQL → Generate INSERT statements menu. Add future tools to the menu
registry in `Volumes/Core-DataMigration/public/app.js` and supply their view/controller.
Its expandable connection form and source explorer are a utility workflow, not ERP
record grids or edit panels. No ERP shared rendering rules are changed.

[Core Database Management](database-management.md) uses a separate copy of this
design and PostgreSQL generator with tenant-saved connection selection. Both apps
have their own assets and helpers and can run independently. This app retains its
direct connection-entry workflow.

## Installation

The service needs no database, schema, session secret, or Broker configuration.
It uses the existing runtime's `pg` dependency to connect directly to the entered
source. Identity and application permissions are checked on every request through
Core SaaS HTTP APIs. The source hostname is resolved from the application container,
not the user's browser; its PostgreSQL port must be reachable from that container.

New SaaS database installations register the launcher tile through
`Volumes/Databases/Core-SaaS/Init/002-data-migration.sql`. On existing installations,
run that idempotent SQL file against the **existing SaaS database**, or add an active
public application in Administration with code `core-data-migration`, name
`Data Migration`, and route `/migration`. Allocate it to the relevant tenants/users
using the existing application controls. This is launcher registration, not a new
database or Broker entry.

Start `core-data-migration` and recreate/restart `core-gateway` with the updated
Compose and gateway configuration. The runtime image already includes PostgreSQL
support. No additional dependency installation is needed.

## Behaviour

- Connect using host, port (5432 initially), database, username and password.
  TLS defaults to certificate and hostname verification. Disabled TLS is available
  for sources that do not support it; unverified encrypted TLS is not offered.
- Credentials are held only in the current page's memory. The password input is
  cleared after successful connection. Credentials are sent in POST bodies and are
  not stored in cookies, browser storage, server sessions, or application logs.
  Disconnect, page exit, refresh and connection edits clear the source state.
- Browse expandable schemas, tables and columns with PostgreSQL types in brackets.
  Only ordinary/partitioned user tables and columns the source user can SELECT are
  listed. Views and system schemas are excluded. PostgreSQL row security and source
  privileges apply. Generated columns appear disabled and are omitted from INSERTs.
- A table checkbox selects all available non-generated columns. Partial selection
  displays an indeterminate checkbox. Search filters the tree without losing
  selection; generation includes selections hidden by the search.
- Preview generates up to 100 INSERTs **per selected table**, detecting extra rows
  and reporting truncation. Generate all rows explicitly reads every visible row.
  Each request uses its own repeatable-read, read-only transaction; preview and full
  generation can therefore reflect different snapshots. Row order is unspecified.
- Each selected non-generated column offers Source value (default), Fixed value,
  or NULL. Fixed values replace that column in **every** exported row in both preview
  and full generation. Enter raw PostgreSQL input text without SQL quotes, e.g.
  `42`, `2026-10-07`, `{"enabled":true}` or `{one,two}`. Empty fixed text is an empty
  string, distinct from the NULL choice; the text `NULL` is also a literal value.
  Values are bound parameters, cast to the catalog datatype and serialised by the
  server before generation, even for empty source tables. Invalid datatype input
  reports the column and stops generation without returning partial SQL. PostgreSQL
  cast behaviour applies, including numeric rounding and varchar length truncation.
  NULL is allowed even when the source column is required, because target constraints
  may differ; the target can reject it. SQL expressions are not evaluated.
  Replacements affect generated SQL only; source records are never updated.
  The overwrite choice and fixed-value input sit beside the column name in the same
  row. Long labels wrap; the source explorer scrolls horizontally when the controls
  cannot fit, including narrow screens.
  Deselecting a column retains its setting but excludes it from generation; changing
  a selection or replacement clears previous output. Disconnect/reconnect clears
  replacement settings. No stored-value conversion or database migration is needed.
- Identifiers are quoted and source schema/table names are preserved. PostgreSQL
  itself converts values to typed SQL literals, retaining numeric precision,
  timestamp precision, binary data, arrays, JSON and schema-qualified custom types.
  NULL remains NULL. Always-generated identity columns use OVERRIDING SYSTEM VALUE.
  All generation runs server-side; no SQL is executed against a target database.
- Select any text in the read-only SQL area and use Copy selection, or Select all /
  Copy all. Download SQL saves the generated statements. Clipboard permission errors
  leave text selected for keyboard copying.

## Limits and execution considerations

Full generation uses cursor batches of 250 rows rather than loading source records
all at once. The final SQL is buffered for the selectable text area and limited to
50 MiB by default; exceeding the limit fails the whole request without returning a
partial script. Select fewer tables/columns for larger sources. Configuration also
sets a 60-second timeout per PostgreSQL statement and a 10-second connect timeout.
Up to 500 tables may be selected per request. Cancellation stops the browser request;
the server-side operation may continue until completion or timeout, then closes its
connection. No remote credentials are retained after a request completes.

The target must already contain compatible schemas, tables and types. Omitted
required columns may need defaults. Foreign-key ordering, dependency sorting,
conflict resolution, target mappings, sequence resets, schema creation, extensions
and target execution are outside this first tool. Selecting both a partitioned
parent and its child can export the same records twice. INSERTs preserve source
identities; sequences may need to be advanced separately after loading. Review
the generated script before using it on a target.

## Verification

`node --test Volumes/Core-DataMigration/test/*.test.js`

`node Volumes/Core-DataMigration/test/browser.js`

Optional isolated PostgreSQL-engine round-trip:
`node Volumes/Core-DataMigration/test/database.js` with `@electric-sql/pglite` on
`NODE_PATH`. It verifies values and generated SQL without a live database.

The browser fixture uses real app HTML/CSS/JavaScript and mocked HTTP responses.
Live source verification requires a reachable PostgreSQL source and the running
SaaS/gateway services; mock tests do not establish live connectivity.

Change history: 2026-10-07 — initial PostgreSQL INSERT tool and standalone menu.
2026-10-07 — added per-column fixed typed values and explicit NULL replacements.
2026-10-07 — aligned overwrite controls beside column names.
