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

/** Mix a hex color toward black by `amt` (0–1). */
export function darken(hex: string, amt: number): string {
  const { r, g, b } = hexToRgb(hex);
  const mix = (c: number) => Math.round(c * (1 - amt));
  const to2 = (c: number) => mix(c).toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

// ── Contrast (WCAG 2.x relative luminance) ──────────────────────
// The accent is used BOTH as a fill behind text (`bg-gold text-on-accent`)
// and as text on the UI surface (`text-gold`). Guaranteeing the accent
// clears 4.5:1 against the surface satisfies both at once. `--color-on-accent`
// is chosen (black/white) by whichever has more contrast against the clamped
// accent, so any user-chosen color keeps fills legible on both skins.

/** The base surface each skin sits on (drives the contrast clamp direction). */
export const SKIN_SURFACE = { midnight: "#15151a", paper: "#f1e8d8" } as const;
export type SkinId = keyof typeof SKIN_SURFACE;

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Nudge a colour just enough to clear `min`:1 contrast against `surface`,
 * preserving hue. On a dark surface we lighten; on a light surface we darken.
 * Already-legible colours pass through untouched.
 */
export function legible(hex: string, surface: string = SKIN_SURFACE.midnight, min = 4.5): string {
  let c = isHexColor(hex) ? hex : DEFAULT_THEME.accent;
  const surfaceIsDark = relativeLuminance(surface) < 0.5;
  for (let i = 0; i < 24 && contrastRatio(c, surface) < min; i++) {
    c = surfaceIsDark ? lighten(c, 0.1) : darken(c, 0.1);
  }
  return c;
}

/** Black or white — whichever is more legible as text on top of `accent`. */
export function pickOnAccent(accent: string): string {
  return contrastRatio(accent, "#000000") >= contrastRatio(accent, "#ffffff") ? "#000000" : "#ffffff";
}

/** Write a theme onto the document root, overriding the @theme CSS variables.
 *  Non-hex inputs fall back to the defaults, and every colour is clamped to a
 *  legible luminance before reaching the CSS sink, so no user choice can make
 *  accent text or accent buttons unreadable. */
export function applyTheme(t: Theme, surface: string = SKIN_SURFACE.midnight): void {
  if (typeof document === "undefined") return;
  const accent = legible(isHexColor(t.accent) ? t.accent : DEFAULT_THEME.accent, surface);
  const secondary = legible(isHexColor(t.secondary) ? t.secondary : DEFAULT_THEME.secondary, surface);
  const root = document.documentElement.style;
  root.setProperty("--color-gold", accent);
  root.setProperty("--color-gold-soft", surface === SKIN_SURFACE.paper ? darken(accent, 0.12) : lighten(accent, 0.55));
  root.setProperty("--color-dean", secondary);
  const onAccent = pickOnAccent(accent);
  root.setProperty("--color-on-accent", onAccent);
}
