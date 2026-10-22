"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../api/documents/_shared/documents"), "utf8");

function fixture({ denied = null, missing = false } = {}) {
  const queries = [], permissions = [];
  const access = { tenantId: "tenant-1", auth: { email: "user@example.com" } };
  const dependencies = {
    authTenant: async () => access,
    clean: (value, fallback = "") => String(value ?? "").trim() || fallback,
    requireModuleAccess: async (_ctx, _access, options) => { permissions.push(options); return null; },
    requireResourcePermission: async (_ctx, _access, options) => { permissions.push(options); return denied; },
  };
  const context = { module: { exports: {} }, Buffer, require: name => name.endsWith('/context') ? require('../api/_shared/context') : dependencies };
  vm.createContext(context);
  vm.runInContext(source, context);
  const ctx = {
    req: { method: "POST" },
    query: { organisation_id: "org-1", entity_kind: "accounting_object", entity_id: "object-1" },
    body: { organisation_id: "org-1", entity_kind: "accounting_object", entity_id: "object-1", document_id: "document-1", file_name: "contract.txt", data_url: "data:text/plain;base64,aGVsbG8=" },
    send: (status, body) => ({ status, body }),
    broker: async (_profile, _action, query) => {
      queries.push(query);
      if (query.text.includes("FROM erp_accounting_object")) return { rowCount: missing ? 0 : 1, rows: [{ accounting_object_type_id: "type-1", owner_division_id: "division-1" }] };
      if (query.text.startsWith("SELECT organisation_id")) return { rowCount: 1, rows: [{ organisation_id: "org-1", entity_kind: "accounting_object", entity_id: "object-1" }] };
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
  assert.equal(permissions[1].divisionId, "division-1");
  assert.equal(permissions[1].resourceCode, "type-1");
  assert.equal(permissions[1].workflowStatus, "*");
});
test("document listing requires view access and remains scoped to the object", async () => {
  const { api, ctx, queries, permissions } = fixture();
  const result = await api.listDocuments(ctx);
  assert.equal(result.documents[0].document_id, "document-1");
  assert.equal(permissions[1].workflowStatus, "view");
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
  assert.equal(allowed.permissions[1].workflowStatus, "*");
  assert.ok(allowed.queries.at(-1).text.includes("SET deleted=true"));
  const denied = fixture({ denied: { status: 403, body: { error: "Denied" } } });
  assert.equal((await denied.api.deleteDocument(denied.ctx)).status, 403);
  assert.ok(denied.queries.every((query) => !query.text.startsWith("UPDATE")));
});
