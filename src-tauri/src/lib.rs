use rusqlite::{params_from_iter, types::Value as SqlValue, types::ValueRef, Connection};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::sync::Mutex;
use tauri::{Manager, State};

struct Db(Mutex<Connection>);

#[derive(Deserialize)]
struct Stmt {
    sql: String,
    #[serde(default)]
    params: Vec<Value>,
}

fn to_sql(v: &Value, ids: &[i64]) -> Result<SqlValue, String> {
    Ok(match v {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(*b as i64),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                SqlValue::Integer(i)
            } else {
                SqlValue::Real(n.as_f64().unwrap_or(0.0))
            }
        }
        Value::String(s) => SqlValue::Text(s.clone()),
        Value::Object(o) => {
            // {"$ref": n} -> id baris terakhir yang disisipkan oleh statement ke-n
            if let Some(idx) = o.get("$ref").and_then(|x| x.as_u64()) {
                match ids.get(idx as usize) {
                    Some(id) => SqlValue::Integer(*id),
                    None => return Err(format!("referensi statement {} tidak valid", idx)),
                }
            } else {
                SqlValue::Text(v.to_string())
            }
        }
        other => SqlValue::Text(other.to_string()),
    })
}

fn run_query(conn: &Connection, sql: &str, params: &[Value]) -> Result<Vec<Value>, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let mut bound = Vec::with_capacity(params.len());
    for p in params {
        bound.push(to_sql(p, &[])?);
    }
    let rows = stmt
        .query_map(params_from_iter(bound.iter()), |row| {
            let mut m = Map::new();
            for (i, n) in names.iter().enumerate() {
                let v = match row.get_ref(i)? {
                    ValueRef::Null => Value::Null,
                    ValueRef::Integer(x) => json!(x),
                    ValueRef::Real(x) => json!(x),
                    ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).to_string()),
                    ValueRef::Blob(_) => Value::Null,
                };
                m.insert(n.clone(), v);
            }
            Ok(Value::Object(m))
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn db_query(state: State<Db>, sql: String, params: Option<Vec<Value>>) -> Result<Vec<Value>, String> {
    let conn = state.0.lock().map_err(|_| "database terkunci".to_string())?;
    run_query(&conn, &sql, &params.unwrap_or_default())
}

/// Menjalankan beberapa statement dalam satu transaksi atomik.
/// Mengembalikan id baris terakhir yang disisipkan untuk tiap statement.
#[tauri::command]
fn db_tx(state: State<Db>, stmts: Vec<Stmt>) -> Result<Vec<i64>, String> {
    let mut conn = state.0.lock().map_err(|_| "database terkunci".to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut ids: Vec<i64> = Vec::with_capacity(stmts.len());
    for (n, s) in stmts.iter().enumerate() {
        let mut bound = Vec::with_capacity(s.params.len());
        for p in &s.params {
            bound.push(to_sql(p, &ids).map_err(|e| format!("statement {}: {}", n, e))?);
        }
        tx.execute(&s.sql, params_from_iter(bound.iter()))
            .map_err(|e| format!("statement {}: {}", n, e))?;
        ids.push(tx.last_insert_rowid());
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(ids)
}

/// Menyimpan berkas ekspor/backup ke folder data aplikasi.
#[tauri::command]
fn write_export(app: tauri::AppHandle, name: String, content: String) -> Result<String, String> {
    let safe: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("exports");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(safe);
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = Connection::open(dir.join("bukukas.db"))?;
            conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;")?;
            app.manage(Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![db_query, db_tx, write_export])
        .run(tauri::generate_context!())
        .expect("gagal menjalankan aplikasi");
}
