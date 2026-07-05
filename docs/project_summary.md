# BEACON Project Summary

## One-line summary

BEACON is a reproducible trustworthy-AI research artifact for calibrated, uncertainty-aware satellite conjunction triage using public CDM data.

## Problem

Satellite operators must prioritize a very small number of potentially high-risk conjunction events from a much larger stream of routine warnings. Because high-risk events are rare, ordinary accuracy is not a meaningful success metric.

## Approach

BEACON evaluates rare-event triage across early, 3-day, 2-day, and 1-day prediction horizons. The project uses leakage-safe event-level splits and compares learned models against direct current-risk ranking.

The pipeline includes:

- event-level horizon preprocessing
- current-risk baseline
- logistic regression, random forest, and gradient boosting
- sigmoid calibration
- Bayesian logistic regression
- bootstrap gradient boosting uncertainty
- human-review escalation analysis
- repeated split robustness evaluation
- current-risk feature ablation

## Key result

Across 20 repeated event-level train/validation/test splits, learned gradient boosting models improve rare-event PR-AUC over direct current-risk ranking at every evaluated horizon.

At the top 10% escalation level, bootstrap uncertainty captures most high-risk events and performs far above random escalation. Current-risk escalation remains very strong, so the intended interpretation is complementary decision support rather than replacement of domain risk estimates.

The current-risk feature ablation is designed to quantify whether learned-model gains come from combining the current `risk` feature with additional CDM/context features or from information available without the current risk estimate.

## Why it matters

BEACON demonstrates how a high-consequence rare-event ML system should be evaluated:

- split by event to avoid leakage
- emphasize PR-AUC and top-K recall instead of accuracy
- report calibration and uncertainty
- compare against realistic domain baselines
- ablate dominant domain features
- repeat event-level splits to reduce single-split sensitivity
- state limitations clearly

## Limitations

BEACON is a research prototype only. It uses public data, contains a small number of positive events, does not recommend maneuvers, has not been operationally validated, and uses a research-defined high-risk threshold.

## Best use

Use BEACON as a portfolio/research artifact demonstrating trustworthy AI evaluation, uncertainty-aware decision support, rare-event modeling, and space-domain ML methodology.
