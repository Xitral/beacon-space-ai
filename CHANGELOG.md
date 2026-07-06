# Changelog

All notable project changes are documented here.

## v0.3.0-rc1 - 2026-07-05

Release-candidate status: pending local validation in `docs/release_validation_v0.3.0.md`.

### Added

- Interactive visual analytics framing in `paper/main.md` and `paper/main.tex`, including RQ8 and an explicit viewer methods section.
- Viewer screenshot/export mode for PNG, JSON, and HTML research snapshots.
- Research-validity guardrails for uncertainty proxies, display-scaled separations, fallback/sample data, geometry mode, and non-operational constraints.
- Explicit probability-space uncertainty-proxy formula in the viewer and paper.
- Viewer export data generation as part of the full `src/run_all.py` pipeline.
- `viewer/export_config.js` to configure WebGL drawing-buffer preservation for more reliable PNG export.
- `viewer/viewer_smoke_test.js` browser-console helper through `runBeaconViewerSmokeTest()`.
- `REPRODUCIBILITY.md` with environment, data, commands, expected outputs, viewer checks, paper build, and caveats.
- `docs/viewer_demo_checklist.md` for manual viewer QA and demo/export flow.
- `docs/research_viewer_failure_points.md` documenting viewer research-validity risks and mitigations.
- `docs/release_validation_v0.3.0.md` for final release-candidate validation outputs.
- `docs/release_notes_v0.3.0.md` draft release notes.
- `docs/reviewer_summary_v0.3.0.md` reviewer-facing two-page summary.
- Tests for model split leakage, feature contracts, rare-event metrics, viewer export schema, viewer static contracts, export helper loading, and optional raw test-file inspection.

### Changed

- Consolidated replaced viewer runtime patches into named viewer modules.
- Removed duplicated export controls by standardizing on the `Screenshot / Export Mode` card.
- Updated README viewer instructions with smoke-test and export-mode validation.
- Made raw test-data inspection optional so the documented training-only setup does not fail during inspection.
- Declared `scipy` explicitly in `requirements.txt` for Bayesian logistic regression.
- Changed the current and future source-code license to Apache License 2.0; earlier archived Zenodo versions remain under their published MIT terms.

### Notes

- `CITATION.cff` still points to the archived v0.2.2 Zenodo version DOI until a final v0.3.0 archive is minted.
- BEACON remains a research prototype only and is not an operational space-safety system.
- Viewer uncertainty volumes are visual proxies, not orbital covariance ellipsoids.
- Viewer geometry is for interpretation and communication, not operational propagation.
- Raw data is not committed to the repository.

## v0.2.2 - 2026-07-05

### Added

- Current-risk feature ablation experiment comparing direct current-risk ranking, gradient boosting with current risk, and gradient boosting without risk.
- Risk ablation summary, delta outputs, figures, pipeline integration, and synthetic delta tests.

## v0.1.0 - 2026-07-04

Initial reproducible research artifact release of BEACON.

### Added

- Leakage-safe event-level preprocessing by `event_id`.
- Early, 3-day, 2-day, 1-day, and final horizon snapshot construction.
- Post-TCA selected-row diagnostics.
- Current-risk baseline, logistic regression, random forest, and gradient boosting models.
- Sigmoid calibration and reliability diagnostics.
- Quantile-binned reliability curves for rare-event calibration analysis.
- Laplace-approximated Bayesian logistic regression baseline.
- Bootstrap gradient boosting uncertainty estimation.
- Uncertainty-based human-review escalation analysis.
- Repeated event-level split robustness evaluation.
- Repeated-split PR-AUC, top-5% recall, and 10% escalation figures.
- One-command pipeline runner through `src/run_all.py`.
- Synthetic pytest suite for split leakage, feature exclusion, metrics, and preprocessing behavior.
- GitHub Actions CI workflow.
- Technical report draft in `paper/main.md`.
- Data reproduction notes in `data/README.md`.

### Notes

- BEACON is a research prototype only and is not an operational space-safety system.
- Raw data is not committed to the repository.
- Public results should be interpreted as preliminary rare-event decision-support evidence, not deployment-ready validation.
