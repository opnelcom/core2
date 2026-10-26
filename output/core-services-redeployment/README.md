# Redeploy Gateway, Broker and SMTP to another server

Scope: a separate Docker Compose deployment using `opnelcom` Docker Hub images and an existing external PostgreSQL server. This is documentation only: no service configuration, image publication or deployment has been performed.

## 1. Understand what must be transferred

| Component | Image | Deployment content |
| --- | --- | --- |
| Gateway | `opnelcom/core-gateway:1.0.0` | New `config/gateway.json`, TLS certificates, writable logs |
| Broker | `opnelcom/core-runtime:2.0.0` | Broker API source and new `config/config.json` |
| SMTP | `opnelcom/core-runtime:2.0.0` | SMTP API source and new `config/config.json` |

These image names must already be published and accessible to the target server. Runtime does **not** contain the Broker or SMTP application code. Transfer that code separately, from the same reviewed source release. No Core-SaaS, ERP or platform database is required.

Gateway is the entry point for a future CRM or other application. Broker and SMTP remain internal services; this guide deliberately gives them no public Gateway routes or published ports. Gateway can start without application routes and return 404 for ordinary requests until an application is registered.

## 2. Prepare the target environment

- Install Docker Engine and the Docker Compose plugin, or Docker Desktop using Linux containers.
- Provide access to Docker Hub. Run `docker login` if the repositories are private.
- Ensure the external PostgreSQL host is reachable from Docker containers and permits the deployment server through its firewall and PostgreSQL access rules.
- Provision the database and a suitably restricted database role separately. Broker neither creates the CRM schema nor enforces CRM user or tenant permissions.
- Provide SMTP provider credentials and permit outbound access to its SMTP port.
- For HTTPS, provide a domain, DNS record and valid certificate/key. Avoid port conflicts with other services on the target server.

**External PostgreSQL TLS limitation:** the current Broker constructs `pg` connections from host, port, database, user, password and pool settings. It does not pass a profile `ssl` object to `pg`; adding `ssl` to the JSON alone does not enable TLS. Confirm the external database's TLS requirements before deployment. If verified TLS is required, use an explicitly designed transport arrangement or obtain authorization for the necessary Broker change. Do not disable a database provider's TLS requirement just to fit this example. The examples below assume connectivity compatible with the current Broker, such as an appropriately protected private network.

## 3. Create a clean deployment directory

```text
core-services/
  compose.yaml
  Volumes/
    Core-Gateway/
      config/gateway.json
      certs/                  # required only when TLS is enabled
      logs/
    Core-Broker/
      api/
        _shared/broker.js
        broker/profiles.js
        broker/query.js
        broker/status.js
        broker/transaction.js
      package.json
      package-lock.json
      config/config.json
      logs/
    Core-SMTP/
      api/mail/send.js
      package.json
      package-lock.json
      config/config.json
      logs/
```

Copy the API directories and package manifests from the matching `Volumes/Core-Broker` and `Volumes/Core-SMTP` source release. The optional `public` folders are not needed for service API operation. Do not transfer existing profiles, logs, passwords, certificates or `node_modules` from the source environment.

The current Runtime includes the required `pg` and `nodemailer` packages. Broker and SMTP do not require a separate dependency install for this deployment. Reassess this if their dependencies change in a later release.

Create all bind-mount directories before starting Docker. Keep deployment secrets and private keys out of Git and out of image builds. Restrict access to the deployment directory; back it up securely.

## 4. Configure Broker for external PostgreSQL

Create `Volumes/Core-Broker/config/config.json`:

```json
{
  "name": "core-broker",
  "port": 3000,
  "logToFile": true,
  "fileLogMode": "failures",
  "maxBodyBytes": 1048576,
  "dbProfiles": [
    {
      "name": "crm",
      "profileKey": "REPLACE_WITH_UNIQUE_BROKER_KEY",
      "host": "postgres.internal.example",
      "port": 5432,
      "database": "crm",
      "user": "crm_service",
      "password": "REPLACE_WITH_DATABASE_PASSWORD",
      "poolMax": 4,
      "poolIdleTimeoutMillis": 10000,
      "connectionTimeoutMillis": 5000
    }
  ]
}
```

Use the real database hostname, database name, role and password. `localhost` inside Broker means the Broker container, not the external server. Use a unique random profile key for each profile and environment. For example, generate a key locally with Node:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Generate a separate key for SMTP. Keys are application-to-service credentials and must remain in server-side configuration. The JSON files use literal values: `${VARIABLE}` strings are not automatically expanded by Runtime or Broker.

## 5. Configure SMTP

Create `Volumes/Core-SMTP/config/config.json`:

```json
{
  "name": "core-smtp",
  "port": 3000,
  "logToFile": true,
  "fileLogMode": "failures",
  "smtpProfiles": [
    {
      "name": "crm",
      "profileKey": "REPLACE_WITH_UNIQUE_SMTP_KEY",
      "host": "smtp.example.com",
      "port": 587,
      "secure": false,
      "tlsRejectUnauthorized": true,
      "user": "crm@example.com",
      "password": "REPLACE_WITH_SMTP_PASSWORD",
      "from": "crm@example.com"
    }
  ]
}
```

Match the provider's settings. `secure: true` is normally used for implicit TLS on port 465; port 587 normally starts without implicit TLS and can upgrade with STARTTLS. The current handler does not expose a `requireTLS` transport option, so confirm provider policy if STARTTLS must be mandatory. Keep certificate verification enabled. An empty SMTP host activates development mode and does not deliver email.

## 6. Configure Gateway

For initial verification, create `Volumes/Core-Gateway/config/gateway.json`:

```json
{
  "hostname": "localhost",
  "port": 3000,
  "tls": { "enabled": false },
  "routes": []
}
```

An empty route list is valid. `/health` works and other paths return 404. When the CRM is deployed, register its service in Compose and add a route, for example:

```json
{
  "prefix": "/",
  "target": "http://crm:3000",
  "stripPrefix": false
}
```

The target must be reachable on a shared Docker network. The current Gateway supports HTTP upstream targets and path-prefix routing. It does not authenticate CRM users or provide hostname-based application routing.

## 7. Compose reference

Save the following as `compose.yaml` in the **new environment**, not over the existing SaaS14 file:

```yaml
name: core-services

x-runtime: &runtime
  image: opnelcom/core-runtime:2.0.0
  restart: unless-stopped
  init: true
  security_opt: ["no-new-privileges:true"]
  healthcheck:
    test: ["CMD", "node", "/app/healthcheck.js"]
    interval: 30s
    timeout: 5s
    retries: 5
    start_period: 15s

services:
  core-broker:
    <<: *runtime
    volumes:
      - ./Volumes/Core-Broker:/app/content:ro
      - ./Volumes/Core-Broker/logs:/app/content/logs
    networks: [application, outbound]

  core-smtp:
    <<: *runtime
    volumes:
      - ./Volumes/Core-SMTP:/app/content:ro
      - ./Volumes/Core-SMTP/logs:/app/content/logs
    networks: [application, outbound]

  core-gateway:
    image: opnelcom/core-gateway:1.0.0
    restart: unless-stopped
    init: true
    security_opt: ["no-new-privileges:true"]
    ports: ["127.0.0.1:8080:3000"]
    volumes:
      - ./Volumes/Core-Gateway:/app/content:ro
      - ./Volumes/Core-Gateway/logs:/app/content/logs
    networks: [application, outbound]
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - "require('http').get('http://127.0.0.1:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 15s

networks:
  application:
    name: core-services-application
    driver: bridge
    internal: true
  outbound:
    driver: bridge
```

The shared Runtime definition standardises service health and security options. Broker needs outbound connectivity to external PostgreSQL; SMTP needs it for the mail provider. Only Gateway publishes a port, initially bound to loopback for local verification on the target server. Adjust host firewall rules for the intended production exposure.

The explicit network name allows another Compose project on this server to join using:

```yaml
networks:
  application:
    external: true
    name: core-services-application
```

Attach the consuming application service to that network. Its server-side URLs are:

- `http://core-broker:3000/api/broker/query`
- `http://core-broker:3000/api/broker/transaction`
- `http://core-broker:3000/api/broker/status`
- `http://core-smtp:3000/api/mail/send`

Use unique service aliases if multiple stacks share a network. This setup assumes applications on the same Docker host. Cross-host consumers need a separate private connectivity and transport design; Docker bridge DNS does not span servers automatically.

## 8. Pull and start

Run in the new deployment directory:

```sh
docker login
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail 100
```

Check each command succeeds. `config --quiet` checks Compose syntax, not JSON profiles, credentials or external connectivity. Open `http://localhost:8080/health` on the target server. Expect Gateway status `ok`. Opening `/` returns 404 until an application route is configured.

## 9. Verify external connections without publishing internal APIs

Use container-side Node scripts so keys are read from their mounted JSON rather than passed as command-line literals. The commands below work as single-line shell commands. They use Node's fetch available in the current image.

Broker status check (connects to external PostgreSQL and executes `SELECT 1`):

```sh
docker compose exec -T core-broker node -e 'const c=require("/app/content/config/config.json"),p=c.dbProfiles[0]; fetch("http://127.0.0.1:3000/api/broker/status",{method:"POST",headers:{"content-type":"application/json","x-core-key":p.profileKey},body:JSON.stringify({brokerProfile:p.name}),signal:AbortSignal.timeout(15000)}).then(async r=>{const b=await r.json();console.log(JSON.stringify(b,null,2));if(!r.ok||b.summary?.not_running)process.exitCode=1}).catch(e=>{console.error(e.message);process.exitCode=1})'
```

These examples use POSIX-style shell quoting; on Windows PowerShell, save the JavaScript inside the quotes into a local `.js` file and pipe it instead, for example `Get-Content -Raw check-broker.js | docker compose exec -T core-broker node`. Do not include the outer shell quotes in the file.

For SMTP, save this as a temporary `check-smtp.js` **on the target server**, replace the recipient with an address you control, and run it only when ready to send a real test email:

```js
const c = require('/app/content/config/config.json');
const p = c.smtpProfiles[0];
if (!p.host) throw Error('SMTP host is empty; delivery would be simulated');
fetch('http://127.0.0.1:3000/api/mail/send', {
  method: 'POST',
  headers: {'content-type': 'application/json', 'x-core-key': p.profileKey},
  body: JSON.stringify({profile: p.name, to: 'REPLACE_WITH_TEST_RECIPIENT',
    subject: 'Core SMTP deployment test', text: 'SMTP deployment check.'}),
  signal: AbortSignal.timeout(30000)
}).then(async r => {
  const b = await r.json();
  console.log(JSON.stringify(b, null, 2));
  if (!r.ok || b.development || !b.accepted?.length) process.exitCode = 1;
}).catch(e => { console.error(e.message); process.exitCode = 1; });
```

Linux shell:

```sh
docker compose exec -T core-smtp node < check-smtp.js
```

PowerShell:

```powershell
Get-Content -Raw check-smtp.js | docker compose exec -T core-smtp node
```

Confirm the recipient actually receives the email; provider acceptance alone is not proof of inbox delivery. Process health checks do not check PostgreSQL or SMTP availability. Also test one request from the real consuming application to verify shared-network connectivity and matching keys.

## 10. Enable production HTTPS

Place the new environment's `fullchain.pem` and `privkey.pem` under `Volumes/Core-Gateway/certs`, then replace Gateway configuration with:

```json
{
  "hostname": "crm.example.com",
  "port": 3000,
  "tls": {
    "enabled": true,
    "port": 3443,
    "certFile": "certs/fullchain.pem",
    "keyFile": "certs/privkey.pem",
    "redirectHttpToHttps": true,
    "hsts": true
  },
  "routes": []
}
```

Replace Gateway's `ports` entry with:

```yaml
ports:
  - "80:3000"
  - "443:3443"
```

Configure DNS and firewall access, then run `docker compose up -d` and `docker compose restart core-gateway`. Check `https://crm.example.com/health`. Add the CRM route when its service exists. Gateway does not issue or renew certificates: arrange renewal separately and restart Gateway after certificate replacement. Its HTTP-to-HTTPS redirect assumes standard external port 443. Enable HSTS after validating HTTPS operation.

## 11. Updates, rollback and troubleshooting

- Track **both image versions and Broker/SMTP source versions** for every release. Pin published digests if immutable deployment references are required.
- To upgrade images, edit their references in the new Compose file, then run `docker compose pull` and `docker compose up -d`.
- To upgrade Broker/SMTP content, stage a reviewed source release, preserve environment configuration, replace the relevant API content and restart that service. Re-run connection checks.
- Restart Runtime services after configuration changes. Broker reloads profile configuration per request, but restarting also clears old connection pools; SMTP uses startup configuration. Gateway routes reload per request; ports and TLS require restart.
- For rollback, restore the previous image references and matching application source, recreate containers and verify. Keep configuration backups secure. External database backups and schema rollback belong to the application/database owner.
- Pull denied: check image publication, tag, visibility and Docker Hub access.
- Startup failure: check JSON validity, numeric port, mounted files and filesystem permissions.
- Broker connection failure: check DNS from the container, network route, database firewall, PostgreSQL access policy, credentials and TLS requirements.
- 403 from Broker/SMTP: check profile name and `x-core-key`. Use separate keys per profile. Broker's profiles endpoint accepts any configured profile key and exposes metadata for all profiles; consider this when grouping unrelated clients.
- SMTP accepted with `development: true`: no SMTP host was configured; no email was sent.
- Gateway 502 after adding CRM: check service DNS name, port, shared network and application health.
- Missing log files: inspect Docker logs and verify the writable nested logs mount. Failure-only mode intentionally omits successful requests from Runtime files; Gateway logs visitor/request metadata separately.

Keep CRM business logic, login, authorisation and tenant checks in the consuming application. Broker grants database access using its configured role and does not provide end-user authorisation. Gateway's visitor cookie is not a login session.

## Source contract

Prepared from the local Gateway and Runtime source, Runtime README, Broker handlers and SMTP handler. No external services were contacted, test email sent, protected infrastructure edited or deployments executed during preparation.
