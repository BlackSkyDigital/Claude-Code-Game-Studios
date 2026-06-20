import type { Role, Vec } from "./types.js";
import { PITCH_LENGTH } from "./types.js";

/**
 * Formation = base (resting) positions for an 11-player side, expressed in
 * "home" coordinates (attacking toward +x). The away side mirrors x.
 *
 * Positions are anchors; during play the engine shifts players toward the ball
 * and pushes the attacking line up, so these only define the shape.
 */
export interface Slot {
  role: Role;
  pos: Vec;
}

export const FORMATIONS: Record<string, Slot[]> = {
  "4-3-3": [
    { role: "GK", pos: { x: 5, y: 34 } },
    { role: "DR", pos: { x: 20, y: 56 } },
    { role: "DC", pos: { x: 16, y: 42 } },
    { role: "DC", pos: { x: 16, y: 26 } },
    { role: "DL", pos: { x: 20, y: 12 } },
    { role: "DM", pos: { x: 34, y: 34 } },
    { role: "MC", pos: { x: 42, y: 46 } },
    { role: "MC", pos: { x: 42, y: 22 } },
    { role: "MR", pos: { x: 70, y: 58 } },
    { role: "ST", pos: { x: 80, y: 34 } },
    { role: "ML", pos: { x: 70, y: 10 } },
  ],
  "4-4-2": [
    { role: "GK", pos: { x: 5, y: 34 } },
    { role: "DR", pos: { x: 20, y: 56 } },
    { role: "DC", pos: { x: 16, y: 42 } },
    { role: "DC", pos: { x: 16, y: 26 } },
    { role: "DL", pos: { x: 20, y: 12 } },
    { role: "MC", pos: { x: 42, y: 40 } },
    { role: "DM", pos: { x: 38, y: 28 } },
    { role: "MR", pos: { x: 52, y: 58 } },
    { role: "ML", pos: { x: 52, y: 10 } },
    { role: "ST", pos: { x: 76, y: 40 } },
    { role: "ST", pos: { x: 76, y: 28 } },
  ],
  "4-2-3-1": [
    { role: "GK", pos: { x: 5, y: 34 } },
    { role: "DR", pos: { x: 20, y: 56 } },
    { role: "DC", pos: { x: 16, y: 42 } },
    { role: "DC", pos: { x: 16, y: 26 } },
    { role: "DL", pos: { x: 20, y: 12 } },
    { role: "DM", pos: { x: 34, y: 40 } },
    { role: "DM", pos: { x: 34, y: 28 } },
    { role: "MR", pos: { x: 64, y: 58 } },
    { role: "AM", pos: { x: 60, y: 34 } },
    { role: "ML", pos: { x: 64, y: 10 } },
    { role: "ST", pos: { x: 82, y: 34 } },
  ],
  "3-5-2": [
    { role: "GK", pos: { x: 5, y: 34 } },
    { role: "DC", pos: { x: 16, y: 46 } },
    { role: "DC", pos: { x: 14, y: 34 } },
    { role: "DC", pos: { x: 16, y: 22 } },
    { role: "MR", pos: { x: 50, y: 60 } },
    { role: "DM", pos: { x: 36, y: 34 } },
    { role: "MC", pos: { x: 46, y: 44 } },
    { role: "MC", pos: { x: 46, y: 24 } },
    { role: "ML", pos: { x: 50, y: 8 } },
    { role: "ST", pos: { x: 78, y: 40 } },
    { role: "ST", pos: { x: 78, y: 28 } },
  ],
  "5-3-2": [
    { role: "GK", pos: { x: 5, y: 34 } },
    { role: "DR", pos: { x: 24, y: 58 } },
    { role: "DC", pos: { x: 16, y: 44 } },
    { role: "DC", pos: { x: 14, y: 34 } },
    { role: "DC", pos: { x: 16, y: 24 } },
    { role: "DL", pos: { x: 24, y: 10 } },
    { role: "MC", pos: { x: 44, y: 46 } },
    { role: "DM", pos: { x: 38, y: 34 } },
    { role: "MC", pos: { x: 44, y: 22 } },
    { role: "ST", pos: { x: 76, y: 40 } },
    { role: "ST", pos: { x: 76, y: 28 } },
  ],
  "4-1-4-1": [
    { role: "GK", pos: { x: 5, y: 34 } },
    { role: "DR", pos: { x: 20, y: 56 } },
    { role: "DC", pos: { x: 16, y: 42 } },
    { role: "DC", pos: { x: 16, y: 26 } },
    { role: "DL", pos: { x: 20, y: 12 } },
    { role: "DM", pos: { x: 32, y: 34 } },
    { role: "MR", pos: { x: 58, y: 58 } },
    { role: "MC", pos: { x: 46, y: 42 } },
    { role: "MC", pos: { x: 46, y: 26 } },
    { role: "ML", pos: { x: 58, y: 10 } },
    { role: "ST", pos: { x: 80, y: 34 } },
  ],
  "4-3-2-1": [
    { role: "GK", pos: { x: 5, y: 34 } },
    { role: "DR", pos: { x: 20, y: 56 } },
    { role: "DC", pos: { x: 16, y: 42 } },
    { role: "DC", pos: { x: 16, y: 26 } },
    { role: "DL", pos: { x: 20, y: 12 } },
    { role: "DM", pos: { x: 34, y: 34 } },
    { role: "MC", pos: { x: 46, y: 46 } },
    { role: "MC", pos: { x: 46, y: 22 } },
    { role: "AM", pos: { x: 62, y: 42 } },
    { role: "AM", pos: { x: 62, y: 26 } },
    { role: "ST", pos: { x: 82, y: 34 } },
  ],
  "3-4-3": [
    { role: "GK", pos: { x: 5, y: 34 } },
    { role: "DC", pos: { x: 16, y: 46 } },
    { role: "DC", pos: { x: 14, y: 34 } },
    { role: "DC", pos: { x: 16, y: 22 } },
    { role: "MR", pos: { x: 48, y: 60 } },
    { role: "MC", pos: { x: 42, y: 40 } },
    { role: "MC", pos: { x: 42, y: 28 } },
    { role: "ML", pos: { x: 48, y: 8 } },
    { role: "MR", pos: { x: 76, y: 54 } },
    { role: "ST", pos: { x: 82, y: 34 } },
    { role: "ML", pos: { x: 76, y: 14 } },
  ],
  "4-5-1": [
    { role: "GK", pos: { x: 5, y: 34 } },
    { role: "DR", pos: { x: 20, y: 56 } },
    { role: "DC", pos: { x: 16, y: 42 } },
    { role: "DC", pos: { x: 16, y: 26 } },
    { role: "DL", pos: { x: 20, y: 12 } },
    { role: "MR", pos: { x: 56, y: 60 } },
    { role: "MC", pos: { x: 44, y: 44 } },
    { role: "DM", pos: { x: 36, y: 34 } },
    { role: "MC", pos: { x: 44, y: 24 } },
    { role: "ML", pos: { x: 56, y: 8 } },
    { role: "ST", pos: { x: 80, y: 34 } },
  ],
  "4-1-2-1-2": [
    { role: "GK", pos: { x: 5, y: 34 } },
    { role: "DR", pos: { x: 20, y: 56 } },
    { role: "DC", pos: { x: 16, y: 42 } },
    { role: "DC", pos: { x: 16, y: 26 } },
    { role: "DL", pos: { x: 20, y: 12 } },
    { role: "DM", pos: { x: 34, y: 34 } },
    { role: "MC", pos: { x: 46, y: 46 } },
    { role: "MC", pos: { x: 46, y: 22 } },
    { role: "AM", pos: { x: 62, y: 34 } },
    { role: "ST", pos: { x: 80, y: 40 } },
    { role: "ST", pos: { x: 80, y: 28 } },
  ],
  "4-2-2-2": [
    { role: "GK", pos: { x: 5, y: 34 } },
    { role: "DR", pos: { x: 20, y: 56 } },
    { role: "DC", pos: { x: 16, y: 42 } },
    { role: "DC", pos: { x: 16, y: 26 } },
    { role: "DL", pos: { x: 20, y: 12 } },
    { role: "DM", pos: { x: 36, y: 40 } },
    { role: "DM", pos: { x: 36, y: 28 } },
    { role: "AM", pos: { x: 62, y: 52 } },
    { role: "AM", pos: { x: 62, y: 16 } },
    { role: "ST", pos: { x: 80, y: 40 } },
    { role: "ST", pos: { x: 80, y: 28 } },
  ],
  "5-4-1": [
    { role: "GK", pos: { x: 5, y: 34 } },
    { role: "DR", pos: { x: 24, y: 58 } },
    { role: "DC", pos: { x: 16, y: 44 } },
    { role: "DC", pos: { x: 14, y: 34 } },
    { role: "DC", pos: { x: 16, y: 24 } },
    { role: "DL", pos: { x: 24, y: 10 } },
    { role: "MR", pos: { x: 52, y: 58 } },
    { role: "MC", pos: { x: 44, y: 40 } },
    { role: "MC", pos: { x: 44, y: 28 } },
    { role: "ML", pos: { x: 52, y: 10 } },
    { role: "ST", pos: { x: 78, y: 34 } },
  ],
};

/** Ordered list of the built-in formation keys (for UI menus). */
export const FORMATION_NAMES = Object.keys(FORMATIONS);

/**
 * Resolve a formation spec to a concrete slot array. Accepts a built-in name,
 * an explicit custom `Slot[]` (a user-designed shape), or undefined (fallback).
 * A custom shape must have exactly 11 slots including one GK; otherwise we fall
 * back so the match never breaks.
 */
export function resolveFormation(
  spec: string | Slot[] | undefined,
  fallback: string,
): Slot[] {
  if (Array.isArray(spec)) {
    const ok = spec.length === 11 && spec.filter((s) => s.role === "GK").length === 1;
    if (ok) return spec.map((s) => ({ role: s.role, pos: { ...s.pos } }));
  } else if (spec && FORMATIONS[spec]) {
    return FORMATIONS[spec]!;
  }
  return FORMATIONS[fallback] ?? FORMATIONS["4-3-3"]!;
}

/** Mirror a home-coordinate position for the away side (attacking toward -x). */
export function mirror(pos: Vec): Vec {
  return { x: PITCH_LENGTH - pos.x, y: pos.y };
}
