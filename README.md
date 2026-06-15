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

## Sync-Quelle

`npm run sync:data` nutzt standardmaessig Mock-Daten.

```powershell
$env:SYNC_SOURCE="mock"; npm run sync:data
$env:SYNC_SOURCE="auto"; npm run sync:data
$env:SYNC_SOURCE="wikipedia"; npm run sync:data
$env:SYNC_SOURCE="api-football"; npm run sync:data
```

`auto` versucht `api-football`, dann `wikipedia`, dann `mock`. Aktuell bleibt `mock` die stabile Default-Quelle; `wikipedia` ist ein vorsichtiger Prototyp fuer aggregierte Goalscorers-Seiten.

Der Wikipedia-Prototyp liest eine `Goalscorers`-Sektion aus MediaWiki-Wikitext. Die Seite kann ueberschrieben werden:

```powershell
$env:SYNC_SOURCE="wikipedia"
$env:WIKIPEDIA_GOALS_PAGE="2026 FIFA World Cup"
npm run sync:data
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
