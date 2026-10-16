# Project instructions

## general instructions

- Interrogate my requests
- Dont assume. Ask questions to confirm requirements, approach and outcomes
- List high level areas of changes and request confirmation before implementing changes

## Infrastructure protection

- When implementing or modifying a user application, changes must stay within that application's folders.
- The following infrastructure paths are protected:
  - `Applications/Core-Gateway/**`
  - `Applications/Core-Runtime/**`
  - `Volumes/Core-Gateway/**`
  - `Volumes/Core-Broker/**`
  - `Volumes/Core-SMTP/**`
- User application requirements must not introduce business/application logic into infrastructure. Use the existing configuration and APIs.
- If a requirement appears to need an infrastructure change, stop before editing, explain why, list the proposed files and effects, and obtain explicit user authorization.
- Gateway route registrations, Broker database profiles, SMTP profiles, and changes to `compose.yaml` also require explicit user authorization.

## Core platform instructions

- Core (inside SaaS14) is a multi-tenant, multi-application web platform
- Its called core as it provides a central point to manage applications, users and tenants (shared workspaces)
- NodeJS application code, PostgreSQL as default database platform, docker for deployment and git for code control
- It is deployable and therefore all config (except passwords) is retrieve dynamically from json conf files
- It consists of 2 images: Gateway and Application
- The Gateway is a reverse proxy to one or more applications using the application image.
- The Application image loads both an API layer and a public html, css, javascript and asset folder
- Each application is defined in the docker compose file and provide a volume where the APIs and public content are accessible.
- Docker provides secure application to application communication without CORS issues.
- Multiple application can use the same image and host their own API and public content without rebuilding the application image
- All application logic are hosted in APIs and user interface defined in public html

## Image: Gateway

- The Gateway is a reverse proxy to one or more applications loaded using docker.
- Each application is listed in the gateway config json file as well as how the application can be contacted.
- The docker compose file listing of each application and each application listed in the gateway json config file must be manually aligned for security purposes.

## Image: Runtime

- The is an application runtime.
- An application is defined in the docker compose file, uses this image and specifies a volume containing the application contents
- This image uses either API folder and dynamically loads each file in all subfolders, providing a realtime api service specific to that application or a PUBLIC folder that contains HTML content (HTML, CSS, javascript and images).
- Once an application is loaded using docker, access to granted via the Gateway
- Again, this runtime is purely technical infrastructure and contains no business/application logic.

## Volumes

Each folder below contains application content, infrastructure configuration,
or persistent deployment data.

- `Core-Admin`: Platform administration for users, tenants, memberships,
  application registrations and assignments, and themes.

- `Core-Broker`: Shared PostgreSQL access service using configured database
  profiles. Executes queries and transaction batches, checks access, and
  provides status and logging. Contains no application business rules.

- `Core-DBManager`: Tenant database connection management, PostgreSQL
  catalogue inspection, and migration tools that generate INSERT scripts.

- `Core-ERP`: Tenant-scoped ERP with organisations, divisions, master data,
  configurable business objects, accounting, fiscal periods, workflows,
  and reporting. Includes application schemas, seeds, and tests.

- `Core-Gateway`: Reverse-proxy configuration, TLS certificates,
  ACME challenge files, and gateway logs. Routes requests to applications.

- `Core-Monitor`: Platform monitoring for application health, Docker
  container status and resource usage, and Broker database profiles.

- `Core-ObjectSphere`: Tenant-scoped hierarchical object and asset
  management with configurable types and attributes, events, valuations,
  photos, documents, and AI-assisted imports.

- `Core-Reference`: Browser-based reference tools, including an atlas,
  coordinate conversion, distance calculations, Base64, and text utilities.
  Requires no application database.

- `Core-SaaS`: User registration, authentication, profile management,
  tenant selection and membership, and application launching.

- `Core-SMTP`: Shared email delivery API using configured SMTP profiles,
  with request logging and a development log mode.

- `Core-Tasks`: Tenant-scoped hierarchical task management with ordering,
  progress rollups, archiving, document attachments, and AI-assisted
  voice input.

- `Core-Tools`: Browser-based utilities, including a world map,
  Base64 encoding and decoding, and a sector generator.
  Requires no application database.

- `Certbot`: Certificate account, issued-certificate, and renewal state.
  The current compose.yaml does not define a Certbot service.

- `Databases`: PostgreSQL initialisation scripts, persistent data,
  and backup directories for Core-SaaS, Core-ERP, Core-ObjectSphere,
  Core-Tasks, and Core-DBManager. Core-ERP also has a Seed directory.
