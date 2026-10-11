# Application identity and tenant membership

ERP, Tasks and ObjectSphere verify each server request through SaaS
`GET /api/auth/session`. They do not query SaaS tables or have a SaaS Broker
profile. SaaS checks the active user, active current tenant and active membership.

Core-Runtime exposes `ctx.tenantSession()` using the shared HTTP client in
`Applications/Core-Runtime/tenant-session.js`. The client forwards request cookies
to `config.saasURL` (default `http://core-saas:3000`), with a 10-second timeout
and no redirects. It returns verified identity and tenant ID only; SaaS roles,
user type and application assignments are excluded. It performs a fresh check
on each call. Invalid identity returns 401, no selected tenant 400, rejected
membership 403, and an unavailable or invalid SaaS response 503. Access is denied
when verification cannot be completed.

ERP continues to enforce its own organisation, role and module permissions.
Tasks and ObjectSphere do not infer application permissions from SaaS roles.
ObjectSphere setup import/export is available to every valid member of the
current tenant, including replacement imports and the existing optional OpenAI
settings transfer. Source export tenant IDs do not authorise access to that tenant;
imports remain scoped to the verified current tenant.

## Deployment and verification

Rebuild the shared runtime image and recreate ERP, Tasks and ObjectSphere together:

```sh
docker build -t core-runtime:1.0 Applications/Core-Runtime
docker compose up -d --no-deps --force-recreate core-erp core-tasks core-objectsphere
```

Their configuration now includes `saasURL` and only their own database profile.
No Broker or SaaS implementation changes or database migration are required.

Run the runtime membership tests, ERP tests and ObjectSphere tests. The runtime
tests exercise an HTTP call to the actual SaaS session handler, including revoked
membership, disabled identity and unavailable service. Deployed-container and
real PostgreSQL verification remains necessary in the deployment environment.
