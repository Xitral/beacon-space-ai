from pathlib import Path

import pandas as pd

from inspect_data import find_file, load_table


def test_find_file_returns_none_for_optional_missing_file(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr("inspect_data.RAW_DIR", tmp_path)

    assert find_file("test", required=False) is None


def test_find_file_raises_for_required_missing_file(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr("inspect_data.RAW_DIR", tmp_path)

    try:
        find_file("train")
    except FileNotFoundError as error:
        assert "No file containing 'train'" in str(error)
    else:
        raise AssertionError("Expected FileNotFoundError for missing required train file")


def test_load_table_reads_csv(tmp_path) -> None:
    path = tmp_path / "train_data.csv"
    path.write_text("event_id,time_to_tca,risk\na,1.0,-6.0\n", encoding="utf-8")

    df = load_table(path)

    assert list(df.columns) == ["event_id", "time_to_tca", "risk"]
    assert df.iloc[0]["event_id"] == "a"
