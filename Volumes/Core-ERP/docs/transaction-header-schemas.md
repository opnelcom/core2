# Transaction header schemas

Transaction types use the same schema format, field rendering, grids, references, tabs and validation as master-data objects. Custom values are stored in `erp_journal.additional_data`. Saved transactions are displayed and validated against the current transaction type schema; mandatory fields must be completed when saving a draft.

## Template definitions

`seeds/template-defaults.json` defines 46 reusable `transactionSchemaFamilies` and explicit `transactionTypeSchemaFamilies` mappings covering all 110 seeded transaction types across 18 populated groups. The shared resolver validates coverage and expands families to ordinary, independent JSON schemas before seeding. No family references are stored in transaction types and no new browser schema dialect is required.

**Initialise Template Org** retains its existing full delete-and-reseed behaviour. Every rebuild inserts the resolved schemas from JSON with fresh transaction definitions. Existing template transaction schemas are not inspected, merged or preserved. No separate schema-application action is introduced. Other organisations are unaffected by template rebuilding.

Invoice families use `supplierInvoiceNumber` and `supplierInvoiceDate`. Cash purchases allow receipt-only evidence. Existing accounting allocations and workflow identities retain their roles. Supporting meter readings and cash-denomination grids do not calculate amounts or create postings. Tour commercial additions remain optional because the linked tour invoice owns the underlying commercial data.

## Supplier invoice columns

Apply the database change through **Initialise Schema**. Before dropping the old supplier invoice number/date columns, the schema action transfers their non-empty values into `additional_data`, giving existing custom values precedence. The transfer is repeatable after the old columns have been removed. The existing `supplier_invoice_number` report field remains available and reads `additional_data.supplierInvoiceNumber`; type-specific report datasets expose the configured fields normally.

This change does not remove the separate supplier-account or VAT-recipient columns.

## Deployment status

Source and automated checks do not initialise a database. Initialise Schema and template population must be reported separately when actually performed. The existing Initialise Template Org action is a destructive rebuild of template setup and business data; do not describe it as an incremental schema update.
