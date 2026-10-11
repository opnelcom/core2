'use strict';
const fs = require('node:fs');
const path = require('node:path');
class Store {
  constructor(root) { this.root = root; fs.mkdirSync(root, { recursive: true }); }
  filename(id) { if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid run ID'); return path.join(this.root, `${id}.json`); }
  save(run) { const file = this.filename(run.id), tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(run, null, 2)); fs.renameSync(tmp, file); }
  get(id) { return JSON.parse(fs.readFileSync(this.filename(id), 'utf8')); }
  list() { return fs.readdirSync(this.root).filter(n => n.endsWith('.json')).map(n => JSON.parse(fs.readFileSync(path.join(this.root, n), 'utf8'))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
}
module.exports = { Store };
