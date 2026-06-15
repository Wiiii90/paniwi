# Betrieb

## Lokale Entwicklung

```powershell
npm install
npm run sync:data
npm test
npm run build
npm run dev
```

Lokale Ports:

- Dev: `http://127.0.0.1:49153`
- Preview: `http://127.0.0.1:49154`

## Umgebungsvariablen

`.env.example` enthaelt eine committbare Vorlage. Echte Secrets gehoeren in `.env` oder in GitHub Secrets.

Wichtige Variablen:

- `SYNC_SOURCE`: `mock`, `auto`, `wikipedia` oder `api-football`
- `WIKIPEDIA_GOALS_PAGE`: Wikipedia-Seite fuer den Wikitext-Prototyp
- `API_FOOTBALL_KEY`: API-Football-Key
- `API_FOOTBALL_DATES`: optionale kommagetrennte API-Football-Tage
- `API_FOOTBALL_DATE_FROM` / `API_FOOTBALL_DATE_TO`: optionales API-Football-Backfill-Fenster
- `API_FOOTBALL_FIXTURE_IDS`: optionaler manueller Debug-Override
- `API_FOOTBALL_MAX_REQUESTS`: harte API-Football-Request-Grenze pro Sync-Lauf, Default `90`
- `GITHUB_PAGES_BASE`: optionaler Base-Pfad fuer GitHub Pages

## GitHub Actions

`deploy.yml` baut den committed Snapshot und deployed `dist` auf GitHub Pages.

`ci.yml` prueft Pull Requests und Pushes ohne Deploy oder Snapshot-Commit. Er nutzt bewusst `SYNC_SOURCE=mock`.

`sync-data.yml` aktualisiert `public/data/*.json` nur in definierten Turnier-Fenstern, prueft Tests und Build und committet nur geaenderte Snapshots.

**Aktuell:** `SYNC_SOURCE=wikipedia` (temporaer, bis API-Football eingerichtet ist)

**Ziel:** `SYNC_SOURCE=auto` (api-football → wikipedia → mock). Details: `docs/03-datenstrategie.md`

### Sync-Rhythmus

Der automatische Sync orientiert sich am **Spielplan**, nicht an festen Tageszeiten:

- Anstosszeiten liegen in `src/config/matchKickoffs.json` (72 Gruppenspiele, aus Wikipedia exportiert)
- Nach voraussichtlichem Spielende (+105 Min) gibt es **3 Check-Fenster**:
  - +15 Minuten
  - +60 Minuten
  - +120 Minuten
- Jedes Fenster ist 30 Minuten breit; GitHub Actions pollt alle 15 Minuten, ruft Wikipedia aber **nur innerhalb eines Fensters** auf
- Pro Fenster maximal **1** Wikipedia-Sync, wenn sich der Snapshot nicht aendert

Spielplan aktualisieren (selten noetig):

```powershell
npm run sync:export-kickoffs
```

Der Workflow ruft `npm run sync:scheduled` auf. Ausserhalb der Fenster bricht das Script sofort ab und loggt die naechsten Fenster.

Manuell jederzeit moeglich:

```text
workflow_dispatch mit force_sync=true
```

Lokal:

```powershell
$env:SYNC_FORCE="true"
$env:SYNC_SOURCE="wikipedia"
npm run sync:scheduled
```

### Push-Feeds / Webhooks

Aktuell bewusst **kein** Live-Push von FIFA oder Drittanbietern. Gruende:

- weniger Abhaengigkeiten und Keys
- Wikipedia-API bleibt die eine legale Quelle
- fuer eine Freundes-Liga reichen 3 Checks nach Spielende

Spaeter: `SYNC_SOURCE=auto` mit API-Football als Primaerquelle; Wikipedia bleibt Fallback (`docs/03-datenstrategie.md`).

### Wikipedia / API-Etikette

Der Wikipedia-Adapter nutzt ausschliesslich die offizielle MediaWiki-API (`action=query`), keine HTML-Scraping-Requests. Pro Sync werden die Turnier- und Gruppenseiten in wenigen Batch-Requests geladen.

Wichtig:

- beschreibender `User-Agent` mit Repo und Kontakt
- kein Retry-Spam bei HTTP 429; stattdessen im naechsten Fenster erneut versuchen
- `WIKIPEDIA_MAX_ATTEMPTS=1` als Default

Fuer API-Football in Actions muss mindestens dieses Repository Secret existieren:

```text
API_FOOTBALL_KEY
```

Nicht-geheime Einstellungen koennen als Repository Variables gepflegt werden:

```text
API_FOOTBALL_DATES
API_FOOTBALL_DATE_FROM
API_FOOTBALL_DATE_TO
API_FOOTBALL_FIXTURE_IDS
API_FOOTBALL_BASE_URL
API_FOOTBALL_TIMEOUT_MS
API_FOOTBALL_MAX_REQUESTS
WIKIPEDIA_GOALS_PAGE
WIKIPEDIA_API_ENDPOINT
WIKIPEDIA_TIMEOUT_MS
```

Ohne `API_FOOTBALL_DATES` oder Datumsfenster nutzt API-Football den aktuellen UTC-Tag. Diese Tageslaeufe ersetzen nur Treffer des geholten Tages und behalten aeltere Snapshot-Tage bei. `API_FOOTBALL_FIXTURE_IDS` ist nur noch ein manueller Override. Jeder API-Football-HTTP-Call wird gegen `API_FOOTBALL_MAX_REQUESTS` gezaehlt; bei Erreichen der Grenze bricht der Adapter ab, statt weiter Requests zu verbrauchen.

## Fehlerverhalten

Wenn alle Datenquellen fehlschlagen, schreibt der Sync nur `public/data/meta.json` mit `status: "error"`. Bestehende Snapshot-Dateien bleiben erhalten.

## Release-Check

Vor einem Push sollten lokal laufen:

```powershell
npm run sync:data
npm test
npm run build
```
