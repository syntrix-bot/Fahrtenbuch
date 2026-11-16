// Firebase-Konfiguration für den Sync zwischen zwei Handys.
//
// Solange hier `null` steht, speichert die App nur lokal auf dem Gerät.
// Zum Aktivieren den Konfigurations-Block aus der Firebase-Konsole einfügen
// (Projekteinstellungen → Meine Apps → Web-App → "SDK-Konfiguration"), z. B.:
//
// export const firebaseConfig = {
//   apiKey: "AIza...",
//   authDomain: "fahrtenbuch-xyz.firebaseapp.com",
//   projectId: "fahrtenbuch-xyz",
//   storageBucket: "fahrtenbuch-xyz.appspot.com",
//   messagingSenderId: "123456789",
//   appId: "1:123456789:web:abc123",
// };
//
// Diese Werte sind nicht geheim – geschützt werden eure Daten durch die
// Firestore-Regeln (siehe firestore.rules) und euren persönlichen Sync-Code.

export const firebaseConfig = null;
