# Currency exchange rates

Administrators maintain rates under Setup → Currencies → Exchange rates. Currency
definitions and rates remain organisation-level setup, with no module Scope tab.
Rates can join any two active currencies defined in the current organisation.
This feature is manual maintenance only: journal capture, posting, automatic rate
selection and revaluation do not consume these entries.

Each entry states its direction explicitly: `1 USD = 18.50000000 ZAR`.
The reverse is calculated from the same rate; it is not stored separately.
The grid lists dated entries, newest effective date first, and supports search.
The effective date is a calendar date, not an expiry date or an instruction to
select a rate automatically. Future dates are allowed.

## Storage and validation

`erp_exchange_rate` stores the pair, effective date, positive decimal rate,
revision, creator/updater and timestamps. Rates accept up to 20 whole digits and
8 decimal places (`numeric(28,8)`); the API accepts decimal strings, not floating
point numbers or exponent notation. The reciprocal preview uses integer decimal
arithmetic, rounds to 8 places and shows `< 0.00000001` for smaller results.
Reciprocal previews are approximate and do not change saved values.

One entry is allowed per unordered pair and effective date. Thus a saved USD/ZAR
entry also prevents a separate ZAR/USD entry on the same date. Different dates
may use either direction. There is no inferred cross-currency conversion.

The pair and date are locked after creation. Corrections change the rate and
require a reason (1–1000 trimmed characters). Every creation and correction writes
an `erp_exchange_rate_change` entry with the previous/new rate, revision, actor,
timestamp and reason. No-op corrections are rejected. Stale revisions return a
conflict; the administrator must reopen the entry and review it before retrying.
There is no individual rate/history deletion endpoint.

Reusable ERP server code validates data, administrator access, active currency
references and revisions, then prepares a guarded ordinary SQL batch. That batch
locks affected tables, rechecks all preparation inputs and writes the rate plus
audit on one connection. Broker executes SQL only. See
[ERP transaction batches](transaction-batches.md). Database keys, positive-value checks and unordered pair/date
uniqueness protect integrity. API list/history/save require organisation setup
administrator access and always scope by authenticated tenant and organisation.

## Installation and compatibility

Apply `Volumes/Core-ERP/schema/exchange-rates.sql` to an existing ERP database.
It is additive and idempotent; the same definitions are included in
`erp-schema.sql` for full setup. Existing currencies, journal exchange rates and
stored transaction values are unchanged. Deploy the updated ERP and generic Broker
code together and reload the browser to load the versioned scripts. Broker no
longer imports or mounts ERP server code. If the earlier ERP code mount was
installed, recreating Broker from the updated compose file removes it.

Then sign in as an organisation administrator, select the organisation and run
Setup → Recovery → Initialise Schema. Reload the page (Ctrl+F5), navigate to
Setup → Currencies → Exchange rates, and use `+` to create a dated rate. The normal
Initialise Schema action creates the new tables without seeding business data;
do not use tenant reset or template/example initialisation for this installation.

Currency setup copying copies definitions only; historical rates and their audit
are not copied. Existing organisation currency-data deletion and tenant reset
remove rates first (including their audit) before removing currencies. Referenced
currencies otherwise cannot be deleted while their rates exist. Back up history
before invoking the existing destructive recovery actions.

## UI and verification

The new editor uses the shared grid, Setup tabs, required-caption helper,
label-left field layout, right-anchored panel, close/cancel helper and resize grip.
Save refreshes the list and closes; errors preserve inputs. Change history is
read-only. Keyboard tabs support arrows/Home/End; Escape closes and returns focus.
Organisation/context reset invalidates pending list, history and save responses.

Run:

```text
node --test Volumes/Core-ERP/test/exchange-rates.test.js
node Tools/ERP-Acceptance/test/exchange-rates.database.js
node Tools/ERP-Acceptance/test/exchange-rates.browser.js
```

Database fixtures use an isolated PostgreSQL engine; browser fixtures use production
markup/CSS/helpers/controller and mocked APIs. Neither proves live deployment.

### Verification recorded 2026-10-11

All 107 ERP unit tests passed. The exchange-rate database fixture passed against
PGlite, including the actual endpoints and generic Broker batches, schema reapplication,
tenant/organisation isolation, reciprocal-pair uniqueness, audited corrections,
stale revisions and rollback after an audit-write failure. Existing fiscal-delete
and record-numbering database fixtures also passed after removal of Broker
application dispatch. The rate fixture verifies a correction committed between
preparation and batch submission cannot be overwritten by a stale plan.

The exchange-rate browser fixture passed at 1440px and 390px. Full-screen closed
and open views were visually inspected; checks cover full-width grids, containing
block/panel bounds, left captions, creation, correction, retained errors, hidden
invalid controls, tab retention, keyboard activation, cancellation, resizing and
late-response guards. Screenshots are in `tmp/exchange-rates-browser`.

Live verification was unavailable: Docker is not installed in the execution
environment and `http://localhost/erp/` refused the connection. The running host
still needs the deployed code and schema migration described above.
