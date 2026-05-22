export type OutputMode =
  | "clock_xor"
  | "clock_or"
  | "glitch_only"
  | "clock_only"
  | "enable_only"
  | "crowbar_visualizer";

export type TriggerSource = "manual" | "ext_single" | "ext_continuous" | "continuous";
export type ArmTiming = "no_glitch" | "before_scope" | "after_scope";
export type ExportVerbosity = "full_stubs" | "params_only";

export type ClkSrc = "target" | "pll";

export interface ClockSettings {
  sourceFrequencyHz: number;
  pllFrequencyHz: number;
  fpgaVcoFrequencyHz: number;
  phaseShiftSteps: number;
  clkSrc: ClkSrc;
}

export interface GlitchSettings {
  enabled: boolean;
  outputMode: OutputMode;
  offsetSteps: number;
  widthSteps: number;
  repeat: number[];
  extOffset: number[];
  numGlitches: number;
  hpEnabled: boolean;
  lpEnabled: boolean;
}

export interface TriggerSettings {
  triggerSource: TriggerSource;
  armTiming: ArmTiming;
}

export interface ExportSettings {
  verbosity: ExportVerbosity;
}

export interface GlitchProject {
  name: string;
  clock: ClockSettings;
  glitch: GlitchSettings;
  trigger: TriggerSettings;
  export: ExportSettings;
}

export type WarningLevel = "info" | "warning";

export interface ValidationWarning {
  id: string;
  level: WarningLevel;
  message: string;
}
