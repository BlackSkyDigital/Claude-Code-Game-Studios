/**
 * Match conditions: weather and venue. These layer real-world modifiers on top
 * of tactics and attributes so the same teams play differently in the rain, in
 * the heat, or away from home — combining to a result that's accurate to life
 * with an element of randomness (the engine's seeded RNG provides the latter).
 */

export type Weather = "clear" | "rain" | "heavy-rain" | "hot" | "windy";

export interface WeatherMods {
  /** extra passing error (metres of spread added) */
  passError: number;
  /** nudge toward more direct play (added to directness, 0..1) */
  directness: number;
  /** ball ground friction multiplier (>1 = ball slows faster, e.g. wet/long grass) */
  friction: number;
  /** per-second condition drain multiplier (heat/humidity tire players faster) */
  fatigue: number;
  /** extra random scatter on shots (metres) */
  shotScatter: number;
}

export function weatherMods(w: Weather): WeatherMods {
  switch (w) {
    case "rain":
      return { passError: 1.2, directness: 0.12, friction: 1.015, fatigue: 1.0, shotScatter: 0.6 };
    case "heavy-rain":
      return { passError: 2.2, directness: 0.22, friction: 1.03, fatigue: 1.05, shotScatter: 1.2 };
    case "hot":
      return { passError: 0.3, directness: 0.04, friction: 0.997, fatigue: 1.5, shotScatter: 0.2 };
    case "windy":
      return { passError: 0.8, directness: 0.0, friction: 1.0, fatigue: 1.0, shotScatter: 1.4 };
    case "clear":
    default:
      return { passError: 0, directness: 0, friction: 1.0, fatigue: 1.0, shotScatter: 0 };
  }
}

export const WEATHER_TYPES: Weather[] = ["clear", "rain", "heavy-rain", "hot", "windy"];

export function weatherLabel(w: Weather): string {
  return w === "heavy-rain" ? "Heavy Rain" : w.charAt(0).toUpperCase() + w.slice(1);
}

/**
 * Home advantage. A modest, real edge: the home side gets a small lift to
 * composure/decision sharpness (crowd, familiarity) while the away side starts
 * marginally more fatigued (travel). Set neutral to disable.
 */
export interface HomeEdge {
  /** multiplier on the home team's effective sharpness (composure/decisions) */
  homeSharpness: number;
  /** starting condition penalty applied to the away team (0..1 of condition) */
  awayTravelPenalty: number;
}

export function homeEdge(neutral: boolean): HomeEdge {
  if (neutral) return { homeSharpness: 1.0, awayTravelPenalty: 0 };
  return { homeSharpness: 1.05, awayTravelPenalty: 0.03 };
}
