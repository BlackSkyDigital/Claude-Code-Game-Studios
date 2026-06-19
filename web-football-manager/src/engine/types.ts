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

/** Player ability ratings, FM-style 1–20. */
export interface Attrs {
  pace: number; // top speed / acceleration
  passing: number; // pass accuracy & range
  shooting: number; // shot accuracy & power
  tackling: number; // winning the ball
  control: number; // first touch / retaining the ball
}

export interface PlayerDef {
  name: string;
  number: number;
  role: Role;
  attrs: Attrs;
}

export interface TeamDef {
  name: string;
  short: string; // 3-letter code, e.g. "MCI"
  color: string; // primary kit colour (CSS)
  textColor: string; // number colour for contrast
  formation: string; // key into FORMATIONS
  players: PlayerDef[]; // exactly 11
}

/**
 * Match event taxonomy. Inspired by OpenFootManager's event-driven model, but
 * emitted alongside a continuously-simulated 2D state so we can both render the
 * aerial view and produce text commentary from the same source of truth.
 */
export type MatchEventType =
  | "kickoff"
  | "goal"
  | "shot_on"
  | "shot_off"
  | "save"
  | "tackle"
  | "interception"
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
