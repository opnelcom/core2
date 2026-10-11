# ObjectSphere catalogue import

Select the destination object and choose **Import catalogue**. Upload a JSON file,
review all fields, select records and choose **Import selected**. It reuses the
tenant's existing active types and attributes; it does not create setup types.

```json
{
  "format": "objectsphere-catalogue",
  "version": 1,
  "source": "my-library",
  "objects": [{
    "source_key": "shelf-01-book-01",
    "name": "Example book",
    "type": "Book",
    "quantity": 1,
    "description": "Description and source notes",
    "attributes": {"Author": "Example author", "Location / Shelf": "Shelf 01"}
  }]
}
```

Use exact type/attribute names. All attribute values must be strings, retaining
ISBN leading zeros. Dates require real YYYY-MM-DD dates; numeric fields validate
their declared type. Quantity is a positive integer. Files contain 1Ã¢â‚¬â€œ500 records
and must be smaller than 800 KB in the UI. Split larger catalogues while retaining
the same source and unique source keys.

`source` plus `source_key` identifies a physical object within the tenant and
destination. Keep both stable on repeat submissions. Different copies of one
title require different keys. A matching imported fingerprint is skipped;
changed imported data is flagged as a conflict and cannot overwrite an object.
Name matches are warnings, initially unselected, because titles do not uniquely
identify physical copies. Imports before this feature have no source ledger and
can only be flagged by name. Review those warnings explicitly.

Preview never inserts objects. It lazily creates the additive import ledger.
Confirmation validates again and uses one Core-Broker transaction for parent,
type and attribute locks, claims, object creation, type links, values and history.
A destination advisory lock serializes importer submissions; unique ledger keys
prevent duplicate creation after concurrent submissions, retries or lost responses.
A failed batch rolls back all of its records and claims. Concurrently claimed
keys are skipped without overwriting data. No existing objects are updated.

The ledger is `objectsphere_catalogue_import`, with a primary key on
tenant/destination/source/key and a deferred item foreign key. Archived/deleted
objects keep their claims: reimport does not resurrect them. Moving an imported
object keeps its original import destination identity. Use the same destination
when retrying. Tenant transfer exports do not include this ledger; source-key
deduplication is not retained after a transfer. The existing tenant replace operation clears that tenant's import ledger in the same replacement transaction. This import adds no photos; source
filenames and reference URLs can be stored as descriptions/characteristics.

For the photo book catalogue, confirmed ISBNs go into ISBN. Online edition ISBNs,
publisher and date remain labelled reference data in the description. No date is
fabricated from a year. Visible spine notes are not asserted as Edition.

Endpoints: POST `import/catalogue/preview` and `import/catalogue/confirm`, with
`parent_item_id` and `catalogue`; confirmation also requires `source_keys`.
They use existing tenant membership authorization, matching object creation.

Validation: run `node --test Volumes/Core-ObjectSphere/test/catalogue*.test.js`.
The database fixture uses `@electric-sql/pglite` from NODE_PATH and never connects
to the live database. It covers validation, tenant isolation, leading-zero ISBNs,
history, repeated imports, conflicts, separate copies and rollback after a
mid-batch failure, plus compatibility and rollback for tenant replacement. Deployment adds the new API/helper and static files; existing
database schema is updated additively on first use. There are no broker changes.

Live verification on 2026-10-06: imported 344 catalogue entries into Oppenheim Family / Study / Books; repeat preview returned 0 new, 344 already imported and 0 conflicts. UI and API were verified against the running app.
