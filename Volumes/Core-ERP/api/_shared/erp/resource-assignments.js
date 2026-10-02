"use strict";

function day(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (value === "-infinity") return -Infinity;
  if (value === "infinity") return Infinity;
  const time = Date.parse(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(time) ? Math.floor(time / 86400000) : NaN;
}

function validateResourceAssignments(
  requirements,
  assignments,
  validFrom,
  validTo,
) {
  const objectStart = day(validFrom, -Infinity);
  const objectEnd = day(validTo, Infinity);
  if (
    Number.isNaN(objectStart) ||
    Number.isNaN(objectEnd) ||
    objectStart > objectEnd
  )
    return ["Object validity dates are invalid"];

  const errors = [];
  for (const requirement of requirements) {
    const roleAssignments = assignments
      .filter(
        (assignment) =>
          assignment.resource_role_id === requirement.resource_role_id,
      )
      .map((assignment) => ({
        start: day(assignment.valid_from, -Infinity),
        end: day(assignment.valid_to, Infinity),
      }));
    if (
      roleAssignments.some(
        (range) =>
          Number.isNaN(range.start) ||
          Number.isNaN(range.end) ||
          range.start > range.end,
      )
    ) {
      errors.push(`${requirement.role_name}: assignment dates are invalid`);
      continue;
    }
    if (requirement.is_required && !roleAssignments.length) {
      errors.push(`${requirement.role_name}: at least one resource is required`);
      continue;
    }

    const ranges = roleAssignments
      .map((range) => ({
        start: Math.max(range.start, objectStart),
        end: Math.min(range.end, objectEnd),
      }))
      .filter((range) => range.start <= range.end)
      .sort((left, right) => left.start - right.start || left.end - right.end);
    if (requirement.is_required) {
      let coveredThrough = objectStart - 1;
      for (const range of ranges) {
        if (range.start > coveredThrough + 1) break;
        coveredThrough = Math.max(coveredThrough, range.end);
        if (coveredThrough >= objectEnd) break;
      }
      if (coveredThrough < objectEnd)
        errors.push(
          `${requirement.role_name}: resource coverage must span the object's full validity period`,
        );
    }

  }
  return errors;
}

async function prepareResourceAssignments(ctx, access, options) {
  const {
    organisationId,
    objectKind,
    objectTypeId,
    objectId,
    validFrom,
    validTo,
    assignments: submitted,
  } = options;
  const schema = await ctx.broker("core_erp", "query", {
    text: `SELECT to_regclass('public.erp_resource') resource_table,
                    to_regclass('public.erp_resource_role') role_table,
                    to_regclass('public.erp_object_type_resource_role') mapping_table,
                    to_regclass('public.erp_resource_assignment') assignment_table`,
  });
  if (
    !schema.rows[0]?.resource_table ||
    !schema.rows[0]?.role_table ||
    !schema.rows[0]?.mapping_table ||
    !schema.rows[0]?.assignment_table
  ) {
    return {
      errors:
        Array.isArray(submitted) && submitted.length
          ? ["Initialise the ERP schema before assigning Resources"]
          : [],
      rows: [],
      replace: false,
      statements: [],
    };
  }
  const mappings = await ctx.broker("core_erp", "query", {
    text: `SELECT mapping.resource_role_id,role.role_name,mapping.is_required
           FROM erp_object_type_resource_role mapping
           JOIN erp_resource_role role ON role.resource_role_id=mapping.resource_role_id
           WHERE mapping.tenant_id=$1 AND mapping.organisation_id=$2
             AND mapping.object_kind=$3 AND mapping.object_type_id=$4 AND role.is_active=true`,
    values: [access.tenantId, organisationId, objectKind, objectTypeId],
  });
  const existing = objectId
    ? await ctx.broker("core_erp", "query", {
        text: `SELECT resource_role_id,resource_id,valid_from,valid_to
               FROM erp_resource_assignment
               WHERE tenant_id=$1 AND organisation_id=$2 AND object_kind=$3 AND object_id=$4`,
        values: [access.tenantId, organisationId, objectKind, objectId],
      })
    : { rows: [] };
  const rows = Array.isArray(submitted)
    ? submitted.map((assignment) => ({
        resource_role_id: assignment.resource_role_id,
        resource_id: assignment.resource_id,
        valid_from: assignment.valid_from || null,
        valid_to: assignment.valid_to || null,
      }))
    : existing.rows;
  const mappingById = new Map(
    mappings.rows.map((mapping) => [mapping.resource_role_id, mapping]),
  );
  const errors = [];
  if (rows.some((row) => !mappingById.has(row.resource_role_id)))
    errors.push(
      "Every assigned resource role must be configured for this object type",
    );
  const resourceIds = [
    ...new Set(rows.map((row) => row.resource_id).filter(Boolean)),
  ];
  if (rows.some((row) => !row.resource_id))
    errors.push("Every assignment requires a resource");
  if (resourceIds.length) {
    const resources = await ctx.broker("core_erp", "query", {
      text: `SELECT resource_id FROM erp_resource
             WHERE tenant_id=$1 AND organisation_id=$2 AND resource_id=ANY($3::uuid[])
               AND (is_active=true OR resource_id=ANY($4::uuid[]))`,
      values: [
        access.tenantId,
        organisationId,
        resourceIds,
        [...new Set(existing.rows.map((row) => row.resource_id))],
      ],
    });
    if (resources.rowCount !== resourceIds.length)
      errors.push(
        "Every assigned resource must be active and belong to this organisation",
      );
  }
  const requirements = mappings.rows.map((mapping) => ({
    ...mapping,
    is_required: mapping.is_required === true,
  }));
  errors.push(...validateResourceAssignments(requirements, rows, validFrom, validTo));
  return {
    errors: [...new Set(errors)],
    rows,
    replace: Array.isArray(submitted),
    statements: Array.isArray(submitted)
      ? [
          {
            text: `DELETE FROM erp_resource_assignment
                   WHERE tenant_id=$1 AND organisation_id=$2 AND object_kind=$3 AND object_id=$4`,
            values: [access.tenantId, organisationId, objectKind, objectId],
          },
          ...rows.map((row) => ({
            text: `INSERT INTO erp_resource_assignment(tenant_id,organisation_id,object_kind,object_id,object_type_id,resource_role_id,resource_id,valid_from,valid_to,created_by_email,updated_by_email)
                   VALUES($1,$2,$3,$4,$5,$6,$7,COALESCE($8::date,'-infinity'::date),$9::date,$10,$10)`,
            values: [
              access.tenantId,
              organisationId,
              objectKind,
              objectId,
              objectTypeId,
              row.resource_role_id,
              row.resource_id,
              row.valid_from,
              row.valid_to,
              access.auth.email,
            ],
          })),
        ]
      : [],
  };
}

async function validateTypeResourceRoleMappings(ctx, access, options) {
  const { organisationId, objectKind, objectTypeId, mappings } = options;
  const schema = await ctx.broker("core_erp", "query", {
    text: `SELECT to_regclass('public.erp_resource_role') role_table,
                  to_regclass('public.erp_object_type_resource_role') mapping_table`,
  });
  if (!schema.rows[0]?.role_table || !schema.rows[0]?.mapping_table)
    return mappings.length
      ? { error: "Initialise the ERP schema before configuring Resource Roles" }
      : { roleIds: [], skip: true };
  const roleIds = mappings
    .map((mapping) => mapping.resource_role_id)
    .filter(Boolean);
  if (new Set(roleIds).size !== roleIds.length)
    return {
      error: "A resource role may only be configured once for an object type",
    };
  if (mappings.some((mapping) => !mapping.resource_role_id))
    return {
      error: "Every configured role requires a role",
    };
  if (roleIds.length) {
    const roles = await ctx.broker("core_erp", "query", {
      text: `SELECT resource_role_id FROM erp_resource_role
             WHERE tenant_id=$1 AND organisation_id=$2 AND is_active=true AND resource_role_id=ANY($3::uuid[])`,
      values: [access.tenantId, organisationId, roleIds],
    });
    if (roles.rowCount !== roleIds.length)
      return {
        error:
          "Every selected Resource Role must be active and belong to this organisation",
      };
  }
  const old = await ctx.broker("core_erp", "query", {
    text: `SELECT resource_role_id FROM erp_object_type_resource_role
           WHERE tenant_id=$1 AND organisation_id=$2 AND object_kind=$3 AND object_type_id=$4`,
    values: [access.tenantId, organisationId, objectKind, objectTypeId],
  });
  const removed = old.rows
    .map((row) => row.resource_role_id)
    .filter((id) => !roleIds.includes(id));
  if (removed.length) {
    const used = await ctx.broker("core_erp", "query", {
      text: `SELECT 1 FROM erp_resource_assignment
             WHERE tenant_id=$1 AND organisation_id=$2 AND object_kind=$3 AND object_type_id=$4
               AND resource_role_id=ANY($5::uuid[]) LIMIT 1`,
      values: [
        access.tenantId,
        organisationId,
        objectKind,
        objectTypeId,
        removed,
      ],
    });
    if (used.rowCount)
      return {
        error:
          "A configured role cannot be removed while assignments exist for this object type",
      };
  }
  return { roleIds };
}

async function saveTypeResourceRoleMappings(ctx, access, options) {
  const { organisationId, objectKind, objectTypeId, mappings } = options;
  const valid = await validateTypeResourceRoleMappings(ctx, access, options);
  if (valid.error) return valid;
  if (valid.skip) return valid;
  const statements = [
    {
      text: `DELETE FROM erp_object_type_resource_role
           WHERE tenant_id=$1 AND organisation_id=$2 AND object_kind=$3 AND object_type_id=$4
             AND NOT(resource_role_id=ANY($5::uuid[]))`,
      values: [
        access.tenantId,
        organisationId,
        objectKind,
        objectTypeId,
        valid.roleIds,
      ],
    },
  ];
  mappings.forEach((mapping) =>
    statements.push({
      text: `INSERT INTO erp_object_type_resource_role(tenant_id,organisation_id,object_kind,object_type_id,resource_role_id,is_required)
           VALUES($1,$2,$3,$4,$5,$6)
           ON CONFLICT(tenant_id,organisation_id,object_kind,object_type_id,resource_role_id)
           DO UPDATE SET is_required=excluded.is_required`,
      values: [
        access.tenantId,
        organisationId,
        objectKind,
        objectTypeId,
        mapping.resource_role_id,
        mapping.is_required === true,
      ],
    }),
  );
  await ctx.broker("core_erp", "transaction", { statements });
  return { roleIds: valid.roleIds };
}

module.exports = {
  prepareResourceAssignments,
  saveTypeResourceRoleMappings,
  validateResourceAssignments,
  validateTypeResourceRoleMappings,
};
