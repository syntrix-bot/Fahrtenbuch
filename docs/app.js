import { computeSplit, settle, parseAmountCents, parseOdometer } from './split.js';
import * as sync from './sync.js';

// ---------- Daten ----------

const STORAGE_KEY = 'fahrtenbuch.v1';
const COLORS = ['#0a84ff', '#ff9f0a', '#30d158', '#bf5af2'];
const CATEGORIES = [
  ['tanken', '⛽', 'Tanken'],
  ['versicherung', '🛡️', 'Versicherung'],
  ['steuer', '🏛️', 'Kfz-Steuer'],
  ['werkstatt', '🔧', 'Werkstatt & Wartung'],
  ['reifen', '🛞', 'Reifen'],
  ['pflege', '🧽', 'Pflege & Wäsche'],
  ['parken', '🅿️', 'Parken & Maut'],
  ['sonstiges', '📦', 'Sonstiges'],
];
const category = (id) => CATEGORIES.find((c) => c[0] === id) || CATEGORIES[CATEGORIES.length - 1];

const emptyState = () => ({ version: 1, people: [], trips: [], expenses: [], payments: [] });

const sortPeople = (people) => [...people].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

function normalize(s) {
  return {
    version: 1,
    people: Array.isArray(s.people) ? sortPeople(s.people.map((p, i) => ({ order: i, ...p }))) : [],
    trips: Array.isArray(s.trips) ? s.trips : [],
    expenses: Array.isArray(s.expenses) ? s.expenses : [],
    payments: Array.isArray(s.payments) ? s.payments : [],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { console.error(e); }
  return emptyState();
}

let state = load();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    alert('Speichern fehlgeschlagen: ' + e.message);
  }
}

// ---------- Änderungen (lokal + Sync) ----------

const SYNC_KEY = 'fahrtenbuch.syncCode';
let syncCode = null;
try { syncCode = localStorage.getItem(SYNC_KEY); } catch {}
if (!sync.syncAvailable) syncCode = null;
let syncStatus = 'local'; // local | connecting | online | offline | error
let syncError = '';
let unsubscribe = null;

function setSyncCode(code) {
  syncCode = code;
  try { code ? localStorage.setItem(SYNC_KEY, code) : localStorage.removeItem(SYNC_KEY); } catch {}
}

function onSyncError(err) {
  console.error('Sync-Fehler', err);
  syncStatus = 'error';
  syncError = err?.code === 'permission-denied'
    ? 'Zugriff verweigert – sind die Firestore-Regeln und die anonyme Anmeldung eingerichtet?'
    : (err?.message || String(err));
  render();
}

function startSync() {
  stopSync();
  if (!syncCode) { syncStatus = 'local'; return; }
  syncStatus = 'connecting';
  unsubscribe = sync.subscribe(syncCode, (col, items, fromCache) => {
    state[col] = col === 'people' ? sortPeople(items) : items;
    syncStatus = fromCache ? 'offline' : 'online';
    syncError = '';
    persist();
    render();
  }, onSyncError);
}

function stopSync() {
  unsubscribe?.();
  unsubscribe = null;
}

function upsert(col, item) {
  const list = state[col];
  const index = list.findIndex((x) => x.id === item.id);
  if (index >= 0) list[index] = item; else list.push(item);
  if (col === 'people') state.people = sortPeople(state.people);
  persist();
  render();
  if (syncCode) sync.put(syncCode, col, item).catch(onSyncError);
}

function removeItem(col, id) {
  state[col] = state[col].filter((x) => x.id !== id);
  persist();
  render();
  if (syncCode) sync.remove(syncCode, col, id).catch(onSyncError);
}

function replaceAll(newState) {
  state = normalize(newState);
  persist();
  render();
  if (syncCode) sync.replaceAll(syncCode, state).catch(onSyncError);
}

/** Neues gemeinsames Fahrtenbuch in der Cloud anlegen und die lokalen Daten hochladen. */
async function enableSync() {
  const code = syncCode || sync.generateCode();
  try {
    syncStatus = 'connecting';
    render();
    await sync.upload(code, state);
    setSyncCode(code);
    startSync();
    openShareSheet();
  } catch (err) {
    onSyncError(err);
  }
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : Date.now().toString(36) + Math.random().toString(36).slice(2));

// Ersten Zugriff auf persistenten Speicher anfragen (verhindert automatisches Löschen).
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ---------- Formatierung ----------

const euroFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const euro = (cents) => euroFmt.format(cents / 100);
const km = (n) => `${Math.round(n).toLocaleString('de-DE')} km`;
const pct = (x) => `${Math.round(x * 100)} %`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

const personById = (id) => state.people.find((p) => p.id === id);
const colorOf = (p) => (p ? COLORS[state.people.indexOf(p) % COLORS.length] : '#8e8e93');
const badge = (p) => `<span class="dot" style="background:${colorOf(p)}"></span><span class="name">${esc(p ? p.name : 'Unbekannt')}</span>`;
const distance = (t) => Math.max(0, t.end - t.start);

function groupByMonth(items) {
  const groups = new Map();
  for (const item of items) {
    const key = item.date.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()];
}

const sortedTrips = () => [...state.trips].sort((a, b) => b.date.localeCompare(a.date) || b.start - a.start);
const sortedExpenses = () => [...state.expenses].sort((a, b) => b.date.localeCompare(a.date));

function lastOdometer(excludeId) {
  let max = null;
  for (const t of state.trips) if (t.id !== excludeId && (max === null || t.end > max)) max = t.end;
  return max;
}

// ---------- Navigation ----------

const view = document.getElementById('view');
const title = document.getElementById('title');
const addBtn = document.getElementById('add-btn');
const tabbar = document.getElementById('tabbar');
let tab = 'overview';
try { tab = sessionStorage.getItem('tab') || 'overview'; } catch {}

tabbar.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  tab = btn.dataset.tab;
  try { sessionStorage.setItem('tab', tab); } catch {}
  window.scrollTo(0, 0);
  render();
});

addBtn.addEventListener('click', () => {
  if (tab === 'expenses') openExpenseSheet();
  else if (tab === 'trips') openTripSheet();
  else openAddChooser();
});

// Nicht neu zeichnen, während jemand in der Hauptansicht tippt (z. B. Namen ändern).
let renderPending = false;
function render() {
  const active = document.activeElement;
  if (active && active.tagName === 'INPUT' && view.contains(active)) { renderPending = true; return; }
  renderNow();
}
view.addEventListener('focusout', () => {
  if (renderPending) { renderPending = false; setTimeout(render, 0); }
});

const SYNC_LABELS = {
  connecting: ['Verbinde …', 'gray'],
  online: ['Synchronisiert', 'green'],
  offline: ['Offline – wird später übertragen', 'orange'],
  error: ['Sync-Fehler', 'red'],
};

function renderNow() {
  const dot = document.getElementById('sync-dot');
  const label = SYNC_LABELS[syncStatus];
  dot.hidden = !label;
  if (label) { dot.className = `sync-dot ${label[1]}`; dot.title = label[0]; }

  const ready = state.people.length >= 2;
  tabbar.hidden = !ready;
  addBtn.hidden = !ready || tab === 'settings';
  if (!ready) {
    title.textContent = 'Fahrtenbuch';
    view.innerHTML = renderOnboarding();
    return;
  }
  for (const b of tabbar.querySelectorAll('button')) b.classList.toggle('active', b.dataset.tab === tab);
  const views = {
    overview: ['Übersicht', renderOverview],
    trips: ['Fahrten', renderTrips],
    expenses: ['Kosten', renderExpenses],
    settings: ['Einstellungen', renderSettings],
  };
  const [name, fn] = views[tab] || views.overview;
  title.textContent = name;
  view.innerHTML = fn();
}

// ---------- Ansichten ----------

function renderOnboarding() {
  return `
    <div class="empty">
      <div class="big">🚗</div>
      <h2>Willkommen beim Fahrtenbuch</h2>
      <p>Tragt eure Fahrten und Autokosten ein – die App rechnet aus, wer wie viel zahlen muss, fair nach gefahrenen Kilometern.</p>
    </div>
    <form id="onboarding">
      <div class="section">
        <div class="section-head">Wer fährt das Auto?</div>
        <div class="card">
          <div class="field"><input class="left" name="a" placeholder="Erste Person" autocomplete="given-name" required></div>
          <div class="field"><input class="left" name="b" placeholder="Zweite Person" autocomplete="off" required></div>
        </div>
      </div>
      <button class="btn block" type="submit">${sync.syncAvailable && !syncCode ? 'Neues Fahrtenbuch anlegen' : "Los geht's"}</button>
    </form>
    ${sync.syncAvailable && !syncCode ? `
      <div class="or">Dein Partner hat schon ein Fahrtenbuch angelegt?</div>
      <button class="btn block secondary" data-action="join">Mit Code verbinden</button>` : ''}`;
}

function renderSyncSection() {
  if (!sync.syncAvailable) {
    return `<div class="section">
      <div class="section-head">Gemeinsam nutzen</div>
      <div class="tip">Der Sync zwischen zwei Handys ist noch nicht eingerichtet. Die Anleitung steht in der README auf GitHub.</div>
    </div>`;
  }
  if (!syncCode) {
    return `<div class="section">
      <div class="section-head">Gemeinsam nutzen</div>
      <div class="card">
        <button class="row" data-action="enable-sync"><span class="emoji">☁️</span><span class="grow">Sync aktivieren</span></button>
        <button class="row" data-action="join"><span class="emoji">🔗</span><span class="grow">Mit Code verbinden</span></button>
      </div>
      <div class="section-foot">Mit Sync tragt ihr beide auf eurem eigenen Handy ein und seht immer denselben Stand.</div>
    </div>`;
  }
  const label = SYNC_LABELS[syncStatus] || ['–', 'gray'];
  return `<div class="section">
    <div class="section-head">Gemeinsam nutzen</div>
    <div class="card">
      <div class="row"><span class="grow">Status</span><span><span class="sync-dot ${label[1]}"></span> ${label[0]}</span></div>
      ${syncStatus === 'error' && syncError ? `<div class="row hint err">${esc(syncError)}</div>` : ''}
      <div class="code" id="sync-code">${sync.formatCode(syncCode)}</div>
      <button class="row" data-action="share-code"><span class="emoji">📤</span><span class="grow">Code an Partner schicken</span></button>
      <button class="row" data-action="leave-sync"><span class="emoji">⛓️‍💥</span><span class="grow">Verbindung trennen</span></button>
    </div>
    <div class="section-foot">Wer diesen Code kennt, kann euer Fahrtenbuch sehen und bearbeiten – teilt ihn nur miteinander.</div>
  </div>`;
}

function renderOverview() {
  const lines = computeSplit(state);
  const transfers = settle(lines);
  const totalKm = state.trips.reduce((s, t) => s + distance(t), 0);
  const totalCost = state.expenses.reduce((s, e) => s + e.amountCents, 0);
  const odo = lastOdometer(null);

  const kmRows = lines.map((l) => `
    <div class="row"><div class="grow">
      <div style="display:flex;justify-content:space-between">
        <span>${badge(l.person)}</span>
        <span class="num">${km(l.km)} <span class="muted">· ${pct(l.kmShare)}</span></span>
      </div>
      <div class="bar"><div style="width:${(l.kmShare * 100).toFixed(1)}%;background:${colorOf(l.person)}"></div></div>
    </div></div>`).join('');

  const costRows = lines.map((l) => {
    const b = l.balance;
    const saldo = b > 0.5 ? `<span class="pos">bekommt ${euro(b)}</span>`
      : b < -0.5 ? `<span class="neg">zahlt ${euro(-b)}</span>` : '<span class="muted">ausgeglichen</span>';
    return `
      <div class="row"><div class="grow">
        <div style="margin-bottom:4px">${badge(l.person)}</div>
        <div class="kv"><span>Anteil an Kosten</span><span>${euro(l.costShare)}</span></div>
        <div class="kv"><span>Selbst bezahlt</span><span>${euro(l.paid)}</span></div>
        ${l.sent || l.received ? `<div class="kv"><span>Ausgleich gezahlt / erhalten</span><span>${euro(l.sent)} / ${euro(l.received)}</span></div>` : ''}
        <div class="kv"><span>Saldo</span>${saldo}</div>
      </div></div>`;
  }).join('');

  const transferRows = transfers.length === 0
    ? '<div class="row ok">✓ Alles ausgeglichen</div>'
    : transfers.map((t) => `
      <div class="row">
        <div class="grow">
          <div>${esc(t.from.name)} zahlt ${esc(t.to.name)}</div>
          <div class="amount-big">${euro(t.amountCents)}</div>
        </div>
        <button class="btn" data-action="mark-paid" data-from="${t.from.id}" data-to="${t.to.id}" data-amount="${t.amountCents}">Bezahlt</button>
      </div>`).join('');

  return `
    <div class="section"><div class="card stats">
      <div class="stat"><b>${odo === null ? '–' : km(odo)}</b><span>Kilometerstand</span></div>
      <div class="stat"><b>${km(totalKm)}</b><span>Gefahren</span></div>
      <div class="stat"><b>${euro(totalCost)}</b><span>Kosten gesamt</span></div>
      <div class="stat"><b>${totalKm > 0 ? euro(totalCost / totalKm) : '–'}</b><span>Kosten pro km</span></div>
    </div></div>

    <div class="section">
      <div class="section-head">Wer ist wie viel gefahren?</div>
      <div class="card">${kmRows}</div>
    </div>

    <div class="section">
      <div class="section-head">Kosten</div>
      <div class="card">${costRows}</div>
      <div class="section-foot">Alle Kosten werden nach dem Anteil der gefahrenen Kilometer aufgeteilt.</div>
    </div>

    <div class="section">
      <div class="section-head">Ausgleich</div>
      <div class="card">${transferRows}</div>
    </div>`;
}

function renderTrips() {
  if (state.trips.length === 0) {
    return `<div class="empty"><div class="big">🚗</div><h2>Noch keine Fahrten</h2>
      <p>Trage nach jeder Fahrt den Kilometerstand ein.</p>
      <button class="btn" data-action="add-trip">Fahrt eintragen</button></div>`;
  }
  return groupByMonth(sortedTrips()).map(([month, trips]) => `
    <div class="section">
      <div class="section-head"><span>${fmtMonth(month)}</span><span>${km(trips.reduce((s, t) => s + distance(t), 0))}</span></div>
      <div class="card">${trips.map((t) => `
        <button class="row" data-action="edit-trip" data-id="${t.id}">
          <div class="grow">
            <div>${badge(personById(t.driverId))}</div>
            <div class="sub">${fmtDate(t.date)} · ${t.start.toLocaleString('de-DE')} → ${t.end.toLocaleString('de-DE')}${t.note ? ' · ' + esc(t.note) : ''}</div>
          </div>
          <div class="value">${km(distance(t))}</div>
        </button>`).join('')}
      </div>
    </div>`).join('');
}

function renderExpenses() {
  if (state.expenses.length === 0) {
    return `<div class="empty"><div class="big">💶</div><h2>Noch keine Kosten</h2>
      <p>Tanken, Versicherung, Werkstatt … alles, was das Auto kostet.</p>
      <button class="btn" data-action="add-expense">Kosten eintragen</button></div>`;
  }
  return groupByMonth(sortedExpenses()).map(([month, items]) => `
    <div class="section">
      <div class="section-head"><span>${fmtMonth(month)}</span><span>${euro(items.reduce((s, e) => s + e.amountCents, 0))}</span></div>
      <div class="card">${items.map((e) => {
        const [, icon, label] = category(e.category);
        const payer = personById(e.paidById);
        return `
        <button class="row" data-action="edit-expense" data-id="${e.id}">
          <span class="emoji">${icon}</span>
          <div class="grow">
            <div>${esc(e.note || label)}</div>
            <div class="sub">${fmtDate(e.date)} · bezahlt von ${esc(payer ? payer.name : '–')}</div>
          </div>
          <div class="value">${euro(e.amountCents)}</div>
        </button>`;
      }).join('')}
      </div>
    </div>`).join('');
}

function renderSettings() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const payments = [...state.payments].sort((a, b) => b.date.localeCompare(a.date));
  return `
    ${standalone ? '' : `<div class="section"><div class="tip">
      📲 <b>Tipp:</b> In Safari unten auf <b>Teilen</b> tippen → <b>Zum Home-Bildschirm</b>. Dann startet das Fahrtenbuch wie eine richtige App.
      <br><span class="muted">Wichtig: Die Daten der Home-Bildschirm-App sind getrennt von denen in Safari – nutzt also immer dieselbe.</span>
    </div></div>`}

    ${renderSyncSection()}

    <div class="section">
      <div class="section-head">Personen</div>
      <div class="card">${state.people.map((p) => `
        <div class="field"><span class="dot" style="background:${colorOf(p)}"></span>
          <input class="left" data-action="rename" data-id="${p.id}" value="${esc(p.name)}" placeholder="Name"></div>`).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-head">Ausgleichszahlungen</div>
      <div class="card">${payments.length === 0 ? '<div class="row muted">Noch keine Ausgleichszahlungen</div>'
        : payments.map((p) => `
        <div class="row">
          <div class="grow">
            <div>${esc(personById(p.fromId)?.name ?? '–')} → ${esc(personById(p.toId)?.name ?? '–')}</div>
            <div class="sub">${fmtDate(p.date)}</div>
          </div>
          <div class="value">${euro(p.amountCents)}</div>
          <button class="del" data-action="delete-payment" data-id="${p.id}" aria-label="Löschen">⊖</button>
        </div>`).join('')}
      </div>
      <div class="section-foot">Mit ⊖ löschen, falls eine Zahlung versehentlich eingetragen wurde.</div>
    </div>

    <div class="section">
      <div class="section-head">Daten</div>
      <div class="card">
        <button class="row" data-action="export-csv"><span class="emoji">📄</span><span class="grow">Als CSV exportieren (Excel/Numbers)</span></button>
        <button class="row" data-action="export-backup"><span class="emoji">💾</span><span class="grow">Backup speichern</span></button>
        <button class="row" data-action="import-backup"><span class="emoji">📥</span><span class="grow">Backup wiederherstellen</span></button>
      </div>
      <div class="section-foot">${syncCode
        ? 'Ein Backup schadet trotzdem nie, z. B. in der Dateien-App oder iCloud Drive.'
        : 'Die Daten liegen nur auf diesem iPhone. Speichert ab und zu ein Backup, z. B. in der Dateien-App oder iCloud Drive.'}</div>
      <input type="file" id="import-file" accept="application/json,.json" hidden>
    </div>

    <div class="section"><div class="card">
      <button class="btn danger" data-action="reset">Alle Daten löschen</button>
    </div></div>`;
}

// ---------- Sheets (Formulare) ----------

const sheet = document.getElementById('sheet');
const backdrop = document.getElementById('sheet-backdrop');

function openSheet(html, onReady) {
  sheet.innerHTML = html;
  sheet.hidden = false;
  backdrop.hidden = false;
  document.body.style.overflow = 'hidden';
  sheet.scrollTop = 0;
  onReady?.();
}
function closeSheet() {
  sheet.hidden = true;
  backdrop.hidden = true;
  sheet.innerHTML = '';
  document.body.style.overflow = '';
}
backdrop.addEventListener('click', closeSheet);

function personSegment(name, selectedId) {
  return `<div class="seg">${state.people.map((p) => `
    <label><input type="radio" name="${name}" value="${p.id}" ${p.id === selectedId ? 'checked' : ''}><span>${esc(p.name)}</span></label>`).join('')}
  </div>`;
}

function sheetHead(heading, formId) {
  return `<div class="sheet-head">
    <button type="button" class="link" data-action="close-sheet">Abbrechen</button>
    <h2>${heading}</h2>
    <button type="submit" class="link bold" form="${formId}" id="save-btn">Sichern</button>
  </div>`;
}

function openShareSheet() {
  openSheet(`
    <div class="sheet-head"><span></span><h2>Fahrtenbuch teilen</h2><button class="link bold" data-action="close-sheet">Fertig</button></div>
    <div class="section">
      <div class="tip">
        So kommt dein Partner dazu:
        <ol style="margin:8px 0 0;padding-left:20px">
          <li>Die App-Adresse in Safari öffnen und <b>Zum Home-Bildschirm</b> hinzufügen</li>
          <li>Die App öffnen und <b>Mit Code verbinden</b> wählen</li>
          <li>Diesen Code eingeben:</li>
        </ol>
      </div>
    </div>
    <div class="card"><div class="code">${sync.formatCode(syncCode)}</div></div>
    <div class="section"><button class="btn block" data-action="share-code">Code verschicken</button></div>`);
}

function openJoinSheet() {
  openSheet(`
    <div class="sheet-head">
      <button type="button" class="link" data-action="close-sheet">Abbrechen</button>
      <h2>Mit Code verbinden</h2>
      <button type="submit" class="link bold" form="join-form" id="save-btn">Verbinden</button>
    </div>
    <form id="join-form">
      <div class="section">
        <div class="section-head">Code von deinem Partner</div>
        <div class="card"><div class="field">
          <input class="code-input" name="code" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" autocomplete="off" autocapitalize="characters" spellcheck="false">
        </div></div>
        <div id="j-hint" class="hint"></div>
      </div>
    </form>`, () => setTimeout(() => document.querySelector('#join-form input').focus(), 300));
}

async function shareCode() {
  const url = location.origin + location.pathname;
  const text = `Unser Fahrtenbuch-Code: ${sync.formatCode(syncCode)}\n\nApp: ${url}\n(In Safari öffnen → Teilen → Zum Home-Bildschirm, dann „Mit Code verbinden“.)`;
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(text);
    alert('Code wurde in die Zwischenablage kopiert.');
  } catch {
    alert(text);
  }
}

function openAddChooser() {
  openSheet(`
    <div class="sheet-head"><span></span><h2>Hinzufügen</h2><button class="link" data-action="close-sheet">Fertig</button></div>
    <div class="card">
      <button class="row" data-action="add-trip"><span class="emoji">🚗</span><span class="grow">Fahrt eintragen</span></button>
      <button class="row" data-action="add-expense"><span class="emoji">💶</span><span class="grow">Kosten eintragen</span></button>
    </div>`);
}

/** Zuletzt auf diesem Handy gewählte Person – meist ist das man selbst. */
function defaultPerson(key) {
  let id = null;
  try { id = localStorage.getItem(key); } catch {}
  return personById(id) ? id : state.people[0].id;
}

function openTripSheet(trip) {
  const last = lastOdometer(trip?.id);
  const driverId = trip?.driverId ?? defaultPerson('fahrtenbuch.lastDriver');

  openSheet(`
    ${sheetHead(trip ? 'Fahrt bearbeiten' : 'Neue Fahrt', 'trip-form')}
    <form id="trip-form" data-id="${trip?.id ?? ''}">
      <div class="section">
        <div class="section-head">Wer ist gefahren?</div>
        <div class="card">
          ${personSegment('driver', driverId)}
          <div class="field"><label for="t-date">Datum</label><input type="date" id="t-date" name="date" value="${trip?.date ?? today()}" required></div>
        </div>
      </div>
      <div class="section">
        <div class="section-head">Kilometerstand</div>
        <div class="card">
          <div class="field"><label for="t-start">Start</label><input id="t-start" name="start" inputmode="numeric" placeholder="km-Stand" value="${trip?.start ?? last ?? ''}" autocomplete="off"></div>
          <div class="field"><label for="t-end">Ende</label><input id="t-end" name="end" inputmode="numeric" placeholder="km-Stand" value="${trip?.end ?? ''}" autocomplete="off"></div>
          <div class="field"><label>Gefahren</label><b id="t-dist" class="num" style="margin-left:auto">–</b></div>
        </div>
        <div id="t-hint" class="hint"></div>
      </div>
      <div class="section">
        <div class="section-head">Notiz</div>
        <div class="card"><div class="field"><input class="left" name="note" placeholder="z. B. Einkaufen, Arbeit, Urlaub" value="${esc(trip?.note ?? '')}"></div></div>
      </div>
      ${trip ? '<button type="button" class="btn danger" data-action="delete-trip">Fahrt löschen</button>' : ''}
    </form>`, () => {
    const form = document.getElementById('trip-form');
    const update = () => {
      const start = parseOdometer(form.start.value);
      const end = parseOdometer(form.end.value);
      const ok = start !== null && end !== null && end > start;
      document.getElementById('t-dist').textContent = ok ? km(end - start) : '–';
      document.getElementById('save-btn').disabled = !ok;
      const hint = document.getElementById('t-hint');
      hint.className = 'hint';
      hint.textContent = '';
      if (start !== null && end !== null && end <= start) {
        hint.className = 'hint err';
        hint.textContent = 'Der End-Kilometerstand muss größer als der Start sein.';
      } else if (!trip && start !== null && last !== null && start > last) {
        hint.className = 'hint warn';
        hint.textContent = `Seit der letzten Fahrt fehlen ${km(start - last)} – wurde eine Fahrt vergessen?`;
      } else if (!trip && start !== null && last !== null && start < last) {
        hint.className = 'hint warn';
        hint.textContent = `Der Start liegt unter dem letzten Kilometerstand (${last.toLocaleString('de-DE')}).`;
      }
    };
    form.addEventListener('input', update);
    update();
    if (!trip) setTimeout(() => form.end.focus(), 300);
  });
}

function openExpenseSheet(expense) {
  const amountValue = expense ? (expense.amountCents / 100).toFixed(2).replace('.', ',') : '';
  openSheet(`
    ${sheetHead(expense ? 'Kosten bearbeiten' : 'Neue Kosten', 'expense-form')}
    <form id="expense-form" data-id="${expense?.id ?? ''}">
      <div class="section">
        <div class="section-head">Betrag</div>
        <div class="card"><div class="field">
          <input class="big" name="amount" inputmode="decimal" placeholder="0,00" value="${amountValue}" autocomplete="off">
          <span class="muted" style="font-size:24px">€</span>
        </div></div>
        <div id="e-hint" class="hint"></div>
      </div>
      <div class="section">
        <div class="section-head">Wer hat bezahlt?</div>
        <div class="card">${personSegment('paidBy', expense?.paidById ?? defaultPerson('fahrtenbuch.lastPayer'))}</div>
      </div>
      <div class="section"><div class="card">
        <div class="field"><label for="e-cat">Kategorie</label>
          <select id="e-cat" name="category">${CATEGORIES.map(([id, icon, label]) =>
            `<option value="${id}" ${id === (expense?.category ?? 'tanken') ? 'selected' : ''}>${icon} ${label}</option>`).join('')}
          </select></div>
        <div class="field"><label for="e-date">Datum</label><input type="date" id="e-date" name="date" value="${expense?.date ?? today()}" required></div>
        <div class="field"><input class="left" name="note" placeholder="Notiz (optional)" value="${esc(expense?.note ?? '')}"></div>
      </div></div>
      ${expense ? '<button type="button" class="btn danger" data-action="delete-expense">Kosten löschen</button>' : ''}
    </form>`, () => {
    const form = document.getElementById('expense-form');
    const update = () => {
      const cents = parseAmountCents(form.amount.value);
      document.getElementById('save-btn').disabled = cents === null;
      document.getElementById('e-hint').textContent = '';
      if (form.amount.value.trim() && cents === null) {
        const h = document.getElementById('e-hint');
        h.className = 'hint err';
        h.textContent = 'Bitte einen gültigen Betrag eingeben, z. B. 45,90';
      }
    };
    form.addEventListener('input', update);
    update();
    if (!expense) setTimeout(() => form.amount.focus(), 300);
  });
}

// ---------- Formular-Speichern ----------

const remember = (key, value) => { try { localStorage.setItem(key, value); } catch {} };

document.addEventListener('submit', (e) => {
  const form = e.target;
  e.preventDefault();

  if (form.id === 'onboarding') {
    const a = form.a.value.trim();
    const b = form.b.value.trim();
    if (!a || !b) return;
    tab = 'overview';
    const people = [{ id: uid(), name: a, order: 0 }, { id: uid(), name: b, order: 1 }];
    if (syncCode) {
      // Bereits verbunden (z. B. nach "Alle Daten löschen"): im selben Fahrtenbuch weitermachen.
      people.forEach((p) => upsert('people', p));
    } else {
      state.people = people;
      persist();
      render();
      if (sync.syncAvailable) enableSync();
    }
    return;
  }

  if (form.id === 'join-form') {
    joinWithCode(form);
    return;
  }

  if (form.id === 'trip-form') {
    const start = parseOdometer(form.start.value);
    const end = parseOdometer(form.end.value);
    const driverId = form.driver.value;
    if (start === null || end === null || end <= start || !driverId) return;
    const data = { date: form.date.value || today(), start, end, driverId, note: form.note.value.trim() };
    remember('fahrtenbuch.lastDriver', driverId);
    closeSheet();
    upsert('trips', { id: form.dataset.id || uid(), ...data });
    return;
  }

  if (form.id === 'expense-form') {
    const amountCents = parseAmountCents(form.amount.value);
    const paidById = form.paidBy.value;
    if (amountCents === null || !paidById) return;
    const data = { date: form.date.value || today(), amountCents, paidById, category: form.category.value, note: form.note.value.trim() };
    remember('fahrtenbuch.lastPayer', paidById);
    closeSheet();
    upsert('expenses', { id: form.dataset.id || uid(), ...data });
  }
});

async function joinWithCode(form) {
  const hint = document.getElementById('j-hint');
  const button = document.getElementById('save-btn');
  const code = sync.normalizeCode(form.code.value);
  hint.className = 'hint err';
  if (!code) { hint.textContent = 'Der Code hat 20 Zeichen, z. B. ABCDE-FGHJK-LMNPQ-RSTUV.'; return; }

  button.disabled = true;
  hint.className = 'hint';
  hint.textContent = 'Prüfe Code …';
  try {
    if (!(await sync.exists(code))) {
      hint.className = 'hint err';
      hint.textContent = 'Zu diesem Code wurde kein Fahrtenbuch gefunden.';
      button.disabled = false;
      return;
    }
  } catch (err) {
    console.error(err);
    hint.className = 'hint err';
    hint.textContent = 'Keine Verbindung zum Server. Bist du online?';
    button.disabled = false;
    return;
  }

  const hasLocalData = state.trips.length || state.expenses.length;
  if (hasLocalData && !confirm('Die Fahrten und Kosten auf diesem Handy werden durch das gemeinsame Fahrtenbuch ersetzt. Fortfahren?')) {
    button.disabled = false;
    hint.textContent = '';
    return;
  }
  closeSheet();
  state = emptyState();
  persist();
  setSyncCode(code);
  tab = 'overview';
  startSync();
  render();
}

// ---------- Aktionen ----------

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'INPUT') return;
  const { action, id } = el.dataset;

  switch (action) {
    case 'close-sheet': closeSheet(); break;
    case 'add-trip': closeSheet(); openTripSheet(); break;
    case 'add-expense': closeSheet(); openExpenseSheet(); break;
    case 'edit-trip': openTripSheet(state.trips.find((t) => t.id === id)); break;
    case 'edit-expense': openExpenseSheet(state.expenses.find((x) => x.id === id)); break;

    case 'delete-trip': {
      const formId = document.getElementById('trip-form').dataset.id;
      if (confirm('Diese Fahrt löschen?')) { closeSheet(); removeItem('trips', formId); }
      break;
    }
    case 'delete-expense': {
      const formId = document.getElementById('expense-form').dataset.id;
      if (confirm('Diese Kosten löschen?')) { closeSheet(); removeItem('expenses', formId); }
      break;
    }

    case 'mark-paid': {
      const from = personById(el.dataset.from);
      const to = personById(el.dataset.to);
      const amountCents = Number(el.dataset.amount);
      if (from && to && confirm(`${from.name} hat ${to.name} ${euro(amountCents)} gezahlt?`)) {
        upsert('payments', { id: uid(), date: today(), amountCents, fromId: from.id, toId: to.id });
      }
      break;
    }
    case 'delete-payment':
      if (confirm('Diese Ausgleichszahlung löschen?')) removeItem('payments', id);
      break;

    case 'join': openJoinSheet(); break;
    case 'enable-sync': enableSync(); break;
    case 'share-code': shareCode(); break;
    case 'leave-sync':
      if (confirm('Verbindung trennen? Die aktuellen Daten bleiben als Kopie auf diesem Handy, werden aber nicht mehr abgeglichen.')) {
        stopSync();
        setSyncCode(null);
        syncStatus = 'local';
        render();
      }
      break;

    case 'export-csv': shareFile('Fahrtenbuch.csv', '﻿' + buildCsv(), 'text/csv'); break;
    case 'export-backup': {
      const { people, trips, expenses, payments } = state;
      shareFile(`Fahrtenbuch-Backup-${today()}.json`, JSON.stringify({ version: 1, people, trips, expenses, payments }, null, 2), 'application/json');
      break;
    }
    case 'import-backup': document.getElementById('import-file').click(); break;

    case 'reset': {
      const warning = syncCode
        ? 'Wirklich ALLE Fahrten, Kosten und Personen löschen? Das betrifft auch das Handy deines Partners.'
        : 'Wirklich ALLE Fahrten, Kosten und Personen löschen?';
      if (confirm(warning) && confirm('Sicher? Das kann nicht rückgängig gemacht werden.')) replaceAll(emptyState());
      break;
    }
  }
});

// Namen ändern, Backup laden
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.action === 'rename') {
    const p = personById(el.dataset.id);
    const name = el.value.trim();
    if (p && name && name !== p.name) upsert('people', { ...p, name });
    else render();
  }
  if (el.id === 'import-file' && el.files[0]) {
    el.files[0].text().then((text) => {
      const data = JSON.parse(text);
      if (!Array.isArray(data.people) || !Array.isArray(data.trips)) throw new Error('Keine gültige Backup-Datei');
      if (confirm(`Backup mit ${data.trips.length} Fahrten und ${(data.expenses || []).length} Kosten laden? Die aktuellen Daten werden ersetzt${syncCode ? ' – auch auf dem Handy deines Partners' : ''}.`)) {
        replaceAll(data);
      }
    }).catch((err) => alert('Backup konnte nicht geladen werden: ' + err.message));
    el.value = '';
  }
});

// ---------- Export ----------

function buildCsv() {
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const money = (c) => (c / 100).toFixed(2).replace('.', ',');
  const rows = ['Typ;Datum;Person;Start-km;End-km;km;Betrag;Kategorie;Notiz'];
  for (const t of [...state.trips].sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)) {
    rows.push(['Fahrt', t.date, q(personById(t.driverId)?.name), t.start, t.end, distance(t), '', '', q(t.note)].join(';'));
  }
  for (const x of [...state.expenses].sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push(['Kosten', x.date, q(personById(x.paidById)?.name), '', '', '', money(x.amountCents), q(category(x.category)[2]), q(x.note)].join(';'));
  }
  for (const p of [...state.payments].sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push(['Ausgleich', p.date, q(`${personById(p.fromId)?.name ?? ''} → ${personById(p.toId)?.name ?? ''}`), '', '', '', money(p.amountCents), '', ''].join(';'));
  }
  return rows.join('\n');
}

async function shareFile(filename, content, type) {
  const file = new File([content], filename, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---------- Start ----------

startSync();
render();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service Worker:', err));
}
