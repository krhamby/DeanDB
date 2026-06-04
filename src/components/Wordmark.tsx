type WordmarkSize = "nav" | "hero" | "footer";

const SIZES: Record<WordmarkSize, string> = {
  nav: "text-xl",
  hero: "text-4xl sm:text-5xl",
  footer: "text-base",
};

/**
 * The DeanDB editorial wordmark — the single source of truth for the logo
 * lockup. "Dean" in the accent (`--color-gold`, so it tracks theme overrides),
 * "DB" in the foreground; set in Fraunces. No pill (brand v1 decision).
 */
export function Wordmark({ size = "nav", className = "" }: { size?: WordmarkSize; className?: string }) {
  return (
    <span className={`font-display font-black leading-none tracking-tight ${SIZES[size]} ${className}`}>
      <span className="text-gold">Dean</span>
      <span className="text-fg">DB</span>
    </span>
  );
}
