function normalizeCountry(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

// Only includes countries shown in the Supported Countries list.
// Uses ISO 3166-1 alpha-2 codes (lowercase for flag-icons).
const MAP: Record<string, string> = {
  // Africa
  kenya: "ke",
  tanzania: "tz",
  uganda: "ug",
  rwanda: "rw",
  burundi: "bi",
  democraticrepublicofthecongo: "cd",
  southafrica: "za",
  nigeria: "ng",
  ghana: "gh",
  ethiopia: "et",
  somalia: "so",
  sudan: "sd",
  egypt: "eg",

  // Middle East
  unitedarabemirates: "ae",
  saudiarabia: "sa",
  qatar: "qa",
  kuwait: "kw",
  oman: "om",
  bahrain: "bh",
  israel: "il",
  jordan: "jo",

  // Europe
  unitedkingdom: "gb",
  germany: "de",
  france: "fr",
  italy: "it",
  netherlands: "nl",
  sweden: "se",
  norway: "no",
  spain: "es",
  switzerland: "ch",
  ireland: "ie",
  belgium: "be",
  austria: "at",
  denmark: "dk",

  // North America
  unitedstates: "us",
  canada: "ca",

  // Asia
  india: "in",
  china: "cn",
  pakistan: "pk",
  bangladesh: "bd",
  philippines: "ph",
  malaysia: "my",
  singapore: "sg",
  japan: "jp",
  southkorea: "kr",

  // Oceania
  australia: "au",
  newzealand: "nz",
};

export function countryNameToIso2(countryName: string): string | null {
  const n = normalizeCountry(countryName);
  return MAP[n] ?? null;
}
