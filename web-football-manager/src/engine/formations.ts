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
};

/** Mirror a home-coordinate position for the away side (attacking toward -x). */
export function mirror(pos: Vec): Vec {
  return { x: PITCH_LENGTH - pos.x, y: pos.y };
}
