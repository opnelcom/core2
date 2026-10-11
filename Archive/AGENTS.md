# Project instructions for agents

- Be a little critical: identify gaps, issues and better options before implementing a request.
- Ask focused questions where requirements, approach or outcomes are unclear. Do not invent business intent.
- Standardise behaviour and prefer reusable code over class-specific implementations.

ERP, Tasks and ObjectSphere must verify current-user/current-tenant membership
through the SaaS session API using `ctx.tenantSession()`. They must not query SaaS
tables or use SaaS roles or application assignments for application permissions.
Keep application permissions inside each application. See
[tenant membership boundary](docs/platform/tenant-membership.md).

## ERP Schema JSON: mandatory documentation maintenance

Read [ERP Schema JSON](docs/erp/schema-json.md) before changing custom object
schemas, schema attributes, generated forms, schema validation, field storage,
schema previews or seeded schemas. This is the authoritative description of the
implemented ERP schema convention, not a promise of full JSON Schema support.

Use `Volumes/Core-ERP/seeds/template-defaults.json` as the first reference for
business examples. The template organisation is a recommended starting
configuration and a collection of business scenarios, not mandatory
configuration for every organisation. Application constraints and template
recommendations must be described separately.

`schema_json` is the single custom definition for data attributes and presentation.
Do not reintroduce a separate UI schema editor. Reuse the existing renderer,
validators and schema preview; extend them centrally when a capability is missing.
Schemas extend built-in record fields; they do not redefine an object's class.

Whenever schema or UI rendering rules change, update `docs/erp/schema-json.md`
in the same change. This includes types, defaults, validation, serialisation,
tabs, field order, labels, widths, responsive behaviour and compatibility aliases.
Update its examples and change history, and update affected seed examples and
behaviour tests. Do not declare such work complete with stale documentation.

Document actual implemented behaviour and known limitations. Check the browser
renderer and server validators rather than assuming a JSON Schema keyword works.
Separate presentation-only attributes from server-enforced constraints.
For changes affecting stored values, describe compatibility and the migration
path; clarify ambiguous business intent before choosing a conversion.

Validation commands and implementation locations are listed in the schema guide.
Report browser or database verification that could not be performed.

## ERP grids and edit panels: mandatory standard

Read [ERP grid and edit panel standards](docs/erp/grid-edit-panel-standards.md)
before creating or changing ERP grids, lists, edit panels, forms, tabs, module
Scope controls or their CSS. This is the authoritative UI implementation guide.
Use GL Account Types/Subledger Account Types as Setup references, and sub-ledger
accounts/accounting objects as record references. Inspect runtime JavaScript as
well as markup and CSS; follow the guide's integration checklist and applicable
Scope requirements. Reuse shared helpers rather than copying partial layouts.

Verify the whole screen with the editor closed and open, including desktop and
narrow viewport layouts. An editor-only screenshot or passing syntax check is
insufficient to claim conformity. Add meaningful checks for affected behaviour,
update this guide in the same change when shared behaviour changes, and explicitly
report browser/database verification that could not be performed. Document actual
implementation exceptions separately from required standards.

## Application logic belongs on the server

Implement application and business rules in reusable server-side code, not database
functions or triggers. Keep transactions, locking, keys and data integrity in the
database. Core-Broker is an application-independent SQL broker: do not import or
dispatch ERP business code there, and do not add transaction sessions. ERP prepares
parameterised SQL batches for the existing single-request transaction endpoint.
All writes for an atomic operation must use one Broker transaction connection;
preparation reads must be rechecked under locks before writes, never used as
separate unchecked reads and writes.
