export const GLOSSARY: Record<string, string> = {
  projectName: "A label for this configuration. Used as the filename when saving JSON.",
  outputMode:
    "How glitch stream combines with source clock: XOR, OR, pass-through, gate-only, or crowbar_visualizer (UI-only, not exportable).",
  sourceFrequencyHz: "Target clock frequency in Hz. Drives the source period T = 1 / f.",
  pllFrequencyHz: "PLL source clock frequency in Hz used when clk_src = pll.",
  triggerSource: "Trigger source controlling when glitches fire.",
  offsetSteps: "Phase-step offset relative to source clock edge. 0 means aligned to rising edge.",
  widthSteps: "Pulse width in phase-step units. In enable_only mode this is inactive.",
  repeat: "How many glitch pulses (or enabled cycles) are emitted per event.",
  extOffset: "Clock-cycle delay between trigger and glitch event.",
  armTiming: "Relative timing of glitch arming vs scope arming for external triggers.",
  fpgaVcoFrequencyHz:
    "Husky MMCM VCO frequency. Determines how many phase-shift steps make up one source cycle (phase_shift_steps ≈ 56 × VCO/f_src).",
  clkSrc:
    "target: glitch MMCM is clocked from the target clock; pll: clocked from the CW PLL. Only valid Husky values.",
  phaseShiftSteps:
    "Phase-shift steps per source clock period. 1 step = T / phase_shift_steps = 360°/phase_shift_steps.",
  numGlitches: "Number of distinct glitch events per trigger. Each has its own ext_offset and repeat.",
  hpEnabled: "Arms the high-power crowbar MOSFET. Only enable on a target wired for voltage glitching.",
  lpEnabled: "Arms the low-power crowbar MOSFET. Only enable on a target wired for voltage glitching.",
  zoom: "Zoom the timeline horizontally. Doesn't change any parameters.",
  displayUnit: "Switch how time-based fields and annotations are shown across the whole app.",
  unitConverter:
    "Standalone converter between steps, time, and phase using the current clock + phase_shift_steps.",
  exportVerbosity:
    "full_stubs includes all scope setup; params_only outputs just the glitch parameters.",
  vccRow:
    "Visualizes target VCC being pulled toward 0 V during the crowbar MOSFET's conducting window. Red-amber waveform fires whenever the Husky glitch enable signal is high (and HP or LP crowbar is armed).",
  glitchEvents:
    "Table of glitch events emitted per trigger. offset and width are shared; ext_offset[i] is the cycle gap before event i (from trigger for i=0, or from end of event i-1). repeat[i] sets pulses inside that event.",
  crowbarEnergy:
    "Sum of time the glitch enable signal is high per simulated window. With a crowbar MOSFET armed, this approximates the pulldown duty on VCC; high duty cycles risk hardware damage.",
};

export function getGlossary(key: string): string {
  return GLOSSARY[key] ?? "";
}
