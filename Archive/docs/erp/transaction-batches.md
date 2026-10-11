# ERP operations through the generic SQL Broker

Core-Broker accepts parameterised SQL statements and optional expected row counts.
Each transaction request runs BEGIN, executes its statements in order, commits on
success or rolls back on failure, and releases its connection. It authenticates
the configured database-profile key and keeps its existing logging and metrics.
It has no ERP imports, operation registry, application callbacks or transaction
sessions. ERP alone performs exchange-rate, numbering, fiscal and template logic.

Organisation-copy reference transformation also runs in ERP. The copy planner
allocates new destination record IDs, transforms single and mixed references in
ordinary fields and nested grids, then submits prepared JSON values with copy
statements. Snapshot guards prevent stale remapping inputs from being written.
Grid projection rebuilding stays in the same SQL batch. Existing division-copy
writes precede that batch and are not rolled back with it.

## Preparation and atomic submission

`api/_shared/erp/transaction-plan.js` is a reusable ERP-side adapter. It lets ERP
read inputs and prepare its decisions without making any writes. Every read is
captured with a database-produced JSON snapshot as text; exact decimal values are
preserved both in returned database values and in the snapshot.

ERP then submits one ordinary Broker transaction batch:

1. Lock the affected ERP tables in deterministic name order using
   SHARE ROW EXCLUSIVE locks.
2. Repeat each preparation query and require its input snapshot to match.
   Generic `expectedRowCount: 1` checks abort when any input changed.
3. Execute the prepared parameterised writes and required result reads.

The locks remain until Broker commits or rolls back. Writes cannot slip between
the final checks and the writes. A concurrent change returns an ERP 409 conflict
without applying the stale plan. There is no automatic retry or reservation during
preparation. Business validation errors occur in ERP before submission. ERP-owned
JavaScript allocates code candidates and seed UUIDs; no database function or
trigger performs application allocation or seeding.

Exchange-rate writes and audit rows, numbering counters and record/resource/version
writes, fiscal deletion and template definitions/examples each use one batch.
Existing seed identities are read and retained; fresh identities are allocated in
ERP so later SQL statements can refer to them without Broker interpreting results.
Returned organisation/record data comes from committed SQL results.

## Limitations and deployment

Table locks are deliberately conservative: other writers to affected tables may
wait briefly during the batch, even for another organisation. Reads remain usable.
Preparation may require several read requests; it does not hold a transaction
open. The current implementation assumes the ERP SQL builders use unqualified
`erp_*` table names, as the supported operations do. It rejects unsupported planned
writes requiring generated results rather than inventing database results.

Deploy the revised ERP callers and generic Broker together. No ERP code mount in
Broker is required, and no additional database migration is needed for this
architectural correction. Existing exchange-rate tables still require their own
additive migration. If the earlier `/app/Core-ERP` mount was installed, recreating
the Broker from the updated compose file removes that obsolete mount; it is not
required by any operation now.

## Verification

Run `node --test Volumes/Core-Broker/test/transaction.test.js` and the ERP unit
suite. Database fixtures cover exchange rates, numbering, fiscal deletion and
template definitions/examples through ordinary batches. The rate fixture includes
a second correction between preparation and submission and confirms that the
stale plan cannot overwrite it. Template fixtures verify stable IDs, preserved
business records, new examples, references and rollback. The template batch remains
under the Broker's default 1 MiB request limit. Tests use isolated PostgreSQL
fixtures; deployed database and actual concurrent connection scheduling require
live verification.
