# BEACON

**BEACON (Bayesian Event Assessment for Conjunction Observation and Notification)** is a reproducible research project focused on calibrated, probabilistic, and uncertainty-aware risk prediction for satellite conjunction assessment using public CDM data.

The goal is to study how machine learning can support safer space operations by producing predictions that are not only accurate, but also calibrated, uncertainty-aware, and useful for prioritizing rare high-risk events.

BEACON is a research prototype only. It is not an operational collision-avoidance system and should not be used for real-world satellite operations.

## Research Direction

This project explores **trustworthy AI for space operations**, especially:

- satellite conjunction risk prediction
- calibrated machine learning
- uncertainty-aware decision support
- rare-event prioritization
- space-domain safety and resilience
- Bayesian logistic regression
- Bayesian-inspired uncertainty estimation
- human-in-the-loop escalation
- repeated split robustness evaluation

## Research Questions

**RQ1:** Can lightweight machine learning models predict high-risk satellite conjunction events from public CDM data?

**RQ2:** How does performance change when predictions are made earlier before closest approach?

**RQ3:** Do learned models improve rare-event ranking over direct current-risk ranking?

**RQ4:** Are predicted risk scores calibrated enough to support decision-making?

**RQ5:** Can uncertainty estimates identify predictions that should be escalated for human review?

## Why This Matters

Satellite collision avoidance is a high-consequence decision-support problem. As orbital environments become more congested, operators need tools that can help prioritize attention, identify risky events, and communicate uncertainty clearly.

This project does not attempt to replace operational conjunction assessment systems. Instead, it studies how machine learning models should be evaluated when used in space-safety contexts.

Because high-risk conjunctions are rare, accuracy alone is not a useful measure of success. BEACON focuses on ranking, calibration, top-K recall, uncertainty-aware escalation, and robustness across repeated event-level splits.

## Task Definition

The dataset consists of public conjunction data messages grouped by event.

Each event may contain multiple CDM observations before time of closest approach, or TCA.

BEACON defines a high-risk event using the final available event risk. An event is labeled high-risk if its final log10 risk is greater than or equal to `-5`, corresponding to a collision probability threshold of `10^-5`.

The resulting prediction task is highly imbalanced, with high-risk events making up less than 1% of the event-level dataset.

## Prediction Horizons

BEACON evaluates event snapshots at four warning horizons:

| Horizon | Definition |
|---|---|
| `early` | earliest available CDM for each event |
| `3d` | closest available CDM at least 3 days before TCA |
| `2d` | closest available CDM at least 2 days before TCA |
| `1d` | closest available CDM at least 1 day before TCA |

The original project direction considered a 7-day horizon, but the dataset did not support a reliable true 7-day snapshot for every event. The `early` horizon is used instead to honestly represent the earliest available observation for each event.

## Methods

The project compares several models and evaluation approaches:

- current-risk baseline
- logistic regression
- random forest
- gradient boosting
- sigmoid-calibrated gradient boosting
- Laplace-approximated Bayesian logistic regression
- bootstrap ensemble uncertainty estimation
- repeated event-level split robustness evaluation

The current-risk baseline ranks events directly by the CDM-provided current risk estimate. This is an important baseline because the existing risk value is already domain-relevant.

Gradient boosting is evaluated both before and after sigmoid calibration. Calibration is measured using Brier score, Expected Calibration Error, and reliability curves.

BEACON includes a true Bayesian logistic regression baseline using a Gaussian prior, Bernoulli likelihood, MAP estimation, and a Laplace posterior approximation.

For uncertainty estimation, BEACON trains a bootstrap ensemble of gradient boosting models. Predictive standard deviation across ensemble members is used as an uncertainty score. This method is **Bayesian-inspired** because it estimates uncertainty through model disagreement rather than full posterior inference over the gradient boosting model.

To address split sensitivity in the rare-event setting, BEACON also runs repeated event-level splits and reports mean and standard deviation across splits.

## Evaluation Metrics

The project reports:

- ROC-AUC
- PR-AUC
- Brier score
- Expected Calibration Error
- precision at top 1%, 5%, and 10%
- recall at top 1%, 5%, and 10%
- reliability diagrams
- quantile-binned reliability curves
- early-warning horizon performance
- uncertainty-abstention analysis
- positive escalation rate under uncertainty-based review
- repeated split mean and standard deviation

Accuracy is not emphasized because the positive class is extremely rare.

## Key Design Rule

Train, validation, and test splits are performed by `event_id`, not by individual CDM row.

This prevents information from the same conjunction event from leaking across splits.

## Reproducing the Pipeline

Run the full BEACON experiment pipeline with:

```bash
python src/run_all.py
```

This runs:

1. raw data inspection
2. horizon preprocessing
3. horizon coverage diagnostics
4. baseline model training
5. model calibration
6. Bayesian logistic regression
7. uncertainty estimation
8. repeated split robustness evaluation
9. figure and summary table generation

Optional commands:

```bash
python src/run_all.py --skip-inspect
```

```bash
python src/run_all.py --skip-uncertainty
```

```bash
python src/run_all.py --skip-repeated-splits
```

```bash
python src/run_all.py --continue-on-error
```

Individual scripts can also be run manually:

```bash
python src/inspect_data.py
python src/preprocess.py
python src/check_horizon_coverage.py
python src/train_models.py
python src/calibrate_models.py
python src/bayesian_logistic.py
python src/uncertainty.py
python src/repeated_splits.py
python src/make_figures.py
```

## Repository Structure

```text
trustworthy-space-ai/
  README.md
  LICENSE
  .gitignore
  requirements.txt

  docs/
    experiment_plan.md

  paper/
    main.md

  notebooks/
    exploratory_analysis.ipynb

  src/
    inspect_data.py
    preprocess.py
    check_horizon_coverage.py
    train_models.py
    calibrate_models.py
    bayesian_logistic.py
    uncertainty.py
    repeated_splits.py
    make_figures.py
    run_all.py

  data/
    README.md
    raw/
      .gitkeep
    processed/
      event_labels.csv
      horizon_snapshots.parquet

  results/
    horizon_coverage.csv
    baseline_metrics.csv
    calibration_metrics.csv
    calibration_curves.csv
    calibration_curves_quantile.csv
    bayesian_logistic_metrics.csv
    bayesian_logistic_predictions.csv
    uncertainty_metrics.csv
    uncertainty_abstention.csv
    uncertainty_predictions.csv
    repeated_split_metrics.csv
    repeated_split_summary.csv
    repeated_split_escalation.csv
    repeated_split_escalation_summary.csv
    baseline_test_summary.csv
    calibration_test_summary.csv
    uncertainty_test_summary.csv
    uncertainty_abstention_test_summary.csv

  figures/
    pr_auc_by_horizon.png
    top5_recall_by_horizon.png
    brier_score_by_horizon.png
    ece_by_horizon.png
    quantile_reliability_by_horizon.png
    quantile_reliability_comparison_1d.png
    horizon_timing.png
    horizon_coverage.png
    uncertainty_positive_vs_negative.png
    positive_escalation_rate.png
    uncertainty_abstention_coverage.png
```

Some generated files may be excluded from version control depending on repository settings and data-size constraints. The pipeline is designed to regenerate processed data, results, and figures from the raw dataset.

## Key Outputs

Processed data:

- `data/processed/event_labels.csv`
- `data/processed/horizon_snapshots.parquet`

Results:

- `results/horizon_coverage.csv`
- `results/baseline_metrics.csv`
- `results/calibration_metrics.csv`
- `results/calibration_curves.csv`
- `results/calibration_curves_quantile.csv`
- `results/bayesian_logistic_metrics.csv`
- `results/bayesian_logistic_predictions.csv`
- `results/uncertainty_metrics.csv`
- `results/uncertainty_abstention.csv`
- `results/uncertainty_predictions.csv`
- `results/repeated_split_metrics.csv`
- `results/repeated_split_summary.csv`
- `results/repeated_split_escalation.csv`
- `results/repeated_split_escalation_summary.csv`
- `results/baseline_test_summary.csv`
- `results/calibration_test_summary.csv`
- `results/uncertainty_test_summary.csv`
- `results/uncertainty_abstention_test_summary.csv`

Figures:

- `figures/pr_auc_by_horizon.png`
- `figures/top5_recall_by_horizon.png`
- `figures/brier_score_by_horizon.png`
- `figures/ece_by_horizon.png`
- `figures/quantile_reliability_by_horizon.png`
- `figures/quantile_reliability_comparison_1d.png`
- `figures/horizon_timing.png`
- `figures/horizon_coverage.png`
- `figures/uncertainty_positive_vs_negative.png`
- `figures/positive_escalation_rate.png`
- `figures/uncertainty_abstention_coverage.png`

## Preliminary Findings

Current results suggest:

- learned models can improve rare-event ranking over direct current-risk ranking at several horizons
- gradient boosting is a strong lightweight triage model
- sigmoid calibration improves probability quality while preserving ranking performance
- quantile-binned reliability curves are more informative than linear-bin curves in this rare-event setting
- Bayesian logistic regression provides a true Bayesian probabilistic baseline
- bootstrap ensemble uncertainty is concentrated on high-risk events
- escalating the most uncertain predictions captures many high-risk events in the held-out test split
- repeated split evaluation is needed because the number of high-risk test events is small

These findings are preliminary because the number of high-risk events is small and split sensitivity matters.

## Technical Report

The main technical report draft is available at:

```text
paper/main.md
```

It describes the task, methods, results, figures, limitations, and future work.

## Project Status

This repository is an active independent research project.

Current status:

- preprocessing pipeline implemented
- event-level splits implemented
- horizon coverage diagnostics implemented
- baseline models implemented
- calibration experiments implemented
- quantile reliability curves implemented
- Bayesian logistic regression baseline implemented
- bootstrap uncertainty estimation implemented
- uncertainty escalation analysis implemented
- repeated split robustness evaluation implemented
- figure generation implemented
- technical report draft started
- one-command reproducibility pipeline added

## Limitations

BEACON is a research prototype only. It is not an operational collision-avoidance system, does not recommend maneuvers, and should not be used for real-world satellite operations.

Important limitations include:

- public dataset only
- small number of positive test events
- no maneuver recommendation
- no operational validation
- research-defined high-risk threshold
- Bayesian-inspired bootstrap uncertainty rather than full Bayesian inference over the strongest model
- possible variation under repeated event splits

Future work should include more repeated split evaluation, true Bayesian nonlinear models, cost-sensitive decision metrics, external validation, and operationally informed escalation policies.

## License

Code in this repository is released under the MIT License. Dataset use is governed by the original dataset provider's license and terms.
