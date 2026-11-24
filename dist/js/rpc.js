// Jembatan ke backend Rust (SQLite). Di luar Tauri (mis. tes), RPC bisa diganti lewat globalThis.RPC.
(function () {
  if (globalThis.RPC) return;
  function inv() {
    var T = globalThis.__TAURI__;
    if (T && T.core && T.core.invoke) return T.core.invoke;
    throw new Error('Backend Tauri tidak tersedia');
  }
  globalThis.RPC = {
    q: function (sql, params) { return inv()('db_query', { sql: sql, params: params || [] }); },
    tx: function (stmts) { return inv()('db_tx', { stmts: stmts }); },
    exportFile: function (name, content) { return inv()('write_export', { name: name, content: content }); }
  };
})();
