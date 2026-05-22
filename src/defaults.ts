import type { GlitchProject } from "./types";

/**
 * Husky phase-shift steps per source-clock period.
 * Formula: 56 × MMCM multiplier, where MMCM multiplier = fpga_vco_freq / source_clock_freq.
 * For the default 800 MHz VCO and 10 MHz target clock: 56 × 80 = 4480 steps/period.
 */
export function computePhaseShiftSteps(fpgaVcoFrequencyHz: number, sourceFrequencyHz: number): number {
  if (!Number.isFinite(sourceFrequencyHz) || sourceFrequencyHz <= 0) {
    return 56;
  }
  const multiplier = Math.max(1, Math.round(fpgaVcoFrequencyHz / sourceFrequencyHz));
  return 56 * multiplier;
}

export const DEFAULT_PROJECT: GlitchProject = {
  name: "new-project",
  clock: {
    sourceFrequencyHz: 10_000_000,
    pllFrequencyHz: 10_000_000,
    fpgaVcoFrequencyHz: 800_000_000,
    phaseShiftSteps: computePhaseShiftSteps(800_000_000, 10_000_000),
    clkSrc: "target",
  },
  glitch: {
    enabled: true,
    outputMode: "clock_xor",
    offsetSteps: 0,
    widthSteps: 448,
    repeat: [2],
    extOffset: [1],
    numGlitches: 1,
    hpEnabled: false,
    lpEnabled: false,
  },
  trigger: {
    triggerSource: "ext_single",
    armTiming: "after_scope",
  },
  export: {
    verbosity: "full_stubs",
  },
};

export const TEMPLATE_BEGINNER_SAFE: GlitchProject = {
  ...DEFAULT_PROJECT,
  name: "beginner-safe-template",
  glitch: {
    ...DEFAULT_PROJECT.glitch,
    outputMode: "glitch_only",
    widthSteps: 320,
    repeat: [1],
    extOffset: [1],
    hpEnabled: false,
    lpEnabled: true,
  },
};
