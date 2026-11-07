// d1-sqlite.js — makes Node's built-in SQLite (node:sqlite) look like Cloudflare D1,
// so api.js runs unchanged on a developer's machine and in the tests.
//   db.prepare(sql).bind(a, b).first()  -> first row or null
//   db.prepare(sql).bind(a, b).run()    -> { success, meta: { changes, last_row_id } }
//   db.prepare(sql).bind(a, b).all()    -> { results: [rows] }
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function openDatabase(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  // node:sqlite returns objects without prototype; spread them into plain objects.
  const plain = (row) => (row ? { ...row } : null);
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      let params = [];
      const api = {
        bind(...values) { params = values.map((v) => (v === undefined ? null : v)); return api; },
        async first() { return plain(statement.get(...params)); },
        async run() {
          const r = statement.run(...params);
          return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
        },
        async all() { return { results: statement.all(...params).map(plain) }; },
      };
      return api;
    },
    close() { db.close(); },
  };
}
