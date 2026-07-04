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
- Bayesian-inspired uncertainty estimation
- human-in-the-loop escalation

## Research Questions

**RQ1:** Can lightweight machine learning models predict high-risk satellite conjunction events from public CDM data?

**RQ2:** How does performance change when predictions are made earlier before closest approach?

**RQ3:** Do learned models improve rare-event ranking over direct current-risk ranking?

**RQ4:** Are predicted risk scores calibrated enough to support decision-making?

**RQ5:** Can uncertainty estimates identify predictions that should be escalated for human review?

## Why This Matters

Satellite collision avoidance is a high-consequence decision-support problem. As orbital environments become more congested, operators need tools that can help prioritize attention, identify risky events, and communicate uncertainty clearly.

This project does not attempt to replace operational conjunction assessment systems. Instead, it studies how machine learning models should be evaluated when used in space-safety contexts.

Because high-risk conjunctions are rare, accuracy alone is not a useful measure of success. BEACON focuses on ranking, calibration, top-K recall, and uncertainty-aware escalation.

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
- bootstrap ensemble uncertainty estimation

The current-risk baseline ranks events directly by the CDM-provided current risk estimate. This is an important baseline because the existing risk value is already domain-relevant.

Gradient boosting is evaluated both before and after sigmoid calibration. Calibration is measured using Brier score, Expected Calibration Error, and reliability curves.

For uncertainty estimation, BEACON trains a bootstrap ensemble of gradient boosting models. Predictive standard deviation across ensemble members is used as an uncertainty score. This method is **Bayesian-inspired**, not fully Bayesian, because it estimates uncertainty through model disagreement rather than explicit priors, likelihoods, and posterior inference.

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

Accuracy is not emphasized because the positive class is extremely rare.

## Key Design Rule

Train, validation, and test splits are performed by `event_id`, not by individual CDM row.

This prevents information from the same conjunction event from leaking across splits.

## Reproducing the Pipeline

Run the full BEACON experiment pipeline with:

```bash
python src/run_all.py
