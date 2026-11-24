const assert = require('assert');
const makeRpc = require('./sqlite-rpc');
globalThis.RPC = makeRpc();
require('../dist/js/core.js');
const C = Core;
const U = C.util;
let pass = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('ok  -', name); } catch (e) { console.log('FAIL-', name, '\n   ', e.stack); process.exitCode = 1; } }
const id = async (code) => (await C.listAccounts(true)).find(a => a.code === code).id;

(async () => {
  await C.init();
  await C.init(); // idempotent
  const today = U.today(), m0 = U.monthStart(today), m1 = U.monthEnd(today);
  const kas = await id('1-1100'), bank = await id('1-1200');

  await t('akun bawaan terisi', async () => { assert.ok((await C.listAccounts()).length >= 25); });

  await t('saldo awal kas + modal', async () => {
    await C.setOpeningBalance(kas, 5000000, m0);
    await C.setOpeningBalance(kas, 5000000, m0); // ganti, bukan dobel
    const b = (await C.balances(null, m1)).find(a => a.id === kas);
    assert.strictEqual(b.balance, 5000000);
    const op = await C.getOpeningBalances();
    assert.strictEqual(op[kas], 5000000);
  });

  await t('kas masuk/keluar/transfer + edit + hapus', async () => {
    await C.saveCash({ date: today, type: 'in', account_id: kas, category_id: await id('4-2000'), amount: '1.000.000', note: 'Bunga' });
    await C.saveCash({ date: today, type: 'out', account_id: kas, category_id: await id('6-1100'), amount: 300000, note: 'Sewa' });
    await C.saveCash({ date: today, type: 'transfer', account_id: kas, to_account_id: bank, amount: 2000000 });
    let bs = await C.balances(null, m1);
    assert.strictEqual(bs.find(a => a.id === kas).balance, 5000000 + 1000000 - 300000 - 2000000);
    assert.strictEqual(bs.find(a => a.id === bank).balance, 2000000);
    const list = await C.listCash(m0, m1);
    assert.strictEqual(list.length, 3);
    const sewa = list.find(x => x.note === 'Sewa');
    await C.saveCash({ date: today, type: 'out', account_id: kas, category_id: await id('6-1100'), amount: 400000, note: 'Sewa' }, sewa.id);
    bs = await C.balances(null, m1);
    assert.strictEqual(bs.find(a => a.id === kas).balance, 5000000 + 1000000 - 400000 - 2000000);
    await C.deleteCash(sewa.id);
    assert.strictEqual((await C.listCash(m0, m1)).length, 2);
    await assert.rejects(() => C.saveCash({ date: today, type: 'in', account_id: kas, category_id: kas, amount: 1 }));
    await assert.rejects(() => C.saveCash({ date: today, type: 'in', account_id: kas, category_id: 1, amount: 0 }));
  });

  let pid, cid, sid, saleId;
  await t('produk, stok awal, kontak', async () => {
    cid = await C.saveContact({ name: 'Budi', type: 'customer' });
    sid = await C.saveContact({ name: 'PT Pemasok', type: 'supplier' });
    pid = await C.saveProduct({ name: 'Kopi', unit: 'bks', buy_price: 10000, sell_price: 15000, min_stock: 5, track_stock: 1, opening_qty: 10 });
    const p = (await C.listProducts())[0];
    assert.strictEqual(p.stock, 10); assert.strictEqual(p.cost, 10000);
    assert.strictEqual((await C.listContacts('customer')).length, 1);
  });

  await t('penjualan: stok, HPP, piutang, PPN, diskon', async () => {
    const r = await C.createInvoice({ kind: 'sale', date: today, contact_id: cid, items: [{ product_id: pid, qty: 4, price: 15000 }], discount: 5000, tax_pct: 11 });
    // subtotal 60000, disc 5000 -> 55000, pajak 6050 -> 61050
    assert.strictEqual(r.total, 61050);
    const p = (await C.listProducts())[0];
    assert.strictEqual(p.stock, 6);
    const inv = await C.getInvoice(r.id);
    assert.strictEqual(inv.status, 'belum');
    const ar = await C.receivablePayable('sale', m1);
    assert.strictEqual(ar.total, 61050);
    const is = await C.incomeStatement(m0, m1);
    assert.strictEqual(is.hppTotal, 40000);
    assert.ok(is.revenueTotal === 60000 - 5000 + 1000000, 'pendapatan = penjualan neto + pendapatan lain, dapat ' + is.revenueTotal);
    // pembayaran sebagian lalu pelunasan
    await C.addPayment(r.id, { date: today, amount: 30000, account_id: kas });
    assert.strictEqual((await C.getInvoice(r.id)).status, 'sebagian');
    await assert.rejects(() => C.addPayment(r.id, { date: today, amount: 99999999, account_id: kas }));
    await C.addPayment(r.id, { date: today, amount: 31050, account_id: bank });
    assert.strictEqual((await C.getInvoice(r.id)).status, 'lunas');
    saleId = r.id;
  });

  await t('stok tidak cukup ditolak', async () => {
    await assert.rejects(() => C.createInvoice({ kind: 'sale', date: today, items: [{ product_id: pid, qty: 999, price: 1 }] }), /Stok/);
  });

  await t('pembelian: rata-rata tertimbang, hutang, bayar langsung', async () => {
    const r = await C.createInvoice({ kind: 'purchase', date: today, contact_id: sid, items: [{ product_id: pid, qty: 6, price: 12000 }], tax_pct: 0, pay_now: 20000, pay_account_id: kas });
    const p = (await C.listProducts())[0];
    assert.strictEqual(p.stock, 12);
    assert.strictEqual(p.cost, 11000); // (6*10000 + 6*12000)/12
    const ap = await C.receivablePayable('purchase', m1);
    assert.strictEqual(ap.total, 72000 - 20000);
  });

  await t('neraca seimbang & neraca saldo seimbang', async () => {
    const bs = await C.balanceSheet(m1);
    assert.ok(bs.balanced, JSON.stringify([bs.assetTotal, bs.liabilityTotal, bs.equityTotal]));
    const tb = await C.trialBalance(m1);
    assert.strictEqual(tb.debit, tb.credit);
  });

  await t('hapus faktur mengembalikan stok & jurnal', async () => {
    const before = (await C.listProducts())[0].stock;
    await C.deleteInvoice(saleId); // penjualan 4 pcs
    const after = (await C.listProducts())[0].stock;
    assert.strictEqual(after, before + 4);
    const bs = await C.balanceSheet(m1);
    assert.ok(bs.balanced);
    const left = await RPC.q("SELECT COUNT(*) n FROM journals WHERE ref_type='payment' AND ref_id NOT IN (SELECT id FROM payments)");
    assert.strictEqual(left[0].n, 0);
  });

  await t('penyesuaian stok & kartu stok', async () => {
    await C.adjustStock(pid, -2, today, 'Rusak');
    const sc = await C.stockCard(pid, m0, m1);
    assert.ok(sc.rows.length >= 3);
    assert.strictEqual(sc.closing, (await C.listProducts())[0].stock);
    const bs = await C.balanceSheet(m1);
    assert.ok(bs.balanced);
  });

  await t('jurnal manual harus seimbang', async () => {
    await assert.rejects(() => C.saveManualJournal({ date: today, lines: [{ account_id: kas, debit: 100 }, { account_id: bank, credit: 90 }] }), /seimbang/);
    await C.saveManualJournal({ date: today, memo: 'Tes', lines: [{ account_id: kas, debit: 100 }, { account_id: bank, credit: 100 }] });
    const js = await C.listJournals(m0, m1);
    const man = js.find(j => j.ref_type === 'manual');
    assert.ok(man && man.lines.length === 2);
    await C.deleteJournal(man.id);
    assert.ok(!(await C.listJournals(m0, m1)).some(j => j.ref_type === 'manual'));
  });

  await t('aset tetap & penyusutan tidak dobel', async () => {
    await C.saveAsset({ name: 'Mesin', date: m0, cost: 1200000, residual: 0, life_months: 12 });
    const p = today.slice(0, 7);
    const r1 = await C.postDepreciation(p);
    const r2 = await C.postDepreciation(p);
    assert.strictEqual(r1.count, 1); assert.strictEqual(r2.count, 0);
    assert.strictEqual(r1.total, 100000);
    assert.ok((await C.balanceSheet(m1)).balanced);
  });

  await t('arus kas & buku besar & laporan penjualan', async () => {
    const cf = await C.cashFlow(m0, m1);
    assert.strictEqual(cf.closing, cf.opening + cf.inflow - cf.outflow);
    const bsAll = (await C.balances(null, m1)).filter(a => a.is_cash).reduce((s, a) => s + a.balance, 0);
    assert.strictEqual(cf.closing, bsAll);
    const lg = await C.ledger(kas, m0, m1);
    assert.strictEqual(lg.closing, (await C.balances(null, m1)).find(a => a.id === kas).balance);
    await C.salesByProduct('sale', m0, m1);
    await C.stockReport();
  });

  await t('dashboard', async () => { const d = await C.dashboard(); assert.ok(d.trend.length === 6); });

  await t('backup & restore bolak-balik', async () => {
    const json = await C.exportBackup();
    const before = (await C.balanceSheet(m1)).assetTotal;
    await C.resetAll();
    assert.strictEqual((await C.balanceSheet(m1)).assetTotal, 0);
    await C.restoreBackup(json);
    assert.strictEqual((await C.balanceSheet(m1)).assetTotal, before);
    await assert.rejects(() => C.restoreBackup('{"x":1}'));
    await C.createInvoice({ kind: 'sale', date: today, items: [{ name: 'Jasa', qty: 1, price: 50000 }] });
  });

  await t('akun: tambah, duplikat, hapus', async () => {
    await C.saveAccount({ code: '6-3000', name: 'Beban Uji', type: 'beban' });
    await assert.rejects(() => C.saveAccount({ code: '6-3000', name: 'X', type: 'beban' }));
    const a = (await C.listAccounts(true)).find(x => x.code === '6-3000');
    await C.deleteAccount(a.id);
    await assert.rejects(() => C.deleteAccount(kas));
  });

  console.log(`\n${pass} tes lolos`);
})();
