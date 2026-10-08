# Recherche: Verkehrsmengen und Baustellen für ganz Deutschland

Stand: 2026-10-08. Ergänzt `docs/research-traffic-data.md` (BW, BASt, Autobahn-API
stehen dort und werden hier nicht wiederholt). Alle Endpunkte unten wurden per curl
abgerufen, sofern nicht **(nicht verifiziert)** dabeisteht. Zahlen (Features, Klassen)
stammen aus diesen Abrufen.

## Empfehlung

**Verkehrsmengen (DTV), jetzt mit geringem Aufwand integrierbar.** Acht Länder liefern
SVZ-Daten als **Linien mit DTV pro Abschnitt**, nicht nur als Zählpunkte. Für die
Pipeline ist das einfacher als BW: Linie puffern (z. B. 20 m), mit OSM-Kanten
verschneiden, `ref` vergleichen, fertig. Es muss nichts entlang der Straße
weitergereicht werden.
- **Bayern** BAYSIS-WFS 2021: B/St/K, 9.431 Linien, CC BY 4.0
- **NRW** Straßen.NRW SVZ 2021 Shape: A/B/L/K, 11.511 Linien, dl-de/zero-2-0
- **Brandenburg** OGC API 2021: A/B/L (+43 K), 2.315 Linien, dl-de/by-2-0
- **Sachsen** SVZ 2021 Shape: A/B/S (+27 K), 3.510 Linien, dl-de/by-2-0
- **Niedersachsen** SVZ 2021 Shape: A/B/L, 2.819 Linien, CC BY 4.0 (die ZIP enthält
  aber eigene NLStBV-Nutzungsbedingungen, siehe Notizen)
- **Thüringen** SVZ **2015** WFS: A/B/L, 2.073 Polygone (Bänder), dl-de/by-2-0, also alt
- **Berlin** DTVw 2023 WFS: 8.337 Linien inkl. Gemeindestraßen, dl-de/zero-2-0
- **Hamburg** Verkehrsmengen HVS 2019 WFS: 3.728 Linien, dl-de/by-2-0
- **Fallback** für Hessen, RP, Saarland, MV, Sachsen-Anhalt, SH und Bremen: BASt SVZ 2021
  (nur B-Straßen, CC BY 4.0). Für deren **L/K-Straßen gibt es keine offenen
  maschinenlesbaren DTV-Daten** (nur WMS-Bilder oder PDF). Dort bleibt der OSM-Proxy.

**Baustellen/Sperrungen, offen und ohne Registrierung (täglicher Action-Job):**
- **Sachsen** SPERRINFOSYS GeoJSON: 1.360 Linien, alle Klassen inkl. Gemeindestraßen,
  `Sperrung_Art` (773 Vollsperrungen), täglich, dl-de/by-2-0. **Bester Kandidat.**
- **Brandenburg** OGC API Baustelleninfo: 427 Linien auf B/L/K, `Art` = Sperrung oder
  Bauabschnitt, täglich, dl-de/by-2-0
- **Schleswig-Holstein** WFS: 1.094 Linien (L 386, G 416, K 153, B 136),
  `Verkehrseinschränkung` (290 Vollsperrungen), CC BY 4.0. Derselbe Dienst enthält auch
  **Niedersachsen-B-Straßen** (140 Linien), **MV** (162 Punkte) und **Hamburg** (223 Punkte).
  Die Lizenz dieser Fremd-Layer ist unklar.
- **Berlin** VIZ-JSON: 237 Meldungen mit Punkt und Linie, `severity` (40 Vollsperrungen),
  dl-de/by-2-0, CORS `*`
- **Rheinland-Pfalz** Mobilitätsatlas-WFS: 1.068 RP-Meldungen (440 Vollsperrungen),
  Punkte plus Verlaufslinien. Technisch offen, **Lizenz nicht angegeben**, daher vorher
  beim MWVLW anfragen.
- **Hamburg**: nur Punkte mit Freitext, für Routing schwach

**Nur mit Registrierung (Mobilithek-Abo plus Maschinenzertifikat):** Bayern, NRW
(LVZ.NRW, dl-de/zero), Niedersachsen (B/L/K, dl-de/zero), Hessen, Thüringen, MV,
Sachsen-Anhalt, Saarland, Bremen, Berlin-LMS. Kostenlos, aber Organisationskonto,
Freigabe durch den Anbieter und ein Client-Zertifikat als GitHub-Secret sind nötig.
Das braucht eine Entscheidung des Owners.

**Gibt es nicht (offen):** ein bundesweites offenes Baustellen-Aggregat für Nicht-
Autobahnen; offene Baustellendaten für BY, NRW, HE, TH, SL, ST, HB ohne Mobilithek-Abo;
maschinenlesbare L/K-DTV für HE, RP, SL, MV, ST, SH, HB.

## Tabelle Verkehrsmengen (DTV)

| Land | Quelle | Format/Zugang | Lizenz | Geometrie | Eignung |
|---|---|---|---|---|---|
| BW | VM BW SVZ-CSV (siehe altes Dokument) | CSV, offen | dl-de/by-2-0 | Punkte | bereits integriert |
| BY | BAYSIS SVZ 2021 Zählstellenbereiche | WFS (GeoJSON/CSV), offen | CC BY 4.0 | Linien, B/St/K/A | **sehr gut** |
| NW | Straßen.NRW SVZ 2021 | Shape/XLSX, offen | dl-de/zero-2-0 | Linien, A/B/L/K | **sehr gut** |
| BB | LS BB Verkehrsstärke 2021 | OGC API Features (JSON), offen | dl-de/by-2-0 | Linien, A/B/L (+K) | **sehr gut** |
| SN | LASuV/LISt SVZ 2021 | Shape-ZIP, offen | dl-de/by-2-0 | Linien, A/B/S (+K) | **sehr gut** |
| NI | NLStBV SVZ 2021 | Shape-ZIP, offen | CC BY 4.0 / NLStBV-AGB | Linien, A/B/L | gut (Lizenz klären) |
| TH | TLBV SVZ 2015 | WFS 1.1.0, offen | dl-de/by-2-0 | Polygone, A/B/L | mittel (alt) |
| BE | SenMVKU DTVw 2023 | WFS (JSON), offen | dl-de/zero-2-0 | Linien, Hauptnetz inkl. G | **sehr gut** |
| HH | BVM Verkehrsmengen HVS 2019 | WFS (GeoJSON), offen | dl-de/by-2-0 | Linien, HVS | gut |
| HE | Hessen Mobil Zählstellenbereiche | INSPIRE-GML, offen | (c) Hessen Mobil, unklar | Linien B/L/K, **ohne DTV** | schlecht |
| SL | LfS Verkehrsmengenkarte 2021 | nur WMS (Bild) | unklar | - | schlecht |
| MV | LS MV "Verkehrsmengen M-V" | nur WMS **(nicht verifiziert)** | unklar | - | schlecht |
| ST | LSBB ASID / Bericht SVZ 2021 | Karte/PDF **(nicht verifiziert)** | unklar | - | schlecht |
| SH | LBV.SH Verkehrsmengenkarte 2015 | PDF | - | - | schlecht |
| RP | LBM SVZ 2015 Zählstellenbereiche | Metadaten GDI-RP **(nicht verifiziert)** | CC0 laut GovData | ? | offen |
| HB | - | nichts gefunden | - | - | - |
| DE | BASt SVZ 2021 Bundesstraßen | XLSX, offen | CC BY 4.0 | Punkte (UTM32), nur A/B | Fallback B |

## Tabelle Baustellen/Sperrungen

| Land | Quelle | Format/Zugang | Lizenz | Geometrie | Eignung |
|---|---|---|---|---|---|
| BW | MobiData BW (siehe altes Dokument) | GeoJSON, offen | dl-de/by-2-0 | Linien | integriert |
| SN | LISt SPERRINFOSYS | GeoJSON-/Shape-ZIP, offen, täglich | dl-de/by-2-0 | Linien (EPSG:25833), alle Klassen | **sehr gut** |
| SN | LASuV DATEX II (Mobilithek) | Abo + Zertifikat, alle 3 h | CC BY 4.0 | OpenLR/ALERT-C/Koord. | unnötig (SPERRINFOSYS) |
| BB | LS BB Baustelleninfo | OGC API Features, offen, täglich | dl-de/by-2-0 | Linien, B/L/K | **sehr gut** |
| BB | "Baustellen Brandenburg" DATEX II | Mobilithek-Abo | eingeschränkt | ASB | unnötig |
| SH | LBV.SH WFS Baustelleninformationen | WFS (GeoJSON), offen | CC BY 4.0 | Linien, B/L/K/G | **sehr gut** |
| NI | NLStBV AlD außerhalb BAB | Mobilithek-Abo, täglich | dl-de/zero-2-0 | ASB (LCL nicht für L/K) | gut nach Abo |
| NI | Layer im SH-WFS | WFS, offen | unklar (Fremddaten) | Linien, nur B | Teilersatz |
| MV | LS MV Arbeitsstellen | Mobilithek-Abo, stündlich | eingeschränkt | ? | nach Abo |
| MV | Layer im SH-WFS | WFS, offen | unklar | Punkte | schwach |
| HH | BVM Baustellen / Polizei-Verkehrsinfo | WFS/OGC API, offen | dl-de/by-2-0 | Punkte + Freitext | schwach |
| BE | VIZ Berlin Baustellen/Sperrungen | JSON, offen, CORS `*` | dl-de/by-2-0 | Punkt + Linie | **gut** |
| BE | Verkehrsmeldungen Berlin (LMS) | Mobilithek-Abo, 5 min | dl-de/by-2-0 | DATEX II | optional |
| RP | MWVLW Mobilitätsatlas-WFS | WFS (JSON), offen | **keine Angabe** | Punkte + Verlaufslinien | gut, Lizenz klären |
| RP | LBM DATEX II | Mobilithek-Abo | keine Lizenz | - | - |
| NW | LVZ.NRW Arbeitsstellen nachg. Netz | Mobilithek-Abo, 1 min | dl-de/zero-2-0 | METHOD_OTHER | gut nach Abo |
| NW | NRW.Mobidrom gebündelt | Mobilithek-Abo | CC BY-SA | ? | nach Abo |
| NW | Städte (Köln, Dortmund, Münster, Herne ...) | WFS/CSV, offen | meist dl-de | Punkte/Flächen | lokal **(nicht im Detail verifiziert)** |
| BY | BayernInfo Baustellen DATEX II | Mobilithek-Abo, 1 min | eingeschränkt (GeoNutz) | ALERT-C + Koordinatenketten | gut nach Abo |
| HE | Hessen Mobil AlD/AkD BL(K,G) | Mobilithek-Abo | eingeschränkt | WGS84 | nach Abo |
| HE | Frankfurt-WFS, ivm RheinMain | WFS / REST | dl-de / frei | ? | lokal; ivm-Endpunkt nicht erreichbar |
| TH | TLBV AlD ohne BAB | Mobilithek-Abo | GeoNutz | OpenLR/ALERT-C | nach Abo |
| ST | LSBB Baustellen und Sperrungen | Mobilithek-Abo | keine Lizenz | WGS84 | nach Abo, Lizenz unklar |
| SL | LfS Arbeitsstellen (mehrere Profile) | Mobilithek-Abo | keine/eingeschränkt | ALERT-C | nach Abo |
| HB | VMZ Bremen Arbeitsstellen | Mobilithek-Abo, 10 min | dl-de/by-2-0 | METHOD_OTHER | nach Abo |
| DE | BASt Arbeitsstellen BAB | Mobilithek, **anonym ladbar** (113 MB) | CC BY 4.0 | ALERT-C + ASB | nur Autobahn |

## Notizen mit URLs

### Mobilithek (geprüft)
- Katalogsuche ohne Login über die interne API (aus dem Frontend-Bundle ermittelt):
  `POST https://mobilithek.info/mdp-api/mdp-msa-metadata/v2/offers/search?page=0&size=100`
  mit Body `{"searchString":"Baustellen"}`, Details per
  `GET .../v2/offers/{publicationId}` (Lizenz in `standardLicense`, Freigabe in
  `contractOffer`).
- Anonymer Download: `GET https://mobilithek.info/mdp-api/mdp-conn-server/v1/publication/{id}/file/noauth`
  funktioniert nur, wenn der Anbieter `providerApprovalAnonymousAccessRequired=true`
  setzt. Getestet mit 24 Landes- und BAB-Angeboten: **nur BASt "Arbeitsstellen auf
  deutschen Autobahnen" (608447464874934272) lieferte 200**, alle anderen 403.
- Laut Mobilithek-FAQ (`https://mobilithek.info/cms/items/faq_category`) braucht ein
  gebrokertes Angebot: Registrierung der Organisation, ein Abo (bei
  `providerApprovalRequired=true` mit Freigabe durch den Anbieter) und ein
  **Maschinenkonto mit Client-Zertifikat** (kostenlos über Mobilithek, Passwort per
  SMS). Abruf per Pull oder Push. Der User-Agent `Python-urllib` wird blockiert.
- Lizenzen laut Metadaten: NLStBV und LVZ.NRW dl-de/zero-2-0; Bremen und Berlin
  dl-de/by-2-0; LASuV Sachsen CC BY 4.0; Bayern, Hessen, MV, Brandenburg, Saarland
  "restricted use, free of charge"; Thüringen GeoNutz; RP, Sachsen-Anhalt, SH-DATEX,
  Saarland-Basis "NO_LICENSE".

### Baustellen offen
- Sachsen: https://www.list.smwa.sachsen.de/gdi/download/baustelleninfo/Baustelleninfo_Sachsen_geojson.zip
  (2,3 MB; enthält `..._Sperrungen_Sachsen.geojson` und `..._Umleitungen_...`). Felder
  `Strassenklasse` (G 619, K 304, S 158, A 139, B 121), `Sperrung_Art_Klartext`,
  `Sperrung_von/bis`, `Umleitung_ueber`. Last-Modified am Abruftag. Lizenz laut
  Mobilithek-Eintrag (LISt) dl-de/by-2-0, Quellenvermerk "Baustelleninformationssystem
  Sachsen". Der GeoSN-WMS-Eintrag nennt CC BY 4.0.
- Brandenburg: https://ogc-api.geobasis-bb.de/datasets/baustelleninfo/collections/baustelleninfo/items?f=json
  (Paging über `next`). Felder `Art`, `Straßenummner`, `Baustellen_Beginn/Ende`,
  `Anzahl_Fahrstreifen_gesperrt`. Laut Beschreibung aus der Mobilithek-DATEX-Schnittstelle
  abgeleitet, täglich aktualisiert. Lizenz-Link dl-de/by-2-0.
- Schleswig-Holstein: https://dienste.gdi-sh.de/WFS_SH_Baustelleninformationen?Service=WFS&Version=2.0.0&Request=GetFeature&typeNames=Baustelleninformationen:Baustellen_SH&outputFormat=GEOJSON&srsName=EPSG:4326
  (1,4 MB). Weitere Layer: `Baustellen_Niedersachsen`, `Baustellen_MV`, `Baustellen_FHH`,
  `Baustellen_Autobahn`, `Umleitungsstrecken`, `Verkehrsstoerungen`. Lizenz CC BY 4.0
  laut Mobilithek. Kein CORS-Header (für die Action egal).
- Berlin: https://api.viz.berlin.de/daten/baustellen_sperrungen_viz.json (GeoJSON,
  GeometryCollection aus Point + LineString). `severity`: keine Sperrung 150,
  Fahrtrichtungssperrung 47, Vollsperrung 40.
- Rheinland-Pfalz: https://maps.mobilitaetsatlas.de/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=mwvlw:baustelle&outputFormat=application/json
  (3.869 Punkte). Linien über `mwvlw:verlauf`, verknüpft über `baustelleId`. `quelle`
  enthält auch Autobahn GmbH, VM BW, Karlsruhe und Luxemburg. Anbieter laut
  Capabilities: MWVLW RP. Keine Lizenzangabe in den Capabilities, Mobilithek-Eintrag
  "NO_LICENSE".
- Hamburg: Baustellen-ZIP https://geodienste.hamburg.de/download?url=https://geodienste.hamburg.de/hh_wfs_baustellen&f=json
  (153 Punkte, Freitext `umfang`), aktuelle Polizei-Meldungen per WFS
  `de.hh.up:hauptmeldungen_aktuell` (249 Punkte). Der Layer `meldungen_linien` ist ein
  Archiv mit 47.261 Einträgen (168 MB) und müsste nach `end` gefiltert werden.

### Verkehrsmengen offen
- Bayern: https://gisportal-stmb.bayern.de/server/services/WFS/BAYSIS_Verkehrsdaten/MapServer/WFSServer
  Layer `svz2021_zaehlstellenbereiche`, `outputFormat=GEOJSON` (52 MB). Felder
  `Straßenklasse`, `Straße` ("B 285"), `DTV_Kfz`, `DTV_SV`, `DTVKrad` und weitere.
  Median-DTV: B 9.294, St 3.946, K 1.298. Pflichtvermerk laut Capabilities:
  "Datenquelle: Bayerische Straßenbauverwaltung - BAYSIS".
- NRW: https://opendata.strassen.nrw.de/Verkehrsdaten/Strassenverkehrszaehlung/2021%20SVZ/2021%20Shape-File%20Netz/
  (`VERKEHRSWERTE2021_polyline.*`, ca. 50 MB). Felder `STRKL`, `STRBEZ` ("K34(HX)"),
  `DTVKFZA`, `DTVSVA`. Klassen L 6.303, B 2.318, K 2.160, A 730. Daneben die XLSX und
  die Verkehrsstärkenkarte als PDF.
- Brandenburg: https://ogc-api.geobasis-bb.de/datasets/zaehlstellen/collections/verkehrsstaerke_2021/items
  (`strasse`, `klasse`, `KFZ`, `DTV_SV`). Zusätzlich gibt es Jahrgänge 2010/2015 und
  Zählstellen-Standorte 2025.
- Sachsen: https://www.list.smwa.sachsen.de/gdi/download/DE-SN-SBV-SVZ2021.zip (5,3 MB,
  ETRS89/UTM33, Encoding latin1). Felder `strasse`, `klasse`, `dtv_kfzges`, `dtv_sv`.
- Niedersachsen: https://map.strassenbau.niedersachsen.de/zip/DE-NI-SBV_Downloadservice_SVZ_Zaehlstellenbereiche_2021.zip
  (`dtv21`, `dtvsv21` sowie 2015/2010/2005). GovData nennt CC BY 4.0. Die ZIP enthält
  aber "Nutzungsbedingungen NLStBV" (Stand 2012): erlaubt kommerzielle und öffentliche
  Nutzung, verlangt den Vermerk "Quelle: Geofachdaten NLStBV © Jahr" und die
  Weitergabe der Bedingungen an Dritte, und sagt "ausdrücklich nicht zur Navigation
  geeignet".
- Thüringen: https://www.geoproxy.geoportal-th.de/geoproxy/services/STRNETZ_SVZ_wfs
  (nur WFS 1.1.0, Layer `tlbv:SVZ2015_VMenge`). Der JSON-Export kam bei uns abgeschnitten
  an, daher besser GML abrufen.
- Berlin: https://gdi.berlin.de/services/wfs/verkehrsmengen_2023 Layer `dtvw2023kfz`
  (`dtvw_kfz`, `strklasse`, `str_bez`). DTVw bedeutet werktäglich (Mo-Do außerhalb der
  Ferien), nicht DTV.
- Hamburg: https://geodienste.hamburg.de/HH_WFS_Verkehrsmengen Layer
  `de.hh.up:verkehrsmengen_dtv_hvs_2019` (`dtv`, `sv`). Weitere Zählstellen-Layer unter
  `HH_WFS_Verkehrsstaerken`.
- Hessen: https://sibhessen.de/download/data/INSPIRE-SU_VectorStatisticalUnit-Zaehlstellenbereiche.xml
  (24 MB). Hat Geometrie und Zählstellennummer, aber **keine DTV-Werte**.
- Saarland: https://geoportal.saarland.de/mapbender/php/wms.php?inspire=1&layer_id=41553&withChilds=1&REQUEST=GetCapabilities&SERVICE=WMS
  ist ein WMS mit den Layern B, L I. O., L II. O. (2021), aber kein WFS gefunden.
- Suchwege: GovData-CKAN-API (`package_search`) und GDI-DE-CSW
  (`https://gdk.gdi-de.org/gdi-de/srv/eng/csw`, AnyText-Suche).

### ALERT-C / Location Code List
- Die LCL 22.0 / ECL 4.01 liegt **frei als Download** vor (12,9 MB ZIP, XLSX + DAT,
  CC BY 4.0): https://www.bast.de/DE/Themen/Digitales/HF_1/Massnahmen/LCL/lcl-download.zip?__blob=publicationFile&v=2
  (Seite: https://www.bast.de/DE/Themen/Digitales/HF_1/Massnahmen/LCL/location-code-list.html).
- Laut BASt war das die letzte Revision. NLStBV und BASt schreiben in den
  Mobilithek-Metadaten, die LCL werde **seit Ende 2022 nicht mehr gepflegt** und decke
  **keine Landes- und Kreisstraßen** ab. Für B/L/K taugt ALERT-C also kaum.
  Brauchbar sind die Koordinaten der Meldungen (BayernInfo-Referenzdatei: neben
  ALERT-C 122.791 `pointCoordinates`), ASB-Verortung (braucht das Straßennetz der
  Länder) oder OpenLR.

## Lizenz-Hinweise
- dl-de/zero-2-0 (NRW, Berlin-DTV, NLStBV-DATEX): keine Pflichten.
- dl-de/by-2-0 und CC BY 4.0: Namensnennung plus Hinweis auf Bearbeitung. Abgeleitete
  Kanten-Attribute in den Chunks sind erlaubt. Vermerke im UI/About ergänzen, z. B.
  "Bayerische Straßenbauverwaltung - BAYSIS (CC BY 4.0)", "Straßen.NRW (dl-de/zero-2-0)",
  "LS Brandenburg / LGB (dl-de/by-2-0)", "LASuV/LISt Sachsen (dl-de/by-2-0)",
  "Geofachdaten NLStBV", "TLBV Thüringen", "SenMVKU Berlin", "FHH Hamburg, BVM",
  "LBV.SH (CC BY 4.0)".
- GeoNutz (Thüringen, BayernInfo-Referenz) und "restricted use" (Mobilithek) erlauben
  die Weitergabe **nicht automatisch**. Vor der Nutzung die Bedingungen lesen.
- Keine Rechtsberatung. ODbL-Kompatibilität wie im alten Dokument vor dem Release prüfen.

## Offene Punkte
- Owner-Entscheidung: Mobilithek-Organisationskonto und Maschinenzertifikat als
  GitHub-Secret anlegen? Damit kämen BY, NRW, NI (B/L/K), HE, TH, MV, ST, SL, HB dazu.
  Danach pro Angebot ein Abo beantragen (Freigabe durch den Anbieter, Dauer unbekannt).
- RP Mobilitätsatlas: Lizenz beim MWVLW (poststelle@mwvlw.rlp.de) erfragen.
- SH-WFS: Dürfen die Fremd-Layer (NI, MV, HH) unter CC BY 4.0 genutzt werden? Beim
  LBV.SH nachfragen.
- NI-DTV: Gilt CC BY 4.0 (GovData) oder die NLStBV-AGB in der ZIP? Klären oder beide
  Vermerke führen.
- Hessen, Saarland, MV, Sachsen-Anhalt, SH, Bremen: bei den Landesbetrieben nach
  maschinenlesbaren L/K-DTV fragen. Sachsen-Anhalt-ASID und MV-WMS wurden nicht im
  Detail geprüft. RP: ob die SVZ 2015/2021 mit Werten im Geoportal liegt, ist
  **nicht verifiziert**.
- Thüringen hat nur SVZ 2015. Prüfen, ob 2021 erscheint. BASt SVZ 2025 ist laut
  Mobilithek "derzeit in Auswertung". Danach den Fallback aktualisieren.
- Vergleichbarkeit: Berlin DTVw (werktags) und Hamburg (HVS 2019) sind nicht identisch
  mit dem SVZ-DTV. Für Risikoklassen reicht das, die Schwellen sollten aber in die
  Config.
- Freitext-Meldungen (Hamburg, teils SH/BB) lassen sich nicht sicher als "gesperrt"
  erkennen. Nur strukturierte Felder (`Sperrung_Art`, `Verkehrseinschränkung`, `severity`,
  `Art`) als Sperre werten.
- Städtische Baustellen-WFS (Köln, Dortmund, Münster, Kiel, Frankfurt, Leipzig ...) sind
  über die Mobilithek-Suche gelistet, aber nicht einzeln geprüft.
