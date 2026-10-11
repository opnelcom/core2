"use strict";
const fs = require("node:fs"), path = require("node:path");
const file = path.resolve(__dirname, "../../Volumes/Core-ERP/seeds/template-defaults.json");
const seeds = JSON.parse(fs.readFileSync(file, "utf8"));
let count = 0;
function visit(value) {
  if (!value || typeof value !== "object") return;
  if (value.properties && typeof value.properties === "object") {
    Object.values(value.properties).forEach((field, index) => {
      if (field && typeof field === "object") {
        if (field.sortOrder === undefined) field.sortOrder = (index + 1) * 10;
        count++;
      }
    });
  }
  Object.values(value).forEach(visit);
}
visit(seeds);
fs.writeFileSync(file, JSON.stringify(seeds, null, 2) + "\n");
console.log(`Seed fields with explicit sortOrder: ${count}`);
