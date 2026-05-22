import { describe, expect, test } from "vitest";
import { DEFAULT_PROJECT } from "../defaults";
import {
  getGlitchEventStartSteps,
  getPrimaryGlitchWidthSteps,
  simulateWaveforms,
} from "../simulation";

describe("simulation width semantics", () => {
  test("pulse modes interpret width as phase-shift steps", () => {
    const project = {
      ...DEFAULT_PROJECT,
      glitch: {
        ...DEFAULT_PROJECT.glitch,
        outputMode: "clock_xor" as const,
        widthSteps: 7,
        repeat: [2],
      },
    };
    expect(getPrimaryGlitchWidthSteps(project)).toBe(7);

    const sim = simulateWaveforms(project, 120, 5);
    const highCount = sim.glitchInput.filter(Boolean).length;
    expect(highCount).toBe(14);
  });

  test("enable_only ignores width and uses repeat full cycles", () => {
    const phase = DEFAULT_PROJECT.clock.phaseShiftSteps;
    const project = {
      ...DEFAULT_PROJECT,
      glitch: {
        ...DEFAULT_PROJECT.glitch,
        outputMode: "enable_only" as const,
        widthSteps: 3,
        repeat: [4],
      },
    };
    expect(getPrimaryGlitchWidthSteps(project)).toBe(4 * phase);

    const sim = simulateWaveforms(project, 120, 5);
    const highCount = sim.glitchInput.filter(Boolean).length;
    expect(highCount).toBe(4 * phase);
  });

  test("getGlitchEventStartSteps computes cumulative starts for num_glitches = 3", () => {
    const phase = DEFAULT_PROJECT.clock.phaseShiftSteps;
    const project = {
      ...DEFAULT_PROJECT,
      glitch: {
        ...DEFAULT_PROJECT.glitch,
        numGlitches: 3,
        offsetSteps: 5,
        repeat: [2, 3, 1],
        extOffset: [1, 4, 2],
      },
    };
    const starts = getGlitchEventStartSteps(project);
    expect(starts).toHaveLength(3);
    expect(starts[0]).toBe(1 * phase + 5);
    expect(starts[1]).toBe(starts[0] + 2 * phase + 4 * phase);
    expect(starts[2]).toBe(starts[1] + 3 * phase + 2 * phase);
  });

  test("multi-glitch simulation emits all events in glitchInput", () => {
    const phase = DEFAULT_PROJECT.clock.phaseShiftSteps;
    const project = {
      ...DEFAULT_PROJECT,
      glitch: {
        ...DEFAULT_PROJECT.glitch,
        outputMode: "clock_xor" as const,
        widthSteps: 10,
        numGlitches: 3,
        repeat: [2, 1, 2],
        extOffset: [0, 2, 2],
      },
    };
    const sim = simulateWaveforms(project, 120, 2);
    expect(sim.eventStartSteps).toHaveLength(3);
    const highCount = sim.glitchInput.filter(Boolean).length;
    // Pulses total across events = 2 + 1 + 2 = 5, each of width 10 steps.
    expect(highCount).toBe(5 * 10);
    // Timeline should cover the last event's end plus padding.
    expect(sim.totalSteps).toBeGreaterThanOrEqual(sim.eventStartSteps[2] + 2 * phase);
  });

  test("combined output uses selected mode logic", () => {
    const project = {
      ...DEFAULT_PROJECT,
      glitch: {
        ...DEFAULT_PROJECT.glitch,
        outputMode: "clock_or" as const,
        widthSteps: 20,
        repeat: [1],
        extOffset: [0],
      },
    };
    const sim = simulateWaveforms(project, 120, 5);
    for (let i = 0; i < sim.totalSteps; i += 1) {
      expect(sim.combinedOutput[i]).toBe(sim.clock[i] || sim.glitchInput[i]);
    }
  });

  test("crowbar_visualizer mode uses AND(NOT(glitch_input), target_clock)", () => {
    const project = {
      ...DEFAULT_PROJECT,
      glitch: {
        ...DEFAULT_PROJECT.glitch,
        outputMode: "crowbar_visualizer" as const,
        widthSteps: 20,
        repeat: [1],
        extOffset: [0],
      },
    };
    const sim = simulateWaveforms(project, 120, 5);
    for (let i = 0; i < sim.totalSteps; i += 1) {
      expect(sim.combinedOutput[i]).toBe(!sim.glitchInput[i] && sim.clock[i]);
    }
  });
});
