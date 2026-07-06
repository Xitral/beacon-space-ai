# BEACON

[![CI](https://github.com/Xitral/beacon-space-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/Xitral/beacon-space-ai/actions/workflows/ci.yml)
[![LaTeX Paper](https://github.com/Xitral/beacon-space-ai/actions/workflows/latex.yml/badge.svg)](https://github.com/Xitral/beacon-space-ai/actions/workflows/latex.yml)
[![Version DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.21209794.svg)](https://doi.org/10.5281/zenodo.21209794)
[![Concept DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.21209119.svg)](https://doi.org/10.5281/zenodo.21209119)
![Python](https://img.shields.io/badge/python-3.10-blue)
![License](https://img.shields.io/badge/license-Apache--2.0-green)
![Status](https://img.shields.io/badge/status-research%20prototype-orange)
![Release Candidate](https://img.shields.io/badge/release%20candidate-v0.3.0--rc1-purple)

**BEACON (Bayesian Event Assessment for Conjunction Observation and Notification)** is a reproducible research project for calibrated, uncertainty-aware satellite conjunction triage using public CDM data.

BEACON is a research prototype only, not an operational system.

**Current development version:** `v0.3.0-rc1`. The latest archived reproducible artifact is `v0.2.2`; `v0.3.0-rc1` is a release candidate and does not yet have a final Zenodo version DOI.

## Citation and Archived Release

```text
Version DOI: 10.5281/zenodo.21209794
Concept DOI: 10.5281/zenodo.21209119
Archived version: v0.2.2
Current release candidate: v0.3.0-rc1
Repository: https://github.com/Xitral/beacon-space-ai
```

Use the version DOI to cite the exact v0.2.2 artifact used for reproducibility. Use the concept DOI to cite the overall BEACON archive across versions. If you use BEACON, also cite the original public dataset provider.

## License

BEACON source code on the current `main` branch is released under the Apache License 2.0. See [LICENSE](LICENSE) for details.

Licensing note: BEACON versions prior to `v0.3.0-rc1`, including the archived `v0.2.2` Zenodo version DOI listed above, were released under the MIT License. Beginning with `v0.3.0-rc1` and future releases, BEACON source code is released under the Apache License 2.0.

Documentation, figures, research materials, and demo scenarios are licensed under CC BY 4.0 unless otherwise noted. BEACON names, logos, and brand assets are not open-licensed unless explicitly marked.

## Research Focus

BEACON evaluates rare-event ranking, probability calibration, uncertainty-aware human review, repeated split robustness, current-risk feature ablation, leakage-safe evaluation, and interactive visual analytics for model-grounded triage inspection.

## Reproducibility

```bash
python -m pip install -r requirements.txt
python src/run_all.py
python -m pytest -q
```

Raw challenge data is not committed to the repository. See `data/README.md` for expected filenames and required columns.

## Documentation

- `REPRODUCIBILITY.md` defines the environment, commands, expected outputs, expected metric ranges, viewer checks, paper build steps, and caveats.
- `docs/release_validation_v0.3.0.md` records the current release-candidate validation status.
- `docs/release_notes_v0.3.0.md` contains draft release notes.
- `docs/reviewer_summary_v0.3.0.md` provides a short reviewer-facing summary.
- `docs/viewer_demo_checklist.md` provides manual viewer QA and export validation steps.

## Paper

The manuscript source is available in `paper/main.md` and `paper/main.tex`.
