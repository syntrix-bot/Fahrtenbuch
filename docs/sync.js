// Synchronisation über Firebase Firestore.
//
// Jedes gemeinsame Fahrtenbuch liegt unter households/{code}/{people|trips|expenses|payments}/{id}.
// Der Code ist 20 Zeichen lang und zufällig – wer ihn kennt, hat Zugriff.
// Firestore puffert Änderungen offline und überträgt sie, sobald wieder Netz da ist.

import { firebaseConfig } from './firebase-config.js';

export const COLLECTIONS = ['people', 'trips', 'expenses', 'payments'];
export const syncAvailable = !!firebaseConfig;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne 0/O, 1/I
const CODE_LENGTH = 20;

export function generateCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Eingabe säubern: Bindestriche/Leerzeichen raus, Großbuchstaben. Null bei falscher Länge. */
export function normalizeCode(input) {
  const code = String(input).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length === CODE_LENGTH ? code : null;
}

export const formatCode = (code) => code.match(/.{1,5}/g).join('-');

let ready = null;

function init() {
  if (ready) return ready;
  ready = (async () => {
    const [appMod, authMod, fs] = await Promise.all([
      import('./vendor/firebase/firebase-app.js'),
      import('./vendor/firebase/firebase-auth.js'),
      import('./vendor/firebase/firebase-firestore.js'),
    ]);
    const { emulator, ...options } = firebaseConfig;
    const app = appMod.initializeApp(options);
    // Ohne Popup-/Redirect-Login: lädt keine zusätzlichen Google-Skripte nach.
    const auth = authMod.initializeAuth(app, {
      persistence: [authMod.indexedDBLocalPersistence, authMod.browserLocalPersistence],
    });

    let db;
    try {
      db = fs.initializeFirestore(app, {
        ignoreUndefinedProperties: true,
        localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
      });
    } catch (err) {
      console.warn('Offline-Speicher nicht verfügbar, nutze Speicher im Arbeitsspeicher', err);
      db = fs.initializeFirestore(app, { ignoreUndefinedProperties: true });
    }

    // Nur für automatische Tests mit dem Firebase-Emulator.
    if (emulator) {
      authMod.connectAuthEmulator(auth, `http://${emulator.host}:${emulator.authPort}`, { disableWarnings: true });
      fs.connectFirestoreEmulator(db, emulator.host, emulator.firestorePort);
    }

    await auth.authStateReady();
    if (!auth.currentUser) await authMod.signInAnonymously(auth);
    return { db, fs };
  })();
  ready.catch(() => { ready = null; }); // nächster Versuch beim nächsten Aufruf
  return ready;
}

const colRef = ({ db, fs }, code, col) => fs.collection(db, 'households', code, col);
const docRef = ({ db, fs }, code, col, id) => fs.doc(db, 'households', code, col, id);

/**
 * Hört auf Änderungen. `onCollection(col, items, fromCache)` wird pro Sammlung aufgerufen.
 * Gibt eine Funktion zum Beenden zurück.
 */
export function subscribe(code, onCollection, onError) {
  let unsubs = [];
  let stopped = false;
  init().then((fb) => {
    if (stopped) return;
    unsubs = COLLECTIONS.map((col) => fb.fs.onSnapshot(
      colRef(fb, code, col),
      { includeMetadataChanges: true },
      (snap) => onCollection(col, snap.docs.map((d) => ({ ...d.data(), id: d.id })), snap.metadata.fromCache),
      onError,
    ));
  }).catch(onError);
  return () => { stopped = true; unsubs.forEach((u) => u()); };
}

export async function exists(code) {
  const fb = await init();
  const snap = await fb.fs.getDocsFromServer(colRef(fb, code, 'people'));
  return !snap.empty;
}

export async function put(code, col, item) {
  const fb = await init();
  const { id, ...data } = item;
  await fb.fs.setDoc(docRef(fb, code, col, id), data);
}

export async function remove(code, col, id) {
  const fb = await init();
  await fb.fs.deleteDoc(docRef(fb, code, col, id));
}

/**
 * Lädt alle Einträge in ein (neues) Fahrtenbuch hoch. Kehrt zurück, sobald die Änderungen
 * lokal übernommen sind – die Übertragung zum Server läuft (auch offline) im Hintergrund weiter.
 */
export async function upload(code, state) {
  const fb = await init();
  const items = COLLECTIONS.flatMap((col) => (state[col] || []).map((item) => [col, item]));
  for (let i = 0; i < items.length || i === 0; i += 400) {
    const batch = fb.fs.writeBatch(fb.db);
    for (const [col, { id, ...data }] of items.slice(i, i + 400)) batch.set(docRef(fb, code, col, id), data);
    batch.commit().catch((err) => console.error('Upload fehlgeschlagen', err));
  }
}

/** Ersetzt den gesamten Inhalt eines Fahrtenbuchs (Backup laden, alles löschen, Sync aktivieren). */
export async function replaceAll(code, state) {
  const fb = await init();
  const ops = [];
  for (const col of COLLECTIONS) {
    const keep = new Set((state[col] || []).map((x) => x.id));
    const current = await fb.fs.getDocs(colRef(fb, code, col));
    for (const d of current.docs) if (!keep.has(d.id)) ops.push((b) => b.delete(d.ref));
    for (const item of state[col] || []) {
      const { id, ...data } = item;
      ops.push((b) => b.set(docRef(fb, code, col, id), data));
    }
  }
  // Firestore erlaubt max. 500 Operationen pro Batch.
  for (let i = 0; i < ops.length; i += 400) {
    const batch = fb.fs.writeBatch(fb.db);
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
}
