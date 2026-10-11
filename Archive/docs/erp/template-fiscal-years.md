# Template fiscal-year examples

Template organisation seeding installs calendar years 2025, 2026 and 2027, each
from 1 January through 31 December with 12 monthly periods. Year codes are the
four-digit year; period codes are YYYY-01 through YYYY-12. New years and periods
start open to support testing. This is template configuration, not a requirement
for other organisations and not a rolling calculation based on the current date.

Definitions live in `Volumes/Core-ERP/seeds/template-defaults.json` under
`fiscalYearSeeds`; `seed-fiscal-years.js` installs them through Initialise Template
Org. Initialise Schema does not install these examples. Matching JSON-defined years and monthly periods are reset to configured dates and open status. Conflicting overlapping years with another code are skipped. Existing record IDs are retained. Non-template organisations receive no fiscal configuration automatically.

Verification: the isolated PostgreSQL-compatible acceptance fixture checks three
years, 36 periods, February and December boundaries, repeat seeding, preservation
of a locked year and non-template exclusion. Run
`node Tools/ERP-Acceptance/test/report-builder.database.js` with the documented
PGlite dependency runtime. No project database is changed by this test.
