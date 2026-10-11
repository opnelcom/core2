# Insurance management — organisation buying insurance

Implemented template configuration, 2026-10-04. This is a recommended starting
configuration, not mandatory business policy or insurer accounting.

## Classes and records

- `insurance_policy`: accounting object containing policy number, insurer/broker
  supplier references, legal policyholder, responsible resource, dates, currency,
  payment frequency and cancellation terms. Grids: coverage, insured items,
  premium schedule and endorsements.
- `insurance_claim`: accounting object containing policy reference, insurer claim
  reference, handler, incident details, claim stage and assessment. Grids:
  affected items, events and settlement breakdown.
- `insurance_cover_type`: property damage, motor, equipment, theft, liability,
  business interruption. `insurance_claim_cause`: fire, theft, collision, storm,
  accidental damage, mechanical failure.
- Insurers/brokers use existing vendor subledgers. Vehicles, equipment and other
  fixed assets use asset subledgers; property accounting objects are also supported.
  Resources represent contacts/handlers/assessors. Policies/claims do not have
  separate subledger balances.

Existing object editors provide Identification, custom tabs, Resources, Documents
and Versions. Additional data and all grids save together. Root `required` arrays
and rowSchema `required` arrays apply independently; `sortOrder` governs columns.

## Linkage and operational workflow

Save the policy and its insured-items grid before creating a claim. Affected items
select only accessible records listed on that saved policy. The same membership
rule is checked on the server. Period control is optional and does not automatically
close previous periods; policy coverage groups by cover type and insured items
by item/cover type. Insured value is distinct from book and market value.

Claim stage is operational data, separate from the standard record approval workflow.
Events and endorsements preserve business dates; full object versions preserve
corrections. Updating the operational stage never posts a transaction.

Shared/aggregate limits can be described in notes; this first model does not
calculate remaining limits, excesses, coverage eligibility on incident date,
claims aggregations or premium totals. There is no unlisted-item exception workflow,
automatic journal generation or renewal notification scheduler.

## Financial configuration

| Code | GL |
|---|---|
| 1250 | Prepaid Insurance |
| 1260 | Insurance Recoveries Receivable |
| 2060 | Insurance Premium Accrual |
| 4120 | Insurance Recoveries |
| 5760 | Insurance Premium Expense |
| 5770 | Insurance Broker Fees |

These reuse supplier control (2000), bank (1010) and input tax (2200). Bank lines
require bank subledgers; supplier lines require vendor subledgers. The recommended
financial statement formats include the insurance accounts; premium/broker expense
is operating expense, rather than cost of sales.

| Transaction type | Default required lines |
|---|---|
| insurance_premium_invoice | Dr 1250; Cr 2000 |
| insurance_premium_credit | Dr 2000; Cr 1250 |
| insurance_premium_payment | Dr 2000; Cr 1010 |
| insurance_premium_allocation | Dr 5760; Cr 1250 |
| insurance_premium_accrual | Dr 5760; Cr 2060 |
| insurance_accrual_reversal | Dr 2060; Cr 5760 |
| insurance_recovery_recognition | Dr 1260; Cr 4120 |
| insurance_settlement_receipt | Dr 1010; Cr 1260 |
| insurance_premium_refund | Dr 1010; Cr 2000 |

Premium invoice/credit types also offer optional broker-fee and input-tax lines;
tax is entered only when applicable and recoverable, never inferred from the policy.
They allow additional lines for approved adjustments. Other insurance types use
the fixed two-line starting definition. All insurance lines require a policy;
recovery/settlement lines also require a claim. Amounts remain manually captured.
Existing posting, balancing, fiscal-period and approval controls still apply.
Save and posting reject a policy/claim pair when the claim references a different
policy. This uses shared root-reference consistency checks rather than insurance
type names hardcoded in transaction validation.

Do not recognise a recovery merely because a claim was reported/approved. Apply
the organisation's accounting policy and recognition criteria. Underlying loss,
repair or asset-disposal transactions remain separate and use the appropriate
existing expense/asset transaction setup; this change does not automate them.
The insurer can settle directly with a supplier, but that accounting scenario
requires an appropriate journal configuration rather than a bank receipt.

## Template examples and deployment

Template examples include an annual warehouse policy (60000 premium), a vehicle/
equipment policy (24000 premium), two asset records, a separate example property,
insurer/broker suppliers and an example policyholder. A vehicle claim records
30000 claimed, 25000 approved after 5000 excess, and an illustrative partial-settlement
event. No financial journals are seeded. To demonstrate allocations, capture
5000 per month for the property example; capture recognition/receipt transactions
only according to the organisation's approved accounting policy.

Run Initialise Schema for structural updates, then Initialise Template Org to reset template definitions from the JSON. Add examples separately through the confirmed Initialise Template Org Example Data action. Existing example records are preserved. Insurance uses shared class-based seeding, with no insurance addon seeder. Non-template organisations are not automatically modified. New copies inherit
selected configuration and records, remapping custom references to destination IDs.
Missing destination reference records are cleared; include the relevant records
in copy options or reselect them. Copied grids are reportable; history begins with
normal object saves in the destination. Example creation includes initial versions
and reporting projections.

Module mappings use only Insurance Management (`insurance_management`). The two
insurance object types, two dimension types and nine transaction types are moved
out of other modules during template initialisation. Existing seeded all-module
role membership includes this module; other roles need explicit module access.
GL accounts remain organisation-wide. Shared asset, property and supplier types
keep their existing module mappings; individual example records cannot be mapped
to a module independently of their type. Initialised report mappings are additive; inspect
custom financial report formulas if they depart from the recommended templates.

## Verification and maintenance

`Tools/ERP/seed-template-insurance.js` regenerates the recommended insurance schema
and seed examples explicitly. Keep [schema-json.md](schema-json.md) up to date when
changing renderer/schema rules. Optional Playwright check:
`Tools/ERP-Acceptance/test/insurance-management.browser.js`. Optional isolated PGlite
check: `Tools/ERP-Acceptance/test/insurance-management.database.js`. Neither changes
the live database.
