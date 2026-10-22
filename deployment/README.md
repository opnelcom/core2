# Runtime 2.0 migration and acceptance

Runtime includes the generic `pg` and `nodemailer` packages, installed during image
build using its lockfile. It contains no Core-specific packages or service configuration.
Application-local dependencies take precedence; existing application manifests may
still declare these packages for standalone use. Core client packages remain in each
application's own node_modules. Release packaging is deferred.

This release separates hosting from Core integrations. SaaS owns session signing and
verification; Admin and Monitor verify current identity through SaaS. ERP, ObjectSphere,
Tasks and DBManager verify identity and tenant membership through SaaS, retaining their
own permissions. DBManager also retains its SaaS application-assignment check.
Broker and SMTP use their own profile keys and remain independent of SaaS.

No database schema, template, or example-data changes are included. Do not run Initialise
Schema or Initialise Template Org as part of this migration. Existing well-formed signed
sessions remain compatible when the SaaS secret is retained; no secrets are copied to clients.

## Existing Docker host: coordinated deployment

Retain a copy of the previous release, configuration, and images. Stop the Runtime
services before replacing mounted application files in a live deployment. Apply this
release's source/configuration as a coordinated change; do not run old applications
against Runtime 2.0 or omit the installed application dependencies.

From the project directory on a Linux Docker host, with databases already running:

```sh
docker compose config --quiet
docker compose stop core-saas core-admin core-monitor core-erp core-objectsphere core-tasks core-database-management core-broker core-smtp core-tools core-reference
docker build -t core-runtime:2.0.0 ./Applications/Core-Runtime
docker run --rm -v "$PWD:/workspace" -w /workspace core-runtime:2.0.0 node scripts/prepare-dependencies.cjs
docker run --rm -v "$PWD:/workspace" -w /workspace core-runtime:2.0.0 node scripts/verify-platform.cjs
docker compose up -d --no-deps --force-recreate core-broker core-smtp core-saas core-admin core-monitor core-erp core-objectsphere core-tasks core-database-management core-tools core-reference
docker compose ps
node scripts/verify-platform.cjs --live
```

The Docker preparation command runs npm from the same Linux image used in production;
the Docker build installs built-in technical packages, while the preparation command
installs application-local dependencies, including Core clients. It needs outbound access to
the configured npm registry. Preparation creates lowercase logs directories before
Docker mounts them writable beneath read-only `/app/content`. It does not change
database profiles, SMTP profiles, database data, or restart services itself.
Run commands sequentially and stop on errors. The final live check requires host Node
and Docker CLI; if host Node is unavailable, run `node scripts/verify-platform.cjs` in
the preparation container and use the manual checks below on the Docker host.

Core-broker is also an existing Compose build entry for the shared Runtime image. These
commands build local `core-runtime:2.0.0`; no Docker Hub publication is performed.
Gateway needs no rebuild for this migration. Its upstream routes and ports are unchanged.
There will be a maintenance interval while application containers are stopped.

For a clean host, also supply deployment secrets, certificates, external settings, and
initialise/start the configured PostgreSQL services before the Runtime services. Copy
application code, config, package.json, package-lock.json, and vendor archives. Do not
copy node_modules from a different operating system/architecture. Data migration and
backup restoration are separate actions.

## Automated verification

`node scripts/verify-platform.cjs` checks local JSON ports, identity configuration,
secret ownership, installed dependencies, archive integrity, lockfiles and log folders.
`--live` also checks each Runtime container's health endpoint, dependencies, writable
logs, and rejection of invalid sessions at representative protected endpoints. It is
read-only and neither sends mail nor runs database writes. It does not replace
authenticated application checks, real database operations, or TLS/browser checks.

Developer tests use Node 24+ because existing ERP tests use node:sqlite. For the full
ObjectSphere suite install its locked dev dependency as well:

```sh
node scripts/prepare-dependencies.cjs --include-dev
node scripts/test-platform.cjs
node scripts/test-platform.cjs --all-app-tests
```

## Manual acceptance checklist (test environment)

- Verify HTTPS, landing page, static assets, navigation and file logs.
- Log in, log out, reject an expired/tampered session; verify active users only.
- Admin/Monitor: permit an administrator; deny a standard or disabled user. Changes
  to administrator status should take effect on the next protected request.
- ERP/ObjectSphere/Tasks/DBManager: select and switch tenants. Verify known data in
  each tenant; reject missing membership and cross-tenant identifiers.
- Verify application-specific permissions still deny unauthorised actions. DBManager
  must also reject a user without its application assignment.
- Perform a small approved database operation and verify the resulting record.
- Send one explicitly approved test email and check delivery or configured development log.
- Stop SaaS temporarily: protected requests return 503; public files and Runtime
  health still work. Broker and SMTP continue authenticating through their own keys.
- Supply invalid Broker/SMTP keys: reject before querying or sending. Restore all
  services and configuration after failure testing.

## Recovery

If acceptance fails, stop the affected Runtime services, restore the previous application
release/configuration and its matching Runtime image/Compose definition, reinstall its
dependencies if needed, and recreate the services. Do not restore only Runtime while
leaving incompatible application code mounted. No schema reversal is needed for this change.
