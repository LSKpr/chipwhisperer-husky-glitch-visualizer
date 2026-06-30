import type { GlitchProject, OutputMode } from "./types";

export interface WaveformSimulation {
  totalCycles: number;
  totalSteps: number;
  stepPx: number;
  /**
   * Number of true phase-shift steps represented by each element of the
   * `clock`/`glitchInput`/`combinedOutput` arrays. 1 means the arrays are at
   * full resolution; a larger value means the arrays were downsampled to keep
   * rendering cheap when `phaseShiftSteps` is very large (i.e. low clock speed).
   * Consumers must multiply array-index based measurements by this to recover
   * true step units, and multiply `stepPx` by this to get pixels-per-sample.
   */
  sampleStride: number;
  clock: boolean[];
  glitchInput: boolean[];
  combinedOutput: boolean[];
  primaryGlitchStartStep: number;
  primaryGlitchWidthSteps: number;
  eventStartSteps: number[];
  eventWidths: number[];
}

/**
 * Upper bound on the number of samples materialized for the rendered waveforms.
 * A digital square wave needs far fewer samples than the simulator's true step
 * resolution (which can reach millions at low clock speeds). Capping here keeps
 * array allocation and SVG path generation cheap without affecting the
 * true-step math used for labels, time conversions, and edge markers.
 */
const MAX_RENDER_SAMPLES = 100_000;

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
 * Semantics (per Husky docs — ChipWhispererGlitch.py):
 *   start[0] = extOffset[0] * phase + offset
 *   start[i] = start[i-1] + (2 + extOffset[i]) * phase   (i > 0)
 *
 * Husky issues glitch i "2 + ext_offset[i] cycles after the START of glitch i-1"
 * (a fixed 2-cycle pipeline latency plus the per-event gap), independent of the
 * previous event's repeat count. That start-relative spacing is also why
 * repeat[i] must stay <= ext_offset[i+1] + 1 (validation.ts): a longer pulse
 * train would otherwise overlap the next event.
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
      const extI = project.glitch.extOffset[i] ?? 0;
      starts.push(Math.round(starts[i - 1] + (2 + extI) * phase));
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

  // Downsample the rendered arrays when the true step count is large (low clock
  // speed). Each sample then represents `sampleStride` true steps. `stepPx`
  // stays in px-per-true-step so scalar measurements (event markers, widths)
  // remain exact; sample-indexed measurements are scaled by `sampleStride`.
  const sampleStride = Math.max(1, Math.ceil(totalSteps / MAX_RENDER_SAMPLES));
  const numSamples = Math.ceil(totalSteps / sampleStride);

  const clock: boolean[] = new Array(numSamples).fill(false);
  const glitchInput: boolean[] = new Array(numSamples).fill(false);
  const combinedOutput: boolean[] = new Array(numSamples).fill(false);

  for (let s = 0; s < numSamples; s += 1) {
    // Point-sample the clock at the start of each bucket.
    const phaseStep = (s * sampleStride) % phase;
    clock[s] = phaseStep < phase / 2;
  }

  // Mark a glitch interval [startStep, endStep) in true steps onto the samples,
  // OR-ing over each bucket so narrow pulses are never dropped by downsampling.
  const markGlitch = (startStep: number, endStep: number): void => {
    const sFrom = Math.max(0, Math.floor(startStep / sampleStride));
    const sTo = Math.min(numSamples, Math.ceil(endStep / sampleStride));
    for (let s = sFrom; s < sTo; s += 1) {
      glitchInput[s] = true;
    }
  };

  for (let i = 0; i < numEvents; i += 1) {
    const start = eventStartSteps[i];
    const repeat = Math.max(1, project.glitch.repeat[i] ?? 1);
    if (mode === "enable_only") {
      markGlitch(start, start + eventWidths[i]);
    } else {
      for (let pulseIndex = 0; pulseIndex < repeat; pulseIndex += 1) {
        const pulseStart = start + pulseIndex * phase;
        markGlitch(pulseStart, pulseStart + pulseWidth);
      }
    }
  }

  for (let s = 0; s < numSamples; s += 1) {
    combinedOutput[s] = toOutputModeCombine(mode, clock[s], glitchInput[s]);
  }

  return {
    totalCycles,
    totalSteps,
    stepPx,
    sampleStride,
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
