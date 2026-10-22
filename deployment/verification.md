# Verification recorded for the Runtime separation

Source verification on 2026-10-21:

Follow-up: Runtime now includes locked `pg` and `nodemailer` technical dependencies.
Its dependency tests verify parent-directory resolution from mounted-content API paths
and the absence of Core packages. The updated focused migration suite passes 66 tests.
No Docker rebuild or restart was executed from the editing environment.

- `node scripts/test-platform.cjs`: 64 passed, no failures/skips. Includes standalone
  Runtime HTTP tests, client contracts, live local identity HTTP integration, tenant
  denial, administrator checks, SaaS token signing/validation, Broker/SMTP independence,
  Broker transactions, DBManager utilities, and selected ERP regressions.
- `node scripts/test-platform.cjs --all-app-tests`: 285 passed, 2 failed, 6 skipped.
  ObjectSphere's PGlite PostgreSQL tests passed. Existing browser tests remain skipped.
- The two remaining failures are unchanged ERP tests/data: `schema-fields.test.js`
  expects a positive maxLength missing from a seed field; `template-schema-audit.test.js`
  imports the absent `Tools/ERP/audit-template-schemas` path (the tooling is archived).
  No seed/schema changes or unrelated test fixes were made.
- Local configuration/dependency checks pass for all eleven Runtime components,
  including release archive integrity and application-owned package resolution.
- Dependencies were prepared in a clean local staging folder using npm 10.9.4 and
  copied to ignored node_modules folders for verification. Normal deployment repeats
  npm ci using the Linux Runtime image, not these Windows-installed dependencies.

Not executed: Docker image build, Docker Compose model validation, container restart,
container live probes, browser acceptance, real database writes, real email delivery,
schema initialisation, template initialisation, or example-data creation. Docker CLI
is unavailable in the editing environment. Follow README.md on the Docker host.
