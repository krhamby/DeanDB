import { useEffect, useState } from "react";

// Tiny hash-based router. Hash routing means GitHub Pages serves the app
// from a single index.html with zero 404 / rewrite configuration needed.
//
// Routes:
//   #/                 -> dashboard
//   #/artists          -> artist index
//   #/artist/:id       -> artist detail
//   #/album/:artist/:id-> album detail
//   #/hall-of-fame     -> top-rated leaderboard
//   #/editor           -> Dean's editor

export function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash || "#/");
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

export function navigate(path: string) {
  window.location.hash = path.startsWith("#") ? path : `#${path}`;
}

/** Parse "#/album/radiohead/rh-okc" -> ["album", "radiohead", "rh-okc"] */
export function parseRoute(hash: string): string[] {
  return hash.replace(/^#\/?/, "").split("/").filter(Boolean);
}
