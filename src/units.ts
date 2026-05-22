export type DisplayUnit = "steps" | "ns" | "deg";

export function convertFromSteps(
  steps: number,
  unit: DisplayUnit,
  phaseShiftSteps: number,
  sourceFrequencyHz: number,
): number {
  if (unit === "steps") return steps;
  if (unit === "deg") {
    if (phaseShiftSteps <= 0) return NaN;
    return steps * (360 / phaseShiftSteps);
  }
  if (phaseShiftSteps <= 0 || !Number.isFinite(sourceFrequencyHz) || sourceFrequencyHz <= 0) return NaN;
  return steps * (1e9 / (sourceFrequencyHz * phaseShiftSteps));
}

export function convertToSteps(
  value: number,
  unit: DisplayUnit,
  phaseShiftSteps: number,
  sourceFrequencyHz: number,
): number {
  if (unit === "steps") return value;
  if (unit === "deg") {
    if (phaseShiftSteps <= 0) return NaN;
    return value * (phaseShiftSteps / 360);
  }
  if (phaseShiftSteps <= 0 || !Number.isFinite(sourceFrequencyHz) || sourceFrequencyHz <= 0) return NaN;
  return (value * (sourceFrequencyHz * phaseShiftSteps)) / 1e9;
}

export function unitSuffix(unit: DisplayUnit): string {
  return unit === "steps" ? "steps" : unit === "ns" ? "ns" : "deg";
}
