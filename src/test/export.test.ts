import { describe, expect, test } from "vitest";
import { DEFAULT_PROJECT } from "../defaults";
import { generatePythonExport } from "../export";

describe("python export", () => {
  test("matches full stubs snapshot", () => {
    const result = generatePythonExport(DEFAULT_PROJECT, "full_stubs");
    expect(result).toMatchSnapshot();
  });

  test("matches params-only snapshot", () => {
    const result = generatePythonExport(DEFAULT_PROJECT, "params_only");
    expect(result).toMatchSnapshot();
  });

  test("emits list-form repeat and ext_offset when num_glitches > 1", () => {
    const project = {
      ...DEFAULT_PROJECT,
      glitch: {
        ...DEFAULT_PROJECT.glitch,
        numGlitches: 3,
        repeat: [2, 1, 4],
        extOffset: [1, 5, 3],
      },
    };
    const result = generatePythonExport(project, "params_only");
    expect(result).toContain("scope.glitch.num_glitches = 3");
    expect(result).toContain("scope.glitch.ext_offset = [1,5,3]".replace(/,/g, ","));
    expect(result).toMatch(/scope\.glitch\.ext_offset = \[1,\s*5,\s*3\]/);
    expect(result).toMatch(/scope\.glitch\.repeat = \[2,\s*1,\s*4\]/);
  });

  test("honors clk_src = pll when configured", () => {
    const project = {
      ...DEFAULT_PROJECT,
      clock: { ...DEFAULT_PROJECT.clock, clkSrc: "pll" as const, pllFrequencyHz: 12_000_000 },
    };
    const result = generatePythonExport(project, "params_only");
    expect(result).toContain("scope.glitch.clk_src = 'pll'");
    expect(result).toContain("# glitch_source_hz=12000000 (clk_src=pll)");
  });

  test("returns warning-only export for crowbar_visualizer mode", () => {
    const project = {
      ...DEFAULT_PROJECT,
      glitch: { ...DEFAULT_PROJECT.glitch, outputMode: "crowbar_visualizer" as const },
    };
    const result = generatePythonExport(project, "params_only");
    expect(result).toContain("WARNING");
    expect(result).toContain("UI-only visualization mode");
    expect(result).not.toContain("scope.glitch.output");
  });
});
