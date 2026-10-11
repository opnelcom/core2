# Template custom-schema audit

Date: 2026-10-04. Source: `Volumes/Core-ERP/seeds/template-defaults.json`.
Convention: [ERP Schema JSON](schema-json.md).

This report records the initial pre-grid audit. The subsequent grid implementation
expands the template to 31 types, 152 top-level custom fields (44 grids included)
and seven empty mSCOA schemas. See the regenerated [current flat table](template-schema-fields.md)
and schema guide for the current definitions. Team and Utility Meter now have
grid examples; four new shared reference types have been added. The outstanding
business decisions below describe the earlier audit, not current blockers.

The technical audit covers all 27 registered subledger, accounting object and
accounting dimension types, comprising 104 custom fields. It checks definitions,
registry coverage, tabs, choices, defaults and compatibility with seeded example
records. After the amendments below, the audit reports zero errors and all 16
focused schema tests pass. No live database refresh or browser verification was
performed. This result establishes technical alignment, not business completeness.

## Inventory

| Class | Type | Custom fields | Business status |
| --- | --- | ---: | --- |
| Subledger | bank | 9 | Existing example reviewed |
| Subledger | customer | 9 | Existing example reviewed |
| Subledger | vendor | 11 | Existing example reviewed |
| Subledger | employee | 10 | Existing example reviewed |
| Subledger | cash_point | 9 | Existing example reviewed |
| Subledger | asset | 10 | Existing example reviewed |
| Subledger | capex_project | 8 | Existing example reviewed |
| Subledger | loan | 8 | Existing example reviewed |
| Accounting object | property | 6 | Existing example reviewed |
| Accounting object | team | 0 | Additional fields await requirements |
| Accounting object | region | 3 | Existing example reviewed |
| Accounting object | opex_project | 6 | Existing example reviewed |
| Accounting object | cost_centre | 3 | Existing example reviewed |
| Accounting object | profit_centre | 3 | Existing example reviewed |
| Accounting object | contract | 9 | Existing example reviewed |
| Accounting object | utility_meter | 0 | Additional fields await requirements |
| Accounting dimension | revenue_type | 0 | Additional fields await requirements |
| Accounting dimension | expense_type | 0 | Additional fields await requirements |
| Accounting dimension | mscoa_fund | 0 | Additional fields await requirements |
| Accounting dimension | mscoa_project | 0 | Additional fields await requirements |
| Accounting dimension | mscoa_item | 0 | Additional fields await requirements |
| Accounting dimension | mscoa_region | 0 | Additional fields await requirements |
| Accounting dimension | mscoa_function | 0 | Additional fields await requirements |
| Accounting dimension | mscoa_costing | 0 | Additional fields await requirements |
| Accounting dimension | mscoa_outcome | 0 | Additional fields await requirements |
| Accounting dimension | service | 0 | Additional fields await requirements |
| Accounting dimension | charge_component | 0 | Additional fields await requirements |

## All amendments

Removed redundant `format` attributes from these 20 fields; their semantic
`type` already selects the same control and validation:

| Type | Fields |
| --- | --- |
| asset | purchaseDate, commissionDate |
| loan | startDate, maturityDate |
| customer | email, billingAddress |
| employee | email, startDate, endDate |
| vendor | email |
| cash_point | activeFrom, activeTo, notes |
| capex_project | startDate, endDate |
| opex_project | startDate, endDate |
| contract | startDate, endDate, renewalDate |

Removed redundant `enum` arrays from bank.accountType, vendor.vendorType and
vendor.bankAccountType. Each retains its existing `options` codes and labels;
the accepted choices are unchanged. No field keys, types or stored values changed.

Added `Tools/ERP/audit-template-schemas.js` for repeatable auditing and
`Volumes/Core-ERP/test/template-schema-audit.test.js` for regression coverage.
Updated the convention with canonical seed authoring rules and audit commands.
Added this report. No additional business fields have been added yet.

## Outstanding business decisions

The user requested additional fields after clarification for Team, Utility Meter
and all 11 accounting dimensions. Confirm workflows, field names, types, limits,
relationships and required values before changing these schemas. Relationship
lookup widgets are not implemented by the current custom-schema renderer;
resource/property references need a central capability change if chosen.

All existing root `required` arrays are empty. This is valid, but mandatory
business attributes must be chosen explicitly. Existing seeded example records
have empty custom data; introducing mandatory fields requires updating those
examples and checking existing records. Currency units for operating-project
amounts and the unit of loan interestRate also need explicit business decisions
if they are to become enforced attributes.

The legacy top-level customerSchema/customerUiSchema are outside the active type
registry; active customer seeding uses ledgerFamilySchemas.customer. Legacy UI
metadata was retained for compatibility. Other setup and transaction definitions
must not be treated as custom-schema object types without checking their own
implementation.

Initialise Schema maintains database structure only. Initialise Template Org resets JSON-defined type schemas; Initialise Template Org Example Data separately adds the exampleData records after confirmation. Existing stored values are preserved. The audit validates exampleData against the class schemas with stable placeholder identities for references; database fixtures verify actual resolution. A file audit does not establish that a running organisation has adopted the seeds.
