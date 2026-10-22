const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const eurShort = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const monthName = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
const monthLong = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const dateFr = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
const INTERNAL = new Set(['Épargne', 'Virements internes']);
const SVGNS = 'http://www.w3.org/2000/svg';

let data = null;
const view = { sort: { key: 'date', dir: -1 }, limit: 50 };

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json;
}

function banner(message, isError = false) {
  const el = $('#banner');
  el.hidden = !message;
  el.textContent = message ?? '';
  el.classList.toggle('error', isError);
}

/* ---------- Filtres ---------- */

const ymOf = (d) => d.slice(0, 7);
const currentYm = () => new Date().toISOString().slice(0, 7);
function shiftYm(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function periodRange(value) {
  const now = currentYm();
  if (value.startsWith('month:')) return { from: value.slice(6), to: value.slice(6), months: 1 };
  if (value === 'last3') return { from: shiftYm(now, -2), to: now, months: 3 };
  if (value === 'last12') return { from: shiftYm(now, -11), to: now, months: 12 };
  const months = [...new Set(data.transactions.map((t) => ymOf(t.date)))].sort();
  if (!months.length) return { from: '0000-00', to: '9999-99', months: 1 };
  const [fy, fm] = months[0].split('-').map(Number);
  const [ty, tm] = months.at(-1).split('-').map(Number);
  return { from: months[0], to: months.at(-1), months: (ty - fy) * 12 + (tm - fm) + 1 };
}

function fillFilters() {
  const keep = (sel) => sel.value;
  const period = $('#f-period');
  const prev = keep(period) || `month:${currentYm()}`;
  const months = [...new Set([currentYm(), ...data.transactions.map((t) => ymOf(t.date))])].sort().reverse();
  period.innerHTML = [
    ...months.map((m) => `<option value="month:${m}">${monthLong(m)}</option>`),
    '<option value="last3">3 derniers mois</option>',
    '<option value="last12">12 derniers mois</option>',
    '<option value="all">Tout</option>',
  ].join('');
  period.value = prev;

  const account = $('#f-account');
  const prevAcc = keep(account);
  account.innerHTML = '<option value="">Tous</option>'
    + data.accounts.map((a) => `<option value="${esc(a.uid)}">${esc(a.name)}</option>`).join('');
  account.value = data.accounts.some((a) => a.uid === prevAcc) ? prevAcc : '';

  const category = $('#f-category');
  const prevCat = keep(category);
  category.innerHTML = '<option value="">Toutes</option>'
    + data.categories.map((c) => `<option>${esc(c)}</option>`).join('');
  category.value = data.categories.includes(prevCat) ? prevCat : '';
}

// `skip` permet d'ignorer un filtre (ex. le graphe mensuel ignore la période).
function filtered({ skip = [] } = {}) {
  const range = periodRange($('#f-period').value);
  const account = $('#f-account').value;
  const category = $('#f-category').value;
  const q = $('#f-search').value.trim().toLowerCase();
  const hideInternal = $('#f-internal').checked;
  return data.transactions.filter((t) => {
    if (!skip.includes('period')) {
      const ym = ymOf(t.date);
      if (ym < range.from || ym > range.to) return false;
    }
    if (account && t.accountUid !== account) return false;
    if (!skip.includes('category') && category && t.category !== category) return false;
    if (hideInternal && INTERNAL.has(t.category)) return false;
    if (q && !`${t.label} ${t.counterparty}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/* ---------- Rendu ---------- */

function renderAccounts() {
  const el = $('#accounts');
  if (!data.accounts.length) {
    el.innerHTML = `<div class="empty">Aucun compte connecté. ${
      data.mode === 'unconfigured'
        ? 'Configure <code>config.json</code> (voir README) puis relance le serveur, ou essaie <code>npm run demo</code>.'
        : 'Clique sur « Connecter une banque » pour commencer.'}</div>`;
    return;
  }
  el.innerHTML = data.accounts.map((a) => `
    <div>
      <div class="name">${esc(a.name)}</div>
      <div class="meta">${esc(a.bank)} · ${esc(a.iban)}</div>
      <div class="balance">${a.balance == null ? '—' : eur.format(a.balance)}</div>
      <div class="meta">${a.lastSync ? `Synchronisé le ${new Date(a.lastSync).toLocaleString('fr-FR')}` : 'Jamais synchronisé'}</div>
    </div>`).join('');
}

function totals(list) {
  let income = 0;
  let expense = 0;
  for (const t of list) {
    if (t.amount > 0) income += t.amount;
    else expense -= t.amount;
  }
  return { income, expense, net: income - expense };
}

function renderKpis(list) {
  const { income, expense, net } = totals(list);
  const range = periodRange($('#f-period').value);
  const rate = income > 0 ? Math.round((net / income) * 100) : null;
  const tile = (label, value, sub = '') =>
    `<div><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;
  $('#kpis').innerHTML = [
    tile('Revenus', eur.format(income), `${list.filter((t) => t.amount > 0).length} opérations`),
    tile('Dépenses', eur.format(expense), range.months > 1 ? `${eur.format(expense / range.months)} / mois en moyenne` : `${list.filter((t) => t.amount < 0).length} opérations`),
    tile('Solde net', `${net >= 0 ? '+' : '−'}${eur.format(Math.abs(net))}`, net >= 0 ? 'Excédent' : 'Déficit'),
    tile('Taux d’épargne', rate == null ? '—' : `${rate} %`, 'Solde net / revenus'),
  ].join('');
}

function svg(tag, attrs = {}, parent) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent?.appendChild(el);
  return el;
}

// Barre aux coins supérieurs arrondis, posée sur la ligne de base.
function barPath(x, y, w, h, r = 4) {
  r = Math.min(r, w / 2, h);
  if (h <= 0) return '';
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
// Variante horizontale : coins arrondis à droite.
function hbarPath(x, y, w, h, r = 4) {
  r = Math.min(r, h / 2, w);
  if (w <= 0) return '';
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}

function niceMax(v) {
  if (v <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v);
}

const tooltip = $('#tooltip');
function showTip(evt, html) {
  tooltip.innerHTML = html;
  tooltip.hidden = false;
  const { innerWidth } = window;
  const r = tooltip.getBoundingClientRect();
  const x = evt.clientX + 14 + r.width > innerWidth ? evt.clientX - r.width - 14 : evt.clientX + 14;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${evt.clientY + 14}px`;
}
const hideTip = () => { tooltip.hidden = true; };
const tipRow = (color, label, value) =>
  `<div class="row"><span>${color ? `<span class="sw" style="background:${color}"></span>` : ''}${label}</span><strong>${value}</strong></div>`;

function renderMonthly() {
  const list = filtered({ skip: ['period'] });
  const months = Array.from({ length: 12 }, (_, i) => shiftYm(currentYm(), i - 11));
  const series = months.map((m) => ({ m, ...totals(list.filter((t) => ymOf(t.date) === m)) }));
  const W = 1000, H = 260, L = 56, R = 8, T = 16, B = 28;
  const max = niceMax(Math.max(...series.map((s) => Math.max(s.income, s.expense))));
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const band = (W - L - R) / months.length;
  const bw = Math.min(28, (band - 16) / 2);
  const selected = $('#f-period').value;

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Revenus et dépenses par mois' });
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: i ? 'grid' : 'baseline' }, root);
    svg('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end' }, root).textContent = eurShort.format(v);
  }
  series.forEach((s, i) => {
    const x0 = L + band * i;
    const cx = x0 + band / 2;
    if (selected === `month:${s.m}`) svg('rect', { x: x0, y: T, width: band, height: H - T - B, class: 'selected' }, root);
    svg('path', { d: barPath(cx - bw - 1, y(s.income), bw, y(0) - y(s.income)), fill: 'var(--income)' }, root);
    svg('path', { d: barPath(cx + 1, y(s.expense), bw, y(0) - y(s.expense)), fill: 'var(--expense)' }, root);
    svg('text', { x: cx, y: H - 8, 'text-anchor': 'middle' }, root).textContent = monthName(s.m);
    const hit = svg('rect', { x: x0, y: T, width: band, height: H - T - B, class: 'hit' }, root);
    hit.addEventListener('mousemove', (e) => showTip(e, `<strong>${monthLong(s.m)}</strong>`
      + tipRow('var(--income)', 'Revenus', eur.format(s.income))
      + tipRow('var(--expense)', 'Dépenses', eur.format(s.expense))
      + tipRow('', 'Solde', `${s.net >= 0 ? '+' : '−'}${eur.format(Math.abs(s.net))}`)));
    hit.addEventListener('mouseleave', hideTip);
    hit.addEventListener('click', () => { $('#f-period').value = `month:${s.m}`; render(); });
  });
  $('#legend-monthly').innerHTML = '<span style="--c:var(--income)">Revenus</span><span style="--c:var(--expense)">Dépenses</span>';
  $('#chart-monthly').replaceChildren(root);
}

function renderCategories() {
  const list = filtered({ skip: ['category'] }).filter((t) => t.amount < 0);
  const byCat = new Map();
  for (const t of list) byCat.set(t.category, (byCat.get(t.category) ?? 0) - t.amount);
  let rows = [...byCat].sort((a, b) => b[1] - a[1]);
  if (rows.length > 9) {
    const rest = rows.slice(8).reduce((s, [, v]) => s + v, 0);
    rows = [...rows.slice(0, 8), ['Autres catégories', rest]];
  }
  const el = $('#chart-categories');
  if (!rows.length) { el.innerHTML = '<p class="muted">Aucune dépense sur la période.</p>'; return; }
  const total = rows.reduce((s, [, v]) => s + v, 0);
  const W = 500, rowH = 30, L = 130, R = 110;
  const H = rows.length * rowH;
  const max = rows[0][1];
  const active = $('#f-category').value;
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Dépenses par catégorie' });
  svg('line', { x1: L, x2: L, y1: 0, y2: H, class: 'baseline' }, root);
  rows.forEach(([cat, v], i) => {
    const y0 = i * rowH;
    if (cat === active) svg('rect', { x: 0, y: y0, width: W, height: rowH, class: 'selected' }, root);
    const w = ((W - L - R) * v) / max;
    svg('text', { x: L - 8, y: y0 + rowH / 2 + 4, 'text-anchor': 'end', class: 'label' }, root).textContent = cat;
    svg('path', { d: hbarPath(L, y0 + 7, w, rowH - 14), fill: 'var(--expense)' }, root);
    svg('text', { x: L + w + 6, y: y0 + rowH / 2 + 4, class: 'value' }, root).textContent =
      `${eurShort.format(v)} · ${Math.round((v / total) * 100)} %`;
    const hit = svg('rect', { x: 0, y: y0, width: W, height: rowH, class: 'hit' }, root);
    hit.addEventListener('mousemove', (e) => showTip(e, `<strong>${esc(cat)}</strong>`
      + tipRow('var(--expense)', 'Dépenses', eur.format(v))
      + tipRow('', 'Part', `${((v / total) * 100).toFixed(1)} %`)));
    hit.addEventListener('mouseleave', hideTip);
    if (cat !== 'Autres catégories') {
      hit.addEventListener('click', () => {
        $('#f-category').value = active === cat ? '' : cat;
        render();
      });
    }
  });
  el.replaceChildren(root);
}

function renderBudgets() {
  const range = periodRange($('#f-period').value);
  $('#budget-scope').textContent = range.months > 1 ? `· sur ${range.months} mois` : '· ce mois';
  const spent = new Map();
  for (const t of filtered({ skip: ['category'] })) {
    if (t.amount < 0) spent.set(t.category, (spent.get(t.category) ?? 0) - t.amount);
  }
  const entries = Object.entries(data.budgets).filter(([, v]) => v > 0);
  if (!entries.length) {
    $('#budgets').innerHTML = '<p class="muted">Aucun budget défini. Ajoute des plafonds mensuels dans Réglages.</p>';
    return;
  }
  $('#budgets').innerHTML = entries.map(([cat, monthly]) => {
    const limit = monthly * range.months;
    const used = spent.get(cat) ?? 0;
    const pct = used / limit;
    const [color, icon, label] = pct > 1
      ? ['var(--status-critical)', '✕', `Dépassé de ${eur.format(used - limit)}`]
      : pct >= 0.8
        ? ['var(--status-warning)', '!', `Reste ${eur.format(limit - used)}`]
        : ['var(--status-good)', '✓', `Reste ${eur.format(limit - used)}`];
    return `<div class="budget">
      <div class="head"><span>${esc(cat)}</span><span class="num">${eurShort.format(used)} / ${eurShort.format(limit)}</span></div>
      <div class="bar" role="progressbar" aria-valuenow="${Math.round(pct * 100)}" aria-valuemin="0" aria-valuemax="100">
        <div style="width:${Math.min(100, pct * 100)}%;background:${color}"></div></div>
      <div class="status">${icon} ${Math.round(pct * 100)} % · ${label}</div>
    </div>`;
  }).join('');
}

function sortedRows(list) {
  const { key, dir } = view.sort;
  const accountName = new Map(data.accounts.map((a) => [a.uid, a.name]));
  const val = (t) => (key === 'account' ? accountName.get(t.accountUid) ?? '' : t[key]);
  return [...list].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    const c = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'fr');
    return c * dir || b.date.localeCompare(a.date);
  });
}

function renderTable(list) {
  const accountName = new Map(data.accounts.map((a) => [a.uid, a.name]));
  const rows = sortedRows(list);
  const options = (current, manual) => `<option value="">${manual ? '↺ automatique' : ''}</option>`
    + data.categories.map((c) => `<option${c === current ? ' selected' : ''}>${esc(c)}</option>`).join('');
  $('#tx tbody').innerHTML = rows.slice(0, view.limit).map((t) => `
    <tr>
      <td class="date">${dateFr(t.date)}${t.status === 'PDNG' ? '<span class="pending" title="Opération pas encore comptabilisée">à venir</span>' : ''}</td>
      <td>${esc(t.label)}${t.counterparty && !t.label.includes(t.counterparty) ? `<div class="sub">${esc(t.counterparty)}</div>` : ''}</td>
      <td>${esc(accountName.get(t.accountUid) ?? '')}</td>
      <td><select data-id="${esc(t.id)}" class="${t.categoryManual ? 'manual' : ''}" aria-label="Catégorie">${options(t.category, t.categoryManual)}</select></td>
      <td class="num ${t.amount > 0 ? 'credit' : ''}">${t.amount > 0 ? '+' : '−'}${eur.format(Math.abs(t.amount))}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="muted">Aucune transaction.</td></tr>';
  $('#tx-count').textContent = `· ${rows.length}`;
  $('#btn-more').hidden = rows.length <= view.limit;
  for (const th of document.querySelectorAll('#tx th')) {
    th.setAttribute('aria-sort', th.dataset.sort === view.sort.key ? (view.sort.dir > 0 ? 'ascending' : 'descending') : 'none');
  }
}

function render() {
  hideTip();
  const list = filtered();
  renderAccounts();
  renderKpis(list);
  renderMonthly();
  renderCategories();
  renderBudgets();
  renderTable(list);
}

async function reload(next) {
  data = next ?? await api('GET', '/api/data');
  $('#mode').textContent = { demo: 'démo', live: '', unconfigured: 'non configuré' }[data.mode];
  $('#mode').hidden = data.mode === 'live';
  $('#btn-connect').disabled = data.mode !== 'live';
  $('#btn-sync').disabled = data.mode !== 'live' || !data.accounts.length;
  fillFilters();
  render();
}

/* ---------- Actions ---------- */

for (const id of ['#f-period', '#f-account', '#f-category', '#f-internal']) {
  $(id).addEventListener('change', () => { view.limit = 50; render(); });
}
$('#f-search').addEventListener('input', () => { view.limit = 50; render(); });

$('#tx thead').addEventListener('click', (e) => {
  const key = e.target.closest('th')?.dataset.sort;
  if (!key) return;
  view.sort = { key, dir: view.sort.key === key ? -view.sort.dir : key === 'date' || key === 'amount' ? -1 : 1 };
  renderTable(filtered());
});

$('#tx tbody').addEventListener('change', async (e) => {
  const sel = e.target.closest('select[data-id]');
  if (!sel) return;
  try {
    await reload(await api('PUT', '/api/transaction', { id: sel.dataset.id, category: sel.value }));
  } catch (err) { banner(err.message, true); }
});

$('#btn-more').addEventListener('click', () => { view.limit += 200; renderTable(filtered()); });

$('#btn-csv').addEventListener('click', () => {
  const accountName = new Map(data.accounts.map((a) => [a.uid, a.name]));
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Date', 'Libellé', 'Contrepartie', 'Compte', 'Catégorie', 'Montant', 'Devise', 'Statut'].join(';')];
  for (const t of sortedRows(filtered())) {
    lines.push([t.date, cell(t.label), cell(t.counterparty), cell(accountName.get(t.accountUid)), cell(t.category),
      String(t.amount).replace('.', ','), t.currency, t.status].join(';'));
  }
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `transactions-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#btn-sync').addEventListener('click', async () => {
  const btn = $('#btn-sync');
  btn.disabled = true;
  btn.textContent = 'Synchronisation…';
  try {
    const { results } = await api('POST', '/api/sync');
    const errors = results.filter((r) => r.error);
    const added = results.reduce((s, r) => s + (r.added ?? 0), 0);
    banner(errors.length
      ? `Erreurs : ${errors.map((r) => `${r.account} — ${r.error}`).join(' ; ')}`
      : `${added} nouvelle(s) transaction(s).`, errors.length > 0);
    await reload();
  } catch (err) {
    banner(err.message, true);
  } finally {
    btn.textContent = 'Synchroniser';
    btn.disabled = false;
  }
});

/* Connexion bancaire */
let banks = [];
async function loadBanks() {
  const list = $('#c-banks');
  list.innerHTML = '<li class="muted">Chargement…</li>';
  try {
    ({ aspsps: banks } = await api('GET', `/api/banks?country=${encodeURIComponent($('#c-country').value)}`));
    renderBanks();
  } catch (err) {
    list.innerHTML = `<li class="muted">${esc(err.message)}</li>`;
  }
}
function renderBanks() {
  const q = $('#c-filter').value.trim().toLowerCase();
  $('#c-banks').innerHTML = banks
    .filter((b) => b.name.toLowerCase().includes(q))
    .map((b) => `<li data-i="${banks.indexOf(b)}">${b.logo ? `<img src="${esc(b.logo)}" alt="">` : ''}${esc(b.name)}</li>`)
    .join('') || '<li class="muted">Aucune banque.</li>';
}
$('#btn-connect').addEventListener('click', () => {
  $('#c-country').value ||= data.country;
  $('#dlg-connect').showModal();
  if (!banks.length) loadBanks();
});
$('#c-country').addEventListener('change', loadBanks);
$('#c-filter').addEventListener('input', renderBanks);
$('#c-banks').addEventListener('click', async (e) => {
  const li = e.target.closest('li[data-i]');
  if (!li) return;
  const bank = banks[Number(li.dataset.i)];
  try {
    const { url } = await api('POST', '/api/connect', {
      name: bank.name, country: bank.country, maximumConsentValidity: bank.maximum_consent_validity,
    });
    window.location.href = url;
  } catch (err) {
    $('#dlg-connect').close();
    banner(err.message, true);
  }
});
$('#c-finish').addEventListener('click', async () => {
  try {
    const { accounts } = await api('POST', '/api/callback', { url: $('#c-return-url').value });
    $('#dlg-connect').close();
    banner(`${accounts} compte(s) connecté(s). Lance une synchronisation.`);
    await reload();
  } catch (err) { banner(err.message, true); }
});

/* Réglages */
$('#btn-settings').addEventListener('click', () => {
  $('#s-budgets').innerHTML = data.categories.filter((c) => c !== 'Revenus' && !INTERNAL.has(c)).map((c) =>
    `<label>${esc(c)} <input type="number" min="0" step="10" data-cat="${esc(c)}" value="${data.budgets[c] ?? ''}"></label>`).join('');
  $('#s-rules').value = data.rules.map((r) => `${r.pattern} => ${r.category}`).join('\n');
  $('#s-categories').value = data.categories.join('\n');
  $('#s-accounts').innerHTML = data.accounts.map((a) => {
    const session = data.sessions.find((s) => s.id === a.sessionId);
    const until = session?.validUntil ? ` · accès jusqu’au ${new Date(session.validUntil).toLocaleDateString('fr-FR')}` : '';
    return `<li><span>${esc(a.name)} <span class="muted">(${esc(a.bank)}${until})</span></span>
      <button type="button" class="ghost" data-remove="${esc(a.uid)}">Retirer</button></li>`;
  }).join('') || '<li class="muted">Aucun compte.</li>';
  $('#dlg-settings').showModal();
});
$('#s-accounts').addEventListener('click', async (e) => {
  const uid = e.target.dataset.remove;
  if (!uid || !confirm('Retirer ce compte et toutes ses transactions de l’outil ?')) return;
  $('#dlg-settings').close();
  await reload(await api('DELETE', `/api/account?uid=${encodeURIComponent(uid)}`));
});
$('#dlg-settings').addEventListener('close', async () => {
  if ($('#dlg-settings').returnValue !== 'save') return;
  const budgets = {};
  for (const input of document.querySelectorAll('#s-budgets input')) {
    if (Number(input.value) > 0) budgets[input.dataset.cat] = Number(input.value);
  }
  const rules = $('#s-rules').value.split('\n').map((line) => line.split('=>').map((s) => s.trim()))
    .filter(([pattern, category]) => pattern && category).map(([pattern, category]) => ({ pattern, category }));
  const categories = [...new Set($('#s-categories').value.split('\n').map((s) => s.trim()).filter(Boolean))];
  try {
    await reload(await api('PUT', '/api/settings', { budgets, rules, categories }));
  } catch (err) { banner(err.message, true); }
});

/* Retour de la banque (?connected= / ?error=) */
const params = new URLSearchParams(location.search);
if (params.has('connected')) banner(`${params.get('connected')} compte(s) connecté(s). Lance une synchronisation pour récupérer les transactions.`);
if (params.has('error')) banner(params.get('error'), true);
if (params.size) history.replaceState(null, '', '/');

reload().catch((err) => banner(err.message, true));
