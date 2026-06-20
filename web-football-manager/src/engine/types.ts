/**
 * Core data types for the match engine.
 *
 * Coordinate system: a 105m x 68m pitch.
 *   - x runs 0 (home goal line) -> 105 (away goal line)
 *   - y runs 0 -> 68 (touchlines)
 *   - Home team (index 0) attacks toward +x; away team (index 1) toward -x.
 *   - Goal mouth spans y in [GOAL_Y_MIN, GOAL_Y_MAX].
 */

export const PITCH_LENGTH = 105;
export const PITCH_WIDTH = 68;
export const GOAL_WIDTH = 7.32;
export const GOAL_Y_MIN = PITCH_WIDTH / 2 - GOAL_WIDTH / 2; // ~30.34
export const GOAL_Y_MAX = PITCH_WIDTH / 2 + GOAL_WIDTH / 2; // ~37.66

export interface Vec {
  x: number;
  y: number;
}

export type Role =
  | "GK"
  | "DL"
  | "DC"
  | "DR"
  | "DM"
  | "ML"
  | "MC"
  | "MR"
  | "AM"
  | "ST";

import type { Attrs } from "./attributes.js";
export type { Attrs };

/**
 * Preferred Player Moves (FM-style traits). These bias a player's on-ball and
 * off-ball decisions toward the things they habitually do in real life, on top
 * of their raw attributes — so two players with the same numbers still feel
 * different.
 */
export type Trait =
  | "shoots_from_distance" // more willing to pull the trigger from range
  | "places_shots" // favours placed/finesse finishes over power
  | "tries_killer_balls" // looks for the through ball more often
  | "likes_to_dribble" // attempts more 1v1 take-ons
  | "runs_in_behind" // times runs into the space behind the line
  | "cuts_inside" // wide player drifts infield onto his stronger foot
  | "gets_forward"; // full-back / midfielder pushes up to join attacks

/**
 * Individual player instructions — the per-player layer that sits on top of the
 * team tactics (FM-style). For now this covers marking duties; role/duty and
 * other PIs can extend this without a data migration.
 */
export interface PlayerInstructions {
  /** man-mark a specific opponent: an opponent's name, or a Role to mark the
   * nearest opponent playing that position (e.g. mark their "AM"). */
  mark?: string;
  /** stick especially tight to the marked man (less space, but easier to lose) */
  tightMark?: boolean;
}

export interface PlayerDef {
  name: string;
  number: number;
  role: Role;
  attrs: Attrs;
  traits?: Trait[];
  instructions?: PlayerInstructions;
}

export interface TeamDef {
  name: string;
  short: string; // 3-letter code, e.g. "MCI"
  color: string; // primary kit colour (CSS)
  textColor: string; // number colour for contrast
  formation: string; // key into FORMATIONS
  players: PlayerDef[]; // exactly 11 (the starting XI)
  bench?: PlayerDef[]; // substitutes available from the bench
}

/**
 * Match event taxonomy. Inspired by OpenFootManager's event-driven model, but
 * emitted alongside a continuously-simulated 2D state so we can both render the
 * aerial view and produce text commentary from the same source of truth.
 */
export type MatchEventType =
  | "kickoff"
  | "buildup"
  | "shot"
  | "goal"
  | "shot_on"
  | "shot_off"
  | "save"
  | "block"
  | "cross"
  | "key_pass"
  | "take_on"
  | "tackle"
  | "interception"
  | "foul"
  | "offside"
  | "injury"
  | "substitution"
  | "corner"
  | "penalty"
  | "throw_in"
  | "goal_kick"
  | "half_time"
  | "full_time";

export interface MatchEvent {
  minute: number; // match minute, 0–90
  type: MatchEventType;
  team?: 0 | 1; // team the event is attributed to, if any
  playerName?: string;
  text: string; // commentary line
}
