// Halaman & formulir BukuKas.
(function (G) {
  'use strict';
  const C = G.Core, U = C.util, X = G.UI;
  const { esc, rp, dt, fmt, sheet, toast, guard, confirmBox, field, money, select, formData } = X;

  // state ringan antar halaman
  const S = {
    month: U.today().slice(0, 7) + '-01',
    tab: 'kas', search: '', status: '',
    cart: [], cartDisc: 0,
    settings: {}
  };
  const reload = () => G.App && G.App.render();

  async function cashAccounts() { return (await C.listAccounts()).filter(a => a.is_cash); }
  const opt = (rows, v, t) => rows.map(r => ({ v: r[v], t: typeof t === 'function' ? t(r) : r[t] }));
  const accOpt = rows => opt(rows, 'id', a => a.code + ' · ' + a.name);
  const range = () => [S.month, U.monthEnd(S.month)];
  const sumBy = (rows, f) => rows.reduce((s, r) => s + f(r), 0);

  function monthNav() {
    return `<div class="bar no-print"><button class="btn sec" data-act="mprev">‹</button><div style="flex:1;text-align:center;font-weight:650">${esc(X.monthLabel(S.month))}</div><button class="btn sec" data-act="mnext">›</button></div>`;
  }
  function statusBadge(s) {
    return s === 'lunas' ? '<span class="badge">Lunas</span>' : s === 'sebagian' ? '<span class="badge warn">Sebagian</span>' : '<span class="badge red">Belum lunas</span>';
  }
  function emptyMsg(t) { return `<div class="empty">${esc(t)}</div>`; }

  // =====================================================================
  // BERANDA
  // =====================================================================
  async function pageHome() {
    const d = await C.dashboard();
    const s = d.monthIncome;
    const recent = d.recent.map(r => {
      if (r.k === 'cash') {
        const t = r.sub === 'in' ? 'in' : r.sub === 'out' ? 'out' : 'mute';
        const sign = r.sub === 'in' ? '+' : r.sub === 'out' ? '-' : '';
        return `<div class="it" data-act="cash" data-id="${r.id}"><div class="main"><div class="t">${esc(r.label || (r.sub === 'in' ? 'Pemasukan' : r.sub === 'out' ? 'Pengeluaran' : 'Transfer'))}</div><div class="s">${dt(r.date)}</div></div><div class="amt ${t}">${sign}${rp(r.amount)}</div></div>`;
      }
      return `<div class="it" data-act="inv" data-id="${r.id}"><div class="main"><div class="t">${esc(r.label)}</div><div class="s">${dt(r.date)} · ${r.sub === 'sale' ? 'Penjualan' : 'Pembelian'}</div></div><div class="amt ${r.sub === 'sale' ? 'in' : 'out'}">${rp(r.amount)}</div></div>`;
    }).join('');
    const low = d.low.length ? `<div class="card"><h3>⚠️ Stok menipis</h3><div class="list">${d.low.map(p => `<div class="it" data-act="prod" data-id="${p.id}"><div class="main"><div class="t">${esc(p.name)}</div><div class="s">Minimum ${p.min_stock} ${esc(p.unit)}</div></div><div class="amt out">${p.stock} ${esc(p.unit)}</div></div>`).join('')}</div></div>` : '';
    return {
      title: S.settings.biz_name || 'BukuKas',
      html: `
      <div class="hero"><div class="l">Total kas & bank</div><div class="v">${rp(d.cash)}</div></div>
      <div class="qa">
        <button data-act="newcash" data-type="in"><span class="ic">⬇️</span>Pemasukan</button>
        <button data-act="newcash" data-type="out"><span class="ic">⬆️</span>Pengeluaran</button>
        <button data-act="newinv" data-kind="sale"><span class="ic">🧾</span>Penjualan</button>
        <button data-act="newinv" data-kind="purchase"><span class="ic">📦</span>Pembelian</button>
      </div>
      <div class="grid2" style="margin-bottom:12px">
        <div class="stat"><div class="l">Pendapatan bulan ini</div><div class="v in">${rp(s.revenueTotal)}</div></div>
        <div class="stat"><div class="l">Laba bersih bulan ini</div><div class="v ${s.netProfit < 0 ? 'out' : ''}">${rp(s.netProfit)}</div></div>
        <div class="stat" data-act="goto" data-to="/laporan/piutang"><div class="l">Piutang</div><div class="v">${rp(d.receivable)}</div></div>
        <div class="stat" data-act="goto" data-to="/laporan/hutang"><div class="l">Hutang</div><div class="v">${rp(d.payable)}</div></div>
      </div>
      <div class="card"><h3>Pendapatan vs biaya (6 bulan)</h3>${X.barChart(d.trend)}</div>
      ${low}
      <div class="card"><h3>Transaksi terbaru</h3><div class="list">${recent || emptyMsg('Belum ada transaksi. Mulai dengan menekan tombol di atas.')}</div></div>`
    };
  }

  // =====================================================================
  // TRANSAKSI
  // =====================================================================
  async function pageTrans() {
    const [from, to] = range();
    const tabs = [['kas', 'Kas'], ['sale', 'Penjualan'], ['purchase', 'Pembelian'], ['jurnal', 'Jurnal']];
    let body = '', fab = '';
    const search = `<div class="bar no-print"><input type="search" placeholder="Cari…" value="${esc(S.search)}" data-act="search"></div>`;
    if (S.tab === 'kas') {
      const rows = await C.listCash(from, to, S.search);
      const tin = sumBy(rows.filter(r => r.type === 'in'), r => r.amount), tout = sumBy(rows.filter(r => r.type === 'out'), r => r.amount);
      body = `<div class="grid2" style="margin-bottom:10px"><div class="stat"><div class="l">Pemasukan</div><div class="v in">${rp(tin)}</div></div><div class="stat"><div class="l">Pengeluaran</div><div class="v out">${rp(tout)}</div></div></div>` +
        search + `<div class="card list">${rows.map(r => {
          const cls = r.type === 'in' ? 'in' : r.type === 'out' ? 'out' : 'mute';
          const sub = r.type === 'transfer' ? `${esc(r.acc_name)} → ${esc(r.to_name)}` : `${esc(r.cat_name)} · ${esc(r.acc_name)}`;
          return `<div class="it" data-act="cash" data-id="${r.id}"><div class="main"><div class="t">${esc(r.note || (r.type === 'in' ? 'Pemasukan' : r.type === 'out' ? 'Pengeluaran' : 'Transfer'))}</div><div class="s">${dt(r.date)} · ${sub}</div></div><div class="amt ${cls}">${r.type === 'in' ? '+' : r.type === 'out' ? '-' : ''}${rp(r.amount)}</div></div>`;
        }).join('') || emptyMsg('Tidak ada transaksi kas pada bulan ini')}</div>`;
      fab = 'newcash';
    } else if (S.tab === 'sale' || S.tab === 'purchase') {
      const rows = await C.listInvoices(S.tab, from, to, S.search, S.status);
      const total = sumBy(rows, r => r.total);
      body = `<div class="stat" style="margin-bottom:10px"><div class="l">Total ${S.tab === 'sale' ? 'penjualan' : 'pembelian'} (${rows.length} faktur)</div><div class="v">${rp(total)}</div></div>` +
        `<div class="bar no-print"><input type="search" placeholder="Cari nomor / nama…" value="${esc(S.search)}" data-act="search"><select data-act="status" style="max-width:130px"><option value="">Semua</option><option value="belum"${S.status === 'belum' ? ' selected' : ''}>Belum lunas</option><option value="sebagian"${S.status === 'sebagian' ? ' selected' : ''}>Sebagian</option><option value="lunas"${S.status === 'lunas' ? ' selected' : ''}>Lunas</option></select></div>` +
        `<div class="card list">${rows.map(r => `<div class="it" data-act="inv" data-id="${r.id}"><div class="main"><div class="t">${esc(r.number)} · ${esc(r.contact_name || (S.tab === 'sale' ? 'Umum' : 'Tanpa pemasok'))}</div><div class="s">${dt(r.date)} ${statusBadge(r.status)}</div></div><div class="amt">${rp(r.total)}</div></div>`).join('') || emptyMsg('Belum ada faktur pada bulan ini')}</div>`;
      fab = 'newinv';
    } else {
      const js = await C.listJournals(from, to);
      body = `<div class="card">${js.map(j => `<div style="padding:8px 0;border-bottom:1px solid var(--line)" ${j.ref_type === 'manual' ? `data-act="jrn" data-id="${j.id}" style="cursor:pointer"` : ''}>
        <div class="small mute">${dt(j.date)} · ${esc(j.ref_type)}${j.ref_type === 'manual' ? ' ✎' : ''}</div><div><b>${esc(j.memo)}</b></div>
        <table class="t">${j.lines.map(l => `<tr><td>${esc(l.code)} ${esc(l.aname)}</td><td class="n">${l.debit ? fmt(l.debit) : ''}</td><td class="n">${l.credit ? fmt(l.credit) : ''}</td></tr>`).join('')}</table></div>`).join('') || emptyMsg('Belum ada jurnal pada bulan ini')}</div>`;
      fab = 'newjrn';
    }
    const head = `<div class="tabs no-print">${tabs.map(t => `<button data-act="tab" data-tab="${t[0]}" class="${S.tab === t[0] ? 'on' : ''}">${t[1]}</button>`).join('')}</div>` + monthNav();
    return { title: 'Transaksi', html: head + body + `<button class="fab no-print" data-act="${fab}" data-kind="${S.tab}" aria-label="Tambah">＋</button>` };
  }

  // ---------- form kas ----------
  async function formCash(id, type) {
    const accs = await C.listAccounts();
    const cash = accs.filter(a => a.is_cash);
    let rec = { date: U.today(), type: type || 'in', account_id: cash[0] && cash[0].id, amount: 0, note: '' };
    if (id) rec = (await G.RPC.q('SELECT * FROM cash_tx WHERE id=?', [id]))[0] || rec;
    const catFor = t => t === 'in' ? accs.filter(a => !a.is_cash && ['pendapatan', 'kewajiban', 'ekuitas', 'aset'].includes(a.type)) : accs.filter(a => !a.is_cash && ['beban', 'hpp', 'aset', 'kewajiban', 'ekuitas'].includes(a.type));
    const defCat = t => { const l = catFor(t); const pref = t === 'in' ? '4-1000' : '6-9000'; const f = l.find(a => a.code === pref); return (f || l[0] || {}).id; };
    const html = () => `<form>
      <div class="tabs">${[['in', 'Pemasukan'], ['out', 'Pengeluaran'], ['transfer', 'Transfer']].map(t => `<button type="button" data-t="${t[0]}" class="${rec.type === t[0] ? 'on' : ''}">${t[1]}</button>`).join('')}</div>
      ${money('amount', 'Nominal', rec.amount)}
      ${field('date', 'Tanggal', rec.date, 'date')}
      ${select('account_id', rec.type === 'in' ? 'Masuk ke' : 'Dari akun', accOpt(cash), rec.account_id)}
      ${rec.type === 'transfer' ? select('to_account_id', 'Ke akun', accOpt(cash), rec.to_account_id || (cash[1] || cash[0] || {}).id) : select('category_id', 'Kategori', accOpt(catFor(rec.type)), rec.category_id || defCat(rec.type))}
      ${field('note', 'Catatan', rec.note)}
      <button class="btn block" type="submit">Simpan</button>
      ${id ? '<button class="btn red block mt" type="button" data-del>Hapus transaksi</button>' : ''}</form>`;
    sheet(id ? 'Ubah transaksi kas' : 'Transaksi kas', html(), function render(a) {
      const wire = () => {
        X.bindMoney(a.body);
        a.body.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { const cur = formData(a.body); rec = Object.assign(rec, cur, { amount: U.num(cur.amount), type: b.dataset.t, category_id: null, to_account_id: null }); a.body.innerHTML = html(); wire(); });
        a.body.querySelector('form').onsubmit = e => {
          e.preventDefault();
          const f = formData(a.body);
          guard(async () => { await C.saveCash(Object.assign({}, f, { type: rec.type }), id); a.close(); toast('Tersimpan'); reload(); });
        };
        const del = a.body.querySelector('[data-del]');
        if (del) del.onclick = async () => { if (await confirmBox('Hapus transaksi kas ini?')) guard(async () => { await C.deleteCash(id); a.close(); toast('Dihapus'); reload(); }); };
      };
      wire();
    });
  }

  // ---------- form faktur ----------
  async function formInvoice(kind, preset) {
    preset = preset || {};
    const [products, contacts, cash] = await Promise.all([C.listProducts(), C.listContacts(kind === 'sale' ? 'customer' : 'supplier'), cashAccounts()]);
    const taxDefault = Number(S.settings.tax_pct) || 0;
    const isSale = kind === 'sale';
    const html = `<form>
      <div class="row2">${field('date', 'Tanggal', U.today(), 'date')}${field('due_date', 'Jatuh tempo', U.addDays(U.today(), 14), 'date')}</div>
      ${select('contact_id', isSale ? 'Pelanggan' : 'Pemasok', [{ v: '', t: isSale ? '— Umum —' : '— Tanpa pemasok —' }].concat(opt(contacts, 'id', 'name')), preset.contact_id || '')}
      <h3 class="mute" style="font-size:13px;margin:6px 0">Barang / jasa</h3>
      <div id="items"></div>
      <button type="button" class="btn sec block" data-addrow>＋ Tambah baris</button>
      <div class="sp"></div>
      <div class="row2">${money('discount', 'Diskon (Rp)', 0)}<label class="f">PPN (%)<input name="tax_pct" inputmode="decimal" value="0"></label></div>
      <div class="hint">Tarif PPN bawaan: ${taxDefault}% — <a href="#" data-ppn>pakai PPN</a></div>
      <div class="card" style="margin:8px 0"><div class="row2"><div>Subtotal</div><div class="right" id="vSub">0</div></div><div class="row2"><div>Diskon</div><div class="right" id="vDisc">0</div></div><div class="row2"><div>PPN</div><div class="right" id="vTax">0</div></div><div class="row2"><b>Total</b><b class="right" id="vTot">0</b></div></div>
      ${money('pay_now', isSale ? 'Diterima sekarang (kosongkan = piutang)' : 'Dibayar sekarang (kosongkan = hutang)', 0)}
      ${select('pay_account_id', isSale ? 'Diterima di' : 'Dibayar dari', accOpt(cash), (cash[0] || {}).id)}
      ${field('note', 'Catatan', '')}
      <button class="btn block" type="submit">Simpan ${isSale ? 'penjualan' : 'pembelian'}</button></form>`;
    sheet(isSale ? 'Penjualan baru' : 'Pembelian baru', html, a => {
      const box = a.body.querySelector('#items');
      const pOpts = '<option value="">✎ Ketik manual</option>' + products.map(p => `<option value="${p.id}">${esc(p.name)}${p.track_stock ? ` (stok ${p.stock})` : ''}</option>`).join('');
      const addRow = () => {
        const r = document.createElement('div');
        r.className = 'card'; r.style.padding = '10px';
        r.innerHTML = `<select data-p>${pOpts}</select><input data-n placeholder="Nama barang/jasa" style="margin-top:6px"><div class="row2" style="margin-top:6px"><input data-q inputmode="decimal" value="1" placeholder="Jumlah"><input data-pr data-money placeholder="Harga"></div><div class="row2 small" style="margin-top:6px"><span class="mute" data-line>0</span><button type="button" class="btn sec" data-rm style="padding:4px 10px">Hapus</button></div>`;
        box.appendChild(r); X.bindMoney(r);
        r.querySelector('[data-p]').onchange = e => {
          const p = products.find(x => String(x.id) === e.target.value);
          r.querySelector('[data-n]').style.display = p ? 'none' : '';
          const pr = r.querySelector('[data-pr]');
          if (p) { pr.value = fmt(isSale ? p.sell_price : (p.buy_price || p.cost)); }
          calc();
        };
        r.querySelector('[data-rm]').onclick = () => { r.remove(); calc(); };
        r.querySelectorAll('input').forEach(i => i.addEventListener('input', calc));
        calc();
      };
      const items = () => Array.from(box.children).map(r => {
        const pid = r.querySelector('[data-p]').value;
        return { product_id: pid ? +pid : null, name: r.querySelector('[data-n]').value, qty: parseFloat(String(r.querySelector('[data-q]').value).replace(',', '.')) || 0, price: U.num(r.querySelector('[data-pr]').value) };
      });
      const calc = () => {
        const f = formData(a.body);
        let sub = 0;
        Array.from(box.children).forEach((r, i) => { const it = items()[i]; const l = U.round(it.qty * it.price); sub += l; r.querySelector('[data-line]').textContent = 'Jumlah: ' + rp(l); });
        const disc = Math.min(U.num(f.discount), sub), pct = parseFloat(String(f.tax_pct).replace(',', '.')) || 0;
        const tax = U.round((sub - disc) * pct / 100), tot = U.round(sub - disc + tax);
        a.body.querySelector('#vSub').textContent = rp(sub); a.body.querySelector('#vDisc').textContent = rp(disc);
        a.body.querySelector('#vTax').textContent = rp(tax); a.body.querySelector('#vTot').textContent = rp(tot);
        return tot;
      };
      a.body.querySelector('[data-addrow]').onclick = addRow;
      a.body.querySelector('[data-ppn]').onclick = e => { e.preventDefault(); a.body.querySelector('[name=tax_pct]').value = taxDefault; calc(); };
      ['discount', 'tax_pct'].forEach(n => a.body.querySelector(`[name=${n}]`).addEventListener('input', calc));
      addRow();
      a.body.querySelector('form').onsubmit = e => {
        e.preventDefault();
        const f = formData(a.body);
        const its = items().filter(i => i.product_id || i.name.trim());
        guard(async () => {
          const r = await C.createInvoice({ kind, date: f.date, due_date: f.due_date, contact_id: f.contact_id ? +f.contact_id : null, items: its, discount: f.discount, tax_pct: parseFloat(String(f.tax_pct).replace(',', '.')) || 0, pay_now: f.pay_now, pay_account_id: f.pay_account_id ? +f.pay_account_id : null, note: f.note });
          a.close(); toast('Faktur ' + r.number + ' tersimpan'); reload();
        });
      };
    });
  }

  // ---------- detail faktur ----------
  async function showInvoice(id) {
    const inv = await C.getInvoice(id);
    if (!inv) return toast('Faktur tidak ditemukan', true);
    const s = S.settings, isSale = inv.kind === 'sale';
    const rest = U.round(inv.total - inv.paid);
    const html = `<div id="print">
      <div class="inv-head"><div><b>${esc(s.biz_name)}</b><div class="small mute">${esc(s.biz_address || '')} ${esc(s.biz_phone || '')}</div></div><div class="right"><b>${esc(inv.number)}</b><div class="small mute">${dt(inv.date)}</div>${statusBadge(inv.status)}</div></div>
      <div class="small mt">${isSale ? 'Pelanggan' : 'Pemasok'}: <b>${esc(inv.contact_name || '-')}</b>${inv.due_date ? ` · Jatuh tempo ${dt(inv.due_date)}` : ''}</div>
      <table class="t mt"><tr><th>Item</th><th class="n">Jml</th><th class="n">Harga</th><th class="n">Total</th></tr>
      ${inv.items.map(i => `<tr><td>${esc(i.name)}</td><td class="n">${i.qty}</td><td class="n">${fmt(i.price)}</td><td class="n">${fmt(i.qty * i.price)}</td></tr>`).join('')}
      <tr class="sec"><td colspan="3">Subtotal</td><td class="n">${fmt(inv.subtotal)}</td></tr>
      ${inv.discount ? `<tr><td colspan="3">Diskon</td><td class="n">-${fmt(inv.discount)}</td></tr>` : ''}
      ${inv.tax ? `<tr><td colspan="3">PPN</td><td class="n">${fmt(inv.tax)}</td></tr>` : ''}
      <tr class="tot"><td colspan="3">Total</td><td class="n">${fmt(inv.total)}</td></tr>
      <tr><td colspan="3">Dibayar</td><td class="n">${fmt(inv.paid)}</td></tr>
      <tr><td colspan="3"><b>Sisa</b></td><td class="n"><b>${fmt(rest)}</b></td></tr></table>
      ${inv.payments.length ? `<h3 class="mute small mt">Riwayat pembayaran</h3>${inv.payments.map(p => `<div class="it" style="cursor:default"><div class="main"><div class="t">${rp(p.amount)}</div><div class="s">${dt(p.date)} · ${esc(p.acc_name)}</div></div><button class="btn sec no-print" data-delpay="${p.id}" style="padding:4px 10px">Hapus</button></div>`).join('')}` : ''}
      ${inv.note ? `<div class="small mute mt">Catatan: ${esc(inv.note)}</div>` : ''}
      <div class="small mute mt">${esc(s.footer || '')}</div></div>
      <div class="row2 mt no-print">${rest > 0.004 ? `<button class="btn" data-pay>Catat pembayaran</button>` : '<span></span>'}<button class="btn sec" data-print>Cetak / PDF</button></div>
      <div class="row2 mt no-print"><button class="btn sec" data-share>Salin teks</button><button class="btn red" data-del>Hapus faktur</button></div>`;
    sheet((isSale ? 'Penjualan ' : 'Pembelian ') + inv.number, html, a => {
      const q = sel => a.body.querySelector(sel);
      if (q('[data-pay]')) q('[data-pay]').onclick = () => { a.close(); formPayment(inv); };
      q('[data-print]').onclick = () => { try { window.print(); } catch (e) { toast('Cetak tidak tersedia', true); } };
      q('[data-share]').onclick = async () => {
        const txt = [s.biz_name, (isSale ? 'FAKTUR ' : 'PEMBELIAN ') + inv.number, dt(inv.date), ''].concat(inv.items.map(i => `${i.name} ${i.qty} x ${fmt(i.price)} = ${fmt(i.qty * i.price)}`)).concat(['', 'Total: ' + rp(inv.total), 'Dibayar: ' + rp(inv.paid), 'Sisa: ' + rp(rest), '', s.footer || '']).join('\n');
        try { await navigator.clipboard.writeText(txt); toast('Teks disalin'); } catch (e) { toast('Gagal menyalin', true); }
      };
      q('[data-del]').onclick = async () => { if (await confirmBox('Hapus faktur ' + inv.number + '? Stok dan jurnal ikut dikembalikan.')) guard(async () => { await C.deleteInvoice(inv.id); a.close(); toast('Faktur dihapus'); reload(); }); };
      a.body.querySelectorAll('[data-delpay]').forEach(b => b.onclick = async () => { if (await confirmBox('Hapus pembayaran ini?')) guard(async () => { await C.deletePayment(+b.dataset.delpay); a.close(); toast('Pembayaran dihapus'); reload(); showInvoice(id); }); });
    });
  }
  async function formPayment(inv) {
    const cash = await cashAccounts();
    const rest = U.round(inv.total - inv.paid);
    sheet('Catat pembayaran', `<form>${money('amount', 'Nominal (sisa ' + rp(rest) + ')', rest)}${field('date', 'Tanggal', U.today(), 'date')}${select('account_id', inv.kind === 'sale' ? 'Diterima di' : 'Dibayar dari', accOpt(cash), (cash[0] || {}).id)}${field('note', 'Catatan', '')}<button class="btn block" type="submit">Simpan</button></form>`, a => {
      a.body.querySelector('form').onsubmit = e => { e.preventDefault(); guard(async () => { await C.addPayment(inv.id, formData(a.body)); a.close(); toast('Pembayaran dicatat'); reload(); }); };
    });
  }

  // ---------- jurnal manual ----------
  async function formJournal(id) {
    const accs = await C.listAccounts();
    let rec = { date: U.today(), memo: '', lines: [] };
    if (id) {
      const js = (await C.listJournals('0000-01-01', '9999-12-31')).find(j => j.id === id);
      if (js) rec = { date: js.date, memo: js.memo, lines: js.lines.map(l => ({ account_id: l.account_id, debit: l.debit, credit: l.credit })) };
    }
    if (!rec.lines.length) rec.lines = [{ account_id: '', debit: 0, credit: 0 }, { account_id: '', debit: 0, credit: 0 }];
    const rowHtml = l => `<div class="card" style="padding:10px"><select data-a><option value="">— pilih akun —</option>${accs.map(a => `<option value="${a.id}"${String(a.id) === String(l.account_id) ? ' selected' : ''}>${esc(a.code)} · ${esc(a.name)}</option>`).join('')}</select><div class="row2" style="margin-top:6px"><input data-d data-money placeholder="Debit" value="${l.debit ? fmt(l.debit) : ''}"><input data-c data-money placeholder="Kredit" value="${l.credit ? fmt(l.credit) : ''}"></div></div>`;
    sheet(id ? 'Ubah jurnal' : 'Jurnal umum', `<form>${field('date', 'Tanggal', rec.date, 'date')}${field('memo', 'Keterangan', rec.memo)}<div id="lines">${rec.lines.map(rowHtml).join('')}</div><button type="button" class="btn sec block" data-add>＋ Tambah baris</button><div class="card mt"><div class="row2"><span>Total debit</span><b class="right" id="td">0</b></div><div class="row2"><span>Total kredit</span><b class="right" id="tc">0</b></div></div><button class="btn block" type="submit">Simpan</button>${id ? '<button type="button" class="btn red block mt" data-del>Hapus jurnal</button>' : ''}</form>`, a => {
      const lines = a.body.querySelector('#lines');
      const read = () => Array.from(lines.children).map(r => ({ account_id: r.querySelector('[data-a]').value, debit: U.num(r.querySelector('[data-d]').value), credit: U.num(r.querySelector('[data-c]').value) }));
      const calc = () => { const l = read(); a.body.querySelector('#td').textContent = fmt(sumBy(l, x => x.debit)); a.body.querySelector('#tc').textContent = fmt(sumBy(l, x => x.credit)); };
      lines.addEventListener('input', calc);
      calc();
      a.body.querySelector('[data-add]').onclick = () => { const w = document.createElement('div'); w.innerHTML = rowHtml({}); lines.appendChild(w.firstChild); X.bindMoney(lines); };
      a.body.querySelector('form').onsubmit = e => { e.preventDefault(); const f = formData(a.body); guard(async () => { await C.saveManualJournal({ date: f.date, memo: f.memo, lines: read() }, id); a.close(); toast('Jurnal tersimpan'); reload(); }); };
      const del = a.body.querySelector('[data-del]');
      if (del) del.onclick = async () => { if (await confirmBox('Hapus jurnal ini?')) guard(async () => { await C.deleteJournal(id); a.close(); reload(); }); };
    });
  }

  // =====================================================================
  // KASIR (POS)
  // =====================================================================
  async function pageKasir() {
    const prods = await C.listProducts({ search: S.search });
    const inCart = id => (S.cart.find(c => c.id === id) || {}).qty || 0;
    const total = sumBy(S.cart, c => c.qty * c.price);
    const count = sumBy(S.cart, c => c.qty);
    return {
      title: 'Kasir',
      html: `<div class="bar"><input type="search" placeholder="Cari produk…" value="${esc(S.search)}" data-act="search"><button class="btn sec" data-act="quickitem">＋ Manual</button></div>
      <div class="pos">${prods.map(p => {
        const sold = !!p.track_stock && p.stock - inCart(p.id) <= 0 && S.settings.allow_negative_stock !== '1';
        return `<button class="p ${sold ? 'out' : ''}" data-act="addcart" data-id="${p.id}"><b>${esc(p.name)}</b><span>${rp(p.sell_price)}${p.track_stock ? ` · stok ${p.stock}` : ''}${inCart(p.id) ? ` · 🛒${inCart(p.id)}` : ''}</span></button>`;
      }).join('') || '<div class="empty" style="grid-column:1/-1">Belum ada produk. Tambahkan di Menu → Produk & Stok, atau pakai tombol “Manual”.</div>'}</div>
      ${S.cart.length ? `<div class="cartbar"><div class="tot"><div class="small mute">${count} item</div><b>${rp(total)}</b></div><button class="btn sec" data-act="cartview">Keranjang</button><button class="btn" data-act="checkout">Bayar</button></div>` : ''}`
    };
  }
  function cartView() {
    const html = () => `${S.cart.map((c, i) => `<div class="it" style="cursor:default"><div class="main"><div class="t">${esc(c.name)}</div><div class="s">${rp(c.price)}</div></div><div class="qty"><button data-m="${i}">−</button><b>${c.qty}</b><button data-p="${i}">＋</button></div></div>`).join('') || emptyMsg('Keranjang kosong')}<button class="btn sec block mt" data-clear>Kosongkan</button>`;
    sheet('Keranjang', html(), a => {
      const wire = () => {
        a.body.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { const c = S.cart[+b.dataset.m]; c.qty -= 1; if (c.qty <= 0) S.cart.splice(+b.dataset.m, 1); a.body.innerHTML = html(); wire(); reload(); });
        a.body.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { S.cart[+b.dataset.p].qty += 1; a.body.innerHTML = html(); wire(); reload(); });
        const cl = a.body.querySelector('[data-clear]'); if (cl) cl.onclick = () => { S.cart = []; a.close(); reload(); };
      };
      wire();
    });
  }
  async function checkout() {
    if (!S.cart.length) return;
    const cash = await cashAccounts();
    const total = sumBy(S.cart, c => c.qty * c.price);
    const pct = 0;
    sheet('Pembayaran', `<form><div class="hero" style="text-align:center"><div class="l">Total</div><div class="v" id="gt">${rp(total)}</div></div>${money('discount', 'Diskon (Rp)', 0)}${money('received', 'Uang diterima', total)}${select('pay_account_id', 'Diterima di', accOpt(cash), (cash[0] || {}).id)}${field('note', 'Catatan', '')}<div class="stat" style="margin-bottom:10px"><div class="l">Kembalian</div><div class="v" id="chg">${rp(0)}</div></div><button class="btn block" type="submit">Selesaikan transaksi</button></form>`, a => {
      const calc = () => { const f = formData(a.body); const t = Math.max(0, total - U.num(f.discount)); a.body.querySelector('#gt').textContent = rp(t); a.body.querySelector('#chg').textContent = rp(Math.max(0, U.num(f.received) - t)); };
      a.body.addEventListener('input', calc); calc();
      a.body.querySelector('form').onsubmit = e => {
        e.preventDefault();
        const f = formData(a.body);
        guard(async () => {
          const t = Math.max(0, total - Math.min(U.num(f.discount), total));
          if (U.num(f.received) < t) throw new Error('Uang diterima kurang dari total');
          const r = await C.createInvoice({ kind: 'sale', source: 'kasir', date: U.today(), items: S.cart.map(c => ({ product_id: c.id || null, name: c.name, qty: c.qty, price: c.price })), discount: f.discount, tax_pct: pct, pay_now: t, pay_account_id: +f.pay_account_id, note: f.note });
          S.cart = []; a.close(); toast('Transaksi ' + r.number + ' selesai'); await reload(); showInvoice(r.id);
        });
      };
    });
  }
  function quickItem() {
    sheet('Item manual', `<form>${field('name', 'Nama item', '')}${money('price', 'Harga', 0)}${field('qty', 'Jumlah', '1', 'text', 'inputmode="decimal"')}<button class="btn block" type="submit">Tambah ke keranjang</button></form>`, a => {
      a.body.querySelector('form').onsubmit = e => {
        e.preventDefault(); const f = formData(a.body);
        const qty = parseFloat(String(f.qty).replace(',', '.')) || 0;
        if (!f.name.trim() || qty <= 0) return toast('Isi nama dan jumlah', true);
        S.cart.push({ id: null, name: f.name.trim(), price: U.num(f.price), qty }); a.close(); reload();
      };
    });
  }

  // =====================================================================
  // LAPORAN
  // =====================================================================
  const REPORTS = {
    labarugi: { t: 'Laba Rugi', i: '📈', p: 'range' },
    neraca: { t: 'Neraca', i: '⚖️', p: 'asof' },
    aruskas: { t: 'Arus Kas', i: '💧', p: 'range' },
    neracasaldo: { t: 'Neraca Saldo', i: '🧮', p: 'asof' },
    bukubesar: { t: 'Buku Besar', i: '📒', p: 'ledger' },
    penjualan: { t: 'Penjualan', i: '🧾', p: 'range' },
    pembelian: { t: 'Pembelian', i: '📦', p: 'range' },
    labaproduk: { t: 'Laba per Produk', i: '🏷️', p: 'range' },
    piutang: { t: 'Piutang Pelanggan', i: '📥', p: 'asof' },
    hutang: { t: 'Hutang Pemasok', i: '📤', p: 'asof' },
    stok: { t: 'Nilai Persediaan', i: '🗃️', p: 'none' },
    kartustok: { t: 'Kartu Stok', i: '📋', p: 'stockcard' }
  };
  function pageReportHub() {
    return {
      title: 'Laporan', html: `<div class="menu">${Object.keys(REPORTS).map(k => `<a href="#/laporan/${k}"><span class="ic">${REPORTS[k].i}</span><span>${REPORTS[k].t}</span></a>`).join('')}</div>`
    };
  }
  const R = { from: U.monthStart(U.today()), to: U.monthEnd(U.today()), asof: U.today(), acc: 0, prod: 0 };
  const row = (a, b, cls) => `<tr class="${cls || ''}"><td>${a}</td><td class="n">${b}</td></tr>`;
  const accRows = list => list.map(a => row(esc(a.code) + ' ' + esc(a.name), fmt(a.amt))).join('');

  async function reportBody(key) {
    const rep = REPORTS[key];
    let html = '', csv = [];
    if (key === 'labarugi') {
      const r = await C.incomeStatement(R.from, R.to);
      html = `<table class="t">${row('Pendapatan', '', 'sec')}${accRows(r.revenue)}${row('Total pendapatan', fmt(r.revenueTotal), 'tot')}${row('Harga pokok penjualan', '', 'sec')}${accRows(r.hpp)}${row('Total HPP', fmt(r.hppTotal), 'tot')}${row('LABA KOTOR', fmt(r.grossProfit), 'tot')}${row('Beban operasional', '', 'sec')}${accRows(r.expense)}${row('Total beban', fmt(r.expenseTotal), 'tot')}${row('LABA BERSIH', fmt(r.netProfit), 'tot')}</table>`;
      csv = [['Laba Rugi', R.from, R.to], ['Pendapatan'], ...r.revenue.map(a => [a.name, a.amt]), ['Total pendapatan', r.revenueTotal], ['HPP'], ...r.hpp.map(a => [a.name, a.amt]), ['Laba kotor', r.grossProfit], ['Beban'], ...r.expense.map(a => [a.name, a.amt]), ['Total beban', r.expenseTotal], ['Laba bersih', r.netProfit]];
    } else if (key === 'neraca') {
      const r = await C.balanceSheet(R.asof);
      html = `<table class="t">${row('Aset', '', 'sec')}${accRows(r.assets)}${row('Total aset', fmt(r.assetTotal), 'tot')}${row('Kewajiban', '', 'sec')}${accRows(r.liabilities)}${row('Total kewajiban', fmt(r.liabilityTotal), 'tot')}${row('Ekuitas', '', 'sec')}${accRows(r.equity)}${row('Laba/rugi berjalan', fmt(r.profit))}${row('Total ekuitas', fmt(r.equityTotal), 'tot')}${row('Kewajiban + ekuitas', fmt(r.liabilityTotal + r.equityTotal), 'tot')}</table>${r.balanced ? '<p class="small in">✔ Neraca seimbang</p>' : '<p class="small out">⚠ Neraca belum seimbang — periksa jurnal manual</p>'}`;
      csv = [['Neraca', R.asof], ['Aset'], ...r.assets.map(a => [a.name, a.amt]), ['Total aset', r.assetTotal], ['Kewajiban'], ...r.liabilities.map(a => [a.name, a.amt]), ['Total kewajiban', r.liabilityTotal], ['Ekuitas'], ...r.equity.map(a => [a.name, a.amt]), ['Laba berjalan', r.profit], ['Total ekuitas', r.equityTotal]];
    } else if (key === 'aruskas') {
      const r = await C.cashFlow(R.from, R.to);
      html = `<table class="t">${row('Saldo kas awal', fmt(r.opening), 'sec')}${r.groups.map(g => row(esc(g.label), `<span class="in">+${fmt(g.inflow)}</span> <span class="out">-${fmt(g.outflow)}</span>`)).join('')}${row('Total masuk', fmt(r.inflow))}${row('Total keluar', fmt(r.outflow))}${row('Saldo kas akhir', fmt(r.closing), 'tot')}</table>`;
      csv = [['Arus Kas', R.from, R.to], ['Saldo awal', r.opening], ...r.groups.map(g => [g.label, g.inflow, -g.outflow]), ['Total masuk', r.inflow], ['Total keluar', r.outflow], ['Saldo akhir', r.closing]];
    } else if (key === 'neracasaldo') {
      const r = await C.trialBalance(R.asof);
      html = `<table class="t"><tr><th>Akun</th><th class="n">Debit</th><th class="n">Kredit</th></tr>${r.rows.map(a => `<tr><td>${esc(a.code)} ${esc(a.name)}</td><td class="n">${a.deb ? fmt(a.deb) : ''}</td><td class="n">${a.cre ? fmt(a.cre) : ''}</td></tr>`).join('')}<tr class="tot"><td>Total</td><td class="n">${fmt(r.debit)}</td><td class="n">${fmt(r.credit)}</td></tr></table>`;
      csv = [['Kode', 'Akun', 'Debit', 'Kredit'], ...r.rows.map(a => [a.code, a.name, a.deb, a.cre]), ['', 'Total', r.debit, r.credit]];
    } else if (key === 'bukubesar') {
      const accs = await C.listAccounts(true);
      if (!R.acc) R.acc = (accs.find(a => a.is_cash) || accs[0]).id;
      const r = await C.ledger(R.acc, R.from, R.to);
      html = `<table class="t"><tr><th>Tgl</th><th>Ket.</th><th class="n">D</th><th class="n">K</th><th class="n">Saldo</th></tr><tr><td colspan="4">Saldo awal</td><td class="n">${fmt(r.opening)}</td></tr>${r.rows.map(x => `<tr><td>${dt(x.date).slice(0, -5)}</td><td>${esc(x.memo)}</td><td class="n">${x.debit ? fmt(x.debit) : ''}</td><td class="n">${x.credit ? fmt(x.credit) : ''}</td><td class="n">${fmt(x.balance)}</td></tr>`).join('')}<tr class="tot"><td colspan="4">Saldo akhir</td><td class="n">${fmt(r.closing)}</td></tr></table>`;
      csv = [['Buku Besar', r.account.name, R.from, R.to], ['Tanggal', 'Keterangan', 'Debit', 'Kredit', 'Saldo'], ['', 'Saldo awal', '', '', r.opening], ...r.rows.map(x => [x.date, x.memo, x.debit, x.credit, x.balance]), ['', 'Saldo akhir', '', '', r.closing]];
    } else if (key === 'penjualan' || key === 'pembelian') {
      const kind = key === 'penjualan' ? 'sale' : 'purchase';
      const rows = await C.listInvoices(kind, R.from, R.to), byp = await C.salesByProduct(kind, R.from, R.to);
      html = `<div class="stat"><div class="l">Total (${rows.length} faktur)</div><div class="v">${rp(sumBy(rows, r => r.total))}</div></div><h3 class="mute small mt">Per faktur</h3><table class="t">${rows.map(r => `<tr><td>${dt(r.date).slice(0, -5)}<br><span class="small mute">${esc(r.number)}</span></td><td>${esc(r.contact_name || '-')}</td><td class="n">${fmt(r.total)}</td></tr>`).join('') || '<tr><td>Tidak ada data</td></tr>'}</table><h3 class="mute small mt">Per barang</h3><table class="t">${byp.map(p => `<tr><td>${esc(p.name)}</td><td class="n">${p.qty}</td><td class="n">${fmt(p.amount)}</td></tr>`).join('')}</table>`;
      csv = [['Laporan ' + key, R.from, R.to], ['Tanggal', 'Nomor', 'Kontak', 'Total', 'Dibayar'], ...rows.map(r => [r.date, r.number, r.contact_name, r.total, r.paid])];
    } else if (key === 'labaproduk') {
      const byp = await C.salesByProduct('sale', R.from, R.to);
      html = `<table class="t"><tr><th>Produk</th><th class="n">Jml</th><th class="n">Penjualan</th><th class="n">Laba</th></tr>${byp.map(p => `<tr><td>${esc(p.name)}</td><td class="n">${p.qty}</td><td class="n">${fmt(p.amount)}</td><td class="n">${fmt(p.profit)}</td></tr>`).join('')}<tr class="tot"><td>Total</td><td></td><td class="n">${fmt(sumBy(byp, p => p.amount))}</td><td class="n">${fmt(sumBy(byp, p => p.profit))}</td></tr></table><p class="hint">Laba dihitung dari harga jual dikurangi harga pokok rata-rata saat terjual (sebelum diskon & PPN faktur).</p>`;
      csv = [['Produk', 'Jumlah', 'Penjualan', 'HPP', 'Laba'], ...byp.map(p => [p.name, p.qty, p.amount, p.cost, p.profit])];
    } else if (key === 'piutang' || key === 'hutang') {
      const r = await C.receivablePayable(key === 'piutang' ? 'sale' : 'purchase', R.asof);
      html = `<div class="stat"><div class="l">Total belum dibayar</div><div class="v">${rp(r.total)}</div></div><div class="card list mt">${r.rows.map(x => `<div class="it" data-act="inv" data-id="${x.id}"><div class="main"><div class="t">${esc(x.contact_name || 'Umum')} · ${esc(x.number)}</div><div class="s">Jatuh tempo ${dt(x.due_date)}${x.overdue ? ` · <span class="out">telat ${x.overdue} hari</span>` : ''}</div></div><div class="amt">${rp(x.rest)}</div></div>`).join('') || emptyMsg('Tidak ada tagihan terbuka 🎉')}</div>`;
      csv = [['Nomor', 'Kontak', 'Tanggal', 'Jatuh tempo', 'Total', 'Dibayar', 'Sisa', 'Telat (hari)'], ...r.rows.map(x => [x.number, x.contact_name, x.date, x.due_date, x.total, x.paid, x.rest, x.overdue])];
    } else if (key === 'stok') {
      const r = await C.stockReport();
      html = `<div class="stat"><div class="l">Total nilai persediaan</div><div class="v">${rp(r.total)}</div></div><table class="t mt"><tr><th>Produk</th><th class="n">Stok</th><th class="n">HPP</th><th class="n">Nilai</th></tr>${r.rows.map(p => `<tr><td>${esc(p.name)}</td><td class="n">${p.stock} ${esc(p.unit)}</td><td class="n">${fmt(p.cost)}</td><td class="n">${fmt(p.value)}</td></tr>`).join('')}</table>`;
      csv = [['Produk', 'Stok', 'Satuan', 'HPP rata-rata', 'Nilai'], ...r.rows.map(p => [p.name, p.stock, p.unit, p.cost, p.value])];
    } else if (key === 'kartustok') {
      const ps = (await C.listProducts()).filter(p => p.track_stock);
      if (!ps.length) return { html: emptyMsg('Belum ada produk berstok'), csv: [] };
      if (!R.prod || !ps.find(p => p.id === +R.prod)) R.prod = ps[0].id;
      const r = await C.stockCard(+R.prod, R.from, R.to);
      html = `<table class="t"><tr><th>Tgl</th><th>Ket.</th><th class="n">+/-</th><th class="n">Saldo</th></tr><tr><td colspan="3">Saldo awal</td><td class="n">${r.opening}</td></tr>${r.rows.map(x => `<tr><td>${dt(x.date).slice(0, -5)}</td><td>${esc(x.note || x.ref_type)}</td><td class="n ${x.qty < 0 ? 'out' : 'in'}">${x.qty > 0 ? '+' : ''}${x.qty}</td><td class="n">${x.balance}</td></tr>`).join('')}<tr class="tot"><td colspan="3">Saldo akhir</td><td class="n">${r.closing}</td></tr></table>`;
      csv = [['Kartu stok', R.from, R.to], ['Tanggal', 'Keterangan', 'Qty', 'Saldo'], ...r.rows.map(x => [x.date, x.note, x.qty, x.balance])];
    }
    return { html, csv, rep };
  }
  async function pageReport(key) {
    const rep = REPORTS[key];
    if (!rep) return { title: 'Laporan', html: emptyMsg('Laporan tidak ditemukan') };
    let ctl = '';
    if (rep.p === 'range' || rep.p === 'ledger' || rep.p === 'stockcard') ctl += `<div class="row2 no-print">${field('from', 'Dari', R.from, 'date', 'data-rf')}${field('to', 'Sampai', R.to, 'date', 'data-rf')}</div>`;
    if (rep.p === 'asof') ctl += `<div class="no-print">${field('asof', 'Per tanggal', R.asof, 'date', 'data-rf')}</div>`;
    if (rep.p === 'ledger') ctl += `<div class="no-print">${select('acc', 'Akun', accOpt(await C.listAccounts(true)), R.acc || (await C.listAccounts(true)).find(a => a.is_cash).id, 'data-rf')}</div>`;
    if (rep.p === 'stockcard') ctl += `<div class="no-print">${select('prod', 'Produk', opt((await C.listProducts()).filter(p => p.track_stock), 'id', 'name'), R.prod, 'data-rf')}</div>`;
    const b = await reportBody(key);
    S.lastCsv = { name: key, rows: b.csv };
    return {
      title: rep.t, back: '/laporan',
      html: `${ctl}<div class="card" id="reportbox"><div class="small mute" style="margin-bottom:6px">${esc(S.settings.biz_name)}</div>${b.html}</div><div class="row2 no-print"><button class="btn sec" data-act="csv">Ekspor CSV</button><button class="btn sec" data-act="print">Cetak / PDF</button></div>`
    };
  }

  // =====================================================================
  // MENU & MASTER DATA
  // =====================================================================
  function pageMenu() {
    const items = [['👥', 'Kontak', 'Pelanggan & pemasok', '/kontak'], ['📦', 'Produk & Stok', 'Harga, stok, penyesuaian', '/produk'], ['📚', 'Daftar Akun', 'Bagan akun & saldo awal', '/akun'], ['🏗️', 'Aset Tetap', 'Penyusutan bulanan', '/aset'], ['⚙️', 'Pengaturan', 'Usaha, PPN, PIN', '/pengaturan'], ['💾', 'Backup & Restore', 'Simpan / pulihkan data', '/backup'], ['ℹ️', 'Tentang', 'BukuKas 1.0', '/tentang']];
    return { title: 'Menu', html: `<div class="menu">${items.map(i => `<a href="#${i[3]}"><span class="ic">${i[0]}</span><span>${i[1]}<small>${i[2]}</small></span></a>`).join('')}</div>` };
  }

  async function pageContacts() {
    const rows = await C.listContacts();
    const tl = { customer: 'Pelanggan', supplier: 'Pemasok', both: 'Pelanggan & pemasok' };
    return { title: 'Kontak', back: '/menu', html: `<div class="card list">${rows.map(c => `<div class="it" data-act="contact" data-id="${c.id}"><div class="main"><div class="t">${esc(c.name)}</div><div class="s">${tl[c.type]}${c.phone ? ' · ' + esc(c.phone) : ''}</div></div></div>`).join('') || emptyMsg('Belum ada kontak')}</div><button class="fab" data-act="contact" aria-label="Tambah">＋</button>` };
  }
  async function formContact(id) {
    const c = id ? (await G.RPC.q('SELECT * FROM contacts WHERE id=?', [id]))[0] : { type: 'customer' };
    sheet(id ? 'Ubah kontak' : 'Kontak baru', `<form>${field('name', 'Nama', c.name)}${select('type', 'Jenis', [{ v: 'customer', t: 'Pelanggan' }, { v: 'supplier', t: 'Pemasok' }, { v: 'both', t: 'Keduanya' }], c.type)}${field('phone', 'Telepon', c.phone)}${field('email', 'Email', c.email)}${field('address', 'Alamat', c.address)}<button class="btn block" type="submit">Simpan</button>${id ? '<button type="button" class="btn red block mt" data-del>Hapus</button>' : ''}</form>`, a => {
      a.body.querySelector('form').onsubmit = e => { e.preventDefault(); guard(async () => { await C.saveContact(Object.assign({ id }, formData(a.body))); a.close(); toast('Tersimpan'); reload(); }); };
      const d = a.body.querySelector('[data-del]');
      if (d) d.onclick = async () => { if (await confirmBox('Hapus kontak ini?')) guard(async () => { const r = await C.deleteContact(id); a.close(); toast(r === 'nonaktif' ? 'Kontak punya transaksi, dinonaktifkan' : 'Dihapus'); reload(); }); };
    });
  }

  async function pageProducts() {
    const rows = await C.listProducts({ search: S.search });
    return { title: 'Produk & Stok', back: '/menu', html: `<div class="bar"><input type="search" placeholder="Cari produk…" value="${esc(S.search)}" data-act="search"></div><div class="card list">${rows.map(p => `<div class="it" data-act="prod" data-id="${p.id}"><div class="main"><div class="t">${esc(p.name)}</div><div class="s">${p.sku ? esc(p.sku) + ' · ' : ''}Jual ${rp(p.sell_price)}${p.track_stock ? ` · HPP ${rp(p.cost)}` : ''}</div></div><div class="amt ${p.track_stock && p.min_stock > 0 && p.stock <= p.min_stock ? 'out' : ''}">${p.track_stock ? p.stock + ' ' + esc(p.unit) : 'Jasa'}</div></div>`).join('') || emptyMsg('Belum ada produk')}</div><button class="fab" data-act="prod" aria-label="Tambah">＋</button>` };
  }
  async function formProduct(id) {
    const p = id ? (await G.RPC.q('SELECT * FROM products WHERE id=?', [id]))[0] : { unit: 'pcs', track_stock: 1 };
    sheet(id ? 'Ubah produk' : 'Produk baru', `<form>${field('name', 'Nama produk / jasa', p.name)}<div class="row2">${field('sku', 'Kode / SKU', p.sku)}${field('unit', 'Satuan', p.unit)}</div><div class="row2">${money('buy_price', 'Harga beli', p.buy_price)}${money('sell_price', 'Harga jual', p.sell_price)}</div>
      <label class="f"><input type="checkbox" name="track_stock" style="width:auto" ${p.track_stock ? 'checked' : ''}> Lacak stok (hilangkan centang untuk jasa)</label>
      <div class="row2">${field('min_stock', 'Stok minimum', p.min_stock || 0, 'text', 'inputmode="decimal"')}${id ? '<span></span>' : field('opening_qty', 'Stok awal', 0, 'text', 'inputmode="decimal"')}</div>
      <button class="btn block" type="submit">Simpan</button>${id ? '<div class="row2 mt"><button type="button" class="btn sec" data-adj>Sesuaikan stok</button><button type="button" class="btn red" data-del>Hapus</button></div>' : ''}</form>`, a => {
      a.body.querySelector('form').onsubmit = e => {
        e.preventDefault(); const f = formData(a.body);
        const dec = v => parseFloat(String(v).replace(',', '.')) || 0;
        guard(async () => { await C.saveProduct({ id, name: f.name, sku: f.sku, unit: f.unit, buy_price: f.buy_price, sell_price: f.sell_price, track_stock: f.track_stock, min_stock: dec(f.min_stock), opening_qty: dec(f.opening_qty) }); a.close(); toast('Tersimpan'); reload(); });
      };
      const adj = a.body.querySelector('[data-adj]');
      if (adj) adj.onclick = () => { a.close(); formAdjust(p); };
      const d = a.body.querySelector('[data-del]');
      if (d) d.onclick = async () => { if (await confirmBox('Hapus produk ini?')) guard(async () => { const r = await C.deleteProduct(id); a.close(); toast(r === 'nonaktif' ? 'Produk punya riwayat, dinonaktifkan' : 'Dihapus'); reload(); }); };
    });
  }
  function formAdjust(p) {
    sheet('Sesuaikan stok · ' + p.name, `<form><div class="hint">Stok saat ini: ${p.stock} ${esc(p.unit)}. Isi stok sebenarnya hasil hitung (stok opname).</div>${field('real', 'Stok sebenarnya', p.stock, 'text', 'inputmode="decimal"')}${field('date', 'Tanggal', U.today(), 'date')}${field('note', 'Alasan', 'Stok opname')}<button class="btn block" type="submit">Simpan penyesuaian</button></form>`, a => {
      a.body.querySelector('form').onsubmit = e => {
        e.preventDefault(); const f = formData(a.body);
        const real = parseFloat(String(f.real).replace(',', '.'));
        if (isNaN(real) || real < 0) return toast('Stok tidak valid', true);
        const diff = real - p.stock;
        if (!diff) return toast('Tidak ada selisih');
        guard(async () => { await C.adjustStock(p.id, diff, f.date, f.note, p.cost); a.close(); toast('Stok disesuaikan'); reload(); });
      };
    });
  }

  async function pageAccounts() {
    const rows = await C.listAccounts(true);
    const op = await C.getOpeningBalances();
    const out = Object.keys(C.TYPE_LABEL).map(t => {
      const l = rows.filter(a => a.type === t);
      return `<div class="card"><h3>${C.TYPE_LABEL[t]}</h3><div class="list">${l.map(a => `<div class="it" data-act="acc" data-id="${a.id}"><div class="main"><div class="t">${esc(a.code)} · ${esc(a.name)} ${a.active ? '' : '<span class="badge red">nonaktif</span>'}</div><div class="s">${a.is_cash ? 'Akun kas/bank · ' : ''}saldo normal ${a.normal === 'D' ? 'debit' : 'kredit'}</div></div><div class="amt mute small">${op[a.id] ? 'Awal ' + fmt(op[a.id]) : ''}</div></div>`).join('')}</div></div>`;
    }).join('');
    return { title: 'Daftar Akun', back: '/menu', html: `<div class="hint">Ketuk akun untuk mengubah, mengisi saldo awal, atau menonaktifkan.</div>${out}<button class="fab" data-act="acc" aria-label="Tambah">＋</button>` };
  }
  async function formAccount(id) {
    const all = await C.listAccounts(true);
    const a0 = id ? all.find(a => a.id === id) : { type: 'beban', is_cash: 0, active: 1 };
    const op = id ? (await C.getOpeningBalances())[id] || 0 : 0;
    sheet(id ? 'Ubah akun' : 'Akun baru', `<form>${field('code', 'Kode', a0.code)}${field('name', 'Nama akun', a0.name)}${select('type', 'Tipe', Object.keys(C.TYPE_LABEL).map(t => ({ v: t, t: C.TYPE_LABEL[t] })), a0.type)}<label class="f"><input type="checkbox" name="is_cash" style="width:auto" ${a0.is_cash ? 'checked' : ''}> Akun kas / bank (muncul di pilihan pembayaran)</label>${id ? `<label class="f"><input type="checkbox" name="active" style="width:auto" ${a0.active ? 'checked' : ''}> Aktif</label>${money('opening', 'Saldo awal (sisi normal akun)', op)}${field('opening_date', 'Tanggal saldo awal', U.monthStart(U.today()), 'date')}` : ''}<button class="btn block" type="submit">Simpan</button>${id && !a0.system ? '<button type="button" class="btn red block mt" data-del>Hapus akun</button>' : ''}</form>`, a => {
      a.body.querySelector('form').onsubmit = e => {
        e.preventDefault(); const f = formData(a.body);
        guard(async () => {
          await C.saveAccount({ id, code: f.code, name: f.name, type: f.type, is_cash: f.is_cash, active: id ? (f.active ? 1 : 0) : 1, normal: id ? a0.normal : undefined });
          if (id && U.num(f.opening) !== op) await C.setOpeningBalance(id, U.num(f.opening), f.opening_date);
          a.close(); toast('Tersimpan'); reload();
        });
      };
      const d = a.body.querySelector('[data-del]');
      if (d) d.onclick = async () => { if (await confirmBox('Hapus akun ini?')) guard(async () => { await C.deleteAccount(id); a.close(); reload(); }); };
    });
  }

  async function pageAssets() {
    const rows = await C.listAssets();
    return { title: 'Aset Tetap', back: '/menu', html: `<div class="card"><div class="small mute">Catat pembelian aset lewat Pengeluaran (kategori “Peralatan & Aset Tetap”), lalu daftarkan di sini untuk penyusutan garis lurus.</div><button class="btn block mt" data-act="dep">Susutkan bulan ini</button></div><div class="card list">${rows.map(a => `<div class="it" data-act="asset" data-id="${a.id}"><div class="main"><div class="t">${esc(a.name)}</div><div class="s">${dt(a.date)} · ${a.months_done}/${a.life_months} bln · ${rp(a.monthly)}/bln</div></div><div class="amt">${rp(a.book)}</div></div>`).join('') || emptyMsg('Belum ada aset')}</div><button class="fab" data-act="asset" aria-label="Tambah">＋</button>` };
  }
  async function formAsset(id) {
    const a0 = id ? (await C.listAssets()).find(a => a.id === id) : { date: U.today(), life_months: 48, residual: 0 };
    sheet(id ? 'Ubah aset' : 'Aset baru', `<form>${field('name', 'Nama aset', a0.name)}${field('date', 'Tanggal perolehan', a0.date, 'date')}${money('cost', 'Harga perolehan', a0.cost)}${money('residual', 'Nilai sisa', a0.residual)}${field('life_months', 'Umur ekonomis (bulan)', a0.life_months, 'text', 'inputmode="numeric"')}<button class="btn block" type="submit">Simpan</button>${id ? '<button type="button" class="btn red block mt" data-del>Hapus aset</button>' : ''}</form>`, a => {
      a.body.querySelector('form').onsubmit = e => { e.preventDefault(); guard(async () => { await C.saveAsset(Object.assign({ id }, formData(a.body))); a.close(); toast('Tersimpan'); reload(); }); };
      const d = a.body.querySelector('[data-del]');
      if (d) d.onclick = async () => { if (await confirmBox('Hapus aset beserta jurnal penyusutannya?')) guard(async () => { await C.deleteAsset(id); a.close(); reload(); }); };
    });
  }

  async function pageSettings() {
    const s = S.settings;
    return {
      title: 'Pengaturan', back: '/menu', html: `<form class="card" id="setform">${field('biz_name', 'Nama usaha', s.biz_name)}${field('biz_address', 'Alamat', s.biz_address)}${field('biz_phone', 'Telepon', s.biz_phone)}<div class="row2">${field('tax_pct', 'PPN bawaan (%)', s.tax_pct, 'text', 'inputmode="decimal"')}${field('currency', 'Simbol mata uang', s.currency)}</div>${field('footer', 'Teks kaki struk/faktur', s.footer)}
      <label class="f"><input type="checkbox" name="allow_negative_stock" style="width:auto" ${s.allow_negative_stock === '1' ? 'checked' : ''}> Izinkan stok minus saat menjual</label>
      <button class="btn block" type="submit">Simpan pengaturan</button></form>
      <div class="card"><h3>Kunci aplikasi (PIN)</h3><div class="hint">PIN hanya mengunci tampilan aplikasi di perangkat ini; data tidak dienkripsi.</div><div class="row2"><input id="pin" inputmode="numeric" maxlength="8" placeholder="PIN baru (4-8 angka)"><button class="btn sec" data-act="setpin">${s.pin ? 'Ganti PIN' : 'Aktifkan'}</button></div>${s.pin ? '<button class="btn red block mt" data-act="nopin">Matikan PIN</button>' : ''}</div>`
    };
  }

  async function pageBackup() {
    return {
      title: 'Backup & Restore', back: '/menu', html: `<div class="card"><h3>Backup data</h3><div class="hint">Backup berisi seluruh data (transaksi, produk, akun, pengaturan) dalam satu berkas JSON. Berkas disimpan di folder data aplikasi, disalin ke clipboard, dan dicoba diunduh. Simpan salinannya di tempat aman (mis. tempel ke catatan/WhatsApp ke diri sendiri).</div><button class="btn block" data-act="backup">Buat backup sekarang</button></div>
      <div class="card"><h3>Restore dari backup</h3><div class="hint">⚠️ Restore menimpa semua data saat ini.</div><input type="file" id="bkfile" accept=".json,application/json"><div class="mt"><textarea id="bktext" rows="4" placeholder="…atau tempel isi backup di sini"></textarea></div><button class="btn red block mt" data-act="restore">Restore</button></div>
      <div class="card"><h3>Hapus semua data</h3><div class="hint">Menghapus transaksi, produk, kontak, dan akun tambahan. Pengaturan & akun bawaan tetap.</div><button class="btn red block" data-act="reset">Hapus semua data</button></div>`
    };
  }
  function pageAbout() {
    return { title: 'Tentang', back: '/menu', html: `<div class="card"><h3>BukuKas 1.0</h3><p>Aplikasi pembukuan & kasir untuk usaha kecil. Bekerja <b>sepenuhnya offline</b>, data tersimpan di perangkat Anda (SQLite), tanpa langganan dan tanpa akun.</p><p class="small mute">Dibangun dengan Rust (Tauri) + SQLite. Pencatatan memakai sistem jurnal berpasangan sehingga Neraca dan Laba Rugi selalu konsisten.</p></div>` };
  }

  // =====================================================================
  // AKSI (delegasi klik)
  // =====================================================================
  async function act(el, e) {
    const a = el.dataset.act, id = el.dataset.id ? +el.dataset.id : null;
    switch (a) {
      case 'mprev': S.month = U.addMonths(S.month, -1); return reload();
      case 'mnext': S.month = U.addMonths(S.month, 1); return reload();
      case 'tab': S.tab = el.dataset.tab; S.search = ''; S.status = ''; return reload();
      case 'goto': location.hash = '#' + el.dataset.to; return;
      case 'newcash': return formCash(null, el.dataset.type);
      case 'cash': return formCash(id);
      case 'newinv': return formInvoice(el.dataset.kind === 'purchase' ? 'purchase' : 'sale');
      case 'inv': return showInvoice(id);
      case 'newjrn': return formJournal();
      case 'jrn': return formJournal(id);
      case 'prod': return formProduct(id);
      case 'contact': return formContact(id);
      case 'acc': return formAccount(id);
      case 'asset': return formAsset(id);
      case 'addcart': {
        const p = (await C.listProducts()).find(x => x.id === id);
        if (!p) return;
        const ex = S.cart.find(c => c.id === id);
        if (p.track_stock && S.settings.allow_negative_stock !== '1' && p.stock - ((ex && ex.qty) || 0) <= 0) return toast('Stok habis', true);
        if (ex) ex.qty += 1; else S.cart.push({ id: p.id, name: p.name, price: p.sell_price, qty: 1 });
        return reload();
      }
      case 'cartview': return cartView();
      case 'checkout': return checkout();
      case 'quickitem': return quickItem();
      case 'csv': {
        const r = S.lastCsv; if (!r) return;
        const res = await X.saveText('bukukas-' + r.name + '-' + U.today() + '.csv', X.toCsv(r.rows), 'text/csv');
        return toast(res.path ? 'CSV disimpan: ' + res.path : (res.copied ? 'CSV disalin ke clipboard' : 'CSV dibuat'));
      }
      case 'print': try { window.print(); } catch (x) { toast('Cetak tidak tersedia', true); } return;
      case 'dep': return guard(async () => { const r = await C.postDepreciation(U.today().slice(0, 7)); toast(r.count ? `Penyusutan ${r.count} aset: ${rp(r.total)}` : 'Tidak ada penyusutan baru bulan ini'); reload(); });
      case 'backup': return guard(async () => { const json = await C.exportBackup(); const res = await X.saveText('bukukas-backup-' + U.today() + '.json', json, 'application/json'); toast(res.path ? 'Backup: ' + res.path : (res.copied ? 'Backup disalin ke clipboard' : 'Backup dibuat')); });
      case 'restore': return guard(async () => {
        let txt = (document.getElementById('bktext') || {}).value || '';
        const f = document.getElementById('bkfile') && document.getElementById('bkfile').files[0];
        if (f) txt = await f.text();
        if (!txt.trim()) throw new Error('Pilih berkas atau tempel isi backup dulu');
        if (!(await confirmBox('Semua data saat ini akan diganti dengan isi backup. Lanjutkan?', 'Restore'))) return;
        await C.restoreBackup(txt); S.settings = await C.getSettings(); X.setCurrency(S.settings.currency); toast('Data dipulihkan'); location.hash = '#/';
      });
      case 'reset': return guard(async () => { if (await confirmBox('Hapus SEMUA data transaksi, produk dan kontak? Tidak bisa dibatalkan (buat backup dulu).', 'Hapus semua')) { await C.resetAll(); toast('Data dihapus'); location.hash = '#/'; } });
      case 'setpin': return guard(async () => { const v = (document.getElementById('pin').value || '').trim(); if (!/^\d{4,8}$/.test(v)) throw new Error('PIN harus 4-8 angka'); await C.setSettings({ pin: G.App.hashPin(v) }); S.settings = await C.getSettings(); toast('PIN aktif'); reload(); });
      case 'nopin': return guard(async () => { await C.setSettings({ pin: '' }); S.settings = await C.getSettings(); toast('PIN dimatikan'); reload(); });
    }
  }
  function onInput(el) {
    if (el.dataset.act === 'search') { S.search = el.value; clearTimeout(onInput.t); onInput.t = setTimeout(async () => { const pos = el.selectionStart; await reload(); const n = document.querySelector('input[data-act=search]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* ok */ } } }, 250); }
  }
  async function onChange(el) {
    if (el.dataset.act === 'status') { S.status = el.value; return reload(); }
    if (el.hasAttribute('data-rf')) { R[el.name] = el.value; return reload(); }
  }
  async function saveSettingsForm(form) {
    const f = formData(form);
    await C.setSettings({ biz_name: f.biz_name, biz_address: f.biz_address, biz_phone: f.biz_phone, tax_pct: String(parseFloat(String(f.tax_pct).replace(',', '.')) || 0), currency: f.currency || 'Rp', footer: f.footer, allow_negative_stock: f.allow_negative_stock ? '1' : '0' });
    S.settings = await C.getSettings(); X.setCurrency(S.settings.currency); toast('Pengaturan disimpan'); reload();
  }

  G.Pages = { S: S, pageHome, pageTrans, pageKasir, pageReportHub, pageReport, pageMenu, pageContacts, pageProducts, pageAccounts, pageAssets, pageSettings, pageBackup, pageAbout, act, onInput, onChange, saveSettingsForm, REPORTS };
})(typeof globalThis !== 'undefined' ? globalThis : window);
