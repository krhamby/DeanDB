import { useEffect, useState } from "react";

// Tiny hash-based router. Hash routing means GitHub Pages serves the app
// from a single index.html with zero 404 / rewrite configuration needed.
//
// Routes:
//   #/                       -> feed (signed in) or discover/landing
//   #/login                  -> magic-link sign in
//   #/me                     -> my journey (editable)
//   #/editor                 -> my editor
//   #/settings               -> profile + visibility
//   #/feed                   -> activity feed
//   #/people                 -> discover + follow
//   #/recommendations        -> recommendation inbox
//   #/u/:username            -> a user's public journey (read-only)
//   #/u/:username/artists
//   #/u/:username/artist/:id
//   #/u/:username/album/:artist/:album
//   #/u/:username/hall-of-fame
//   #/artist/:id             -> my journey shortcuts (resolve against me)
//   #/album/:artist/:album
//   #/hall-of-fame

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

export interface UserRoute {
  username: string;
  /** The remaining segments after the username, e.g. ["album", aId, alId]. */
  rest: string[];
}

/**
 * Split a `#/u/:username/...` route. Returns null for non-user routes.
 * `segments` is the output of parseRoute().
 */
export function parseUserRoute(segments: string[]): UserRoute | null {
  if (segments[0] !== "u" || !segments[1]) return null;
  return { username: segments[1], rest: segments.slice(2) };
}
