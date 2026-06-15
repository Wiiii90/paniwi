\# Starter Design Document – WM-Panini-Liga Webapp



\## 1. Architekturüberblick



Die App wird als Static-first Data App umgesetzt.



Die eigentliche Webapp ist statisch und wird über GitHub Pages ausgeliefert. Dynamische Daten werden nicht zur Laufzeit im Browser von externen Sportdaten-APIs geladen, sondern regelmäßig durch einen Scheduled Job erzeugt.



\## 2. Zielarchitektur



```text

GitHub Actions Cron

&#x20;       ↓

Sync Script

&#x20;       ↓

Datenquellen:

&#x20; - API-Football Free

&#x20; - Wikipedia MediaWiki API Fallback

&#x20;       ↓

Normalisierung

&#x20;       ↓

Scoring Engine

&#x20;       ↓

Generierte JSON-Dateien

&#x20;       ↓

Vite/React Frontend

&#x20;       ↓

GitHub Pages

```



\## 3. Technologievorschlag



Frontend:



\* Vite

\* React

\* TypeScript

\* CSS Modules, Tailwind oder plain CSS



Datenpipeline:



\* Node.js

\* TypeScript

\* GitHub Actions

\* JSON-Dateien als persistenter Snapshot



Hosting:



\* GitHub Pages



\## 4. Repository-Struktur



```text

wm-paniniliga/

├─ docs/

│  ├─ 01-lastenheft.md

│  ├─ 02-starter-design.md

│  └─ 03-codex-initial-prompt.md

├─ src/

│  ├─ app/

│  │  ├─ components/

│  │  ├─ pages/

│  │  └─ App.tsx

│  ├─ domain/

│  │  ├─ types.ts

│  │  ├─ scoring.ts

│  │  ├─ normalizePlayerName.ts

│  │  └─ buildLeaderboard.ts

│  ├─ config/

│  │  └─ teams.ts

│  └─ sync/

│     ├─ sources/

│     │  ├─ apiFootballSource.ts

│     │  └─ wikipediaSource.ts

│     ├─ normalizeGoals.ts

│     ├─ syncGoals.ts

│     └─ writeStaticData.ts

├─ public/

│  └─ data/

│     ├─ leaderboard.json

│     ├─ goals.json

│     └─ meta.json

├─ .github/

│  └─ workflows/

│     ├─ deploy.yml

│     └─ sync-data.yml

├─ package.json

├─ tsconfig.json

└─ vite.config.ts

```



\## 5. Datenfluss



\### 5.1 Teamdaten



Die Teilnehmerteams werden initial statisch gepflegt.



```ts

export const teams = \[

&#x20; {

&#x20;   owner: "Max",

&#x20;   players: \[

&#x20;     {

&#x20;       name: "Kylian Mbappé",

&#x20;       team: "France",

&#x20;       apiPlayerId: 278,

&#x20;       aliases: \["K. Mbappé", "Mbappe"]

&#x20;     }

&#x20;   ]

&#x20; }

];

```



\### 5.2 Externe Torschützendaten



Das Sync Script ruft die externen Datenquellen ab.



Priorität:



1\. API-Football Free

2\. Wikipedia MediaWiki API



Das Script normalisiert die Daten in ein internes Format.



```ts

export type GoalRecord = {

&#x20; playerName: string;

&#x20; teamName: string;

&#x20; goals: number;

&#x20; source: "api-football" | "wikipedia";

&#x20; fixtureId?: number;

&#x20; minute?: number;

&#x20; detail?: "Normal Goal" | "Penalty" | "Own Goal" | "Penalty Shootout";

};

```



\### 5.3 Scoring



Die Scoring Engine gleicht die normalisierten Torschützen mit den ausgewählten Spielern ab.



Matching-Reihenfolge:



1\. API-Spieler-ID

2\. exakter Name

3\. Aliasname

4\. normalisierter Name ohne Akzente und Sonderzeichen



Default-Regel:



```ts

points = goals;

```



Optionale Regel:



```ts

if (detail === "Penalty") points += 1;

else if (detail === "Normal Goal") points += 2;

else points += 0;

```



\### 5.4 Ausgabe



Das Sync Script schreibt fertige JSON-Dateien nach `public/data`.



Beispiel `leaderboard.json`:



```json

\[

&#x20; {

&#x20;   "rank": 1,

&#x20;   "owner": "Max",

&#x20;   "points": 7,

&#x20;   "goals": 7,

&#x20;   "playersWithGoals": 3

&#x20; }

]

```



Beispiel `meta.json`:



```json

{

&#x20; "lastUpdated": "2026-06-15T20:14:00Z",

&#x20; "source": "api-football",

&#x20; "fallbackUsed": false,

&#x20; "status": "ok"

}

```



\## 6. Frontend-Seiten



\### 6.1 Leaderboard



Route:



```text

/

```



Inhalt:



\* Rangliste

\* Punkte

\* letzte Veränderung

\* Button/Link zu Teamdetails

\* Update-Status



\### 6.2 Teamdetail



Route:



```text

/team/:owner

```



Inhalt:



\* Teilnehmername

\* Spielerliste

\* Tore/Punkte pro Spieler

\* Nationalmannschaft

\* Trefferhistorie des Teams



\### 6.3 Trefferfeed



Route:



```text

/goals

```



Inhalt:



\* chronologische Trefferliste

\* Spieler

\* Team

\* betroffene Teilnehmer

\* Punktewert



\## 7. GitHub Actions



\### 7.1 Deploy Workflow



Der Deploy Workflow baut die Vite-App und veröffentlicht sie auf GitHub Pages.



\### 7.2 Sync Workflow



Der Sync Workflow läuft geplant, z. B.:



\* alle 30 Minuten während der WM

\* zusätzlich manuell per `workflow\_dispatch`



Ablauf:



```text

npm ci

npm run sync:data

npm run build

deploy to GitHub Pages

```



\## 8. Fehlerverhalten



Wenn API-Football fehlschlägt:



\* Wikipedia-Fallback versuchen

\* Fehlerstatus in `meta.json` schreiben

\* letzte erfolgreiche Daten nicht löschen



Wenn beide Quellen fehlschlagen:



\* App bleibt mit letztem Snapshot nutzbar

\* `meta.json` zeigt Fehlerstatus



\## 9. MVP-Scope



MVP enthält:



\* mobile Webapp

\* Leaderboard

\* Teamdetailseiten

\* automatische Datenaktualisierung

\* statische Teamkonfiguration

\* JSON-Snapshots

\* GitHub Pages Deployment



MVP enthält nicht:



\* Login

\* Adminbereich

\* Datenbank

\* Live-WebSockets

\* Push-Nachrichten

\* Bezahl-API

\* vollautomatisches fuzzy Player Matching ohne manuelle Kontrolle



\## 10. Offene Entscheidungen



\* Exakter App-Name

\* Designstil

\* finale Punkte-Regel

\* ob Eigentore zählen sollen

\* ob Torwart-Tore normal zählen

\* ob Teilnehmernamen öffentlich oder gekürzt dargestellt werden

\* wie oft der Sync während der WM laufen soll



