import type { GlitchProject, ValidationWarning } from "./types";

const MAX_EXT_OFFSET = 2 ** 32 - 1;

export function getValidationWarnings(project: GlitchProject): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const { glitch, trigger, clock } = project;

  if (clock.fpgaVcoFrequencyHz < 600_000_000 || clock.fpgaVcoFrequencyHz > 1_200_000_000) {
    warnings.push({
      id: "vco-range",
      level: "warning",
      message: "FPGA VCO frequency is outside Husky-like range (600 MHz to 1200 MHz).",
    });
  }

  if (glitch.widthSteps < 0 || glitch.widthSteps > clock.phaseShiftSteps) {
    warnings.push({
      id: "width-range",
      level: "warning",
      message: "Width steps should remain between 0 and phase_shift_steps.",
    });
  }

  if (glitch.offsetSteps < -clock.phaseShiftSteps || glitch.offsetSteps > clock.phaseShiftSteps * 2) {
    warnings.push({
      id: "offset-range",
      level: "warning",
      message: "Offset is far outside one cycle window and may be confusing.",
    });
  }

  glitch.repeat.forEach((repeat, i) => {
    if (repeat < 1 || repeat > 8192) {
      warnings.push({
        id: `repeat-range-${i}`,
        level: "warning",
        message: `repeat[${i}] must stay in [1, 8192].`,
      });
    }
  });

  glitch.extOffset.forEach((offset, i) => {
    if (offset < 0 || offset > MAX_EXT_OFFSET) {
      warnings.push({
        id: `ext-offset-range-${i}`,
        level: "warning",
        message: `ext_offset[${i}] must stay in [0, 2**32).`,
      });
    }
  });

  if (glitch.numGlitches < 1 || glitch.numGlitches > 32) {
    warnings.push({
      id: "num-glitches-range",
      level: "warning",
      message: "num_glitches should stay in [1, 32].",
    });
  }

  if (glitch.outputMode === "enable_only") {
    warnings.push({
      id: "enable-only-width",
      level: "info",
      message: "width is inactive in enable_only mode and is kept only for context.",
    });
  }

  if (glitch.outputMode === "crowbar_visualizer") {
    warnings.push({
      id: "crowbar-visualizer-export",
      level: "warning",
      message:
        "crowbar_visualizer is UI-only and cannot be exported to ChipWhisperer Python. Select a real Husky output mode before export.",
    });
  }

  if (trigger.triggerSource === "continuous") {
    warnings.push({
      id: "continuous-mode-fields",
      level: "info",
      message: "ext_offset, repeat, and num_glitches are inactive in continuous mode.",
    });
  }

  if (trigger.triggerSource === "manual") {
    warnings.push({
      id: "manual-arm-note",
      level: "info",
      message: "Manual mode note: scope.arm() may also trigger glitches depending on workflow.",
    });
  }

  if (glitch.numGlitches > 1) {
    for (let i = 0; i < glitch.numGlitches - 1; i += 1) {
      const currentRepeat = glitch.repeat[i] ?? glitch.repeat[glitch.repeat.length - 1] ?? 1;
      const nextOffset = glitch.extOffset[i + 1] ?? glitch.extOffset[glitch.extOffset.length - 1] ?? 0;
      if (currentRepeat > nextOffset + 1) {
        warnings.push({
          id: `multi-glitch-${i}`,
          level: "warning",
          message: `repeat[${i}] > ext_offset[${i + 1}] + 1 can cause illegal multi-glitch timing.`,
        });
      }
    }

    const negIndex = glitch.extOffset.findIndex((v, i) => i < glitch.numGlitches && v < 0);
    if (negIndex >= 0) {
      warnings.push({
        id: "multi-glitch-negative-ext-offset",
        level: "warning",
        message: `ext_offset[${negIndex}] is negative; Husky ext_offset is an unsigned cycle delay and must be >= 0.`,
      });
    }

    if (trigger.triggerSource === "continuous") {
      warnings.push({
        id: "multi-glitch-continuous-ignored",
        level: "info",
        message: "num_glitches > 1 is ignored in continuous trigger mode.",
      });
    }
  }

  if (glitch.hpEnabled && glitch.widthSteps > clock.phaseShiftSteps / 2) {
    warnings.push({
      id: "crowbar-hp-long-pulse",
      level: "warning",
      message:
        "HP crowbar is armed with a pulse width > 50% of a clock period. This can permanently damage the target.",
    });
  }

  if (glitch.hpEnabled && glitch.lpEnabled) {
    warnings.push({
      id: "crowbar-both-mosfets",
      level: "warning",
      message: "Both HP and LP crowbar MOSFETs are enabled. Usually only one path is intended.",
    });
  }

  if ((glitch.hpEnabled || glitch.lpEnabled) && (glitch.repeat[0] ?? 0) > 100) {
    warnings.push({
      id: "crowbar-high-repeat",
      level: "warning",
      message:
        "Crowbar is armed with repeat[0] > 100; energy dissipated on target may exceed safe limits.",
    });
  }

  if (!glitch.hpEnabled && !glitch.lpEnabled && glitch.outputMode !== "clock_only") {
    warnings.push({
      id: "crowbar-no-mosfet",
      level: "info",
      message:
        "No crowbar MOSFET is enabled; this is purely clock-glitch timing (no voltage glitch happens physically).",
    });
  }

  return warnings;
}
