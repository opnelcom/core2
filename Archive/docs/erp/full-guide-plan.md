# Full ERP guide: editorial and screenshot plan

Requested scope: administrators and everyday users, all 16 template modules.
Screenshot environment: https://home.joppenheim.org:9000.
Status: Edition 02 completed and visually reviewed: 135 pages, 44 actual screenshots,
108 bookmarks and all 16 template modules. The user selected Template Organisation
for authenticated, read-only capture. No business records were saved or approved;
worked journal amounts are illustrations rather than live posted outcomes.

## Publishing and verification

Edit `docs/erp/full-guide.json`, then run `python Tools/ERP/build-full-guide.py`.
The publisher reads type and transaction inventories from the current template seed
and writes `output/pdf/erp-full-guide.pdf`. Screenshot evidence and metadata live in
`docs/erp/guide-screenshots`; `verification.json` records the delivery checks.
Render every page after rebuilding, inspect the layout and validate navigation.

Live setup gaps are documented: no fiscal periods/journals, Inventory and
Intercompany absent from operational navigation, and demo insurer/broker vendors
without linked legal entities. Posting and non-admin permission enforcement remain
unverified. These findings must be reviewed before using examples as saved workflows.

## Consistent chapter structure

Each module chapter should use the same structure:

1. Business purpose and supported scope.
2. Relevant classes, types and relationships.
3. Setup prerequisites and access requirements.
4. Numbered task instructions with actual screen labels.
5. Real screenshots with numbered callouts and readable cropped detail.
6. A worked business example: inputs, selections, actions and expected result.
7. How to check the result in history or reports.
8. Common errors and current limitations.

Distinguish source-verified rules, live-observed behaviour, template recommendations
and illustrative business outcomes. Do not imply that a module name establishes a
complete specialised subsystem. Use canonical seed mappings to establish coverage.

## Guide parts

- Getting started: sign-in, organisation/division context, navigation and search.
- Object-class reference: GL accounts, legal entities, all eight subledger families,
  all ten accounting object types, all seventeen dimension types and resources.
- Daily work: capture, custom tabs, grids, references, documents, resource assignments,
  workflow and versions.
- Administrator setup: every Setup group, configuration dependencies, schema design,
  module/type mappings, permissions, organisation copy and recovery tools.
- Business modules: Sales; CRM; Procurement; HR & Payroll; Finance; Treasury & Cash;
  Tax; Inventory; Asset Management; Project Management; Contract Management;
  Property Management; Intercompany; Public Sector; Corporate Administration;
  Insurance Management.
- Reporting: ledger balances, trial balance, financial statement configuration,
  operational grid data and historical snapshots, with implemented limits.
- Reference: glossary, troubleshooting, sample naming conventions clearly marked
  as recommendations, source map and verification record.

## Example sources and verification

Use Volumes/Core-ERP/seeds/template-defaults.json first for configured scenarios.
Use docs/erp/schema-json.md for supported forms and record behaviour.
Use docs/erp/insurance-management.md for buying-insurance scenarios.
Tools/ERP-Acceptance/packs/business-inception.js provides candidate worked examples
for funding, construction, trading, utilities, cash, payroll and reporting.
Its custom acceptance configuration differs from template module routing; do not
present its settings or outcomes as verified live template behaviour.

For each example, record the module/type codes, prerequisite record codes,
representative values, relevant line definitions and the verification status.
Treat accounting entries as illustrations of configured capture, not professional
advice or approval of the organisation's recognition policy.

## Screenshot inventory

Capture navigation/context, each setup view and relevant editor tabs; representative
legal entity, GL, subledger, object, dimension and resource editors; schema preview
and tester; grids and eligible-reference selections; documents and versions;
transaction capture/line classifications/workflow; and report filters/results.

Use a demo/template organisation with representative records. Capture read-only
views initially. Establish a named test organisation before saving example data.
Use a consistent viewport and screenshot IDs with captions describing the task,
organisation context and observed behaviour. Avoid reproducing real confidential
business details in a distributable guide.

Maintain content and screenshot metadata as structured reusable sources. Build the
full PDF separately from the existing starter so it remains available during review.
Check contents/bookmark destinations and render every page for visual inspection.
