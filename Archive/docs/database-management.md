# Core Database Management

Core Database Management is a tenant application at `/dbmanager/`. Its first menu
is PostgreSQL, containing Database connections and Generate INSERT statements.
The original Data Migration app at `/migration/` remains available for reference.
SQL Server storage, authentication and tools are deferred; the server currently
accepts PostgreSQL connections only and emits PostgreSQL INSERT statements.

## Connections and tenant access

Every active user with access to the application in the current tenant can create,
edit, delete and use any connection belonging to that tenant. There are no
connection-specific user grants. SaaS validates the active session, active tenant
membership and application allocation on every request. The server derives the
tenant from that validated session; every record query includes its tenant ID.
Mutation/source requests must also match the tenant context captured by the page.
Knowing another tenant's connection UUID does not give access to it.

The `core-dbmanager` PostgreSQL database contains `dbmanager_connection` records
with name, engine, host, port, database name, username, TLS mode, description,
tenant ID, version and audit timestamps/user emails. Names are unique within a
tenant, ignoring case. The version detects conflicting edits and deletes.
The database schema has **no password column**. The save API rejects a password
field and writes only explicitly listed non-secret fields.

Database connections is a searchable list with keyboard-accessible rows and a
right-side connection editor. Delete requires confirmation of the named connection.
These are Database Management utility screens, not ERP grids or custom schemas;
they reuse the migration theme and do not change ERP rendering standards.

## Using migration

Choose a saved connection and enter its password, then Connect and browse. The
existing explorer, selection, fixed-value/NULL replacement, preview, full
generation, copy and download features are retained. See
[Data Migration](data-migration.md) for their behaviour and output limits.

Passwords stay only in page memory while connected. The input clears after a
successful connection; subsequent preview/full requests reuse the memory value.
Disconnect, page exit, refresh, connection input changes and tenant changes clear
the connection, credentials and generated output. Passwords are never saved in
the application database, cookies, browser storage or application logs. The
application opens a new remote read-only connection for each operation and closes
it afterward; there is no persistent remote database session.

Source endpoints accept a saved connection ID, version and transient password,
rather than arbitrary host/database settings. Each operation re-resolves that
connection within the tenant. Changes to its saved version require reloading the
list and reconnecting. Tenant changes clear state on focus, periodic session
checks (15 seconds) and response validation; stale responses are discarded.

## Independent application implementation

The application copies the original migration design into its own
`Volumes/Core-DBManager` volume. Local `public/migration.js` and `migration.css`
provide the migration controller and theme; local `api/_shared/postgres.js` and
`access.js` provide PostgreSQL generation and SaaS access checks. The controller
is configured through `window.migrationApp` with the menu, API root, saved-connection
resolver and tenant response checks. Reusable helpers remain central within this
app, but the two applications now evolve separately.

There are no imports, mounts or browser assets from Core-DataMigration and no
`migration-shared` mount point. Core Database Management can run without the
original migration service or volume. It uses the existing Core Runtime image,
SaaS authentication, Broker service and its own `core-dbmanager` database.

Connection CRUD runs through Broker profile `core_dbmanager`. Business validation,
tenant scoping and optimistic concurrency live in server code. The database
provides uniqueness, keys and single-statement atomic updates/deletes. Remote
source discovery and generation connect directly to the remote server; saved
connections do not create Broker profiles.

## Backend installation

1. Deploy the updated Compose, Gateway and Broker configurations,
   `Volumes/Core-DBManager`, and
   `Volumes/Databases/Core-DBManager/Init/001-schema.sql`.
2. Add credentials to the server's existing `.env`:

   ```dotenv
   DBMANAGER_DB_USER=dbmanager_user
   DBMANAGER_DB_PASSWORD=<choose a strong password>
   ```

3. In `Volumes/Core-Broker/config/config.json`, set the `core_dbmanager` profile's
   user/password to those same credentials. Its host is `core-db-dbmanager`, database
   is `core-dbmanager`, and port is 5432. Set its `profileKey` to a strong internal
   key and put the same key in the new app's
   `Volumes/Core-DBManager/config/config.json` as `dbBrokerKey`. The supplied entries
   contain development placeholders that must be configured.
4. Start the new database, restart Broker to load the configuration, then start
   the application and recreate Gateway:

   ```bash
   docker compose up -d core-db-dbmanager
   docker compose restart core-broker
   docker compose up -d core-database-management
   docker compose up -d --force-recreate --no-deps core-gateway
   docker compose ps core-db-dbmanager core-database-management core-gateway
   ```

5. On an existing SaaS installation execute
   `Volumes/Databases/Core-SaaS/Init/003-dbmanager.sql` against the **existing SaaS
   database**, or add an active public application in Administration:
   code `core-database-management`, name `Core Database Management`, route
   `/dbmanager`. Allocate it to the required tenants/users using existing controls.
   New SaaS installations execute the registration seed automatically; existing
   database volumes do not re-run initialization scripts on restart.
6. Sign in, select the tenant and open `/dbmanager/`. Add a connection, switch to
   Generate INSERT statements, select it and enter the source password.

The new application database is provisioned through the existing database network
and is not published on a host port. PostgreSQL initialization creates its schema;
an idempotent server bootstrap also supports an existing empty database. The
source host must be reachable from `core-database-management`, and the source
account needs schema USAGE and SELECT permissions. TLS verification defaults to
on; disabled TLS remains an explicit connection setting.

### Upgrading the database service name

The Compose database service is `core-db-dbmanager`; the PostgreSQL database name
remains `core-dbmanager`, and Broker profile remains `core_dbmanager`. The service
uses the same `Volumes/Databases/Core-DBManager/Data` bind mount as before.
For a deployment using the previous service name, stop its container before starting
the renamed service so two PostgreSQL processes never use that directory together.
From the project directory, with the updated files deployed, run:

```bash
docker stop core-platform-core-dbmanager-1
docker compose up -d core-db-dbmanager
docker compose restart core-broker
docker compose up -d core-database-management
docker compose ps core-db-dbmanager core-database-management
```

The old container name above uses this project's default Compose project name.
If a different project name was used, find the old container with `docker ps -a`
and substitute its name. Leave it stopped; do not delete the data directory.

## Verification

```text
node Volumes/Core-DBManager/test/database.js
node Volumes/Core-DBManager/test/browser.js
node --test Volumes/Core-DBManager/test/*.test.js
node Volumes/Core-DBManager/test/migration-values.database.js
```

Database fixtures require `@electric-sql/pglite` on `NODE_PATH`; browser fixtures
use the existing Playwright dependency and optionally `ERP_BROWSER_EXECUTABLE`.
The isolated database fixture verifies CRUD, tenant isolation, password exclusion,
source resolution, version conflicts, authentication and application permissions.
The browser fixture uses actual markup/styles/controllers with mocked HTTP APIs.
It verifies connection CRUD, saved-source migration, password reuse, tenant reset
and desktop/narrow layouts. Neither establishes deployed Docker networking, live
SaaS authorization or remote-source connectivity; those need a deployment smoke
test. No existing records require conversion.

Change history: 2026-10-07 — initial tenant PostgreSQL connection management and
migration tool; copied all migration assets and helpers into the app volume so it
runs independently of the original migration application.
2026-10-07 — renamed the Compose database service and Broker hostname to
`core-db-dbmanager`, preserving the database name and existing data mount.
