# Experiment Plan

## Title

Trustworthy AI for Satellite Collision Avoidance: Calibration, Risk Ranking, and Uncertainty in Public CDM Data

## Research Questions

RQ1: Can lightweight ML models predict high-risk satellite conjunction events from public CDM data?

RQ2: How does performance change at early-warning horizons before closest approach?

RQ3: Are predicted risk scores calibrated enough to support decision-making?

RQ4: Can models rank the top 1%, 5%, and 10% riskiest events?

RQ5: Can uncertainty estimates identify predictions that should be escalated for human review?

## Core Design Rule

All train, validation, and test splits must be done by event_id, not by individual CDM row, to avoid data leakage.

## Models

- Naive current-risk baseline
- Logistic regression
- Random forest
- Gradient boosting
- Calibrated gradient boosting

## Metrics

- ROC-AUC
- PR-AUC
- Brier score
- Expected Calibration Error
- Precision at top K
- Recall at top K
- Reliability diagrams
