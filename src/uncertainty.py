from pathlib import Path
import warnings

import numpy as np
import pandas as pd

from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline

from train_models import (
    EARLY_HORIZONS,
    evaluate_predictions,
    get_feature_columns,
    make_event_splits,
)


warnings.filterwarnings("ignore")


PROCESSED_DIR = Path("data/processed")
RESULTS_DIR = Path("results")
RESULTS_DIR.mkdir(exist_ok=True)

INPUT_PATH = PROCESSED_DIR / "horizon_snapshots.parquet"

METRICS_OUTPUT_PATH = RESULTS_DIR / "uncertainty_metrics.csv"
ABSTENTION_OUTPUT_PATH = RESULTS_DIR / "uncertainty_abstention.csv"
PREDICTIONS_OUTPUT_PATH = RESULTS_DIR / "uncertainty_predictions.csv"

N_BOOTSTRAPS = 25
RANDOM_SEED = 42

ABSTENTION_FRACTIONS = [0.0, 0.05, 0.10, 0.20, 0.30, 0.50]

EXTRA_EXCLUDE_COLUMNS = {
    "final_time_to_tca",
    "requested_horizon_days",
    "meets_requested_horizon",
    "is_horizon_fallback",
}


def build_gradient_boosting_model(random_state: int) -> Pipeline:
    return Pipeline(
        [
            ("imputer", SimpleImputer(strategy="median")),
            (
                "model",
                HistGradientBoostingClassifier(
                    max_iter=300,
                    learning_rate=0.05,
                    random_state=random_state,
                ),
            ),
        ]
    )


def sanitize_features(df: pd.DataFrame, feature_cols: list[str]) -> tuple[pd.DataFrame, list[str]]:
    df = df.copy()

    feature_cols = [col for col in feature_cols if col not in EXTRA_EXCLUDE_COLUMNS]

    for col in feature_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df[feature_cols] = df[feature_cols].replace([np.inf, -np.inf], np.nan)

    float32_safe_max = 1e30
    df[feature_cols] = df[feature_cols].clip(
        lower=-float32_safe_max,
        upper=float32_safe_max,
        axis=1,
    )

    missing_rate = df[feature_cols].isna().mean()
    feature_cols = [col for col in feature_cols if missing_rate[col] < 0.99]

    nunique = df[feature_cols].nunique(dropna=True)
    feature_cols = [col for col in feature_cols if nunique[col] > 1]

    return df, feature_cols


def fit_bootstrap_ensemble(
    train_df: pd.DataFrame,
    feature_cols: list[str],
    n_bootstraps: int,
    random_seed: int,
) -> list[Pipeline]:
    rng = np.random.default_rng(random_seed)
    models = []
    attempts = 0
    max_attempts = n_bootstraps * 10

    while len(models) < n_bootstraps and attempts < max_attempts:
        attempts += 1

        sample_indices = rng.integers(
            low=0,
            high=len(train_df),
            size=len(train_df),
        )

        sample_df = train_df.iloc[sample_indices].copy()
        y_sample = sample_df["high_risk"].astype(int).to_numpy()

        # Rare-event bootstrap samples can occasionally contain one class only.
        if len(np.unique(y_sample)) < 2:
            continue

        model = build_gradient_boosting_model(
            random_state=random_seed + attempts,
        )

        model.fit(sample_df[feature_cols], y_sample)
        models.append(model)

    if not models:
        raise RuntimeError("Could not fit any bootstrap models.")

    if len(models) < n_bootstraps:
        print(
            f"Warning: fitted only {len(models)} bootstrap models "
            f"out of requested {n_bootstraps}."
        )

    return models


def ensemble_predict(
    models: list[Pipeline],
    x: pd.DataFrame,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    all_predictions = np.vstack(
        [model.predict_proba(x)[:, 1] for model in models]
    )

    mean_probability = all_predictions.mean(axis=0)
    std_probability = all_predictions.std(axis=0)

    return mean_probability, std_probability, all_predictions


def add_metric_row(
    rows: list[dict],
    model_name: str,
    horizon: str,
    split_name: str,
    split_df: pd.DataFrame,
    mean_probability: np.ndarray,
    std_probability: np.ndarray,
    n_models: int,
) -> None:
    y = split_df["high_risk"].astype(int).to_numpy()
    metrics = evaluate_predictions(y, mean_probability)

    rows.append(
        {
            "model": model_name,
            "horizon": horizon,
            "split": split_name,
            "n": len(split_df),
            "positive_rate": float(y.mean()),
            "n_bootstrap_models": n_models,
            "mean_predictive_std": float(np.mean(std_probability)),
            "median_predictive_std": float(np.median(std_probability)),
            "mean_predictive_std_positive": (
                float(np.mean(std_probability[y == 1])) if np.any(y == 1) else np.nan
            ),
            "mean_predictive_std_negative": (
                float(np.mean(std_probability[y == 0])) if np.any(y == 0) else np.nan
            ),
            **metrics,
        }
    )


def abstention_metrics(
    y_true: np.ndarray,
    mean_probability: np.ndarray,
    std_probability: np.ndarray,
    fractions: list[float],
) -> list[dict]:
    rows = []

    y_true = np.asarray(y_true)
    mean_probability = np.asarray(mean_probability)
    std_probability = np.asarray(std_probability)

    uncertainty_order = np.argsort(-std_probability)
    total_positives = int(y_true.sum())

    for fraction in fractions:
        n_escalated = int(np.ceil(len(y_true) * fraction))

        keep_mask = np.ones(len(y_true), dtype=bool)

        if n_escalated > 0:
            escalated_indices = uncertainty_order[:n_escalated]
            keep_mask[escalated_indices] = False
        else:
            escalated_indices = np.array([], dtype=int)

        automated_y = y_true[keep_mask]
        automated_prob = mean_probability[keep_mask]

        escalated_y = y_true[~keep_mask]
        escalated_std = std_probability[~keep_mask]
        automated_std = std_probability[keep_mask]

        if len(automated_y) > 0:
            metrics = evaluate_predictions(automated_y, automated_prob)
            automated_positive_rate = float(automated_y.mean())
            mean_uncertainty_automated = float(np.mean(automated_std))
        else:
            metrics = {
                "roc_auc": np.nan,
                "pr_auc": np.nan,
                "brier_score": np.nan,
                "ece": np.nan,
                "precision_0_5": np.nan,
                "recall_0_5": np.nan,
                "precision_top_1": np.nan,
                "recall_top_1": np.nan,
                "precision_top_5": np.nan,
                "recall_top_5": np.nan,
                "precision_top_10": np.nan,
                "recall_top_10": np.nan,
            }
            automated_positive_rate = np.nan
            mean_uncertainty_automated = np.nan

        positives_escalated = int(escalated_y.sum()) if len(escalated_y) > 0 else 0

        rows.append(
            {
                "escalated_fraction": fraction,
                "coverage_rate": float(keep_mask.mean()),
                "automated_n": int(keep_mask.sum()),
                "escalated_n": int((~keep_mask).sum()),
                "positives_total": total_positives,
                "positives_escalated": positives_escalated,
                "positive_escalation_rate": (
                    float(positives_escalated / total_positives)
                    if total_positives > 0
                    else np.nan
                ),
                "automated_positive_rate": automated_positive_rate,
                "mean_uncertainty_automated": mean_uncertainty_automated,
                "mean_uncertainty_escalated": (
                    float(np.mean(escalated_std)) if len(escalated_std) > 0 else np.nan
                ),
                **metrics,
            }
        )

    return rows


def prediction_rows(
    split_df: pd.DataFrame,
    horizon: str,
    split_name: str,
    mean_probability: np.ndarray,
    std_probability: np.ndarray,
) -> list[dict]:
    rows = []

    y = split_df["high_risk"].astype(int).to_numpy()

    for event_id, y_true, mean_prob, std_prob in zip(
        split_df["event_id"].astype(str),
        y,
        mean_probability,
        std_probability,
    ):
        rows.append(
            {
                "event_id": event_id,
                "horizon": horizon,
                "split": split_name,
                "high_risk": int(y_true),
                "mean_probability": float(mean_prob),
                "predictive_std": float(std_prob),
            }
        )

    return rows


def main() -> None:
    if not INPUT_PATH.exists():
        raise FileNotFoundError(
            f"Missing {INPUT_PATH}. Run python src/preprocess.py first."
        )

    df = pd.read_parquet(INPUT_PATH)

    required = {"event_id", "horizon", "high_risk"}
    missing = required - set(df.columns)

    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    df["event_id"] = df["event_id"].astype(str)
    df = df[df["horizon"].isin(EARLY_HORIZONS)].copy()
    df = df.replace([np.inf, -np.inf], np.nan)

    df = make_event_splits(df)

    feature_cols = get_feature_columns(df)
    df, feature_cols = sanitize_features(df, feature_cols)

    print("Uncertainty feature columns:")
    for col in feature_cols:
        print(f"- {col}")

    metrics_rows = []
    abstention_rows = []
    all_prediction_rows = []

    for horizon_index, horizon in enumerate(EARLY_HORIZONS):
        horizon_df = df[df["horizon"] == horizon].copy()

        if horizon_df.empty:
            print(f"\n=== Horizon: {horizon} ===")
            print("No rows found. Skipping.")
            continue

        train_df = horizon_df[horizon_df["split"] == "train"]
        val_df = horizon_df[horizon_df["split"] == "validation"]
        test_df = horizon_df[horizon_df["split"] == "test"]

        print(f"\n=== Horizon: {horizon} ===")
        print(f"Train rows: {len(train_df):,}")
        print(f"Validation rows: {len(val_df):,}")
        print(f"Test rows: {len(test_df):,}")
        print(f"Training bootstrap ensemble with {N_BOOTSTRAPS} models...")

        models = fit_bootstrap_ensemble(
            train_df=train_df,
            feature_cols=feature_cols,
            n_bootstraps=N_BOOTSTRAPS,
            random_seed=RANDOM_SEED + horizon_index * 1000,
        )

        split_lookup = {
            "validation": val_df,
            "test": test_df,
        }

        for split_name, split_df in split_lookup.items():
            x = split_df[feature_cols]
            y = split_df["high_risk"].astype(int).to_numpy()

            mean_probability, std_probability, _ = ensemble_predict(models, x)

            add_metric_row(
                rows=metrics_rows,
                model_name="bootstrap_gradient_boosting_ensemble",
                horizon=horizon,
                split_name=split_name,
                split_df=split_df,
                mean_probability=mean_probability,
                std_probability=std_probability,
                n_models=len(models),
            )

            for row in abstention_metrics(
                y_true=y,
                mean_probability=mean_probability,
                std_probability=std_probability,
                fractions=ABSTENTION_FRACTIONS,
            ):
                row["model"] = "bootstrap_gradient_boosting_ensemble"
                row["horizon"] = horizon
                row["split"] = split_name
                abstention_rows.append(row)

            all_prediction_rows.extend(
                prediction_rows(
                    split_df=split_df,
                    horizon=horizon,
                    split_name=split_name,
                    mean_probability=mean_probability,
                    std_probability=std_probability,
                )
            )

    metrics_df = pd.DataFrame(metrics_rows)
    abstention_df = pd.DataFrame(abstention_rows)
    predictions_df = pd.DataFrame(all_prediction_rows)

    metrics_df.to_csv(METRICS_OUTPUT_PATH, index=False)
    abstention_df.to_csv(ABSTENTION_OUTPUT_PATH, index=False)
    predictions_df.to_csv(PREDICTIONS_OUTPUT_PATH, index=False)

    print("\nWrote:")
    print(METRICS_OUTPUT_PATH)
    print(ABSTENTION_OUTPUT_PATH)
    print(PREDICTIONS_OUTPUT_PATH)

    print("\nUncertainty test metrics:")
    print(
        metrics_df[metrics_df["split"] == "test"]
        .sort_values(["horizon", "pr_auc"], ascending=[True, False])
        .to_string(index=False)
    )

    print("\nUncertainty abstention test summary:")
    print(
        abstention_df[
            (abstention_df["split"] == "test")
            & (abstention_df["escalated_fraction"].isin([0.0, 0.10, 0.20, 0.30]))
        ][
            [
                "horizon",
                "escalated_fraction",
                "coverage_rate",
                "positives_total",
                "positives_escalated",
                "positive_escalation_rate",
                "pr_auc",
                "brier_score",
                "ece",
            ]
        ]
        .sort_values(["horizon", "escalated_fraction"])
        .to_string(index=False)
    )


if __name__ == "__main__":
    main()