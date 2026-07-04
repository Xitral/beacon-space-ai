from pathlib import Path
import pandas as pd

RAW_DIR = Path("data/raw")
PROCESSED_DIR = Path("data/processed")
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

HORIZONS = {
    "7d": 7.0,
    "3d": 3.0,
    "2d": 2.0,
    "1d": 1.0,
    "final": 0.0,
}

# ESA risk is log10(probability), so -5 means 10^-5.
HIGH_RISK_THRESHOLD_LOG10 = -5.0


def find_file(name_part: str) -> Path:
    matches = list(RAW_DIR.glob(f"*{name_part}*"))
    if not matches:
        raise FileNotFoundError(f"No file containing '{name_part}' found in {RAW_DIR}")
    return matches[0]


def load_table(path: Path) -> pd.DataFrame:
    if path.suffix == ".csv":
        return pd.read_csv(path)
    if path.suffix == ".zip":
        return pd.read_csv(path, compression="zip")
    raise ValueError(f"Unsupported file type: {path}")


def validate_columns(df: pd.DataFrame) -> None:
    required = {"event_id", "time_to_tca", "risk"}
    missing = required - set(df.columns)

    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    print("Required columns found: event_id, time_to_tca, risk")


def get_final_event_risk(train: pd.DataFrame) -> pd.DataFrame:
    # Final CDM should be closest to TCA, meaning smallest time_to_tca.
    ordered = train.sort_values(["event_id", "time_to_tca"], ascending=[True, True])
    final_rows = ordered.groupby("event_id", as_index=False).first()

    final_risk = final_rows[["event_id", "risk"]].rename(
        columns={"risk": "final_risk"}
    )

    final_risk["high_risk"] = (
        final_risk["final_risk"] >= HIGH_RISK_THRESHOLD_LOG10
    ).astype(int)

    return final_risk


def select_horizon_row(event_df: pd.DataFrame, horizon_name: str, horizon_days: float) -> pd.Series:
    event_df = event_df.sort_values("time_to_tca", ascending=False)

    if horizon_name == "final":
        # closest to TCA
        return event_df.sort_values("time_to_tca", ascending=True).iloc[0]

    eligible = event_df[event_df["time_to_tca"] >= horizon_days]

    if len(eligible) > 0:
        # closest available CDM before that horizon
        return eligible.sort_values("time_to_tca", ascending=True).iloc[0]

    # fallback: earliest available CDM if event does not reach the requested horizon
    return event_df.iloc[0]


def build_horizon_snapshots(train: pd.DataFrame, final_risk: pd.DataFrame) -> pd.DataFrame:
    rows = []

    for event_id, event_df in train.groupby("event_id"):
        for horizon_name, horizon_days in HORIZONS.items():
            row = select_horizon_row(event_df, horizon_name, horizon_days).copy()
            row["horizon"] = horizon_name
            rows.append(row)

    snapshots = pd.DataFrame(rows)
    snapshots = snapshots.merge(final_risk, on="event_id", how="left")

    return snapshots


def main() -> None:
    train_path = find_file("train")
    train = load_table(train_path)

    print(f"Loaded train data from {train_path}")
    print(f"Rows: {len(train):,}")
    print(f"Columns: {len(train.columns):,}")

    validate_columns(train)

    train["event_id"] = train["event_id"].astype(str)
    train["time_to_tca"] = pd.to_numeric(train["time_to_tca"], errors="coerce")
    train["risk"] = pd.to_numeric(train["risk"], errors="coerce")

    train = train.dropna(subset=["event_id", "time_to_tca", "risk"])

    final_risk = get_final_event_risk(train)
    snapshots = build_horizon_snapshots(train, final_risk)

    final_risk.to_csv(PROCESSED_DIR / "event_labels.csv", index=False)
    snapshots.to_parquet(PROCESSED_DIR / "horizon_snapshots.parquet", index=False)

    print("\nWrote:")
    print(PROCESSED_DIR / "event_labels.csv")
    print(PROCESSED_DIR / "horizon_snapshots.parquet")

    print("\nEvent label summary:")
    print(final_risk["high_risk"].value_counts(normalize=True).rename("rate"))
    print(final_risk["high_risk"].value_counts().rename("count"))

    print("\nHorizon snapshot counts:")
    print(snapshots["horizon"].value_counts())


if __name__ == "__main__":
    main()