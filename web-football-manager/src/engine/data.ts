import type { PlayerDef, Role, TeamDef, Trait } from "./types.js";
import { makeAttrs, type Attrs } from "./attributes.js";

/**
 * Seed dataset of real teams/players.
 *
 * Each player is built from a single `overall` rating plus role-based emphasis
 * (see attributes.ts), with a few explicit overrides for the standout
 * attributes that define them. This gives every player the full ~38-attribute
 * profile without hand-entering hundreds of numbers.
 *
 * Per the project's design note: PRIVATE project for a few friends. Real names
 * are factual data; ratings are rough, hand-tuned gameplay estimates only. Do
 * not host publicly with real crests/kits or monetise.
 */

function p(
  name: string,
  number: number,
  role: Role,
  overall: number,
  ov: Partial<Attrs> = {},
  traits: Trait[] = [],
): PlayerDef {
  return { name, number, role, attrs: makeAttrs(role, overall, ov), traits };
}

export const TEAMS: TeamDef[] = [
  {
    name: "Manchester City",
    short: "MCI",
    color: "#6cabdd",
    textColor: "#0b1c2c",
    formation: "4-3-3",
    players: [
      p("Ederson", 31, "GK", 16, { kicking: 18, passing: 16 }),
      p("Walker", 2, "DR", 15, { pace: 19, acceleration: 18 }, ["gets_forward"]),
      p("Dias", 3, "DC", 17, { tackling: 17, marking: 17, composure: 16 }),
      p("Stones", 5, "DC", 16, { passing: 16, composure: 16 }),
      p("Gvardiol", 24, "DL", 16, { pace: 16, strength: 16 }, ["gets_forward"]),
      p("Rodri", 16, "DM", 18, { passing: 18, decisions: 18, composure: 18, tackling: 17 }),
      p("De Bruyne", 17, "MC", 18, { passing: 20, vision: 20, longShots: 18, technique: 18 }, ["tries_killer_balls", "shoots_from_distance"]),
      p("Silva", 20, "MC", 17, { technique: 19, vision: 18, dribbling: 17 }, ["tries_killer_balls", "likes_to_dribble"]),
      p("Foden", 47, "MR", 17, { dribbling: 18, technique: 18, finishing: 16 }, ["cuts_inside", "likes_to_dribble"]),
      p("Haaland", 9, "ST", 17, { finishing: 19, strength: 18, pace: 17 }, ["runs_in_behind", "places_shots"]),
      p("Doku", 11, "ML", 15, { pace: 19, acceleration: 19, dribbling: 18 }, ["likes_to_dribble", "cuts_inside"]),
    ],
  },
  {
    name: "Liverpool",
    short: "LIV",
    color: "#c8102e",
    textColor: "#ffffff",
    formation: "4-3-3",
    players: [
      p("Alisson", 1, "GK", 17, { reflexes: 18, oneOnOnes: 17 }),
      p("Alexander-Arnold", 66, "DR", 16, { passing: 18, crossing: 18, vision: 17 }, ["tries_killer_balls", "gets_forward"]),
      p("Konate", 5, "DC", 15, { pace: 16, strength: 16 }),
      p("Van Dijk", 4, "DC", 18, { tackling: 18, marking: 18, heading: 18, strength: 18, composure: 18 }),
      p("Robertson", 26, "DL", 16, { stamina: 18, crossing: 17, pace: 16 }, ["gets_forward"]),
      p("Mac Allister", 10, "DM", 16, { passing: 17, vision: 16, technique: 16 }, ["tries_killer_balls"]),
      p("Szoboszlai", 8, "MC", 16, { longShots: 17, stamina: 17 }, ["shoots_from_distance"]),
      p("Gravenberch", 38, "MC", 15, { dribbling: 16, strength: 15 }, ["likes_to_dribble"]),
      p("Salah", 11, "MR", 18, { finishing: 18, pace: 17, dribbling: 18, composure: 17 }, ["cuts_inside", "places_shots"]),
      p("Nunez", 9, "ST", 15, { pace: 18, strength: 16, finishing: 14 }, ["runs_in_behind"]),
      p("Diaz", 7, "ML", 16, { dribbling: 17, pace: 18, acceleration: 18 }, ["likes_to_dribble", "cuts_inside"]),
    ],
  },
  {
    name: "Arsenal",
    short: "ARS",
    color: "#ef0107",
    textColor: "#ffffff",
    formation: "4-3-3",
    players: [
      p("Raya", 22, "GK", 16, { kicking: 16, handling: 16 }),
      p("White", 4, "DR", 15, { tackling: 16, positioning: 15 }),
      p("Saliba", 2, "DC", 17, { pace: 17, tackling: 17, composure: 17 }),
      p("Gabriel", 6, "DC", 16, { heading: 17, strength: 17 }),
      p("Calafiori", 33, "DL", 15, { dribbling: 15 }),
      p("Rice", 41, "DM", 17, { tackling: 17, stamina: 18, passing: 16, strength: 16 }),
      p("Odegaard", 8, "MC", 17, { vision: 18, passing: 18, technique: 18 }, ["tries_killer_balls", "shoots_from_distance"]),
      p("Havertz", 29, "MC", 15, { heading: 16, offTheBall: 16 }, ["runs_in_behind"]),
      p("Saka", 7, "MR", 17, { dribbling: 18, crossing: 17, finishing: 16 }, ["cuts_inside", "likes_to_dribble"]),
      p("Jesus", 9, "ST", 15, { dribbling: 16, workRate: 17 }, ["likes_to_dribble"]),
      p("Martinelli", 11, "ML", 16, { pace: 18, acceleration: 18 }, ["runs_in_behind", "likes_to_dribble"]),
    ],
  },
  {
    name: "Real Madrid",
    short: "RMA",
    color: "#fcfcfc",
    textColor: "#1a1a2c",
    formation: "4-3-3",
    players: [
      p("Courtois", 1, "GK", 17, { reflexes: 18, aerialReach: 18, command: 17 }),
      p("Carvajal", 2, "DR", 16, { crossing: 16, workRate: 17 }, ["gets_forward"]),
      p("Rudiger", 22, "DC", 16, { pace: 16, strength: 17, aggression: 17 }),
      p("Militao", 3, "DC", 16, { pace: 17, jumpingReach: 17 }),
      p("Mendy", 23, "DL", 15, { pace: 16, strength: 16 }),
      p("Tchouameni", 18, "DM", 16, { tackling: 17, strength: 16, positioning: 16 }),
      p("Valverde", 15, "MC", 17, { stamina: 19, workRate: 18, longShots: 17, pace: 16 }, ["shoots_from_distance", "gets_forward"]),
      p("Bellingham", 5, "MC", 18, { offTheBall: 18, technique: 17, finishing: 16, composure: 17 }, ["runs_in_behind"]),
      p("Vinicius", 7, "MR", 18, { pace: 19, acceleration: 19, dribbling: 19, flair: 18 }, ["likes_to_dribble", "cuts_inside"]),
      p("Mbappe", 9, "ST", 19, { pace: 20, acceleration: 20, finishing: 18, dribbling: 18 }, ["runs_in_behind", "likes_to_dribble", "places_shots"]),
      p("Rodrygo", 11, "ML", 16, { dribbling: 17, pace: 17 }, ["cuts_inside"]),
    ],
  },
];

/** Look up a team by its short code. */
export function teamByShort(short: string): TeamDef | undefined {
  return TEAMS.find((t) => t.short === short);
}
