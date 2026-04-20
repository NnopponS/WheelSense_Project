import pandas as pd
import numpy as np
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
import json

base = "c:/Users/worap/Documents/TSE/PaperIEEE/outcome/"
res = {}

def binary_metrics(y_true, y_pred):
    return {
        'acc': round(accuracy_score(y_true, y_pred)*100, 2),
        'prec': round(precision_score(y_true, y_pred, zero_division=0)*100, 2),
        'rec': round(recall_score(y_true, y_pred, zero_division=0)*100, 2),
        'f1': round(f1_score(y_true, y_pred, zero_division=0)*100, 2),
        'n': len(y_true)
    }

# Case 1
df1 = pd.read_csv(base + "case1/case1_outcome.csv")
print("=== CASE 1 Columns ===")
print(df1.columns.tolist())
print(f"Shape: {df1.shape}")
print(df1.head(3).to_string())

for col in ['KNN_rounded', 'XGBoost_rounded']:
    valid = df1[col].notna() & df1['label'].notna()
    y_t = df1.loc[valid, 'label'].astype(int)
    y_p = df1.loc[valid, col].astype(int)
    res[f"case1_{col}"] = binary_metrics(y_t, y_p)

# Check for LLM columns
for col in df1.columns:
    if 'claude' in col.lower() or 'gemini' in col.lower() or 'opus' in col.lower():
        valid = df1[col].notna() & df1['label'].notna()
        y_t = df1.loc[valid, 'label'].astype(int)
        y_p = df1.loc[valid, col].astype(int)
        res[f"case1_{col}"] = binary_metrics(y_t, y_p)

# Case 2
df2 = pd.read_csv(base + "case2/case2_outcome.csv")
print("\n=== CASE 2 Columns ===")
print(df2.columns.tolist())

for col in ['KNN_rounded', 'XGBoost_rounded']:
    valid = df2[col].notna() & df2['label'].notna()
    y_t = df2.loc[valid, 'label'].astype(int)
    y_p = df2.loc[valid, col].astype(int)
    res[f"case2_{col}"] = binary_metrics(y_t, y_p)

for col in df2.columns:
    if 'claude' in col.lower() or 'gemini' in col.lower() or 'opus' in col.lower():
        valid = df2[col].notna() & df2['label'].notna()
        y_t = df2.loc[valid, 'label'].astype(int)
        y_p = df2.loc[valid, col].astype(int)
        res[f"case2_{col}"] = binary_metrics(y_t, y_p)

# Case 3
df3 = pd.read_csv(base + "case3/case3_outcome.csv")
print("\n=== CASE 3 Columns ===")
print(df3.columns.tolist())
print(f"Shape: {df3.shape}")
print(df3.head(3).to_string())

# For Case 3 - sequence accuracy
def seq_metrics(df, col):
    valid = df[col].notna() & df['label'].notna() & (df[col].astype(str).str.strip() != '') & (df['label'].astype(str).str.strip() != '')
    y_t = df.loc[valid, 'label'].astype(str).str.strip()
    y_p = df.loc[valid, col].astype(str).str.strip()
    exact_acc = round((y_t == y_p).mean()*100, 2)
    
    # Per-position accuracy
    total_pos = 0
    correct_pos = 0
    for t, p in zip(y_t, y_p):
        t_parts = t.split()
        p_parts = p.split()
        for i in range(min(len(t_parts), len(p_parts), 4)):
            total_pos += 1
            if t_parts[i] == p_parts[i]:
                correct_pos += 1
        total_pos += max(0, 4 - min(len(t_parts), len(p_parts), 4))
    
    per_pos_acc = round(correct_pos / total_pos * 100, 2) if total_pos > 0 else 0
    return {'exact_acc': exact_acc, 'per_pos_acc': per_pos_acc, 'n': int(valid.sum())}

for col in ['KNN', 'XGBoost']:
    res[f"case3_{col}"] = seq_metrics(df3, col)

for col in df3.columns:
    if 'claude' in col.lower() or 'gemini' in col.lower() or 'opus' in col.lower():
        res[f"case3_{col}"] = seq_metrics(df3, col)

print("\n=== ALL METRICS ===")
print(json.dumps(res, indent=2))
