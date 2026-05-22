import { describe, expect, test } from "vitest";
import { DEFAULT_PROJECT } from "../defaults";
import { getValidationWarnings } from "../validation";

describe("validation warnings", () => {
  test("adds mode-aware warnings", () => {
    const warnings = getValidationWarnings({
      ...DEFAULT_PROJECT,
      glitch: { ...DEFAULT_PROJECT.glitch, outputMode: "enable_only" },
      trigger: { ...DEFAULT_PROJECT.trigger, triggerSource: "continuous" },
    });
    expect(warnings.map((w) => w.id)).toEqual(
      expect.arrayContaining(["enable-only-width", "continuous-mode-fields"]),
    );
  });

  test("warns that crowbar_visualizer cannot be exported", () => {
    const warnings = getValidationWarnings({
      ...DEFAULT_PROJECT,
      glitch: { ...DEFAULT_PROJECT.glitch, outputMode: "crowbar_visualizer" },
    });
    expect(warnings.map((w) => w.id)).toContain("crowbar-visualizer-export");
  });

  test("adds multi-glitch warning rule", () => {
    const warnings = getValidationWarnings({
      ...DEFAULT_PROJECT,
      glitch: {
        ...DEFAULT_PROJECT.glitch,
        numGlitches: 2,
        repeat: [5, 1],
        extOffset: [0, 1],
      },
    });
    expect(warnings.map((w) => w.id)).toContain("multi-glitch-0");
  });

  test("emits crowbar-hp-long-pulse when HP is armed with a wide pulse", () => {
    const warnings = getValidationWarnings({
      ...DEFAULT_PROJECT,
      glitch: {
        ...DEFAULT_PROJECT.glitch,
        hpEnabled: true,
        widthSteps: DEFAULT_PROJECT.clock.phaseShiftSteps, // > 50% of period
      },
    });
    const hit = warnings.find((w) => w.id === "crowbar-hp-long-pulse");
    expect(hit).toBeDefined();
    expect(hit?.level).toBe("warning");
    expect(hit?.message).toMatch(/permanently damage/i);
  });

  test("emits crowbar-both-mosfets when HP and LP are both armed", () => {
    const warnings = getValidationWarnings({
      ...DEFAULT_PROJECT,
      glitch: { ...DEFAULT_PROJECT.glitch, hpEnabled: true, lpEnabled: true },
    });
    const hit = warnings.find((w) => w.id === "crowbar-both-mosfets");
    expect(hit).toBeDefined();
    expect(hit?.level).toBe("warning");
    expect(hit?.message).toMatch(/both HP and LP/i);
  });

  test("emits crowbar-high-repeat when repeat[0] > 100 and a crowbar is armed", () => {
    const warnings = getValidationWarnings({
      ...DEFAULT_PROJECT,
      glitch: {
        ...DEFAULT_PROJECT.glitch,
        lpEnabled: true,
        repeat: [150],
      },
    });
    const hit = warnings.find((w) => w.id === "crowbar-high-repeat");
    expect(hit).toBeDefined();
    expect(hit?.level).toBe("warning");
    expect(hit?.message).toMatch(/repeat\[0\] > 100/);
  });

  test("emits crowbar-no-mosfet info when neither HP nor LP is armed outside clock_only", () => {
    const warnings = getValidationWarnings({
      ...DEFAULT_PROJECT,
      glitch: { ...DEFAULT_PROJECT.glitch, hpEnabled: false, lpEnabled: false },
    });
    const hit = warnings.find((w) => w.id === "crowbar-no-mosfet");
    expect(hit).toBeDefined();
    expect(hit?.level).toBe("info");
  });

  test("suppresses crowbar-no-mosfet info when outputMode is clock_only", () => {
    const warnings = getValidationWarnings({
      ...DEFAULT_PROJECT,
      glitch: {
        ...DEFAULT_PROJECT.glitch,
        outputMode: "clock_only",
        hpEnabled: false,
        lpEnabled: false,
      },
    });
    expect(warnings.map((w) => w.id)).not.toContain("crowbar-no-mosfet");
  });

  test("does not emit legacy voltage-safety id", () => {
    const warnings = getValidationWarnings({
      ...DEFAULT_PROJECT,
      glitch: { ...DEFAULT_PROJECT.glitch, hpEnabled: true, repeat: [500] },
    });
    expect(warnings.map((w) => w.id)).not.toContain("voltage-safety");
  });
});
