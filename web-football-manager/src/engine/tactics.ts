/**
 * Team tactics. A tactical *style* is a named preset of the underlying
 * "team instruction" knobs (mentality, tempo, directness, pressing, line
 * height, width), mirroring how Football Manager's mentality/style shapes
 * every passage of play. The match engine reads these knobs directly.
 */

export type TacticalStyle =
  | "balanced"
  | "tiki-taka"
  | "vertical-tiki-taka"
  | "gegenpress"
  | "control-possession"
  | "counter"
  | "direct-counter"
  | "route-one"
  | "wing-play"
  | "catenaccio";

export interface TeamTactics {
  style: TacticalStyle;
  mentality: number; // -1 very defensive .. +1 very attacking
  tempo: number; // 0 slow/patient .. 1 quick decisions
  directness: number; // 0 short build-up .. 1 long/direct
  pressing: number; // 0 sit off .. 1 aggressive high press
  lineHeight: number; // 0 deep block .. 1 high line
  width: number; // 0 narrow .. 1 very wide
  /** how the defence marks: "zonal" holds shape; "man" tracks the most
   * dangerous runners (more cover, can be pulled out of position) */
  marking: "zonal" | "man";
}

const PRESETS: Record<TacticalStyle, Omit<TeamTactics, "style">> = {
  // mentality, tempo, directness, pressing, lineHeight, width, marking
  balanced: { mentality: 0, tempo: 0.5, directness: 0.5, pressing: 0.5, lineHeight: 0.5, width: 0.5, marking: "zonal" },
  "tiki-taka": { mentality: 0.3, tempo: 0.55, directness: 0.12, pressing: 0.72, lineHeight: 0.78, width: 0.38, marking: "zonal" },
  "vertical-tiki-taka": { mentality: 0.45, tempo: 0.7, directness: 0.35, pressing: 0.75, lineHeight: 0.78, width: 0.42, marking: "zonal" },
  gegenpress: { mentality: 0.6, tempo: 0.82, directness: 0.45, pressing: 0.96, lineHeight: 0.85, width: 0.6, marking: "zonal" },
  "control-possession": { mentality: 0.2, tempo: 0.42, directness: 0.22, pressing: 0.55, lineHeight: 0.62, width: 0.55, marking: "zonal" },
  counter: { mentality: -0.4, tempo: 0.62, directness: 0.62, pressing: 0.3, lineHeight: 0.32, width: 0.5, marking: "man" },
  "direct-counter": { mentality: -0.2, tempo: 0.78, directness: 0.78, pressing: 0.35, lineHeight: 0.4, width: 0.55, marking: "man" },
  "route-one": { mentality: 0.1, tempo: 0.6, directness: 0.95, pressing: 0.42, lineHeight: 0.46, width: 0.62, marking: "zonal" },
  "wing-play": { mentality: 0.25, tempo: 0.58, directness: 0.5, pressing: 0.55, lineHeight: 0.58, width: 0.92, marking: "zonal" },
  catenaccio: { mentality: -0.6, tempo: 0.38, directness: 0.55, pressing: 0.22, lineHeight: 0.2, width: 0.45, marking: "man" },
};

export const TACTICAL_STYLES = Object.keys(PRESETS) as TacticalStyle[];

export function tacticsForStyle(style: TacticalStyle): TeamTactics {
  return { style, ...PRESETS[style] };
}

/** Human-readable label for UI. */
export function styleLabel(style: TacticalStyle): string {
  return style
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
