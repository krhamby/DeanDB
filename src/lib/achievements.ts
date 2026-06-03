// ──────────────────────────────────────────────────────────────
// Achievement catalog — the single source of truth for an achievement's
// presentation (emoji / title / desc / hidden), keyed by its stable id.
//
// Consumed by BOTH:
//   • stats.ts `computeAchievements` (the owner's Dashboard view), and
//   • the social Feed, which only receives an `achievement_id` from the DB and
//     must render the same emoji/title and apply the same secret-masking rule.
// Keeping it here means the two surfaces can never drift apart.
//
// The DB (`user_achievements`) stores only durable facts — (user_id,
// achievement_id, unlocked_at) — never this presentation, so copy edits here
// never need a migration.
// ──────────────────────────────────────────────────────────────

export interface AchievementMeta {
  emoji: string;
  title: string;
  desc: string;
  /** Secret achievements stay masked ("???") to non-earners to entice them. */
  hidden: boolean;
}

/** id → presentation. Insertion order is the display order. */
export const ACHIEVEMENT_CATALOG: Record<string, AchievementMeta> = {
  "first-spin": { emoji: "🎧", title: "First Spin", desc: "Complete your very first album.", hidden: false },
  "ten-down": { emoji: "💿", title: "Crate Digger", desc: "Complete 10 albums.", hidden: false },
  "discography-slayer": { emoji: "🗡️", title: "Discography Slayer", desc: "Conquer an artist's entire catalog.", hidden: false },
  "genre-hopper": { emoji: "🌍", title: "Genre Hopper", desc: "Finish albums across 4+ different genres.", hidden: false },
  "perfect-ten": { emoji: "🏆", title: "The Perfect Ten", desc: "Award a 10.0 on the Dean Meter.", hidden: false },
  "marathoner-25": { emoji: "🔥", title: "Warmed Up", desc: "Log 25 hours of listening.", hidden: false },
  "marathoner-100": { emoji: "⚡", title: "Triple Digits", desc: "Log 100 hours of listening.", hidden: false },
  "the-summit": { emoji: "👑", title: "The Summit", desc: "Listen through the entire tracked runtime. The marathon is complete.", hidden: false },
  endurance: { emoji: "⏱️", title: "Endurance Test", desc: "Complete a single album longer than 90 minutes.", hidden: false },
  completionist: { emoji: "✅", title: "The Completionist", desc: "Rate every single track on a completed album.", hidden: false },
  "time-traveler": { emoji: "🕰️", title: "Time Traveler", desc: "Complete albums spanning five different decades.", hidden: true },
  globetrotter: { emoji: "🌐", title: "Passport Stamped", desc: "Finish albums from artists of five different countries.", hidden: true },
  flawless: { emoji: "💎", title: "Flawless", desc: "Award a single song a perfect 10.0.", hidden: true },
  "tough-crowd": { emoji: "🍅", title: "Tough Crowd", desc: "Rate an album below 2.0. Somebody had to say it.", hidden: true },
  "the-essayist": { emoji: "✍️", title: "The Essayist", desc: "Write a review of 280+ characters. A true head.", hidden: true },
};

/** Stable display order of achievement ids. */
export const ACHIEVEMENT_ORDER = Object.keys(ACHIEVEMENT_CATALOG);

/** Presentation for an id, or undefined for an unknown/retired id. */
export function achievementMeta(id: string): AchievementMeta | undefined {
  return ACHIEVEMENT_CATALOG[id];
}

/** True only for known + secret achievements (unknown ids are treated as public). */
export function isHiddenAchievement(id: string): boolean {
  return ACHIEVEMENT_CATALOG[id]?.hidden ?? false;
}
