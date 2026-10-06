# Projektbrief: Offline-Routenplaner für 45-km/h-Roller (PWA)

## Ziel
Kostenlose, quelloffene Web-App (PWA), die Routen für Kleinkrafträder
mit 45 km/h Vmax plant. Das Routing läuft komplett auf dem Handy,
ohne Server und ohne Live-Daten (kein Stau).

## Fahrzeugprofil (in der App einstellbar)
- Höchstgeschwindigkeit (vmax) frei einstellbar, mit Voreinstellungen
  (z.B. 25, 45 km/h)
- Antriebsart einstellbar: Elektro oder Verbrenner
- Zugangsregeln hängen von vmax ab: unter 60 km/h keine Autobahnen und
  Kraftfahrstraßen (motorroad=yes); ab 60 km/h konfigurierbar erlaubt
- Radwege nur, wenn explizit freigegeben (moped=yes / "Mofa frei")
- Standardfall des Projekts: Klasse AM, 45 km/h

## Standort
- Eingabe per Postleitzahl (PLZ), danach wird das Straßennetz im Umkreis
  von 75 km geladen (Radius als Konstante in der Config)
- Routen sind auf diesen Umkreis beschränkt

## Architektur (Entscheidung: Client-only)
1. Vorverarbeitung (Python-Pipeline, lokal oder per GitHub Action):
   OSM-Extrakt Deutschland (Geofabrik) -> Routing-Graph, in räumliche
   Kacheln (Chunks) aufgeteilt, jede Kachel eine kompakte Datei
2. PWA-Frontend (installierbar über "Zum Home-Bildschirm"):
   - PLZ -> Koordinaten über eine mitgelieferte offene PLZ-Tabelle
     (z.B. GeoNames, CC BY 4.0, Quelle nennen)
   - lädt nur die Kacheln im 75-km-Umkreis, speichert sie in IndexedDB
   - A* in einem Web Worker (JS oder WASM)
   - Karte: MapLibre GL JS, Kacheln als PMTiles (statisch gehostet)
3. Kein Backend. Hosting statisch (GitHub Pages / Cloudflare Pages).

## Datenmodell pro Kante
Gespeichert werden Rohwerte, keine fertige Fahrzeit und kein fertiger
Verbrauch, weil beides vom Fahrzeugprofil abhängt:
- Länge, Tempolimit (roh), Straßenklasse, Belag, Beleuchtung
- Zugangsflags
- Steigung (aus Copernicus DEM / SRTM)
- Sicherheitsscore

Zur Laufzeit berechnet der Router:
- effektives Tempo = min(Tempolimit, vmax); bei unbekanntem Limit
  Annahme je Straßentyp (innerorts 50, außerorts 100), dann auf vmax
  begrenzt
- Fahrzeit inkl. Abzügen für Kurven, Kreuzungen, Ampeln
- Energie: Elektro in Wh/km nach Steigung und Tempo; Verbrenner über
  einfaches Verbrauchsmodell bzw. Tankstopps

Relevante OSM-Tags: highway, maxspeed, surface, cycleway, lit,
access, moped, motor_vehicle, motorroad

Relevante OSM-Tags: highway, maxspeed, surface, cycleway, lit,
access, moped, motor_vehicle, motorroad

## Routing-Gewichtung
Kosten = a*Zeit + b*Risiko + c*Energie
- a, b, c per Schieberegler in der UI
- Weil die Werte getrennt in der Kante liegen, wird bei jeder
  Reglerbewegung sofort neu berechnet
- Sicherheit: Strafen für schnelle Landstraßen ohne Radweg,
  fehlende Beleuchtung, schlechten Belag, viele Kreuzungen;
  Bonus für Nebenstraßen mit Tempo 30/50
- Reichweite: einfaches Verbrauchsmodell (E-Roller: Wh/km;
  Verbrenner: Tankstopps)

## Lizenz und Compliance
- Code: MIT (oder AGPL, falls Änderungen an gehosteten Versionen
  offen bleiben sollen) -> noch zu entscheiden
- Attribution in der UI: "© OpenStreetMap contributors" (ODbL);
  Höhendaten-Quelle nennen
- Keine Nutzung der Tile-Server von openstreetmap.org
  (eigene PMTiles oder freies Kontingent)
- Kein Apple Developer Account nötig (PWA)

## Bekannte Einschränkungen
- Routen nur innerhalb des geladenen Umkreises um die gewählte PLZ
- Zunächst nur Deutschland
- Adresssuche schwierig ohne Server: Karte antippen oder kleiner
  lokaler Ortsindex; Nominatim nur für geringe Last
- iOS: kein GPS im Hintergrund, bei Navigation muss der Bildschirm
  an bleiben; Speicher von Web-Apps kann geräumt werden
- Datenaktualisierung nur per Neubau (z.B. monatlich, GitHub Action)

## Roadmap
1. Python-Pipeline: OSM -> Kachel-Graph mit Rohattributen und Zugangsregeln
2. Router (A*) im Web Worker mit Fahrzeugprofil (vmax, Antrieb),
   Test mit festen Start/Ziel-Paaren
3. PLZ-Suche, Kachel-Laden für den 75-km-Umkreis, IndexedDB
4. Frontend: MapLibre, Start/Ziel setzen, Route anzeigen, Profil-Einstellungen
5. Sicherheitsscore und Schieberegler
6. Höhendaten und Energie-/Reichweitenmodell je Antriebsart
7. PWA-Features: Offline-Cache, Installierbarkeit
8. Repo-Doku, Lizenz, GitHub Action für Graph-Builds

## Offene Fragen an den Nutzer
- Wo werden die Kachel-Dateien gehostet (Größe des Deutschland-Graphen
  entscheidet)?
- Lizenz: MIT oder AGPL?
- Soll der Radius einstellbar sein (Standard 75 km)?
- Welche vmax-Voreinstellungen werden angeboten?
- Reicht PLZ + Antippen der Karte oder wird Adresssuche gebraucht?
