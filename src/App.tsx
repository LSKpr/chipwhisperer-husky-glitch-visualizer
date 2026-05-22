import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import "./app.css";
import { computePhaseShiftSteps, DEFAULT_PROJECT, TEMPLATE_BEGINNER_SAFE } from "./defaults";
import { generatePythonExport } from "./export";
import { getGlossary } from "./glossary";
import { digitalPathFromSamples, simulateWaveforms } from "./simulation";
import { Tooltip } from "./Tooltip";
import type { GlitchProject } from "./types";
import type { DisplayUnit } from "./units";
import { convertFromSteps, convertToSteps, unitSuffix } from "./units";
import { useHistoryState } from "./useHistoryState";
import { getValidationWarnings } from "./validation";

type DragType = "offset" | "width";

interface DragState {
  wallId: string;
  type: DragType;
  eventIndex: number;
  startX: number;
  startOffset: number;
  startWidth: number;
  startExtOffset: number;
}

interface TimeAnnotation {
  id: string;
  startPx: number;
  endPx: number;
  label: string;
  level?: "high" | "low";
}

const JSON_FILE_VERSION = 1;
const DEFAULT_VISIBLE_CYCLES = 2;
const BASE_PX_PER_CYCLE = 600;
const ARROW_LANE_HEIGHT_PX = 40;
const DISPLAY_UNIT_STORAGE_KEY = "glitchviz.displayUnit";

function readStoredDisplayUnit(): DisplayUnit {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(DISPLAY_UNIT_STORAGE_KEY) : null;
    if (raw === "steps" || raw === "ns" || raw === "deg") {
      return raw;
    }
  } catch {
    // ignore (private mode, SSR, etc.)
  }
  return "steps";
}

function writeStoredDisplayUnit(value: DisplayUnit): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(DISPLAY_UNIT_STORAGE_KEY, value);
    }
  } catch {
    // ignore
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatDegrees(deg: number): string {
  if (!Number.isFinite(deg)) return "—";
  return `${deg.toFixed(2)}°`;
}

function formatSeconds(seconds: number): string {
  const abs = Math.abs(seconds);
  if (abs === 0) return "0 s";
  if (abs >= 1) return `${seconds.toFixed(3)} s`;
  if (abs >= 1e-3) return `${(seconds * 1e3).toFixed(3)} ms`;
  if (abs >= 1e-6) return `${(seconds * 1e6).toFixed(3)} µs`;
  if (abs >= 1e-9) return `${(seconds * 1e9).toFixed(2)} ns`;
  return `${(seconds * 1e12).toFixed(2)} ps`;
}

function AnnotationLane({
  annotations,
  width,
  variant = "below",
}: {
  annotations: TimeAnnotation[];
  width: number;
  variant?: "above" | "below";
}) {
  if (annotations.length === 0 || width <= 0) {
    return null;
  }
  const arrowY = variant === "above" ? 30 : 10;
  const textY = variant === "above" ? 14 : 30;
  const className = variant === "above" ? "annotation-lane-above" : "annotation-lane-below";
  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${ARROW_LANE_HEIGHT_PX}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {annotations.map((a) => {
        const mid = (a.startPx + a.endPx) / 2;
        const span = Math.max(0, a.endPx - a.startPx);
        const trim = span > 6 ? 2 : 0;
        return (
          <g key={a.id}>
            <line
              x1={a.startPx + trim}
              x2={a.endPx - trim}
              y1={arrowY}
              y2={arrowY}
              stroke="#b0b6c2"
              strokeWidth={1}
              markerStart="url(#arrow-left)"
              markerEnd="url(#arrow-right)"
            />
            <text
              x={mid}
              y={textY}
              fill="#d0d5de"
              fontSize={11}
              textAnchor="middle"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              {a.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function findHighSegments(samples: boolean[]): { startStep: number; endStep: number }[] {
  const segments: { startStep: number; endStep: number }[] = [];
  let inHigh = false;
  let segStart = 0;
  for (let i = 0; i < samples.length; i += 1) {
    if (samples[i] && !inHigh) {
      inHigh = true;
      segStart = i;
    } else if (!samples[i] && inHigh) {
      inHigh = false;
      segments.push({ startStep: segStart, endStep: i });
    }
  }
  if (inHigh) {
    segments.push({ startStep: segStart, endStep: samples.length });
  }
  return segments;
}

function findAllSegments(
  samples: boolean[],
): { startStep: number; endStep: number; level: boolean }[] {
  const segments: { startStep: number; endStep: number; level: boolean }[] = [];
  if (samples.length === 0) return segments;
  let segStart = 0;
  let current = samples[0];
  for (let i = 1; i <= samples.length; i += 1) {
    const changed = i === samples.length || samples[i] !== current;
    if (changed) {
      segments.push({ startStep: segStart, endStep: i, level: current });
      if (i < samples.length) {
        segStart = i;
        current = samples[i];
      }
    }
  }
  return segments;
}

function formatDisplayNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(Number(value.toFixed(6)));
}

export default function App() {
  const history = useHistoryState<GlitchProject>(DEFAULT_PROJECT);
  const project = history.value;
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [copied, setCopied] = useState(false);
  const [converterSteps, setConverterSteps] = useState<number>(0);
  const [displayUnit, setDisplayUnit] = useState<DisplayUnit>(() => readStoredDisplayUnit());

  useEffect(() => {
    writeStoredDisplayUnit(displayUnit);
  }, [displayUnit]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pxPerCycle = BASE_PX_PER_CYCLE * zoom;
  const warnings = useMemo(() => getValidationWarnings(project), [project]);

  const inactiveWidth = project.glitch.outputMode === "enable_only";
  const inactiveTiming = project.trigger.triggerSource === "continuous";
  const inactiveArmTiming = project.trigger.triggerSource !== "ext_single";

  const simulation = useMemo(
    () => simulateWaveforms(project, pxPerCycle, DEFAULT_VISIBLE_CYCLES),
    [project, pxPerCycle],
  );
  const timelineWidth = simulation.totalCycles * pxPerCycle;
  const effectiveSourceFrequencyHz =
    project.clock.clkSrc === "pll" ? project.clock.pllFrequencyHz : project.clock.sourceFrequencyHz;

  const glitchWalls = useMemo(() => {
    const mode = project.glitch.outputMode;
    const phase = Math.max(1, project.clock.phaseShiftSteps);
    const pulseWidth = simulation.primaryGlitchWidthSteps;
    const eventCount = Math.max(1, project.glitch.numGlitches);
    const walls: { id: string; stepPos: number; type: DragType; eventIndex: number }[] = [];
    for (let eventIndex = 0; eventIndex < eventCount; eventIndex += 1) {
      const eventStart = simulation.eventStartSteps[eventIndex] ?? simulation.primaryGlitchStartStep;
      const repeatCount =
        mode === "enable_only"
          ? 1
          : Math.max(1, project.glitch.repeat[eventIndex] ?? project.glitch.repeat[0] ?? 1);
      for (let pulseIndex = 0; pulseIndex < repeatCount; pulseIndex += 1) {
        const leading = eventStart + pulseIndex * phase;
        walls.push({ id: `lead-${eventIndex}-${pulseIndex}`, stepPos: leading, type: "offset", eventIndex });
        if (mode !== "enable_only") {
          walls.push({
            id: `trail-${eventIndex}-${pulseIndex}`,
            stepPos: leading + pulseWidth,
            type: "width",
            eventIndex,
          });
        }
      }
    }
    return walls;
  }, [
    project.glitch.numGlitches,
    project.glitch.outputMode,
    project.glitch.repeat,
    project.clock.phaseShiftSteps,
    simulation.primaryGlitchStartStep,
    simulation.primaryGlitchWidthSteps,
    simulation.eventStartSteps,
  ]);

  const clockPath = useMemo(
    () => digitalPathFromSamples(simulation.clock, simulation.stepPx, 20, 60),
    [simulation.clock, simulation.stepPx],
  );
  const glitchInputPath = useMemo(
    () => digitalPathFromSamples(simulation.glitchInput, simulation.stepPx, 20, 60),
    [simulation.glitchInput, simulation.stepPx],
  );
  const combinedOutputPath = useMemo(
    () => digitalPathFromSamples(simulation.combinedOutput, simulation.stepPx, 20, 60),
    [simulation.combinedOutput, simulation.stepPx],
  );

  const hpEnabled = project.glitch.hpEnabled;
  const lpEnabled = project.glitch.lpEnabled;

  const stepDerivations = useMemo(() => {
    const src = effectiveSourceFrequencyHz;
    const phase = project.clock.phaseShiftSteps;
    const stepSeconds = Number.isFinite(src) && src > 0 && phase > 0 ? 1 / (src * phase) : NaN;
    const degPerStep = phase > 0 ? 360 / phase : NaN;
    const cycleSeconds = Number.isFinite(src) && src > 0 ? 1 / src : NaN;
    return { stepSeconds, degPerStep, cycleSeconds };
  }, [effectiveSourceFrequencyHz, project.clock.phaseShiftSteps]);

  const offsetDerived = {
    seconds: project.glitch.offsetSteps * stepDerivations.stepSeconds,
    degrees: project.glitch.offsetSteps * stepDerivations.degPerStep,
  };
  const widthDerived = {
    seconds: project.glitch.widthSteps * stepDerivations.stepSeconds,
    degrees: project.glitch.widthSteps * stepDerivations.degPerStep,
  };
  const extOffsetSeconds = (project.glitch.extOffset[0] ?? 0) * stepDerivations.cycleSeconds;

  const formatOtherUnits = (steps: number, seconds: number, degrees: number): string => {
    const stepsStr = Number.isFinite(steps) ? `${Math.round(steps)} steps` : "—";
    const nsStr = Number.isFinite(seconds) ? formatSeconds(seconds) : "—";
    const degStr = formatDegrees(degrees);
    if (displayUnit === "steps") return `${nsStr}, ${degStr}`;
    if (displayUnit === "ns") return `${stepsStr}, ${degStr}`;
    return `${stepsStr}, ${nsStr}`;
  };

  const secondsPerStep = useMemo(() => {
    const src = effectiveSourceFrequencyHz;
    const phase = Math.max(1, project.clock.phaseShiftSteps);
    if (!Number.isFinite(src) || src <= 0) return 0;
    return 1 / (src * phase);
  }, [effectiveSourceFrequencyHz, project.clock.phaseShiftSteps]);

  const phaseShiftStepsSafe = Math.max(1, project.clock.phaseShiftSteps);
  const degPerStep = 360 / phaseShiftStepsSafe;

  const formatInUnit = (steps: number): string => {
    if (displayUnit === "steps") {
      return `${Math.round(steps)} steps`;
    }
    if (displayUnit === "deg") {
      return `${(steps * degPerStep).toFixed(1)}°`;
    }
    return formatSeconds(steps * secondsPerStep);
  };

  const clockAnnotations = useMemo<TimeAnnotation[]>(() => {
    const phase = Math.max(1, project.clock.phaseShiftSteps);
    if (simulation.totalCycles < 1) return [];
    return [
      {
        id: "clock-period-0",
        startPx: 0,
        endPx: pxPerCycle,
        label: `T = ${formatInUnit(phase)}`,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pxPerCycle,
    project.clock.phaseShiftSteps,
    secondsPerStep,
    simulation.totalCycles,
    displayUnit,
  ]);

  const glitchAnnotations = useMemo<TimeAnnotation[]>(() => {
    const segments = findHighSegments(simulation.glitchInput);
    return segments.map((seg, idx) => {
      const startPx = seg.startStep * simulation.stepPx;
      const endPx = seg.endStep * simulation.stepPx;
      const widthSteps = seg.endStep - seg.startStep;
      return {
        id: `glitch-seg-${idx}`,
        startPx,
        endPx,
        label: formatInUnit(widthSteps),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulation.glitchInput, simulation.stepPx, secondsPerStep, displayUnit, phaseShiftStepsSafe]);

  const combinedAnnotations = useMemo<TimeAnnotation[]>(() => {
    const segments = findAllSegments(simulation.combinedOutput);
    return segments
      .map((seg, idx) => {
        const widthSteps = seg.endStep - seg.startStep;
        const startPx = seg.startStep * simulation.stepPx;
        const endPx = seg.endStep * simulation.stepPx;
        const pxSpan = endPx - startPx;
        return {
          id: `combined-seg-${idx}`,
          startPx,
          endPx,
          label: formatInUnit(widthSteps),
          level: seg.level ? ("high" as const) : ("low" as const),
          pxSpan,
        };
      })
      .filter((a) => a.pxSpan >= 18)
      .map(({ pxSpan: _pxSpan, ...rest }) => rest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulation.combinedOutput, simulation.stepPx, secondsPerStep, displayUnit, phaseShiftStepsSafe]);

  const setProject = (next: GlitchProject): void => {
    history.set(next);
  };

  const updateProject = (updater: (prev: GlitchProject) => GlitchProject): void => {
    setProject(updater(project));
  };

  const updateRepeatAt = (index: number, value: number): void => {
    updateProject((prev) => {
      const repeat = [...prev.glitch.repeat];
      repeat[index] = value;
      return { ...prev, glitch: { ...prev.glitch, repeat } };
    });
  };

  const updateExtOffsetAt = (index: number, value: number): void => {
    updateProject((prev) => {
      const extOffset = [...prev.glitch.extOffset];
      extOffset[index] = value;
      return { ...prev, glitch: { ...prev.glitch, extOffset } };
    });
  };

  useEffect(() => {
    if (!dragState) {
      return undefined;
    }

    const onPointerMove = (event: PointerEvent) => {
      const deltaX = event.clientX - dragState.startX;
      const phaseSteps = Math.max(1, project.clock.phaseShiftSteps);
      const deltaSteps = Math.round((deltaX / pxPerCycle) * phaseSteps);
      if (dragState.type === "offset") {
        if (dragState.eventIndex === 0) {
          updateProject((prev) => ({
            ...prev,
            glitch: {
              ...prev.glitch,
              offsetSteps: dragState.startOffset + deltaSteps,
            },
          }));
        } else {
          const deltaCycles = Math.round(deltaSteps / phaseSteps);
          updateProject((prev) => {
            const extOffset = [...prev.glitch.extOffset];
            extOffset[dragState.eventIndex] = dragState.startExtOffset + deltaCycles;
            return {
              ...prev,
              glitch: {
                ...prev.glitch,
                extOffset,
              },
            };
          });
        }
      } else {
        updateProject((prev) => ({
          ...prev,
          glitch: {
            ...prev.glitch,
            widthSteps: Math.max(1, dragState.startWidth + deltaSteps),
          },
        }));
      }
    };

    const onPointerUp = () => {
      setDragState(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [dragState, project, pxPerCycle]);

  const onSaveJson = (): void => {
    const blob = new Blob([JSON.stringify({ version: JSON_FILE_VERSION, project }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${project.name || "glitch-project"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const onLoadJson = (): void => {
    fileInputRef.current?.click();
  };

  const onLoadFileSelected = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    const parsed = JSON.parse(text) as { project?: GlitchProject };
    if (parsed.project) {
      history.reset(parsed.project);
    }
    event.target.value = "";
  };

  const pythonExport = useMemo(
    () => generatePythonExport(project, project.export.verbosity, displayUnit),
    [project, project.export.verbosity, displayUnit],
  );

  const onCopyExport = async (): Promise<void> => {
    await navigator.clipboard.writeText(pythonExport);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const offsetDisplayValue = formatDisplayNumber(
    convertFromSteps(
      project.glitch.offsetSteps,
      displayUnit,
      project.clock.phaseShiftSteps,
      effectiveSourceFrequencyHz,
    ),
  );
  const widthDisplayValue = formatDisplayNumber(
    convertFromSteps(
      project.glitch.widthSteps,
      displayUnit,
      project.clock.phaseShiftSteps,
      effectiveSourceFrequencyHz,
    ),
  );

  const onOffsetChange = (raw: string): void => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const asSteps = convertToSteps(
      parsed,
      displayUnit,
      project.clock.phaseShiftSteps,
      effectiveSourceFrequencyHz,
    );
    if (!Number.isFinite(asSteps)) return;
    const rounded = Math.round(asSteps);
    updateProject((prev) => ({
      ...prev,
      glitch: { ...prev.glitch, offsetSteps: rounded },
    }));
  };

  const onWidthChange = (raw: string): void => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const asSteps = convertToSteps(
      parsed,
      displayUnit,
      project.clock.phaseShiftSteps,
      effectiveSourceFrequencyHz,
    );
    if (!Number.isFinite(asSteps)) return;
    const rounded = Math.round(asSteps);
    updateProject((prev) => ({
      ...prev,
      glitch: { ...prev.glitch, widthSteps: rounded },
    }));
  };

  const unitLabel = unitSuffix(displayUnit);
  const offsetFieldLabel = `Offset (${unitLabel})`;
  const widthFieldLabel = `Width (${unitLabel})`;

  const triggerSource = project.trigger.triggerSource;
  const showTriggerMarkers = triggerSource !== "manual" && triggerSource !== "continuous";
  const extOffsetCycles = project.glitch.extOffset[0] ?? 0;
  const extOffsetPx = extOffsetCycles * pxPerCycle;
  const showGlitchStartMarker = showTriggerMarkers && extOffsetCycles > 0;
  const extOffsetStepsTotal = extOffsetCycles * phaseShiftStepsSafe;

  const numGlitches = Math.max(1, project.glitch.numGlitches);
  const isMultiGlitch = numGlitches > 1;

  const crowbarHighSteps = useMemo(
    () => simulation.glitchInput.reduce((acc, v) => acc + (v ? 1 : 0), 0),
    [simulation.glitchInput],
  );
  const crowbarOnTimeSec = crowbarHighSteps * secondsPerStep;
  const totalSimSec = simulation.totalSteps * secondsPerStep;
  const dutyPercent = totalSimSec > 0 ? (crowbarOnTimeSec / totalSimSec) * 100 : 0;
  const dutyClass = dutyPercent < 5 ? "low" : dutyPercent < 20 ? "med" : "high";
  const energyDisabled = !hpEnabled && !lpEnabled;

  return (
    <main className="page">
      <header className="header">
        <div className="header-title">
          <h1>Glitch Visualizer (simulation v1)</h1>
          <p>Build, inspect, and export realistic glitch timing profiles.</p>
        </div>
        <div className="header-actions">
          <div className="header-actions-main">
            <button onClick={history.undo} disabled={!history.canUndo}>
              Undo
            </button>
            <button onClick={history.redo} disabled={!history.canRedo}>
              Redo
            </button>
            <button onClick={() => history.reset(TEMPLATE_BEGINNER_SAFE)}>Load Template</button>
            <button onClick={onSaveJson}>Save JSON</button>
            <button onClick={onLoadJson}>Load JSON</button>
          </div>
          <input
            ref={fileInputRef}
            hidden
            type="file"
            accept="application/json"
            onChange={onLoadFileSelected}
          />
          <label className="display-unit-label">
            <span className="display-unit-kicker">Display</span>
            <Tooltip content={getGlossary("displayUnit")}>Display Units</Tooltip>
            <select
              value={displayUnit}
              onChange={(e) => setDisplayUnit(e.target.value as DisplayUnit)}
              aria-label="Display Units"
            >
              <option value="steps">steps</option>
              <option value="ns">ns</option>
              <option value="deg">deg</option>
            </select>
          </label>
        </div>
      </header>

      <div className="workspace-layout">
        <section className="zone zone-left" aria-label="Primary Controls">
          <div className="zone-label">Primary Controls</div>
          <div className="zone-scroll">
            <section className="panel">
              <h2>Basic</h2>
              <div className="grid control-grid">
          <label>
            <Tooltip content={getGlossary("projectName")}>Project Name</Tooltip>
            <input
              value={project.name}
              onChange={(e) => updateProject((prev) => ({ ...prev, name: e.target.value }))}
              aria-label="Project Name"
            />
          </label>
          <label>
            <Tooltip content={getGlossary("outputMode")}>Output Mode</Tooltip>
            <select
              value={project.glitch.outputMode}
              onChange={(e) =>
                updateProject((prev) => ({
                  ...prev,
                  glitch: {
                    ...prev.glitch,
                    outputMode: e.target.value as GlitchProject["glitch"]["outputMode"],
                  },
                }))
              }
              aria-label="Output Mode"
            >
              <option value="clock_xor">clock_xor</option>
              <option value="clock_or">clock_or</option>
              <option value="glitch_only">glitch_only</option>
              <option value="clock_only">clock_only</option>
              <option value="enable_only">enable_only</option>
              <option value="crowbar_visualizer">crowbar_visualizer (UI only)</option>
            </select>
          </label>
          <p className="control-subtitle">Clock</p>
          <label>
            <Tooltip content={getGlossary("sourceFrequencyHz")}>Target Clock (Hz)</Tooltip>
            <input
              type="number"
              value={project.clock.sourceFrequencyHz}
              onChange={(e) => {
                const next = Number(e.target.value);
                updateProject((prev) => ({
                  ...prev,
                  clock: {
                    ...prev.clock,
                    sourceFrequencyHz: next,
                    phaseShiftSteps:
                      prev.clock.clkSrc === "target"
                        ? computePhaseShiftSteps(prev.clock.fpgaVcoFrequencyHz, next)
                        : prev.clock.phaseShiftSteps,
                  },
                }));
              }}
              aria-label="Target Clock (Hz)"
            />
          </label>
          <p className="control-subtitle">Trigger</p>
          <label>
            <Tooltip content={getGlossary("triggerSource")}>Trigger Source</Tooltip>
            <select
              value={project.trigger.triggerSource}
              onChange={(e) =>
                updateProject((prev) => ({
                  ...prev,
                  trigger: {
                    ...prev.trigger,
                    triggerSource: e.target.value as GlitchProject["trigger"]["triggerSource"],
                  },
                }))
              }
              aria-label="Trigger Source"
            >
              <option value="manual">manual</option>
              <option value="ext_single">ext_single</option>
              <option value="ext_continuous">ext_continuous</option>
              <option value="continuous">continuous</option>
            </select>
          </label>
          <p className="control-subtitle">Glitch Shape</p>
          <label>
            <Tooltip content={getGlossary("offsetSteps")}>{offsetFieldLabel}</Tooltip>
            <input
              type="number"
              value={offsetDisplayValue}
              onChange={(e) => onOffsetChange(e.target.value)}
              aria-label={offsetFieldLabel}
            />
            <span className="derived-hint">
              = {formatOtherUnits(project.glitch.offsetSteps, offsetDerived.seconds, offsetDerived.degrees)}
            </span>
          </label>
          <label className={inactiveWidth ? "inactive" : ""}>
            <Tooltip content={getGlossary("widthSteps")}>{widthFieldLabel}</Tooltip>
            <input
              type="number"
              value={widthDisplayValue}
              disabled={inactiveWidth}
              onChange={(e) => onWidthChange(e.target.value)}
              aria-label={widthFieldLabel}
            />
            <span className="derived-hint">
              = {formatOtherUnits(project.glitch.widthSteps, widthDerived.seconds, widthDerived.degrees)}
              {inactiveWidth ? " (inactive in enable_only)" : ""}
            </span>
          </label>
          {!isMultiGlitch && (
            <>
              <label className={inactiveTiming ? "inactive" : ""}>
                <Tooltip content={getGlossary("repeat")}>Repeat[0]</Tooltip>
                <input
                  type="number"
                  value={project.glitch.repeat[0]}
                  disabled={inactiveTiming}
                  onChange={(e) => updateRepeatAt(0, Number(e.target.value))}
                  aria-label="Repeat[0]"
                />
              </label>
              <label className={inactiveTiming ? "inactive" : ""}>
                <Tooltip content={getGlossary("extOffset")}>Ext Offset[0] (cycles)</Tooltip>
                <input
                  type="number"
                  value={project.glitch.extOffset[0]}
                  disabled={inactiveTiming}
                  onChange={(e) => updateExtOffsetAt(0, Number(e.target.value))}
                  aria-label="Ext Offset[0] (cycles)"
                />
                <span className="derived-hint">
                  = {Number.isFinite(extOffsetSeconds) ? formatSeconds(extOffsetSeconds) : "—"}
                </span>
              </label>
            </>
          )}
          <label className={inactiveArmTiming ? "inactive" : ""}>
            <Tooltip content={getGlossary("armTiming")}>Arm Timing</Tooltip>
            <select
              value={project.trigger.armTiming}
              disabled={inactiveArmTiming}
              onChange={(e) =>
                updateProject((prev) => ({
                  ...prev,
                  trigger: {
                    ...prev.trigger,
                    armTiming: e.target.value as GlitchProject["trigger"]["armTiming"],
                  },
                }))
              }
              aria-label="Arm Timing"
            >
              <option value="no_glitch">no_glitch</option>
              <option value="before_scope">before_scope</option>
              <option value="after_scope">after_scope</option>
            </select>
          </label>
              </div>
        </section>
            {isMultiGlitch && (
              <section className="panel" aria-label="Glitch Events">
                <h2>
                  <Tooltip content={getGlossary("glitchEvents")}>Glitch Events</Tooltip>
                </h2>
                <div className="glitch-events-table-wrap">
                  <table className="glitch-events-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>
                          <Tooltip content={getGlossary("extOffset")}>ext_offset (cycles)</Tooltip>
                        </th>
                        <th>
                          <Tooltip content={getGlossary("repeat")}>repeat</Tooltip>
                        </th>
                        <th>derived start</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: numGlitches }).map((_, i) => {
                        const extVal = project.glitch.extOffset[i] ?? 0;
                        const repVal = project.glitch.repeat[i] ?? 1;
                        const startSteps = simulation.eventStartSteps[i] ?? 0;
                        return (
                          <tr key={i}>
                            <td>{i}</td>
                            <td>
                              <input
                                type="number"
                                value={extVal}
                                disabled={inactiveTiming}
                                onChange={(e) => updateExtOffsetAt(i, Number(e.target.value))}
                                aria-label={`ext_offset[${i}]`}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                value={repVal}
                                disabled={inactiveTiming}
                                onChange={(e) => updateRepeatAt(i, Number(e.target.value))}
                                aria-label={`repeat[${i}]`}
                              />
                            </td>
                            <td className="derived-start" data-testid={`glitch-event-start-${i}`}>
                              {formatInUnit(startSteps)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section className="panel">
              <button className="toggle" onClick={() => setShowAdvanced((prev) => !prev)}>
                {showAdvanced ? "Hide Advanced" : "Show Advanced"}
              </button>
              {showAdvanced && (
                <div className="grid advanced">
            <label>
              <Tooltip content={getGlossary("fpgaVcoFrequencyHz")}>FPGA VCO (Hz)</Tooltip>
              <input
                type="number"
                value={project.clock.fpgaVcoFrequencyHz}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  updateProject((prev) => ({
                    ...prev,
                    clock: {
                      ...prev.clock,
                      fpgaVcoFrequencyHz: next,
                      phaseShiftSteps: computePhaseShiftSteps(
                        next,
                        prev.clock.clkSrc === "pll" ? prev.clock.pllFrequencyHz : prev.clock.sourceFrequencyHz,
                      ),
                    },
                  }));
                }}
                aria-label="FPGA VCO (Hz)"
              />
            </label>
            <label>
              <Tooltip content={getGlossary("clkSrc")}>Clock Source (clk_src)</Tooltip>
              <select
                value={project.clock.clkSrc}
                onChange={(e) =>
                  updateProject((prev) => ({
                    ...prev,
                    clock: {
                      ...prev.clock,
                      clkSrc: e.target.value as GlitchProject["clock"]["clkSrc"],
                      phaseShiftSteps: computePhaseShiftSteps(
                        prev.clock.fpgaVcoFrequencyHz,
                        e.target.value === "pll" ? prev.clock.pllFrequencyHz : prev.clock.sourceFrequencyHz,
                      ),
                    },
                  }))
                }
                aria-label="Clock Source (clk_src)"
              >
                <option value="target">target</option>
                <option value="pll">pll</option>
              </select>
            </label>
            <label className={project.clock.clkSrc === "pll" ? "" : "inactive"}>
              <Tooltip content={getGlossary("pllFrequencyHz")}>PLL Clock (Hz)</Tooltip>
              <input
                type="number"
                value={project.clock.pllFrequencyHz}
                disabled={project.clock.clkSrc !== "pll"}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  updateProject((prev) => ({
                    ...prev,
                    clock: {
                      ...prev.clock,
                      pllFrequencyHz: next,
                      phaseShiftSteps:
                        prev.clock.clkSrc === "pll"
                          ? computePhaseShiftSteps(prev.clock.fpgaVcoFrequencyHz, next)
                          : prev.clock.phaseShiftSteps,
                    },
                  }));
                }}
                aria-label="PLL Clock (Hz)"
              />
            </label>
            <label>
              <Tooltip content={getGlossary("phaseShiftSteps")}>Phase Shift Steps</Tooltip>
              <input
                type="number"
                min={16}
                value={project.clock.phaseShiftSteps}
                onChange={(e) =>
                  updateProject((prev) => ({
                    ...prev,
                    clock: { ...prev.clock, phaseShiftSteps: Math.max(16, Number(e.target.value)) },
                  }))
                }
                aria-label="Phase Shift Steps"
              />
            </label>
            <label className={inactiveTiming ? "inactive" : ""}>
              <Tooltip content={getGlossary("numGlitches")}>Num Glitches</Tooltip>
              <input
                type="number"
                min={1}
                max={32}
                value={project.glitch.numGlitches}
                disabled={inactiveTiming}
                onChange={(e) => {
                  const next = clamp(Number(e.target.value), 1, 32);
                  updateProject((prev) => ({
                    ...prev,
                    glitch: {
                      ...prev.glitch,
                      numGlitches: next,
                      repeat: Array.from({ length: next }, (_, i) => prev.glitch.repeat[i] ?? 1),
                      extOffset: Array.from({ length: next }, (_, i) => prev.glitch.extOffset[i] ?? 0),
                    },
                  }));
                }}
                aria-label="Num Glitches"
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={project.glitch.hpEnabled}
                onChange={(e) =>
                  updateProject((prev) => ({
                    ...prev,
                    glitch: { ...prev.glitch, hpEnabled: e.target.checked },
                  }))
                }
                aria-label="Enable HP MOSFET"
              />
              <Tooltip content={getGlossary("hpEnabled")}>Enable HP MOSFET</Tooltip>
            </label>
            <label>
              <input
                type="checkbox"
                checked={project.glitch.lpEnabled}
                onChange={(e) =>
                  updateProject((prev) => ({
                    ...prev,
                    glitch: { ...prev.glitch, lpEnabled: e.target.checked },
                  }))
                }
                aria-label="Enable LP MOSFET"
              />
              <Tooltip content={getGlossary("lpEnabled")}>Enable LP MOSFET</Tooltip>
            </label>
                </div>
              )}
            </section>
          </div>
        </section>

        <section className="zone zone-right-top" aria-label="Timeline">
          <div className="zone-label">Timeline</div>
          <section className="panel timeline-panel">
            <h2>Timeline</h2>
            <div className="timeline-toolbar">
              <div className="zoom">
                <span className="zoom-label">Zoom</span>
                <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>Zoom Out</button>
                <Tooltip content={getGlossary("zoom")}>
                  <span className="zoom-value">{zoom.toFixed(2)}x</span>
                </Tooltip>
                <button onClick={() => setZoom((z) => Math.min(8, z + 0.25))}>Zoom In</button>
              </div>
              <p className="timeline-unit-emphasis">Units: {displayUnit}</p>
            </div>
            <p className="viewport-note">
              Viewport: about 2 full cycles by default. Drag the red wave walls to adjust offset (rising edges) and
              width (falling edges). Step duration ≈ {formatSeconds(secondsPerStep)} ({project.clock.phaseShiftSteps} steps/period).
            </p>
            <div className="timeline-scroll" data-testid="waveform-viewport">
              <div className="timeline" style={{ width: `${timelineWidth}px` }}>
            <div className="ticks">
              {Array.from({ length: simulation.totalCycles + 1 }).map((_, i) => (
                <span key={i} className="tick" style={{ left: `${i * pxPerCycle}px` }} />
              ))}
            </div>
            <div className="timeline-axis" aria-hidden="true">
              {Array.from({ length: simulation.totalCycles + 1 }).map((_, i) => {
                const cycleSeconds = stepDerivations.cycleSeconds;
                const canShow = pxPerCycle >= 40;
                let secondary: string | null = null;
                if (canShow) {
                  if (displayUnit === "deg") {
                    secondary = `${i * 360}°`;
                  } else if (displayUnit === "steps") {
                    secondary = `${i * phaseShiftStepsSafe} steps`;
                  } else if (Number.isFinite(cycleSeconds)) {
                    secondary = formatSeconds(i * cycleSeconds);
                  }
                }
                return (
                  <div key={i} className="axis-label" style={{ left: `${i * pxPerCycle}px` }}>
                    <span className="axis-cyc">cyc {i}</span>
                    {secondary !== null && <span className="axis-time">{secondary}</span>}
                  </div>
                );
              })}
            </div>
            <div className="wave-rows">
            <svg className="arrow-defs" width="0" height="0" aria-hidden="true">
              <defs>
                <marker id="arrow-left" markerWidth="7" markerHeight="7" refX="0" refY="3.5" orient="auto">
                  <path d="M7,0 L0,3.5 L7,7 Z" fill="#9aa3b2" />
                </marker>
                <marker id="arrow-right" markerWidth="7" markerHeight="7" refX="7" refY="3.5" orient="auto">
                  <path d="M0,0 L7,3.5 L0,7 Z" fill="#9aa3b2" />
                </marker>
              </defs>
            </svg>
            <div className="wave-row">
              <div className="wave-label">Target Clock</div>
              <svg className="digital-wave" viewBox={`0 0 ${timelineWidth} 84`} preserveAspectRatio="none">
                <path d={clockPath} />
              </svg>
              <AnnotationLane annotations={clockAnnotations} width={timelineWidth} />
            </div>
            <div className="wave-row">
              <div className="wave-label">Glitch Input</div>
              <svg className="digital-wave glitch-input" viewBox={`0 0 ${timelineWidth} 84`} preserveAspectRatio="none">
                <path d={glitchInputPath} />
              </svg>
              <AnnotationLane annotations={glitchAnnotations} width={timelineWidth} />
            </div>
            <div className="wave-row">
              <AnnotationLane
                annotations={combinedAnnotations.filter((a) => a.level === "high")}
                width={timelineWidth}
                variant="above"
              />
              <div className="wave-label">Combined Output</div>
              <svg className="digital-wave combined-output" viewBox={`0 0 ${timelineWidth} 84`} preserveAspectRatio="none">
                <path d={combinedOutputPath} />
              </svg>
              <AnnotationLane
                annotations={combinedAnnotations.filter((a) => a.level === "low")}
                width={timelineWidth}
                variant="below"
              />
            </div>
            </div>
            {showTriggerMarkers && (
              <>
                <div
                  className="trigger-vline"
                  style={{ left: 0 }}
                  aria-hidden="true"
                />
                <div className="trigger-marker-label" style={{ left: 0 }}>
                  TRIGGER
                </div>
                {showGlitchStartMarker && (
                  <>
                    <div
                      className="glitch-start-vline"
                      style={{ left: `${extOffsetPx}px` }}
                      aria-hidden="true"
                    />
                    <div
                      className="glitch-start-marker-label"
                      style={{ left: `${extOffsetPx}px` }}
                    >
                      G0 START
                    </div>
                    <svg
                      className="ext-offset-arrow"
                      style={{ left: 0, width: `${extOffsetPx}px` }}
                      viewBox={`0 0 ${Math.max(1, extOffsetPx)} 16`}
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <line
                        x1={2}
                        x2={Math.max(2, extOffsetPx - 2)}
                        y1={10}
                        y2={10}
                        stroke="#9aa3b2"
                        strokeWidth={1}
                        markerStart="url(#arrow-left)"
                        markerEnd="url(#arrow-right)"
                      />
                      <text
                        x={extOffsetPx / 2}
                        y={7}
                        fill="#d0d5de"
                        fontSize={10}
                        textAnchor="middle"
                        fontFamily="ui-sans-serif, system-ui, sans-serif"
                      >
                        {isMultiGlitch
                          ? `ext_offset[0]: ${formatInUnit(extOffsetStepsTotal)}`
                          : `ext_offset: ${formatInUnit(extOffsetStepsTotal)}`}
                      </text>
                    </svg>
                  </>
                )}
                {isMultiGlitch &&
                  simulation.eventStartSteps.slice(1).map((startSteps, idx) => {
                    const eventIdx = idx + 1;
                    const extI = project.glitch.extOffset[eventIdx] ?? 0;
                    const leftPx = startSteps * simulation.stepPx;
                    const gapStartPx = leftPx - extI * pxPerCycle;
                    const arrowWidthPx = Math.max(1, leftPx - gapStartPx);
                    const gapStepsTotal = extI * phaseShiftStepsSafe;
                    return (
                      <div key={`event-marker-${eventIdx}`}>
                        <div
                          className="glitch-start-vline secondary"
                          style={{ left: `${leftPx}px` }}
                          aria-hidden="true"
                        />
                        <div
                          className="glitch-start-marker-label secondary"
                          style={{ left: `${leftPx}px` }}
                        >
                          G{eventIdx} START
                        </div>
                        {extI > 0 && (
                          <svg
                            className="ext-offset-arrow"
                            style={{ left: `${gapStartPx}px`, width: `${arrowWidthPx}px` }}
                            viewBox={`0 0 ${Math.max(1, arrowWidthPx)} 16`}
                            preserveAspectRatio="none"
                            aria-hidden="true"
                          >
                            <line
                              x1={2}
                              x2={Math.max(2, arrowWidthPx - 2)}
                              y1={10}
                              y2={10}
                              stroke="#9aa3b2"
                              strokeWidth={1}
                              strokeDasharray="3 5"
                              markerStart="url(#arrow-left)"
                              markerEnd="url(#arrow-right)"
                            />
                            <text
                              x={arrowWidthPx / 2}
                              y={7}
                              fill="#d0d5de"
                              fontSize={10}
                              textAnchor="middle"
                              fontFamily="ui-sans-serif, system-ui, sans-serif"
                            >
                              ext_offset[{eventIdx}]: {formatInUnit(gapStepsTotal)}
                            </text>
                          </svg>
                        )}
                      </div>
                    );
                  })}
              </>
            )}
            {glitchWalls.map((wall) => {
              const leftPx = wall.stepPos * simulation.stepPx;
              const isActive = dragState?.wallId === wall.id;
              const label =
                wall.type === "offset"
                  ? wall.eventIndex === 0
                    ? "Drag offset wall"
                    : `Drag ext_offset[${wall.eventIndex}] wall`
                  : "Drag width wall";
              return (
                <div
                  key={wall.id}
                  className={`wall-drag ${wall.type} ${isActive ? "active" : ""}`}
                  style={{ left: `${leftPx}px` }}
                  role="button"
                  tabIndex={0}
                  aria-label={label}
                  onPointerDown={(event) => {
                    (event.target as Element).setPointerCapture?.(event.pointerId);
                    setDragState({
                      wallId: wall.id,
                      type: wall.type,
                      eventIndex: wall.eventIndex,
                      startX: event.clientX,
                      startOffset: project.glitch.offsetSteps,
                      startWidth: project.glitch.widthSteps,
                      startExtOffset: project.glitch.extOffset[wall.eventIndex] ?? 0,
                    });
                  }}
                />
              );
            })}
              </div>
            </div>
          </section>
        </section>

        <section className="zone zone-right-bottom" aria-label="Analysis and Export">
          <div className="zone-label">Analysis &amp; Export</div>
          <div className="zone-scroll">
            <section className="panel converter-panel">
              <h2>
                <Tooltip content={getGlossary("unitConverter")}>Unit Converter</Tooltip>
              </h2>
              {(() => {
                const src = effectiveSourceFrequencyHz;
                const phase = project.clock.phaseShiftSteps;
                const nsPerStep = Number.isFinite(src) && src > 0 && phase > 0 ? 1e9 / (src * phase) : NaN;
                const cdegPerStep = phase > 0 ? 360 / phase : NaN;
                const timeNs = converterSteps * nsPerStep;
                const degrees = converterSteps * cdegPerStep;
                const fmt = (v: number): string => (Number.isFinite(v) ? String(Number(v.toFixed(6))) : "");
                const onSteps = (value: string) => {
                  const n = Number(value);
                  setConverterSteps(Number.isFinite(n) ? n : 0);
                };
                const onTime = (value: string) => {
                  const n = Number(value);
                  if (!Number.isFinite(n) || !Number.isFinite(nsPerStep) || nsPerStep === 0) return;
                  setConverterSteps(n / nsPerStep);
                };
                const onDeg = (value: string) => {
                  const n = Number(value);
                  if (!Number.isFinite(n) || !Number.isFinite(cdegPerStep) || cdegPerStep === 0) return;
                  setConverterSteps(n / cdegPerStep);
                };
                return (
                  <>
                    <div className="grid">
                      <label>
                        Steps
                        <input
                          type="number"
                          value={fmt(converterSteps)}
                          onChange={(e) => onSteps(e.target.value)}
                          aria-label="Converter Steps"
                        />
                      </label>
                      <label>
                        Time (ns)
                        <input
                          type="number"
                          value={fmt(timeNs)}
                          onChange={(e) => onTime(e.target.value)}
                          aria-label="Converter Time (ns)"
                        />
                      </label>
                      <label>
                        Phase (deg)
                        <input
                          type="number"
                          value={fmt(degrees)}
                          onChange={(e) => onDeg(e.target.value)}
                          aria-label="Converter Phase (deg)"
                        />
                      </label>
                    </div>
                    <p className="derived-hint">
                      Basis: 1 step = {Number.isFinite(nsPerStep) ? nsPerStep.toFixed(3) : "—"} ns ={" "}
                      {Number.isFinite(cdegPerStep) ? cdegPerStep.toFixed(4) : "—"}° (f_src = {src} Hz, phase_shift_steps ={" "}
                      {phase})
                    </p>
                  </>
                );
              })()}
            </section>

            <section className="panel warnings-panel">
              <p className="energy-readout">
                <span className="energy-readout-kicker">Crowbar Readout</span>
                <Tooltip content={getGlossary("crowbarEnergy")}>Crowbar on-time per trigger</Tooltip>:{" "}
                <span className="energy-value">{formatSeconds(crowbarOnTimeSec)}</span> (
                <span className={`energy-duty ${dutyClass}`}>{dutyPercent.toFixed(1)}%</span> of simulated window)
                {energyDisabled && (
                  <span className="energy-muted">(no physical effect — crowbar disabled)</span>
                )}
              </p>
              <h2>Warnings</h2>
              {warnings.length === 0 && <p className="warnings-empty">No warnings.</p>}
              <ul className="warnings-list">
                {warnings.map((warning) => (
                  <li key={warning.id} className={warning.level === "warning" ? "warn" : "info"}>
                    <span className={`warning-chip ${warning.level}`}>{warning.level}</span>
                    <span>{warning.message}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel export-panel">
              <h2>Verbose Python Export</h2>
              <div className="export-actions">
                <label>
                  <Tooltip content={getGlossary("exportVerbosity")}>Export Mode</Tooltip>
                  <select
                    value={project.export.verbosity}
                    onChange={(e) =>
                      updateProject((prev) => ({
                        ...prev,
                        export: { verbosity: e.target.value as GlitchProject["export"]["verbosity"] },
                      }))
                    }
                    aria-label="Export Mode"
                  >
                    <option value="full_stubs">full_stubs</option>
                    <option value="params_only">params_only</option>
                  </select>
                </label>
                <button onClick={onCopyExport}>{copied ? "Copied" : "Copy Python"}</button>
              </div>
              <pre className="export-code">{pythonExport}</pre>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
