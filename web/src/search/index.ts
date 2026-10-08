/**
 * Offline search over the places tiles of the loaded area (pipeline
 * places.py): streets with house numbers, and named places (shops, hospitals,
 * settlements, stations …). Pure, no DOM.
 */

export interface PlacesTile {
  v: 1;
  /** [street, postcode, city, lat, lon, housenumbers, dlat, dlon]; coordinates in 1e-5° */
  s: [string, string, string, number, number, string[], number[], number[]][];
  /** [name, kind, lat, lon] */
  p: [string, string, number, number][];
}

export interface SearchResult {
  label: string;
  /** second line: postcode/city or kind */
  detail: string;
  lat: number;
  lon: number;
  kind: 'address' | 'street' | 'place';
}

interface StreetEntry {
  street: string;
  pc: string;
  city: string;
  hay: string;
  /** normalised street name only */
  name: string;
  hns: string[];
  lat: Float64Array;
  lon: Float64Array;
}

interface PlaceEntry {
  name: string;
  kind: string;
  hay: string;
  lat: number;
  lon: number;
}

/** Words added to a place's searchable text, so "Krankenhaus" finds hospitals etc. */
export const KIND_WORDS: Record<string, string> = {
  'amenity=hospital': 'Krankenhaus Klinik',
  'amenity=clinic': 'Klinik Praxis',
  'amenity=doctors': 'Arzt Praxis',
  'amenity=dentist': 'Zahnarzt',
  'amenity=pharmacy': 'Apotheke',
  'amenity=fuel': 'Tankstelle',
  'amenity=charging_station': 'Ladestation',
  'amenity=school': 'Schule',
  'amenity=kindergarten': 'Kindergarten Kita',
  'amenity=university': 'Universität Uni Hochschule',
  'amenity=townhall': 'Rathaus',
  'amenity=police': 'Polizei',
  'amenity=post_office': 'Post',
  'amenity=bank': 'Bank',
  'amenity=restaurant': 'Restaurant',
  'amenity=cafe': 'Café Cafe',
  'amenity=fast_food': 'Imbiss',
  'amenity=bar': 'Bar',
  'amenity=pub': 'Kneipe',
  'amenity=library': 'Bibliothek Bücherei',
  'amenity=cinema': 'Kino',
  'amenity=parking': 'Parkplatz',
  'amenity=place_of_worship': 'Kirche',
  'shop=supermarket': 'Supermarkt',
  'shop=bakery': 'Bäckerei Bäcker',
  'shop=motorcycle': 'Motorrad Roller',
  'shop=bicycle': 'Fahrrad',
  'shop=car_repair': 'Werkstatt',
  'tourism=hotel': 'Hotel',
  'tourism=museum': 'Museum',
  'railway=station': 'Bahnhof',
  'railway=halt': 'Bahnhof Haltepunkt',
  'public_transport=station': 'Bahnhof Station',
  'leisure=swimming_pool': 'Schwimmbad',
  'leisure=sports_centre': 'Sportzentrum',
};

/** "Hauptstr. 5" -> "hauptstrasse 5"; umlauts and ß folded, punctuation removed. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/str\.?(?=\s|$|\d|[.,])/g, 'strasse ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const HOUSE_RE = /^\d{1,4}[a-z]?$/;
const POSTCODE_RE = /^\d{5}$/;

function wordsMatch(hay: string, tokens: string[]): boolean {
  for (const t of tokens) {
    // prefix of a word, or inside a compound street name ("haupt" in "hauptstrasse")
    if (!(hay.startsWith(t) || hay.includes(` ${t}`) || (t.length >= 4 && hay.includes(t)))) return false;
  }
  return true;
}

function distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const k = Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(lat2 - lat1, (lon2 - lon1) * k) * 111.2;
}

export class SearchIndex {
  private streets: StreetEntry[] = [];
  private places: PlaceEntry[] = [];
  /** settlement name (normalised) -> position, for "… Emmendingen" */
  private settlements = new Map<string, [number, number]>();

  get size(): { streets: number; places: number } {
    return { streets: this.streets.length, places: this.places.length };
  }

  private settlementList: { name: string; lat: number; lon: number }[] = [];

  private nearestSettlement(lat: number, lon: number): string {
    let best = '', bestD = 8; // km
    for (const s of this.settlementList) {
      const d = distKm(lat, lon, s.lat, s.lon);
      if (d < bestD) {
        bestD = d;
        best = s.name;
      }
    }
    return best;
  }

  add(tile: PlacesTile): void {
    for (const [street, pc, city, lat0, lon0, hns, dlat, dlon] of tile.s) {
      const lat = new Float64Array(Math.max(1, hns.length));
      const lon = new Float64Array(lat.length);
      let la = lat0, lo = lon0;
      lat[0] = la / 1e5;
      lon[0] = lo / 1e5;
      for (let i = 1; i < hns.length; i++) {
        la += dlat[i - 1]!;
        lo += dlon[i - 1]!;
        lat[i] = la / 1e5;
        lon[i] = lo / 1e5;
      }
      const name = normalize(street);
      this.streets.push({ street, pc, city, name, hay: `${name} ${normalize(city)} ${pc}`, hns, lat, lon });
    }
    for (const [name, kind, lat, lon] of tile.p) {
      const n = normalize(name);
      this.places.push({ name, kind, hay: `${n} ${normalize(KIND_WORDS[kind] ?? '')}`, lat: lat / 1e5, lon: lon / 1e5 });
      if (kind.startsWith('place=')) {
        if (!this.settlements.has(n)) this.settlements.set(n, [lat / 1e5, lon / 1e5]);
        this.settlementList.push({ name, lat: lat / 1e5, lon: lon / 1e5 });
      }
    }
  }

  /**
   * Results for a free-text query, best first. `near` (map centre or GPS)
   * breaks ties; a settlement name in the query ("Bahnhofstraße 3 Kenzingen")
   * moves the reference point there instead of having to match.
   */
  search(query: string, near: [number, number], limit = 8): SearchResult[] {
    let tokens = normalize(query).split(' ').filter(Boolean);
    if (tokens.length === 0) return [];
    let house: string | null = null;
    let postcode: string | null = null;
    const rest: string[] = [];
    for (const t of tokens) {
      if (POSTCODE_RE.test(t)) postcode = t;
      else if (house === null && HOUSE_RE.test(t) && rest.length > 0) house = t;
      else rest.push(t);
    }
    tokens = rest;
    let ref = near;
    // trailing settlement name(s): "… emmendingen", "… bad krozingen"
    for (let n = Math.min(3, tokens.length - 1); n >= 1; n--) {
      const s = this.settlements.get(tokens.slice(-n).join(' '));
      if (s) {
        ref = s;
        tokens = tokens.slice(0, -n);
        break;
      }
    }
    if (tokens.length === 0) return [];

    type Scored = SearchResult & { score: number };
    const out: Scored[] = [];
    for (const s of this.streets) {
      if (postcode && s.pc !== postcode) continue;
      if (!wordsMatch(s.hay, tokens)) continue;
      let i = 0;
      let inexact = 0;
      if (house) {
        i = s.hns.findIndex((h) => h.toLowerCase() === house);
        if (i < 0) {
          i = nearestNumber(s.hns, house);
          inexact = 3; // a neighbouring number only
        }
        if (i < 0) continue;
      }
      const exact = (s.name.startsWith(tokens[0]!) ? 0 : 5) + inexact + (s.city ? 0 : 1);
      const label = house && s.hns.length ? `${s.street} ${s.hns[i]}` : s.street;
      out.push({
        label,
        detail: [s.pc, s.city].filter(Boolean).join(' '),
        lat: s.lat[i]!,
        lon: s.lon[i]!,
        kind: house && s.hns.length ? 'address' : 'street',
        score: exact + distKm(ref[0], ref[1], s.lat[i]!, s.lon[i]!) / 2,
      });
    }
    if (!house) {
      for (const p of this.places) {
        if (!wordsMatch(p.hay, tokens)) continue;
        const exact = (p.hay.startsWith(tokens[0]!) ? 0 : 3) + (p.kind === 'amenity=parking' ? 2 : 0);
        out.push({
          label: p.name,
          detail: KIND_WORDS[p.kind]?.split(' ')[0] ?? '',
          lat: p.lat,
          lon: p.lon,
          kind: 'place',
          score: exact + distKm(ref[0], ref[1], p.lat, p.lon) / 2,
        });
      }
    }
    out.sort((a, b) => a.score - b.score);
    // the same street is often split by postcode/city; keep the first per label + area
    const seen = new Set<string>();
    const res: SearchResult[] = [];
    for (const { score: _score, ...r } of out) {
      const key = `${r.label}|${r.detail}|${Math.round(r.lat * 100)}|${Math.round(r.lon * 100)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (r.kind === 'place' || !r.detail) r.detail = [r.detail, this.nearestSettlement(r.lat, r.lon)].filter(Boolean).join(' · ');
      res.push(r);
      if (res.length >= limit) break;
    }
    return res;
  }
}

/** Index of the house number numerically closest to `house` (e.g. 7 when only 5 and 9 exist). */
function nearestNumber(hns: string[], house: string): number {
  const want = parseInt(house, 10);
  let best = -1, bestD = Infinity;
  hns.forEach((h, i) => {
    const n = parseInt(h, 10);
    if (Number.isFinite(n) && Math.abs(n - want) < bestD) {
      bestD = Math.abs(n - want);
      best = i;
    }
  });
  return bestD <= 20 ? best : -1;
}
