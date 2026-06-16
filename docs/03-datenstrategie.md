# Datenstrategie

Die App arbeitet mit statischen Snapshots. Das Frontend ruft keine externen Sportdatenquellen auf.

## Quellen-Trennung

Die App nutzt bewusst **keinen automatischen Multi-Source-Fallback** mehr.

1. `api-football`
   - einzige regulaere Quelle fuer `sync:data` und `sync:scheduled`
   - liefert Fixture- und Goal-Events
2. `wikipedia`
   - nur fuer separate Import-Jobs wie `sync:rosters`
   - kein automatischer Fallback fuer laufende Tore-Snapshots
3. `mock`
   - nur Dev/CI

## Quellen

1. `mock`
   - lokale Entwicklung
   - Tests
   - stabile Demo-Daten

2. `wikipedia`
   - separate Datenquelle fuer manuelle oder eigene Imports
   - aktuell relevant fuer den Kader-Snapshot
   - kein automatischer Tore-Fallback in Production

3. `api-football`
   - Primaerquelle fuer laufende Tore- und Match-Snapshots
   - besser fuer strukturierte Match-Events (Minute, Torart, Spieler-ID)
   - braucht API-Key
   - Free-Plan-tauglicher Weg: `/fixtures?date=YYYY-MM-DD`, danach lokal `league.id=1` und `season=2026` filtern
   - der Adapter liest anschliessend `/fixtures/events?fixture=...` fuer gestartete/beendete WM-Fixtures
   - `API_FOOTBALL_FIXTURE_IDS` bleibt als manueller Debug-Override moeglich
   - `API_FOOTBALL_MAX_REQUESTS` begrenzt HTTP-Calls pro Sync-Lauf hart (Default `90`)

## Wikipedia-Roster-Import — Stand & Grenzen

### Was funktioniert (Stand nach Parser-Fix Juni 2026)

- Gruppenspiele A–L: Tore aus `#invoke:football box` auf 12 Gruppenseiten
- Formate: klassisch (`9'`), Template (`{{goal|6}}`), Mehrfachtore (`{{goal|45+5|pen.|88}}`)
- Eigentore: `o.g.` / `(o.g.)` — 0 Punkte, Nationalitaet = Team des Schuetzen (nicht Spalte in der Box)
- Elfmeter: `pen.` — zaehlt normal 1 Punkt
- Leere `goals1=`/`goals2=`-Spalten werden korrekt getrennt (Bugfix: kein Doppel-Zaehlen)
- Spielplan-Sync: 72 Gruppenspiele in `matchKickoffs.json` (`npm run sync:export-kickoffs`)
- Post-Match-Fenster: +15 / +60 / +120 min nach voraussichtlichem FT (+105 min)
- Etikette: MediaWiki-API only, Batch-Requests, fail fast bei 429

### Bekannte Luecken (Fallback noch verbessern)

| Thema | Status | Risiko wenn offen |
| --- | --- | --- |
| K.o.-Runde | `matchKickoffs.json` nur Gruppenphase | Sync-Fenster greifen ab Achtelfinale nicht |
| Laendercodes | z. B. `TUR` statt Turkey in Labels | Kosmetik, Matching meist OK |
| Wikipedia-Disambiguierung | z. B. `Nathaniel Brown (footballer)` | Tor in `raw-goals`, evtl. kein Panini-Match |
| Format-Aenderungen Wikipedia | Parser an Wikitext gekoppelt | Tore fehlen bis Parser-Update |
| Rate Limits | 429 → Sync in naechstem Fenster | Verzoegerung, kein Datenverlust |
| Knockout-Seiten | Football-Boxes noch nicht importiert | Wie Gruppenphase manuell erweiterbar |

## API-Football — Dashboard & Ersteinrichtung

### Im Dashboard (dashboard.api-football.com)

1. **API-Key holen:** Account → **My Access** → Key kopieren (nur lokal/GitHub Secret, nie committen)
2. **Free-Plan-Limits pruefen:** Requests/Tag im Dashboard — fuer Tests reicht Free meist
3. **Tagesfixtures testen:** Endpoint `GET /fixtures?date=2026-06-15` — ohne `league` und ohne `season`
4. **WM 2026 erkennen:** In der Response nach `league.id=1`, `league.name="World Cup"`, `league.season=2026` filtern
5. **Fixture-ID merken:** Beispiel aus Testdaten: `1539002` fuer `Sweden 5-1 Tunisia`
6. **Tore testen:** `GET /fixtures/events?fixture=1539002` — genau das nutzt unser Adapter

Wichtig: `GET /fixtures?league=1&season=2026&from=...&to=...` kann im Free Plan blockiert sein. Die Tagesabfrage ohne `league`/`season` lieferte im Test aber WM-Fixtures.

Header bei jedem Request:

```text
x-apisports-key: DEIN_KEY
```

Basis-URL: `https://v3.football.api-sports.io`

### Lokal testen (erst 1–2 beendete Spiele)

`.env` anlegen (nicht committen):

```powershell
SYNC_SOURCE=api-football
API_FOOTBALL_KEY=dein_key
# leer lassen => aktueller UTC-Tag
npm run sync:data
```

Erfolg: `public/data/meta.json` zeigt `"source": "api-football"`.

Gezielten Tag testen:

```powershell
SYNC_SOURCE=api-football
API_FOOTBALL_KEY=dein_key
API_FOOTBALL_DATES=2026-06-15
npm run sync:data
```

Einmaliges Backfill-Fenster testen:

```powershell
SYNC_SOURCE=api-football
API_FOOTBALL_KEY=dein_key
API_FOOTBALL_DATE_FROM=2026-06-11
API_FOOTBALL_DATE_TO=2026-06-15
npm run sync:data
```

API-Football-Snapshots werden nach Datumsfenster gemerged: vorhandene Treffer ausserhalb der geholten Tage bleiben erhalten, Treffer innerhalb der geholten Tage werden durch die frische API-Antwort ersetzt. Ein normaler Tageslauf kann dadurch Historie fortschreiben, ein bewusst gesetztes Backfill-Fenster kann einen Zeitraum sauber neu aufbauen.

### GitHub (wenn lokal OK)

1. Repository -> Settings -> Secrets -> `API_FOOTBALL_KEY`
2. Optional Repository -> Settings -> Variables -> `API_FOOTBALL_DATES` oder `API_FOOTBALL_DATE_FROM` / `API_FOOTBALL_DATE_TO` fuer manuelle Backfills
3. `sync-data.yml` nutzt `api-football` direkt

### Offen fuer API-Football (Code, nicht Dashboard)

- GitHub-Backfill einmal bewusst ausfuehren, damit API-Football-Historie vor Umstellung vollstaendig ist
- K.o.-Runden kommen ueber den API-Football-Tageslauf, sobald sie als Fixtures bekannt sind; nach der Gruppenphase gibt es zusaetzliche Wartungsfenster
- API-Call-Budget ist im Adapter und Meta-Snapshot umgesetzt (`sourceRequestCount` / `sourceRequestLimit`)

`API_FOOTBALL_FIXTURE_IDS` ist nur fuer gezielte Debug-/Backfill-Faelle gedacht. Gesetzte Fixture-IDs ergaenzen den normalen Datums-Fetch und ersetzen ihn nicht.

### Einmaliger Wikipedia-/MediaWiki-Kaderabgleich

API-Football bleibt fuer Fixtures und Torereignisse zustaendig. Vollstaendige WM-Kader werden nicht aus API-Football abgeleitet, weil Free-Plan-Endpunkte fuer komplette Saison-/Team-Kataloge blockiert sein koennen und Fixture-Events nur Spieler zeigen, die bereits ein Spielereignis hatten.

Fuer den Kaderstatus gibt es deshalb einen separaten MediaWiki-Snapshot:

```powershell
npm run sync:rosters
```

Das Script liest per offizieller MediaWiki-API die Seite `2026 FIFA World Cup squads`, parst Kader-Templates/Tabellen und schreibt:

- `public/data/rosters.json`
- `public/data/pick-statuses.json`
- `rosters.json` enthaelt nur den echten Turnierkader: Teams, Spieler, Positionen
- `pick-statuses.json` enthaelt den Teilnehmer-Abgleich gegen diesen Kader

Der Abgleich ist absichtlich streng: kanonischer Name plus Alias-Liste, normalisiert ueber `normalizePlayerName`. Keine fuzzy Treffer. Wenn ein echter Spieler nicht matcht, bekommt er einen Alias in `src/config/canonical.ts` statt Sonderlogik im Parser.

`pick-statuses.json` trennt drei Dinge sauber:

- `baselineRosterStatus`: erster festgestellter Status eines Teilnehmer-Picks
- `currentRosterStatus`: aktueller Status im letzten Roster-Snapshot
- `displayStatus`: UI-Status (`nominated`, `not-nominated`, `late-callup`, `unknown`)

Damit gilt:

- ein anfangs nominierter Spieler bleibt fuer die Anzeige nominert
- eine anfangs gesetzte Niete bleibt Niete
- taucht eine fruehere Niete spaeter im echten WM-Kader auf, wird sie als `late-callup` / `nachnominiert` markiert

`sync-rosters.yml` ist ein separater manueller Workflow. Er ist nicht Teil des laufenden Tore-Syncs.

## Event-Modell

Die Pipeline speichert einzelne Torereignisse statt nur aggregierte Summen. Daraus werden Feed, Teamdetails, Leaderboard, Torschuetzenliste und Spiele berechnet.

Wichtige Felder:

- `externalGoalId`
- `matchId`
- `matchLabel`
- `kickedOffAt`
- `minute`
- `scoredAt`
- `timeConfidence`
- `detail`

## Zeitlogik

Der Feed sortiert chronologisch:

1. `scoredAt`, wenn vorhanden
2. `kickedOffAt + minute`, wenn beides vorhanden ist
3. `kickedOffAt`, wenn nur das Spiel bekannt ist
4. unbekannte Zeiten zuletzt

`timeConfidence` macht sichtbar, wie gut die Zeitangabe ist:

- `exact`
- `estimated`
- `match-only`
- `unknown`

## Sync-Regeln

Jeder Sync:

1. Quelle abrufen
2. externe Daten normalisieren
3. Goals validieren
4. doppelte Events entfernen
5. Punkte berechnen
6. JSON-Snapshots schreiben

Eigentore und Tore im Elfmeterschiessen bleiben im Rohdaten-Snapshot moeglich, geben aber keine Punkte. Elfmeterschiessen wird ausserdem nicht in Punktefeeds oder Torschuetzenwertung beruecksichtigt.

## Statische Dateien

- `leaderboard.json`: Rangliste der Teilnehmer
- `goals.json`: nur punkterelevante Treffer ausgewaehlter Spieler
- `raw-goals.json`: alle validen normalisierten Treffer aus der Quelle
- `scorers.json`: Gesamt-Torschuetzenliste, ohne Eigentore und Elfmeterschiessen
- `matches.json`: Spiele mit Treffern, Scoreline und betroffenen Panini-Teams
- `rosters.json`: echter WM-Kader-Snapshot
- `pick-statuses.json`: Teilnehmer-Abgleich gegen den WM-Kader
- `meta.json`: Quelle, Status und Sync-Qualitaet

Die App liest keine Rohquelle direkt. Neue Quelladapter sollen weiter interne `GoalRecord`-Daten liefern; falls eine Quelle spaeter strukturierte Fixture-Daten anbietet, kann `matches.json` daraus direkter aufgebaut werden.

## Teilnehmerstatus

Die Teilnehmer-Picks enthalten nur feste `playerId`s. Der Kaderstatus kommt ausschliesslich aus `public/data/pick-statuses.json`, das aus `rosters.json` abgeleitet wird.

Nicht nominierte Spieler bleiben als Nieten im Team und werden nicht ersetzt. Der Kaderstatus ist reine Anzeige- und Review-Information und keine Scoring-Regel.

## API-Football gegen Roster

Fuer `api-football` gilt absichtlich ein haerterer Vertrag als fuer Mock- oder Wikipedia-Daten:

- jeder Goal-Event muss einem Spieler aus `rosters.json` eindeutig zugeordnet werden koennen
- leichte Namensabweichungen wie Akzente, Bindestriche oder Initial + Nachname werden generisch normalisiert
- Eigentore werden ebenfalls gegen den echten Roster gemappt, notfalls ueber die Gegenmannschaft aus dem Match-Label
- wenn ein API-Football-Torschuetze nicht eindeutig gegen `rosters.json` gematcht werden kann, bricht der Rebuild/Snapshot bewusst mit Fehler ab
