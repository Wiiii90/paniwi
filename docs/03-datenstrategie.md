# Datenstrategie

Die App arbeitet mit statischen Snapshots. Das Frontend ruft keine externen Sportdatenquellen auf.

## Quellen

1. `mock`
   - lokale Entwicklung
   - Tests
   - stabile Demo-Daten

2. `wikipedia`
   - kostenloser Fallback
   - gut fuer nachtraeglich gepflegte Spiel- und Torinformationen
   - Zeitangaben koennen unvollstaendig sein
   - der aktuelle Prototyp liest aggregierte `Goalscorers`-Sektionen aus Wikitext

3. `api-football`
   - spaetere Primaerquelle, falls Free Plan und WM-2026-Abdeckung reichen
   - besser fuer strukturierte Match-Events
   - braucht API-Key und Rate-Limit-Handling
   - der Adapter liest Fixture-Events fuer konfigurierte `API_FOOTBALL_FIXTURE_IDS`

## Event-Modell

Die Pipeline speichert einzelne Torereignisse statt nur aggregierte Summen. Daraus werden Feed, Teamdetails und Leaderboard berechnet.

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

Eigentore und Tore im Elfmeterschiessen bleiben im Rohdaten-Snapshot moeglich, geben aber keine Punkte.
