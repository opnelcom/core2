"use strict";
// Isolated PostgreSQL engine; no connection to the application database.
const { PGlite } = require("@electric-sql/pglite");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const erp = path.resolve(__dirname, "../../../Volumes/Core-ERP");
const kinds = ["gl_account", "subledger_account", "accounting_object", "accounting_dimension"];

(async () => {
  const db = new PGlite();
  try {
    const sql = fs.readFileSync(path.join(erp, "schema/erp-schema.sql"), "utf8").replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", "");
    await db.exec(sql); await db.exec(sql);
    const tenant = randomUUID(), org = randomUUID(), division = randomUUID();
    await db.query("INSERT INTO erp_organisation(tenant_id,organisation_id,organisation_code,organisation_name) VALUES($1,$2,'TEST','Test')", [tenant, org]);
    await db.query("INSERT INTO erp_division(tenant_id,organisation_id,division_id,division_code,division_name) VALUES($1,$2,$3,'ROOT','Root')", [tenant, org, division]);
    const workflow = (await db.query("INSERT INTO erp_workflow_path(tenant_id,organisation_id,path_name,initial_step_code) VALUES($1,$2,'Default','draft') RETURNING workflow_path_id", [tenant, org])).rows[0].workflow_path_id;
    await db.query("INSERT INTO erp_workflow_step(tenant_id,organisation_id,workflow_path_id,step_code,step_label,sort_order) VALUES($1,$2,$3,'draft','Draft',10)", [tenant, org, workflow]);
    const moduleId = (await db.query("INSERT INTO erp_module(tenant_id,organisation_id,module_code,module_name) VALUES($1,$2,'finance','Finance') RETURNING module_id", [tenant, org])).rows[0].module_id;
    let admin = true, fail = false;
    const ctx = { req: { method: "POST" }, body: {}, query: {}, cookies: { current_tenant: tenant }, tenantSession:async function(){const auth=this.auth();return auth?{auth,tenantId:this.cookies.current_tenant}:{status:401,body:{error:"Authentication required"}};},auth: () => ({ email: "test@example.com" }), send: (status, body) => ({ status, body }),
      broker: async (profile, action, args) => {
        if(profile==="core_saas")throw new Error("Applications must not query SaaS tables");
        if (args.text?.includes("role.is_admin=true")) return { rows: admin ? [{}] : [], rowCount: admin ? 1 : 0 };
        if (action === "transaction") return db.transaction(async tx => {
          assert.equal(args.operation,undefined,'Broker receives SQL only');
          const results = [];
          for (const statement of args.statements) {
            const result = await tx.query(statement.text, statement.values);
            const count=result.rows.length || result.affectedRows || 0;
            if(statement.expectedRowCount!==undefined&&count!==statement.expectedRowCount)throw new Error('Transaction precondition failed');
            results.push({ ...result, name: statement.name, rowCount: result.rows.length || result.affectedRows || 0 });
          }
          if (fail) { fail = false; throw new Error("Injected save failure"); }
          return { results };
        });
        const result = await db.query(args.text, args.values);
        return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
      } };
    const endpoints = {
      gl_account: ["gl-account-types/save", "gl-accounts/save", "gl_account", "account_code", "account_name"],
      subledger_account: ["subledger-account-types/save", "subledger-accounts/save", "subledger_account", "account_code", "account_name"],
      accounting_object: ["accounting-objects/save-type", "accounting-objects/save", "record", "object_code", "object_name"],
      accounting_dimension: ["accounting-dimensions/save-type", "accounting-dimensions/save", "record", "dimension_code", "dimension_name"],
    };
    for (const kind of kinds) {
      const [typeEndpoint, endpoint, response, code, name] = endpoints[kind];
      const typeSave = require(path.join(erp, "api", typeEndpoint));
      const save = require(path.join(erp, "api", endpoint));
      const typeId = `${kind}_type_id`, recordId = `${kind}_id`;
      ctx.body = { organisation_id: org, type_code: kind, type_name: kind, workflow_path_id: workflow, module_ids: [moduleId],
        schema_json: "{}", ui_schema_json: "{}", is_active: true, code_numbering: { mode: "automatic", start: 10, end: 12, padding: 4, prefix: `${kind}-` } };
      const typeResult = await typeSave(ctx); assert.equal(typeResult.status, undefined, JSON.stringify(typeResult));
      const type = (await db.query(`SELECT * FROM erp_${kind}_type WHERE type_code=$1`, [kind])).rows[0];
      const body = { organisation_id: org, [typeId]: type[typeId], owner_division_id: division, [code]: "CLIENT-OVERRIDE", [name]: "Record", additional_data: {} };
      ctx.body = { ...body }; const first = (await save(ctx))[response];
      assert.equal(first[code], `${kind}-0010`);
      // Existing auto codes are retained, even if a client submits a different code.
      ctx.body = { ...body, [recordId]: first[recordId], [code]: "RENAMED" };
      assert.equal((await save(ctx))[response][code], first[code]);
      ctx.body = { ...body, [code]: "" }; fail = true;
      await assert.rejects(save(ctx), /Injected save failure/);
      assert.equal((await save(ctx))[response][code], `${kind}-0011`);
      assert.equal((await save(ctx))[response][code], `${kind}-0012`);
      await assert.rejects(save(ctx), error => error.status === 400 && /range exhausted/.test(error.message));
      // Extend range without resetting the high-water counter.
      ctx.body = { organisation_id: org, [typeId]: type[typeId], type_code: kind, type_name: kind, workflow_path_id: workflow, module_ids: [moduleId],
        schema_json: "{}", ui_schema_json: "{}", is_active: true, code_numbering: { mode: "automatic", start: 10, end: 14, padding: 4, prefix: `${kind}-` } };
      await typeSave(ctx); ctx.body = { ...body, [code]: "" };
      assert.equal((await save(ctx))[response][code], `${kind}-0013`);
      // Omitted numbering from older clients preserves configuration.
      ctx.body = { organisation_id: org, [typeId]: type[typeId], type_code: kind, type_name: kind, workflow_path_id: workflow, module_ids: [moduleId], schema_json: "{}", ui_schema_json: "{}", is_active: true };
      await typeSave(ctx);
      assert.equal((await db.query(`SELECT code_numbering FROM erp_${kind}_type WHERE ${typeId}=$1`, [type[typeId]])).rows[0].code_numbering.mode, "automatic");
      ctx.body.code_numbering = { mode: "manual" }; await typeSave(ctx);
      ctx.body = { ...body, [code]: "" };
      await assert.rejects(save(ctx), /enter a code/);
      ctx.body[code] = "USER-CODE"; assert.equal((await save(ctx))[response][code], "USER-CODE");
      // Non-administrators cannot change numbering settings.
      admin = false;
      assert.equal((await typeSave(ctx)).status, 403); admin = true;
    }
    // Overlap is independent for dimensions, but GL skips organisation-wide collisions.
    for (const kind of ["gl_account", "accounting_dimension"]) {
      const [typeEndpoint, endpoint, response, code, name] = endpoints[kind];
      const save = require(path.join(erp, "api", endpoint));
      for (let i = 0; i < 2; i++) {
        ctx.body = { organisation_id: org, type_code: `${kind}_overlap_${i}`, type_name: "Overlap", workflow_path_id: workflow, module_ids: [moduleId],
          schema_json: "{}", ui_schema_json: "{}", is_active: true, code_numbering: { mode: "automatic", start: 100, end: 102 } };
        await require(path.join(erp, "api", typeEndpoint))(ctx);
        const type = (await db.query(`SELECT * FROM erp_${kind}_type WHERE type_code=$1`, [ctx.body.type_code])).rows[0];
        ctx.body = { organisation_id: org, [`${kind}_type_id`]: type[`${kind}_type_id`], owner_division_id: division, [code]: "", [name]: "Overlap", additional_data: {} };
        assert.equal((await save(ctx))[response][code], String(kind === "gl_account" ? 100 + i : 100));
      }
    }
    // Pre-existing deleted codes remain reserved when a manual type becomes automatic.
    for (const kind of kinds) {
      const [typeEndpoint, endpoint, response, code, name] = endpoints[kind];
      const typeSave = require(path.join(erp, "api", typeEndpoint));
      const save = require(path.join(erp, "api", endpoint));
      const definition = { organisation_id: org, type_code: `${kind}_legacy`, type_name: "Legacy",
        workflow_path_id: workflow, module_ids: [moduleId], schema_json: "{}", ui_schema_json: "{}", is_active: true };
      ctx.body = { ...definition }; await typeSave(ctx);
      const type = (await db.query(`SELECT * FROM erp_${kind}_type WHERE type_code=$1`, [definition.type_code])).rows[0];
      const body = { organisation_id: org, [`${kind}_type_id`]: type[`${kind}_type_id`], owner_division_id: division, [code]: "0", [name]: "Legacy", additional_data: {} };
      ctx.body = { ...body }; const legacy = (await save(ctx))[response];
      await db.query(`UPDATE erp_${kind} SET workflow_status='deleted' WHERE ${kind}_id=$1`, [legacy[`${kind}_id`]]);
      ctx.body = { ...definition, [`${kind}_type_id`]: type[`${kind}_type_id`], code_numbering: { mode: "automatic", start: 0, end: 1 } };
      await typeSave(ctx); ctx.body = { ...body, [code]: "" };
      assert.equal((await save(ctx))[response][code], "1");
      await assert.rejects(save(ctx), /range exhausted/);
    }
    const target = randomUUID();
    await db.query("INSERT INTO erp_organisation(tenant_id,organisation_id,organisation_code,organisation_name) VALUES($1,$2,'COPY','Copy')", [tenant, target]);
    // Setup copy carries independent range settings, not consumed source counters.
    const copy = require(path.join(erp, "api/organisations/copy-organisation-setup"));
    ctx.body = { source_organisation_id: org, target_organisation_id: target, options: {
      divisions: true, accounting_types: true, gl_account_types: true, subledger_account_types: true,
      countries: false, currencies: false, fiscal_years: false, chart_of_accounts: false,
      line_definitions: false, transaction_groups: false, transaction_types: false,
      financial_statement_formats: false, tax_types: false, workflow_paths: true,
      resource_roles: false, permissions: false, reports: false } };
    await copy(ctx);
    for (const kind of kinds) {
      const copied = (await db.query(`SELECT code_numbering,code_number_next FROM erp_${kind}_type WHERE organisation_id=$1 ORDER BY type_code`, [target])).rows;
      const original = (await db.query(`SELECT code_numbering FROM erp_${kind}_type WHERE organisation_id=$1 ORDER BY type_code`, [org])).rows;
      assert.deepEqual(copied.map(row => row.code_numbering), original.map(row => row.code_numbering));
      assert.ok(copied.every(row => row.code_number_next === null));
    }
    // Recopy must never reset a destination counter.
    await db.query("UPDATE erp_gl_account_type SET code_number_next=102 WHERE organisation_id=$1 AND type_code='gl_account_overlap_0'", [target]);
    await copy(ctx);
    assert.equal((await db.query("SELECT code_number_next FROM erp_gl_account_type WHERE organisation_id=$1 AND type_code='gl_account_overlap_0'", [target])).rows[0].code_number_next, 102);
    console.log("Code numbering PostgreSQL/API checks passed: all four classes, settings, permissions, manual/automatic codes, padding/prefix, rollback, exhaustion, extension independent/GL ranges and setup copying.");
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
