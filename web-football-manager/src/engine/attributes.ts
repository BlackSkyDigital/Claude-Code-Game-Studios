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
 * Position-weighted attribute importance, FM-style: how much each attribute
 * matters to a player in this position. Used to compute a single Current Ability
 * (CA) readout — a weighted measure of "how much quality is packed into the
 * attributes that matter for this role". Mirrors the FM idea that +1 Finishing
 * is worth a lot of CA for a striker but almost nothing for a centre-back.
 *
 * Only the attributes that meaningfully drive a role carry weight; everything
 * else gets a small baseline (BASE_W) so it still counts a little. Weights are
 * relative — they're normalised when CA is computed, so they need not sum to
 * anything in particular.
 */
const BASE_W = 0.4;
const CA_WEIGHTS: Record<Group, Partial<Record<keyof Attrs, number>>> = {
  GK: {
    reflexes: 5, handling: 4, oneOnOnes: 3, aerialReach: 3, command: 3,
    kicking: 2, positioning: 3, concentration: 2, composure: 2, anticipation: 2,
    agility: 2, decisions: 2,
  },
  CB: {
    marking: 5, tackling: 4, heading: 4, positioning: 4, strength: 3,
    jumpingReach: 3, anticipation: 3, bravery: 2, concentration: 3, composure: 2,
    pace: 2, decisions: 2, passing: 1,
  },
  FB: {
    pace: 4, acceleration: 3, stamina: 4, crossing: 3, tackling: 3, marking: 3,
    workRate: 3, positioning: 2, anticipation: 2, dribbling: 2, passing: 2,
    decisions: 2, teamwork: 2,
  },
  DM: {
    tackling: 4, marking: 3, positioning: 4, anticipation: 3, passing: 4,
    decisions: 4, composure: 3, vision: 2, teamwork: 3, workRate: 3, stamina: 3,
    strength: 2, concentration: 2,
  },
  CM: {
    passing: 5, vision: 4, decisions: 4, technique: 3, composure: 3, teamwork: 3,
    workRate: 3, stamina: 3, offTheBall: 2, dribbling: 2, longShots: 2,
    anticipation: 2, firstTouch: 2,
  },
  WIDE: {
    pace: 4, acceleration: 4, dribbling: 5, crossing: 4, technique: 3, agility: 3,
    flair: 3, offTheBall: 3, firstTouch: 2, finishing: 2, stamina: 2, decisions: 2,
  },
  AM: {
    vision: 5, passing: 4, technique: 4, dribbling: 4, flair: 4, decisions: 4,
    composure: 3, offTheBall: 3, firstTouch: 3, longShots: 3, finishing: 2,
    anticipation: 2,
  },
  ST: {
    finishing: 6, composure: 4, offTheBall: 5, anticipation: 3, firstTouch: 3,
    pace: 3, acceleration: 3, technique: 3, heading: 3, longShots: 2, dribbling: 2,
    strength: 2, jumpingReach: 2, balance: 2,
  },
};

/**
 * Current Ability (CA) on FM's 1–200 scale: a position-weighted measure of a
 * player's quality. It is derived purely from the existing attributes (the same
 * numbers the match engine reads), so it adds no new authored data — it's a
 * readout/scouting figure, not an input. Computed as the role-weighted average
 * of the attributes (1–20), rescaled ×10 to 1–200.
 *
 * NOTE: this is intentionally the "cheap" half of FM's system — there is no
 * Potential Ability, age or development yet (those belong with career mode).
 */
export function currentAbility(role: Role, attrs: Attrs): number {
  const w = CA_WEIGHTS[groupOf(role)];
  let sum = 0;
  let wsum = 0;
  for (const k of ATTR_KEYS) {
    const weight = w[k] ?? BASE_W;
    sum += attrs[k] * weight;
    wsum += weight;
  }
  const avg = sum / wsum; // weighted mean attribute (1–20)
  return Math.max(1, Math.min(200, Math.round(avg * 10)));
}

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
