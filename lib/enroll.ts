// CLIENT-SIDE enrollment heuristics (#042, this pass is client-only).
//
// The clever LLM-prediction endpoint (#042 backend: Sonnet predicted basket + Haiku
// canonicalization) and the recently-viewed baskets DB (#043) require Python edits
// that conflict with the concurrently-running brain agent — they are DEFERRED. This
// module is the client stand-in: a stream-of-thought parser and a lightweight curated
// suggestion heuristic, so the UX is fully exercised without backend changes.
//
// COMPLIANCE (rubric §6 / #042): the profile collects POSSESSION PROXIES ONLY
// (household, rent/own, home age, car, ZIP, tap) — never pregnancy, diagnoses,
// conditions, or age-as-health. The profile doubles as §11 discovery context.

// ── Stream-of-thought parsing (#042d) ────────────────────────────────────────
// The user types continuously; commas, " and ", semicolons, and newlines auto-delimit
// into items. We DO NOT enforce "one per line" anymore. Returns trimmed, de-duped,
// non-empty fragments. Backend canonicalization is a non-blocking enhancement (TODO).
export function parseStreamOfThought(raw: string): string[] {
  if (!raw) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  // Split on newlines, commas, semicolons, and the conjunction " and "/" & ".
  const parts = raw
    .split(/\n|,|;|\s+&\s+|\s+\band\b\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of parts) {
    // collapse internal whitespace; cap absurd lengths
    const item = p.replace(/\s+/g, " ").slice(0, 120);
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

// The textarea is the source of truth; we delimit on a TRAILING delimiter so the chip
// only pops once the user has clearly finished an item (comma / " and " / newline),
// leaving the in-progress fragment in the box. Returns {committed, pending}.
export function splitTrailing(raw: string): { committed: string[]; pending: string } {
  // Find the last delimiter; everything before it is committed, the tail is pending.
  const m = raw.match(/^([\s\S]*(?:\n|,|;|\s&\s|\sand\s))([\s\S]*)$/i);
  if (!m) return { committed: [], pending: raw };
  return { committed: parseStreamOfThought(m[1]), pending: m[2].replace(/^\s+/, "") };
}

// ── Lightweight profile → predicted basket (#042a, client heuristic) ──────────
// A SMALL curated suggestion set keyed off possession proxies. This is the inert
// stand-in for the Sonnet prediction endpoint. Each suggestion is a recall-prone,
// commonly-owned item. Framed as "what you have," never "what's risky for you."
export interface Profile {
  household?: "solo" | "partner" | "kids";
  ownsHome?: boolean;
  oldHome?: boolean; // pre-1978
  hasCar?: boolean;
  zip?: string;
  tapWater?: boolean;
}

export interface PredictedItem {
  label: string;
  // why this was suggested — shown subtly, honest about it being a guess
  basis: string;
}

// TODO(#042 backend): replace this client heuristic with a POST to the Sonnet
// prediction endpoint (profile -> recall-prone predicted basket). The endpoint needs
// brain (.py) edits that conflict with the running agent — deferred this pass.
export function predictBasket(p: Profile): PredictedItem[] {
  const out: PredictedItem[] = [];
  const add = (label: string, basis: string) => out.push({ label, basis });

  // Near-universal recall-prone staples.
  add("portable space heater", "commonly owned");
  add("extension cords", "commonly owned");
  add("lithium-ion power bank", "commonly owned");

  if (p.household === "kids") {
    add("baby inclined sleeper", "you mentioned kids");
    add("kids' bunk bed", "you mentioned kids");
    add("stroller", "you mentioned kids");
  }
  if (p.household === "partner" || p.household === "kids") {
    add("Peloton-type treadmill", "common in a shared home");
  }
  if (p.hasCar) {
    add("child car seat", "you have a car");
  }
  if (p.ownsHome) {
    add("gas range", "homeowners often own one");
    add("smoke / CO detector", "homeowners often own one");
  }
  if (p.oldHome) {
    add("window blinds (corded)", "older homes often have these");
  }

  // De-dupe by label, keep first basis.
  const seen = new Set<string>();
  return out.filter((i) => {
    const k = i.label.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ── Local typeahead dict (#042b, instant, no network) ─────────────────────────
// A static recall-prone brand/category list for instant local suggestions. Haiku
// canonicalization would be a debounced ENHANCEMENT (TODO) — never blocks this list.
const TYPEAHEAD_DICT = [
  "Peloton Tread+",
  "Peloton Bike",
  "Peloton Bike+",
  "Fisher-Price Rock 'n Play Sleeper",
  "portable space heater",
  "lithium-ion power bank",
  "baby inclined sleeper",
  "extension cords",
  "child car seat",
  "gas range",
  "pressure cooker",
  "air fryer",
  "window blinds (corded)",
  "kids' bunk bed",
  "stroller",
  "electric scooter",
  "hoverboard",
  "smoke / CO detector",
];

// TODO(#042 backend): append a Haiku-canonicalized result (e.g. "pelo" -> "Peloton
// Tread+") as a non-blocking enhancement once the endpoint exists. The brain edits
// conflict with the running agent — deferred. Instant local matches below stand in.
export function typeahead(query: string, limit = 5): string[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const entry of TYPEAHEAD_DICT) {
    const e = entry.toLowerCase();
    if (e.startsWith(q)) starts.push(entry);
    else if (e.includes(q)) contains.push(entry);
  }
  return [...starts, ...contains].slice(0, limit);
}

// ── Proximity options (UX_REWORK §3.2) — places we LOOK, never risks ──────────
export const PROXIMITY_OPTIONS = [
  "near an airport",
  "military base",
  "farmland",
  "industrial site",
  "older home (pre-1978)",
  "well water",
  "recent renovation",
] as const;

// Each "Anything nearby?" chip maps to the boolean context flag the §11 discovery
// engine actually triggers on (harness/warden/discovery.py `_has_discovery_context`
// + the curated pathways' `triggers`). Selecting a chip MUST set its flag — the
// curated fast-path pathways (airport/base → AFFF/PFAS → water; pre-1978 → lead;
// farmland → nitrate) key on these, NOT on the free-text list. "recent renovation"
// has no brain flag yet (#049) so it rides along only as a free-text proximity span.
export const PROXIMITY_FLAG: Record<string, string> = {
  "near an airport": "near_airport",
  "military base": "near_military_base",
  "farmland": "near_farmland",
  "industrial site": "near_industrial",
  "older home (pre-1978)": "old_home",
  "well water": "well_water",
};

// The seeded demo basket (the safe demo path, rubric §E).
export const DEMO_BASKET = [
  "Fisher-Price Rock 'n Play Sleeper",
  "Peloton Tread+ treadmill",
  "portable space heater",
  "lithium-ion power bank",
  "baby inclined sleeper",
];

// Build the context the brain expects (#036: {zip, water_source}). Extend with the
// proximity/region signals that drive §11 discovery — never medical (rubric §6).
export function buildContext(opts: {
  zip?: string;
  region?: string;
  tapWater?: boolean;
  proximity?: string[];
}): Record<string, unknown> {
  const ctx: Record<string, unknown> = {};
  const z = (opts.zip ?? "").replace(/\D/g, "").slice(0, 5);
  if (z.length === 5) ctx.zip = z;
  if (opts.region?.trim()) ctx.region = opts.region.trim();
  if (opts.tapWater) ctx.water_source = "tap";
  if (opts.proximity && opts.proximity.length) {
    // Keep the verbatim spans (free text + "recent renovation") so INFER has the
    // trigger_signal text…
    ctx.proximity = opts.proximity;
    // …AND set the boolean flags the curated §11 fast-path triggers on. Without
    // this the new "Anything nearby?" chips were inert (discovery only half-fired
    // off ZIP; the AFFF→PFAS flagship never triggered).
    for (const p of opts.proximity) {
      const flag = PROXIMITY_FLAG[p.trim().toLowerCase()];
      if (flag) ctx[flag] = true;
    }
  }
  return ctx;
}
