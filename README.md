# WM 2026 Panini Liga

Statische MVP-Webapp fuer eine private WM-2026-Panini-Liga.

## Befehle

```powershell
npm install
npm run sync:data
npm test
npm run dev
npm run build
npm run preview
```

## Lokale Ports

- Dev: `http://127.0.0.1:49153`
- Preview: `http://127.0.0.1:49154`

Die Ports sind bewusst weit weg von ueblichen Defaults wie `3000`, `5173`, `5174`, `8000` oder `8080`.

## Datenfluss

Das Frontend ruft keine Sportdaten-API direkt auf. Das Sync-Script schreibt statische JSON-Dateien nach `public/data`.

- `public/data/leaderboard.json`
- `public/data/goals.json`
- `public/data/meta.json`
- `public/data/raw-goals.json`

Aktuell nutzt `npm run sync:data` Mock-Daten. Echte Quellen koennen spaeter ueber die Adapter in `src/sync/sources` ergaenzt werden.

## Scoring

- Normale Tore: 1 Punkt
- Elfmetertore waehrend des Spiels: 1 Punkt
- Eigentore: 0 Punkte
- Elfmeterschiessen: 0 Punkte
