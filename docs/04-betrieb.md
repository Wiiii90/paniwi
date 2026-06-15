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
- `API_FOOTBALL_FIXTURE_IDS`: kommagetrennte Fixture-IDs
- `GITHUB_PAGES_BASE`: optionaler Base-Pfad fuer GitHub Pages

## GitHub Actions

`deploy.yml` baut den committed Snapshot und deployed `dist` auf GitHub Pages.

`ci.yml` prueft Pull Requests und Pushes ohne Deploy oder Snapshot-Commit. Er nutzt bewusst `SYNC_SOURCE=mock`.

`sync-data.yml` aktualisiert `public/data/*.json` nur in definierten Turnier-Fenstern, prueft Tests und Build und committet nur geaenderte Snapshots. Der Workflow nutzt standardmaessig:

```text
SYNC_SOURCE=wikipedia
```

### Sync-Rhythmus

Der automatische Sync ist bewusst sparsam:

- nur zwischen 11. Juni und 19. Juli 2026
- nur an Spieltagen laut `src/sync/syncSchedule.ts`
- hoechstens zwei Zeitfenster pro Spieltag: 05:30 UTC und 22:30 UTC
- pro Fenster hoechstens zwei Versuche, wenn sich der Snapshot nicht aendert
- mindestens 120 Minuten Abstand zwischen erfolgreichen Syncs im selben Fenster

Der Workflow ruft `npm run sync:scheduled` auf. Dieses Script prueft den Spielplan und ueberspringt API-Aufrufe ausserhalb der Fenster komplett.

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

Fixture-IDs und nicht-geheime Einstellungen koennen als Repository Variables gepflegt werden:

```text
API_FOOTBALL_FIXTURE_IDS
API_FOOTBALL_BASE_URL
API_FOOTBALL_TIMEOUT_MS
WIKIPEDIA_GOALS_PAGE
WIKIPEDIA_API_ENDPOINT
WIKIPEDIA_TIMEOUT_MS
```

Ohne `API_FOOTBALL_FIXTURE_IDS` faellt `auto` auf Wikipedia und danach Mock zurueck.

## Fehlerverhalten

Wenn alle Datenquellen fehlschlagen, schreibt der Sync nur `public/data/meta.json` mit `status: "error"`. Bestehende Snapshot-Dateien bleiben erhalten.

## Release-Check

Vor einem Push sollten lokal laufen:

```powershell
npm run sync:data
npm test
npm run build
```
