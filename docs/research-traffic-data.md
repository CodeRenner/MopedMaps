# Recherche: Freie Daten zu Verkehrsmengen, Stau und Baustellen

Stand: 2026-10-08. Nur Web-Recherche plus Stichproben-Downloads (curl) der
genannten Endpunkte. Was nicht selbst geprüft wurde, ist als **(nicht verifiziert)**
markiert.

## Kurzfassung und Empfehlung

**Verkehrsmengen (DTV):**
- Für Baden-Württemberg gibt es eine sehr gute, freie Quelle: die **SVZ-Zählstellen-CSV
  des Verkehrsministeriums BW** (über MobiData BW). Sie enthält 5.638 Zählstellen mit
  Koordinaten, Straßenklasse, Straßennummer und **DTV 2024 (Kfz und SV)**, und zwar
  nicht nur für A/B, sondern auch für **2.153 Landes- und 2.294 Kreisstraßen**.
  Lizenz: dl-de/by-2-0. Direkter Download ohne Registrierung, 650 KB.
- Bundesweit (nur A und B) gibt es die **BASt SVZ 2021** als Excel-Dateien mit
  UTM32-Koordinaten (CC BY 4.0).
- **Gemeindestraßen / innerstädtische Straßen: keine freie Quelle gefunden**, auch
  nicht für Freiburg. Dort bleibt nur der OSM-Proxy (highway-Klasse, lanes, maxspeed,
  Buslinien), den MopedMaps im Risikomodell ohnehin schon nutzt.

**Baustellen / Sperrungen / Stau:**
- BW: **MobiData BW** liefert Baustellen (B/L/K-Straßen, GeoJSON-LineStrings, ~940
  Einträge, ~1 MB) und Verkehrsmeldungen der Landesmeldestelle (DATEX II, alle 10 min),
  beide dl-de/by-2-0, ohne Key, **CORS `*`**.
- Freiburg: **WFS "Verkehrsrelevante Baustellen"** der Stadt (GeoJSON-Polygone,
  dl-de/by-2-0, CORS `*`), aktuell 15 Einträge.
- Autobahnen: **verkehr.autobahn.de** (inoffiziell dokumentiert via bund.dev), ohne Key,
  CORS `*`, Lizenz aber **unklar**.
- **Kostenlose Echtzeit-Stau-/Flussdaten für alle Straßen gibt es nicht.** TomTom
  (und analog HERE/Google) brauchen API-Keys und Kundenkonto -> widerspricht den
  Projektregeln.

**Empfehlung für MopedMaps:**
1. **Jetzt sinnvoll (passt zur Architektur):** In der Pipeline die BW-SVZ-CSV einlesen,
   DTV per Straßennummer (`ref`) + Nähe auf OSM-Wege matchen und als zusätzliches
   Roh-Attribut `dtv` (bzw. eine DTV-Klasse) in den Kanten speichern. Das Risikomodell
   kann damit stark befahrene L/K-Straßen bestrafen, die per OSM-Klasse harmlos wirken.
   Für andere Bundesländer: BASt-2021 (nur A/B) als Fallback, sonst OSM-Proxy.
   Aufwand moderat, monatlicher Build reicht (DTV ändert sich langsam).
2. **Baustellen/Sperrungen: optional, später.** Die Daten wären technisch einfach
   (kein Key, CORS offen). Aber CLAUDE.md sagt "No live data". Zwei Varianten zur
   Entscheidung durch den Owner:
   a) Täglicher GitHub-Action-Job erzeugt ein kleines `closures.json` (nur
      Vollsperrungen) auf Cloudflare Pages; App lädt es optional. Bleibt "statisch".
   b) Live-Abruf im Browser (CORS geht), aber dann Drittanbieter-Requests mit IP
      des Nutzers und Abhängigkeit von fremder Verfügbarkeit.
   Der monatliche Graph-Build ist für Baustellen zu träge.
3. **Stau: nicht verfolgen.** Kein freier flächendeckender Feed; die vorhandenen
   Meldungen (LMS BW, Autobahn) betreffen fast nur Autobahnen, die Mopeds < 60 km/h
   ohnehin nicht nutzen dürfen.

## Quellenübersicht

| Quelle | Abdeckung | Aktualität | Zugang | Lizenz | Eignung |
|---|---|---|---|---|---|
| SVZ-Zählstellen-CSV BW (VM BW / MobiData BW) | BW, A/B/L/K, 5.638 Punkte, keine Gemeindestr. | DTV 2024, Datei vom 2026-06-26 | Direkter CSV-Download | dl-de/by-2-0 | **Sehr gut** (Pipeline) |
| Endergebnisse SVZ BW (XLSX/PDF) | BW, A/B/L/K, 2010-2024 | jährlich | ZIP-Download | dl-de/by-2-0 | Gut, aber CSV ist einfacher |
| Dauerzählstellen BW (~150) | BW, v. a. A/B/L | jährlich, Stunden-/Monatsganglinien | ZIP (PDF/XLSX) | dl-de/by-2-0 | Gering (zu wenige Punkte) |
| BASt SVZ 2021 (Excel) | DE, nur A und B, mit UTM32-Koordinaten | Zählung 2021, Stand 03/2023 | Direkter Download (7 + 20 MB) | CC BY 4.0 | Gut als bundesweiter Fallback für B-Straßen |
| BASt Dauerzählstellen Stundenwerte | DE, A und B | 2003-2024 | ZIP-Download | CC BY 4.0 | Gering (nur Punkte, A/B) |
| MobiData BW Baustellen | BW, B/L/K (BEMaS) | laufend | GeoJSON/DATEX II/CIFS, kein Key, CORS `*` | dl-de/by-2-0 | Gut (Sperrungen) |
| MobiData BW Verkehrsmeldungen (LMS BW) | BW, v. a. Autobahn/B | alle 10 min | DATEX II / TIC3, kein Key, CORS `*` | dl-de/by-2-0 | Gering für Mopeds |
| Stadt Freiburg Baustellen-WFS | Freiburg, Hauptverkehrsstraßen | "regelmäßig" | WFS -> GeoJSON/GPKG/SHP, CORS `*` | dl-de/by-2-0 | Gut lokal |
| Autobahn GmbH API (verkehr.autobahn.de) | DE, nur Autobahnen | Echtzeit | REST/JSON, kein Key, CORS `*` | **unklar** | Gering (Mopeds < 60 km/h nicht auf BAB) |
| Mobilithek (BMDV) | DE, Sammelportal | variiert | teils offen, teils Registrierung | variiert | Nur als Katalog |
| TomTom / HERE / Google Traffic | DE, alle Straßen | Echtzeit | API-Key + Konto | proprietär | **Ausgeschlossen** |
| OSM-Proxy (highway, lanes, maxspeed, Busrouten) | weltweit | monatlich | schon in Pipeline | ODbL | Fallback, bereits genutzt |

## Notizen pro Quelle

### 1. SVZ-Zählstellen-CSV Baden-Württemberg (Top-Kandidat)
- Datensatz "Karte der Straßenverkehrszählung in Baden-Württemberg", Herausgeber
  Verkehrsministerium BW: https://mobidata-bw.de/dataset/karte_strassenverkehrszaehlung
- CSV: https://mobidata-bw.de/vm/Karte_Strassenverkehrszaehlung_BW/SVZ-Zaehlstellen_2026-06-26_augmented_SVZ2024.csv
  (Dateiname ändert sich bei Updates -> in der Action über die CKAN-API von MobiData BW
  die aktuelle Ressourcen-URL auflösen statt hart zu kodieren).
- Selbst geprüft: Spalten `svznr, zstart, klasse, nummer, gpsx1, gpsy1, RI, RII,
  DTV2024, DTVSV`. `zstart` = TM (temporäre Messung, 4.832), MZ (manuell, 653),
  DZ (Dauerzählstelle, 153). `klasse` = A 170, B 1.021, L 2.153, K 2.294.
  Median-DTV: A 64.700, B 12.400, L 4.900, K 1.700 Kfz/24h. Koordinaten WGS84,
  UTF-8. Alle Zeilen haben einen DTV-Wert.
- Freiburg-Umgebung (ca. ±9 km): 40 Zählstellen (16 L, 12 K, 10 B, 2 A), z. B.
  B 3 Freiburg-Schnellstraße 51.320, L 116 Umkirch 12.087, K 4979 Umkirch 4.844.
  **Innerstädtische Gemeindestraßen fehlen.**
- `RI`/`RII` beschreiben den Zählabschnitt von/bis (Freitext, z. B. "Einm. K 2879 in
  L 507"). Der Punkt repräsentiert also einen Abschnitt zwischen zwei Knoten.
- Matching auf OSM: OSM-`ref` hat dasselbe Format ("L 116", "K 4979", "B 3").
  Vorgehen: Punkt auf nächstgelegenen OSM-Weg mit passender `ref` snappen
  (Toleranz z. B. 50 m), dann den DTV entlang derselben `ref` bis zur nächsten
  Zählstelle bzw. bis zu Kreuzungen mit Straßen höherer Klasse propagieren.
  Ohne Treffer: Wert nicht übernehmen (kein Raten).
- Lizenz dl-de/by-2-0 (https://www.govdata.de/dl-de/by-2-0): Nutzung, Bearbeitung und
  Weitergabe auch kommerziell erlaubt, Pflicht: Namensnennung, Lizenzverweis,
  Hinweis auf Veränderung. Mit einer MIT-App vereinbar, solange die abgeleiteten
  Daten mit Quellenvermerk ausgeliefert werden (Daten fallen nicht unter MIT).

### 2. Weitere BW-Verkehrszählungsdaten (MobiData BW)
- Endergebnisse SVZ BW 2010-2024 als XLSX/PDF, nach A/B/L/K:
  https://mobidata-bw.de/dataset/endergebnisse_strassenverkehrszaehlung
- Dauerzählstellen BW (~150, Ganglinien, Stundenwerte einzelner Tage):
  https://mobidata-bw.de/dataset/ergebnisse_ganglinien_dauerzaehlstellen
  (Beispiel-PDF: https://mobidata-bw.de/vm/Ergebnisse_Ganglinien_Dauerzaehlstellen_BW/Ergebnisse_2021_PDF/VZ_2021_Jahr.pdf)
- Bundesweite SVZ, BW-Ausschnitt (nur alte Jahrgänge 2005-2015 als PDF):
  https://mobidata-bw.de/dataset/bundesweite_strassenverkehrszaehlung
- Alle dl-de/by-2-0. Für MopedMaps reicht die CSV aus Abschnitt 1; die
  Dauerzählstellen-Ganglinien wären höchstens für tageszeitabhängige Gewichte
  interessant (später, nicht nötig).

### 3. BASt: Straßenverkehrszählung 2021 und Dauerzählstellen
- SVZ 2021 Downloads (Autobahnen-2021.xlsx 7 MB, Bundesstrassen-2021.xlsx 20 MB,
  Ergebnis- und Methodikbericht): https://www.bast.de/DE/Publikationen/Statistik/Verkehrsdaten/Manuelle-Zaehlung.html
- Selbst geprüft (Bundesstraßen-Excel): enthält `X_Koordinate`/`Y_Koordinate`
  (ETRS89 / UTM 32N), Straße, Zählstellen-Nr., von/nach Netzknoten, DTV Kfz/SV,
  Freiburg-Abschnitte (z. B. "B3 Freiburg-Industriegebiet") sind enthalten.
  **Nur A und B, keine L/K/Gemeindestraßen.** Nächste Zählung: SVZ 2025
  (Richtlinien: https://www.bast.de/DE/Publikationen/Statistik/Verkehrsdaten/2025/Richtlinien-2025.pdf?__blob=publicationFile&v=1),
  Ergebnisse noch nicht gefunden **(nicht verifiziert)**.
- Dauerzählstellen-Stundenwerte 2003-2024 (ZIP, Millionen Zeilen):
  https://www.bast.de/DE/Themen/Digitales/HF_1/Massnahmen/verkehrszaehlung/Stundenwerte.html
- Lizenz: CC BY 4.0, Quelle "Bundesanstalt für Straßen- und Verkehrswesen":
  https://www.bast.de/DE/Themen/Digitales/HF_1/Massnahmen/verkehrszaehlung/Nutzungsbedingungen.html
- Matching: Koordinate -> nächster OSM-Weg mit passender `ref`, wie oben.
- Nutzen für BW gering (BW-CSV ist neuer und umfassender), aber bundesweit der
  einzige einheitliche Datensatz für B-Straßen. Andere Länder haben eigene
  Verkehrsmengenkarten (z. B. Bayern BAYSIS, Niedersachsen), jeweils separat zu prüfen.

### 4. MobiData BW: Baustellen und Verkehrsmeldungen
- Baustelleninformationen BW (BEMaS, Bundes-, Landes-, Kreisstraßen):
  https://mobidata-bw.de/dataset/baustelleninformationen-baden-wurttemberg
  - GeoJSON: https://api.mobidata-bw.de/datasets/traffic/roadworks/roadworks_geojson.json
  - DATEX II: https://api.mobidata-bw.de/datasets/traffic/roadworks/roadworks_svzbw.datex2.xml
  - CIFS (Waze-Format): https://api.mobidata-bw.de/datasets/traffic/roadworks/roadworks_cifs.json
  - Selbst geprüft: 939 Features (937 LineStrings), `type` = CONSTRUCTION (486) oder
    ROAD_CLOSED (453), mit `street` ("B31a Umkirch-Freiburg"), `direction`,
    `starttime`/`endtime`. Antwort hat `Access-Control-Allow-Origin: *`. ~1,1 MB.
  - Matching: LineString per Puffer (z. B. 15 m) und `ref`-Abgleich auf OSM-Kanten
    legen; nur `ROAD_CLOSED` als Sperre, CONSTRUCTION höchstens als Malus.
- Verkehrsmeldungen BW (Landesmeldestelle; Stau, Unfälle, Sperrungen, Veranstaltungen,
  alle 10 min): https://mobidata-bw.de/dataset/meldung
  - DATEX II: https://api.mobidata-bw.de/datasets/traffic/incidents/incidents_lmsbw.datex2.xml
  - Selbst geprüft: ~1,8 MB, Lagebezug mit Koordinaten und OpenLR, nur wenige
    Stau-Meldungen (queuing/stationary traffic: 5 zum Abrufzeitpunkt). CORS `*`.
- Lizenz laut Datensatzseiten dl-de/by-2-0. Eine Suchtreffer-Zusammenfassung nannte
  für DATEX-Baustellen CC BY 4.0 -> vor Nutzung auf der Datensatzseite nachsehen.
- MobiData BW leitet die Daten auch an die Mobilithek weiter.

### 5. Stadt Freiburg (Open Data)
- Baustellen: Datensatz "Verkehrsrelevante Baustellen im öffentlichen Verkehrsraum der
  Stadt Freiburg i. Br." (Garten- und Tiefbauamt), gefunden über GovData/daten.bw.
  - GeoJSON-WFS: https://geoportal.freiburg.de/wfs/gut_baustellen/gut_baustellen?service=wfs&version=2.0.0&SRSNAME=EPSG:4326&request=getfeature&typename=baustellenumgriffe&outputformat=GEOJSON
  - Selbst geprüft: 15 **Polygone** (Baustellenumgriffe) mit `name`, `lage`,
    `zeitraum_von/bis`, `verkehrshinweis` (Freitext, z. B. "Vollsperrung ...").
    CORS `*`. Lizenz dl-de/by-2-0.
  - Matching: Polygon-Verschneidung mit OSM-Kanten. Ob gesperrt oder nur
    eingeschränkt, steht nur im Freitext -> schwer automatisch auswertbar.
  - Kartenseite: https://www.freiburg.de/pb/231323.html
- Weitere Freiburger Datensätze (Parkleitsystem, Verkehrszeichen, Radnetz,
  Straßennetz-WFS: https://geoportal.freiburg.de/wfs/strassennetz/strassennetz?...):
  über https://mobidata-bw.de/dataset/?q=Freiburg und GovData.
- **Kfz-Verkehrsmengen der Stadt Freiburg: nicht als Open Data gefunden** (Suche in
  GovData, MobiData BW, Web). Möglicherweise nur als PDF in Verkehrsplanungsunterlagen
  **(nicht verifiziert)**.

### 6. Autobahn GmbH API
- Basis-URL `https://verkehr.autobahn.de/o/autobahn/`, Endpunkte je Autobahn:
  `roadworks`, `warning`, `closure`, `webcam`, ... Doku (Community, bund.dev):
  https://github.com/bundesAPI/autobahn-api und https://autobahn.api.bund.dev/
- Selbst geprüft: kein Key, `Access-Control-Allow-Origin: *`; `warning` für A5 enthielt
  Staumeldungen mit Koordinaten und Verzögerung (ID-Präfix "INRIX" -> Stau-Info stammt
  vermutlich von INRIX).
- **Lizenz/Nutzungsbedingungen nicht offiziell auffindbar.** Ein Drittanbieter
  (https://www.autobahn-baustellen.de/agb/) spricht von dl-de/by-2-0 für Baustellen,
  das ist keine Primärquelle. Für MopedMaps ohnehin wenig relevant (Mopeds < 60 km/h
  dürfen nicht auf die Autobahn).

### 7. Mobilithek
- Nationaler Zugangspunkt des BMDV (Nachfolger von MDM und mCLOUD):
  https://mobilithek.info/ (Seite rendert per JavaScript, Inhalte nicht per Fetch
  lesbar). Angebote sind teils offen, teils nur mit Registrierung/Abo oder Zertifikat
  **(nicht im Detail verifiziert)**. Für BW sind die MobiData-BW-Endpunkte direkter
  und offen. Für andere Bundesländer: Mobilithek als Katalog durchsuchen.

### 8. Open Data BW (daten.bw)
- Landesportal, das u. a. die Freiburger Datensätze listet (in GovData sichtbar als
  "Open Data Baden-Württemberg"). Die eigene Suche von daten-bw.de war per Fetch nicht
  abrufbar; die Suche lief über die GovData-CKAN-API
  (https://www.govdata.de/ckan/api/3/action/package_search). Kein zusätzlicher
  Verkehrsmengen-Datensatz gefunden.

### 9. Echtzeit-Stau (kommerziell)
- TomTom Traffic Flow/Incidents: Free-Tier (200k Requests/Monat), aber API-Key über
  Developer-Konto nötig: https://docs.tomtom.com/pricing . Nutzungsbedingungen zu
  Caching/Weitergabe nicht geprüft. HERE und Google analog mit Key
  **(nicht verifiziert)**. Mit "no API keys, no backend" nicht vereinbar (Key wäre im
  Client öffentlich).
- Linkliste offener Verkehrsdaten (GraphHopper): https://github.com/graphhopper/open-traffic-collection
  -> für Deutschland nur Städte (Köln, Düsseldorf, Hamburg, ...), BASt-Zählungen,
  Mobilithek und die Autobahn-API. Kein bundesweiter freier Verkehrsfluss.

### 10. OSM-Proxy (Fallback, überall verfügbar)
- `highway` (primary/secondary/tertiary), `lanes`, `maxspeed`, `oneway`, Mitgliedschaft
  in `route=bus`-Relationen, `junction=roundabout`, Dichte von `highway=traffic_signals`.
  Bereits im Risikomodell (siehe docs/risk-model.md). DTV-Daten aus Abschnitt 1 wären
  eine Kalibrierhilfe: Median-DTV je OSM-Klasse in BW messen und als Default für
  Straßen ohne Zählwert nutzen.

## Lizenz-Hinweise für MopedMaps
- dl-de/by-2-0 und CC BY 4.0 erlauben Weitergabe abgeleiteter Daten mit
  Namensnennung. In der UI/Doku ergänzen, z. B. "Verkehrsmengen: Verkehrsministerium
  Baden-Württemberg, dl-de/by-2-0 (bearbeitet)", "BASt, CC BY 4.0",
  "Baustellen: MobiData BW / Stadt Freiburg, dl-de/by-2-0".
- Die Graph-Chunks sind ODbL-abgeleitet (OSM). Zusätzliche Attribute aus
  dl-de/by-Quellen sollten kompatibel sein, solange Attribution erhalten bleibt
  **(keine Rechtsberatung, vor Release kurz prüfen)**.

## Offene Punkte
- Entscheidung Owner: Baustellen/Sperrungen überhaupt? Wenn ja, täglicher
  Action-Job (statisches JSON) oder Live-Abruf im Browser? CLAUDE.md sagt bisher
  "No live data".
- Wie stark soll DTV ins Risiko eingehen (Schwellen z. B. < 2.000 / 2.000-8.000 /
  > 8.000 Kfz/24h)? Konstanten in die Config, nicht raten.
- Andere Bundesländer: eigene Verkehrsmengenkarten mit L/K-Straßen? Einzeln prüfen
  (Bayern, NRW, Niedersachsen ...). Bisher nur BW verifiziert.
- Innerstädtische Verkehrsmengen Freiburg: bei der Stadt (Garten- und Tiefbauamt)
  anfragen, ob Zählwerte als Open Data verfügbar gemacht werden können.
- Lizenz der Autobahn-API offiziell unklar; MobiData-Baustellen: dl-de/by-2-0 vs.
  CC BY 4.0 auf der Ressourcenseite bestätigen.
- Stabile URL der SVZ-CSV: Dateiname enthält Datum -> per CKAN-API auflösen.
- SVZ 2025 (BASt) erscheint voraussichtlich 2026/2027, dann Fallback aktualisieren.
