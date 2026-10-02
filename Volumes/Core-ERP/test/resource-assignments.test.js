"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateResourceAssignments,
} = require("../api/_shared/erp/resource-assignments");

const mandatory = [
  {
    resource_role_id: "project-manager",
    role_name: "Project Manager",
    is_required: true,
  },
];

test("mandatory roles require at least one resource", () => {
  assert.deepEqual(
    validateResourceAssignments(mandatory, [], "2026-01-01", null),
    ["Project Manager: at least one resource is required"],
  );
});

test("blank dates cover an object's full effective period", () => {
  assert.deepEqual(
    validateResourceAssignments(
      mandatory,
      [
        {
          resource_role_id: "project-manager",
          valid_from: null,
          valid_to: null,
        },
      ],
      "2026-01-01",
      null,
    ),
    [],
  );
});

test("overlapping mandatory assignments are allowed", () => {
  assert.deepEqual(
    validateResourceAssignments(
      mandatory,
      [
        {
          resource_role_id: "project-manager",
          valid_from: null,
          valid_to: "2026-06-30",
        },
        {
          resource_role_id: "project-manager",
          valid_from: "2026-06-01",
          valid_to: null,
        },
      ],
      "2026-01-01",
      null,
    ),
    [],
  );
});

test("gaps in mandatory coverage are rejected", () => {
  assert.deepEqual(
    validateResourceAssignments(
      mandatory,
      [
        {
          resource_role_id: "project-manager",
          valid_from: null,
          valid_to: "2026-06-30",
        },
        {
          resource_role_id: "project-manager",
          valid_from: "2026-07-02",
          valid_to: null,
        },
      ],
      "2026-01-01",
      null,
    ),
    [
      "Project Manager: resource coverage must span the object's full validity period",
    ],
  );
});

test("optional roles may have gaps or no assignments", () => {
  const optional = mandatory.map((role) => ({ ...role, is_required: false }));
  assert.deepEqual(
    validateResourceAssignments(optional, [], "2026-01-01", null),
    [],
  );
});
