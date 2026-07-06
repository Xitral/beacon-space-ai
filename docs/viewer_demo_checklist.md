# BEACON Viewer Demo and Export Checklist

This checklist documents the demo and export checks used to keep viewer screenshots and exported research snapshots consistent with BEACON's research-only framing.

## Clean local export

From the repository root:

```powershell
python -m pytest -q
python src/export_orbit_viewer.py
cd viewer
python -m http.server 8000
```

Open:

```text
http://localhost:8000
```

Hard refresh the browser with `Ctrl+F5`.

## Browser smoke test

In DevTools Console:

```javascript
runBeaconViewerSmokeTest()
```

Expected result:

```javascript
{ pass: true, failed: [], results: [...] }
```

The smoke test checks that:

- Cesium loaded and the viewer was created.
- WebGL drawing-buffer preservation is configured for PNG export.
- `research_runtime.js` and `research_consistency.js` loaded.
- The event/horizon controls, metrics panel, guardrails card, uncertainty panel, and export buttons exist.
- Only one canonical `Screenshot / Export Mode` card exists.
- No removed hotfix scripts are loaded.
- The current event has valid snapshot and geometry fields.
- The viewer shows research-only / not-operational guardrails.

## Interaction QA path

The manual interaction check covers:

1. Confirm the top watermark says either `Research-only viewer` or `Sample/fallback data` and includes `Not operational`.
2. Confirm the `Research Validity Guardrails` card shows data source, geometry mode, available modes, and display scale.
3. Click `Focus event`.
4. Left-click drag the globe/viewer and confirm rotation pivots around the selected event.
5. Scrub the horizon timeline.
6. Confirm `Play horizons` pauses if the scrubber is used.
7. With `Track selected event` enabled, scrub or play horizons and confirm left-click rotation remains centered on the moving event.
8. Disable `Track selected event`, switch events, and confirm the camera does not unexpectedly refocus.
9. Re-enable tracking and click `Focus event`.
10. Toggle `Figure mode`, then exit figure mode.

## Export QA path

The `Screenshot / Export Mode` card provides three export checks:

1. `Export JSON`
   - Expected JSON fields: `export_type`, `event_id`, `horizon`, `uncertainty_visualization`, and `snapshot`.
2. `Research HTML`
   - Expected HTML content: event, horizon, model probability, predictive std, uncertainty proxy formula, and research-only warning.
3. `Export PNG`
   - Expected result: the PNG is not blank.
   - If the PNG is blank, hard refresh and check whether `runBeaconViewerSmokeTest()` reports `Preserve drawing buffer configured` as passing.

## Demo story

A polished demo follows this order:

1. Start on the event queue / selected event.
2. Point out the research-only watermark and validity guardrails.
3. Click `Focus event`.
4. Scrub across `early`, `3d`, `2d`, and `1d`.
5. Explain that the uncertainty volumes are probability-space visual proxies, not orbital covariance ellipsoids.
6. Show that original separation is preserved even when display separation is scaled.
7. Export JSON or PNG as the final artifact.

## Preferred language

```text
Research-only visual analytics viewer
Model-grounded conjunction triage inspection
Uncertainty proxy volume
Display-scaled separation for visibility
Not an operational maneuver recommendation
```

## Unsupported language

```text
Operational collision avoidance system
Autonomous maneuver recommendation
Physical covariance ellipsoid
Guaranteed collision prediction
```
