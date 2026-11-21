// Дашборд Tribe: вкладки, цифры из data.js, таблицы и два графика.
(function () {
  'use strict';

  var DATA = window.TRIBE_DATA || {};
  var SVGNS = 'http://www.w3.org/2000/svg';

  function fmt(v) {
    if (v == null || v === '') return '—';
    return typeof v === 'number' ? v.toLocaleString('ru-RU') : String(v);
  }

  function rowsOf(id) {
    return Array.isArray(DATA[id]) ? DATA[id] : [];
  }

  // ---------- Вкладки ----------
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tb-tab'));
  var panes = Array.prototype.slice.call(document.querySelectorAll('.tb-pane'));

  function show(id, updateLink) {
    if (!panes.some(function (p) { return p.id === id; })) id = panes[0] ? panes[0].id : '';
    panes.forEach(function (p) { p.hidden = p.id !== id; });
    tabs.forEach(function (t) {
      var on = t.getAttribute('aria-controls') === id;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });
    if (updateLink && id && window.history && history.replaceState) {
      history.replaceState(null, '', '#' + id);
    }
    renderCharts();
  }

  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { show(t.getAttribute('aria-controls'), true); });
    t.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      n.focus();
      n.click();
    });
  });
  window.addEventListener('hashchange', function () { show((location.hash || '').slice(1), false); });

  var printState = null;
  window.addEventListener('beforeprint', function () {
    if (printState) return;
    printState = panes.map(function (p) { return p.hidden; });
    panes.forEach(function (p) { p.hidden = false; });
    renderCharts();
  });
  window.addEventListener('afterprint', function () {
    if (!printState) return;
    panes.forEach(function (p, i) { p.hidden = printState[i]; });
    printState = null;
  });

  // ---------- Цифры в тексте ----------
  document.querySelectorAll('[data-source][data-field][data-where]').forEach(function (el) {
    var parts = (el.getAttribute('data-where') || '').split('=');
    var row = rowsOf(el.getAttribute('data-source')).find(function (r) { return String(r[parts[0]]) === parts[1]; });
    el.textContent = row ? fmt(row[el.getAttribute('data-field')]) : '—';
  });

  var daysEl = document.getElementById('days-left');
  if (daysEl) {
    var days = Math.max(0, Math.ceil((new Date(2027, 0, 1) - new Date()) / 86400000));
    daysEl.textContent = String(days);
  }

  // ---------- Таблицы ----------
  function tag(text, cls) {
    var s = document.createElement('span');
    s.className = 'tb-tag' + (cls ? ' ' + cls : '');
    s.textContent = text;
    return s;
  }

  function fillTable(tbody, id, cols, decorate) {
    var rows = rowsOf(id);
    if (!rows.length) {
      var tr0 = document.createElement('tr');
      var td0 = document.createElement('td');
      td0.colSpan = cols.length;
      td0.textContent = '—';
      tr0.appendChild(td0);
      tbody.replaceChildren(tr0);
      return;
    }
    tbody.replaceChildren.apply(tbody, rows.map(function (r) {
      var tr = document.createElement('tr');
      tr.dataset.key = r.id;
      cols.forEach(function (c) {
        var td = document.createElement('td');
        if (decorate && decorate[c]) decorate[c](td, r);
        else td.textContent = r[c] == null ? '' : String(r[c]);
        tr.appendChild(td);
      });
      return tr;
    }));
  }

  var timelineBody = document.querySelector('[data-table="timeline"]');
  if (timelineBody) {
    fillTable(timelineBody, 'timeline', ['period', 'area', 'text'], {
      period: function (td, r) { td.className = 'tb-nowrap'; td.textContent = r.period; },
      area: function (td, r) { td.appendChild(tag(r.area)); }
    });
  }

  var plansBody = document.querySelector('[data-table="adplans"]');
  if (plansBody) {
    fillTable(plansBody, 'ad_plans', ['date', 'budget', 'split', 'status'], {
      date: function (td, r) { td.className = 'tb-nowrap'; td.textContent = r.date; },
      budget: function (td, r) { td.className = 'tb-nowrap'; td.textContent = r.budget; },
      status: function (td, r) { td.appendChild(tag(r.status, 'is-' + (r.state || 'no'))); }
    });
  }

  // ---------- Графики ----------
  function svgEl(tagName, attrs, parent) {
    var n = document.createElementNS(SVGNS, tagName);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(n);
    return n;
  }

  // Полоса со скруглённым концом данных и прямым краем у базовой линии.
  function barPath(y, w, h, r) {
    r = Math.min(r, h / 2, w);
    return 'M0,' + y + 'H' + (w - r) +
      'A' + r + ',' + r + ' 0 0 1 ' + w + ',' + (y + r) +
      'V' + (y + h - r) +
      'A' + r + ',' + r + ' 0 0 1 ' + (w - r) + ',' + (y + h) +
      'H0Z';
  }

  function barChart(el, opts) {
    var rows = rowsOf(opts.source).map(function (r) { return Object.assign({}, r, { v: +r[opts.field] }); });
    if (!rows.length) { el.textContent = '—'; return; }
    var W = Math.max(260, el.clientWidth || 320);
    var rowH = 46, top = opts.top || 0, barH = 16;
    var H = top + rows.length * rowH;
    var valPad = 72;
    var max = Math.max.apply(null, rows.map(function (r) { return r.v; }).concat([opts.minMax || 0, 1]));
    var x = function (v) { return v / max * (W - valPad); };

    el.replaceChildren();
    var svg = svgEl('svg', { width: '100%', viewBox: '0 0 ' + W + ' ' + H, height: H, role: 'img', 'aria-label': opts.label }, el);
    var tip = document.createElement('div');
    tip.className = 'tb-tip';
    tip.hidden = true;
    el.appendChild(tip);

    (opts.refs || []).forEach(function (ref) {
      var rx = x(ref.v);
      svgEl('line', { x1: rx, x2: rx, y1: top - 4, y2: H, 'class': 'tb-ref' }, svg);
      var t = svgEl('text', { x: rx, y: top - 8, 'text-anchor': 'middle', 'class': 'tb-ax' }, svg);
      t.textContent = ref.text;
    });

    rows.forEach(function (r, i) {
      var g = svgEl('g', { transform: 'translate(0,' + (top + i * rowH) + ')', 'class': 'tb-row' }, svg);
      var label = svgEl('text', { x: 0, y: 13 }, g);
      label.textContent = r[opts.labelField];
      var w = Math.max(2, x(r.v));
      var bar = svgEl('path', { d: barPath(20, w, barH, 4), 'class': 'tb-bar' }, g);
      bar.style.fill = opts.color(r);
      var val = svgEl('text', { x: w + 6, y: 20 + barH - 3, 'class': 'tb-val' }, g);
      val.textContent = opts.fmt(r.v);
      var hit = svgEl('rect', { x: 0, y: 0, width: W, height: rowH, 'class': 'tb-hit' }, g);

      hit.addEventListener('pointermove', function (ev) {
        var box = el.getBoundingClientRect();
        var mx = ev.clientX - box.left, my = ev.clientY - box.top;
        tip.replaceChildren();
        var v = document.createElement('div');
        v.className = 'tb-tip-val';
        v.textContent = opts.fmt(r.v);
        var n = document.createElement('div');
        n.textContent = r[opts.labelField];
        tip.appendChild(v);
        tip.appendChild(n);
        if (r.note) {
          var note = document.createElement('div');
          note.className = 'tb-muted';
          note.textContent = r.note;
          tip.appendChild(note);
        }
        tip.hidden = false;
        var tw = tip.offsetWidth;
        tip.style.left = Math.min(Math.max(0, mx + 12), el.clientWidth - tw) + 'px';
        tip.style.top = (my + 14) + 'px';
      });
      hit.addEventListener('pointerleave', function () { tip.hidden = true; });
    });
  }

  var chartSpecs = {
    funnel: {
      source: 'funnel', field: 'value', labelField: 'stage',
      label: 'Воронка посева в Telegram: от 1702 просмотров до 1 нового пользователя',
      fmt: function (v) { return v.toLocaleString('ru-RU'); },
      color: function (r) { return r.id === 'users' ? 'var(--bad-mark)' : 'var(--series-1)'; }
    },
    cpc: {
      source: 'cpc', field: 'cpc', labelField: 'channel', top: 22, minMax: 80,
      label: 'Цена клика по каналам посева в сравнении с порогами 30 и 80 рублей',
      refs: [{ v: 30, text: '30 ₽' }, { v: 80, text: '80 ₽' }],
      fmt: function (v) { return v.toLocaleString('ru-RU') + ' ₽'; },
      color: function (r) { return r.v >= 80 ? 'var(--bad-mark)' : (r.v <= 30 ? 'var(--ok-mark)' : 'var(--series-1)'); }
    }
  };

  var lastWidths = {};
  function renderCharts(force) {
    document.querySelectorAll('[data-chart]').forEach(function (el) {
      if (!el.offsetParent && !printState) return; // вкладка скрыта
      var key = el.getAttribute('data-chart');
      var spec = chartSpecs[key];
      if (!spec) return;
      var w = el.clientWidth;
      if (!force && lastWidths[key] === w && el.firstChild) return;
      lastWidths[key] = w;
      barChart(el, spec);
    });
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { renderCharts(false); }, 120);
  });

  show((location.hash || '').slice(1), false);
})();
