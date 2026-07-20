/**
 * Country dial codes for the phone input. Flags are derived from the ISO-3166
 * alpha-2 code via Unicode regional-indicator characters — no asset/library
 * needed. India is intentionally first (default market).
 */

export interface Country {
  name: string;
  iso2: string;
  dial: string;
  flag: string;
}

/** "IN" -> 🇮🇳 */
function flagFor(iso2: string): string {
  return iso2
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

// [name, iso2, dial] — order matters for prefix matching on shared codes.
const RAW: Array<[string, string, string]> = [
  ["India", "IN", "+91"],
  ["United States", "US", "+1"],
  ["United Kingdom", "GB", "+44"],
  ["United Arab Emirates", "AE", "+971"],
  ["Singapore", "SG", "+65"],
  ["Australia", "AU", "+61"],
  ["Canada", "CA", "+1"],
  ["Germany", "DE", "+49"],
  ["France", "FR", "+33"],
  ["Netherlands", "NL", "+31"],
  ["Ireland", "IE", "+353"],
  ["Saudi Arabia", "SA", "+966"],
  ["Qatar", "QA", "+974"],
  ["Kuwait", "KW", "+965"],
  ["Bahrain", "BH", "+973"],
  ["Oman", "OM", "+968"],
  ["Bangladesh", "BD", "+880"],
  ["Pakistan", "PK", "+92"],
  ["Sri Lanka", "LK", "+94"],
  ["Nepal", "NP", "+977"],
  ["Bhutan", "BT", "+975"],
  ["Malaysia", "MY", "+60"],
  ["Indonesia", "ID", "+62"],
  ["Philippines", "PH", "+63"],
  ["Thailand", "TH", "+66"],
  ["Vietnam", "VN", "+84"],
  ["China", "CN", "+86"],
  ["Hong Kong", "HK", "+852"],
  ["Japan", "JP", "+81"],
  ["South Korea", "KR", "+82"],
  ["New Zealand", "NZ", "+64"],
  ["South Africa", "ZA", "+27"],
  ["Nigeria", "NG", "+234"],
  ["Kenya", "KE", "+254"],
  ["Egypt", "EG", "+20"],
  ["Italy", "IT", "+39"],
  ["Spain", "ES", "+34"],
  ["Portugal", "PT", "+351"],
  ["Switzerland", "CH", "+41"],
  ["Sweden", "SE", "+46"],
  ["Norway", "NO", "+47"],
  ["Denmark", "DK", "+45"],
  ["Belgium", "BE", "+32"],
  ["Poland", "PL", "+48"],
  ["Russia", "RU", "+7"],
  ["Turkey", "TR", "+90"],
  ["Brazil", "BR", "+55"],
  ["Mexico", "MX", "+52"],
  ["Argentina", "AR", "+54"],
];

export const COUNTRIES: Country[] = RAW.map(([name, iso2, dial]) => ({
  name,
  iso2,
  dial,
  flag: flagFor(iso2),
}));

export const DEFAULT_COUNTRY =
  COUNTRIES.find((c) => c.iso2 === "IN") ?? COUNTRIES[0];

/**
 * Split a stored phone string ("+91 98765 43210") into a country + the local
 * number. Uses the longest matching dial prefix; falls back to India.
 */
export function parsePhone(value: string): {
  country: Country;
  national: string;
} {
  const trimmed = (value ?? "").trim();
  if (trimmed.startsWith("+")) {
    const match = COUNTRIES.filter((c) => trimmed.startsWith(c.dial)).sort(
      (a, b) => b.dial.length - a.dial.length,
    )[0];
    if (match) {
      return { country: match, national: trimmed.slice(match.dial.length).trim() };
    }
  }
  return { country: DEFAULT_COUNTRY, national: trimmed.replace(/^\+/, "").trim() };
}
