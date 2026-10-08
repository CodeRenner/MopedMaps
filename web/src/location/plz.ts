/**
 * PLZ (German postal code) lookup over the bundled table
 * (public/data/plz.json, GeoNames CC BY 4.0). Pure, no DOM.
 */

export interface PlzEntry {
  plz: string;
  lat: number;
  lon: number;
  name: string;
}

interface PlzTable {
  v: number;
  attribution: string;
  rows: [string, number, number, string][];
}

const PLZ_RE = /^\d{5}$/;

/**
 * GeoNames also lists ~1,450 large-customer postal codes named after companies
 * and authorities ("Deutsche Post AG …", "Finanzamt …"). They are skipped when
 * labelling a place; real places like Freiamt or Landesbergen stay.
 */
const NON_PLACE_RE =
  /(\b(AG|GmbH|KG|SE|eG|e\.\s?V\.|Post|Postbank|Bank|Sparkasse|Volksbank|Versicherung|Zentrale|Center|Centrum|Postfach|NL|Niederlassung|Filiale|Filialdirektion|Verlag|Behörde|Ministerium|Ministerpräsident|Universität|Hochschule|Klinikum|Klinik|Rundfunk|Stadtwerke|Landesbank|Landeshauptstadt|Landratsamt|Telekom|Krankenkasse|Gericht|Stadtverwaltung|Bundesarchiv|Bundesknappschaft|Service)\b|(Finanz|Versorgungs|Tiefbau|kriminal|präsidial|verwaltungs|Bundes|post)amt\b|-Verlag|-Universität|-Versicherung|-Bank|-AG\b|&|\d)/i;

export function isPlaceName(name: string): boolean {
  return !NON_PLACE_RE.test(name);
}

/** Lowercase, strip diacritics and map ß -> ss, for forgiving name search. */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export class PlzIndex {
  readonly attribution: string;
  private readonly entries: PlzEntry[];
  private readonly normNames: string[];

  constructor(table: PlzTable) {
    if (table.v !== 1 || !Array.isArray(table.rows)) throw new Error('unsupported PLZ table');
    this.attribution = table.attribution;
    this.entries = table.rows.map(([plz, lat, lon, name]) => ({ plz, lat, lon, name }));
    for (let i = 1; i < this.entries.length; i++) {
      if (this.entries[i - 1]!.plz >= this.entries[i]!.plz) throw new Error('PLZ table not sorted');
    }
    this.normNames = this.entries.map((e) => normalizeName(e.name));
  }

  get size(): number {
    return this.entries.length;
  }

  /** PLZ area of a real place whose centre is closest to a point (a coarse, offline place label). */
  nearest(lat: number, lon: number): PlzEntry | undefined {
    const k = Math.cos((lat * Math.PI) / 180);
    let best: PlzEntry | undefined;
    let bd = Infinity;
    for (const e of this.entries) {
      if (!isPlaceName(e.name)) continue;
      const d = (e.lat - lat) ** 2 + ((e.lon - lon) * k) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** Exact lookup; undefined if unknown or malformed. */
  get(plz: string): PlzEntry | undefined {
    const q = plz.trim();
    if (!PLZ_RE.test(q)) return undefined;
    const i = this.lowerBound(q);
    const e = this.entries[i];
    return e && e.plz === q ? e : undefined;
  }

  /**
   * Search by PLZ prefix (digits) or place-name prefix (text).
   * Name matches that start the name rank before matches inside it.
   */
  search(query: string, limit = 10): PlzEntry[] {
    const q = query.trim();
    if (!q) return [];
    if (/^\d{1,5}$/.test(q)) {
      const out: PlzEntry[] = [];
      for (let i = this.lowerBound(q); i < this.entries.length && out.length < limit; i++) {
        const e = this.entries[i]!;
        if (!e.plz.startsWith(q)) break;
        out.push(e);
      }
      return out;
    }
    const nq = normalizeName(q);
    const starts: PlzEntry[] = [];
    const contains: PlzEntry[] = [];
    this.normNames.forEach((n, i) => {
      if (n.startsWith(nq)) starts.push(this.entries[i]!);
      else if (nq.length >= 3 && n.includes(nq)) contains.push(this.entries[i]!);
    });
    return [...starts, ...contains].slice(0, limit);
  }

  private lowerBound(q: string): number {
    let lo = 0;
    let hi = this.entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.entries[mid]!.plz < q) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
