import pandas as pd
import pytest

from risk_ablation import build_delta_rows


def test_delta_rows_compare_expected_models() -> None:
    rows = [
        {
            "split_seed": 42,
            "horizon": "1d",
            "split": "test",
            "model": "current_risk_baseline",
            "pr_auc": 0.50,
            "recall_top_5": 0.80,
            "recall_top_10": 0.90,
        },
        {
            "split_seed": 42,
            "horizon": "1d",
            "split": "test",
            "model": "gradient_boosting_with_risk",
            "pr_auc": 0.70,
            "recall_top_5": 0.95,
            "recall_top_10": 1.00,
        },
        {
            "split_seed": 42,
            "horizon": "1d",
            "split": "test",
            "model": "gradient_boosting_without_risk",
            "pr_auc": 0.40,
            "recall_top_5": 0.60,
            "recall_top_10": 0.75,
        },
    ]

    output = build_delta_rows(pd.DataFrame(rows)).iloc[0]

    assert output["pr_auc_with_risk_minus_current_risk"] == pytest.approx(0.20)
    assert output["pr_auc_with_risk_minus_without_risk"] == pytest.approx(0.30)
    assert output["recall_top_5_with_risk_minus_without_risk"] == pytest.approx(0.35)
