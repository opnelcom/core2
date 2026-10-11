# ERP record code numbering

Implemented 2026-10-05. Each GL Account Type, Subledger Account Type, Accounting
Object Type and Accounting Dimension Type has **Record code assignment** on its
Definition tab. This controls record codes, not the type's own configuration code.

- **User-entered code**: users must supply a non-blank code.
- **Automatic sequential number**: configure inclusive start/end values, optional
  zero padding and an optional prefix. Record code inputs become read-only and new
  records show “Assigned automatically on Save”.

Start 100, end 999999, padding 6 and prefix `PROP-` produces `PROP-000100`. Padding
is the minimum numeric width; longer numbers are never truncated. Padding 0 and
an empty prefix produce plain numbers. Include any separator in the literal prefix.

## Application constraints and allocation

Configuration and counters belong to a tenant, organisation, class and type.
Types have independent counters, not a shared pool. Subledger, accounting object
and dimension types can overlap. GL codes retain organisation-wide uniqueness:
allocation skips occupied codes across all GL types without advancing their counters.

Ranges use non-negative whole numbers from 0 to 9007199254740990, with start no
greater than end. Padding is a whole number from 0 to 32. Prefixes contain up to
32 JavaScript UTF-16 code units without surrounding whitespace. Admin-only type
save APIs validate configuration; database checks also enforce valid definitions.

Allocation is prepared in ERP after permission, custom data and resource
validation. The shared JavaScript allocator reads settings and occupied codes,
then submits one ordinary SQL batch that locks affected tables and rechecks those
inputs before saving the counter and record. GL codes retain organisation-wide
uniqueness; counters remain independent. A stale plan returns 409 and must be
retried. There is no automatic retry or database numbering allocation function.
See [ERP transaction batches](transaction-batches.md).
A failed transaction rolls back allocation, the record, resources and versions.

Already stored codes are skipped within the applicable uniqueness scope, including
deleted records, whose codes remain reserved by database uniqueness constraints.
Exhaustion blocks creation with an actionable range error; existing records can
still be saved. Automatic creation ignores client-entered codes. Automatic edits
retain existing stored codes, including when the selected type changes. Manual
mode retains the existing editable-code behaviour.

Counters do not reset when ranges/formatting change or automatic mode is toggled.
Allocation starts at the greater of the saved counter and configured start. Extend
the end or move the range forward to repair exhaustion; lowering the start cannot
restart a consumed sequence. Prefix/padding changes affect future records only.
The UI's **next candidate** is not a reservation: collisions and concurrent saves
may change the number ultimately allocated.

## Storage, compatibility and template recommendations

Built-in numbering is outside `schema_json`. Each type table has `code_numbering`
JSONB (default `{"mode":"manual"}`) and `code_number_next` BIGINT (initially null,
maintained by the allocator). An automatic definition is:

```json
{"mode":"automatic","start":100,"end":999999,"padding":6,"prefix":"PROP-"}
```

Apply the existing ERP schema setup/update workflow to install the idempotent
columns and checks in `schema/erp-schema.sql` before using updated save
APIs. Migration preserves all record codes and puts existing types in manual mode.
Older type-save clients omitting `code_numbering` preserve existing configuration;
new types default to manual. No custom schema or record-value conversion is needed.

[`template-defaults.json`](../../Volumes/Core-ERP/seeds/template-defaults.json)
continues to recommend manually assigned example codes; these are template choices,
not application constraints. Existing seed examples are not renumbered. Admins can
enable automatic numbering on seeded types. Seed/import/copy SQL retains explicit
record codes instead of invoking interactive allocation; uniqueness constraints
still apply and future allocations skip those stored codes.

Organisation setup copying carries numbering configuration using destination type
identities. New destination types have null counters; recopying retains existing
destination counters. Source counters are neither copied nor shared.

## Implementation and verification

- API helper: `Volumes/Core-ERP/api/_shared/erp/code-numbering.js`.
- PostgreSQL storage/checks: `Volumes/Core-ERP/schema/erp-schema.sql`.
- UI: shared helpers in `Volumes/Core-ERP/public/app.js` and
  `.code-numbering-fields` in `style.css`.
- Integrations: all four type-save and record-save APIs and organisation setup copy.

```text
node --test Volumes/Core-ERP/test/code-numbering.test.js
node Tools/ERP-Acceptance/test/code-numbering.database.js
node Tools/ERP-Acceptance/test/code-numbering.browser.js
```

The database check requires `@electric-sql/pglite` on `NODE_PATH`. It uses an isolated
PostgreSQL engine, actual schema and API handlers, checking all four classes,
permissions, formatting, exhaustion/extension, rollback, overlap/GL collisions and
setup copy. It does not connect to the deployed database or prove multi-connection
lock scheduling. The browser check requires Playwright; set `ERP_BROWSER_EXECUTABLE`
for an installed Chromium/Edge executable if needed. It uses real markup/CSS and
shared Setup/numbering helpers at 1440px and 390px, with full-page screenshots under
`tmp/code-numbering-browser`. It is a fixture test, not a deployed-server smoke test.

### 2026-10-05 — Server allocation

The earlier Broker dispatch was removed on 2026-10-11. ERP now prepares the
allocator's guarded SQL batch; Broker receives SQL and parameters only. Deploy
the revised ERP callers and generic Broker together. No ERP mount in Broker is
required. Allocation, validation and conflict messages belong to ERP.
Initialise Schema removes the retired `erp_record_code` function; existing
configuration, counters and record codes are preserved. The new save path no
longer calls that function. The isolated API tests cover rollback and all four
classes but do not prove multiple live PostgreSQL connections.
