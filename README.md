# Core Platform

A runnable Docker-based Core foundation containing:

- Native Node.js shared runtime
- Native Node.js gateway/reverse proxy
- PostgreSQL database broker
- SMTP service with development log mode
- Core SaaS registration, activation, login, tenant selection and tenant membership
- Core Administration summary/user API
- Core Monitor service health checks
- Core ERP tenant-scoped notes example
- Core Tasks hierarchical task manager with rollup progress
- Core Tools static utility app with no database requirement
- PostgreSQL initialization schemas

## Start

```bash
cp .env.example .env
# Edit database credentials in .env.
# Edit application keys, SMTP settings and bootstrap admin email in Volumes/*/config/config.json.
docker compose build
docker compose up -d
docker compose ps
```

Open `http://localhost/`.

When `nodeEnv` is not `production`, registration returns the activation token in the JSON result. If SMTP host settings are empty, the SMTP service logs the activation message instead of sending it. The account whose email matches `bootstrapAdminEmail` in `Volumes/Core-SaaS/config/config.json` is promoted to `administration_user` during activation.

## Clean database reset

Only use this when existing database data can be deleted:

```bash
docker compose down
sudo rm -rf Volumes/Databases/Core-SaaS/Data/pgdata
sudo rm -rf Volumes/Databases/Core-ERP/Data/pgdata
sudo rm -rf Volumes/Databases/Core-Tasks/Data/pgdata
docker compose up -d --build
```

`PGDATA` uses a subdirectory beneath each mount point to avoid PostgreSQL's mount-point initialization error.

## Logs

```bash
docker compose logs -f core-db-saas
docker compose logs -f core-broker
docker compose logs -f core-saas
docker compose logs -f core-gateway
```

## Broker database status

The broker starts independently of configured databases. To check which configured database connections are currently reachable from another container on the application network, call:

```bash
curl -X POST http://core-broker:3000/api/broker/status -H "x-core-key: <internalKey from Volumes/Core-Broker/config/config.json>"
```

## Core SaaS APIs

Authentication and profile endpoints are served by `core-saas` under `/api/`:

- `POST /api/auth/register`
- `POST /api/auth/activate`
- `POST /api/auth/resendactivation`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/forgotpassword`
- `POST /api/auth/resetpassword`
- `GET /api/auth/session`
- `GET /api/user/me`
- `GET /api/user/profile`
- `POST/PATCH /api/user/profile`
- `POST /api/user/changepassword`

## Security notes

The supplied `.env.example` and service `config.json` files contain development placeholders. Replace them before use. Production deployment still requires TLS termination, secret management, backups, rate limiting, audit logging and a reviewed database migration process.
