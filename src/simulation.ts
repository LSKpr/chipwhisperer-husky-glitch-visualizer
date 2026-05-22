import type { GlitchProject, OutputMode } from "./types";

export interface WaveformSimulation {
  totalCycles: number;
  totalSteps: number;
  stepPx: number;
  clock: boolean[];
  glitchInput: boolean[];
  combinedOutput: boolean[];
  primaryGlitchStartStep: number;
  primaryGlitchWidthSteps: number;
  eventStartSteps: number[];
  eventWidths: number[];
}

function toOutputModeCombine(mode: OutputMode, clock: boolean, glitch: boolean): boolean {
  switch (mode) {
    case "clock_only":
      return clock;
    case "glitch_only":
      return glitch;
    case "clock_or":
      return clock || glitch;
    case "clock_xor":
      return clock !== glitch;
    case "enable_only":
      // enable_only acts as an enable waveform, not a short pulse width mode.
      return glitch;
    case "crowbar_visualizer":
      // UI-only mode: visualize crowbar effect on clock as AND(NOT(glitch), clock).
      return !glitch && clock;
    default:
      return clock;
  }
}

export function getPrimaryGlitchStartStep(project: GlitchProject): number {
  const phase = Math.max(1, project.clock.phaseShiftSteps);
  return Math.round((project.glitch.extOffset[0] ?? 0) * phase + project.glitch.offsetSteps);
}

export function getPrimaryGlitchWidthSteps(project: GlitchProject): number {
  const phase = Math.max(1, project.clock.phaseShiftSteps);
  if (project.glitch.outputMode === "enable_only") {
    // In enable_only, docs/API note width is ignored and repeat controls full-cycle duration.
    return Math.max(1, project.glitch.repeat[0] ?? 1) * phase;
  }
  return Math.max(1, project.glitch.widthSteps);
}

/**
 * Returns the cumulative start step (relative to the trigger at step 0) of every
 * glitch event in the train, length = numGlitches.
 *
 * Semantics (per Husky docs):
 *   start[0] = extOffset[0] * phase + offset
 *   start[i] = start[i-1] + repeat[i-1] * phase + extOffset[i] * phase   (i > 0)
 *
 * For i > 0 we add `repeat[i-1] * phase` to account for the full span of the
 * previous event (one clock cycle per pulse, matching the enable_only width
 * definition), and then the gap ext_offset[i] cycles before event i starts.
 */
export function getGlitchEventStartSteps(project: GlitchProject): number[] {
  const n = Math.max(1, project.glitch.numGlitches);
  const phase = Math.max(1, project.clock.phaseShiftSteps);
  const starts: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (i === 0) {
      const ext0 = project.glitch.extOffset[0] ?? 0;
      starts.push(Math.round(ext0 * phase + project.glitch.offsetSteps));
    } else {
      const prevRepeat = Math.max(1, project.glitch.repeat[i - 1] ?? 1);
      const extI = project.glitch.extOffset[i] ?? 0;
      starts.push(Math.round(starts[i - 1] + prevRepeat * phase + extI * phase));
    }
  }
  return starts;
}

export function simulateWaveforms(project: GlitchProject, pxPerCycle: number, minVisibleCycles: number): WaveformSimulation {
  const phase = Math.max(1, project.clock.phaseShiftSteps);
  const mode = project.glitch.outputMode;
  const numEvents = Math.max(1, project.glitch.numGlitches);
  const pulseWidth = getPrimaryGlitchWidthSteps(project);
  const primaryStart = getPrimaryGlitchStartStep(project);

  const eventStartSteps = getGlitchEventStartSteps(project);
  const eventWidths: number[] = [];
  for (let i = 0; i < numEvents; i += 1) {
    const rep = Math.max(1, project.glitch.repeat[i] ?? 1);
    eventWidths.push(mode === "enable_only" ? rep * phase : pulseWidth);
  }

  const lastIdx = numEvents - 1;
  const lastStart = eventStartSteps[lastIdx] ?? primaryStart;
  const lastRepeat = Math.max(1, project.glitch.repeat[lastIdx] ?? 1);
  // End of the last event: per spec, use repeat[last] * phase in pulse modes,
  // or the enable window width (= repeat[last] * phase) in enable_only.
  const lastEnd =
    mode === "enable_only" ? lastStart + (eventWidths[lastIdx] ?? pulseWidth) : lastStart + lastRepeat * phase;
  const requiredCycles = Math.ceil(Math.max(0, lastEnd) / phase) + 2;
  const totalCycles = Math.max(minVisibleCycles, requiredCycles);
  const totalSteps = totalCycles * phase;
  const stepPx = pxPerCycle / phase;

  const clock: boolean[] = new Array(totalSteps).fill(false);
  const glitchInput: boolean[] = new Array(totalSteps).fill(false);
  const combinedOutput: boolean[] = new Array(totalSteps).fill(false);

  for (let step = 0; step < totalSteps; step += 1) {
    const phaseStep = step % phase;
    clock[step] = phaseStep < phase / 2;
  }

  for (let i = 0; i < numEvents; i += 1) {
    const start = eventStartSteps[i];
    const repeat = Math.max(1, project.glitch.repeat[i] ?? 1);
    if (mode === "enable_only") {
      const end = start + eventWidths[i];
      for (let step = Math.max(0, start); step < Math.min(totalSteps, end); step += 1) {
        glitchInput[step] = true;
      }
    } else {
      for (let pulseIndex = 0; pulseIndex < repeat; pulseIndex += 1) {
        const pulseStart = start + pulseIndex * phase;
        const pulseEnd = pulseStart + pulseWidth;
        for (let step = Math.max(0, pulseStart); step < Math.min(totalSteps, pulseEnd); step += 1) {
          glitchInput[step] = true;
        }
      }
    }
  }

  for (let step = 0; step < totalSteps; step += 1) {
    combinedOutput[step] = toOutputModeCombine(mode, clock[step], glitchInput[step]);
  }

  return {
    totalCycles,
    totalSteps,
    stepPx,
    clock,
    glitchInput,
    combinedOutput,
    primaryGlitchStartStep: primaryStart,
    primaryGlitchWidthSteps: pulseWidth,
    eventStartSteps,
    eventWidths,
  };
}

export function digitalPathFromSamples(
  samples: boolean[],
  stepPx: number,
  yHigh: number,
  yLow: number,
): string {
  if (samples.length === 0) {
    return "";
  }

  let path = `M 0 ${samples[0] ? yHigh : yLow}`;
  let current = samples[0];

  for (let i = 1; i <= samples.length; i += 1) {
    const changed = i === samples.length || samples[i] !== current;
    if (!changed) {
      continue;
    }
    const xEnd = i * stepPx;
    const y = current ? yHigh : yLow;
    path += ` L ${xEnd} ${y}`;

    if (i < samples.length) {
      const yNext = samples[i] ? yHigh : yLow;
      path += ` L ${xEnd} ${yNext}`;
      current = samples[i];
    }
  }
  return path;
}
