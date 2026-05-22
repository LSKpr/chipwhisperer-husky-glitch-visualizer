# Glitch Visualizer MVP

Windows-first, offline-first simulation app for exploring Husky-like glitch timing settings.

## Run locally

```bash
npm install
npm run dev
```

## Build and test

```bash
npm run build
npm run test
```

## Included in this MVP pass

- Basic + Advanced parameter editing UI with mode-dependent gray-out
- Timeline with zoom and draggable offset/width handles
- Numeric + drag synchronization
- Trigger settings in the same main panel
- Warning-based validation engine (includes multi-glitch and safety warnings)
- Verbose Python export with full stubs / params-only toggle and copy button
- Save/load project JSON and undo/redo state history
- Glossary tooltips and one starter template preset
- Unit Converter panel (steps ↔ ns ↔ degrees) and `clk_src` selector (target / pll) in Advanced settings
