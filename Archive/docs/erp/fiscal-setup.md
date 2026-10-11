# Fiscal year and period setup

Fiscal years are organisation-level setup. Expand a year to view its period
count and a table of periods ordered by period number. Use Edit or activate a
row by click/Enter/Space. Add period opens a side panel identifying the year;
the next number is one greater than the highest remaining number. Period numbers
are not renumbered when deleting a record. The table keeps its standard keyboard
behaviour and scrolls horizontally on narrow screens.

Both editors use left captions, right controls and sticky actions. Cancel/Close
hide the editor without saving. A failed Save retains the inputs. Saving a new
year can create twelve monthly periods using the existing save-year generator;
editing an existing year does not generate periods. Existing period codes are
preserved by the browser when editing dates or status. This change does not add
period overlap/year-boundary validation or alter the monthly generator's date
rules; custom period calendars continue to use the existing Save endpoints.

## Delete behaviour

Administrators can delete an individual unused period or an unused year and all
its periods. The browser confirms the record and, for years, the child deletion.
Deleting is permanent, without a recycle bin or version snapshot. Any journal
referencing a period blocks its deletion and its parent's deletion, regardless
of workflow status. The error reports the number of transaction records and
suggests closing/locking used periods. No journal is deleted by this operation.
Dates and period numbers of surviving records are unchanged.

`POST fiscal/delete-year` accepts organisation_id and fiscal_year_id;
`POST fiscal/delete-period` accepts organisation_id and fiscal_period_id.
Both require tenant authentication and current organisation administrator access.
Invalid identifiers return 400; inaccessible/missing records return 404 and used
records return 409. ERP's `executeFiscalDelete` validates the scoped record,
periods and journal dependencies, then submits an ordinary Broker SQL batch.
That batch locks the affected tables and rechecks those inputs before deletion
on one transaction connection. Foreign keys retain database integrity. A stale
plan returns 409; Broker failures roll back the whole batch, so a used year
retains its unused children too. See [ERP transaction batches](transaction-batches.md).

Deploy both Core-ERP and Core-Broker changes together. No schema migration or
stored-value conversion is required: the existing fiscal-year cascade and
journal-period foreign key are reused. Template fiscal-year seeding remains
additive and can recreate a missing seeded year when template initialisation
runs; this change does not introduce deletion tombstones. Seeding does not refill
missing periods in a year which already exists.

## Verification

- `node Tools/ERP-Acceptance/test/fiscal-setup.browser.js`: production markup/CSS,
  actual grid/editor handlers, mocked API. Full screens at 1440 and 390 pixels,
  closed/open panels, alignment, sticky actions, keyboard opening, add/search,
  successful/failed save, confirmation cancellation and blocked/successful delete.
  Screenshots: output/fiscal-setup.
- `node Tools/ERP-Acceptance/test/fiscal-setup.database.js`: isolated PGlite using
  the real schema, delete endpoints and generic Core-Broker SQL batches.
  Covers unused period/year deletion, child cascade, blocked deletion and rollback,
  tenant/organisation isolation, administrator/method validation and table locks.
  A journal inserted between preparation and submission rejects the stale deletion
  and preserves the newly used period.
  Requires @electric-sql/pglite through normal package resolution or NODE_PATH.

Fixtures are not a deployed-browser/live-database smoke test. PGlite checks do not
exercise simultaneous requests from separate database connections. No application
records are deleted during verification.
