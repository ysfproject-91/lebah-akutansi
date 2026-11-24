// Pembantu antarmuka: format, dialog, toast, input uang.
(function (G) {
  'use strict';
  var U = G.Core.util;
  var cur = 'Rp';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) {
    n = Number(n) || 0;
    var neg = n < 0; n = Math.abs(n);
    var s = (Math.round(n * 100) / 100).toString();
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + parts[0] + (parts[1] ? ',' + (parts[1] + '0').slice(0, 2) : '');
  }
  function rp(n) {
    n = Number(n) || 0;
    return (n < 0 ? '-' : '') + cur + ' ' + fmt(Math.abs(n));
  }
  var MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  function dt(d) {
    if (!d) return '';
    return parseInt(d.slice(8, 10), 10) + ' ' + MONTHS[+d.slice(5, 7) - 1].slice(0, 3) + ' ' + d.slice(0, 4);
  }
  function monthLabel(d) { return MONTHS[+d.slice(5, 7) - 1] + ' ' + d.slice(0, 4); }
  function setCurrency(c) { cur = c || 'Rp'; }

  function toast(msg, err) {
    var el = document.createElement('div');
    el.className = 'toast' + (err ? ' err' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, err ? 3800 : 2200);
  }
  function errMsg(e) { return (e && e.message) ? e.message : String(e); }
  async function guard(fn) {
    try { return await fn(); } catch (e) { toast(errMsg(e), true); return undefined; }
  }

  // ---------- sheet (modal) ----------
  function sheet(title, html, mount) {
    var layer = document.getElementById('layer');
    var ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = '<div class="sheet" role="dialog"><h2><span>' + esc(title) + '</span><button type="button" data-close aria-label="Tutup">×</button></h2><div class="body">' + html + '</div></div>';
    layer.appendChild(ov);
    var api = {
      el: ov, body: ov.querySelector('.body'),
      close: function () { if (ov.parentNode) ov.remove(); }
    };
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) api.close(); });
    ov.querySelector('[data-close]').addEventListener('click', api.close);
    bindMoney(ov);
    if (mount) mount(api);
    return api;
  }
  function confirmBox(msg, okLabel) {
    return new Promise(function (resolve) {
      var done = false;
      var s = sheet('Konfirmasi', '<p>' + esc(msg) + '</p><div class="row2"><button class="btn sec" data-no>Batal</button><button class="btn red" data-yes>' + esc(okLabel || 'Ya, lanjut') + '</button></div>', function (a) {
        a.el.querySelector('[data-no]').onclick = function () { done = true; a.close(); resolve(false); };
        a.el.querySelector('[data-yes]').onclick = function () { done = true; a.close(); resolve(true); };
        a.el.querySelector('[data-close]').addEventListener('click', function () { if (!done) resolve(false); });
      });
      return s;
    });
  }

  // ---------- input uang ----------
  function bindMoney(root) {
    root.querySelectorAll('input[data-money]').forEach(function (inp) {
      if (inp._m) return; inp._m = 1;
      inp.setAttribute('inputmode', 'numeric');
      var f = function () {
        var raw = inp.value.replace(/[^0-9]/g, '');
        inp.value = raw ? fmt(parseInt(raw, 10)) : '';
      };
      inp.addEventListener('input', f);
      f();
    });
  }
  function money(name, label, val, extra) {
    return '<label class="f">' + esc(label) + '<input name="' + name + '" data-money value="' + (val ? esc(fmt(val)) : '') + '" ' + (extra || '') + '></label>';
  }
  function field(name, label, val, type, extra) {
    return '<label class="f">' + esc(label) + '<input name="' + name + '" type="' + (type || 'text') + '" value="' + esc(val == null ? '' : val) + '" ' + (extra || '') + '></label>';
  }
  function select(name, label, opts, val, extra) {
    return '<label class="f">' + esc(label) + '<select name="' + name + '" ' + (extra || '') + '>' + opts.map(function (o) {
      return '<option value="' + esc(o.v) + '"' + (String(o.v) === String(val) ? ' selected' : '') + '>' + esc(o.t) + '</option>';
    }).join('') + '</select></label>';
  }
  function formData(root) {
    var o = {};
    root.querySelectorAll('[name]').forEach(function (el) {
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else o[el.name] = el.value;
    });
    return o;
  }

  // ---------- grafik batang sederhana (SVG) ----------
  function barChart(data) {
    var W = 320, H = 150, pad = 22;
    var max = 1;
    data.forEach(function (d) { max = Math.max(max, d.revenue, d.expense); });
    var bw = (W - pad) / data.length;
    var out = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Grafik pendapatan dan biaya 6 bulan">';
    data.forEach(function (d, i) {
      var x = pad / 2 + i * bw;
      var h1 = (d.revenue / max) * (H - 36), h2 = (d.expense / max) * (H - 36);
      out += '<rect x="' + (x + 4) + '" y="' + (H - 22 - h1) + '" width="' + (bw / 2 - 5) + '" height="' + Math.max(h1, 0) + '" rx="3" fill="var(--in)"/>';
      out += '<rect x="' + (x + bw / 2) + '" y="' + (H - 22 - h2) + '" width="' + (bw / 2 - 5) + '" height="' + Math.max(h2, 0) + '" rx="3" fill="var(--out)"/>';
      out += '<text x="' + (x + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10" fill="var(--mute)">' + MONTHS[+d.month.slice(5, 7) - 1].slice(0, 3) + '</text>';
    });
    return out + '</svg><div class="small mute">🟢 Pendapatan &nbsp; 🔴 Biaya (HPP + beban)</div>';
  }

  // ---------- CSV / berbagi ----------
  function csvCell(v) {
    v = v == null ? '' : String(v);
    return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function toCsv(rows) { return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n'); }
  async function saveText(name, content, mime) {
    var path = null;
    try { path = await G.RPC.exportFile(name, content); } catch (e) { path = null; }
    var copied = false;
    try { if (navigator.clipboard) { await navigator.clipboard.writeText(content); copied = true; } } catch (e) { copied = false; }
    try {
      var blob = new Blob([content], { type: mime || 'text/plain' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { /* abaikan */ }
    return { path: path, copied: copied };
  }

  G.UI = {
    esc: esc, fmt: fmt, rp: rp, dt: dt, monthLabel: monthLabel, MONTHS: MONTHS, setCurrency: setCurrency,
    toast: toast, errMsg: errMsg, guard: guard, sheet: sheet, confirmBox: confirmBox,
    bindMoney: bindMoney, money: money, field: field, select: select, formData: formData,
    barChart: barChart, toCsv: toCsv, saveText: saveText
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
