"""
Outcome Data Viewer – Streamlit app to visualize case1/2/3 outcome tables.
Run from project root: streamlit run outcome/app.py — or from this directory: streamlit run app.py
"""

from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns
import streamlit as st

OUTCOME_DIR = Path(__file__).resolve().parent
OUTCOME_FILES = {
    "Case 1": "case1/case1_outcome.csv",
    "Case 2": "case2/case2_outcome.csv",
    "Case 3": "case3/case3_outcome.csv",
}

st.set_page_config(page_title="Outcome Data Viewer", layout="wide")


def case_id_from_name(case_name: str) -> str:
    """Return case folder id from sidebar name, e.g. 'Case 1' -> 'case1'."""
    return "case" + case_name.split()[-1]


def load_outcome(case_name: str) -> pd.DataFrame | None:
    path = OUTCOME_DIR / OUTCOME_FILES[case_name]
    if not path.exists():
        return None
    return pd.read_csv(path)


def load_md(case_id: str, filename: str) -> str | None:
    """Read markdown file from outcome/caseX/; return content or None if not found."""
    path = OUTCOME_DIR / case_id / filename
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8")


def load_info_md() -> str | None:
    """Read outcome/Info.md; return content or None if not found."""
    path = OUTCOME_DIR / "Info.md"
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8")


BINARY_PRED_COLS = [
    ("KNN_rounded", "KNN"),
    ("XGBoost_rounded", "XGBoost"),
    ("Claude_Opus4.6", "Claude Opus 4.6"),
    ("Gemini_3.1_pro", "Gemini 3.1 pro"),
]
SEQUENCE_PRED_COLS = [
    ("KNN", "KNN"),
    ("XGBoost", "XGBoost"),
    ("Claude_Opus4.6", "Claude Opus 4.6"),
    ("Gemini_3.1_pro", "Gemini 3.1 pro"),
]


def accuracy_from_outcome(df: pd.DataFrame) -> dict[str, float] | tuple[float | None, float | None]:
    """
    Case 1/2 (binary): return dict of display_name -> accuracy for each present predictor.
    Case 3 (sequence): return (acc_knn, acc_xgb) for backward compat; use sequence_metrics for full table.
    """
    if "KNN_rounded" in df.columns:
        # Case 1 / 2: binary – all present predictors
        result: dict[str, float] = {}
        for col, name in BINARY_PRED_COLS:
            if col not in df.columns:
                continue
            valid = df[col].notna()
            if not valid.any():
                continue
            y_true = df.loc[valid, "label"].astype(int)
            y_pred = df.loc[valid, col].round().astype(int)
            acc = (y_true == y_pred).mean()
            result[name] = float(acc)
        return result
    if "KNN" in df.columns and "XGBoost" in df.columns:
        # Case 3: sequence – return KNN and XGBoost exact match only (sequence_metrics used for full UI)
        def norm(s: pd.Series) -> pd.Series:
            return s.astype(str).str.strip().str.replace(r"\s+", " ", regex=True)
        label_n = norm(df["label"])
        knn_n = norm(df["KNN"])
        xgb_n = norm(df["XGBoost"])
        valid_k = knn_n != ""
        valid_x = xgb_n != ""
        acc_knn = (label_n.loc[valid_k] == knn_n.loc[valid_k]).mean() if valid_k.any() else None
        acc_xgb = (label_n.loc[valid_x] == xgb_n.loc[valid_x]).mean() if valid_x.any() else None
        return (float(acc_knn) if acc_knn is not None else None, float(acc_xgb) if acc_xgb is not None else None)
    return (None, None)


def confusion_binary(df: pd.DataFrame) -> pd.DataFrame | None:
    """
    For Case 1/2: compute TP, TN, FP, FN (positive=1) for each binary predictor present.
    Returns a DataFrame with rows Metric = [TP, TN, FP, FN] and one column per model (display names); or None if not binary.
    """
    if "KNN_rounded" not in df.columns:
        return None
    out: dict[str, list[int]] = {}
    for pred_col, name in BINARY_PRED_COLS:
        if pred_col not in df.columns:
            continue
        valid = df[pred_col].notna()
        if not valid.any():
            out[name] = [0, 0, 0, 0]
            continue
        y_true = df.loc[valid, "label"].astype(int)
        y_pred = df.loc[valid, pred_col].round().astype(int)
        tp = int(((y_true == 1) & (y_pred == 1)).sum())
        tn = int(((y_true == 0) & (y_pred == 0)).sum())
        fp = int(((y_true == 0) & (y_pred == 1)).sum())
        fn = int(((y_true == 1) & (y_pred == 0)).sum())
        out[name] = [tp, tn, fp, fn]
    if not out:
        return None
    tbl = pd.DataFrame({"Metric": ["TP", "TN", "FP", "FN"]})
    for name, counts in out.items():
        tbl[name] = counts
    return tbl


def binary_metrics_from_confusion(conf_df: pd.DataFrame) -> pd.DataFrame | None:
    """
    For Case 1/2: from confusion DataFrame (rows TP, TN, FP, FN; columns = model names),
    compute Precision, Recall, F1 per model. Returns DataFrame with rows Metric and one column per model.
    """
    if conf_df is None or "Metric" not in conf_df.columns:
        return None
    conf = conf_df.set_index("Metric")
    model_cols = [c for c in conf.columns if c != "Metric"]
    if not model_cols:
        return None
    out: dict[str, list[float]] = {}
    for name in model_cols:
        tp = int(conf.loc["TP", name]) if "TP" in conf.index else 0
        tn = int(conf.loc["TN", name]) if "TN" in conf.index else 0
        fp = int(conf.loc["FP", name]) if "FP" in conf.index else 0
        fn = int(conf.loc["FN", name]) if "FN" in conf.index else 0
        den_p = tp + fp
        den_r = tp + fn
        precision = float(tp / den_p) if den_p > 0 else 0.0
        recall = float(tp / den_r) if den_r > 0 else 0.0
        den_f1 = precision + recall
        f1 = float(2 * precision * recall / den_f1) if den_f1 > 0 else 0.0
        out[name] = [precision, recall, f1]
    tbl = pd.DataFrame({"Metric": ["Precision", "Recall", "F1"]})
    for name, vals in out.items():
        tbl[name] = vals
    return tbl


def binary_test_summary(
    df: pd.DataFrame,
) -> tuple[str, dict[str, str], list[tuple[str, int]]]:
    """
    For Case 1/2: class distribution string, per-model prediction distribution, and list of (model, single_class) for models that predict only one class.
    Returns (class_dist_str, pred_dist_dict, single_class_notes).
    """
    if "label" not in df.columns:
        return "", {}, []
    labels = df["label"].astype(int)
    n0 = int((labels == 0).sum())
    n1 = int((labels == 1).sum())
    total = len(labels)
    class_dist_str = f"Test set: {n0} × class 0, {n1} × class 1 (total {total})."
    pred_dist: dict[str, str] = {}
    single_class_notes: list[tuple[str, int]] = []
    for pred_col, name in BINARY_PRED_COLS:
        if pred_col not in df.columns:
            continue
        valid = df[pred_col].notna()
        if not valid.any():
            continue
        preds = df.loc[valid, pred_col].round().astype(int)
        p0 = int((preds == 0).sum())
        p1 = int((preds == 1).sum())
        pred_dist[name] = f"{p0} × 0, {p1} × 1"
        if p0 == 0:
            single_class_notes.append((name, 1))
        elif p1 == 0:
            single_class_notes.append((name, 0))
    return class_dist_str, pred_dist, single_class_notes


def majority_baseline(df: pd.DataFrame) -> tuple[float, int] | None:
    """For binary df, return (majority_class_accuracy, majority_class)."""
    if "label" not in df.columns:
        return None
    labels = df["label"].astype(int)
    mode = labels.mode()
    if mode.empty:
        return None
    majority_class = int(mode.iloc[0])
    acc = (labels == majority_class).mean()
    return (float(acc), majority_class)


def confusion_2x2(conf_df: pd.DataFrame) -> dict[str, pd.DataFrame] | None:
    """
    For Case 1/2: from confusion DataFrame build per-model 2×2 (Actual 0/1 × Pred 0/1).
    Returns dict model_name -> DataFrame with index Actual 0, Actual 1 and columns Pred 0, Pred 1.
    """
    if conf_df is None or "Metric" not in conf_df.columns:
        return None
    conf = conf_df.set_index("Metric")
    model_cols = [c for c in conf.columns if c != "Metric"]
    if not model_cols:
        return None
    result: dict[str, pd.DataFrame] = {}
    for name in model_cols:
        tn = int(conf.loc["TN", name]) if "TN" in conf.index else 0
        fp = int(conf.loc["FP", name]) if "FP" in conf.index else 0
        fn = int(conf.loc["FN", name]) if "FN" in conf.index else 0
        tp = int(conf.loc["TP", name]) if "TP" in conf.index else 0
        # Rows: Actual 0, Actual 1; Cols: Pred 0, Pred 1
        m = pd.DataFrame(
            [[tn, fp], [fn, tp]],
            index=["Actual 0", "Actual 1"],
            columns=["Pred 0", "Pred 1"],
        )
        result[name] = m
    return result


def plot_one_confusion_heatmap(name: str, mat: pd.DataFrame):
    """
    Plot a single 2×2 confusion matrix as a small heat map.
    Returns the matplotlib Figure for st.pyplot(fig).
    """
    fig, ax = plt.subplots(figsize=(2.8, 2.2))
    sns.heatmap(
        mat,
        annot=True,
        fmt="d",
        cmap="Blues",
        ax=ax,
        cbar_kws={"label": "Count", "shrink": 0.7},
        linewidths=0.5,
        annot_kws={"size": 8},
    )
    ax.set_title(name, fontsize=9)
    ax.set_xlabel("Predicted", fontsize=8)
    ax.set_ylabel("Actual", fontsize=8)
    ax.tick_params(axis="both", labelsize=7)
    # Shrink colorbar text to fit small figure
    if ax.figure.axes[-1] is not ax:
        cbar_ax = ax.figure.axes[-1]
        cbar_ax.tick_params(labelsize=7)
        cbar_ax.yaxis.label.set_fontsize(7)
    fig.tight_layout()
    return fig


def _norm_seq(s: pd.Series) -> pd.Series:
    """Normalize sequence strings: strip and collapse whitespace to single space."""
    return s.astype(str).str.strip().str.replace(r"\s+", " ", regex=True)


def sequence_metrics(
    df: pd.DataFrame, pred_cols: list[tuple[str, str]]
) -> tuple[dict[str, float], dict[str, float]]:
    """
    Case 3: for each prediction column compute exact match and per-position accuracy vs label.
    Returns (exact_acc_dict, per_position_acc_dict), each display_name -> fraction in [0, 1].
    """
    if "label" not in df.columns:
        return {}, {}
    label_n = _norm_seq(df["label"])
    exact_acc: dict[str, float] = {}
    per_pos_acc: dict[str, float] = {}
    n_rows = len(df)
    total_positions = n_rows * 4
    for col, name in pred_cols:
        if col not in df.columns:
            continue
        pred_n = _norm_seq(df[col])
        valid = (label_n != "") & (pred_n != "")
        if not valid.any():
            continue
        # Exact: fraction of rows where label == pred
        exact_acc[name] = float((label_n.loc[valid] == pred_n.loc[valid]).mean())
        # Per-position: split into 4 tokens, count matches over all rows; denominator = n_rows * 4
        label_split = label_n.str.split(" ", expand=True)
        pred_split = pred_n.str.split(" ", expand=True)
        if label_split.shape[1] < 4 or pred_split.shape[1] < 4:
            continue
        matches = 0
        for i in range(4):
            l = label_split.iloc[:, i]
            p = pred_split.iloc[:, i]
            both = l.notna() & p.notna()
            matches += (l.loc[both] == p.loc[both]).sum()
        per_pos_acc[name] = float(matches / total_positions) if total_positions else 0.0
    return exact_acc, per_pos_acc


# --- Sidebar: view selection (Info or Case) ---
VIEW_OPTIONS = ["Info", "Case 1", "Case 2", "Case 3"]
st.sidebar.header("View")
view = st.sidebar.radio("Select", VIEW_OPTIONS, label_visibility="collapsed")

if view == "Info":
    info_md = load_info_md()
    if info_md:
        st.markdown(info_md)
    else:
        st.caption("Info.md not found in outcome/.")
    st.stop()

case_name = view
case_id = case_id_from_name(case_name)

# --- Load and display outcome table ---
df = load_outcome(case_name)
if df is None:
    st.warning("Outcome file not found. Ensure outcome CSVs exist in outcome/case1, case2, case3.")
    st.stop()

st.header(f"{case_name} – Outcome")
hide_rssi = st.checkbox("Hide time_based_rssi", value=True, help="Show only label and model columns")
if hide_rssi and "time_based_rssi" in df.columns:
    display_df = df.drop(columns=["time_based_rssi"])
else:
    display_df = df
st.dataframe(display_df, use_container_width=True)

# --- Analysis: metrics and confusion / sequence table ---
is_binary = "KNN_rounded" in df.columns
if is_binary:
    st.subheader("Analysis: model accuracy and confusion")
    acc = accuracy_from_outcome(df)
    assert isinstance(acc, dict)
    # One metric per model (up to 4)
    cols = st.columns(min(len(acc), 4) or 1)
    for i, (name, value) in enumerate(acc.items()):
        with cols[i % len(cols)]:
            st.metric(f"{name} accuracy (test)", f"{value:.1%}", None)
    conf = confusion_binary(df)
    if conf is not None:
        st.caption("Confusion counts (positive = 1): TP, TN, FP, FN")
        st.dataframe(conf, use_container_width=True, hide_index=True)
        # Precision, Recall, F1
        prf = binary_metrics_from_confusion(conf)
        if prf is not None:
            st.caption("Precision, Recall, F1 (positive = 1)")
            st.dataframe(prf, use_container_width=True, hide_index=True)
        # 2×2 confusion matrix per model (heat maps)
        cm22 = confusion_2x2(conf)
        if cm22:
            with st.expander("Confusion matrix (2×2) per model"):
                n = len(cm22)
                if n:
                    cols = st.columns(2)
                    for i, (name, mat) in enumerate(cm22.items()):
                        with cols[i % 2]:
                            fig = plot_one_confusion_heatmap(name, mat)
                            st.pyplot(fig)
                            plt.close(fig)
    # Test set summary and per-model prediction distribution
    class_dist_str, pred_dist, single_class_notes = binary_test_summary(df)
    if class_dist_str:
        st.caption("Test set summary")
        class_labels = (
            "(Class 0 = Facing in, Class 1 = Facing out)"
            if case_name == "Case 1"
            else "(Class 0 = In zone 4, Class 1 = Out zone 4)"
        )
        st.text(f"{class_dist_str} {class_labels}")
        if pred_dist:
            pred_df = pd.DataFrame(
                list(pred_dist.items()), columns=["Model", "Predictions (0, 1)"]
            )
            st.dataframe(pred_df, use_container_width=True, hide_index=True)
        for name, cls in single_class_notes:
            st.caption(f"Note: {name} predicted only class {cls}.")
    # Majority baseline
    maj = majority_baseline(df)
    if maj is not None:
        acc, majority_class = maj
        st.caption(f"Majority baseline (class {majority_class}): accuracy {acc:.1%}.")
else:
    # Case 3: sequence metrics for all models
    st.subheader("Analysis: sequence metrics")
    exact_acc, per_pos_acc = sequence_metrics(df, SEQUENCE_PRED_COLS)
    if exact_acc:
        # Table: rows = model names, columns = Exact %, Per-position %
        metrics_df = pd.DataFrame({
            "Model": list(exact_acc.keys()),
            "Exact %": [f"{exact_acc[m]:.1%}" for m in exact_acc],
            "Per-position %": [f"{per_pos_acc.get(m, 0):.1%}" for m in exact_acc],
        })
        st.dataframe(metrics_df, use_container_width=True, hide_index=True)
# Analysis markdown from caseX_analysis.md
analysis_md = load_md(case_id, f"{case_id}_analysis.md")
if analysis_md:
    st.markdown("---")
    st.markdown(analysis_md)
else:
    st.caption("Analysis file not found. Add " + f"{case_id}_analysis.md" + " in outcome/" + case_id + "/.")

# --- Model explanations (from caseX_KNN.md, caseX_XGBoost.md, caseX_LLMs.md) ---
st.subheader("Model explanations")
knn_md = load_md(case_id, f"{case_id}_KNN.md")
xgb_md = load_md(case_id, f"{case_id}_XGBoost.md")
llms_md = load_md(case_id, f"{case_id}_LLMs.md")

with st.expander("Explain KNN"):
    if knn_md:
        st.markdown(knn_md)
    else:
        st.caption(f"{case_id}_KNN.md not found.")

with st.expander("Explain XGBoost"):
    if xgb_md:
        st.markdown(xgb_md)
    else:
        st.caption(f"{case_id}_XGBoost.md not found.")

with st.expander("Explain LLMs"):
    if llms_md:
        st.markdown(llms_md)
    else:
        st.caption(f"{case_id}_LLMs.md not found.")
