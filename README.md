# Fahrtenbuch 🚗

Eine App für zwei Personen, die sich ein Auto teilen. Ihr tragt eure Fahrten (per Kilometerstand) und alle Autokosten ein. Die App rechnet aus, wer wie viel zahlen muss, und zwar fair nach gefahrenen Kilometern.

## Funktionen

- **Fahrten:** Fahrer (oder **Gemeinsam** – dann zählen die km für jeden zur Hälfte), Datum, Start- und End-Kilometerstand und eine Notiz. Der Start wird automatisch mit dem letzten Kilometerstand vorausgefüllt. Wenn zwischen zwei Fahrten Kilometer fehlen, weist die App darauf hin.
- **Kosten:** Betrag, Kategorie (Tanken, Versicherung, Steuer, Werkstatt …) und wer bezahlt hat.
- **Übersicht:** km pro Person, Kosten pro km, Kostenanteil, bereits bezahlte Beträge und der Saldo.
- **Ausgleich:** Die App zeigt z. B. „Anna zahlt Ben 23,40 €“. Mit *Bezahlt* wird die Zahlung verbucht und der Saldo steht wieder auf 0.
- **CSV-Export** (z. B. für Excel/Numbers) und Umbenennen der Personen.

## So wird gerechnet

```
Anteil einer Person  = Gesamtkosten × (eigene km / alle km)
Saldo                = selbst bezahlt − Anteil + geleistete Ausgleichszahlungen − erhaltene
```

Ein positiver Saldo heißt, man bekommt Geld zurück. Ein negativer Saldo heißt, man muss zahlen. Solange noch niemand gefahren ist, werden die Kosten 50/50 geteilt.

## Web-App (ohne Mac) – `docs/`

Die Web-App im Ordner `docs/` funktioniert auf jedem iPhone über Safari, ohne Mac, ohne Developer-Account und ohne Ablaufdatum.

**Einmalig einrichten (GitHub Pages):**
1. Auf GitHub im Repository auf **Settings → Pages** gehen.
2. Bei *Source* den Eintrag **Deploy from a branch** wählen. Als Branch `claude/eager-cerf-o8pt9j` (oder später `main`) und als Ordner **`/docs`** auswählen, dann **Save**.
3. Nach 1–2 Minuten zeigt GitHub oben die Adresse an, z. B. `https://<name>.github.io/Fahrtenbuch/`.

GitHub Pages ist im kostenlosen Plan nur für **öffentliche** Repositories verfügbar (*Settings → General → ganz unten „Danger Zone“ → Change repository visibility → Make public*). Eure Fahrtdaten liegen trotzdem nie auf GitHub, sondern auf dem iPhone bzw. bei Firebase.

**Auf dem iPhone:** Die Adresse in Safari öffnen, auf **Teilen** tippen und dann **Zum Home-Bildschirm** wählen. Ab dann startet das Fahrtenbuch wie eine App und funktioniert auch offline.

Wichtig: Die Home-Bildschirm-App hat einen eigenen Speicher, getrennt von Safari. Nutzt also immer das App-Symbol und macht ab und zu ein Backup (*Einstellungen → Backup speichern*).

### Sync zwischen zwei Handys (Firebase)

Damit ihr beide auf dem eigenen iPhone eintragen könnt, gleicht die App die Daten über **Firebase** (Google) ab. Das ist kostenlos und braucht keine Kreditkarte. Ohne diese Einrichtung läuft die App rein lokal.

1. Auf [console.firebase.google.com](https://console.firebase.google.com) mit einem Google-Konto anmelden und **Projekt erstellen** wählen (Name z. B. `fahrtenbuch`). Google Analytics kann aus bleiben.
2. Links unter **Build → Authentication** auf **Jetzt starten** klicken. Im Tab *Sign-in method* den Eintrag **Anonym** aktivieren und speichern.
3. Unter **Build → Firestore Database** auf **Datenbank erstellen** klicken. Als Standort `europe-west3 (Frankfurt)` wählen, im **Produktionsmodus** starten.
4. Im Firestore den Tab **Regeln** öffnen, den Inhalt von [`firestore.rules`](firestore.rules) einfügen und **Veröffentlichen**.
5. In der Projektübersicht auf das Symbol **`</>`** (Web-App hinzufügen) klicken, einen Namen vergeben und registrieren. Den angezeigten `firebaseConfig`-Block in [`docs/firebase-config.js`](docs/firebase-config.js) eintragen. Die Werte sind nicht geheim und dürfen öffentlich im Repo stehen.

Danach:
- **Person 1** öffnet die App, gibt beide Namen ein und wählt **Neues Fahrtenbuch anlegen**. Die App zeigt einen 20-stelligen Code und bietet an, ihn zu verschicken.
- **Person 2** installiert die App ebenfalls (Safari → Teilen → Zum Home-Bildschirm), wählt **Mit Code verbinden** und gibt den Code ein.

Ab dann sehen beide denselben Stand. Wer gerade kein Netz hat, kann trotzdem eintragen; die Änderungen werden später übertragen. Der Punkt neben der Überschrift zeigt den Status: grün = synchronisiert, orange = offline, rot = Fehler.

Wer schon lokal Daten erfasst hat, kann unter *Einstellungen → Gemeinsam nutzen → Sync aktivieren* nachträglich umstellen. Die vorhandenen Daten werden dabei hochgeladen.

## Native iOS-App (mit Mac) – `Fahrtenbuch.xcodeproj`

### Starten

Voraussetzung: ein Mac mit **Xcode 16 oder neuer** und ein iPhone mit **iOS 17 oder neuer**.

1. `Fahrtenbuch.xcodeproj` in Xcode öffnen.
2. Links das Projekt *Fahrtenbuch* anklicken, dann **Signing & Capabilities** öffnen und bei *Team* deine Apple-ID auswählen. Falls noch keine Apple-ID eingetragen ist: *Xcode → Settings → Accounts*.
3. Falls Xcode meldet, dass die Bundle-ID vergeben ist: `de.fahrtenbuch.app` in etwas Eigenes ändern, z. B. `de.deinname.fahrtenbuch`.
4. Das iPhone per Kabel anschließen, es oben als Ziel wählen und ▶︎ drücken.
5. Auf dem iPhone unter *Einstellungen → Allgemein → VPN & Geräteverwaltung* dem Entwickler vertrauen. Ab iOS 16 muss außerdem der *Entwicklermodus* aktiviert sein.

> Hinweis: Mit einer kostenlosen Apple-ID läuft die App 7 Tage lang. Danach muss sie einfach erneut aus Xcode installiert werden. Die Daten bleiben erhalten.

## Projektstruktur

```
Fahrtenbuch/
├── App/FahrtenbuchApp.swift     App-Start & Tab-Leiste
├── Models/Models.swift          Datenmodelle (SwiftData): Person, Trip, Expense, Payment
├── Logic/CostSplit.swift        Reine Rechenlogik für die Aufteilung
├── Logic/Formatting.swift       Euro/km-Formatierung, Eingaben parsen
└── Views/                       Alle Bildschirme (SwiftUI)
```

## Ideen für später

- iCloud-Sync, damit beide auf ihrem eigenen iPhone eintragen können (braucht den Apple Developer Account)
- Widget bzw. Kurzbefehl, um eine Fahrt schnell einzutragen
- Monats- oder Jahresabrechnung statt einer fortlaufenden Bilanz
- Fotos von Tankbelegen
