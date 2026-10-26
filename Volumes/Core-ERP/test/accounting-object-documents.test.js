"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../api/documents/_shared/documents"), "utf8");

function fixture({ denied = null, missing = false, kind = "accounting_object" } = {}) {
  const queries = [], permissions = [];
  const access = { tenantId: "tenant-1", auth: { email: "user@example.com" } };
  const dependencies = {
    authTenant: async () => access,
    clean: (value, fallback = "") => String(value ?? "").trim() || fallback,
    requireResourcePermission: async (_ctx, _access, options) => { permissions.push(options); return denied; },
  };
  const context = { module: { exports: {} }, Buffer, require: name => name.endsWith('/context') ? require('../api/_shared/context') : dependencies };
  vm.createContext(context);
  vm.runInContext(source, context);
  const ctx = {
    req: { method: "POST" },
    query: { organisation_id: "org-1", entity_kind: kind, entity_id: "object-1" },
    body: { organisation_id: "org-1", entity_kind: kind, entity_id: "object-1", document_id: "document-1", file_name: "contract.txt", data_url: "data:text/plain;base64,aGVsbG8=" },
    send: (status, body) => ({ status, body }),
    broker: async (_profile, _action, query) => {
      queries.push(query);
      if (query.text.includes(`FROM erp_${kind}`)) return { rowCount: missing ? 0 : 1, rows: [{ accounting_object_type_id: "type-1", subledger_account_type_id:"type-1",transaction_type_id:"type-1", source_division_id:"division-1", owner_division_id: "division-1" }] };
      if (query.text.startsWith("SELECT organisation_id")) return { rowCount: 1, rows: [{ organisation_id: "org-1", entity_kind: kind, entity_id: "object-1" }] };
      return { rowCount: 1, rows: [{ document_id: "document-1" }] };
    },
  };
  return { api: context.module.exports, ctx, queries, permissions };
}

test("accounting object uploads use tenant, organisation and owner permissions", async () => {
  const { api, ctx, queries, permissions } = fixture();
  const response = await api.uploadDocument(ctx);
  assert.equal(response.status, 201);
  const insert = queries.find((query) => query.text.startsWith("INSERT"));
  assert.deepEqual(Array.from(insert.values).slice(0, 4), ["tenant-1", "org-1", "accounting_object", "object-1"]);
  assert.equal(insert.values[7], 5);
  assert.equal(permissions[0].divisionId, "division-1");
  assert.equal(permissions[0].resourceCode, "type-1");
  assert.equal(permissions[0].workflowStatus, "*");
});
test("document listing requires view access and remains scoped to the object", async () => {
  const { api, ctx, queries, permissions } = fixture();
  const result = await api.listDocuments(ctx);
  assert.equal(result.documents[0].document_id, "document-1");
  assert.equal(permissions[0].workflowStatus, "view");
  assert.deepEqual(Array.from(queries[1].values), ["tenant-1", "org-1", "accounting_object", "object-1"]);
});
test("missing objects and denied upload access never insert documents", async () => {
  for (const [options, status] of [[{ missing: true }, 404], [{ denied: { status: 403, body: { error: "Denied" } } }, 403]]) {
    const { api, ctx, queries } = fixture(options);
    assert.equal((await api.uploadDocument(ctx)).status, status);
    assert.ok(queries.every((query) => !query.text.startsWith("INSERT")));
  }
});
test("deleting accounting object documents checks manage access before soft deletion", async () => {
  const allowed = fixture();
  assert.equal((await allowed.api.deleteDocument(allowed.ctx)).deleted, 1);
  assert.equal(allowed.permissions[0].workflowStatus, "*");
  assert.ok(allowed.queries.at(-1).text.includes("SET deleted=true"));
  const denied = fixture({ denied: { status: 403, body: { error: "Denied" } } });
  assert.equal((await denied.api.deleteDocument(denied.ctx)).status, 403);
  assert.ok(denied.queries.every((query) => !query.text.startsWith("UPDATE")));
});


test("sub-ledger and transaction documents use the record's saved division and role permission",async()=>{
 for(const [kind,resourceKind] of [['subledger_account','subledger_account'],['journal','transaction']]){
  const allowed=fixture({kind});await allowed.api.listDocuments(allowed.ctx);
  assert.equal(allowed.permissions[0].divisionId,'division-1');assert.equal(allowed.permissions[0].resourceKind,resourceKind);
  const denied=fixture({kind,denied:{status:403,body:{error:'No division access'}}});
  assert.equal((await denied.api.uploadDocument(denied.ctx)).status,403);assert.ok(!denied.queries.some(q=>q.text.startsWith('INSERT')));
 }
});
