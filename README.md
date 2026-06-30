# Glitch Visualizer

An offline, browser-based tool for understanding the clock/voltage glitches produced by a **ChipWhisperer-Husky**.

Tune the glitch parameters (offset, width, repeat, external offset, trigger, clock source) and instantly see the resulting pulse on an interactive timeline — no hardware required. Then export the matching ChipWhisperer Python so you can run it for real.

![Controls and timeline view](screenshots/timeline.png)

![Python export panel](screenshots/python-export.png)

## Why

Husky glitch settings are abstract: values in *steps* that map non-linearly to *nanoseconds* and *degrees*. This tool makes them visual, so you can build intuition for what a given configuration actually does before touching the target.

## Run

```bash
npm install
npm run dev      # local dev server
npm run build    # production build
npm run test     # unit tests
```

## Features

- **Live timeline** — zoom and drag the glitch offset/width; values and graph stay in sync.
- **Basic & Advanced modes** — mode-aware fields with gray-out for irrelevant settings.
- **Trigger & clock source** — configure trigger and `clk_src` (target / pll) alongside the glitch.
- **Validation** — warnings for unsafe or contradictory settings, including multi-glitch cases.
- **Python export** — full stubs or params-only, one-click copy.
- **Projects** — save/load as JSON, undo/redo history, starter preset.
- **Unit converter** — steps ↔ ns ↔ degrees, with glossary tooltips throughout.

Built with React + TypeScript + Vite. Windows-first, runs fully offline.
