# WM 2026 Panini Liga

Statische MVP-Webapp fuer eine private WM-2026-Panini-Liga.

## Befehle

```powershell
npm install
npm run sync:data
npm test
npm run test:domain
npm run test:snapshots
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

Der API-Football-Adapter liest Fixture-Events. Dafuer werden ein API-Key und konkrete Fixture-IDs benoetigt:

```powershell
$env:SYNC_SOURCE="api-football"
$env:API_FOOTBALL_KEY="..."
$env:API_FOOTBALL_FIXTURE_IDS="12345,67890"
npm run sync:data
```

Optional:

```powershell
$env:API_FOOTBALL_BASE_URL="https://v3.football.api-sports.io"
$env:API_FOOTBALL_TIMEOUT_MS="10000"
```

## Lokale Ports

- Dev: `http://127.0.0.1:49153`
- Preview: `http://127.0.0.1:49154`

Die Ports sind bewusst weit weg von ueblichen Defaults wie `3000`, `5173`, `5174`, `8000` oder `8080`.

## GitHub Actions

- `deploy.yml` baut den aktuell committed Snapshot und veroeffentlicht `dist` auf GitHub Pages.
- `ci.yml` prueft Pushes und Pull Requests mit Mock-Sync, Tests und Build.
- `sync-data.yml` laeuft geplant oder manuell, nutzt standardmaessig `SYNC_SOURCE=auto`, schreibt `public/data/*.json` und committet nur geaenderte Snapshots.
- Beide Workflows fuehren `npm test` und `npm run build` aus.

Fuer Project Pages wird der Base-Pfad aus `GITHUB_REPOSITORY` abgeleitet. Bei Bedarf kann er im Workflow mit `GITHUB_PAGES_BASE` ueberschrieben werden.

Wenn alle Datenquellen fehlschlagen, schreibt der Sync nur `public/data/meta.json` mit `status: "error"`. Die bestehenden Leaderboard- und Goal-Snapshots bleiben erhalten.

Weitere Betriebsdetails stehen in `docs/04-betrieb.md`. Eine Vorlage fuer lokale Umgebungsvariablen liegt in `.env.example`.

## Datenfluss

Das Frontend ruft keine Sportdaten-API direkt auf. Das Sync-Script schreibt statische JSON-Dateien nach `public/data`.

- `public/data/leaderboard.json`
- `public/data/goals.json`
- `public/data/meta.json`
- `public/data/raw-goals.json`
- `public/data/scorers.json`
- `public/data/matches.json`

Aktuell nutzt `npm run sync:data` Mock-Daten. Echte Quellen koennen spaeter ueber die Adapter in `src/sync/sources` ergaenzt werden.

Beim Sync wird `src/config/teams.ts` validiert. Erwartet werden eindeutige Owner, 10 bis 11 Spieler pro Team, Name und Nationalmannschaft pro Spieler sowie keine doppelten Spieler im selben Team.

`goals.json` ist der punkterelevante Trefferfeed. `raw-goals.json` enthaelt alle validen normalisierten Treffer aus der Quelle. `scorers.json` ist die Gesamt-Torschuetzenliste ohne Eigentore und Elfmeterschiessen. `matches.json` gruppiert die Treffer nach Spielen und markiert betroffene Panini-Teams.

`npm run test:snapshots` berechnet Leaderboard, Trefferfeed, Torschuetzenliste und Spiele aus `raw-goals.json` neu und prueft, ob die committed Snapshots konsistent sind.

## Teilnehmerdaten

Fuer den MVP werden echte Teams einmalig in `src/config/teams.ts` gepflegt. Teams haben 10 oder 11 Spieler. Nur wer einen Torwart gezogen hat, darf 11 Spieler aufstellen; pro Team ist maximal ein Torwart erlaubt. Ein 10er-Team enthaelt keinen Torwart.

Am besten lieferst du sie in diesem Format:

```text
Teilnehmer: Name
- Spielername, Nationalmannschaft
- Spielername, Nationalmannschaft
...
```

Fotos aus WhatsApp gehen auch, sollten aber nach OCR/Abtippen kurz gegengeprueft werden. Wichtig sind pro Team 10 bis 11 Spieler, eindeutige Teilnehmernamen und moeglichst die Nationalmannschaft je Spieler.

## Scoring

- Normale Tore: 1 Punkt
- Elfmetertore waehrend des Spiels: 1 Punkt
- Eigentore: 0 Punkte
- Elfmeterschiessen: 0 Punkte und wird nicht in Punktefeeds oder Torschuetzenwertung beruecksichtigt
