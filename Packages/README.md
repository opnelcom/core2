# Application client packages

`identity-client` and `service-client` are independently versioned CommonJS packages.
They have no third-party dependencies and are never installed in Core Runtime.

- Identity client: configured SaaS session/membership checks and application assignment checks.
  No signing secret, local token validation, role-derived tenant access, or hardcoded service address.
- Service client: configured Broker and SMTP HTTP clients with existing profile-key contracts.
  No database access or email delivery implementation.

Each application explicitly installs its selected versions from committed `vendor/*.tgz`
archives. Those are regular npm packages copied into its own node_modules by `npm ci`;
they are not symlinks to this source tree. The application and vendor folder can be
deployed independently of this repository. Broker and SMTP have no dependency on
either client package; their package manifests own pg and nodemailer respectively.

## Releasing a client change

1. Update the relevant package's version and tests. Do not overwrite a published version.
2. Update consumer package.json file references to the chosen version.
3. Run `node scripts/prepare-dependencies.cjs --pack --update-locks` from repository root.
4. Run migration tests and local verification; commit source, selected archives,
   manifests, and lockfiles together. No registry account is required.

Normal deployments use `node scripts/prepare-dependencies.cjs` without `--pack` or
`--update-locks`, preserving selected versions and integrity checks. Registry publication
can be added later without changing application imports.
