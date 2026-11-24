// Logika akuntansi BukuKas: skema, jurnal berpasangan (double-entry), transaksi, laporan.
(function (G) {
  'use strict';
  var RPC = function () { return G.RPC; };
  var q = function (sql, p) { return RPC().q(sql, p || []); };

  // ---------- util ----------
  function round(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = String(v == null ? '' : v).replace(/[^0-9\-]/g, '');
    if (s === '' || s === '-') return 0;
    return parseInt(s, 10) || 0;
  }
  function pad(n, l) { n = String(n); while (n.length < l) n = '0' + n; return n; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2); }
  function monthStart(d) { return d.slice(0, 7) + '-01'; }
  function monthEnd(d) {
    var y = +d.slice(0, 4), m = +d.slice(5, 7);
    var last = new Date(y, m, 0).getDate();
    return d.slice(0, 7) + '-' + pad(last, 2);
  }
  function addMonths(d, n) {
    var y = +d.slice(0, 4), m = +d.slice(5, 7) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + pad(m + 1, 2) + '-01';
  }
  function addDays(d, n) {
    var dt = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
    dt.setDate(dt.getDate() + n);
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1, 2) + '-' + pad(dt.getDate(), 2);
  }
  function daysBetween(a, b) {
    var da = new Date(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
    var db = new Date(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
    return Math.round((db - da) / 86400000);
  }
  function validDate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d || ''); }

  function Tx() { this.s = []; }
  Tx.prototype.add = function (sql, params) { this.s.push({ sql: sql, params: params || [] }); return this.s.length - 1; };
  Tx.prototype.run = function () { return RPC().tx(this.s); };
  function ref(i) { return { $ref: i }; }

  // ---------- skema ----------
  var SCHEMA = [
    'CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT)',
    'CREATE TABLE IF NOT EXISTS accounts(id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, normal TEXT NOT NULL, is_cash INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, system INTEGER NOT NULL DEFAULT 0)',
    'CREATE TABLE IF NOT EXISTS contacts(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT \'customer\', phone TEXT, email TEXT, address TEXT, note TEXT, active INTEGER NOT NULL DEFAULT 1)',
    'CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT, name TEXT NOT NULL, unit TEXT DEFAULT \'pcs\', cost REAL NOT NULL DEFAULT 0, buy_price REAL NOT NULL DEFAULT 0, sell_price REAL NOT NULL DEFAULT 0, stock REAL NOT NULL DEFAULT 0, min_stock REAL NOT NULL DEFAULT 0, track_stock INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1)',
    'CREATE TABLE IF NOT EXISTS journals(id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, memo TEXT, ref_type TEXT NOT NULL DEFAULT \'manual\', ref_id INTEGER, created TEXT DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE IF NOT EXISTS journal_lines(id INTEGER PRIMARY KEY AUTOINCREMENT, journal_id INTEGER NOT NULL REFERENCES journals(id) ON DELETE CASCADE, account_id INTEGER NOT NULL REFERENCES accounts(id), debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0, memo TEXT)',
    'CREATE INDEX IF NOT EXISTS idx_jl_journal ON journal_lines(journal_id)',
    'CREATE INDEX IF NOT EXISTS idx_jl_account ON journal_lines(account_id)',
    'CREATE INDEX IF NOT EXISTS idx_j_date ON journals(date)',
    'CREATE INDEX IF NOT EXISTS idx_j_ref ON journals(ref_type, ref_id)',
    'CREATE TABLE IF NOT EXISTS invoices(id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, number TEXT NOT NULL, date TEXT NOT NULL, due_date TEXT, contact_id INTEGER, subtotal REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0, tax REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0, paid REAL NOT NULL DEFAULT 0, note TEXT, source TEXT DEFAULT \'faktur\')',
    'CREATE INDEX IF NOT EXISTS idx_inv_kind ON invoices(kind, date)',
    'CREATE TABLE IF NOT EXISTS invoice_items(id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE, product_id INTEGER, name TEXT NOT NULL, qty REAL NOT NULL, price REAL NOT NULL, cost REAL NOT NULL DEFAULT 0)',
    'CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE, date TEXT NOT NULL, amount REAL NOT NULL, account_id INTEGER NOT NULL, note TEXT)',
    'CREATE TABLE IF NOT EXISTS cash_tx(id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, type TEXT NOT NULL, account_id INTEGER NOT NULL, to_account_id INTEGER, category_id INTEGER, amount REAL NOT NULL, note TEXT)',
    'CREATE INDEX IF NOT EXISTS idx_cash_date ON cash_tx(date)',
    'CREATE TABLE IF NOT EXISTS stock_moves(id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, date TEXT NOT NULL, qty REAL NOT NULL, ref_type TEXT, ref_id INTEGER, note TEXT)',
    'CREATE INDEX IF NOT EXISTS idx_sm_prod ON stock_moves(product_id)',
    'CREATE TABLE IF NOT EXISTS fixed_assets(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, date TEXT NOT NULL, cost REAL NOT NULL, residual REAL NOT NULL DEFAULT 0, life_months INTEGER NOT NULL, note TEXT)',
    'CREATE TABLE IF NOT EXISTS depreciations(id INTEGER PRIMARY KEY AUTOINCREMENT, asset_id INTEGER NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE, period TEXT NOT NULL, amount REAL NOT NULL, UNIQUE(asset_id, period))'
  ];

  // [kode, nama, tipe, normal, kas?]
  var COA = [
    ['1-1100', 'Kas', 'aset', 'D', 1],
    ['1-1200', 'Bank', 'aset', 'D', 1],
    ['1-1300', 'Piutang Usaha', 'aset', 'D', 0],
    ['1-1400', 'Persediaan Barang', 'aset', 'D', 0],
    ['1-1500', 'PPN Masukan', 'aset', 'D', 0],
    ['1-2100', 'Peralatan & Aset Tetap', 'aset', 'D', 0],
    ['1-2900', 'Akumulasi Penyusutan', 'aset', 'C', 0],
    ['2-1100', 'Hutang Usaha', 'kewajiban', 'C', 0],
    ['2-1200', 'PPN Keluaran', 'kewajiban', 'C', 0],
    ['2-1300', 'Hutang Lainnya', 'kewajiban', 'C', 0],
    ['3-1000', 'Modal Pemilik', 'ekuitas', 'C', 0],
    ['3-2000', 'Prive', 'ekuitas', 'D', 0],
    ['3-9000', 'Saldo Awal Ekuitas', 'ekuitas', 'C', 0],
    ['4-1000', 'Penjualan', 'pendapatan', 'C', 0],
    ['4-2000', 'Pendapatan Lain-lain', 'pendapatan', 'C', 0],
    ['4-3000', 'Diskon Penjualan', 'pendapatan', 'D', 0],
    ['5-1000', 'Harga Pokok Penjualan', 'hpp', 'D', 0],
    ['5-2000', 'Potongan Pembelian', 'hpp', 'C', 0],
    ['6-1000', 'Beban Gaji', 'beban', 'D', 0],
    ['6-1100', 'Beban Sewa', 'beban', 'D', 0],
    ['6-1200', 'Beban Listrik, Air & Internet', 'beban', 'D', 0],
    ['6-1300', 'Beban Transportasi', 'beban', 'D', 0],
    ['6-1400', 'Beban Pemasaran', 'beban', 'D', 0],
    ['6-1500', 'Beban Perlengkapan', 'beban', 'D', 0],
    ['6-2000', 'Beban Penyusutan', 'beban', 'D', 0],
    ['6-9000', 'Beban Lain-lain', 'beban', 'D', 0],
    ['6-9100', 'Beban Pembelian Non-Stok', 'beban', 'D', 0],
    ['6-9200', 'Selisih Persediaan', 'beban', 'D', 0]
  ];
  var TYPES = ['aset', 'kewajiban', 'ekuitas', 'pendapatan', 'hpp', 'beban'];
  var TYPE_LABEL = { aset: 'Aset', kewajiban: 'Kewajiban', ekuitas: 'Ekuitas', pendapatan: 'Pendapatan', hpp: 'HPP', beban: 'Beban' };

  var accIdByCode = {};
  function A(code) {
    var id = accIdByCode[code];
    if (!id) throw new Error('Akun sistem ' + code + ' tidak ditemukan');
    return id;
  }
  async function loadAccMap() {
    var rows = await q('SELECT id, code FROM accounts');
    accIdByCode = {};
    rows.forEach(function (r) { accIdByCode[r.code] = r.id; });
  }

  async function init() {
    var t = new Tx();
    SCHEMA.forEach(function (s) { t.add(s); });
    await t.run();
    var c = await q('SELECT COUNT(*) n FROM accounts');
    if (!c[0].n) {
      var t2 = new Tx();
      COA.forEach(function (a) {
        t2.add('INSERT INTO accounts(code,name,type,normal,is_cash,system) VALUES(?,?,?,?,?,1)', [a[0], a[1], a[2], a[3], a[4]]);
      });
      var defs = { biz_name: 'Usaha Saya', biz_address: '', biz_phone: '', tax_pct: '11', currency: 'Rp', allow_negative_stock: '0', pin: '', footer: 'Terima kasih' };
      Object.keys(defs).forEach(function (k) { t2.add('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)', [k, defs[k]]); });
      await t2.run();
    }
    await loadAccMap();
  }

  // ---------- pengaturan ----------
  async function getSettings() {
    var rows = await q('SELECT key, value FROM settings');
    var o = {};
    rows.forEach(function (r) { o[r.key] = r.value; });
    return o;
  }
  async function setSettings(obj) {
    var t = new Tx();
    Object.keys(obj).forEach(function (k) {
      t.add('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, String(obj[k] == null ? '' : obj[k])]);
    });
    await t.run();
  }

  // ---------- akun ----------
  async function listAccounts(all) {
    return q('SELECT * FROM accounts ' + (all ? '' : 'WHERE active=1 ') + 'ORDER BY code');
  }
  async function saveAccount(a) {
    var name = (a.name || '').trim(), code = (a.code || '').trim();
    if (!name) throw new Error('Nama akun wajib diisi');
    if (!code) throw new Error('Kode akun wajib diisi');
    if (TYPES.indexOf(a.type) < 0) throw new Error('Tipe akun tidak valid');
    var normal = (a.type === 'aset' || a.type === 'beban' || a.type === 'hpp') ? 'D' : 'C';
    if (a.normal === 'D' || a.normal === 'C') normal = a.normal;
    var dup = await q('SELECT id FROM accounts WHERE code=? AND id<>?', [code, a.id || 0]);
    if (dup.length) throw new Error('Kode akun sudah dipakai');
    var t = new Tx();
    if (a.id) {
      t.add('UPDATE accounts SET code=?, name=?, type=?, normal=?, is_cash=?, active=? WHERE id=?', [code, name, a.type, normal, a.is_cash ? 1 : 0, a.active === 0 ? 0 : 1, a.id]);
    } else {
      t.add('INSERT INTO accounts(code,name,type,normal,is_cash) VALUES(?,?,?,?,?)', [code, name, a.type, normal, a.is_cash ? 1 : 0]);
    }
    await t.run();
    await loadAccMap();
  }
  async function deleteAccount(id) {
    var acc = (await q('SELECT * FROM accounts WHERE id=?', [id]))[0];
    if (!acc) return;
    if (acc.system) throw new Error('Akun bawaan sistem tidak bisa dihapus (bisa dinonaktifkan)');
    var used = await q('SELECT COUNT(*) n FROM journal_lines WHERE account_id=?', [id]);
    if (used[0].n) throw new Error('Akun sudah dipakai transaksi, tidak bisa dihapus');
    var t = new Tx();
    t.add('DELETE FROM accounts WHERE id=?', [id]);
    await t.run();
    await loadAccMap();
  }
  async function setOpeningBalance(accountId, amount, date) {
    var acc = (await q('SELECT * FROM accounts WHERE id=?', [accountId]))[0];
    if (!acc) throw new Error('Akun tidak ditemukan');
    amount = round(amount);
    if (!validDate(date)) throw new Error('Tanggal tidak valid');
    var t = new Tx();
    t.add("DELETE FROM journals WHERE ref_type='opening' AND ref_id=?", [accountId]);
    if (amount !== 0) {
      var eq = A('3-9000');
      var abs = Math.abs(amount);
      // saldo positif = di sisi normal akun
      var accDebit = (acc.normal === 'D') === (amount > 0);
      var j = t.add("INSERT INTO journals(date,memo,ref_type,ref_id) VALUES(?,?,?,?)", [date, 'Saldo awal ' + acc.name, 'opening', accountId]);
      t.add('INSERT INTO journal_lines(journal_id,account_id,debit,credit) VALUES(?,?,?,?)', [ref(j), accountId, accDebit ? abs : 0, accDebit ? 0 : abs]);
      t.add('INSERT INTO journal_lines(journal_id,account_id,debit,credit) VALUES(?,?,?,?)', [ref(j), eq, accDebit ? 0 : abs, accDebit ? abs : 0]);
    }
    await t.run();
  }
  async function getOpeningBalances() {
    var rows = await q("SELECT j.ref_id aid, l.debit d, l.credit c, a.normal FROM journals j JOIN journal_lines l ON l.journal_id=j.id JOIN accounts a ON a.id=l.account_id AND a.id=j.ref_id WHERE j.ref_type='opening'");
    var o = {};
    rows.forEach(function (r) { o[r.aid] = r.normal === 'D' ? r.d - r.c : r.c - r.d; });
    return o;
  }

  // ---------- jurnal ----------
  function addJournal(t, head, lines) {
    var tot = 0, tc = 0;
    lines.forEach(function (l) { tot += round(l.debit || 0); tc += round(l.credit || 0); });
    if (Math.abs(tot - tc) > 0.01) throw new Error('Jurnal tidak seimbang (debit ' + tot + ' ≠ kredit ' + tc + ')');
    var j = t.add('INSERT INTO journals(date,memo,ref_type,ref_id) VALUES(?,?,?,?)', [head.date, head.memo || '', head.ref_type, head.ref_id == null ? null : head.ref_id]);
    lines.forEach(function (l) {
      var d = round(l.debit || 0), c = round(l.credit || 0);
      if (d === 0 && c === 0) return;
      t.add('INSERT INTO journal_lines(journal_id,account_id,debit,credit,memo) VALUES(?,?,?,?,?)', [ref(j), l.account_id, d, c, l.memo || null]);
    });
    return j;
  }

  async function saveManualJournal(data, editId) {
    if (!validDate(data.date)) throw new Error('Tanggal tidak valid');
    var lines = (data.lines || []).filter(function (l) { return num(l.debit) > 0 || num(l.credit) > 0; });
    if (lines.length < 2) throw new Error('Minimal 2 baris jurnal');
    var td = 0, tc = 0;
    lines.forEach(function (l) {
      if (!l.account_id) throw new Error('Pilih akun untuk semua baris');
      if (num(l.debit) > 0 && num(l.credit) > 0) throw new Error('Satu baris tidak boleh berisi debit dan kredit sekaligus');
      td += num(l.debit); tc += num(l.credit);
    });
    if (td !== tc) throw new Error('Debit dan kredit harus seimbang');
    var t = new Tx();
    if (editId) t.add("DELETE FROM journals WHERE id=? AND ref_type='manual'", [editId]);
    addJournal(t, { date: data.date, memo: data.memo, ref_type: 'manual', ref_id: null }, lines.map(function (l) {
      return { account_id: +l.account_id, debit: num(l.debit), credit: num(l.credit) };
    }));
    await t.run();
  }
  async function deleteJournal(id) {
    var t = new Tx();
    t.add("DELETE FROM journals WHERE id=? AND ref_type='manual'", [id]);
    await t.run();
  }
  async function listJournals(from, to) {
    var js = await q('SELECT * FROM journals WHERE date>=? AND date<=? ORDER BY date DESC, id DESC', [from, to]);
    if (!js.length) return [];
    var ls = await q('SELECT l.*, a.code, a.name aname FROM journal_lines l JOIN accounts a ON a.id=l.account_id JOIN journals j ON j.id=l.journal_id WHERE j.date>=? AND j.date<=? ORDER BY l.id', [from, to]);
    var by = {};
    ls.forEach(function (l) { (by[l.journal_id] = by[l.journal_id] || []).push(l); });
    js.forEach(function (j) { j.lines = by[j.id] || []; });
    return js;
  }

  // ---------- kas ----------
  async function saveCash(d, editId) {
    var amount = num(d.amount);
    if (!validDate(d.date)) throw new Error('Tanggal tidak valid');
    if (amount <= 0) throw new Error('Nominal harus lebih dari 0');
    if (!d.account_id) throw new Error('Pilih akun kas/bank');
    if (d.type === 'transfer') {
      if (!d.to_account_id) throw new Error('Pilih akun tujuan');
      if (+d.to_account_id === +d.account_id) throw new Error('Akun asal dan tujuan tidak boleh sama');
    } else if (d.type === 'in' || d.type === 'out') {
      if (!d.category_id) throw new Error('Pilih kategori');
      if (+d.category_id === +d.account_id) throw new Error('Kategori tidak boleh sama dengan akun kas');
    } else throw new Error('Jenis transaksi tidak valid');
    var t = new Tx();
    if (editId) {
      t.add("DELETE FROM journals WHERE ref_type='cash' AND ref_id=?", [editId]);
      t.add('UPDATE cash_tx SET date=?, type=?, account_id=?, to_account_id=?, category_id=?, amount=?, note=? WHERE id=?',
        [d.date, d.type, +d.account_id, d.type === 'transfer' ? +d.to_account_id : null, d.type === 'transfer' ? null : +d.category_id, amount, d.note || '', editId]);
    } else {
      t.add('INSERT INTO cash_tx(date,type,account_id,to_account_id,category_id,amount,note) VALUES(?,?,?,?,?,?,?)',
        [d.date, d.type, +d.account_id, d.type === 'transfer' ? +d.to_account_id : null, d.type === 'transfer' ? null : +d.category_id, amount, d.note || '']);
    }
    var refId = editId ? editId : ref(t.s.length - 1);
    var lines;
    if (d.type === 'in') lines = [{ account_id: +d.account_id, debit: amount }, { account_id: +d.category_id, credit: amount }];
    else if (d.type === 'out') lines = [{ account_id: +d.category_id, debit: amount }, { account_id: +d.account_id, credit: amount }];
    else lines = [{ account_id: +d.to_account_id, debit: amount }, { account_id: +d.account_id, credit: amount }];
    addJournal(t, { date: d.date, memo: d.note || (d.type === 'in' ? 'Pemasukan' : d.type === 'out' ? 'Pengeluaran' : 'Transfer'), ref_type: 'cash', ref_id: refId }, lines);
    await t.run();
  }
  async function deleteCash(id) {
    var t = new Tx();
    t.add("DELETE FROM journals WHERE ref_type='cash' AND ref_id=?", [id]);
    t.add('DELETE FROM cash_tx WHERE id=?', [id]);
    await t.run();
  }
  async function listCash(from, to, search) {
    var rows = await q('SELECT c.*, a.name acc_name, b.name to_name, k.name cat_name FROM cash_tx c JOIN accounts a ON a.id=c.account_id LEFT JOIN accounts b ON b.id=c.to_account_id LEFT JOIN accounts k ON k.id=c.category_id WHERE c.date>=? AND c.date<=? ORDER BY c.date DESC, c.id DESC', [from, to]);
    if (search) {
      var s = search.toLowerCase();
      rows = rows.filter(function (r) { return ((r.note || '') + ' ' + (r.cat_name || '') + ' ' + r.acc_name).toLowerCase().indexOf(s) >= 0; });
    }
    return rows;
  }

  // ---------- kontak ----------
  async function listContacts(type) {
    var sql = 'SELECT * FROM contacts WHERE active=1';
    var p = [];
    if (type === 'customer') { sql += " AND type IN ('customer','both')"; }
    else if (type === 'supplier') { sql += " AND type IN ('supplier','both')"; }
    return q(sql + ' ORDER BY name COLLATE NOCASE', p);
  }
  async function saveContact(c) {
    if (!(c.name || '').trim()) throw new Error('Nama wajib diisi');
    var t = new Tx();
    if (c.id) t.add('UPDATE contacts SET name=?, type=?, phone=?, email=?, address=?, note=? WHERE id=?', [c.name.trim(), c.type || 'customer', c.phone || '', c.email || '', c.address || '', c.note || '', c.id]);
    else t.add('INSERT INTO contacts(name,type,phone,email,address,note) VALUES(?,?,?,?,?,?)', [c.name.trim(), c.type || 'customer', c.phone || '', c.email || '', c.address || '', c.note || '']);
    var ids = await t.run();
    return c.id || ids[0];
  }
  async function deleteContact(id) {
    var used = await q('SELECT COUNT(*) n FROM invoices WHERE contact_id=?', [id]);
    var t = new Tx();
    if (used[0].n) t.add('UPDATE contacts SET active=0 WHERE id=?', [id]);
    else t.add('DELETE FROM contacts WHERE id=?', [id]);
    await t.run();
    return used[0].n ? 'nonaktif' : 'hapus';
  }

  // ---------- produk ----------
  async function listProducts(opts) {
    opts = opts || {};
    var sql = 'SELECT * FROM products WHERE active=1';
    if (opts.search) sql += ' AND (name LIKE ? OR sku LIKE ?)';
    sql += ' ORDER BY name COLLATE NOCASE';
    var p = opts.search ? ['%' + opts.search + '%', '%' + opts.search + '%'] : [];
    return q(sql, p);
  }
  async function saveProduct(p) {
    if (!(p.name || '').trim()) throw new Error('Nama produk wajib diisi');
    var sell = num(p.sell_price), buy = num(p.buy_price);
    if (sell < 0 || buy < 0) throw new Error('Harga tidak boleh negatif');
    var track = p.track_stock ? 1 : 0;
    var t = new Tx();
    if (p.id) {
      t.add('UPDATE products SET sku=?, name=?, unit=?, buy_price=?, sell_price=?, min_stock=?, track_stock=? WHERE id=?',
        [p.sku || '', p.name.trim(), p.unit || 'pcs', buy, sell, num(p.min_stock), track, p.id]);
      await t.run();
      return p.id;
    }
    t.add('INSERT INTO products(sku,name,unit,cost,buy_price,sell_price,stock,min_stock,track_stock) VALUES(?,?,?,?,?,?,0,?,?)',
      [p.sku || '', p.name.trim(), p.unit || 'pcs', buy, buy, sell, num(p.min_stock), track]);
    var ids = await t.run();
    var pid = ids[0];
    var openQty = num(p.opening_qty);
    if (openQty > 0 && track) {
      await adjustStock(pid, openQty, p.date || today(), 'Stok awal', buy);
    }
    return pid;
  }
  async function deleteProduct(id) {
    var used = await q('SELECT (SELECT COUNT(*) FROM invoice_items WHERE product_id=?) + (SELECT COUNT(*) FROM stock_moves WHERE product_id=?) n', [id, id]);
    var t = new Tx();
    if (used[0].n) t.add('UPDATE products SET active=0 WHERE id=?', [id]);
    else t.add('DELETE FROM products WHERE id=?', [id]);
    await t.run();
    return used[0].n ? 'nonaktif' : 'hapus';
  }
  // Penyesuaian stok: menambah (qty>0) atau mengurangi (qty<0) stok pada biaya tertentu.
  async function adjustStock(productId, qty, date, note, unitCost) {
    var p = (await q('SELECT * FROM products WHERE id=?', [productId]))[0];
    if (!p) throw new Error('Produk tidak ditemukan');
    if (!p.track_stock) throw new Error('Produk ini tidak melacak stok');
    qty = Number(qty);
    if (!qty) throw new Error('Jumlah penyesuaian tidak boleh 0');
    if (!validDate(date)) throw new Error('Tanggal tidak valid');
    var s = await getSettings();
    if (p.stock + qty < 0 && s.allow_negative_stock !== '1') throw new Error('Stok tidak cukup untuk dikurangi');
    var cost = qty > 0 && unitCost != null ? num(unitCost) : p.cost;
    var value = round(Math.abs(qty) * cost);
    var t = new Tx();
    var newCost = p.cost;
    if (qty > 0 && p.stock >= 0 && (p.stock + qty) > 0) newCost = round(((p.stock * p.cost) + qty * cost) / (p.stock + qty));
    else if (qty > 0 && p.stock < 0) newCost = cost;
    t.add('UPDATE products SET stock=stock+?, cost=? WHERE id=?', [qty, newCost, productId]);
    t.add("INSERT INTO stock_moves(product_id,date,qty,ref_type,note) VALUES(?,?,?,'adjust',?)", [productId, date, qty, note || 'Penyesuaian stok']);
    if (value > 0) {
      var inv = A('1-1400'), diff = A('6-9200'), eq = A('3-9000');
      var memo = (note || 'Penyesuaian stok') + ' - ' + p.name;
      var isOpening = (note === 'Stok awal');
      var counter = isOpening ? eq : diff;
      addJournal(t, { date: date, memo: memo, ref_type: 'adjust', ref_id: productId }, qty > 0
        ? [{ account_id: inv, debit: value }, { account_id: counter, credit: value }]
        : [{ account_id: diff, debit: value }, { account_id: inv, credit: value }]);
    }
    await t.run();
  }
  async function stockCard(productId, from, to) {
    var open = await q('SELECT COALESCE(SUM(qty),0) s FROM stock_moves WHERE product_id=? AND date<?', [productId, from]);
    var rows = await q('SELECT * FROM stock_moves WHERE product_id=? AND date>=? AND date<=? ORDER BY date, id', [productId, from, to]);
    var bal = open[0].s;
    var out = { opening: bal, rows: [] };
    rows.forEach(function (r) { bal += r.qty; r.balance = bal; out.rows.push(r); });
    out.closing = bal;
    return out;
  }

  // ---------- faktur ----------
  async function nextNumber(kind, date) {
    var prefix = (kind === 'sale' ? 'PJ' : 'PB') + '-' + date.slice(0, 4) + date.slice(5, 7) + '-';
    var r = await q('SELECT number FROM invoices WHERE number LIKE ?', [prefix + '%']);
    var max = 0;
    r.forEach(function (x) { var n = parseInt(x.number.slice(prefix.length), 10); if (n > max) max = n; });
    return prefix + pad(max + 1, 4);
  }
  function invStatus(inv) {
    if (round(inv.paid) >= round(inv.total) && inv.total >= 0) return 'lunas';
    if (inv.paid > 0) return 'sebagian';
    return 'belum';
  }

  async function createInvoice(d) {
    var kind = d.kind;
    if (kind !== 'sale' && kind !== 'purchase') throw new Error('Jenis faktur tidak valid');
    if (!validDate(d.date)) throw new Error('Tanggal tidak valid');
    var due = d.due_date || d.date;
    if (!validDate(due)) throw new Error('Tanggal jatuh tempo tidak valid');
    var raw = (d.items || []).filter(function (i) { return i && (i.product_id || (i.name || '').trim()); });
    if (!raw.length) throw new Error('Tambahkan minimal satu barang/jasa');

    // gabungkan baris produk yang sama
    var products = {};
    (await q('SELECT * FROM products')).forEach(function (p) { products[p.id] = p; });
    var items = [];
    raw.forEach(function (i) {
      var qty = Number(i.qty), price = num(i.price);
      if (!(qty > 0)) throw new Error('Jumlah harus lebih dari 0');
      if (price < 0) throw new Error('Harga tidak boleh negatif');
      var p = i.product_id ? products[i.product_id] : null;
      if (i.product_id && !p) throw new Error('Produk tidak ditemukan');
      items.push({ product: p, product_id: p ? p.id : null, name: p ? p.name : i.name.trim(), qty: qty, price: price });
    });
    var merged = {};
    var finalItems = [];
    items.forEach(function (i) {
      if (i.product_id) {
        var k = i.product_id + ':' + i.price;
        if (merged[k]) { merged[k].qty += i.qty; return; }
        merged[k] = i;
      }
      finalItems.push(i);
    });
    items = finalItems;

    var settings = await getSettings();
    if (kind === 'sale' && settings.allow_negative_stock !== '1') {
      var need = {};
      items.forEach(function (i) { if (i.product && i.product.track_stock) need[i.product_id] = (need[i.product_id] || 0) + i.qty; });
      Object.keys(need).forEach(function (pid) {
        if (products[pid].stock < need[pid]) throw new Error('Stok "' + products[pid].name + '" tidak cukup (sisa ' + products[pid].stock + ')');
      });
    }

    var subtotal = 0;
    items.forEach(function (i) { i.line = round(i.qty * i.price); subtotal += i.line; });
    subtotal = round(subtotal);
    var discount = Math.min(num(d.discount), subtotal);
    if (discount < 0) throw new Error('Diskon tidak valid');
    var taxPct = Number(d.tax_pct) || 0;
    var tax = round((subtotal - discount) * taxPct / 100);
    var total = round(subtotal - discount + tax);
    var payNow = num(d.pay_now);
    if (payNow < 0) throw new Error('Pembayaran tidak valid');
    if (payNow > total) payNow = total;
    if (payNow > 0 && !d.pay_account_id) throw new Error('Pilih akun pembayaran');

    var number = (d.number || '').trim() || await nextNumber(kind, d.date);
    var dupNum = await q('SELECT id FROM invoices WHERE number=?', [number]);
    if (dupNum.length) throw new Error('Nomor faktur ' + number + ' sudah ada');

    var t = new Tx();
    var inv = t.add('INSERT INTO invoices(kind,number,date,due_date,contact_id,subtotal,discount,tax,total,paid,note,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
      [kind, number, d.date, due, d.contact_id || null, subtotal, discount, tax, total, payNow, d.note || '', d.source || 'faktur']);
    var cogs = 0, invValue = 0, nonStock = 0;
    items.forEach(function (i) {
      var p = i.product;
      var tracked = p && p.track_stock;
      var cost = (kind === 'sale') ? (tracked ? p.cost : 0) : i.price;
      t.add('INSERT INTO invoice_items(invoice_id,product_id,name,qty,price,cost) VALUES(?,?,?,?,?,?)', [ref(inv), i.product_id, i.name, i.qty, i.price, cost]);
      if (kind === 'sale') {
        if (tracked) {
          cogs += round(i.qty * p.cost);
          t.add('UPDATE products SET stock=stock-? WHERE id=?', [i.qty, p.id]);
          t.add("INSERT INTO stock_moves(product_id,date,qty,ref_type,ref_id,note) VALUES(?,?,?,?,?,?)", [p.id, d.date, -i.qty, 'sale', ref(inv), 'Penjualan ' + number]);
        }
      } else {
        if (tracked) {
          invValue += i.line;
          var newCost = (p.stock > 0) ? round((p.stock * p.cost + i.qty * i.price) / (p.stock + i.qty)) : i.price;
          t.add('UPDATE products SET stock=stock+?, cost=?, buy_price=? WHERE id=?', [i.qty, newCost, i.price, p.id]);
          t.add("INSERT INTO stock_moves(product_id,date,qty,ref_type,ref_id,note) VALUES(?,?,?,?,?,?)", [p.id, d.date, i.qty, 'purchase', ref(inv), 'Pembelian ' + number]);
          p.stock += i.qty; p.cost = newCost; // jaga konsistensi bila produk sama muncul lagi
        } else nonStock += i.line;
      }
    });
    cogs = round(cogs); invValue = round(invValue); nonStock = round(nonStock);

    if (kind === 'sale') {
      var lines = [{ account_id: A('1-1300'), debit: total }];
      if (discount > 0) lines.push({ account_id: A('4-3000'), debit: discount });
      lines.push({ account_id: A('4-1000'), credit: subtotal });
      if (tax > 0) lines.push({ account_id: A('2-1200'), credit: tax });
      addJournal(t, { date: d.date, memo: 'Penjualan ' + number, ref_type: 'sale', ref_id: ref(inv) }, lines);
      if (cogs > 0) addJournal(t, { date: d.date, memo: 'HPP ' + number, ref_type: 'sale', ref_id: ref(inv) }, [{ account_id: A('5-1000'), debit: cogs }, { account_id: A('1-1400'), credit: cogs }]);
    } else {
      var pl = [];
      if (invValue > 0) pl.push({ account_id: A('1-1400'), debit: invValue });
      if (nonStock > 0) pl.push({ account_id: A('6-9100'), debit: nonStock });
      if (tax > 0) pl.push({ account_id: A('1-1500'), debit: tax });
      if (discount > 0) pl.push({ account_id: A('5-2000'), credit: discount });
      pl.push({ account_id: A('2-1100'), credit: total });
      addJournal(t, { date: d.date, memo: 'Pembelian ' + number, ref_type: 'purchase', ref_id: ref(inv) }, pl);
    }
    if (payNow > 0) {
      var pay = t.add('INSERT INTO payments(invoice_id,date,amount,account_id,note) VALUES(?,?,?,?,?)', [ref(inv), d.date, payNow, +d.pay_account_id, 'Pembayaran awal']);
      addJournal(t, { date: d.date, memo: (kind === 'sale' ? 'Penerimaan ' : 'Pembayaran ') + number, ref_type: 'payment', ref_id: ref(pay) },
        kind === 'sale'
          ? [{ account_id: +d.pay_account_id, debit: payNow }, { account_id: A('1-1300'), credit: payNow }]
          : [{ account_id: A('2-1100'), debit: payNow }, { account_id: +d.pay_account_id, credit: payNow }]);
    }
    var ids = await t.run();
    return { id: ids[inv], number: number, total: total };
  }

  async function addPayment(invoiceId, d) {
    var inv = (await q('SELECT * FROM invoices WHERE id=?', [invoiceId]))[0];
    if (!inv) throw new Error('Faktur tidak ditemukan');
    var amount = num(d.amount);
    if (amount <= 0) throw new Error('Nominal harus lebih dari 0');
    if (!validDate(d.date)) throw new Error('Tanggal tidak valid');
    if (!d.account_id) throw new Error('Pilih akun kas/bank');
    var rest = round(inv.total - inv.paid);
    if (amount > rest + 0.001) throw new Error('Nominal melebihi sisa tagihan (' + rest + ')');
    var t = new Tx();
    var pay = t.add('INSERT INTO payments(invoice_id,date,amount,account_id,note) VALUES(?,?,?,?,?)', [invoiceId, d.date, amount, +d.account_id, d.note || '']);
    t.add('UPDATE invoices SET paid=paid+? WHERE id=?', [amount, invoiceId]);
    addJournal(t, { date: d.date, memo: (inv.kind === 'sale' ? 'Penerimaan ' : 'Pembayaran ') + inv.number, ref_type: 'payment', ref_id: ref(pay) },
      inv.kind === 'sale'
        ? [{ account_id: +d.account_id, debit: amount }, { account_id: A('1-1300'), credit: amount }]
        : [{ account_id: A('2-1100'), debit: amount }, { account_id: +d.account_id, credit: amount }]);
    await t.run();
  }
  async function deletePayment(paymentId) {
    var p = (await q('SELECT * FROM payments WHERE id=?', [paymentId]))[0];
    if (!p) return;
    var t = new Tx();
    t.add("DELETE FROM journals WHERE ref_type='payment' AND ref_id=?", [paymentId]);
    t.add('UPDATE invoices SET paid=paid-? WHERE id=?', [p.amount, p.invoice_id]);
    t.add('DELETE FROM payments WHERE id=?', [paymentId]);
    await t.run();
  }
  async function deleteInvoice(id) {
    var inv = (await q('SELECT * FROM invoices WHERE id=?', [id]))[0];
    if (!inv) return;
    var items = await q('SELECT * FROM invoice_items WHERE invoice_id=?', [id]);
    var pays = await q('SELECT id FROM payments WHERE invoice_id=?', [id]);
    var prods = {};
    (await q('SELECT * FROM products')).forEach(function (p) { prods[p.id] = p; });
    var t = new Tx();
    pays.forEach(function (p) { t.add("DELETE FROM journals WHERE ref_type='payment' AND ref_id=?", [p.id]); });
    t.add("DELETE FROM journals WHERE ref_type=? AND ref_id=?", [inv.kind, id]);
    t.add("DELETE FROM stock_moves WHERE ref_type=? AND ref_id=?", [inv.kind, id]);
    items.forEach(function (i) {
      var p = prods[i.product_id];
      if (!p || !p.track_stock) return;
      t.add('UPDATE products SET stock=stock+? WHERE id=?', [inv.kind === 'sale' ? i.qty : -i.qty, i.product_id]);
    });
    t.add('DELETE FROM payments WHERE invoice_id=?', [id]);
    t.add('DELETE FROM invoice_items WHERE invoice_id=?', [id]);
    t.add('DELETE FROM invoices WHERE id=?', [id]);
    await t.run();
  }
  async function getInvoice(id) {
    var inv = (await q('SELECT i.*, c.name contact_name, c.phone contact_phone, c.address contact_address FROM invoices i LEFT JOIN contacts c ON c.id=i.contact_id WHERE i.id=?', [id]))[0];
    if (!inv) return null;
    inv.items = await q('SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY id', [id]);
    inv.payments = await q('SELECT p.*, a.name acc_name FROM payments p JOIN accounts a ON a.id=p.account_id WHERE invoice_id=? ORDER BY date, id', [id]);
    inv.status = invStatus(inv);
    return inv;
  }
  async function listInvoices(kind, from, to, search, status) {
    var rows = await q('SELECT i.*, c.name contact_name FROM invoices i LEFT JOIN contacts c ON c.id=i.contact_id WHERE i.kind=? AND i.date>=? AND i.date<=? ORDER BY i.date DESC, i.id DESC', [kind, from, to]);
    rows.forEach(function (r) { r.status = invStatus(r); });
    if (search) {
      var s = search.toLowerCase();
      rows = rows.filter(function (r) { return (r.number + ' ' + (r.contact_name || '')).toLowerCase().indexOf(s) >= 0; });
    }
    if (status) rows = rows.filter(function (r) { return r.status === status; });
    return rows;
  }

  // ---------- aset tetap ----------
  async function listAssets() {
    var rows = await q('SELECT f.*, COALESCE((SELECT SUM(amount) FROM depreciations d WHERE d.asset_id=f.id),0) accum, COALESCE((SELECT COUNT(*) FROM depreciations d WHERE d.asset_id=f.id),0) months_done FROM fixed_assets f ORDER BY date DESC, id DESC');
    rows.forEach(function (r) { r.book = round(r.cost - r.accum); r.monthly = monthlyDep(r); });
    return rows;
  }
  function monthlyDep(a) { return round((a.cost - a.residual) / a.life_months); }
  async function saveAsset(a) {
    if (!(a.name || '').trim()) throw new Error('Nama aset wajib diisi');
    var cost = num(a.cost), residual = num(a.residual), life = parseInt(a.life_months, 10);
    if (cost <= 0) throw new Error('Harga perolehan harus lebih dari 0');
    if (residual < 0 || residual >= cost) throw new Error('Nilai sisa harus di bawah harga perolehan');
    if (!(life > 0)) throw new Error('Umur ekonomis (bulan) harus lebih dari 0');
    if (!validDate(a.date)) throw new Error('Tanggal tidak valid');
    var t = new Tx();
    if (a.id) {
      var done = await q('SELECT COUNT(*) n FROM depreciations WHERE asset_id=?', [a.id]);
      if (done[0].n) throw new Error('Aset sudah disusutkan; hapus penyusutan dulu sebelum mengubah');
      t.add('UPDATE fixed_assets SET name=?, date=?, cost=?, residual=?, life_months=?, note=? WHERE id=?', [a.name.trim(), a.date, cost, residual, life, a.note || '', a.id]);
    } else t.add('INSERT INTO fixed_assets(name,date,cost,residual,life_months,note) VALUES(?,?,?,?,?,?)', [a.name.trim(), a.date, cost, residual, life, a.note || '']);
    await t.run();
  }
  async function deleteAsset(id) {
    var deps = await q('SELECT id FROM depreciations WHERE asset_id=?', [id]);
    var t = new Tx();
    deps.forEach(function (d) { t.add("DELETE FROM journals WHERE ref_type='dep' AND ref_id=?", [d.id]); });
    t.add('DELETE FROM depreciations WHERE asset_id=?', [id]);
    t.add('DELETE FROM fixed_assets WHERE id=?', [id]);
    await t.run();
  }
  // Menyusutkan semua aset untuk satu periode (YYYY-MM); aman dipanggil berulang.
  async function postDepreciation(period) {
    if (!/^\d{4}-\d{2}$/.test(period)) throw new Error('Periode tidak valid');
    var assets = await listAssets();
    var date = monthEnd(period + '-01');
    var count = 0, total = 0;
    for (var i = 0; i < assets.length; i++) {
      var a = assets[i];
      if (a.date.slice(0, 7) > period) continue;
      if (a.months_done >= a.life_months) continue;
      var exists = await q('SELECT id FROM depreciations WHERE asset_id=? AND period=?', [a.id, period]);
      if (exists.length) continue;
      var amount = (a.months_done + 1 >= a.life_months) ? round(a.cost - a.residual - a.accum) : a.monthly;
      if (amount <= 0) continue;
      var t = new Tx();
      var dep = t.add('INSERT INTO depreciations(asset_id,period,amount) VALUES(?,?,?)', [a.id, period, amount]);
      addJournal(t, { date: date, memo: 'Penyusutan ' + a.name + ' ' + period, ref_type: 'dep', ref_id: ref(dep) },
        [{ account_id: A('6-2000'), debit: amount }, { account_id: A('1-2900'), credit: amount }]);
      await t.run();
      count++; total += amount;
    }
    return { count: count, total: round(total) };
  }

  // ---------- laporan ----------
  function signed(a) { return a.normal === 'D' ? a.d - a.c : a.c - a.d; }
  async function balances(from, to) {
    var rows = await q('SELECT a.*, COALESCE(t.d,0) d, COALESCE(t.c,0) c FROM accounts a LEFT JOIN (SELECT l.account_id aid, SUM(l.debit) d, SUM(l.credit) c FROM journal_lines l JOIN journals j ON j.id=l.journal_id WHERE j.date>=? AND j.date<=? GROUP BY l.account_id) t ON t.aid=a.id ORDER BY a.code', [from || '0000-01-01', to || '9999-12-31']);
    rows.forEach(function (r) {
      r.d = round(r.d); r.c = round(r.c); r.balance = round(signed(r));
      // nilai untuk laporan: dihitung menurut sisi alami kelompoknya, sehingga akun kontra bernilai negatif
      var natural = (r.type === 'aset' || r.type === 'hpp' || r.type === 'beban') ? 'D' : 'C';
      r.amt = round(natural === 'D' ? r.d - r.c : r.c - r.d);
    });
    return rows;
  }
  async function trialBalance(asOf) {
    var rows = (await balances(null, asOf)).filter(function (r) { return r.d || r.c; });
    var td = 0, tc = 0;
    rows.forEach(function (r) {
      r.deb = r.balance >= 0 ? (r.normal === 'D' ? r.balance : 0) : (r.normal === 'C' ? -r.balance : 0);
      r.cre = r.balance >= 0 ? (r.normal === 'C' ? r.balance : 0) : (r.normal === 'D' ? -r.balance : 0);
      td += r.deb; tc += r.cre;
    });
    return { rows: rows, debit: round(td), credit: round(tc) };
  }
  async function incomeStatement(from, to) {
    var rows = (await balances(from, to)).filter(function (r) { return r.d || r.c; });
    function grp(t) { return rows.filter(function (r) { return r.type === t; }); }
    function sum(a) { return round(a.reduce(function (s, r) { return s + r.amt; }, 0)); }
    var rev = grp('pendapatan'), hpp = grp('hpp'), exp = grp('beban');
    var revT = sum(rev), hppT = sum(hpp), expT = sum(exp);
    return { revenue: rev, hpp: hpp, expense: exp, revenueTotal: revT, hppTotal: hppT, grossProfit: round(revT - hppT), expenseTotal: expT, netProfit: round(revT - hppT - expT) };
  }
  async function balanceSheet(asOf) {
    var rows = (await balances(null, asOf)).filter(function (r) { return r.d || r.c; });
    function grp(t) { return rows.filter(function (r) { return r.type === t; }); }
    function sum(a) { return round(a.reduce(function (s, r) { return s + r.amt; }, 0)); }
    var assets = grp('aset'), liab = grp('kewajiban'), eq = grp('ekuitas');
    var rev = sum(grp('pendapatan')), hpp = sum(grp('hpp')), exp = sum(grp('beban'));
    var profit = round(rev - hpp - exp);
    var aT = sum(assets), lT = sum(liab), eT = round(sum(eq) + profit);
    return { assets: assets, liabilities: liab, equity: eq, profit: profit, assetTotal: aT, liabilityTotal: lT, equityTotal: eT, balanced: Math.abs(aT - lT - eT) < 0.01 };
  }
  async function ledger(accountId, from, to) {
    var acc = (await q('SELECT * FROM accounts WHERE id=?', [accountId]))[0];
    if (!acc) throw new Error('Akun tidak ditemukan');
    var op = await q('SELECT COALESCE(SUM(l.debit),0) d, COALESCE(SUM(l.credit),0) c FROM journal_lines l JOIN journals j ON j.id=l.journal_id WHERE l.account_id=? AND j.date<?', [accountId, from]);
    var rows = await q('SELECT j.id jid, j.date, j.memo, j.ref_type, l.debit, l.credit FROM journal_lines l JOIN journals j ON j.id=l.journal_id WHERE l.account_id=? AND j.date>=? AND j.date<=? ORDER BY j.date, j.id, l.id', [accountId, from, to]);
    var bal = acc.normal === 'D' ? op[0].d - op[0].c : op[0].c - op[0].d;
    var out = { account: acc, opening: round(bal), rows: [] };
    rows.forEach(function (r) {
      bal += acc.normal === 'D' ? r.debit - r.credit : r.credit - r.debit;
      r.balance = round(bal);
      out.rows.push(r);
    });
    out.closing = round(bal);
    return out;
  }
  async function cashFlow(from, to) {
    var cashIds = (await q('SELECT id FROM accounts WHERE is_cash=1')).map(function (r) { return r.id; });
    if (!cashIds.length) return { opening: 0, inflow: 0, outflow: 0, closing: 0, groups: [] };
    var ph = cashIds.map(function () { return '?'; }).join(',');
    var opening = await q('SELECT COALESCE(SUM(l.debit-l.credit),0) s FROM journal_lines l JOIN journals j ON j.id=l.journal_id WHERE l.account_id IN (' + ph + ') AND j.date<?', cashIds.concat([from]));
    var js = await q('SELECT j.id, j.ref_type, j.memo, SUM(CASE WHEN l.account_id IN (' + ph + ') THEN l.debit-l.credit ELSE 0 END) net, SUM(CASE WHEN l.account_id IN (' + ph + ') THEN 0 ELSE 1 END) others FROM journals j JOIN journal_lines l ON l.journal_id=j.id WHERE j.date>=? AND j.date<=? GROUP BY j.id', cashIds.concat(cashIds, [from, to]));
    var labels = { sale: 'Penjualan', payment: 'Pelunasan faktur', cash: 'Kas masuk/keluar', manual: 'Jurnal manual', opening: 'Saldo awal', adjust: 'Penyesuaian', purchase: 'Pembelian', dep: 'Penyusutan' };
    var groups = {}, inflow = 0, outflow = 0;
    js.forEach(function (j) {
      if (!j.others || !j.net) return; // transfer antar kas / tidak ada efek kas
      var key = j.ref_type;
      var g = groups[key] = groups[key] || { key: key, label: labels[key] || key, inflow: 0, outflow: 0 };
      if (j.net > 0) { g.inflow += j.net; inflow += j.net; } else { g.outflow += -j.net; outflow += -j.net; }
    });
    var op = round(opening[0].s);
    return { opening: op, inflow: round(inflow), outflow: round(outflow), closing: round(op + inflow - outflow), groups: Object.keys(groups).map(function (k) { var g = groups[k]; g.inflow = round(g.inflow); g.outflow = round(g.outflow); return g; }) };
  }
  async function receivablePayable(kind, asOf) {
    var rows = await q('SELECT i.*, c.name contact_name FROM invoices i LEFT JOIN contacts c ON c.id=i.contact_id WHERE i.kind=? AND i.date<=? AND i.total-i.paid>0.004 ORDER BY i.due_date, i.id', [kind, asOf]);
    var tot = 0;
    rows.forEach(function (r) {
      r.rest = round(r.total - r.paid);
      r.overdue = Math.max(0, daysBetween(r.due_date || r.date, asOf));
      tot += r.rest;
    });
    return { rows: rows, total: round(tot) };
  }
  async function salesByProduct(kind, from, to) {
    return q('SELECT COALESCE(it.product_id,0) pid, it.name, SUM(it.qty) qty, SUM(it.qty*it.price) amount, SUM(it.qty*it.cost) cost FROM invoice_items it JOIN invoices i ON i.id=it.invoice_id WHERE i.kind=? AND i.date>=? AND i.date<=? GROUP BY it.name ORDER BY amount DESC', [kind, from, to]).then(function (r) {
      r.forEach(function (x) { x.amount = round(x.amount); x.cost = round(x.cost); x.profit = round(x.amount - x.cost); });
      return r;
    });
  }
  async function stockReport() {
    var rows = await q('SELECT * FROM products WHERE active=1 AND track_stock=1 ORDER BY name COLLATE NOCASE');
    var tot = 0;
    rows.forEach(function (r) { r.value = round(r.stock * r.cost); tot += r.value; });
    return { rows: rows, total: round(tot) };
  }
  async function monthlyTrend(endDate, months) {
    var out = [];
    for (var i = months - 1; i >= 0; i--) {
      var s = addMonths(monthStart(endDate), -i);
      var is = await incomeStatement(s, monthEnd(s));
      out.push({ month: s.slice(0, 7), revenue: is.revenueTotal, expense: round(is.hppTotal + is.expenseTotal), profit: is.netProfit });
    }
    return out;
  }
  async function dashboard() {
    var t = today();
    var bs = await balances(null, t);
    var cash = 0;
    bs.forEach(function (a) { if (a.is_cash) cash += a.balance; });
    var ar = await receivablePayable('sale', t), ap = await receivablePayable('purchase', t);
    var is = await incomeStatement(monthStart(t), monthEnd(t));
    var low = await q('SELECT * FROM products WHERE active=1 AND track_stock=1 AND stock<=min_stock AND min_stock>0 ORDER BY stock LIMIT 5');
    var recent = await q("SELECT 'cash' k, id, date, type sub, amount, note label FROM cash_tx UNION ALL SELECT 'inv', id, date, kind, total, number FROM invoices ORDER BY date DESC, id DESC LIMIT 8");
    var trend = await monthlyTrend(t, 6);
    return { cash: round(cash), receivable: ar.total, payable: ap.total, monthIncome: is, low: low, recent: recent, trend: trend };
  }

  // ---------- backup / restore ----------
  var TABLES = ['settings', 'accounts', 'contacts', 'products', 'journals', 'journal_lines', 'invoices', 'invoice_items', 'payments', 'cash_tx', 'stock_moves', 'fixed_assets', 'depreciations'];
  async function exportBackup() {
    var data = { app: 'BukuKas', version: 1, created: new Date().toISOString(), tables: {} };
    for (var i = 0; i < TABLES.length; i++) data.tables[TABLES[i]] = await q('SELECT * FROM ' + TABLES[i]);
    return JSON.stringify(data);
  }
  async function restoreBackup(json) {
    var data;
    try { data = JSON.parse(json); } catch (e) { throw new Error('Berkas backup tidak valid'); }
    if (!data || data.app !== 'BukuKas' || !data.tables) throw new Error('Bukan berkas backup BukuKas');
    var t = new Tx();
    t.add('PRAGMA defer_foreign_keys = ON');
    for (var i = TABLES.length - 1; i >= 0; i--) t.add('DELETE FROM ' + TABLES[i]);
    t.add("DELETE FROM sqlite_sequence");
    TABLES.forEach(function (name) {
      var rows = data.tables[name] || [];
      rows.forEach(function (r) {
        var cols = Object.keys(r);
        if (!cols.length) return;
        cols.forEach(function (c) { if (!/^[a-z_]+$/.test(c)) throw new Error('Kolom tidak valid'); });
        t.add('INSERT INTO ' + name + '(' + cols.join(',') + ') VALUES(' + cols.map(function () { return '?'; }).join(',') + ')', cols.map(function (c) { return r[c]; }));
      });
    });
    await t.run();
    await loadAccMap();
  }
  async function resetAll() {
    var t = new Tx();
    for (var i = TABLES.length - 1; i >= 0; i--) if (TABLES[i] !== 'settings' && TABLES[i] !== 'accounts') t.add('DELETE FROM ' + TABLES[i]);
    t.add("DELETE FROM accounts WHERE system=0");
    t.add("DELETE FROM sqlite_sequence WHERE name NOT IN ('accounts')");
    await t.run();
  }

  G.Core = {
    util: { round: round, num: num, today: today, monthStart: monthStart, monthEnd: monthEnd, addMonths: addMonths, addDays: addDays, daysBetween: daysBetween, validDate: validDate },
    TYPES: TYPES, TYPE_LABEL: TYPE_LABEL, A: A,
    init: init, getSettings: getSettings, setSettings: setSettings,
    listAccounts: listAccounts, saveAccount: saveAccount, deleteAccount: deleteAccount, setOpeningBalance: setOpeningBalance, getOpeningBalances: getOpeningBalances,
    saveManualJournal: saveManualJournal, deleteJournal: deleteJournal, listJournals: listJournals,
    saveCash: saveCash, deleteCash: deleteCash, listCash: listCash,
    listContacts: listContacts, saveContact: saveContact, deleteContact: deleteContact,
    listProducts: listProducts, saveProduct: saveProduct, deleteProduct: deleteProduct, adjustStock: adjustStock, stockCard: stockCard,
    createInvoice: createInvoice, addPayment: addPayment, deletePayment: deletePayment, deleteInvoice: deleteInvoice, getInvoice: getInvoice, listInvoices: listInvoices, invStatus: invStatus,
    listAssets: listAssets, saveAsset: saveAsset, deleteAsset: deleteAsset, postDepreciation: postDepreciation,
    balances: balances, trialBalance: trialBalance, incomeStatement: incomeStatement, balanceSheet: balanceSheet, ledger: ledger, cashFlow: cashFlow,
    receivablePayable: receivablePayable, salesByProduct: salesByProduct, stockReport: stockReport, monthlyTrend: monthlyTrend, dashboard: dashboard,
    exportBackup: exportBackup, restoreBackup: restoreBackup, resetAll: resetAll
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
