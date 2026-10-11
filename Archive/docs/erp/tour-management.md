# Tour template seeding

The template organisation includes eight accounting-object types: tour, tour_guide, tour_vehicle, tour_departure, tour_booking, tour_job_card, tour_quote and tour_invoice. They demonstrate scheduled and private tours, itineraries, guide Resource references, vehicle profiles, passenger manifests, guide/vehicle allocation grids, pricing lines, manual payments and document references. Seed examples use the existing USD, GBP, EUR and ZAR currencies.

Tour Management module mappings and the tour customer invoice transaction type, financial line definitions and classifications are seeded recommendations. Examples are draft records and can be edited through the standard accounting-object forms. Operational status, quantities, tax and totals are stored example data; there is no tour-specific calculation, quote acceptance, booking conversion, capacity check, scheduling conflict check, lifecycle enforcement or automatic journal creation. Standard shared schema validation and accounting-object workflows continue to apply.

Run Initialise Template Org to reset JSON-defined configuration in TEMPLATE ORG. Run Initialise Template Org Example Data separately, with confirmation, to add examples. Existing example records and non-template organisations are preserved.

Implementation: template-defaults.json, the standard seeding.js, seed-line-classifications.js and seed-record-examples.js. Tour definitions and examples share the standard class-based sections; no tour addon seeder remains. See [Template initialisation](template-initialisation.md).

Verification: node Tools/ERP/audit-template-schemas.js and node Tools/ERP-Acceptance/test/tour-management.database.js (PGlite on NODE_PATH).
