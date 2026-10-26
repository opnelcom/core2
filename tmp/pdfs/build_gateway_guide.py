from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Preformatted, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT

ROOT=Path('Y:/projects/saas14')
OUT=ROOT/'output/pdf/gateway-runtime-implementation-guide.pdf'
OUT.parent.mkdir(parents=True,exist_ok=True)
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='BodyGuide',fontName='Helvetica',fontSize=10,leading=14,spaceAfter=9,textColor=colors.HexColor('#243447')))
styles.add(ParagraphStyle(name='CodeGuide',fontName='Courier',fontSize=8,leading=10,backColor=colors.HexColor('#eef3f8'),borderPadding=9,spaceBefore=5,spaceAfter=12))
styles['Title'].textColor=colors.HexColor('#123452')
styles['Heading1'].textColor=colors.HexColor('#123452')
story=[]
def p(s): story.append(Paragraph(s,styles['BodyGuide']))
def h(s): story.append(Paragraph(s,styles['Heading2']))
def code(s): story.append(Preformatted(escape(s.strip('\n')),styles['CodeGuide']))
def page(n,title):
    if story: story.append(PageBreak())
    story.append(Paragraph(f'{n:02d} / {title}',styles['Heading1']))
    story.append(Spacer(1,10))

page(1,'Gateway & Runtime implementation guide')
p('<b>A reusable foundation for a standalone CRM</b><br/>SaaS14 source review | 22 October 2026')
p('Deploy the existing Gateway and Runtime images in a separate project. SaaS, ERP, platform user management and platform tenant management are not required. This guide includes a complete local HTTP deployment, HTTPS configuration, publishing, and optional Broker and SMTP services.')
h('Architecture')
code('Browser\n  | HTTP / HTTPS\nGateway (published ports)\n  | internal HTTP\nCRM Runtime: public/ + api/ + config/\n  | optional server-to-server calls\nBroker -> PostgreSQL        SMTP -> mail provider')
p('<b>Gateway:</b> routes requests by URL prefix, terminates TLS, forwards request metadata, issues a visitor cookie and writes logs. It does not authenticate users.')
p('<b>Runtime:</b> serves static files and maps API URLs to CommonJS handler files. Each container mounts its own content at /app/content. Built-in technical packages include pg and nodemailer.')
p('<b>Broker and SMTP:</b> optional content packages running in additional Runtime containers. Their source folders are not included in the Runtime image.')
h('Release names used in this guide')
code('opnelcom/core-gateway:1.0.0\nopnelcom/core-runtime:2.0.0')
p('These are intended publication names, not confirmation that the images exist on Docker Hub. Examples use port 8080 for local HTTP and crm.example.com as a domain placeholder. Replace all example credentials before deployment.')
p('<b>Validation boundary:</b> examples follow the repository source contract. This document does not represent a completed Docker build, image publication or live deployment test.')

page(2,'Build and publish the images')
p('Prerequisites: Docker Engine or Docker Desktop using Linux containers, a Docker Hub account, and access to the SaaS14 image sources. Create core-gateway and core-runtime repositories under opnelcom and explicitly select their visibility.')
h('Run in PowerShell from the source repository')
code('Set-Location Y:\\projects\\saas14\ndocker login\ndocker build -t opnelcom/core-gateway:1.0.0 ./Applications/Core-Gateway\ndocker build -t opnelcom/core-runtime:2.0.0 ./Applications/Core-Runtime\ndocker push opnelcom/core-gateway:1.0.0\ndocker push opnelcom/core-runtime:2.0.0')
p('Check that each command succeeds before continuing. In Docker Hub, confirm both tags appear. Private repositories require docker login on deployment machines as well.')
h('What is published')
p('Gateway copies package.json and server.js. Runtime installs its locked dependencies and copies server.js, config.js and healthcheck.js. Neither Dockerfile copies the Volumes folder, application code, certificates or deployment credentials.')
h('Version discipline')
p('Publish a new version when image code or dependencies change. Keep released tags stable and reference explicit versions in Compose. For stricter reproducibility, deploy the published image digest. Updating mounted CRM content does not require rebuilding Runtime unless its technical dependencies change.')
h('Target CPU architecture')
p('The standard build above targets the builder platform. If deployment includes both x86-64 and ARM64, use a builder that supports both, and publish a multi-platform image:')
code('docker buildx build --platform linux/amd64,linux/arm64 `\n  -t opnelcom/core-runtime:2.0.0 --push ./Applications/Core-Runtime')
p('Use the equivalent Gateway context and tag for Gateway. Both current Dockerfiles use node:20-alpine; assess base-image support and dependency updates as part of release maintenance before production use.')

page(3,'Create the standalone project')
p('Create a new project directory. All paths below are relative to that directory. The new project consumes the published images; it needs no image build folders.')
code('crm-project/\n  compose.yaml\n  Volumes/\n    CRM/\n      config/config.json\n      api/ping.js\n      api/_shared/       # private reusable helpers\n      public/index.html\n      logs/\n    Gateway/\n      config/gateway.json\n      logs/\n      certs/            # needed when TLS is enabled')
h('Volumes/CRM/config/config.json')
code('{\n  "name": "crm",\n  "port": 3000,\n  "maxBodyBytes": 1048576,\n  "logToFile": true,\n  "fileLogMode": "failures"\n}')
h('Volumes/Gateway/config/gateway.json - local HTTP')
code('{\n  "hostname": "localhost",\n  "port": 3000,\n  "tls": { "enabled": false },\n  "routes": [\n    {\n      "prefix": "/",\n      "target": "http://crm:3000",\n      "stripPrefix": false\n    }\n  ]\n}')
p('The Gateway target crm is the Compose service name. Incoming /api/ping reaches /api/ping in CRM. For a /crm prefix, use prefix /crm and stripPrefix true; ensure browser asset and API URLs include /crm. Gateway selects the longest matching route prefix.')
p('Runtime reads its JSON at process startup. Restart its container after configuration changes. Production handler modules are cached; restart CRM after API code changes. Gateway reads routing configuration on each request, but listener ports and TLS files are loaded at startup.')

page(4,'Complete local Compose deployment')
p('Save as compose.yaml. Create the folders and configuration files from page 3 and the application files on page 5 before starting. Only Gateway publishes a host port.')
code('''name: crm-project
services:
  crm:
    image: opnelcom/core-runtime:2.0.0
    restart: unless-stopped
    init: true
    volumes:
      - ./Volumes/CRM:/app/content:ro
      - ./Volumes/CRM/logs:/app/content/logs
    networks: [application]
    healthcheck:
      test: ["CMD", "node", "/app/healthcheck.js"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 15s
    security_opt: ["no-new-privileges:true"]

  gateway:
    image: opnelcom/core-gateway:1.0.0
    restart: unless-stopped
    init: true
    ports: ["8080:3000"]
    volumes:
      - ./Volumes/Gateway:/app/content:ro
      - ./Volumes/Gateway/logs:/app/content/logs
    networks: [frontend, application]
    depends_on:
      crm: {condition: service_healthy}
    security_opt: ["no-new-privileges:true"]

networks:
  frontend:
    driver: bridge
  application:
    driver: bridge
    internal: true
''')
code('docker compose config --quiet\ndocker compose pull\ndocker compose up -d\ndocker compose ps\nInvoke-RestMethod http://localhost:8080/api/ping')
p('Open http://localhost:8080/ for the UI. Runtime health checks confirm process health, not database or mail delivery. /health through Gateway checks Gateway itself; /api/ping also verifies proxying to CRM.')

page(5,'Implement reusable CRM content')
h('Volumes/CRM/public/index.html')
code('''<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CRM</title>
<h1>CRM</h1>
<p id="status">Connecting...</p>
<script>
fetch('/api/ping')
  .then(r => { if (!r.ok) throw Error('Unavailable'); return r.json(); })
  .then(x => { document.querySelector('#status').textContent = x.message; })
  .catch(() => { document.querySelector('#status').textContent = 'Unavailable'; });
</script>
</html>''')
h('Volumes/CRM/api/ping.js')
code('''\'use strict\';
module.exports = async ctx => {
  if (ctx.req.method !== 'GET') {
    return ctx.send(405, {error: 'GET required'}, {allow: 'GET'});
  }
  return {message: 'CRM Runtime is ready', requestId: ctx.requestId};
};''')
h('Runtime handler contract')
p('A handler receives ctx and returns JSON, calls ctx.send(status, body, headers), or writes to ctx.res. Available values include req, res, url, query, cookies, body, config, logger, crypto, requestId, setCookie and clearCookie.')
p('For example, /api/customers/list maps to api/customers/list.js. Files or folders beginning with an underscore are private to HTTP routing, making api/_shared suitable for reusable validation, service clients and permission checks.')
p('Runtime parses JSON and URL-encoded bodies. Other content is passed as a UTF-8 raw string; binary or multipart uploads need deliberate application handling. Missing static paths fall back to public/index.html.')
h('Application ownership')
p('Implement login, session verification, authorisation, CRM rules and any tenant filtering in the CRM application. Runtime does not automatically apply middleware. Reusable wrappers can explicitly protect each API handler. Never treat the Gateway core_visitor cookie as proof of identity.')
p('Runtime does not install mounted application dependencies. Install additional Linux-compatible packages into /app/content/node_modules during deployment, using the application package manifest and lockfile. Avoid copying Windows native modules into Linux containers.')

page(6,'Enable HTTPS and configure routing')
p('Point your domain to the deployment host and obtain a valid certificate for it. Certificate issuance and renewal are separate operational tasks; Gateway can serve ACME challenge files but does not request or renew certificates itself.')
h('Replace the Gateway JSON for production')
code('''{
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
  "acme": {"challengeRoot": "acme/.well-known/acme-challenge"},
  "routes": [
    {"prefix": "/", "target": "http://crm:3000", "stripPrefix": false}
  ]
}''')
p('Place fullchain.pem and privkey.pem in Volumes/Gateway/certs. Keep the private key out of source control and Docker Hub. Ensure the Gateway process can read the files.')
h('Change Gateway ports in the new Compose file')
code('ports:\n  - "80:3000"\n  - "443:3443"')
p('Allow inbound TCP 80 and 443. The existing redirect implementation constructs an HTTPS URL without a custom port; the standard external HTTPS port 443 fits this configuration.')
code('docker compose up -d\ndocker compose restart gateway\nInvoke-RestMethod https://crm.example.com/api/ping')
p('Restart Gateway after replacing certificates to reload TLS. Use HSTS only after HTTPS is working reliably. Route targets currently support internal http: URLs, not https: upstreams.')
h('Multiple applications')
p('Additional Runtime services can share this Gateway using prefixes such as /crm and /reports. Each receives its own content volume and configuration. Update both Compose service definitions and Gateway routes together. Do not route Broker or SMTP to the public browser interface.')

page(7,'Optional Broker and SMTP services')
p('Copy the reusable Core-Broker and Core-SMTP content folders into the new project. Retain their api and package manifests, but provide fresh configuration. Do not copy existing credentials, logs, database profiles or certificates. Both run on opnelcom/core-runtime:2.0.0.')
h('Add service definitions under services in Compose')
code('''  broker:
    image: opnelcom/core-runtime:2.0.0
    restart: unless-stopped
    volumes:
      - ./Volumes/Core-Broker:/app/content:ro
      - ./Volumes/Core-Broker/logs:/app/content/logs
    networks: [application, database]
  smtp:
    image: opnelcom/core-runtime:2.0.0
    restart: unless-stopped
    volumes:
      - ./Volumes/Core-SMTP:/app/content:ro
      - ./Volumes/Core-SMTP/logs:/app/content/logs
    networks: [application, outbound]
  db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: crm
      POSTGRES_USER: crm_user
      POSTGRES_PASSWORD: ${CRM_DB_PASSWORD:?Set CRM_DB_PASSWORD}
    volumes: ["crm-db:/var/lib/postgresql/data"]
    networks: [database]''')
p('Add these entries under the existing networks section, and volumes at the top level. SMTP needs outbound access to its provider; PostgreSQL does not need a published host port.')
code('''  database:
    driver: bridge
    internal: true
  outbound:
    driver: bridge

volumes:
  crm-db:''')
p('Set CRM_DB_PASSWORD in a local .env file excluded from source control. Broker configuration must contain the matching database password; its JSON is not automatically interpolated from Compose environment variables. Provision database tables and migrations through CRM-owned scripts.')
p('Apply the Runtime health check, init and security settings from page 4 to these Runtime services as appropriate. Configure startup readiness and retry transient database connections in the application.')

page(8,'Profiles and internal service calls')
h('Volumes/Core-Broker/config/config.json')
code('''{
  "name": "crm-broker", "port": 3000,
  "dbProfiles": [{
    "name": "crm", "profileKey": "REPLACE_BROKER_KEY",
    "host": "db", "port": 5432, "database": "crm",
    "user": "crm_user", "password": "MATCH_CRM_DB_PASSWORD"
  }]
}''')
h('Volumes/Core-SMTP/config/config.json')
code('''{
  "name": "crm-smtp", "port": 3000,
  "smtpProfiles": [{
    "name": "crm", "profileKey": "REPLACE_SMTP_KEY",
    "host": "smtp.example.com", "port": 587, "secure": false,
    "tlsRejectUnauthorized": true,
    "user": "crm@example.com", "password": "REPLACE_SMTP_PASSWORD",
    "from": "crm@example.com"
  }]
}''')
p('Use independent random service keys. Add application-owned broker and mail settings to CRM config:')
code('''"broker": {"url": "http://broker:3000/api/broker/query",
           "profile": "crm", "key": "REPLACE_BROKER_KEY"},
"mail": {"url": "http://smtp:3000/api/mail/send",
         "profile": "crm", "key": "REPLACE_SMTP_KEY"}''')
h('CRM server-side call pattern')
code('''const b = ctx.config.broker;
const response = await fetch(b.url, {
  method: 'POST',
  headers: {'content-type': 'application/json', 'x-core-key': b.key},
  signal: AbortSignal.timeout(10000),
  body: JSON.stringify({brokerProfile: b.profile,
    text: 'SELECT $1::text AS message', values: ['CRM connected']})
});
if (!response.ok) throw Error('Database service unavailable');
const result = await response.json();''')
p('Put shared clients in CRM api/_shared and call them from authenticated handlers. Use parameterised SQL and enforce access rules before queries. Broker permits SQL within the database role privileges; it does not enforce CRM user permissions. For transactions, POST brokerProfile and statements to /api/broker/transaction. Mail uses profile, to, subject, text and/or html at /api/mail/send, with its own x-core-key header.')

page(9,'Operate, troubleshoot and maintain')
h('Routine commands')
code('docker compose ps\ndocker compose logs --tail 100 gateway crm\ndocker compose restart crm\ndocker compose pull\ndocker compose up -d')
p('After changing an image version in Compose, pull and recreate the affected service. After changing mounted API code or Runtime configuration, restart that Runtime service. Keep a previous image version and a matching content release for rollback; database migrations need their own recovery plan.')
h('Symptoms and checks')
p('<b>Image pull denied:</b> verify the opnelcom repository, version tag, visibility and docker login permissions.')
p('<b>Runtime exits:</b> verify /app/content/config/config.json exists and port is an integer. Environment variables such as PORT and CONTENT_ROOT do not override the current fixed contract.')
p('<b>Gateway 502:</b> check target service name, target port, shared network and CRM logs. A Gateway /health response alone does not prove CRM is reachable.')
p('<b>API 404:</b> confirm api/path.js exports a function and the requested path is /api/path. Underscore-prefixed paths cannot be called directly.')
p('<b>TLS fails:</b> verify hostname, certificate chain, key permissions, published ports and Gateway restart after certificate replacement.')
p('<b>Broker or SMTP 403:</b> check the selected profile and x-core-key. Keep credentials server-side. A missing SMTP host returns development acceptance without sending mail.')
h('Production ownership')
p('Back up PostgreSQL and application uploads, protect configuration and TLS keys, rotate credentials and retain logs appropriately. Gateway visitor logs include client metadata; define access and retention rules. Use unique Broker keys per profile: its profiles endpoint accepts any configured profile key and lists metadata for all profiles.')
p('The base example is a deployment starting point. Implement CRM session security, authorisation, input validation, rate controls and operational monitoring according to application requirements. Keep business rules in CRM content rather than Gateway, Runtime, Broker or SMTP.')
h('Source basis and further reading')
p('Repository basis: Applications/Core-Gateway/{Dockerfile,server.js}; Applications/Core-Runtime/{Dockerfile,README.md,server.js,config.js,healthcheck.js}; Volumes/Core-Broker/api; Volumes/Core-SMTP/api/mail/send.js; compose.yaml. Reviewed for this guide on 22 October 2026.')
p('Docker image publishing: <link href="https://docs.docker.com/docker-hub/repos/manage/hub-images/push/" color="#17679b">docs.docker.com/docker-hub/repos/manage/hub-images/push/</link><br/>Multi-platform builds: <link href="https://docs.docker.com/build/building/multi-platform/" color="#17679b">docs.docker.com/build/building/multi-platform/</link>')

def footer(c,doc):
    w,h=doc.pagesize
    c.setStrokeColor(colors.HexColor('#cbd5e1')); c.line(42,40,w-42,40)
    c.setFont('Helvetica',8);c.setFillColor(colors.HexColor('#5d7085'))
    c.drawString(42,27,'OPNELCOM  /  Gateway & Runtime implementation')
    c.drawRightString(w-42,27,str(doc.page))
SimpleDocTemplate(str(OUT),pagesize=(595.28,841.89),rightMargin=42,leftMargin=42,topMargin=42,bottomMargin=54,title='Gateway and Runtime Implementation Guide',author='Opnelcom').build(story,onFirstPage=footer,onLaterPages=footer)
print(OUT)
