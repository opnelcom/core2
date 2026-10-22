# Core Runtime 2.0.0

Generic Node HTTP server with built-in third-party technical dependencies. The image
contains no Core application packages, identity logic, service addresses, tenant rules,
or session secrets. Its initial dependency set is `pg` and `nodemailer`, installed from
the image's lockfile during the Docker build. Additional general-purpose packages can
be added deliberately when needed, without adding application integrations to Runtime.
It requires `/app/content/config/config.json` with an integer `port` (1–65535).
Optional technical settings: `name`, `maxBodyBytes` (default 1 MiB), `nodeEnv`,
`logToFile`, and `fileLogMode` (`all` or `failures`). `/health` reports HTTP process health;
it does not prove that databases or external services are available.

## Filesystem and API contract

- `/app/content/public`: static content, with index.html fallback and cache validators.
- `/app/content/api`: CommonJS handlers mapped from `/api/<path>` to `<path>.js`.
- `/app/content/node_modules`: dependencies installed by deployment, resolved by Node
  from the handler's directory. Runtime never installs packages or loads application middleware.
- `/app/node_modules`: built-in technical dependencies installed when building the image.
  Standard Node resolution makes these available to handlers under `/app/content/api`.
  An application-local dependency takes precedence over the built-in version.
- `/app/content/logs`: writable nested bind mount; the rest of content can be read-only.

A handler exports `async function(ctx)` and returns a JSON value, calls `ctx.send`,
or writes directly to `ctx.res`. Paths containing underscore-prefixed segments are
private helper modules and cannot be called as HTTP endpoints.

`ctx` contains `req`, `res`, `url`, `query`, `cookies`, `body`, `config`, `logger`,
`send(status, body, headers)`, `setCookie(name, value, options)`, `clearCookie(name)`,
`crypto`, and `requestId`. Cookie parsing/setting does not imply authentication.

Applications may explicitly wrap their handlers with their own middleware. Core
applications do this in `api/_shared/context.js`, using their installed client packages.
Those additions are application-owned and are not part of the Runtime contract.

## Breaking change from 1.x

`auth`, `signSession`, `tenantSession`, `broker`, and `smtp` are no longer injected.
`pg` and `nodemailer` remain available as built-in technical dependencies; Core-specific
client packages must belong to applications. Content/log paths are fixed; PORT,
CONTENT_ROOT, LOG_ROOT, and MAX_BODY_BYTES environment overrides are removed.
The health check reads the same JSON-configured port as the server.
Deploy migrated application code and its dependencies together with this image.

Run `npm ci` followed by `node --test test/*.test.js` for standalone tests;
no Core applications are needed.
