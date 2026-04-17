import pandas as pd
import numpy as np
from sklearn.neighbors import KNeighborsClassifier
from xgboost import XGBClassifier
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
import json

base_dir = "c:/Users/worap/Documents/TSE/PaperIEEE/outcome/"

res = {}

def get_binary_metrics(df, col):
    valid = df[col].notna() & df['label'].notna()
    if not valid.any(): return None
    y_true = df.loc[valid, 'label'].astype(int)
    y_pred = df.loc[valid, col].round().astype(int)
    return {
        'acc': accuracy_score(y_true, y_pred),
        'prec': precision_score(y_true, y_pred, zero_division=0),
        'rec': recall_score(y_true, y_pred, zero_division=0),
        'f1': f1_score(y_true, y_pred, zero_division=0)
    }

def norm_seq(s):
    return s.astype(str).str.strip().str.replace(r"\s+", " ", regex=True)

def get_seq_metrics(df, col):
    valid = df[col].notna() & df['label'].notna() & (df[col] != "") & (df['label'] != "")
    if not valid.any(): return None
    y_true = norm_seq(df.loc[valid, 'label'])
    y_pred = norm_seq(df.loc[valid, col])
    exact_acc = (y_true == y_pred).mean()
    # exact string match accuracy
    return {'acc': exact_acc, 'prec': exact_acc, 'rec': exact_acc, 'f1': exact_acc}

for case, func, knnc, xgbc in [
    ("case1", get_binary_metrics, "KNN_rounded", "XGBoost_rounded"),
    ("case2", get_binary_metrics, "KNN_rounded", "XGBoost_rounded"),
    ("case3", get_seq_metrics, "KNN", "XGBoost")
]:
    df = pd.read_csv(f"{base_dir}{case}/{case}_outcome.csv")
    res[case] = {
        'knn': func(df, knnc),
        'xgb': func(df, xgbc)
    }

print("=== Standard Metrics ===")
print(json.dumps(res, indent=2))
