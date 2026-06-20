/**
 * Team tactics. A tactical *style* is a named preset of the underlying
 * "team instruction" knobs (mentality, tempo, directness, pressing, line
 * height, width, …), mirroring how Football Manager's mentality/style shapes
 * every passage of play. The match engine reads these knobs directly.
 *
 * Every knob is a continuous value, so the UI can expose them as live sliders
 * (FM-style) — a preset is just a convenient starting point, and any deviation
 * is a fully-supported "custom" tactic. Each knob is designed so its NEUTRAL
 * value (0.5, or 0 for the signed/opt-in ones) reproduces the engine's baseline
 * behaviour, which keeps the calibrated "balanced" baseline intact.
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
  // ---- extended instructions (all neutral at the stated value) ----
  /** challenge intensity: 0 stay on feet (few fouls) .. 1 get stuck in (more
   * tackles won AND more fouls/cards). Neutral 0.5. */
  tackling: number;
  /** willingness to shoot, especially from range: 0 work it into the box ..
   * 1 shoot on sight. Neutral 0.5. */
  shootOnSight: number;
  /** expressiveness/risk in possession: 0 disciplined (safe) .. 1 expressive
   * (more through-balls, dribbles, ambition). Neutral 0.5. */
  creativeFreedom: number;
  /** counter-press on losing the ball: 0 drop & regroup .. 1 swarm to win it
   * back immediately. Neutral 0.5. */
  counterPress: number;
  /** attacking transition on winning the ball: 0 hold shape & build ..
   * 1 break at pace (direct, runners go). Neutral 0.5. */
  counterAttack: number;
  /** which channel attacks favour: -1 left flank .. 0 middle .. +1 right.
   * Neutral 0. */
  focusPlay: number;
  /** push up to spring the offside trap: 0 off .. 1 aggressive step-up.
   * Neutral 0 (off). */
  offsideTrap: number;
}

const PRESETS: Record<TacticalStyle, Omit<TeamTactics, "style">> = {
  // mentality, tempo, directness, pressing, lineHeight, width, marking,
  // tackling, shootOnSight, creativeFreedom, counterPress, counterAttack,
  // focusPlay, offsideTrap
  balanced: { mentality: 0, tempo: 0.5, directness: 0.5, pressing: 0.5, lineHeight: 0.5, width: 0.5, marking: "zonal", tackling: 0.5, shootOnSight: 0.5, creativeFreedom: 0.5, counterPress: 0.5, counterAttack: 0.5, focusPlay: 0, offsideTrap: 0 },
  "tiki-taka": { mentality: 0.35, tempo: 0.6, directness: 0.12, pressing: 0.68, lineHeight: 0.7, width: 0.38, marking: "zonal", tackling: 0.4, shootOnSight: 0.44, creativeFreedom: 0.7, counterPress: 0.68, counterAttack: 0.32, focusPlay: 0, offsideTrap: 0.35 },
  "vertical-tiki-taka": { mentality: 0.42, tempo: 0.66, directness: 0.35, pressing: 0.7, lineHeight: 0.7, width: 0.42, marking: "zonal", tackling: 0.45, shootOnSight: 0.56, creativeFreedom: 0.68, counterPress: 0.68, counterAttack: 0.55, focusPlay: 0, offsideTrap: 0.35 },
  gegenpress: { mentality: 0.55, tempo: 0.72, directness: 0.45, pressing: 0.85, lineHeight: 0.72, width: 0.58, marking: "zonal", tackling: 0.6, shootOnSight: 0.56, creativeFreedom: 0.58, counterPress: 0.78, counterAttack: 0.55, focusPlay: 0, offsideTrap: 0.45 },
  "control-possession": { mentality: 0.28, tempo: 0.48, directness: 0.22, pressing: 0.52, lineHeight: 0.58, width: 0.55, marking: "zonal", tackling: 0.45, shootOnSight: 0.47, creativeFreedom: 0.56, counterPress: 0.52, counterAttack: 0.3, focusPlay: 0, offsideTrap: 0.25 },
  counter: { mentality: -0.35, tempo: 0.6, directness: 0.58, pressing: 0.34, lineHeight: 0.38, width: 0.5, marking: "man", tackling: 0.52, shootOnSight: 0.48, creativeFreedom: 0.48, counterPress: 0.3, counterAttack: 0.6, focusPlay: 0, offsideTrap: 0.12 },
  "direct-counter": { mentality: -0.2, tempo: 0.72, directness: 0.75, pressing: 0.36, lineHeight: 0.44, width: 0.55, marking: "man", tackling: 0.52, shootOnSight: 0.58, creativeFreedom: 0.5, counterPress: 0.32, counterAttack: 0.65, focusPlay: 0, offsideTrap: 0.15 },
  "route-one": { mentality: 0.1, tempo: 0.58, directness: 0.9, pressing: 0.42, lineHeight: 0.46, width: 0.62, marking: "zonal", tackling: 0.55, shootOnSight: 0.58, creativeFreedom: 0.34, counterPress: 0.4, counterAttack: 0.58, focusPlay: 0, offsideTrap: 0.15 },
  "wing-play": { mentality: 0.25, tempo: 0.58, directness: 0.5, pressing: 0.55, lineHeight: 0.58, width: 0.92, marking: "zonal", tackling: 0.5, shootOnSight: 0.5, creativeFreedom: 0.55, counterPress: 0.55, counterAttack: 0.55, focusPlay: 0, offsideTrap: 0.3 },
  catenaccio: { mentality: -0.6, tempo: 0.38, directness: 0.55, pressing: 0.22, lineHeight: 0.2, width: 0.45, marking: "man", tackling: 0.72, shootOnSight: 0.45, creativeFreedom: 0.4, counterPress: 0.2, counterAttack: 0.55, focusPlay: 0, offsideTrap: 0 },
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
