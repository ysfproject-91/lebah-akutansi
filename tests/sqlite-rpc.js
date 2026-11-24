// Pengganti backend Rust untuk tes: meniru db_query & db_tx memakai node:sqlite.
const { DatabaseSync } = require('node:sqlite');
module.exports = function makeRpc() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const conv = (v, ids) => (v && typeof v === 'object' && '$ref' in v) ? ids[v.$ref] : (typeof v === 'boolean' ? +v : v);
  return {
    db,
    async q(sql, params = []) { return db.prepare(sql).all(...params.map(p => conv(p, []))).map(r => ({ ...r })); },
    async tx(stmts) {
      const ids = [];
      db.exec('BEGIN');
      try {
        for (const s of stmts) {
          const st = db.prepare(s.sql);
          const r = st.run(...(s.params || []).map(p => conv(p, ids)));
          ids.push(Number(r.lastInsertRowid));
        }
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      return ids;
    },
    async exportFile(n, c) { return '/tmp/' + n; }
  };
};
