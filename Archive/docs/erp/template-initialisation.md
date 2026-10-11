# ERP template initialisation

## Initialisation operations (2026-10-11)

- **Initialise Schema** performs structural DDL and compatibility migrations only. It does not read template JSON, seed workflows, initialise organisations or update custom type schemas.
- **Initialise Template Org** creates or reuses **TEMPLATE ORG** (code TEMPLATE) and resets JSON-defined configuration, schemas and mappings from the single template-defaults.json. Existing organisation/definition IDs and business example records are preserved. Other organisations are unaffected.
- **Initialise Template Org Example Data** asks for confirmation, then adds missing JSON example records to TEMPLATE ORG. Existing records are preserved, including edits. Run template definition initialisation first.

All scenarios share the same class-based seed path. No tour/insurance addon seeder is installed. Currencies, countries, taxes, chart of accounts, workflow paths, reference vocabularies, fiscal configuration and report definitions are setup configuration; legal entities, subledger accounts, accounting objects and guide Resources in exampleData are loaded only by the example-data action.

Record-dependent defaults live in exampleDataBindings. Template definitions use captured classifications without referring to example records; after adding example data, the example action binds the configured example defaults. Resets preserve examples; new mandatory schema fields can therefore make an existing example invalid, and the user must edit it separately.

Template actions are planned and validated in ERP, then submitted through the
unchanged generic Core-Broker SQL batch endpoint. The batch locks affected tables
and verifies the preparation inputs before writing, with administrator checks,
confirmation and atomic rollback. No ERP code is dispatched in Broker. See
[ERP transaction batches](transaction-batches.md). No live initialisation was
performed during this cleanup.

Configuration sections: templateOrganisation, workflowDefaults, codeNumberingDefaults, the existing per-class type/schema lists, moduleMappings, lineClassificationSeeds, exampleData and exampleDataBindings. $ref descriptors in exampleData resolve by class/type/code within the tenant and organisation; UUIDs are never copied from another tenant. The shared seed-record-examples helper validates complete records, references and grid memberships, and records normal versions/projections.

Verification: node --test Volumes/Core-ERP/test/*.test.js; node Tools/ERP/audit-template-schemas.js; node Tools/ERP-Acceptance/test/tour-management.database.js; node Tools/ERP-Acceptance/test/template-initialisation.browser.js. Database fixtures require PGlite on NODE_PATH; browser checks require Playwright and optionally ERP_BROWSER_EXECUTABLE.

Definition reset restores the JSON code numbering default (manual), reference role mappings, role/module permissions, report scopes and fiscal year/period configuration. JSON-defined entries are reset in place; unrelated custom entries are retained. The database schema retains only technical migration tracking and compatibility backfills, not business defaults.
