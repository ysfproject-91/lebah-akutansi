// Router, kunci PIN, dan inisialisasi aplikasi.
(function (G) {
  'use strict';
  var C = G.Core, X = G.UI, P = G.Pages;
  var $ = function (s) { return document.querySelector(s); };

  function hashPin(pin) {
    // Pengunci tampilan saja (bukan enkripsi): hash sederhana dengan garam.
    var s = 'bukukas|' + pin + '|v1', h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return 'h' + h.toString(16);
  }

  var routes = {
    '': function () { return P.pageHome(); },
    '/': function () { return P.pageHome(); },
    '/transaksi': function () { return P.pageTrans(); },
    '/kasir': function () { return P.pageKasir(); },
    '/laporan': function () { return P.pageReportHub(); },
    '/menu': function () { return P.pageMenu(); },
    '/kontak': function () { return P.pageContacts(); },
    '/produk': function () { return P.pageProducts(); },
    '/akun': function () { return P.pageAccounts(); },
    '/aset': function () { return P.pageAssets(); },
    '/pengaturan': function () { return P.pageSettings(); },
    '/backup': function () { return P.pageBackup(); },
    '/tentang': function () { return P.pageAbout(); }
  };

  var seq = 0;
  async function render() {
    var my = ++seq;
    var path = (location.hash || '#/').slice(1) || '/';
    var page;
    try {
      var m = path.match(/^\/laporan\/(\w+)$/);
      if (m) page = await P.pageReport(m[1]);
      else if (routes[path]) page = await routes[path]();
      else page = await routes['/']();
    } catch (e) {
      page = { title: 'Terjadi kesalahan', html: '<div class="card"><p>' + X.esc(X.errMsg(e)) + '</p><button class="btn" onclick="location.hash=\'#/\'">Ke beranda</button></div>' };
      console.error(e);
    }
    if (my !== seq) return; // render yang lebih baru sudah berjalan
    var view = $('#view');
    var st = view.scrollTop, y = window.scrollY;
    view.innerHTML = page.html;
    X.bindMoney(view);
    $('#title').textContent = page.title || 'BukuKas';
    var back = $('#btnBack');
    back.style.display = page.back ? '' : 'none';
    back.onclick = function () { location.hash = '#' + page.back; };
    var base = '/' + (path.split('/')[1] || '');
    document.querySelectorAll('#nav a').forEach(function (a) {
      var r = a.dataset.r;
      var on = (r === 'home' && (base === '/' || base === '')) || (base === '/' + r) ||
        (r === 'menu' && ['/kontak', '/produk', '/akun', '/aset', '/pengaturan', '/backup', '/tentang'].indexOf(base) >= 0);
      a.classList.toggle('on', on);
    });
    var form = $('#setform');
    if (form) form.onsubmit = function (e) { e.preventDefault(); X.guard(function () { return P.saveSettingsForm(form); }); };
    window.scrollTo(0, y);
  }

  function showLock(pinHash) {
    return new Promise(function (resolve) {
      var el = document.createElement('div');
      el.className = 'lock';
      el.innerHTML = '<div style="font-size:44px">🔒</div><div style="font-size:18px;font-weight:650">BukuKas terkunci</div><input type="password" inputmode="numeric" maxlength="8" id="lockpin" placeholder="PIN" autocomplete="off"><div id="lockerr" style="min-height:20px"></div>';
      document.body.appendChild(el);
      var inp = el.querySelector('#lockpin');
      inp.focus();
      inp.addEventListener('input', function () {
        if (hashPin(inp.value) === pinHash) { el.remove(); resolve(); }
        else if (inp.value.length >= 8) { el.querySelector('#lockerr').textContent = 'PIN salah'; inp.value = ''; }
      });
    });
  }

  async function start() {
    try {
      await C.init();
      P.S.settings = await C.getSettings();
      X.setCurrency(P.S.settings.currency);
    } catch (e) {
      $('#view').innerHTML = '<div class="card"><h3>Gagal membuka database</h3><p>' + X.esc(X.errMsg(e)) + '</p></div>';
      console.error(e);
      return;
    }
    if (P.S.settings.pin) await showLock(P.S.settings.pin);

    document.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!t) return;
      if (t.tagName === 'INPUT' || t.tagName === 'SELECT') return;
      e.preventDefault();
      X.guard(function () { return P.act(t, e); });
    });
    document.addEventListener('input', function (e) { if (e.target.dataset && e.target.dataset.act) P.onInput(e.target); });
    document.addEventListener('change', function (e) { if (e.target.dataset && (e.target.dataset.act || e.target.hasAttribute('data-rf'))) X.guard(function () { return P.onChange(e.target); }); });
    window.addEventListener('hashchange', function () { P.S.search = ''; P.S.status = ''; render(); });
    G.App = { render: render, hashPin: hashPin };
    await render();
  }

  G.App = { render: render, hashPin: hashPin, start: start };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else if (!G.__NO_AUTOSTART__) start();
})(typeof globalThis !== 'undefined' ? globalThis : window);
