# Core-ERP features and capabilities

Source-reviewed on 15 October 2026. This catalogue describes the current application source and illustrates its reusable capabilities using the template organisation's seed definitions. It is not a record of what has been deployed, initialised or entered in a live organisation.

## How to read this catalogue

- **Capability:** behaviour implemented by the application, subject to configuration and access permissions.
- **Template configuration:** types, schemas, transaction definitions, workflows, roles and reports supplied as starting definitions.
- **Example records:** optional business records supplied separately to demonstrate those definitions.

The principal source of examples is [template-defaults.json](seeds/template-defaults.json). **Initialise Template Org** installs definitions; optional example-data initialisation creates business records in an existing template organisation. These are separate operations. Definition initialisation can overwrite seeded configuration and rebuild relationships; it should not be treated as a harmless refresh of customised setup.

## Organisation, divisions and access

| Capability | What it provides | Template illustration |
| --- | --- | --- |
| Tenant and organisation context | Keeps organisation setup and business records within their applicable tenant and organisation. | A template organisation provides reusable starting configuration for other organisations. |
| Division hierarchy | Organises responsibility and access by division, including applicable child-division permissions. | Property and asset records can belong to a division while reporting respects the user's allowed scope. |
| Organisation identity | Organisation details, SVG icon and optional custom icon colour. | An organisation can use the system colour or its own icon colour. |
| Legal entities | Identifications, addresses and relationships for legal parties. | Optional examples include Template Organisation (Pty) Ltd and Example Insured Company. |
| Modules | Links types, transactions, reports and roles into functional areas. | Finance, Property Management, Insurance Management, Tour Management and Maintenance reuse the same underlying ERP mechanisms. |
| Permission roles | Controls access to setup, master records, transactions and reports, with applicable division, status and validity rules. | Security Administrator is described as setup administration without master-data, transaction or report access. |
| Resource roles | Assigns operational responsibilities to people/resources, separately from permission roles. | Property Manager, Asset Custodian, Maintenance Technician and Fleet Custodian describe responsibility rather than login access. |

Module membership does not replace permission checks. A seeded module name describes a configuration area; it does not establish a complete industry application.

## Configurable business records

Core-ERP separates the general ledger from three allocation and classification classes:

| Class | Business role | Seeded examples |
| --- | --- | --- |
| General-ledger accounts and account types | Defines posting accounts and financial reporting structure. | Cash, revenue and expense accounts; Asset, Liability, Equity, Revenue and Expense account types. |
| Sub-ledgers | Account-level allocation of balance-sheet transactions where required by line/account configuration. | Bank, Customer, Vendor, Cash Point, PPE, Investment Property, Intangibles, Right-of-use assets, Capital Project and Loan accounts. |
| Accounting objects | Allocation of income-statement transactions to business records. | Property, Cost Centre, Operational Project, Contract, Insurance policy, Tour departure, Fleet Vehicle and Maintenance Order. |
| Accounting dimensions | Classifies transactions across allocation classes. | Revenue Type, Expense Type, Service, Measurement Type, Measurement Unit, Valuation Method and the configured mSCOA dimensions. |

A dimension does not substitute for a sub-ledger or accounting object. A fleet vehicle's operating record can link to an asset sub-ledger: operating income/expense allocation and balance-sheet allocation retain their distinct roles.

### Reusable type definitions and schemas

Types define fields and behaviour; individual records hold data governed by those definitions. Supported schema features include:

- Text, multiline text, numbers, exact decimal/currency values, dates, booleans, enumerated choices and organisation currency choices.
- Configured field widths, required values, numeric bounds, text limits and presentation order.
- Named detail tabs and conditional visibility of configured fields or sections.
- Repeating grids with row schemas, including configured date-period controls and overlap restrictions.
- References constrained to an object class and permitted types, including references accepting multiple classes.
- Dependent references restricted by a selected source record's saved grid.
- Configured list, search and report fields where supported by the consuming feature.
- Manual or automatic code numbering for supported classes, using configured ranges and server-side allocation. Template numbering defaults to manual.

**Example:** the Property schema includes identification, location, market-value observations, measurements and features. Its Features section is conditionally hidden for land/site classifications. Measurement rows combine dates, a Measurement Type reference, quantity and a Measurement Unit reference. These definitions reuse the common schema renderer and validation services.

**Example:** an insurance policy can describe insured interests, and a claim can restrict selections using saved source-record information. Configured references constrain eligible records rather than relying on free text.

## Working with records

### Tabbed and stacked editors

Sub-ledger, accounting-object and accounting-dimension record editors support two presentations of the same record:

| View | Behaviour | Example use |
| --- | --- | --- |
| Tabbed | Displays the selected section, with overflow navigation when needed. | Work on an asset's Market values without showing all other sections. |
| Stacked | Displays sections vertically, with independently collapsible sections and a scrolling editor body. | Review a property's identification, measurements and features together. |

The type definition supplies the default editor layout. Template class defaults are tabbed. Switching presentation preserves entered values; it does not create a second record or change its type. Supported editors retain their class-specific Resources, Documents, Versions and other sections; capabilities are not identical across all classes.

### Columnar and status grids

Supported sub-ledger, accounting-object, accounting-dimension and transaction lists offer:

| View | Behaviour | Template example |
| --- | --- | --- |
| Columnar | A conventional table showing record fields in columns. | Compare fleet vehicles or asset identification fields. |
| Status | Groups record tiles into workflow-status columns with labels, colours and counts; tiles open records and expose supported workflow/actions. | View Maintenance Orders across Draft, Submitted, Team allocation pending, In progress, Resolved and Closed. |

Defaults are configurable for supported types, with columnar as the template class default. The status grid uses workflow status and visibility configuration. It is not a separate workflow engine and does not provide drag-and-drop transitions.

The optional maintenance examples deliberately span statuses: `MO-001` is draft, `MO-002` submitted, `MO-003` awaiting team allocation, `MO-004` in progress, `MO-005` resolved and `MO-006` closed.

### Supporting record capabilities

- Parent/child relationships for supported accounting objects.
- Resource assignments with configured roles and validity periods.
- Saved version snapshots for supported classes, including schema and resource-assignment context.
- Document upload, listing and deletion for supported record classes.
- Record comments for supported saved records, with access checks.
- Object transaction actions for eligible sub-ledgers and accounting objects: choose a compatible transaction/line and start capture with the source context.
- Object statements for supported allocation/classification records, with date filters and optional child-object inclusion for accounting objects.
- Configurable menus and user favourites for navigation.

## Accounting and transaction capture

Transaction Types define structure, permitted allocations/classifications, posting rules and workflow. They reuse configured transaction groups and line definitions.

| Capability | Behaviour | Template example |
| --- | --- | --- |
| Structured capture | Required, optional, repeatable and generated lines; configured debit/credit sides and GL accounts. | Manual journal and insurance premium transaction definitions provide different capture structures. |
| Amount sources | Distinguishes captured amounts from generated balancing amounts according to configuration. | A balancing line can complete a configured transaction; it does not calculate an external asset valuation. |
| Allocation requirements | Enforces configured sub-ledger requirements and permitted/mandatory accounting-object and dimension types. | Insurance lines can require an Insurance policy or Insurance claim allocation. |
| Classification value behaviour | Supports configured captured, defaulted or fixed allocations/classifications where defined. | Example bindings connect selected property-related lines to the Facilities cost centre. |
| Journal validation | Applies balancing, fiscal, reference, access and workflow rules before allowing the relevant operation. | A manually captured depreciation transaction must still satisfy journal rules. |
| Contextual actions | Offers eligible transaction definitions from supported saved objects, subject to access and workflow usability. | Start an available transaction for an asset or insurance object without abandoning its context. |

Seeded transaction definitions include insurance premium invoices, credits, payments, premium allocation and accrual/reversal, claim recovery recognition and settlement receipts; asset depreciation and transfers; and a Tour customer invoice.

These definitions do not imply automatic business-event posting. Claim approval does not itself create a recovery journal. Depreciation and ROU charges require manually calculated amounts. Asset transfer definitions can require manual matching of gross/contra amounts even when the overall journal balances.

## Fiscal, currency and tax setup

- Fiscal years and periods support dated transaction control. The template includes fiscal-year definitions for 2025–2027.
- Currencies include formatting conventions and active/inactive choices. Seeded currencies are USD, GBP, EUR and ZAR.
- Exchange rates support effective dates, correction reasons, revisions and correction history. Corrections retain the original pair/date; a different pair or date is a new entry.
- Country definitions provide a shared organisation reference catalogue.
- Tax types have dated rates. The template's output VAT definition illustrates successive historical rates and an open-ended current definition.

Tax configuration and illustrative commercial records do not determine the correct tax treatment for every real transaction. The tour examples explicitly require appropriate manual tax selection.

## Workflows and operational progression

Workflows define paths, steps, available actions/transitions, initial states, status presentation and whether records are enabled for use. Role restrictions and history are applied through the existing workflow services.

Template paths include No Workflow, Simple Master Data, Full Master Data Management, Transaction Management, Maintenance, Insurance Claim, Sales Lead and Sales Opportunity.

| Configured process | Seeded progression examples | What this demonstrates |
| --- | --- | --- |
| Maintenance | Draft → Submitted → Team allocation pending → In progress → Resolved → Closed, with other configured outcomes. | Operational stages can drive status views and controlled actions. |
| Insurance Claim | Reported, Submitted, Assessing, Approved, Partially settled, Settled and closure/outcome states. | Claim progress is distinct from accounting recognition and settlement journals. |
| Sales Lead | New, In progress, Converted, Closed. | Configurable prospect progression. |
| Sales Opportunity | Open, Proposal, Negotiation, Won, Lost. | A sales pipeline can use the common status grid. |

These are configured paths/states, not a claim that every listed state can transition directly to every other state or that conversion automatically creates downstream records.

## Reporting and export

| Capability | Behaviour | Seeded illustration |
| --- | --- | --- |
| Dashboard summaries | Presents permitted organisation summaries. | An overview before opening detailed financial or operational reports. |
| Trial balance | Produces account balance reporting under the application's transaction visibility and reporting rules. | Review the configured chart's balances. |
| Financial statement formats | Configurable account groupings, headings and formula lines. | Standard/Management income statements and Standard/IFRS/Bank Covenant balance sheets. Names describe formats, not certification of compliance. |
| Report definitions and catalogue | Configured datasets, columns, filters, parameters and sorting, with controlled access. | Property register with optional name search. |
| Repeating-grid reports | Reports saved child rows together with parent identification. | Property valuation history and measurement schedules. |
| Relationship/assignment reports | Uses supported relationships and assignment information. | Property Resource assignments with role filtering. |
| Spreadsheet export | Exports supported report results to XLSX. | Share a register or report result for further review. |

Additional seeded reports include Customer contacts with email, Approved transaction lines by date, GL account directory, Active Resource directory and four asset registers.

Report grain matters: valuation history returns observations in a date range, not only the latest valuation; measurement and resource-assignment examples show saved periods without inventing an effective-on-date selection rule. The approved transaction-line example is flat detail without calculated balances/totals. Asset registers describe saved identification/classification and do not calculate depreciation or lease balances.

## Documents and assisted intake

Supported records can hold uploaded documents. Document intake offers analysis followed by confirmation for supported legal-entity, GL-account, sub-ledger and journal targets, using organisation OpenAI settings. Analysis is an assistance step; confirmation and normal validation remain part of creating data. It is not a general importer for every configurable object type.

## Template domain examples

These examples show how shared capabilities combine. They are optional records/configurations, not separate ERP engines.

| Area | Examples from template seeding | Capabilities illustrated and limits |
| --- | --- | --- |
| Property and utilities | `DEMO-PROPERTY`, `ELEC-METER-001`, `WATER-METER-001`, `FACILITIES`. | Property/meter records, configured grids and references, cost-centre allocation and operational reporting. Does not establish an automatic metering/billing service. |
| Insurance | `INS-PROPERTY-2026`, `INS-ASSETS-2026`, `INS-CLAIM-001`, insurer/broker vendor records and insured assets. | Related policies, insured interests, claim workflow and configured accounting transactions. Recognition, expense allocation and settlement postings remain separate accounting actions. |
| Tours | `TOUR-DAY`, scheduled/private departures, guide/vehicle, `TOUR-BOOKING`, `TOUR-JOB`, `TOUR-QUOTE`, `TOUR-INVOICE`. | Connected operational/commercial records, passenger and pricing data, assignments and an accounting invoice type. A tour invoice record is distinct from a posted accounting journal. |
| Assets | `DEMO-IP-COST`, `DEMO-IP-FAIR-VALUE`, `DEMO-SOFTWARE`, `DEMO-LEASED-VEHICLE`. | Cost/fair-value classifications, useful-life/amortisation data and lease particulars. These are saved data and manual posting definitions, not automated valuation or depreciation engines. |
| Fleet and maintenance | `FLEET-001`, `FLEET-002`, `MO-001`–`MO-006`. | Operating vehicles linked to PPE/ROU sub-ledgers; property, equipment and fleet work orders at different workflow stages. Does not imply automatic scheduling or technician dispatch. |
| Sales | Sales Lead and Sales Opportunity type definitions and workflows. | Reusable prospect schemas and status-based pipelines. No optional sales-lead/opportunity example records are listed in `exampleData`. |

Other seeded module areas include Sales, Procurement, HR & Payroll, Treasury & Cash, Tax, Inventory, Project Management, Contract Management, Intercompany, Public Sector and Corporate Administration. Their presence supplies organisation/configuration coverage; assess their actual definitions and APIs before treating them as complete end-to-end processes.

## Setup and administration

Administrators can initialise the application schema, initialise template definitions, separately add template example records, copy organisation setup and import a chart of accounts through the existing application operations. Setup editors provide controlled permanent deletion with explicit confirmation and reference checks; deletion is distinct from ordinary workflow archiving/deletion and from bulk data-management operations.

Schema updates use **Initialise Schema**. Template definition updates use **Initialise Template Org** where applicable. Neither action was executed to produce this catalogue, and no example records were created.

## Source guide and verification boundary

| Area | Principal source |
| --- | --- |
| Template definitions, examples, defaults and module mappings | [seeds/template-defaults.json](seeds/template-defaults.json) |
| Template/example initialisation | [template-initialisation.js](api/_shared/erp/template-initialisation.js), [seed-record-examples.js](api/_shared/erp/seed-record-examples.js) |
| Tabbed/stacked editors | [record-editor-layout.js](public/record-editor-layout.js) |
| Columnar/status grids | [object-grid-views.js](public/object-grid-views.js), [workflow-grid-visibility.js](public/workflow-grid-visibility.js) |
| Schema references, grids and versions | [schema-references.js](api/_shared/erp/schema-references.js), [schema-grids.js](api/_shared/erp/schema-grids.js), [object-versions.js](api/_shared/erp/object-versions.js) |
| Capture, accounting and workflows | [journals.js](api/_shared/erp/journals.js), [transaction-plan.js](api/_shared/erp/transaction-plan.js), [workflow.js](api/_shared/erp/workflow.js) |
| Object actions and statements | [object-actions.js](api/_shared/erp/object-actions.js), [object-statement.js](api/_shared/erp/object-statement.js) |
| Reporting | [report-definitions.js](api/_shared/erp/report-definitions.js), [trial-balance.js](api/_shared/erp/trial-balance.js), [reports API](api/reports) |
| Access, setup deletion and intake | [access.js](api/_shared/erp/access.js), [setup-deletion.js](api/_shared/erp/setup-deletion.js), [intake.js](api/intake/_shared/intake.js) |

This is source-based documentation. Seed examples and named definitions were checked against the local JSON/source; links were checked locally. No runtime, browser, database, accounting-result or deployment verification is implied. Maintain this catalogue when capabilities or template examples change; record implementation changes separately in [CHANGELOG.md](CHANGELOG.md).
