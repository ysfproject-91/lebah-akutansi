// Tes asap UI: memuat index.html di jsdom dengan database SQLite sungguhan, lalu menjelajah semua halaman & formulir.
const path = require('path');
const { JSDOM } = require(process.env.JSDOM_PATH);
const fs = require('fs');
const makeRpc = require('./sqlite-rpc');
const root = path.join(__dirname, '..', 'dist');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script src=.*?<\/script>/g, '');
const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
w.RPC = makeRpc(); w.__NO_AUTOSTART__ = true;
w.print = () => {}; w.scrollTo = () => {};
const errors = [];
w.addEventListener('error', e => errors.push(e.message));
w.console.error = (...a) => errors.push(a.join(' '));
for (const f of ['rpc.js', 'core.js', 'ui.js', 'pages.js', 'app.js']) w.eval(fs.readFileSync(path.join(root, 'js', f), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = s => w.document.querySelector(s), $$ = s => Array.from(w.document.querySelectorAll(s));
let fails = 0;
const check = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const go = async h => { w.location.hash = h; await sleep(150); };
const click = async el => { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await sleep(120); };
const setv = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
const toastText = () => $$('.toast').map(t => t.textContent).join('|');

(async () => {
  await w.App.start();
  await sleep(200);
  check($('#view').textContent.includes('Total kas'), 'beranda tampil');

  // semua halaman utama tanpa error
  for (const r of ['/', '/transaksi', '/kasir', '/laporan', '/menu', '/kontak', '/produk', '/akun', '/aset', '/pengaturan', '/backup', '/tentang']) {
    await go('#' + r);
    check(!$('#view').textContent.includes('Terjadi kesalahan'), 'halaman ' + r);
  }
  for (const k of Object.keys(w.Pages.REPORTS)) {
    await go('#/laporan/' + k);
    check(!$('#view').textContent.includes('Terjadi kesalahan') && $('#reportbox'), 'laporan ' + k);
  }

  // saldo awal lewat form akun
  await go('#/akun');
  await click($$('[data-act=acc]').find(e => e.textContent.includes('1-1100')));
  setv($('.sheet [name=opening]'), '2000000');
  $('.sheet form').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
  await sleep(250);
  check(toastText().includes('Tersimpan'), 'saldo awal tersimpan');

  // produk baru
  await go('#/produk');
  await click($('[data-act=prod].fab'));
  const f = $('.sheet form');
  setv(f.querySelector('[name=name]'), 'Teh Botol'); setv(f.querySelector('[name=buy_price]'), '3000'); setv(f.querySelector('[name=sell_price]'), '5000'); setv(f.querySelector('[name=opening_qty]'), '20');
  f.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true })); await sleep(300);
  check($('#view').textContent.includes('Teh Botol') && $('#view').textContent.includes('20 pcs'), 'produk + stok awal');

  // kas masuk
  await go('#/transaksi'); await click($('.fab'));
  setv($('.sheet [name=amount]'), '150000'); setv($('.sheet [name=note]'), 'Modal tambahan');
  $('.sheet form').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true })); await sleep(300);
  check($('#view').textContent.includes('Modal tambahan'), 'kas masuk tersimpan');

  // ganti ke pengeluaran lewat tab di formulir
  await click($('.fab')); await click($$('.sheet [data-t]').find(b => b.dataset.t === 'out'));
  check($('.sheet [name=category_id]'), 'tab form kas pindah ke pengeluaran');
  $('.sheet [data-close]').click();

  // penjualan lewat faktur
  await click($$('.tabs button').find(b => b.dataset.tab === 'sale')); await click($('.fab'));
  const sel = $('.sheet [data-p]'); setv(sel, sel.options[1].value);
  setv($('.sheet [data-q]'), '3');
  check($('.sheet #vTot').textContent.includes('15.000'), 'total faktur dihitung live: ' + $('.sheet #vTot').textContent);
  setv($('.sheet [name=pay_now]'), '5000');
  $('.sheet form').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true })); await sleep(350);
  check($('#view').textContent.includes('PJ-'), 'faktur penjualan muncul');
  await click($('[data-act=inv]')); // detail
  check($('.sheet').textContent.includes('Sisa'), 'detail faktur');
  await click($('.sheet [data-pay]'));
  $('.sheet form').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true })); await sleep(300);
  check(toastText().includes('Pembayaran dicatat'), 'pelunasan');

  // kasir
  await go('#/kasir');
  await click($('[data-act=addcart]')); await click($('[data-act=addcart]'));
  check($('.cartbar'), 'keranjang muncul');
  await click($('[data-act=checkout]'));
  $('.sheet form').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true })); await sleep(400);
  check(toastText().includes('selesai'), 'checkout kasir: ' + toastText());
  $$('.overlay').forEach(o => o.remove());

  // jurnal manual
  await go('#/transaksi'); await click($$('.tabs button').find(b => b.dataset.tab === 'jurnal')); await click($('.fab'));
  const accs = $$('.sheet [data-a]'); const ds = $$('.sheet [data-d]'), cs = $$('.sheet [data-c]');
  setv(accs[0], accs[0].options[1].value); setv(accs[1], accs[1].options[2].value);
  setv(ds[0], '1000'); setv(cs[1], '1000');
  $('.sheet form').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true })); await sleep(300);
  check(toastText().includes('Jurnal tersimpan'), 'jurnal manual');

  // pengaturan + PIN
  await go('#/pengaturan');
  setv($('#setform [name=biz_name]'), 'Warung Uji');
  $('#setform').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true })); await sleep(300);
  check($('#title').textContent === 'Pengaturan' && w.Pages.S.settings.biz_name === 'Warung Uji', 'simpan pengaturan');

  // backup (clipboard tidak ada di jsdom -> tetap tidak error)
  await go('#/backup'); await click($('[data-act=backup]'));
  check(!toastText().includes('undefined'), 'backup berjalan');

  // neraca seimbang pada akhirnya
  const bs = await w.Core.balanceSheet(w.Core.util.today());
  check(bs.balanced, 'neraca seimbang setelah semua aksi');

  const real = errors.filter(e => !/Not implemented|navigation|clipboard|createObjectURL/i.test(e));
  if (real.length) { fails++; console.log('Error JS:', real.slice(0, 5)); }
  console.log(fails ? `\n${fails} GAGAL` : '\nSemua tes UI lolos');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('CRASH', e); process.exit(1); });
