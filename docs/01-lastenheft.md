\# Lastenheft – WM-Panini-Liga Webapp



\## 1. Ziel des Produkts



Es soll eine kleine, mobil nutzbare Webapp entstehen, mit der eine private Freundesgruppe während der Fußball-WM 2026 automatisch die Punkte ihrer eingesendeten Panini-Teams verfolgen kann.



Jeder Teilnehmer hat vor Turnierbeginn eine feste Mannschaft aus 10 bis 11 Spielern eingereicht. Die Mannschaften sind nachträglich nicht mehr editierbar. Punkte entstehen ausschließlich durch Tore der ausgewählten Spieler während der WM 2026.



Die App soll automatisch aktualisierte Torschützendaten aus kostenlosen und legal nutzbaren Quellen beziehen und daraus ein Leaderboard berechnen.



\## 2. Zielgruppe



Die Zielgruppe ist eine private Gruppe von Freunden. Die Nutzer sollen die App ohne Installation und ohne Account auf dem Smartphone öffnen können.



\## 3. Grundannahmen



\* Die Teams wurden bereits außerhalb der App, z. B. per WhatsApp, eingesendet.

\* Die App ist read-only.

\* Es gibt keine öffentliche Registrierung.

\* Es gibt keine Admin-Oberfläche im MVP.

\* Die Teilnehmer-Teams werden initial als statische Konfigurationsdatei gepflegt.

\* Die App soll kostenlos betrieben werden.

\* GitHub Pages wird als statisches Hosting bevorzugt.

\* Automatische Datenaktualisierung erfolgt über GitHub Actions oder einen vergleichbaren Scheduled Job.

\* Die App nutzt keine bezahlten APIs.

\* Scraping soll vermieden werden, außer eine Quelle erlaubt automatisierten Zugriff rechtlich und technisch nachvollziehbar.



\## 4. Funktionale Anforderungen



\### F-01 Teilnehmerverwaltung



Das System muss eine feste Liste von Teilnehmern laden können.



Jeder Teilnehmer besitzt:



\* einen Anzeigenamen

\* eine feste Liste ausgewählter Spieler

\* optional eine Teamfarbe oder ein Icon für die Darstellung



\### F-02 Spielerzuordnung



Das System muss pro ausgewähltem Spieler mindestens folgende Informationen speichern können:



\* Anzeigename

\* Nationalmannschaft

\* optionale API-Spieler-ID

\* optionale Aliasnamen zur besseren Zuordnung



Beispiel:



```json

{

&#x20; "owner": "Max",

&#x20; "players": \[

&#x20;   {

&#x20;     "name": "Kylian Mbappé",

&#x20;     "team": "France",

&#x20;     "apiPlayerId": 278,

&#x20;     "aliases": \["K. Mbappé", "Mbappe"]

&#x20;   }

&#x20; ]

}

```



\### F-03 Torschützendaten abrufen



Das System muss regelmäßig aktuelle Torschützendaten der WM 2026 abrufen.



Bevorzugte Datenquellen:



1\. Kostenlose Sportdaten-API, z. B. API-Football Free Plan

2\. Wikipedia MediaWiki API als kostenloser Fallback



Die Datenquelle darf nicht direkt aus dem Browser angesprochen werden, wenn dafür ein API-Key erforderlich ist.



\### F-04 Daten normalisieren



Das System muss externe Torschützendaten in ein eigenes internes Format überführen.



Ein normalisiertes Torereignis enthält mindestens:



\* Spielername

\* Nationalmannschaft

\* Anzahl Tore oder einzelnes Torereignis

\* optional Spiel-ID

\* optional Minute

\* optional Torart, z. B. normales Tor, Elfmeter, Eigentor

\* Datenquelle

\* Zeitpunkt des letzten Datenabrufs



\### F-05 Punkte berechnen



Das System muss aus den normalisierten Torschützendaten automatisch Punkte berechnen.



Default-Regel:



\* Jedes regulär gezählte Tor eines ausgewählten Spielers zählt 1 Punkt.



Optionale Erweiterungsregel:



\* Elfmetertore zählen 1 Punkt.

\* Sonstige Tore zählen 2 Punkte.

\* Tore im Elfmeterschießen zählen nicht.

\* Eigentore zählen nicht für den ausgewählten Spieler.



Die Default-Regel ist MVP-relevant. Die Erweiterungsregel ist optional.



\### F-06 Leaderboard anzeigen



Die App muss ein Leaderboard anzeigen.



Das Leaderboard enthält:



\* Rang

\* Teilnehmername

\* Gesamtpunkte

\* optional Anzahl der heutigen Punkte

\* optional letzte Veränderung

\* optional Gleichstandsanzeige



Das Leaderboard soll mobil gut lesbar sein.



\### F-07 Teamdetails anzeigen



Die App muss pro Teilnehmer eine Detailansicht anzeigen.



Die Detailansicht enthält:



\* Teilnehmername

\* alle ausgewählten Spieler

\* Nationalmannschaft je Spieler

\* Tore/Punkte je Spieler

\* optional Trefferhistorie je Spieler



\### F-08 Trefferhistorie anzeigen



Die App soll eine chronologische Liste erkannter Treffer anzeigen können.



Jeder Treffer enthält, falls verfügbar:



\* Minute

\* Spieler

\* Nationalmannschaft

\* Spiel

\* Teilnehmer, der dadurch Punkte erhalten hat

\* Punktewert



Diese Funktion ist für den MVP erwünscht, aber nicht zwingend kritisch.



\### F-09 Update-Status anzeigen



Die App muss anzeigen, wann die Daten zuletzt aktualisiert wurden.



Die App soll außerdem anzeigen:



\* genutzte Datenquelle

\* ob der letzte Abruf erfolgreich war

\* ob ein Fallback verwendet wurde



\### F-10 Statische Auslieferung



Die App muss als statische Website ausgeliefert werden können.



Die erzeugten JSON-Dateien sollen im Frontend geladen werden können:



\* `leaderboard.json`

\* `goals.json`

\* `teams.json` oder eingebettete Teamdaten

\* `meta.json`



\## 5. Nicht-funktionale Anforderungen



\### NF-01 Portabilität



Die App soll ohne eigenen dauerhaft laufenden Backend-Server funktionieren.



\### NF-02 Kosten



Der Betrieb soll kostenlos bleiben.



\### NF-03 Datenschutz



Die App verarbeitet keine sensiblen Daten. Es werden nur Teilnehmernamen und Spielerlisten angezeigt.



\### NF-04 Wartbarkeit



Die App soll so strukturiert sein, dass Datenquellen später ausgetauscht werden können.



\### NF-05 Rechtliche Vorsicht



Automatisiertes Scraping von FIFA, Sportportalen oder anderen Websites soll vermieden werden, wenn Nutzungsbedingungen oder technische Schutzmaßnahmen dagegen sprechen.



\### NF-06 Mobiloptimierung



Die App soll primär auf Smartphones funktionieren.



\### NF-07 Robustheit



Wenn eine Datenquelle ausfällt, soll die App weiterhin die zuletzt erfolgreich generierten Daten anzeigen.



\## 6. Abgrenzung des MVP



Nicht Bestandteil des MVP:



\* Login

\* Registrierung

\* Admin-UI

\* Teamänderungen über die App

\* Kommentare/Chat

\* Push-Benachrichtigungen

\* Live-Ticker im Sekundentakt

\* Datenbankserver

\* Bezahlte Sportdaten-APIs

\* Native iOS-/Android-App



\## 7. Erfolgskriterium



Der MVP gilt als erfolgreich, wenn alle Teilnehmer per Link ein mobiles Leaderboard öffnen können und sich die Punkte während der WM automatisch aktualisieren, sobald neue Torschützendaten verfügbar sind.



