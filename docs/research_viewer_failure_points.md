# BEACON Viewer Research Failure Points and Guardrails

This document records known research-validity risks in the BEACON interactive viewer and the guardrails added to keep the system honest as a visual analytics artifact.

## Current status

The viewer is a research and communication interface for conjunction-risk triage. It is not an operational orbit propagator, maneuver planner, or collision-avoidance system.

## Failure points addressed

### 1. Probability uncertainty could be mistaken for physical covariance

**Risk:** The BEACON model exports probability-space predictive uncertainty (`predictive_std`), not an orbital covariance matrix. Rendering a 3D volume without explanation could falsely imply a physically rigorous covariance ellipsoid.

**Guardrail:** The viewer now labels the visualization as an uncertainty proxy. The runtime uses an explicit comparative visual mapping:

```text
sigma_proxy_km = 100 + 1800 * predictive_std + 45 * time_to_tca_days
95_percent_visual_envelope_km = 1.96 * sigma_proxy_km
```

This maps forecast uncertainty and horizon distance into a visible envelope for human-AI triage review. It is intentionally described as a visual proxy, not a covariance estimate.

### 2. Display-scaled separations could be read as true geometry

**Risk:** Very small conjunction separations can disappear at Earth scale, so the viewer may scale the displayed separation. Without a visible reminder, a viewer could mistake the display-scaled separation for the original relative distance.

**Guardrail:** The viewer already preserves `relative_distance_km` and `display_relative_scale`; the consistency panel now shows the current display scale and both original/displayed separation when available.

### 3. Geometry can be approximate or fallback-based

**Risk:** The exporter uses the best geometry available in the processed data. If absolute target/secondary positions are missing, it falls back to relative-state, miss-distance, or deterministic reference-orbit approximations. This is useful for interpretability but can look more physically precise than it really is.

**Guardrail:** The viewer now shows the current geometry mode and available geometry modes in the research-validity panel. The top watermark also states whether the current view is exported data or sample/fallback data.

### 4. Missing exported viewer data silently falls back to sample data

**Risk:** The viewer uses sample data when `viewer/data/conjunction_events.json` is missing. That improves demo robustness, but it creates a risk of accidentally using sample screenshots in research material.

**Guardrail:** The consistency module flags sample/fallback data in the UI. Exported pipeline data includes `generated_at_utc`; when that metadata is absent or the event ID is `sample`, the UI shows `sample/fallback`.

### 5. Export controls were duplicated

**Risk:** `live_trails.js` had an older `Export Research Brief` card, while `research_runtime.js` added a newer screenshot/export panel. This made the UI look less deliberate and could confuse which export path was canonical.

**Guardrail:** `research_consistency.js` removes the legacy `briefButton` card at runtime. The canonical export path is now the `Screenshot / Export Mode` card added by `research_runtime.js`.

### 6. PNG export depends on browser/WebGL behavior

**Risk:** Browser canvas export can fail or return a blank image in some WebGL contexts. The current PNG export has a browser-side failure warning, but this should still be tested across Chrome/Edge and local HTTP serving.

**Guardrail:** The viewer also exports JSON and HTML research snapshots. If PNG export is unreliable, the next implementation fix should initialize Cesium with `contextOptions.webgl.preserveDrawingBuffer = true` and verify that performance remains acceptable.

### 7. Runtime architecture is cleaner, but not fully unified

**Risk:** The old hotfix files were removed, but the viewer still has layered behavior: `app.js` owns the base scene, `live_trails.js` owns research overlays, `research_runtime.js` owns consolidated interaction/export behavior, and `research_consistency.js` owns research-validity guardrails.

**Guardrail:** The named modules are now explicit rather than ad hoc hotfixes. The next cleanup should merge `live_trails.js`, `research_runtime.js`, and `research_consistency.js` into a single structured viewer module or split them into intentional files such as `viewer_core.js`, `viewer_research_overlays.js`, and `viewer_exports.js`.

## Paper wording to use

Recommended wording:

> BEACON visualizes model-grounded conjunction triage through a research-only interactive viewer. Uncertainty volumes are probability-space visual proxies derived from predictive uncertainty and forecast horizon; they are not physical covariance ellipsoids or operational maneuver guidance.

Avoid wording such as:

- operational uncertainty ellipsoid
- collision-avoidance recommendation
- maneuver decision
- orbital covariance visualization
- autonomous conjunction resolution

## Remaining engineering tasks

- Add an automated viewer smoke test that checks the required global flags and UI elements.
- Add a data-validity unit test for `viewer/data/conjunction_events.json` after export.
- Add optional `preserveDrawingBuffer` if PNG export fails during manual browser testing.
- Consider moving all viewer modules into a clearer `viewer/src/` structure if the viewer keeps growing.
