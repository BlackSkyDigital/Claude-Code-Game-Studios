import type { Attrs, PlayerDef, Role, TeamDef } from "./types.js";

/**
 * Seed dataset of real teams/players for the demo.
 *
 * Per the project's design note: this is a PRIVATE project for a handful of
 * friends. Real player names are used as factual data; attributes are rough,
 * hand-tuned estimates (1–20, FM-style) for gameplay only — not an official
 * rating of anyone. Do not host publicly or monetise with these names/crests.
 *
 * Later this will be replaced by an editable, imported dataset (see roadmap).
 */

function p(
  name: string,
  number: number,
  role: Role,
  pace: number,
  passing: number,
  shooting: number,
  tackling: number,
  control: number,
): PlayerDef {
  const attrs: Attrs = { pace, passing, shooting, tackling, control };
  return { name, number, role, attrs };
}

export const TEAMS: TeamDef[] = [
  {
    name: "Manchester City",
    short: "MCI",
    color: "#6cabdd",
    textColor: "#0b1c2c",
    formation: "4-3-3",
    players: [
      p("Ederson", 31, "GK", 12, 15, 4, 8, 16),
      p("Walker", 2, "DR", 18, 13, 7, 14, 13),
      p("Dias", 3, "DC", 12, 14, 6, 17, 15),
      p("Stones", 5, "DC", 12, 16, 8, 15, 16),
      p("Gvardiol", 24, "DL", 15, 14, 9, 15, 15),
      p("Rodri", 16, "DM", 11, 17, 12, 17, 17),
      p("De Bruyne", 17, "MC", 12, 19, 16, 9, 18),
      p("Silva", 20, "MC", 13, 18, 13, 11, 18),
      p("Foden", 47, "MR", 16, 16, 16, 8, 18),
      p("Haaland", 9, "ST", 17, 11, 19, 6, 15),
      p("Doku", 11, "ML", 19, 13, 13, 7, 16),
    ],
  },
  {
    name: "Liverpool",
    short: "LIV",
    color: "#c8102e",
    textColor: "#ffffff",
    formation: "4-3-3",
    players: [
      p("Alisson", 1, "GK", 12, 15, 4, 8, 16),
      p("Alexander-Arnold", 66, "DR", 14, 18, 11, 12, 16),
      p("Konate", 5, "DC", 15, 12, 5, 16, 13),
      p("Van Dijk", 4, "DC", 13, 15, 8, 18, 16),
      p("Robertson", 26, "DL", 16, 16, 9, 14, 15),
      p("Mac Allister", 10, "DM", 12, 17, 13, 14, 16),
      p("Szoboszlai", 8, "MC", 15, 16, 15, 12, 16),
      p("Gravenberch", 38, "MC", 14, 15, 11, 13, 16),
      p("Salah", 11, "MR", 17, 15, 18, 7, 17),
      p("Nunez", 9, "ST", 18, 11, 15, 7, 13),
      p("Diaz", 7, "ML", 18, 14, 15, 9, 16),
    ],
  },
  {
    name: "Arsenal",
    short: "ARS",
    color: "#ef0107",
    textColor: "#ffffff",
    formation: "4-3-3",
    players: [
      p("Raya", 22, "GK", 12, 15, 4, 8, 15),
      p("White", 4, "DR", 14, 14, 8, 15, 14),
      p("Saliba", 2, "DC", 15, 14, 6, 17, 15),
      p("Gabriel", 6, "DC", 13, 12, 9, 16, 13),
      p("Calafiori", 33, "DL", 15, 14, 9, 14, 14),
      p("Rice", 41, "DM", 13, 16, 12, 16, 16),
      p("Odegaard", 8, "MC", 12, 18, 14, 10, 18),
      p("Havertz", 29, "MC", 14, 14, 14, 11, 15),
      p("Saka", 7, "MR", 16, 16, 16, 9, 17),
      p("Jesus", 9, "ST", 15, 14, 14, 9, 16),
      p("Martinelli", 11, "ML", 18, 13, 14, 8, 15),
    ],
  },
  {
    name: "Real Madrid",
    short: "RMA",
    color: "#fcfcfc",
    textColor: "#1a1a2c",
    formation: "4-3-3",
    players: [
      p("Courtois", 1, "GK", 11, 14, 4, 8, 16),
      p("Carvajal", 2, "DR", 14, 15, 9, 15, 14),
      p("Rudiger", 22, "DC", 15, 12, 7, 17, 13),
      p("Militao", 3, "DC", 16, 12, 6, 16, 14),
      p("Mendy", 23, "DL", 16, 12, 7, 15, 13),
      p("Tchouameni", 18, "DM", 13, 15, 11, 16, 15),
      p("Valverde", 15, "MC", 16, 16, 15, 14, 16),
      p("Bellingham", 5, "MC", 15, 17, 16, 11, 17),
      p("Vinicius", 7, "MR", 19, 14, 16, 7, 17),
      p("Mbappe", 9, "ST", 20, 14, 18, 6, 17),
      p("Rodrygo", 11, "ML", 17, 15, 15, 8, 16),
    ],
  },
];

/** Look up a team by its short code. */
export function teamByShort(short: string): TeamDef | undefined {
  return TEAMS.find((t) => t.short === short);
}
