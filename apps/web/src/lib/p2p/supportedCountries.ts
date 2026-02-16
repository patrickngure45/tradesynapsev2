export const SUPPORTED_P2P_COUNTRIES = {
  Africa: [
    "Tanzania",
    "Uganda",
    "Rwanda",
    "Burundi",
    "Democratic Republic of the Congo",
    "South Africa",
    "Nigeria",
    "Ghana",
    "Ethiopia",
    "Somalia",
    "Sudan",
    "Egypt",
  ],
  "Middle East": [
    "United Arab Emirates",
    "Saudi Arabia",
    "Qatar",
    "Kuwait",
    "Oman",
    "Bahrain",
    "Israel",
    "Jordan",
  ],
  Europe: [
    "United Kingdom",
    "Germany",
    "France",
    "Italy",
    "Netherlands",
    "Sweden",
    "Norway",
    "Spain",
    "Switzerland",
    "Ireland",
    "Belgium",
    "Austria",
    "Denmark",
  ],
  "North America": ["United States", "Canada"],
  Asia: [
    "India",
    "China",
    "Pakistan",
    "Bangladesh",
    "Philippines",
    "Malaysia",
    "Singapore",
    "Japan",
    "South Korea",
  ],
  Oceania: ["Australia", "New Zealand"],
} as const;

function normalizeCountry(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const COUNTRY_ALIASES: Record<string, string> = {
  uk: "unitedkingdom",
  uae: "unitedarabemirates",
  usa: "unitedstates",
  us: "unitedstates",
  drc: "democraticrepublicofthecongo",
  "drcongo": "democraticrepublicofthecongo",
  "drcongo(drc)": "democraticrepublicofthecongo",
  "democraticrepublicofcongo": "democraticrepublicofthecongo",
  "congodrc": "democraticrepublicofthecongo",
  "republicofkorea": "southkorea",
  "korea": "southkorea",
  "unitedrepublicoftanzania": "tanzania",
};

const SUPPORTED_COUNTRY_SET = (() => {
  const all = Object.values(SUPPORTED_P2P_COUNTRIES).flat();
  const normalized = new Set<string>(all.map((c) => normalizeCountry(c)));
  // Add alias keys and values
  for (const [k, v] of Object.entries(COUNTRY_ALIASES)) {
    normalized.add(normalizeCountry(k));
    normalized.add(normalizeCountry(v));
  }
  return normalized;
})();

/**
 * Returns true when the given country is allowed for P2P.
 *
 * Policy: if country is missing/null, we do NOT block (backwards compatible).
 */
export function isSupportedP2PCountry(country: string | null | undefined): boolean {
  const raw = (country ?? "").trim();
  if (!raw) return true;

  const n = normalizeCountry(raw);
  const mapped = COUNTRY_ALIASES[n] ? normalizeCountry(COUNTRY_ALIASES[n]!) : n;
  return SUPPORTED_COUNTRY_SET.has(mapped) || SUPPORTED_COUNTRY_SET.has(n);
}
