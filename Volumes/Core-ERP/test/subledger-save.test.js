"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

for (const editing of [false, true]) {
  test(`sub-ledger ${editing ? "update" : "creation"} supplies every SQL parameter`, async () => {
    let saved;
    const helpers = {
      authTenant: async () => ({ tenantId: "tenant", auth: { email: "owner@example.test" } }),
      defaultWorkflowStepCode: async () => "configured-initial-step",
      requireModuleAccess: async () => null,
      requireResourcePermission: async () => null,
      prepareResourceAssignments: async () => ({ errors: [], replace: false }),
      clean: value => String(value || "").trim(),
      nullable: value => value || null,
      parseJson: value => value || {},
      validateSchema: () => [],
    };
    const sandbox = {
      module: { exports: {} },
      require: name => {
        if (name === "crypto") return require(name);
        if (name.endsWith("code-numbering")) return {
          numberedRecordStatement: (statement, numbering) => ({ ...statement, numbering }),
          saveNumberedTransaction: async (_ctx, statements) => { saved = statements[0]; },
        };
        if (name.endsWith("schema-references")) return { validateSchemaReferences: async () => [] };
        if (name.endsWith("object-versions")) return { objectSaveStatements: options => options.statements };
        if (name === "../_shared/erp") return helpers;
        throw new Error(`Unexpected import: ${name}`);
      },
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../api/subledger-accounts/save.js"), "utf8"), sandbox);
    const result = await sandbox.module.exports({
      req: { method: "POST" },
      body: {
        organisation_id: "organisation", owner_division_id: "division",
        subledger_account_type_id: "type", account_code: "ASSET-1", account_name: "Asset",
        ...(editing ? { subledger_account_id: "existing-record" } : {}),
      },
      broker: async (_profile, _action, statement) => {
        if (statement.text.includes("SELECT requires_legal_entity"))
          return { rowCount: 1, rows: [{ requires_legal_entity: false, schema_json: {} }] };
        return { rowCount: 1, rows: [{ subledger_account_id: "saved-record", valid_from: "2026-01-01" }] };
      },
      send: (status, body) => { assert.fail(`Unexpected response ${status}: ${JSON.stringify(body)}`); },
    });
    assert.ok(result.subledger_account);
    const placeholders = [...saved.text.matchAll(/\$(\d+)/g)].map(match => Number(match[1]));
    assert.equal(saved.values.length, Math.max(...placeholders));
    assert.equal(saved.values.length, editing ? 10 : 11);
    assert.equal(saved.values[5], "ASSET-1");
    assert.equal(saved.numbering.idParameter, 10);
    if (editing) {
      assert.equal(saved.values[9], "existing-record");
      assert.match(saved.text, /^UPDATE /);
      assert.doesNotMatch(saved.text, /workflow_status=/);
    } else {
      assert.match(saved.text, /^INSERT /);
      assert.equal(saved.values[10], "configured-initial-step");
    }
  });
}
