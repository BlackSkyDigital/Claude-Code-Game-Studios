import type { Role } from "./types.js";

/**
 * Full Football-Manager-style attribute set (each 1–20), split into Technical,
 * Mental, Physical and Goalkeeping. Every player carries the complete set so
 * the model is "complete"; the match engine wires in the most impactful ones
 * today and can deepen over time without a data migration.
 */
export interface Attrs {
  // Technical
  finishing: number;
  longShots: number;
  passing: number;
  technique: number;
  dribbling: number;
  tackling: number;
  marking: number;
  heading: number;
  crossing: number;
  firstTouch: number;
  // Mental
  vision: number;
  decisions: number;
  composure: number;
  anticipation: number;
  offTheBall: number;
  positioning: number;
  workRate: number;
  aggression: number;
  bravery: number;
  concentration: number;
  teamwork: number;
  determination: number;
  flair: number;
  leadership: number;
  // Physical
  pace: number;
  acceleration: number;
  stamina: number;
  strength: number;
  agility: number;
  balance: number;
  jumpingReach: number;
  naturalFitness: number;
  // Goalkeeping (only meaningful for keepers)
  reflexes: number;
  handling: number;
  oneOnOnes: number;
  aerialReach: number;
  kicking: number;
  command: number;
}

export const ATTR_KEYS: (keyof Attrs)[] = [
  "finishing", "longShots", "passing", "technique", "dribbling", "tackling",
  "marking", "heading", "crossing", "firstTouch", "vision", "decisions",
  "composure", "anticipation", "offTheBall", "positioning", "workRate",
  "aggression", "bravery", "concentration", "teamwork", "determination",
  "flair", "leadership", "pace", "acceleration", "stamina", "strength",
  "agility", "balance", "jumpingReach", "naturalFitness", "reflexes",
  "handling", "oneOnOnes", "aerialReach", "kicking", "command",
];

type Group = "GK" | "CB" | "FB" | "DM" | "CM" | "WIDE" | "AM" | "ST";

function groupOf(role: Role): Group {
  switch (role) {
    case "GK": return "GK";
    case "DC": return "CB";
    case "DL":
    case "DR": return "FB";
    case "DM": return "DM";
    case "MC": return "CM";
    case "ML":
    case "MR": return "WIDE";
    case "AM": return "AM";
    case "ST": return "ST";
  }
}

/** Per-position emphasis (delta added to the player's overall). Unlisted
 * attributes sit a touch below overall (see makeAttrs). */
const EMPH: Record<Group, Partial<Record<keyof Attrs, number>>> = {
  GK: {
    reflexes: 3, handling: 3, oneOnOnes: 2, aerialReach: 2, kicking: 1,
    command: 2, positioning: 2, concentration: 2, composure: 1,
    finishing: -9, longShots: -8, dribbling: -7, crossing: -8, heading: -4,
    tackling: -6, marking: -5, pace: -3, offTheBall: -7,
  },
  CB: {
    tackling: 3, marking: 3, heading: 3, strength: 3, jumpingReach: 3,
    positioning: 2, bravery: 2, anticipation: 1, finishing: -6, dribbling: -3,
    crossing: -4, flair: -3, pace: -1,
  },
  FB: {
    pace: 2, acceleration: 2, crossing: 2, tackling: 2, stamina: 3, workRate: 2,
    marking: 1, finishing: -4, longShots: -3, heading: -1,
  },
  DM: {
    tackling: 2, marking: 2, positioning: 2, passing: 2, anticipation: 2,
    workRate: 2, stamina: 2, teamwork: 2, strength: 1, finishing: -3, crossing: -2,
  },
  CM: {
    passing: 3, vision: 2, technique: 2, decisions: 2, stamina: 2, workRate: 2,
    teamwork: 1, offTheBall: 1,
  },
  WIDE: {
    pace: 3, acceleration: 3, dribbling: 3, crossing: 3, agility: 2, flair: 2,
    technique: 1, offTheBall: 1, stamina: 1, tackling: -2, marking: -2, strength: -1,
  },
  AM: {
    vision: 3, passing: 3, technique: 3, dribbling: 2, flair: 3, decisions: 2,
    composure: 2, offTheBall: 2, longShots: 2, finishing: 1, tackling: -3,
    marking: -3, strength: -1,
  },
  ST: {
    finishing: 4, offTheBall: 3, composure: 2, anticipation: 2, longShots: 1,
    heading: 2, pace: 2, acceleration: 2, technique: 1, dribbling: 1,
    tackling: -4, marking: -4,
  },
};

/**
 * Build a full attribute profile for a player from a single `overall` rating
 * (1–20) plus role-based emphasis, with optional explicit overrides for the
 * handful of standout attributes that define a real player.
 */
export function makeAttrs(
  role: Role,
  overall: number,
  ov: Partial<Attrs> = {},
): Attrs {
  const emph = EMPH[groupOf(role)];
  const out = {} as Attrs;
  for (const k of ATTR_KEYS) {
    const delta = emph[k] ?? -1; // unemphasised attributes a touch below overall
    out[k] = Math.max(1, Math.min(20, Math.round(overall + delta)));
  }
  return { ...out, ...ov };
}
