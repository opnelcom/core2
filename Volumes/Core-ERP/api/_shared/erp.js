"use strict";

const schema = require("./erp/schema");
const seeding = require("./erp/seeding");
const auth = require("./erp/auth");
const access = require("./erp/access");
const utils = require("./erp/utils");
const journals = require("./erp/journals");
const workflow = require("./erp/workflow");
const resourceAssignments = require("./erp/resource-assignments");

module.exports = {
  ...schema,
  ...seeding,
  ...auth,
  ...access,
  ...utils,
  ...journals,
  ...workflow,
  ...resourceAssignments,
};
