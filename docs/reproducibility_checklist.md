# Reproducibility Checklist

This checklist describes what a reviewer should be able to verify after cloning the repository.

## Environment

- [ ] Python 3.10 is available.
- [ ] Dependencies install successfully with `python -m pip install -r requirements.txt`.
- [ ] The synthetic test suite passes with `pytest -q`.
- [ ] GitHub Actions CI passes on the default branch.

## Data

- [ ] Raw data is intentionally not committed.
- [ ] `data/README.md` explains where raw data should be placed.
- [ ] The raw training file is available under `data/raw/` with `train` in the filename.
- [ ] The raw file includes `event_id`, `time_to_tca`, and `risk`.
- [ ] Dataset citation and provider terms are acknowledged.

## Preprocessing

- [ ] `python src/preprocess.py` writes `data/processed/event_labels.csv`.
- [ ] `python src/preprocess.py` writes `data/processed/horizon_snapshots.parquet`.
- [ ] `python src/preprocess.py` writes `results/horizon_post_tca_diagnostics.csv`.
- [ ] Horizon snapshots are grouped by event and include early, 3d, 2d, 1d, and final rows.
- [ ] Final-risk label metadata is separated from prediction features.

## Leakage Safety

- [ ] Train, validation, and test splits are made by `event_id`.
- [ ] No `event_id` appears in more than one split.
- [ ] `final_risk`, `final_time_to_tca`, and diagnostic metadata are excluded from model features.
- [ ] Tests cover event-level split isolation and feature exclusion.

## Modeling

- [ ] `python src/train_models.py` writes `results/baseline_metrics.csv`.
- [ ] `python src/calibrate_models.py` writes calibration metrics and reliability curves.
- [ ] `python src/bayesian_logistic.py` writes Bayesian logistic metrics and predictions.
- [ ] `python src/uncertainty.py` writes uncertainty metrics, abstention results, and predictions.
- [ ] `python src/repeated_splits.py` writes repeated split metrics and summaries.

## Figures and Reporting

- [ ] `python src/make_figures.py` writes all paper figures.
- [ ] Repeated split figures are generated from repeated split summary files.
- [ ] `paper/main.md` references generated figures correctly.
- [ ] README findings match repeated split summary values.

## One-Command Pipeline

- [ ] `python src/run_all.py --skip-inspect` completes on a configured machine.
- [ ] For a quick smoke run, repeated split settings can be reduced through `run_all.py`.
- [ ] The pipeline output summary reports expected outputs.

## Interpretation Guardrails

- [ ] Results are framed as rare-event triage, not ordinary accuracy maximization.
- [ ] Uncertainty escalation is described as a human-review signal, not an automated action rule.
- [ ] Current-risk escalation is treated as a strong comparator.
- [ ] Limitations mention public data, small positive counts, lack of operational validation, and the research-defined threshold.
