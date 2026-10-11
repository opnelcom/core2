# End-to-end smoke test

Generic Broker transactions: `node --test Volumes/Core-Broker/test/transaction.test.js`.
ERP workflows submit ordinary guarded SQL batches; see
[ERP transaction batches](docs/erp/transaction-batches.md).

Exchange rates: `node --test Volumes/Core-ERP/test/exchange-rates.test.js`,
`node Tools/ERP-Acceptance/test/exchange-rates.database.js` (PGlite on NODE_PATH),
and `node Tools/ERP-Acceptance/test/exchange-rates.browser.js` (Playwright/system
Edge). See [Exchange rates](docs/erp/exchange-rates.md) for installation and scope.

Core Database Management: `node Volumes/Core-DBManager/test/database.js`
(PGlite on `NODE_PATH`) and `node Volumes/Core-DBManager/test/browser.js`.
See [Core Database Management](docs/database-management.md) for coverage and
deployment verification requirements.

Data Migration checks: `node --test Volumes/Core-DataMigration/test/*.test.js`
and `node Volumes/Core-DataMigration/test/browser.js`. Optional PostgreSQL-engine
round-trip check: `node Volumes/Core-DataMigration/test/database.js`, with
`@electric-sql/pglite` available on `NODE_PATH`. See
[Data Migration](docs/data-migration.md) for live-verification requirements.

Administrator report builder: `node --test Volumes/Core-ERP/test/report-definitions.test.js`.
Optional isolated checks: `node Tools/ERP-Acceptance/test/report-builder.database.js`
(PGlite via NODE_PATH) and `node Tools/ERP-Acceptance/test/report-builder.browser.js`
(Playwright; ERP_BROWSER_EXECUTABLE can point to system Edge). Cover report-only
access, division inheritance, date parameters, grid row grain, idempotent schema
migration, Excel export, the designer and individual role grants. See
`docs/erp/report-builder.md`. Live smoke: Initialise Schema, create a report in
Setup, assign it to a role/division, then run and export as that user.

1. Start the stack and wait for all containers to become healthy.
2. Open `http://localhost/`.
3. Register with the address configured in `CORE_BOOTSTRAP_ADMIN_EMAIL`.
4. Copy the development activation token into Activate.
5. Log in.
6. Confirm a personal tenant exists and is selected.
7. Add another email as a tenant user.
8. Open `/admin/` and confirm counts load.
9. Open `/monitor/` and confirm service checks load.
10. Open `/erp/`, add a note and refresh it.
11. Open `/reference/` and verify the globe, country lookup, ring editor, unit
    converter, world clock, coordinate tools, Base64, and text tools.

Useful checks:

ERP Trial Balance is available under Reports. Verify both fiscal-period and
date ranges, opening balances across prior years, opening-history and period
drill-down, and the Back to Trial Balance action after opening a transaction.
Original reversed postings and their offsetting journals must both contribute.
Restricted-permission views must identify themselves as incomplete. CSV detail
export must include all pages. The GL report indexes are installed by the ERP
schema update; no opening-balance rollover is required for this report.

Automated ERP and acceptance checks:

```powershell
node --test Volumes/Core-ERP/test/*.test.js Tools/ERP-Acceptance/test/*.test.js
```

```bash
docker compose config
docker compose ps
docker compose logs --tail=100 core-db-saas core-db-erp core-broker core-saas core-gateway
```
# Custom-schema grids and object versions

Run `node --test Volumes/Core-ERP/test/*.test.js` and
`node Tools/ERP/audit-template-schemas.js` for schema/seed regressions.

Optional browser and isolated PostgreSQL checks:

```powershell
node Tools/ERP-Acceptance/test/schema-grid-editor.browser.js
node Tools/ERP-Acceptance/test/schema-grid-storage.database.js
```

The browser check requires Playwright; `ERP_BROWSER_EXECUTABLE` can point to
system Edge. The database check requires `@electric-sql/pglite`; resolve it through
the test environment or `NODE_PATH`. It runs only an isolated database. Neither
check updates a live organisation. They cover combined field/grid collection,
read-only full snapshots, decimal precision, mobile overflow, schema idempotency,
all three class Save endpoints, baseline history, reference permissions, grouped
periods, report datasets and complete transaction rollback. See
`docs/erp/schema-json.md` for deployment and compatibility details.

## Insurance template and mixed references

Run `node --test Volumes/Core-ERP/test/*.test.js` for schema, posting-definition
and shared object-reference consistency tests. Optional Playwright check:
`node Tools/ERP-Acceptance/test/insurance-management.browser.js` (uses
ERP_BROWSER_EXECUTABLE when set). Optional isolated PGlite check:
`node Tools/ERP-Acceptance/test/insurance-management.database.js` verifies complete
template seeding, repeated additive upgrades, all nine financial Save/posting
validation paths, policy/claim mismatch rejection, mixed-class item selection,
policy membership, destination reference remapping, versions and grid projections.
It never connects to the live database. Use NODE_PATH for external test dependencies
as described in the existing grid check instructions.

## Setup Schema UI Tester

Optional Playwright check: `node Tools/ERP-Acceptance/test/schema-ui-tester.browser.js`.
Uses actual tester markup, stylesheet and shared renderer; checks tabs, editable
controls/grids, read-only reference lookups, no save/storage calls, render reset,
invalid JSON handling, Clear and mobile containment.


## Record code numbering

```text
node --test Volumes/Core-ERP/test/code-numbering.test.js
node Tools/ERP-Acceptance/test/code-numbering.database.js
node Tools/ERP-Acceptance/test/code-numbering.browser.js
```

The isolated PostgreSQL/API fixture requires `@electric-sql/pglite` on `NODE_PATH`.
The browser fixture requires Playwright and optionally `ERP_BROWSER_EXECUTABLE`.
See [Record code numbering](docs/erp/code-numbering.md) for coverage and limitations.
# Tour template seeding

Run `node Tools/ERP/audit-template-schemas.js` and
`node Tools/ERP-Acceptance/test/tour-management.database.js` (PGlite on `NODE_PATH`).
The isolated fixture checks template-only and idempotent seeding, eight object types, example records, references and seeded currencies. No tour-specific runtime workflow is installed.


# Template initialisation separation (2026-10-11)

See docs/erp/template-initialisation.md. The tour database fixture now tests structural initialisation without seeds, definition reset without examples, confirmed additive examples, stable IDs, preserved records, tenant isolation and transaction rollback. Insurance and schema-grid fixtures use the shared seeding path.
