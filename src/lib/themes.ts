// ──────────────────────────────────────────────────────────────
// Theme tokens. A journey owner can recolor the two accents — the
// primary (`gold`) and secondary (`dean`) — while the dark base stays
// fixed "within reason". Defaults mirror the @theme tokens in index.css.
// ──────────────────────────────────────────────────────────────

export interface Theme {
  /** Primary accent — maps to --color-gold. */
  accent: string;
  /** Secondary accent — maps to --color-dean. */
  secondary: string;
}

export const DEFAULT_THEME: Theme = { accent: "#f5c518", secondary: "#ff5a3c" };

/** Curated palettes for one-tap theming (the first is the default). */
export const PRESETS: { id: string; name: string; theme: Theme }[] = [
  { id: "gold", name: "Classic Gold", theme: DEFAULT_THEME },
  { id: "sunset", name: "Sunset", theme: { accent: "#ff8c42", secondary: "#ff3c7d" } },
  { id: "emerald", name: "Emerald", theme: { accent: "#34d399", secondary: "#f5c518" } },
  { id: "violet", name: "Violet", theme: { accent: "#a78bfa", secondary: "#f472b6" } },
  { id: "cyan", name: "Cyan", theme: { accent: "#22d3ee", secondary: "#f5c518" } },
  { id: "rose", name: "Rose", theme: { accent: "#fb7185", secondary: "#fbbf24" } },
];

/** True for a 6-digit hex color (the only shape the picker/presets produce). */
export function isHexColor(s: string | null | undefined): s is string {
  return typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s);
}

/**
 * Resolve a profile's stored colors to a full theme. Unset *or malformed*
 * values fall back to the defaults — so an arbitrary string that reached the
 * column (e.g. via the raw API) can never flow into a CSS custom property.
 */
export function resolveTheme(
  p?: { themeAccent?: string | null; themeSecondary?: string | null } | null,
): Theme {
  const accent = p?.themeAccent;
  const secondary = p?.themeSecondary;
  return {
    accent: isHexColor(accent) ? accent : DEFAULT_THEME.accent,
    secondary: isHexColor(secondary) ? secondary : DEFAULT_THEME.secondary,
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Mix a hex color toward white by `amt` (0–1) — used to derive the soft accent. */
export function lighten(hex: string, amt: number): string {
  const { r, g, b } = hexToRgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * amt);
  const to2 = (c: number) => mix(c).toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

/** Write a theme onto the document root, overriding the @theme CSS variables.
 *  Non-hex inputs are dropped to the defaults before reaching the CSS sink. */
export function applyTheme(t: Theme): void {
  if (typeof document === "undefined") return;
  const accent = isHexColor(t.accent) ? t.accent : DEFAULT_THEME.accent;
  const secondary = isHexColor(t.secondary) ? t.secondary : DEFAULT_THEME.secondary;
  const root = document.documentElement.style;
  root.setProperty("--color-gold", accent);
  root.setProperty("--color-gold-soft", lighten(accent, 0.55));
  root.setProperty("--color-dean", secondary);
}
