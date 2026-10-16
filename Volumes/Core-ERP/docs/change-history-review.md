# Core-ERP historical change review

Prepared 2026-10-15 from the eight locally available commits affecting Core-ERP. This supports the proposed entries in [../CHANGELOG.md](../CHANGELOG.md). Only ERP paths are included. File inventories are generated from Git; source signals identify changed declarations, schema objects, and test descriptions to aid review. They are not proof of runtime correctness or complete behavioural specifications. No historical checkout, test execution, deployment, schema initialisation, or data changes were performed.

Review method: inspected per-commit file inventories, source diffs, changed service/UI declarations, schema changes, seed structure, and added test cases. Formatting-heavy diffs were compared with whitespace ignored where useful. Configuration values and operational data are intentionally omitted.

Statuses: A = added, M = modified, D = deleted, R = renamed (similarity percentage follows). Renames show both historical paths.

## 7754082 | 2026-10-11 | clean up and fixes

98 ERP file changes. Proposed wording: see the matching commit entry in the changelog.

| Status | ERP file | Selected source evidence |
| --- | --- | --- |
| M | `api/_shared/erp/auth.js` | Implementation changes; inspect commit diff |
| A | `api/_shared/erp/code-numbering.js` | function validateCodeNumbering; function numberedRecordStatement; function numberingError; function executeNumberedStatements; +1 other declarations |
| A | `api/_shared/erp/copy-schema-references.js` | function remapSchemaReferences; function prepareSchemaReferenceCopy; function copySchemaReferenceStatements |
| A | `api/_shared/erp/exchange-rates.js` | function validateRate; function executeExchangeRateSave; function saveExchangeRate |
| A | `api/_shared/erp/fiscal-delete.js` | function executeFiscalDelete; function deleteFiscalRecord |
| M | `api/_shared/erp/journals.js` | Implementation changes; inspect commit diff |
| A | `api/_shared/erp/object-reference-consistency.js` | function objectReferenceConsistencyError |
| A | `api/_shared/erp/object-versions.js` | function versionStatement; function gridProjectionStatements; function objectSaveStatements |
| A | `api/_shared/erp/report-definitions.js` | function fail; function object; function uuid; function catalogue; +8 other declarations |
| A | `api/_shared/erp/report-xlsx.js` | function xml; function column; function crc32; function zip; +2 other declarations |
| M | `api/_shared/erp/resource-assignments.js` | Implementation changes; inspect commit diff |
| A | `api/_shared/erp/schema-attributes.js` | function upgradeSeededSchema; function upgradeSeededFieldAttributes |
| A | `api/_shared/erp/schema-grids.js` | function validateGridDefinition; function validateGrid; function referenceFields |
| A | `api/_shared/erp/schema-references.js` | function canReadReference; function lookupReferences; function sourceReferenceValues; function validateSchemaReferences |
| A | `api/_shared/erp/seed-erp-admin-permissions.js` | function seedErpAdministratorPermissions |
| A | `api/_shared/erp/seed-fiscal-years.js` | function seedFiscalYearDefaults |
| A | `api/_shared/erp/seed-line-classifications.js` | function seedLineClassifications |
| A | `api/_shared/erp/seed-record-examples.js` | function seedRecordExamples |
| A | `api/_shared/erp/seed-reports.js` | function seedReportDefaults |
| M | `api/_shared/erp/seeding.js` | Implementation changes; inspect commit diff |
| A | `api/_shared/erp/template-initialisation.js` | function executeTemplateInitialisation; function initialiseTemplate |
| A | `api/_shared/erp/transaction-plan.js` | function createTransactionPlan; function write; function commit |
| A | `api/_shared/erp/transaction-visibility.js` | function transactionVisibilitySql |
| A | `api/_shared/erp/trial-balance.js` | function validDate; function dateOnly; function resolveRange; function scopedLinesSql |
| M | `api/_shared/erp/utils.js` | function validateSchemaDefinition |
| M | `api/_shared/tenant.js` | Implementation changes; inspect commit diff |
| M | `api/accounting-dimensions/save-type.js` | Implementation changes; inspect commit diff |
| M | `api/accounting-dimensions/save.js` | Implementation changes; inspect commit diff |
| M | `api/accounting-objects/save-type.js` | Implementation changes; inspect commit diff |
| M | `api/accounting-objects/save.js` | Implementation changes; inspect commit diff |
| M | `api/currencies/save.js` | Implementation changes; inspect commit diff |
| M | `api/documents/_shared/documents.js` | function requireEntity |
| A | `api/exchange-rates/history.js` | Implementation changes; inspect commit diff |
| A | `api/exchange-rates/list.js` | Implementation changes; inspect commit diff |
| A | `api/exchange-rates/save.js` | Implementation changes; inspect commit diff |
| A | `api/fiscal/delete-period.js` | Implementation changes; inspect commit diff |
| A | `api/fiscal/delete-year.js` | Implementation changes; inspect commit diff |
| M | `api/gl-account-types/save.js` | Implementation changes; inspect commit diff |
| M | `api/gl-accounts/save.js` | Implementation changes; inspect commit diff |
| M | `api/journals/detail.js` | Implementation changes; inspect commit diff |
| M | `api/journals/save.js` | Implementation changes; inspect commit diff |
| A | `api/navigation/favourites.js` | function validItemKey |
| M | `api/organisations/copy-organisation-setup.js` | Implementation changes; inspect commit diff |
| M | `api/organisations/delete-data.js` | Implementation changes; inspect commit diff |
| M | `api/organisations/save.js` | Implementation changes; inspect commit diff |
| M | `api/permissions/list.js` | Implementation changes; inspect commit diff |
| M | `api/permissions/save.js` | Implementation changes; inspect commit diff |
| A | `api/report-definitions/catalogue.js` | Implementation changes; inspect commit diff |
| A | `api/report-definitions/list.js` | Implementation changes; inspect commit diff |
| A | `api/report-definitions/save.js` | Implementation changes; inspect commit diff |
| M | `api/reports/financial.js` | Implementation changes; inspect commit diff |
| A | `api/reports/run.js` | Implementation changes; inspect commit diff |
| A | `api/reports/trial-balance.js` | Implementation changes; inspect commit diff |
| A | `api/schema-records/grid-data.js` | Implementation changes; inspect commit diff |
| A | `api/schema-records/references.js` | Implementation changes; inspect commit diff |
| A | `api/schema-records/versions.js` | Implementation changes; inspect commit diff |
| M | `api/setup/bootstrap.js` | Implementation changes; inspect commit diff |
| A | `api/setup/init-template-examples.js` | Implementation changes; inspect commit diff |
| M | `api/setup/init-template.js` | Implementation changes; inspect commit diff |
| M | `api/setup/reset.js` | Implementation changes; inspect commit diff |
| M | `api/setup/schema.js` | Implementation changes; inspect commit diff |
| M | `api/subledger-account-types/save.js` | Implementation changes; inspect commit diff |
| M | `api/subledger-accounts/save.js` | Implementation changes; inspect commit diff |
| M | `api/transaction-types/save.js` | Implementation changes; inspect commit diff |
| M | `config/config.json` | Application configuration changes (values omitted) |
| M | `public/app.js` | function ensureReportDefinitions; function installCodeNumberingFields; function updateCodeNumberingFields; function loadCodeNumberingFields; +56 other declarations |
| A | `public/currency-format.js` | function settings; function validate; function format; function parse |
| A | `public/exchange-rate-math.js` | function normalise; function reciprocal |
| A | `public/exchange-rates.js` | function setupKeyboardTabs; function select; function render; function load; +6 other declarations |
| M | `public/index.html` | Page structure and controls |
| A | `public/report-builder.js` | function input; function select; function label; function button; +22 other declarations |
| M | `public/style.css` | Presentation rules |
| A | `public/trial-balance-math.js` | function minorUnits; function decimal; function splitBalance; function totals |
| M | `schema/erp-schema.sql` | table erp_user_menu_favourite; column erp_currency.format_json; table erp_report; table erp_report_module; +4 other declarations |
| A | `schema/exchange-rates.sql` | table erp_exchange_rate; table erp_exchange_rate_change |
| A | `schema/menu-favourites.sql` | table erp_user_menu_favourite |
| M | `seeds/template-defaults.json` | Template/default configuration changes |
| A | `test/accounting-object-documents.test.js` | function fixture; test: accounting object uploads use tenant, organisation and owner permissions; test: document listing requires view access and remains scoped to the object; test: missing objects and denied upload access never insert documents; +1 other declarations |
| A | `test/capex-transactions.test.js` | Implementation changes; inspect commit diff |
| A | `test/code-numbering.test.js` | test: numbering settings validate bounds and optional formatting; old clients preserve settings; test: numbering metadata preserves SQL and parameter positions; test: unrelated broker failures retain their status |
| A | `test/copy-schema-references.test.js` | test: recursive copy preserves formats, unrelated values and source data; test: missing matches become null; absent and non-string values stay intact |
| A | `test/currency-format.test.js` | test: seeded currencies format and parse symbols, grouping, cents and negative values; test: editable formats support alternate separators, suffixes and zero decimals; test: capital WIP is linked to capital projects and covered by every seeded balance sheet; test: vendor and bank schemas use controlled account types and include vendor bank name; +1 other declarations |
| A | `test/exchange-rates.test.js` | test: exact decimal normalisation and reciprocal without binary floating point; test: calendar dates, pair, identifiers and correction reasons are validated; test: API denies non-administrators before reading rates or requesting a transaction |
| A | `test/financial-reports.test.js` | function fixture; table erp_division; table erp_journal; table erp_journal_line; +15 other declarations |
| A | `test/insurance-management.test.js` | test: insurance configuration links every posting line to valid GLs, types and policy classifications; test: mixed reference and parent-grid membership definitions reject ambiguous and unsupported targets; test: transaction object consistency uses schema relationships, permits matching pairs and rejects mismatches; test: all insurance-specific seeded types belong only to Insurance Management |
| A | `test/journal-capture.test.js` | function fixture; function rowFor; test: all seeded financial types initialise only their required and generated definitions; test: owner deposit requires a bank-only subledger on its debit and no subledger on equity credit; +5 other declarations |
| A | `test/menu-favourites.test.js` | function context; test: reads favourites scoped to authenticated user, tenant and organisation; test: add is idempotent and ignores a client supplied user identity; test: remove scopes its delete to the same user and organisation; +3 other declarations |
| A | `test/organisation-creator-admin.test.js` | function handler; test: unauthorised user cannot create an organisation or obtain administrator access; test: new organisation, root and creator assignment use one atomic SQL statement; updates do not assign roles |
| A | `test/report-definitions.test.js` | test: every example report validates against the current template catalogue and has a unique code; function datasets; test: catalogue keeps all parent attributes with one child collection and exposes organisation-wide masters; test: SQL values, custom field keys and user parameters are bound; all division-owned rows are scoped; +3 other declarations |
| M | `test/resource-assignments.test.js` | test: database Date values are accepted when editing existing objects |
| A | `test/schema-fields.test.js` | test: currency accepts the exact upper boundary and rejects excess digits or decimals; test: integer rejects fractions, strings and unsafe values; bounds are enforced; test: text lengths, patterns, choices and optional blank values are validated; test: dates, email and URL fields validate their formats; +4 other declarations |
| A | `test/schema-grids.test.js` | test: period checks group by dimension type, allow gaps, reject inclusive overlaps and never change rows; test: non-period grids support independent rows and observations without invented period rules; test: grid validation reports row and column failures including forbidden keys and invalid money; test: period and reference definitions reject invalid column mappings and nested grids; +6 other declarations |
| A | `test/schema-renderer.test.js` | test: renderer applies text lengths, placeholder and inferred short width; test: renderer uses multiline rows, help text, integer bounds and decimal step; test: currency input formats cents without floating point and validates precision; test: required dropdowns and date/email fields use the correct controls; +1 other declarations |
| A | `test/template-initialisation.test.js` | function endpoint; function context; test: template operations require authentication, administrator rights and explicit confirmation; test: definition and example endpoints invoke ERP planning with authenticated access; +1 other declarations |
| A | `test/template-schema-audit.test.js` | test: template asset locations reference Property accounting objects; test: all seeded type schemas follow the documented canonical convention; test: the audit detects broken tab references and duplicate choice definitions; test: the audit detects missing type schemas and sample-data incompatibility |
| A | `test/transaction-type-setup.test.js` | test: copy opens an unsaved type with a free code while retaining all editor configuration; function editorFixture; test: missing GL reveals its hidden line and shows an error before submitting; test: server save errors remain visible in the transaction type editor; +2 other declarations |
| A | `test/trial-balance-ui.test.js` | function fixture; test: date/period requests preserve division and child scope; test: late responses cannot overwrite a newer trial balance range; test: opening a transaction and returning restores the same filters and account drill-down; +3 other declarations |
| A | `test/trial-balance.test.js` | function fixture; table erp_division; table erp_journal; table erp_journal_line; +19 other declarations |

## cc30d08 | 2026-10-02 | resources

30 ERP file changes. Proposed wording: see the matching commit entry in the changelog.

| Status | ERP file | Selected source evidence |
| --- | --- | --- |
| M | `api/_shared/erp.js` | Implementation changes; inspect commit diff |
| A | `api/_shared/erp/resource-assignments.js` | function day; function validateResourceAssignments; function prepareResourceAssignments; function validateTypeResourceRoleMappings; +1 other declarations |
| M | `api/_shared/erp/seeding.js` | function contentRoot; function templateSeedPath; function loadTemplateDefaults; function seedTaxTypes; +3 other declarations |
| M | `api/accounting-dimensions/save-type.js` | Implementation changes; inspect commit diff |
| M | `api/accounting-dimensions/save.js` | Implementation changes; inspect commit diff |
| M | `api/accounting-objects/save-type.js` | Implementation changes; inspect commit diff |
| M | `api/accounting-objects/save.js` | Implementation changes; inspect commit diff |
| M | `api/gl-account-types/save.js` | Implementation changes; inspect commit diff |
| M | `api/gl-accounts/save.js` | Implementation changes; inspect commit diff |
| M | `api/organisations/copy-organisation-setup.js` | function ensureRootDivision; function copyDivisions; function isEnabled |
| M | `api/permissions/save.js` | function roleCodeFromName |
| A | `api/resources/assignments/list.js` | Implementation changes; inspect commit diff |
| A | `api/resources/assignments/object.js` | Implementation changes; inspect commit diff |
| A | `api/resources/assignments/options.js` | Implementation changes; inspect commit diff |
| A | `api/resources/list.js` | Implementation changes; inspect commit diff |
| A | `api/resources/roles/list.js` | Implementation changes; inspect commit diff |
| A | `api/resources/roles/save.js` | Implementation changes; inspect commit diff |
| A | `api/resources/save.js` | Implementation changes; inspect commit diff |
| M | `api/setup/init-template.js` | Implementation changes; inspect commit diff |
| M | `api/setup/menu.js` | Implementation changes; inspect commit diff |
| M | `api/setup/reset.js` | Implementation changes; inspect commit diff |
| M | `api/setup/schema.js` | Implementation changes; inspect commit diff |
| M | `api/subledger-account-types/save.js` | function object |
| M | `api/subledger-accounts/save.js` | Implementation changes; inspect commit diff |
| M | `public/app.js` | function showResourceEditorTab; function installResourceAssignmentTab; function installResourceAssignmentTabs; function installResourceRoleMappingField; +25 other declarations |
| M | `public/index.html` | Page structure and controls |
| M | `public/style.css` | Presentation rules |
| M | `schema/erp-schema.sql` | table erp_resource; column erp_resource.resource_type; column erp_resource.linked_email; column erp_resource.resource_description; +5 other declarations |
| M | `seeds/template-defaults.json` | Template/default configuration changes |
| A | `test/resource-assignments.test.js` | test: mandatory roles require at least one resource; test: blank dates cover an object; test: overlapping mandatory assignments are allowed; test: gaps in mandatory coverage are rejected; +1 other declarations |

## b6c27c7 | 2026-10-01 | New ERP UI

7 ERP file changes. Proposed wording: see the matching commit entry in the changelog.

| Status | ERP file | Selected source evidence |
| --- | --- | --- |
| A | `api/_shared/svg-icon.js` | function invalid; function escapeText; function escapeAttribute; function parseAttributes; +1 other declarations |
| M | `api/organisations/save.js` | Implementation changes; inspect commit diff |
| M | `api/setup/init-template.js` | function assignCurrentUserAsSecurityAdministrator |
| M | `public/app.js` | function sanitizedModuleSvg; function sanitizedOrganisationSvg; function organisationIconElement; function fixedMenuIconMarkup; +311 other declarations |
| M | `public/index.html` | Page structure and controls |
| M | `public/style.css` | Presentation rules |
| M | `schema/erp-schema.sql` | column erp_organisation.organisation_icon_svg |

## 92ee22c | 2026-10-01 | fixed ERP UI

21 ERP file changes. Proposed wording: see the matching commit entry in the changelog.

| Status | ERP file | Selected source evidence |
| --- | --- | --- |
| M | `api/_shared/erp/access.js` | function setupAccessTablesExist; function hasSetupAdministratorAssignment; function canBootstrapSetup; function isTenantSetupAdministrator; +2 other declarations |
| M | `api/_shared/erp/auth.js` | Implementation changes; inspect commit diff |
| M | `api/_shared/erp/modules.js` | Implementation changes; inspect commit diff |
| M | `api/_shared/erp/schema.js` | Implementation changes; inspect commit diff |
| M | `api/_shared/erp/seeding.js` | Implementation changes; inspect commit diff |
| M | `api/accounting-dimensions/list.js` | Implementation changes; inspect commit diff |
| M | `api/accounting-objects/list.js` | Implementation changes; inspect commit diff |
| A | `api/context/save.js` | Implementation changes; inspect commit diff |
| M | `api/dashboard/summary.js` | Implementation changes; inspect commit diff |
| M | `api/journals/list.js` | Implementation changes; inspect commit diff |
| M | `api/permissions/list.js` | Implementation changes; inspect commit diff |
| M | `api/permissions/role-modules.js` | Implementation changes; inspect commit diff |
| M | `api/reports/financial.js` | Implementation changes; inspect commit diff |
| M | `api/setup/bootstrap.js` | Implementation changes; inspect commit diff |
| M | `api/setup/init-template.js` | Implementation changes; inspect commit diff |
| M | `api/setup/schema.js` | Implementation changes; inspect commit diff |
| M | `api/subledger-accounts/list.js` | Implementation changes; inspect commit diff |
| M | `public/app.js` | function applyTheme; function initTheme; function initSidebarCollapse; function organisationContext; +28 other declarations |
| M | `public/index.html` | Page structure and controls |
| M | `public/style.css` | Presentation rules |
| M | `schema/erp-schema.sql` | table erp_user_tenant_context; table erp_user_organisation_context |

## 90235f0 | 2026-09-30 | refreshed permissions and fixed template

63 ERP file changes. Proposed wording: see the matching commit entry in the changelog.

| Status | ERP file | Selected source evidence |
| --- | --- | --- |
| M | `api/_shared/erp.js` | Implementation changes; inspect commit diff |
| M | `api/_shared/erp/access.js` | function hasOrganisationResourcePermission; function requireOrganisationResourcePermission |
| M | `api/_shared/erp/auth.js` | function authTenant |
| M | `api/_shared/erp/journals.js` | Implementation changes; inspect commit diff |
| M | `api/_shared/erp/seeding.js` | Implementation changes; inspect commit diff |
| A | `api/_shared/erp/workflow.js` | function normalizeStepCode; function workflowObjectConfig; function defaultWorkflowStepCode; function validateWorkflowPath; +1 other declarations |
| M | `api/accounting-dimensions/list.js` | Implementation changes; inspect commit diff |
| M | `api/accounting-dimensions/save-type.js` | Implementation changes; inspect commit diff |
| M | `api/accounting-dimensions/save.js` | Implementation changes; inspect commit diff |
| M | `api/accounting-objects/list.js` | Implementation changes; inspect commit diff |
| M | `api/accounting-objects/save-type.js` | Implementation changes; inspect commit diff |
| M | `api/accounting-objects/save.js` | Implementation changes; inspect commit diff |
| A | `api/accounting-objects/workflow.js` | Implementation changes; inspect commit diff |
| D | `api/accounts/list.js` | Removed from this revision |
| D | `api/accounts/save.js` | Removed from this revision |
| M | `api/dashboard/summary.js` | Implementation changes; inspect commit diff |
| M | `api/documents/_shared/documents.js` | Implementation changes; inspect commit diff |
| M | `api/financial-formats/list.js` | Implementation changes; inspect commit diff |
| M | `api/financial-formats/save.js` | Implementation changes; inspect commit diff |
| R059 | `api/masterdata/types.js` → `api/gl-account-types/list.js` | Implementation changes; inspect commit diff |
| A | `api/gl-account-types/save.js` | Implementation changes; inspect commit diff |
| A | `api/gl-accounts/list.js` | Implementation changes; inspect commit diff |
| A | `api/gl-accounts/save.js` | Implementation changes; inspect commit diff |
| M | `api/intake/_shared/intake.js` | Implementation changes; inspect commit diff |
| M | `api/journals/detail.js` | Implementation changes; inspect commit diff |
| M | `api/journals/save.js` | Implementation changes; inspect commit diff |
| M | `api/journals/workflow.js` | Implementation changes; inspect commit diff |
| D | `api/ledger-families/list.js` | Removed from this revision |
| D | `api/ledger-families/save.js` | Removed from this revision |
| D | `api/ledger-types/list.js` | Removed from this revision |
| D | `api/ledger-types/save.js` | Removed from this revision |
| M | `api/legal-entities/detail.js` | Implementation changes; inspect commit diff |
| M | `api/legal-entities/list.js` | Implementation changes; inspect commit diff |
| M | `api/legal-entities/save.js` | Implementation changes; inspect commit diff |
| D | `api/masterdata/list.js` | Removed from this revision |
| D | `api/masterdata/save-type.js` | Removed from this revision |
| D | `api/masterdata/save.js` | Removed from this revision |
| D | `api/masterdata/workflow.js` | Removed from this revision |
| R050 | `api/organisations/copy-seeding-data.js` → `api/organisations/copy-organisation-setup.js` | Implementation changes; inspect commit diff |
| M | `api/organisations/delete-data.js` | Implementation changes; inspect commit diff |
| M | `api/organisations/import-chart.js` | Implementation changes; inspect commit diff |
| M | `api/permissions/claim-admin.js` | Implementation changes; inspect commit diff |
| M | `api/permissions/list.js` | Implementation changes; inspect commit diff |
| A | `api/permissions/role-modules.js` | Implementation changes; inspect commit diff |
| M | `api/permissions/save.js` | Implementation changes; inspect commit diff |
| M | `api/reports/financial.js` | Implementation changes; inspect commit diff |
| M | `api/setup/bootstrap.js` | function canBootstrapTemplateOrganisation |
| D | `api/setup/example-org.js` | Removed from this revision |
| M | `api/setup/init-template.js` | function canBootstrapTemplateOrganisation; function isCurrentUserSetupAdministrator; function assignCurrentUserAsSecurityAdministrator |
| M | `api/setup/menu.js` | Implementation changes; inspect commit diff |
| M | `api/setup/reference.js` | Implementation changes; inspect commit diff |
| M | `api/setup/reset.js` | Implementation changes; inspect commit diff |
| A | `api/setup/workflows.js` | Implementation changes; inspect commit diff |
| A | `api/subledger-account-types/list.js` | Implementation changes; inspect commit diff |
| A | `api/subledger-account-types/save.js` | function object |
| A | `api/subledger-accounts/list.js` | Implementation changes; inspect commit diff |
| A | `api/subledger-accounts/save.js` | Implementation changes; inspect commit diff |
| M | `api/transaction-types/save.js` | Implementation changes; inspect commit diff |
| M | `public/app.js` | function fixedMenuIconMarkup; function moduleIconMarkup; function resourceIconMarkup; function selectedModuleIds; +69 other declarations |
| M | `public/index.html` | Page structure and controls |
| M | `public/style.css` | Presentation rules |
| M | `schema/erp-schema.sql` | column erp_subledger_account_type.type_description; column erp_subledger_account_type.workflow_path_id; column erp_subledger_account_type.ui_schema_json; column erp_accounting_object_type.type_description; +16 other declarations |
| M | `seeds/template-defaults.json` | Template/default configuration changes |

## a772088 | 2026-09-12 | Latest Module based changes

46 ERP file changes. Proposed wording: see the matching commit entry in the changelog.

| Status | ERP file | Selected source evidence |
| --- | --- | --- |
| M | `api/_shared/erp/access.js` | function isTenantAdministrator; function requireBusinessAccess; function requireModuleAccess |
| M | `api/_shared/erp/auth.js` | Implementation changes; inspect commit diff |
| A | `api/_shared/erp/modules.js` | function moduleIds; function validateModules; function replaceLinks |
| M | `api/_shared/erp/seeding.js` | Implementation changes; inspect commit diff |
| M | `api/_shared/erp/utils.js` | Implementation changes; inspect commit diff |
| A | `api/accounting-dimensions/list.js` | Implementation changes; inspect commit diff |
| A | `api/accounting-dimensions/save-type.js` | Implementation changes; inspect commit diff |
| A | `api/accounting-dimensions/save.js` | Implementation changes; inspect commit diff |
| A | `api/accounting-dimensions/types.js` | Implementation changes; inspect commit diff |
| A | `api/accounting-objects/list.js` | Implementation changes; inspect commit diff |
| A | `api/accounting-objects/save-type.js` | Implementation changes; inspect commit diff |
| A | `api/accounting-objects/save.js` | Implementation changes; inspect commit diff |
| A | `api/accounting-objects/search.js` | Implementation changes; inspect commit diff |
| A | `api/accounting-objects/types.js` | Implementation changes; inspect commit diff |
| M | `api/accounts/list.js` | Implementation changes; inspect commit diff |
| M | `api/accounts/save.js` | Implementation changes; inspect commit diff |
| M | `api/journals/detail.js` | Implementation changes; inspect commit diff |
| M | `api/journals/list.js` | Implementation changes; inspect commit diff |
| M | `api/journals/save.js` | Implementation changes; inspect commit diff |
| M | `api/journals/workflow.js` | Implementation changes; inspect commit diff |
| M | `api/ledger-families/list.js` | Implementation changes; inspect commit diff |
| M | `api/ledger-families/save.js` | Implementation changes; inspect commit diff |
| M | `api/legal-entities/detail.js` | Implementation changes; inspect commit diff |
| M | `api/legal-entities/list.js` | Implementation changes; inspect commit diff |
| M | `api/legal-entities/save.js` | Implementation changes; inspect commit diff |
| M | `api/masterdata/save-type.js` | Implementation changes; inspect commit diff |
| A | `api/modules/list.js` | Implementation changes; inspect commit diff |
| A | `api/modules/save.js` | Implementation changes; inspect commit diff |
| A | `api/navigation/menu.js` | Implementation changes; inspect commit diff |
| M | `api/organisations/copy-seeding-data.js` | Implementation changes; inspect commit diff |
| M | `api/organisations/delete-data.js` | Implementation changes; inspect commit diff |
| M | `api/permissions/claim-admin.js` | Implementation changes; inspect commit diff |
| M | `api/permissions/list.js` | Implementation changes; inspect commit diff |
| M | `api/permissions/save.js` | Implementation changes; inspect commit diff |
| M | `api/reports/financial.js` | Implementation changes; inspect commit diff |
| M | `api/setup/example-org.js` | function ensureAccountingExamples |
| M | `api/setup/init-template.js` | Implementation changes; inspect commit diff |
| M | `api/setup/menu.js` | Implementation changes; inspect commit diff |
| M | `api/setup/reference.js` | Implementation changes; inspect commit diff |
| M | `api/setup/reset.js` | Implementation changes; inspect commit diff |
| M | `api/transaction-types/save.js` | Implementation changes; inspect commit diff |
| M | `public/app.js` | function sanitizedModuleSvg; function moduleIconMarkup; function renderModuleIconPreview; function installModuleIconEditor; +47 other declarations |
| M | `public/index.html` | Page structure and controls |
| M | `public/style.css` | Presentation rules |
| M | `schema/erp-schema.sql` | table erp_module; column erp_module.module_icon_svg; table erp_gl_account_type; table erp_subledger_account_type; +11 other declarations |
| M | `seeds/template-defaults.json` | Template/default configuration changes |

## 5a42378 | 2026-09-06 | Add ERP setup and intake features

55 ERP file changes. Proposed wording: see the matching commit entry in the changelog.

| Status | ERP file | Selected source evidence |
| --- | --- | --- |
| M | `api/_shared/erp.js` | Implementation changes; inspect commit diff |
| A | `api/_shared/erp/access.js` | function isAdministrator; function requireAdmin; function hasResourcePermission; function requireResourcePermission |
| A | `api/_shared/erp/auth.js` | function authTenant |
| A | `api/_shared/erp/journals.js` | function checkPeriodOpen; function validateJournal |
| A | `api/_shared/erp/schema.js` | function contentRoot; function schemaPath; function readSchemaSql; function runSchemaSql; +1 other declarations |
| A | `api/_shared/erp/seeding.js` | function contentRoot; function templateSeedPath; function loadTemplateDefaults; function ensureTenantSeed; +3 other declarations |
| A | `api/_shared/erp/utils.js` | function clean; function nullable; function bool; function money; +3 other declarations |
| A | `api/_shared/openai-settings.js` | function secret; function encryptKey; function decryptKey; function maskKey; +1 other declarations |
| M | `api/accounts/list.js` | Implementation changes; inspect commit diff |
| M | `api/accounts/save.js` | Implementation changes; inspect commit diff |
| M | `api/countries/list.js` | Implementation changes; inspect commit diff |
| M | `api/countries/save.js` | Implementation changes; inspect commit diff |
| M | `api/currencies/list.js` | Implementation changes; inspect commit diff |
| M | `api/currencies/save.js` | Implementation changes; inspect commit diff |
| M | `api/dashboard/summary.js` | Implementation changes; inspect commit diff |
| A | `api/documents/_shared/documents.js` | function parseDataUrl; function requireEntity; function listDocuments; function uploadDocument; +1 other declarations |
| A | `api/documents/delete.js` | Implementation changes; inspect commit diff |
| A | `api/documents/list.js` | Implementation changes; inspect commit diff |
| A | `api/documents/upload.js` | Implementation changes; inspect commit diff |
| A | `api/financial-formats/delete.js` | Implementation changes; inspect commit diff |
| A | `api/financial-formats/list.js` | Implementation changes; inspect commit diff |
| A | `api/financial-formats/save.js` | function normalCode |
| M | `api/fiscal/save-year.js` | Implementation changes; inspect commit diff |
| A | `api/intake/_shared/intake.js` | function parseDataUrl; function pickTextOutput; function legalEntitySchema; function callOpenAiForLegalEntity; +3 other declarations |
| A | `api/intake/analyse.js` | Implementation changes; inspect commit diff |
| A | `api/intake/confirm.js` | Implementation changes; inspect commit diff |
| M | `api/journals/detail.js` | Implementation changes; inspect commit diff |
| M | `api/journals/list.js` | Implementation changes; inspect commit diff |
| M | `api/journals/save.js` | Implementation changes; inspect commit diff |
| M | `api/journals/workflow.js` | Implementation changes; inspect commit diff |
| M | `api/ledger-families/list.js` | Implementation changes; inspect commit diff |
| M | `api/ledger-families/save.js` | Implementation changes; inspect commit diff |
| M | `api/ledger-types/list.js` | Implementation changes; inspect commit diff |
| M | `api/masterdata/list.js` | Implementation changes; inspect commit diff |
| M | `api/organisations/copy-seeding-data.js` | Implementation changes; inspect commit diff |
| M | `api/organisations/delete-data.js` | Implementation changes; inspect commit diff |
| A | `api/permissions/claim-admin.js` | Implementation changes; inspect commit diff |
| M | `api/permissions/list.js` | Implementation changes; inspect commit diff |
| M | `api/reports/financial.js` | function accountAmountSql; function calculateLines; function financialStatement; function periodBounds; +2 other declarations |
| M | `api/setup/bootstrap.js` | Implementation changes; inspect commit diff |
| A | `api/setup/example-org.js` | function fallbackTemplate; function query; function deleteExistingExample; function createExampleOrganisation; +8 other declarations |
| M | `api/setup/init-template.js` | Implementation changes; inspect commit diff |
| M | `api/setup/menu.js` | Implementation changes; inspect commit diff |
| A | `api/setup/openai.js` | Implementation changes; inspect commit diff |
| M | `api/setup/reset.js` | Implementation changes; inspect commit diff |
| A | `api/setup/schema.js` | function isAdministrator; function schemaPath |
| A | `api/tax-types/delete-rate.js` | Implementation changes; inspect commit diff |
| A | `api/tax-types/list.js` | Implementation changes; inspect commit diff |
| A | `api/tax-types/save.js` | function normalCode; function taxDirection |
| M | `config/config.json` | Application configuration changes (values omitted) |
| M | `public/app.js` | function timeOnly; function journalDateTime; function currentOrganisationId; function ledgerFamilyRequiresLegalEntity; +48 other declarations |
| M | `public/index.html` | Page structure and controls |
| M | `public/style.css` | Presentation rules |
| A | `schema/erp-schema.sql` | table erp_organisation; table erp_division; table erp_legal_entity; table erp_legal_entity_identification; +37 other declarations |
| A | `seeds/template-defaults.json` | Template/default configuration changes |

## 7067cbe | 2026-08-25 | Initial project commit

50 ERP file changes. Proposed wording: see the matching commit entry in the changelog.

| Status | ERP file | Selected source evidence |
| --- | --- | --- |
| A | `api/_shared/erp.js` | function ensureSchema; function ensureSchemaUncached; table erp_organisation; table erp_division; +54 other declarations |
| A | `api/_shared/tenant.js` | function authTenant |
| A | `api/accounts/list.js` | Implementation changes; inspect commit diff |
| A | `api/accounts/save.js` | Implementation changes; inspect commit diff |
| A | `api/countries/list.js` | Implementation changes; inspect commit diff |
| A | `api/countries/save.js` | Implementation changes; inspect commit diff |
| A | `api/currencies/list.js` | Implementation changes; inspect commit diff |
| A | `api/currencies/save.js` | Implementation changes; inspect commit diff |
| A | `api/dashboard/summary.js` | Implementation changes; inspect commit diff |
| A | `api/divisions/list.js` | Implementation changes; inspect commit diff |
| A | `api/divisions/save.js` | Implementation changes; inspect commit diff |
| A | `api/fiscal/list.js` | Implementation changes; inspect commit diff |
| A | `api/fiscal/save-period.js` | Implementation changes; inspect commit diff |
| A | `api/fiscal/save-year.js` | Implementation changes; inspect commit diff |
| A | `api/journals/detail.js` | Implementation changes; inspect commit diff |
| A | `api/journals/list.js` | Implementation changes; inspect commit diff |
| A | `api/journals/save.js` | Implementation changes; inspect commit diff |
| A | `api/journals/workflow.js` | Implementation changes; inspect commit diff |
| A | `api/ledger-families/list.js` | Implementation changes; inspect commit diff |
| A | `api/ledger-families/save.js` | function parseJson |
| A | `api/ledger-types/list.js` | Implementation changes; inspect commit diff |
| A | `api/ledger-types/save.js` | Implementation changes; inspect commit diff |
| A | `api/legal-entities/detail.js` | Implementation changes; inspect commit diff |
| A | `api/legal-entities/list.js` | Implementation changes; inspect commit diff |
| A | `api/legal-entities/save.js` | Implementation changes; inspect commit diff |
| A | `api/masterdata/list.js` | Implementation changes; inspect commit diff |
| A | `api/masterdata/save-type.js` | Implementation changes; inspect commit diff |
| A | `api/masterdata/save.js` | Implementation changes; inspect commit diff |
| A | `api/masterdata/types.js` | Implementation changes; inspect commit diff |
| A | `api/masterdata/workflow.js` | Implementation changes; inspect commit diff |
| A | `api/notes/create.js` | Implementation changes; inspect commit diff |
| A | `api/notes/list.js` | Implementation changes; inspect commit diff |
| A | `api/organisations/copy-seeding-data.js` | function ensureRootDivision; function copyDivisions; function isEnabled |
| A | `api/organisations/delete-data.js` | function isEnabled |
| A | `api/organisations/import-chart.js` | Implementation changes; inspect commit diff |
| A | `api/organisations/save.js` | Implementation changes; inspect commit diff |
| A | `api/permissions/list.js` | Implementation changes; inspect commit diff |
| A | `api/permissions/save.js` | function roleCodeFromName |
| A | `api/reports/financial.js` | Implementation changes; inspect commit diff |
| A | `api/setup/bootstrap.js` | Implementation changes; inspect commit diff |
| A | `api/setup/init-template.js` | Implementation changes; inspect commit diff |
| A | `api/setup/menu.js` | Implementation changes; inspect commit diff |
| A | `api/setup/reference.js` | Implementation changes; inspect commit diff |
| A | `api/setup/reset.js` | Implementation changes; inspect commit diff |
| A | `api/transaction-groups/save.js` | Implementation changes; inspect commit diff |
| A | `api/transaction-types/save.js` | Implementation changes; inspect commit diff |
| A | `config/config.json` | Application configuration changes (values omitted) |
| A | `public/app.js` | function orgStorageKey; function getStoredOrgId; function storeCurrentOrg; function resolveCurrentOrgId; +130 other declarations |
| A | `public/index.html` | Page structure and controls |
| A | `public/style.css` | Presentation rules |
