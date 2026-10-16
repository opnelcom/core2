# Schema visibility

`showif` controls presentation only. Hidden values remain in collected and saved data; required checks and all record validation remain unchanged. Definitions are checked when saving an object type.

Supported locations: schema tabs, ordinary properties, grid properties (the entire grid), and properties inside a grid's `rowSchema`. Both editors and read-only schema views use these rules.

```json
{"showif":{"field":"contractType","operator":"in","value":["lease_in","lease_out","rental_agreement"]}}
```

Use stored option codes. Operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`, `isEmpty`, `isNotEmpty`. Provide exactly one literal `value` or a `valueField` in the same scope. Membership operators require a literal array; empty checks take neither operand. Numeric fields compare numerically, dates compare chronologically, text compares case-sensitively, and empty values do not satisfy ordering comparisons. Missing, null, empty text and empty arrays count as empty.

Combine rules with `{"all":[...]}` or `{"any":[...]}`. Each group contains non-empty condition arrays and may nest. No executable expressions are supported.

Scope defaults to `object` outside a grid and `row` within grid fields. Explicit `"scope":"object"` within a row refers to the parent record; `"scope":"row"` refers to the current row. References must name scalar schema fields. A hidden row field retains its cell space while other rows display the column; a column hides completely when no row displays it.

Hidden tabs hide their contents. If the selected tab becomes hidden, the first visible schema tab is selected; editors fall back to Identification when none remain. Visibility is independent of other fields' visibility: conditions evaluate retained data.

`contract-showif.json` contains the approved illustrative contract rules. Template defaults include these rules for future definition initialisation. Existing saved custom schemas must be updated through the type editor; no live definitions or data were updated. Do not reinitialise an organisation solely to apply these rules, as definition initialisation can overwrite other seeded configuration.

Run focused checks with `node --test Volumes/Core-ERP/test/schema-visibility.test.js`. Browser checks run when Playwright is available; set `SHOWIF_BROWSER_CHANNEL=msedge` to use installed Edge. Browser checks use an isolated renderer fixture, not a running ERP deployment.
