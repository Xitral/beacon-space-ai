from pathlib import Path
import warnings

import numpy as np
import pandas as pd

from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
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

METRICS_OUTPUT_PATH = RESULTS_DIR / "calibration_metrics.csv"
CURVES_OUTPUT_PATH = RESULTS_DIR / "calibration_curves.csv"
QUANTILE_CURVES_OUTPUT_PATH = RESULTS_DIR / "calibration_curves_quantile.csv"

EXTRA_EXCLUDE_COLUMNS = {
    "final_time_to_tca",
    "requested_horizon_days",
    "meets_requested_horizon",
    "is_horizon_fallback",
}


def build_gradient_boosting_model() -> Pipeline:
    return Pipeline(
        [
            ("imputer", SimpleImputer(strategy="median")),
            (
                "model",
                HistGradientBoostingClassifier(
                    max_iter=300,
                    learning_rate=0.05,
                    random_state=42,
                ),
            ),
        ]
    )


class ManualSigmoidCalibrator:
    """
    Fallback Platt-style sigmoid calibrator.

    This wraps a fitted model, converts its raw probabilities to log-odds,
    then fits a logistic regression calibrator on validation data.
    """

    def __init__(self, fitted_model):
        self.fitted_model = fitted_model
        self.calibrator = LogisticRegression(max_iter=1000)

    @staticmethod
    def _logit(probabilities: np.ndarray) -> np.ndarray:
        probabilities = np.asarray(probabilities)
        probabilities = np.clip(probabilities, 1e-12, 1 - 1e-12)
        return np.log(probabilities / (1 - probabilities)).reshape(-1, 1)

    def fit(self, x_cal, y_cal):
        raw_prob = self.fitted_model.predict_proba(x_cal)[:, 1]
        self.calibrator.fit(self._logit(raw_prob), y_cal)
        return self

    def predict_proba(self, x):
        raw_prob = self.fitted_model.predict_proba(x)[:, 1]
        calibrated_prob = self.calibrator.predict_proba(self._logit(raw_prob))[:, 1]

        return np.column_stack([1 - calibrated_prob, calibrated_prob])


def fit_sigmoid_calibrator(fitted_model, x_cal, y_cal):
    """
    Prefer sklearn's CalibratedClassifierCV. Fall back to a manual sigmoid
    calibrator if the installed sklearn version handles prefit calibration
    differently.
    """

    try:
        from sklearn.frozen import FrozenEstimator

        calibrated_model = CalibratedClassifierCV(
            estimator=FrozenEstimator(fitted_model),
            method="sigmoid",
        )
        calibrated_model.fit(x_cal, y_cal)
        return calibrated_model

    except Exception:
        pass

    try:
        calibrated_model = CalibratedClassifierCV(
            estimator=fitted_model,
            method="sigmoid",
            cv="prefit",
        )
        calibrated_model.fit(x_cal, y_cal)
        return calibrated_model

    except Exception:
        calibrated_model = ManualSigmoidCalibrator(fitted_model)
        calibrated_model.fit(x_cal, y_cal)
        return calibrated_model


def current_risk_probability(split_df: pd.DataFrame) -> np.ndarray:
    risk_log10 = pd.to_numeric(split_df["risk"], errors="coerce")
    risk_log10 = risk_log10.replace([np.inf, -np.inf], np.nan)
    risk_log10 = risk_log10.fillna(risk_log10.median())
    risk_log10 = risk_log10.clip(lower=-30, upper=0)

    return np.power(10.0, risk_log10.to_numpy())


def calibration_curve_rows(
    y_true,
    y_prob,
    model_name: str,
    horizon: str,
    split: str,
    n_bins: int = 10,
):
    y_true = np.asarray(y_true)
    y_prob = np.asarray(y_prob)

    bins = np.linspace(0.0, 1.0, n_bins + 1)
    rows = []

    for bin_id, (left, right) in enumerate(zip(bins[:-1], bins[1:])):
        in_bin = (y_prob >= left) & (y_prob < right)

        if right == 1.0:
            in_bin = (y_prob >= left) & (y_prob <= right)

        count = int(in_bin.sum())

        if count == 0:
            mean_predicted_probability = np.nan
            observed_positive_rate = np.nan
        else:
            mean_predicted_probability = float(y_prob[in_bin].mean())
            observed_positive_rate = float(y_true[in_bin].mean())

        rows.append(
            {
                "model": model_name,
                "horizon": horizon,
                "split": split,
                "bin_id": bin_id,
                "bin_left": left,
                "bin_right": right,
                "count": count,
                "mean_predicted_probability": mean_predicted_probability,
                "observed_positive_rate": observed_positive_rate,
            }
        )

    return rows

def quantile_calibration_curve_rows(
    y_true,
    y_prob,
    model_name: str,
    horizon: str,
    split: str,
    n_bins: int = 10,
):
    """
    Calibration curve using equal-count bins.

    This is better for rare-event settings because linear bins often place
    almost every prediction into the lowest probability bin.
    """
    y_true = np.asarray(y_true)
    y_prob = np.asarray(y_prob)

    if len(y_prob) == 0:
        return []

    order = np.argsort(y_prob)
    y_true_sorted = y_true[order]
    y_prob_sorted = y_prob[order]

    index_bins = np.array_split(np.arange(len(y_prob_sorted)), n_bins)

    rows = []

    for bin_id, indices in enumerate(index_bins):
        if len(indices) == 0:
            rows.append(
                {
                    "model": model_name,
                    "horizon": horizon,
                    "split": split,
                    "bin_id": bin_id,
                    "bin_type": "quantile",
                    "count": 0,
                    "min_predicted_probability": np.nan,
                    "max_predicted_probability": np.nan,
                    "mean_predicted_probability": np.nan,
                    "observed_positive_rate": np.nan,
                }
            )
            continue

        bin_probs = y_prob_sorted[indices]
        bin_true = y_true_sorted[indices]

        rows.append(
            {
                "model": model_name,
                "horizon": horizon,
                "split": split,
                "bin_id": bin_id,
                "bin_type": "quantile",
                "count": int(len(indices)),
                "min_predicted_probability": float(np.min(bin_probs)),
                "max_predicted_probability": float(np.max(bin_probs)),
                "mean_predicted_probability": float(np.mean(bin_probs)),
                "observed_positive_rate": float(np.mean(bin_true)),
            }
        )

    return rows


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


def add_metrics_row(rows, model_name, horizon, split_name, split_df, y_prob):
    y = split_df["high_risk"].astype(int).to_numpy()
    metrics = evaluate_predictions(y, y_prob)

    rows.append(
        {
            "model": model_name,
            "horizon": horizon,
            "split": split_name,
            "n": len(split_df),
            "positive_rate": float(y.mean()),
            **metrics,
        }
    )


def main() -> None:
    if not INPUT_PATH.exists():
        raise FileNotFoundError(
            f"Missing {INPUT_PATH}. Run python src/preprocess.py first."
        )

    df = pd.read_parquet(INPUT_PATH)

    required = {"event_id", "horizon", "high_risk", "risk"}
    missing = required - set(df.columns)

    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    df["event_id"] = df["event_id"].astype(str)
    df = df[df["horizon"].isin(EARLY_HORIZONS)].copy()
    df = df.replace([np.inf, -np.inf], np.nan)

    df = make_event_splits(df)

    feature_cols = get_feature_columns(df)
    df, feature_cols = sanitize_features(df, feature_cols)

    print("Calibration feature columns:")
    for col in feature_cols:
        print(f"- {col}")

    metrics_rows = []
    curve_rows = []
    quantile_curve_rows = []

    for horizon in EARLY_HORIZONS:
        horizon_df = df[df["horizon"] == horizon].copy()

        if horizon_df.empty:
            print(f"\n=== Horizon: {horizon} ===")
            print("No rows found. Skipping.")
            continue

        train_df = horizon_df[horizon_df["split"] == "train"]
        val_df = horizon_df[horizon_df["split"] == "validation"]
        test_df = horizon_df[horizon_df["split"] == "test"]

        x_train = train_df[feature_cols]
        y_train = train_df["high_risk"].astype(int).to_numpy()

        x_val = val_df[feature_cols]
        y_val = val_df["high_risk"].astype(int).to_numpy()

        x_test = test_df[feature_cols]
        y_test = test_df["high_risk"].astype(int).to_numpy()

        print(f"\n=== Horizon: {horizon} ===")
        print(f"Train rows: {len(train_df):,}")
        print(f"Validation rows: {len(val_df):,}")
        print(f"Test rows: {len(test_df):,}")
        print(f"Validation positives: {int(y_val.sum())}")
        print(f"Test positives: {int(y_test.sum())}")

        if len(np.unique(y_train)) < 2 or len(np.unique(y_val)) < 2:
            print("Not enough positive/negative examples for calibration. Skipping.")
            continue

        raw_model = build_gradient_boosting_model()
        raw_model.fit(x_train, y_train)

        calibrated_model = fit_sigmoid_calibrator(raw_model, x_val, y_val)

        predictions = {
            "current_risk_baseline": {
                "validation": current_risk_probability(val_df),
                "test": current_risk_probability(test_df),
            },
            "gradient_boosting_raw": {
                "validation": raw_model.predict_proba(x_val)[:, 1],
                "test": raw_model.predict_proba(x_test)[:, 1],
            },
            "gradient_boosting_sigmoid_calibrated": {
                "validation": calibrated_model.predict_proba(x_val)[:, 1],
                "test": calibrated_model.predict_proba(x_test)[:, 1],
            },
        }

        split_lookup = {
            "validation": val_df,
            "test": test_df,
        }

        y_lookup = {
            "validation": y_val,
            "test": y_test,
        }

        for model_name, split_predictions in predictions.items():
            for split_name, y_prob in split_predictions.items():
                split_df = split_lookup[split_name]
                y_true = y_lookup[split_name]

                add_metrics_row(
                    rows=metrics_rows,
                    model_name=model_name,
                    horizon=horizon,
                    split_name=split_name,
                    split_df=split_df,
                    y_prob=y_prob,
                )

                curve_rows.extend(
                    calibration_curve_rows(
                        y_true=y_true,
                        y_prob=y_prob,
                        model_name=model_name,
                        horizon=horizon,
                        split=split_name,
                    )
                )

                quantile_curve_rows.extend(
                    quantile_calibration_curve_rows(
                        y_true=y_true,
                        y_prob=y_prob,
                        model_name=model_name,
                        horizon=horizon,
                        split=split_name,
                    )
                )

    metrics_df = pd.DataFrame(metrics_rows)
    curves_df = pd.DataFrame(curve_rows)
    quantile_curves_df = pd.DataFrame(quantile_curve_rows)

    metrics_df.to_csv(METRICS_OUTPUT_PATH, index=False)
    curves_df.to_csv(CURVES_OUTPUT_PATH, index=False)
    quantile_curves_df.to_csv(QUANTILE_CURVES_OUTPUT_PATH, index=False)

    print("\nWrote:")
    print(METRICS_OUTPUT_PATH)
    print(CURVES_OUTPUT_PATH)
    print(QUANTILE_CURVES_OUTPUT_PATH)

    print("\nCalibration test metrics:")
    print(
        metrics_df[metrics_df["split"] == "test"]
        .sort_values(["horizon", "pr_auc"], ascending=[True, False])
        .to_string(index=False)
    )


if __name__ == "__main__":
    main()