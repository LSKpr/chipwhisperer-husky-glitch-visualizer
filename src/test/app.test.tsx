import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";
import App from "../App";
import { convertFromSteps } from "../units";

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("app ui", () => {
  test("shows target clock control in basic panel", () => {
    render(<App />);
    expect(screen.getByLabelText("Target Clock (Hz)")).toBeInTheDocument();
  });

  test("grays out mode-dependent controls", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Trigger Source"), {
      target: { value: "continuous" },
    });
    const extOffsetInput = screen.getByLabelText("Ext Offset[0] (cycles)");
    expect(extOffsetInput).toBeDisabled();
  });

  test("supports undo redo for numeric inputs", () => {
    render(<App />);
    const offsetInput = screen.getByLabelText("Offset (steps)") as HTMLInputElement;
    fireEvent.change(offsetInput, { target: { value: "12" } });
    expect(offsetInput.value).toBe("12");

    fireEvent.click(screen.getByText("Undo"));
    expect((screen.getByLabelText("Offset (steps)") as HTMLInputElement).value).toBe("0");

    fireEvent.click(screen.getByText("Redo"));
    expect((screen.getByLabelText("Offset (steps)") as HTMLInputElement).value).toBe("12");
  });

  test("defaults viewport to two cycles", () => {
    render(<App />);
    expect(screen.getByText(/Viewport: about 2 full cycles by default\./)).toBeInTheDocument();
    expect(screen.getByTestId("waveform-viewport")).toBeInTheDocument();
  });

  test("unit converter derives ns and degrees from steps", () => {
    render(<App />);
    const stepsInput = screen.getByLabelText("Converter Steps") as HTMLInputElement;
    const timeInput = screen.getByLabelText("Converter Time (ns)") as HTMLInputElement;
    const degInput = screen.getByLabelText("Converter Phase (deg)") as HTMLInputElement;
    fireEvent.change(stepsInput, { target: { value: "4480" } });
    expect(Number(timeInput.value)).toBeCloseTo(100, 3);
    expect(Number(degInput.value)).toBeCloseTo(360, 3);
  });

  test("display-unit toggle switches offset label and value", () => {
    render(<App />);
    const offsetSteps = screen.getByLabelText("Offset (steps)") as HTMLInputElement;
    fireEvent.change(offsetSteps, { target: { value: "10" } });
    expect(offsetSteps.value).toBe("10");

    const unitSelect = screen.getByLabelText("Display Units") as HTMLSelectElement;
    fireEvent.change(unitSelect, { target: { value: "ns" } });

    const offsetNs = screen.getByLabelText("Offset (ns)") as HTMLInputElement;
    expect(offsetNs).toBeInTheDocument();
    expect(Number(offsetNs.value)).toBeCloseTo(
      convertFromSteps(10, "ns", 4480, 10_000_000),
      6,
    );

    fireEvent.change(unitSelect, { target: { value: "deg" } });
    const offsetDeg = screen.getByLabelText("Offset (deg)") as HTMLInputElement;
    expect(offsetDeg).toBeInTheDocument();
    expect(Number(offsetDeg.value)).toBeCloseTo((10 * 360) / 4480, 4);
  });

  test("axis label shows phase-shift steps under cyc 1 in steps mode", () => {
    render(<App />);
    expect(screen.getByText("4480 steps")).toBeInTheDocument();
  });

  test("tooltip bubble appears on hover with glossary content", () => {
    render(<App />);
    const wrap = screen.getByText("Offset (steps)");
    fireEvent.mouseEnter(wrap);
    const tip = screen.getByRole("tooltip");
    expect(tip).toBeInTheDocument();
    expect(tip.textContent).toContain("Phase-step offset");
  });
});

describe("timeline rows", () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  test("does not render the Target VCC (crowbar) row", () => {
    render(<App />);
    expect(screen.queryByText(/Target VCC \(crowbar\)/)).toBeNull();
  });
});

describe("trigger markers", () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  test("renders TRIGGER label on ext_single (default)", () => {
    render(<App />);
    expect(screen.getByText(/TRIGGER/)).toBeInTheDocument();
  });

  test("hides TRIGGER label when source is manual", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Trigger Source"), {
      target: { value: "manual" },
    });
    expect(screen.queryByText(/TRIGGER/)).toBeNull();
  });
});

describe("multi-glitch editor", () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  const enableMultiGlitch = (n: number) => {
    fireEvent.click(screen.getByText("Show Advanced"));
    const numGlitchesInput = screen.getByLabelText("Num Glitches") as HTMLInputElement;
    fireEvent.change(numGlitchesInput, { target: { value: String(n) } });
  };

  test("shows Glitch Events panel with N rows when numGlitches > 1", () => {
    render(<App />);
    enableMultiGlitch(3);
    expect(screen.getByText("Glitch Events")).toBeInTheDocument();
    expect(screen.getByLabelText("ext_offset[0]")).toBeInTheDocument();
    expect(screen.getByLabelText("ext_offset[1]")).toBeInTheDocument();
    expect(screen.getByLabelText("ext_offset[2]")).toBeInTheDocument();
    expect(screen.getByLabelText("repeat[0]")).toBeInTheDocument();
    expect(screen.getByLabelText("repeat[1]")).toBeInTheDocument();
    expect(screen.getByLabelText("repeat[2]")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ext Offset[0] (cycles)")).toBeNull();
    expect(screen.queryByLabelText("Repeat[0]")).toBeNull();
  });

  test("updating ext_offset[1] updates derived-start for row 2", () => {
    render(<App />);
    enableMultiGlitch(3);
    const phase = 4480;
    const row2Cell = screen.getByTestId("glitch-event-start-2");
    const initialText = row2Cell.textContent ?? "";

    const ext1 = screen.getByLabelText("ext_offset[1]") as HTMLInputElement;
    fireEvent.change(ext1, { target: { value: "7" } });

    const updatedText = screen.getByTestId("glitch-event-start-2").textContent ?? "";
    expect(updatedText).not.toBe(initialText);
    // start[0] = 1*4480 + 0 = 4480
    // start[1] = 4480 + 2*4480 + 7*4480 = 4480 + 9*4480 = 44800
    // start[2] = 44800 + 1*4480 + 0*4480 = 49280
    expect(updatedText).toContain("49280");
    void phase;
  });

  test("renders G<i> START markers in ext_single and hides them in manual", () => {
    render(<App />);
    enableMultiGlitch(3);
    expect(screen.getByText(/G0 START/)).toBeInTheDocument();
    expect(screen.getByText(/G1 START/)).toBeInTheDocument();
    expect(screen.getByText(/G2 START/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Trigger Source"), {
      target: { value: "manual" },
    });
    expect(screen.queryByText(/G0 START/)).toBeNull();
    expect(screen.queryByText(/G1 START/)).toBeNull();
    expect(screen.queryByText(/G2 START/)).toBeNull();
  });
});

describe("crowbar energy readout", () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  test("renders Crowbar on-time readout with default project", () => {
    render(<App />);
    expect(screen.getByText(/Crowbar on-time per trigger/)).toBeInTheDocument();
  });
});

describe("displayUnit persistence", () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  test("persists selected display unit across remount", () => {
    const first = render(<App />);
    expect(screen.getByLabelText("Offset (steps)")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Display Units"), {
      target: { value: "ns" },
    });
    expect(screen.getByLabelText("Offset (ns)")).toBeInTheDocument();

    first.unmount();

    render(<App />);
    expect(screen.getByLabelText("Offset (ns)")).toBeInTheDocument();
  });
});
