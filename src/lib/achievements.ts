// ──────────────────────────────────────────────────────────────
// Achievement catalog — the single source of truth for an achievement's
// presentation (Icon / title / desc / hidden), keyed by its stable id.
//
// Consumed by BOTH:
//   • stats.ts `computeAchievements` (the owner's Dashboard view), and
//   • the social Feed, which only receives an `achievement_id` from the DB and
//     must render the same icon/title and apply the same secret-masking rule.
// Keeping it here means the two surfaces can never drift apart.
//
// The DB (`user_achievements`) stores only durable facts — (user_id,
// achievement_id, unlocked_at) — never this presentation, so copy edits here
// never need a migration.
// ──────────────────────────────────────────────────────────────

import {
  Headphones,
  Disc3,
  Swords,
  Globe,
  Trophy,
  Flame,
  Zap,
  Crown,
  Timer,
  BadgeCheck,
  Clock,
  Stamp,
  Gem,
  ThumbsDown,
  PenLine,
  type LucideIcon,
} from "lucide-react";

export interface AchievementMeta {
  Icon: LucideIcon;
  title: string;
  desc: string;
  /** Secret achievements stay masked ("???") to non-earners to entice them. */
  hidden: boolean;
}

/** id → presentation. Insertion order is the display order. */
export const ACHIEVEMENT_CATALOG: Record<string, AchievementMeta> = {
  "first-spin": { Icon: Headphones, title: "First Spin", desc: "Complete your very first album.", hidden: false },
  "ten-down": { Icon: Disc3, title: "Crate Digger", desc: "Complete 10 albums.", hidden: false },
  "discography-slayer": { Icon: Swords, title: "Discography Slayer", desc: "Conquer an artist's entire catalog.", hidden: false },
  "genre-hopper": { Icon: Globe, title: "Genre Hopper", desc: "Finish albums across 4+ different genres.", hidden: false },
  "perfect-ten": { Icon: Trophy, title: "The Perfect Ten", desc: "Award a 10.0 on the Dean Meter.", hidden: false },
  "marathoner-25": { Icon: Flame, title: "Warmed Up", desc: "Log 25 hours of listening.", hidden: false },
  "marathoner-100": { Icon: Zap, title: "Triple Digits", desc: "Log 100 hours of listening.", hidden: false },
  "the-summit": { Icon: Crown, title: "The Summit", desc: "Listen through the entire tracked runtime. The marathon is complete.", hidden: false },
  endurance: { Icon: Timer, title: "Endurance Test", desc: "Complete a single album longer than 90 minutes.", hidden: false },
  completionist: { Icon: BadgeCheck, title: "The Completionist", desc: "Rate every single track on a completed album.", hidden: false },
  "time-traveler": { Icon: Clock, title: "Time Traveler", desc: "Complete albums spanning five different decades.", hidden: true },
  globetrotter: { Icon: Stamp, title: "Passport Stamped", desc: "Finish albums from artists of five different countries.", hidden: true },
  flawless: { Icon: Gem, title: "Flawless", desc: "Award a single song a perfect 10.0.", hidden: true },
  "tough-crowd": { Icon: ThumbsDown, title: "Tough Crowd", desc: "Rate an album below 2.0. Somebody had to say it.", hidden: true },
  "the-essayist": { Icon: PenLine, title: "The Essayist", desc: "Write a review of 280+ characters. A true head.", hidden: true },
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

/**
 * The single global secret-masking rule, applied identically everywhere
 * (own Dashboard, others' profiles, the feed): a secret achievement stays masked
 * ("❓ Secret Achievement") unless the CURRENT VIEWER has unlocked it themselves.
 * Keyed on the viewer — never on the profile owner or the earner — so unlocking
 * it once reveals it for the viewer wherever it appears.
 */
export function shouldMaskSecret(meta: { hidden?: boolean }, viewerUnlocked: boolean): boolean {
  return Boolean(meta.hidden) && !viewerUnlocked;
}
