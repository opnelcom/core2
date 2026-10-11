# ERP Acceptance

A separate Node.js developer tool for manual walkthroughs, API execution, and visible/headless browser execution. Browser actions use normal ERP controls; verification reads independent API results. The ERP organisation-creation endpoint now assigns its creator as the first Security Administrator atomically with organisation and root creation.

## Start

Requires Node.js 22 or newer. From this directory:

```powershell
node server.js
```

Open http://127.0.0.1:4314. Set `ERP_TEST_PORT` to change the port. API/manual modes need no package installation. Browser modes require `pnpm install` (or `npm install`) in this directory and Google Chrome. Set `ERP_TEST_BROWSER_CHANNEL=msedge` for Edge. To use bundled Chromium, run `pnpm browser:install` and set `ERP_TEST_BROWSER_CHANNEL=chromium`. On Windows mapped drives that cannot create symlinks, use `pnpm install --node-linker=hoisted --store-dir C:\erp-test-pnpm-store`.

1. Connect with your ERP origin, email and password. Optionally specify a tenant ID. The account must belong to that tenant.
2. Choose an existing organisation where you have setup administrator access. The ERP organisation-creation API uses that organisation as its permission context; the test organisation is created separately.
3. Choose a fresh `ERPTEST-…` code and dates. The test uses one explicitly created fiscal period spanning those dates.
4. Create a run. **This saves the scenario locally; execution creates ERP records.**
5. Manually follow a step and click **Verify manual work**, or click **Run this step** / **Run unattended** using the **Execute using** selector: Direct API, Visible browser, or Headless browser. Both browser modes share the same scenario and API reconciliation. UI runs stop on the first failed or unsupported step without API fallback.
6. Use **Pause after step**, saved run history and **Export results** to inspect or resume a run.

Use **Explore the walkthrough** without credentials to inspect the scenario. Preview does not execute ERP actions or display simulated passes.

Manual journal steps require the exact `ERPTEST:<run-id>:<step-id>` description shown in the UI. Save, submit and approve the journal in the ERP before verifying it. Invalid-input probes use the API to verify the rejection; screen observations can be recorded as manual review. A manual observation or capability gap never counts as a verified pass.

## Coverage

The built-in pack reads the current repository template seeds when a run is created, and freezes its specification in the saved run. It recreates all seeded subledger classes, accounting object classes, dimension classes and transaction types. It exercises capex purchases and adjustments both with and without optional input VAT, and adds land acquisition, project settlement, materials purchases and GL cost recognition.

The business story covers owner and loan funding, land, capital materials/services, partial supplier payment, partial/final asset settlement, trading purchases/sales, metered municipal bills and payments, bank/cash movements, payroll, depreciation, finance and tax postings. It includes a financial-ledger checkpoint after each business chapter, account-level income/balance formats, and invalid-input probes.

The ledger verifier checks cumulative debits, credits and balances, including unexpected accounts. Journal verification independently checks GL codes, subledger codes and object/dimension assignments. Checkpoints re-read the approved journals and compare their classifications too; those object balances are reconstructed from journals rather than asserted against an independent ERP subledger report.

Amounts use integer minor units in the verifier. Expected GLs and amounts are declared independently from the capture definitions. Municipal dimension codes are shared with the reference seed; amounts and posting accounts are independently declared.

## Unattended CLI

Set connection variables in your shell; passwords are not written to run files:

```powershell
$env:ERP_TEST_URL = 'http://localhost'
$env:ERP_TEST_EMAIL = 'your-test-account@example.com'
$env:ERP_TEST_PASSWORD = '<your password>'
$env:ERP_TEST_ADMIN_ORG = '<existing setup administrator organisation UUID>'
node cli.js
```

Set `ERP_TEST_MODE=ui-visible` or `ui-headless` for browser CLI execution; the default is `auto` (API). Optional variables: `ERP_TEST_TENANT`, `ERP_TEST_ORG`, `ERP_TEST_START`, `ERP_TEST_END`, `ERP_TEST_DATE`. Default fixture dates are October 2026; set dates appropriate for your environment. Press Ctrl+C to pause after the current step. Resume with `node cli.js resume <run-id>`. The process returns 0 only when every step is verified; incomplete or failed runs return 1.

The CLI and UI share the same `data/` run files. After a server restart, reconnect to the same origin, tenant and account before resuming. Credentials and session cookies remain in server memory only. The local server binds to loopback and rejects cross-origin mutations.

## Retries and evidence

Records are inspected by stable codes before creation. Existing differences fail verification rather than being overwritten. Journals are inspected by their unique run/step description before capture; existing draft/submitted journals resume their workflow. After a network timeout, retry reads the ERP first. Retrying a prerequisite invalidates downstream verification results, but leaves ERP records intact. No destructive reset, cleanup or template initialisation endpoint is called.

Each saved JSON file includes the frozen pack, parameters, resolved ERP IDs, expected/actual evidence, outcomes and activity. Run files are git-ignored. API errors remain failures; **browser gaps identify unsupported adapter contracts separately from missing ERP capabilities**, so an authentication or configuration error cannot silently become a missing-feature claim. Chapter reconciliations gate subsequent business events. Re-running an earlier checkpoint checks the current ERP state, including independently expected later transactions already posted; it does not rewind the organisation.

## Extend

`packs/business-inception.js` is the versioned pack builder. Steps use these reusable kinds:

- `entity`: create/read/compare a record through an ERP endpoint and collection lookup.
- `permissions`, `tax`, `transaction-type`, `format`: additional configuration checks.
- `journal`: capture/submit/approve and compare independent postings.
- `checkpoint`: reconcile the cumulative financial ledger and journal classifications.
- `statement`: compare configured financial statement account lines.
- `negative`: verify an invalid capture returns the expected error and creates no journal.

References use `{ "$ref": "outputs.step-id.field" }` or `parameters.field`. Dependencies must precede the step. Add a new pack and register it in the server/CLI to introduce a different business story. Keep expected postings separate from transaction definition construction.

## Limits

Browser form contracts cover setup, classes, master records, transaction definitions, journal capture/workflow and report refresh. These contracts have not yet been exercised against a live ERP account. Negative UI probes are currently an explicit automation gap: execute those steps in API mode. New packs use an administrator role, so granular permission enforcement is not asserted. Older frozen packs containing wildcard permission rows require explicit API/manual execution for that role step. Manual work exercises the screens. The pack uses a single acceptance module, not the template's complete module routing. Commercial postings omit VAT; the municipal fixture includes explicit input VAT, not automated tax-return validation. Meters include configured number/service/property-code fields, but meter/property referential enforcement is not assumed. Invoice allocation, automatic depreciation, full period close/year-end and formula-based statements require further scenarios. The balance format verifies account lines before an earnings transfer, rather than claiming a finished statutory balance sheet.

## Tests

```powershell
node --test test/*.test.js
```

Tests cover independent fixture consistency, monetary precision, wrong GL/object detection, unexpected report accounts/turnover, manual read-only verification, workflow/resume without duplicate writes, dependent invalidation, pause, administrative claim, HTTP cookies and local access checks. These are runner tests and controlled API fixtures; a live ERP run is still required to certify ERP behaviour.

Browser screenshots are saved under `data/browser-evidence/<run-id>/`; saved evidence records execution mode and endpoint/method/status metadata without request bodies or authentication headers. Visible browser windows remain open during a server session; reconnecting closes those sessions. The CLI closes its browser when finished.
