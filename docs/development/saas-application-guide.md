# Building a Core application with SaaS user and tenant integration

Applies to Core-Runtime 2.0.0, `@core/identity-client` 1.0.0, and
`@core/service-client` 1.0.0. Checked against the repository implementation on
21 October 2026. Examples describe a new `Core-Example` application; they do not
register it, create a database, or modify the running platform.

## 1. Responsibilities and request flow

Runtime serves public files and invokes CommonJS API handlers. It provides generic
HTTP utilities and built-in technical packages (`pg` and `nodemailer`), but has no
knowledge of SaaS, tenants, sessions, Broker, SMTP, or application permissions.

SaaS owns login, signed sessions, users, tenant selection and tenant membership.
The identity client runs inside your application and asks SaaS to verify the current
request. Your application owns its business data and permissions.

```text
Browser --same origin--> Gateway --> Application API on Runtime
                                        |
                                        +--> identity client --> SaaS
                                        |                       user + active tenant
                                        +--> application permission checks
                                        +--> service client --> Broker / SMTP
```

There are four separate access decisions:

| Decision | Responsible component |
| --- | --- |
| Is the user signed in and active? | SaaS session endpoint |
| Is the user an active member of the selected active tenant? | SaaS, checked by the identity client |
| Is this application available under SaaS's application-assignment rules? | SaaS application list, checked explicitly with `requireApplication` |
| May this user perform this operation on this business record? | Your application's APIs and permissions |

Passing an identity or tenant check does not grant application administrator rights.
Hiding a button or an application tile does not protect an API endpoint.

## 2. Create an application folder

Keep application implementation in its own folder:

```text
Volumes/Core-Example/
  api/
    _shared/
      access.js
      context.js
    context.js
  public/
    index.html
    app.js
  config/
    config.json
  vendor/
    core-identity-client-1.0.0.tgz
  node_modules/                      # prepared application dependencies; not Git source
  logs/                              # writable deployment directory; not Git source
  package.json
  package-lock.json
  test/
    access.test.js
```

Add schema files and application services only if the application needs a database.
Runtime maps `/api/context` to `api/context.js`. Underscore-prefixed path segments
such as `_shared` are private helpers and cannot be invoked as HTTP endpoints.
Public content is accessible without an identity check; protect data in the API.

## 3. Select and install the identity client

The package is currently distributed as a local versioned npm archive, not as a
public npm-registry package. Copy the selected archive from an existing consumer's
`vendor/` folder, or prepare it from `Packages/identity-client` using the repository's
package preparation tooling. Do not copy a consumer's installed node_modules tree.

Create `package.json`:

```json
{
  "name": "core-example",
  "version": "1.0.0",
  "private": true,
  "type": "commonjs",
  "engines": { "node": ">=20" },
  "dependencies": {
    "@core/identity-client": "file:vendor/core-identity-client-1.0.0.tgz"
  },
  "scripts": {
    "test": "node --test test/*.test.js"
  }
}
```

When developing the application, install dependencies once to generate its lockfile:

```sh
cd Volumes/Core-Example
npm install --ignore-scripts
```

Commit the manifest, lockfile and vendor archive. For subsequent installs use
`npm ci --omit=dev --ignore-scripts`, which uses the selected locked dependencies.
Do not regenerate lockfiles as a routine startup action. Application release
packaging is a separate, deferred concern; this guide does not introduce a new
deployment workflow.

Core clients must exist in the application's own node_modules; they are not built
into Runtime. Runtime's `/app/node_modules` provides its technical packages to API
handlers using normal Node ancestor lookup. An application-local version takes
precedence. Applications can declare their own technical dependencies when needed.

## 4. Configure the application

Create `config/config.json`:

```json
{
  "name": "core-example",
  "port": 3000,
  "maxBodyBytes": 1048576,
  "logToFile": true,
  "fileLogMode": "failures",
  "identity": {
    "url": "http://core-saas:3000",
    "timeoutMs": 10000
  }
}
```

The address is deployment configuration; change it to the actual SaaS service
address. The client has no fallback SaaS address. Both HTTP and HTTPS are supported.
The timeout must be a positive integer in milliseconds.

Runtime uses fixed paths:

| Purpose | Container path |
| --- | --- |
| Application content | `/app/content` |
| Configuration | `/app/content/config/config.json` |
| Public files | `/app/content/public` |
| API handlers | `/app/content/api` |
| File logs | `/app/content/logs` |

The JSON port controls Runtime and its health check; Compose mappings must agree.
Configuration is read when Runtime starts. Restart/recreate after changing it.
Production API modules are cached by Node, so restart after changing API code.
`nodeEnv: "development"` enables the existing API-module cache-clearing behaviour.

Do not add SaaS's `sessionSecret` to the application. Only SaaS signs and validates
session tokens. Do not put service credentials in public files or return the full
configuration object to the browser.

## 5. Explicitly compose application middleware

Create `api/_shared/context.js`:

```js
'use strict';
const {withIdentity} = require('@core/identity-client');

module.exports.withContext = handler => withIdentity(handler);
```

Apply this wrapper to every handler that uses its helpers. Merely creating the
context file does not cause Runtime to load it automatically.

`withIdentity` adds:

- `await ctx.auth()`: verified SaaS user, or null when unauthenticated. Identity
  service errors throw an error with status 503. This is asynchronous in consumer
  applications; always await it.
- `await ctx.tenantSession()`: verified user/tenant access or a status/body result.

The middleware is lazy: wrapping a public endpoint does not itself trigger an
identity request. You must call a check inside each protected handler. `ctx.auth()`
reuses its session result within one request; no cross-request identity cache is
provided. Runtime supplies a fresh context for each request; do not share it globally.

## 6. Implement a reusable tenant guard

Create `api/_shared/access.js`:

```js
'use strict';

async function requireTenantAccess(ctx) {
  return ctx.tenantSession();
}

module.exports = {requireTenantAccess};
```

Create `api/context.js`:

```js
'use strict';
const {withContext} = require('./_shared/context');
const {requireTenantAccess} = require('./_shared/access');

module.exports = withContext(async ctx => {
  if (ctx.req.method !== 'GET') {
    return ctx.send(405, {error:'GET required'}, {allow:'GET'});
  }

  const access = await requireTenantAccess(ctx);
  if (access.status) return ctx.send(access.status, access.body);

  ctx.res.setHeader('cache-control', 'no-store');
  return {
    tenant_id: access.tenantId,
    user: {
      user_id: access.auth.user_id,
      email: access.auth.email,
      known_name: access.auth.known_name,
      full_name: access.auth.full_name
    }
  };
});
```

This example intentionally grants every verified tenant member permission to read
their own context. Define additional application permissions before adding business
operations. A successful response has `tenantId` and **`auth`**, not `user`, internally.

You can instead use the library directly, without middleware:

```js
'use strict';
const {requireTenant} = require('@core/identity-client');

module.exports = async ctx => {
  if (ctx.req.method !== 'GET') return ctx.send(405, {error:'GET required'});
  const access = await requireTenant(ctx);
  if (access.status) return ctx.send(access.status, access.body);
  ctx.res.setHeader('cache-control', 'no-store');
  return {tenant_id:access.tenantId, email:access.auth.email};
};
```

Choose one convention per application. The migrated applications use a shared
context wrapper so identity and service-client setup remain reusable.

## 7. Understand the library contracts

All functions below are exported by `@core/identity-client` 1.0.0:

| Function | Successful result | Failure behaviour |
| --- | --- | --- |
| `session(ctx)` | SaaS session object, including `authenticated`, `user`, `current_tenant` | Throws 503 for unavailable/malformed identity response; unauthenticated is a normal result |
| `requireUser(ctx)` | Verified SaaS user | Throws 401 when unauthenticated; 503 on service/response failure |
| `tenantSession(ctx)` | `{tenantId, auth}` | Returns `{status, body}` |
| `requireTenant(ctx)` | Same as `tenantSession` (alias) | Same returned status/body contract |
| `requireApplication(ctx, code)` | Resolves with no value when the application is listed | Throws 403 when absent; 503 on service/response failure |
| `withIdentity(handler)` | Wrapped API handler | Checks run only when the handler calls a helper |

For tenant checks:

| Status | Meaning |
| --- | --- |
| 401 | SaaS reports no authenticated user |
| 400 | Authenticated user has no selected tenant cookie |
| 403 | Selected tenant does not match SaaS's verified active membership |
| 503 | Identity service/configuration/response cannot be verified |

An empty or malformed authenticated-user response fails closed with 503. Runtime
converts thrown errors with a `status` property into HTTP responses. Returned
`{status, body}` values must be handled explicitly with `ctx.send`; otherwise Runtime
would serialise them as a successful JSON response.

`auth` returned by a tenant check includes `user_id`, `email`, `known_name`, and
`full_name`. Global user type, tenant roles and application permissions are omitted
deliberately. A user-only check may return SaaS's user type; that does not establish
business-operation permissions inside your application.

## 8. Check application availability when required

Neither `withIdentity` nor `requireTenant` automatically checks application assignments.
If the requirement is to restrict use to applications available through SaaS, add the
check explicitly after successful identity/tenant verification:

```js
'use strict';
const {requireTenant, requireApplication} = require('@core/identity-client');

module.exports = async ctx => {
  if (ctx.req.method !== 'GET') return ctx.send(405, {error:'GET required'});
  const access = await requireTenant(ctx);
  if (access.status) return ctx.send(access.status, access.body);

  await requireApplication(ctx, 'core-example');
  ctx.res.setHeader('cache-control', 'no-store');
  return {tenant_id:access.tenantId, message:'Application is available'};
};
```

The code must match the application's SaaS registration. The helper calls
`/api/application/list` and checks that the application code appears in the result.
It follows SaaS's existing availability rules, including defaults when a tenant has
no explicit application assignments; it is not a strict “an assignment row must
exist” check. It also does not grant application-specific roles.

DBManager provides an existing example of combining session, application availability
and tenant checks in `api/_shared/access.js`.

## 9. Add Broker or SMTP only when needed

Install the selected `@core/service-client` vendor archive as another application
dependency and regenerate the lockfile during development. It is separate from the
identity client and is not needed for the context-only example.

Use this `api/_shared/context.js` when both clients are needed:

```js
'use strict';
const {withIdentity} = require('@core/identity-client');
const {withServices} = require('@core/service-client');

module.exports.withContext = handler => withServices(withIdentity(handler));
```

This adds application-owned `ctx.broker` and `ctx.smtp` functions. It does not verify
identity or permissions automatically and does not cause either service to be called
until you invoke its client.

Add the required entries to application JSON, using real deployment values rather
than these placeholders:

```json
{
  "dbBrokerURL": "http://core-broker:3000",
  "dbBrokerProfile": "core_example",
  "dbBrokerKey": "SUPPLY_A_CONFIGURED_PROFILE_KEY",
  "smtpUrl": "http://core-smtp:3000",
  "smtpProfileKey": "SUPPLY_A_CONFIGURED_SMTP_PROFILE_KEY",
  "serviceTimeoutMs": 30000
}
```

Merge these into the configuration from section 4; this fragment is not a standalone
Runtime configuration. For multiple Broker profiles, use `dbBrokerProfiles` entries
with `name` and `key`, as the existing applications do. Profile names and credentials
must match separately approved Broker/SMTP configuration. Keep secrets out of source
control and browser content. The client does not invent a profile or create a database.

Inside an already-authorised handler, a tenant-scoped query would be:

```js
const result = await ctx.broker('core_example', 'query', {
  text: 'SELECT entry_id, entry_name FROM example_entry WHERE tenant_id=$1 ORDER BY entry_name',
  values: [access.tenantId]
});
```

This assumes an application-owned schema has already been created. The query fragment
requires the `access` result from a successful tenant guard and the service wrapper.
Use verified identity for audit fields, not a user/email supplied in the request body.

For email, call `ctx.smtp('send', {profile:'configured-profile-name', to, subject, text})`
only after the application's operation-specific permission and input checks.
Broker and SMTP authenticate application requests with their profile keys; they do
not enforce the caller's SaaS membership or application permissions for you.

## 10. Enforce tenant boundaries in every data operation

Every tenant-owned row needs an authoritative tenant association. Every list, detail,
update, delete, document lookup, export and background operation must honour it.

- Derive the active tenant from verified access. Never trust `body.tenant_id` or
  `query.tenant_id` as authorisation.
- Scope record lookups and writes using both tenant and record ID. Parameterise values.
- Check application permissions before business-data access or side effects.
- Validate the tenant ownership of referenced parents, organisations, documents and
  other related records. Database constraints should reinforce these boundaries.
- Use the application's Broker transaction mechanism for atomic multi-step changes.
- If the UI sends a tenant ID to detect a tenant switch during editing, compare it
  against verified access and reject a mismatch; never use it to replace verified access.
- Keep access results request-local. Recheck on every protected request so disabled
  users and revoked memberships take effect.

For example, an update predicate must include
`WHERE tenant_id=$1 AND entry_id=$2`, with `access.tenantId` as the first parameter.
Knowing another tenant's record ID must never be enough to read or change it.

## 11. Connect public JavaScript to the API

Through the same Gateway origin, the browser sends its SaaS cookies to your
application. The server-side identity client forwards the Cookie header to the
configured SaaS endpoint. Your application does not decode, sign, or manufacture
the session cookie. Docker networking permits service communication, while sharing
the browser origin through Gateway avoids cross-origin API calls.

For an approved Gateway route prefix `/example`, browser code in `public/app.js`
can call the context endpoint as follows:

```js
async function loadContext() {
  const response = await fetch('/example/api/context', {
    credentials: 'same-origin',
    headers: {accept:'application/json'},
    cache: 'no-store'
  });
  const data = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(data.error || 'Unable to load application'), {
      status: response.status
    });
  }
  return data;
}
```

Replace the example prefix with your configured route; do not hardcode a host name.
Handle 401 by offering the existing SaaS sign-in flow; 400 by offering tenant
selection; 403 by explaining access denial; and 503 as temporary unavailability.
Use SaaS's existing tenant-selection flow rather than setting `current_tenant` from
application JavaScript. Reload tenant-dependent data and discard stale responses
when tenant selection changes. Do not copy session tokens into browser storage.

The identity client is a server-side library, not a browser SDK. Cookie parsing and
SameSite cookies do not by themselves provide a complete CSRF policy for write APIs;
apply the application's agreed request-origin/CSRF protections for mutations.

## 12. Register hosting and launcher access separately

A folder alone does not create a deployed application. Platform setup also needs:

1. A Compose service using the selected Runtime image and the application's volume.
2. A matching Gateway route, with the intended prefix-stripping behaviour.
3. A SaaS application registration with the chosen application code and launch route.
4. The intended tenant/user application assignments.
5. A configured Broker database profile and SMTP profile only if required.

Compose and Gateway registrations must be manually aligned. Under this project's
instructions, changes to Compose, Gateway routes, Broker profiles and SMTP profiles
require explicit owner authorisation. This guide does not authorise or apply them.

The usual content mount is read-only, with a separate writable log mount:

```yaml
volumes:
  - ./Volumes/Core-Example:/app/content:ro
  - ./Volumes/Core-Example/logs:/app/content/logs
```

Create the lowercase `logs` host directory before startup. Fixed internal paths do
not constrain which host folders the deployment mounts there. Runtime's `/health`
checks the HTTP process only; it does not prove that identity or database calls work.
Do not modify or rebuild Runtime just to add an application using its existing contract.

## 13. Test identity and tenant behaviour without a running SaaS

The direct identity-client functions accept an optional fetch implementation for
tests. Example `test/access.test.js`, run with `npm test` in the application folder:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {requireTenant} = require('@core/identity-client');

const user = {user_id:'user-1', email:'member@example.test'};
const context = () => ({
  config: {identity:{url:'http://identity.test', timeoutMs:1000}},
  cookies: {current_tenant:'tenant-1'},
  req: {headers:{cookie:'core_session=signed; current_tenant=tenant-1'}}
});
const reply = data => async () => ({ok:true, json:async () => data});

test('accepts verified membership and returns the authoritative tenant', async () => {
  const result = await requireTenant(context(), reply({
    authenticated:true, user, current_tenant:'tenant-1'
  }));
  assert.equal(result.tenantId, 'tenant-1');
  assert.equal(result.auth.email, user.email);
});

test('denies invalid identity and a different tenant', async () => {
  assert.equal((await requireTenant(context(), reply({
    authenticated:false, user:null
  }))).status, 401);
  assert.equal((await requireTenant(context(), reply({
    authenticated:true, user, current_tenant:'tenant-2'
  }))).status, 403);
});

test('fails closed when SaaS is unavailable', async () => {
  const result = await requireTenant(context(), async () => {throw Error('offline');});
  assert.equal(result.status, 503);
});
```

These are client tests with synthetic identifiers, not real SaaS records. Also test
the application's actual handlers: unauthorised requests must stop before database
access or email delivery. Cover missing tenant (400), disabled membership, application
unavailability, missing business permissions, and cross-tenant record references.

For existing platform components:

```sh
node scripts/test-platform.cjs
node scripts/verify-platform.cjs
node scripts/verify-platform.cjs --live
```

The platform verifier uses the explicitly registered entries in
`deployment/components.json`. A new application is not discovered automatically;
add an entry and a suitable read-only rejection probe as an agreed tooling change.
Its live checks do not replace authenticated application tests or email-delivery tests.
The existing broader ERP regression tests require Node 24+ for node:sqlite; Runtime
continues to use its selected Node image independently of that developer test requirement.

## 14. Troubleshooting

| Symptom | Check |
| --- | --- |
| Cannot find `@core/identity-client` | Application node_modules is prepared from its manifest/lockfile; the vendor archive exists; Runtime does not include this package |
| `ctx.auth` / `ctx.tenantSession` is not a function | Handler explicitly applies application middleware, or imports the client function directly |
| Treating a Promise as a user | Consumer `ctx.auth()` must be awaited |
| A status/body object arrives with HTTP 200 | Handler must translate returned tenant-check failures using `ctx.send` |
| 401 | Browser session absent, invalid, expired, or SaaS reports no active identity |
| 400 for tenant | Select a tenant through SaaS |
| 403 for tenant | Selected cookie is not the active tenant membership verified by SaaS |
| 403 for application | Check exact registration code and SaaS's application-list/assignment rules |
| 503 | Check JSON identity URL, timeout, container connectivity and SaaS/Broker availability; do not bypass identity checks |
| Public files work but protected APIs fail | Public serving is independent of SaaS; test the identity path separately |
| Configuration/code edit has no effect | Restart for JSON or production API module changes |
| Logs cannot be written | Check writable nested mount, directory existence, ownership and case |
| `pg` works in the container but not from host Node | Image-built packages are under `/app/node_modules`; install the application's own dependency for host-side tools/tests |

## Source references

- [Identity client implementation](../../Packages/identity-client/index.js)
- [Service client implementation](../../Packages/service-client/index.js)
- [Runtime contract](../../Applications/Core-Runtime/README.md)
- [SaaS session verification](../../Volumes/Core-SaaS/api/auth/session.js)
- [SaaS session signing](../../Volumes/Core-SaaS/api/_shared/session.js)
- [SaaS application availability](../../Volumes/Core-SaaS/api/application/list.js)
- [Tasks application middleware](../../Volumes/Core-Tasks/api/_shared/context.js)
- [Tasks tenant guard and services](../../Volumes/Core-Tasks/api/_shared/tasks.js)
- [DBManager access checks](../../Volumes/Core-DBManager/api/_shared/access.js)
- [Package versioning and archives](../../Packages/README.md)

The guide is documentation only. No application registration, infrastructure edit,
database change, test email, image rebuild or service restart is performed by it.
