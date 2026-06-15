# Datenstrategie

Die App arbeitet mit statischen Snapshots. Das Frontend ruft keine externen Sportdatenquellen auf.

## Quellen-Prioritaet (Soll vs. Ist)

**Geplant** (Lastenheft, Starter-Design, Modus `auto`):

1. `api-football` — Primaerquelle (strukturierte Fixture-Events)
2. `wikipedia` — Fallback (kostenlos, nachtraeglich gepflegt)
3. `mock` — nur Dev/CI

**Aktuell in Production** (`sync-data.yml`):

- `SYNC_SOURCE=wikipedia` (direkt, nicht `auto`)
- Grund: Wikipedia-Adapter ist fuer WM 2026 Gruppenspiele ausgebaut; API-Football braucht noch Key und erfolgreichen Tageslauf in Actions
- Modus `auto` ist im Code fertig: `api-football` → `wikipedia` → `mock`

**Ziel-Migration:** `SYNC_SOURCE=auto` in GitHub Actions, sobald `API_FOOTBALL_KEY` gesetzt und ein Tageslauf erfolgreich getestet ist. Wikipedia bleibt dann automatischer Fallback.

## Quellen

1. `mock`
   - lokale Entwicklung
   - Tests
   - stabile Demo-Daten

2. `wikipedia`
   - kostenloser Fallback
   - gut fuer nachtraeglich gepflegte Spiel- und Torinformationen
   - Zeitangaben koennen unvollstaendig sein
   - der Prototyp liest aggregierte `Goalscorers`-Sektionen aus Wikitext
   - fuer WM 2026 zusaetzlich Einzeltore aus `#invoke:football box` auf den Gruppenseiten

3. `api-football`
   - geplante Primaerquelle (Modus `auto` versucht sie zuerst)
   - besser fuer strukturierte Match-Events (Minute, Torart, Spieler-ID)
   - braucht API-Key
   - Free-Plan-tauglicher Weg: `/fixtures?date=YYYY-MM-DD`, danach lokal `league.id=1` und `season=2026` filtern
   - der Adapter liest anschliessend `/fixtures/events?fixture=...` fuer gestartete/beendete WM-Fixtures
   - `API_FOOTBALL_FIXTURE_IDS` bleibt als manueller Debug-Override moeglich
   - `API_FOOTBALL_MAX_REQUESTS` begrenzt HTTP-Calls pro Sync-Lauf hart (Default `90`)

## Wikipedia-Fallback — Stand & Grenzen

Dokumentiert, damit der Fallback bei Umstellung auf `auto` nicht vergessen wird.

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

### Fallback-Stabilitaet: Empfehlung

- **Jetzt:** Wikipedia reicht fuer laufende Gruppenphase; dokumentierte Luecken sind akzeptabel
- **Vor API-Umstellung:** nicht alles fixen — aber K.o.-Kickoffs und Disambiguierung priorisieren, wenn Wikipedia laenger allein laeuft
- **Mit `auto`:** Wikipedia muss nicht perfekt sein; sie muss bei API-Ausfall weiterhin *irgendwelche* korrekten Tore liefern

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

Modus `auto` testen:

```powershell
SYNC_SOURCE=auto
# gleicher Key; API nutzt Tagesfixtures, Wikipedia bleibt Fallback
npm run sync:data
```

### GitHub (wenn lokal OK)

1. Repository -> Settings -> Secrets -> `API_FOOTBALL_KEY`
2. Optional Repository -> Settings -> Variables -> `API_FOOTBALL_DATES` oder `API_FOOTBALL_DATE_FROM` / `API_FOOTBALL_DATE_TO` fuer manuelle Backfills
3. `sync-data.yml`: Default von `wikipedia` auf `auto` - **erst nach erfolgreichem Lokaltest**

### Offen fuer API-Football (Code, nicht Dashboard)

- GitHub-Backfill einmal bewusst ausfuehren, damit API-Football-Historie vor Umstellung vollstaendig ist
- K.o.-Runden-Schedule fuer Wikipedia-Fallback ergaenzen
- API-Call-Budget ist im Adapter und Meta-Snapshot umgesetzt (`sourceRequestCount` / `sourceRequestLimit`)

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
- `meta.json`: Quelle, Status und Sync-Qualitaet

Die App liest keine Rohquelle direkt. Neue Quelladapter sollen weiter interne `GoalRecord`-Daten liefern; falls eine Quelle spaeter strukturierte Fixture-Daten anbietet, kann `matches.json` daraus direkter aufgebaut werden.

## Teilnehmerstatus

`src/config/teams.ts` kann pro Spieler `rosterStatus` enthalten:

- `nominated`
- `not-nominated`
- `unknown`

Der Status dient der UI und Datenqualitaet. Nicht nominierte Spieler (`not-nominated`) bleiben als Nieten im Team und werden nicht ersetzt. Er soll nicht als harte Scoring-Bedingung verwendet werden, weil das echte Torereignis aus der Datenquelle staerker ist als eine manuell gepflegte Kader-Markierung. Fuer Performance ist ein Ausschluss nicht noetig; die Datenmenge bleibt klein.
