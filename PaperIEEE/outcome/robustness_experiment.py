"""
Robustness Under Signal Degradation
- Gaussian noise injection on RSSI values
- Simulated anchor failure (masking columns with NaN)
- Runs KNN and XGBoost on degraded test data
- Generates degraded test CSVs for LLMs
"""
import pandas as pd
import numpy as np
from sklearn.neighbors import KNeighborsClassifier
from xgboost import XGBClassifier
from sklearn.metrics import accuracy_score
import json, os, re

np.random.seed(42)
base = "c:/Users/worap/Documents/TSE/PaperIEEE/outcome/"
out_dir = "c:/Users/worap/Documents/TSE/PaperIEEE/outcome/robustness/"
os.makedirs(out_dir, exist_ok=True)

def parse_rssi(rssi_str):
    """Parse time_based_rssi string into list of [r1,r2,r3,r4] arrays."""
    steps = rssi_str.split(';')
    rows = []
    for step in steps:
        parts = step.split(',')
        if len(parts) >= 5:
            vals = []
            for v in parts[1:5]:
                v = v.strip()
                if v == '' or v == 'nan':
                    vals.append(np.nan)
                else:
                    try:
                        vals.append(float(v))
                    except:
                        vals.append(np.nan)
            rows.append(vals)
    return np.array(rows) if rows else np.empty((0,4))

def episode_to_samples(df):
    """Expand episodes to per-sample rows."""
    X_all, y_all = [], []
    for _, row in df.iterrows():
        rssi = parse_rssi(row['time_based_rssi'])
        valid = ~np.isnan(rssi).any(axis=1)
        rssi_valid = rssi[valid]
        if len(rssi_valid) > 0:
            X_all.append(rssi_valid)
            y_all.extend([int(row['label'])] * len(rssi_valid))
    if X_all:
        return np.vstack(X_all), np.array(y_all)
    return np.empty((0,4)), np.array([])

def add_noise(rssi_str, sigma):
    """Add Gaussian noise to RSSI values in a time_based_rssi string."""
    steps = rssi_str.split(';')
    new_steps = []
    for step in steps:
        parts = step.split(',')
        if len(parts) >= 5:
            new_parts = [parts[0]]
            for v in parts[1:5]:
                v = v.strip()
                if v == '' or v == 'nan':
                    new_parts.append(v)
                else:
                    try:
                        val = float(v) + np.random.normal(0, sigma)
                        new_parts.append(str(round(val)))
                    except:
                        new_parts.append(v)
            if len(parts) > 5:
                new_parts.extend(parts[5:])
            new_steps.append(','.join(new_parts))
        else:
            new_steps.append(step)
    return ';'.join(new_steps)

def mask_anchors(rssi_str, anchors_to_mask):
    """Mask specific anchor columns (0-indexed) with -100 dBm (no signal)."""
    steps = rssi_str.split(';')
    new_steps = []
    for step in steps:
        parts = step.split(',')
        if len(parts) >= 5:
            new_parts = [parts[0]]
            for i, v in enumerate(parts[1:5]):
                if i in anchors_to_mask:
                    new_parts.append('-100')
                else:
                    new_parts.append(v)
            if len(parts) > 5:
                new_parts.extend(parts[5:])
            new_steps.append(','.join(new_parts))
        else:
            new_steps.append(step)
    return ';'.join(new_steps)

def predict_binary_knn_xgb(train_df, test_df, knn_model, xgb_model):
    """Predict binary classification for test episodes."""
    knn_preds, xgb_preds = [], []
    for _, row in test_df.iterrows():
        rssi = parse_rssi(row['time_based_rssi'])
        valid = ~np.isnan(rssi).any(axis=1)
        rssi_valid = rssi[valid]
        if len(rssi_valid) > 0:
            kp = knn_model.predict(rssi_valid)
            xp = xgb_model.predict(rssi_valid)
            knn_preds.append(round(kp.mean()))
            xgb_preds.append(round(xp.mean()))
        else:
            knn_preds.append(np.nan)
            xgb_preds.append(np.nan)
    return knn_preds, xgb_preds

def predict_seq_knn_xgb(train_df, test_df, knn_model, xgb_model):
    """Predict sequence for Case 3."""
    knn_preds, xgb_preds = [], []
    for _, row in test_df.iterrows():
        rssi = parse_rssi(row['time_based_rssi'])
        valid = ~np.isnan(rssi).any(axis=1)
        rssi_valid = rssi[valid]
        if len(rssi_valid) < 4:
            knn_preds.append('')
            xgb_preds.append('')
            continue
        n = len(rssi_valid)
        seg_size = n // 4
        knn_seq, xgb_seq = [], []
        for s in range(4):
            start = s * seg_size
            end = (s+1) * seg_size if s < 3 else n
            seg = rssi_valid[start:end]
            if len(seg) == 0:
                knn_seq.append('0')
                xgb_seq.append('0')
                continue
            feat = np.concatenate([seg.mean(axis=0), seg.std(axis=0)]).reshape(1, -1)
            knn_seq.append(str(knn_model.predict(feat)[0] + 1))  # back to 1-indexed
            xgb_seq.append(str(xgb_model.predict(feat)[0] + 1))  # back to 1-indexed
        knn_preds.append(' '.join(knn_seq))
        xgb_preds.append(' '.join(xgb_seq))
    return knn_preds, xgb_preds

results = {}

# ========================
# CASES 1 & 2: Binary
# ========================
for case in ['case1', 'case2']:
    print(f"\n=== {case.upper()} ROBUSTNESS ===")
    train_df = pd.read_csv(f"{base}{case}/{case}_train.csv")
    test_df = pd.read_csv(f"{base}{case}/{case}_test.csv")
    
    # Train models on clean data
    X_train, y_train = episode_to_samples(train_df)
    knn = KNeighborsClassifier(n_neighbors=5, metric='euclidean')
    knn.fit(X_train, y_train)
    xgb = XGBClassifier(n_estimators=100, max_depth=6, learning_rate=0.1,
                         random_state=42, eval_metric='logloss', use_label_encoder=False)
    xgb.fit(X_train, y_train)
    
    # Baseline (no degradation)
    kp, xp = predict_binary_knn_xgb(train_df, test_df, knn, xgb)
    y_true = test_df['label'].astype(int).values
    valid_k = [i for i in range(len(kp)) if not np.isnan(kp[i])]
    valid_x = [i for i in range(len(xp)) if not np.isnan(xp[i])]
    results[f"{case}_baseline"] = {
        'knn': round(accuracy_score(y_true[valid_k], [int(kp[i]) for i in valid_k])*100, 2),
        'xgb': round(accuracy_score(y_true[valid_x], [int(xp[i]) for i in valid_x])*100, 2)
    }
    
    # Noise injection
    for sigma in [2, 4, 6, 8, 10, 12]:
        test_noisy = test_df.copy()
        test_noisy['time_based_rssi'] = test_noisy['time_based_rssi'].apply(lambda x: add_noise(x, sigma))
        kp, xp = predict_binary_knn_xgb(train_df, test_noisy, knn, xgb)
        valid_k = [i for i in range(len(kp)) if not np.isnan(kp[i])]
        valid_x = [i for i in range(len(xp)) if not np.isnan(xp[i])]
        results[f"{case}_noise_{sigma}"] = {
            'knn': round(accuracy_score(y_true[valid_k], [int(kp[i]) for i in valid_k])*100, 2),
            'xgb': round(accuracy_score(y_true[valid_x], [int(xp[i]) for i in valid_x])*100, 2)
        }
        
        # Save degraded CSV for LLMs
        llm_csv = test_noisy[['time_based_rssi']].copy()
        llm_csv.insert(0, 'id', range(1, len(llm_csv)+1))
        csv_path = f"{out_dir}{case}_noise_{sigma}_test.csv"
        llm_csv.to_csv(csv_path, index=False)
    
    # Anchor failure
    for n_lost, anchors in [(1, [[0], [1], [2], [3]]), (2, [[0,1], [0,2], [0,3], [1,2], [1,3], [2,3]])]:
        accs_knn, accs_xgb = [], []
        for anchor_set in anchors:
            test_masked = test_df.copy()
            test_masked['time_based_rssi'] = test_masked['time_based_rssi'].apply(lambda x: mask_anchors(x, anchor_set))
            kp, xp = predict_binary_knn_xgb(train_df, test_masked, knn, xgb)
            valid_k = [i for i in range(len(kp)) if not np.isnan(kp[i])]
            valid_x = [i for i in range(len(xp)) if not np.isnan(xp[i])]
            if valid_k:
                accs_knn.append(accuracy_score(y_true[valid_k], [int(kp[i]) for i in valid_k])*100)
            if valid_x:
                accs_xgb.append(accuracy_score(y_true[valid_x], [int(xp[i]) for i in valid_x])*100)
        results[f"{case}_anchor_{n_lost}_lost"] = {
            'knn': round(np.mean(accs_knn), 2) if accs_knn else 0,
            'xgb': round(np.mean(accs_xgb), 2) if accs_xgb else 0
        }
    
    # Save anchor failure CSVs for LLMs (1 lost: anchor 3, 2 lost: anchors 2,3)
    for n_lost, anchor_set in [(1, [3]), (2, [2,3])]:
        test_masked = test_df.copy()
        test_masked['time_based_rssi'] = test_masked['time_based_rssi'].apply(lambda x: mask_anchors(x, anchor_set))
        llm_csv = test_masked[['time_based_rssi']].copy()
        llm_csv.insert(0, 'id', range(1, len(llm_csv)+1))
        csv_path = f"{out_dir}{case}_anchor_{n_lost}lost_test.csv"
        llm_csv.to_csv(csv_path, index=False)

# ========================
# CASE 3: Sequence
# ========================
print(f"\n=== CASE3 ROBUSTNESS ===")
train_df3 = pd.read_csv(f"{base}case3/case3_train.csv")
test_df3 = pd.read_csv(f"{base}case3/case3_test.csv")

# Build 8D segment features for training
X3_train, y3_train = [], []
for _, row in train_df3.iterrows():
    rssi = parse_rssi(row['time_based_rssi'])
    valid = ~np.isnan(rssi).any(axis=1)
    rssi_valid = rssi[valid]
    label_parts = str(row['label']).strip().split()
    if len(rssi_valid) >= 4 and len(label_parts) == 4:
        n = len(rssi_valid)
        seg_size = n // 4
        for s in range(4):
            start = s * seg_size
            end = (s+1) * seg_size if s < 3 else n
            seg = rssi_valid[start:end]
            if len(seg) > 0:
                feat = np.concatenate([seg.mean(axis=0), seg.std(axis=0)])
                X3_train.append(feat)
                y3_train.append(int(label_parts[s]) - 1)  # 0-indexed for XGBoost
X3_train = np.array(X3_train)
y3_train = np.array(y3_train)

knn3 = KNeighborsClassifier(n_neighbors=5, metric='euclidean')
knn3.fit(X3_train, y3_train)
xgb3 = XGBClassifier(n_estimators=100, max_depth=6, learning_rate=0.1,
                       random_state=42, eval_metric='mlogloss', use_label_encoder=False)
xgb3.fit(X3_train, y3_train)

# Baseline
kp3, xp3 = predict_seq_knn_xgb(train_df3, test_df3, knn3, xgb3)
y_true3 = test_df3['label'].astype(str).str.strip().values
exact_knn = round(sum(1 for a,b in zip(y_true3, kp3) if a==b)/len(y_true3)*100, 2)
exact_xgb = round(sum(1 for a,b in zip(y_true3, xp3) if a==b)/len(y_true3)*100, 2)
results['case3_baseline'] = {'knn': exact_knn, 'xgb': exact_xgb}

# Noise
for sigma in [2, 4, 6, 8, 10, 12]:
    test_noisy3 = test_df3.copy()
    test_noisy3['time_based_rssi'] = test_noisy3['time_based_rssi'].apply(lambda x: add_noise(x, sigma))
    kp3, xp3 = predict_seq_knn_xgb(train_df3, test_noisy3, knn3, xgb3)
    exact_knn = round(sum(1 for a,b in zip(y_true3, kp3) if a==b)/len(y_true3)*100, 2)
    exact_xgb = round(sum(1 for a,b in zip(y_true3, xp3) if a==b)/len(y_true3)*100, 2)
    results[f'case3_noise_{sigma}'] = {'knn': exact_knn, 'xgb': exact_xgb}
    
    llm_csv = test_noisy3[['time_based_rssi']].copy()
    llm_csv.insert(0, 'id', range(1, len(llm_csv)+1))
    llm_csv.to_csv(f"{out_dir}case3_noise_{sigma}_test.csv", index=False)

# Anchor failure
for n_lost, anchors in [(1, [[0], [1], [2], [3]]), (2, [[0,1], [0,2], [0,3], [1,2], [1,3], [2,3]])]:
    accs_knn, accs_xgb = [], []
    for anchor_set in anchors:
        test_masked3 = test_df3.copy()
        test_masked3['time_based_rssi'] = test_masked3['time_based_rssi'].apply(lambda x: mask_anchors(x, anchor_set))
        kp3, xp3 = predict_seq_knn_xgb(train_df3, test_masked3, knn3, xgb3)
        accs_knn.append(sum(1 for a,b in zip(y_true3, kp3) if a==b)/len(y_true3)*100)
        accs_xgb.append(sum(1 for a,b in zip(y_true3, xp3) if a==b)/len(y_true3)*100)
    results[f'case3_anchor_{n_lost}_lost'] = {
        'knn': round(np.mean(accs_knn), 2),
        'xgb': round(np.mean(accs_xgb), 2)
    }

for n_lost, anchor_set in [(1, [3]), (2, [2,3])]:
    test_masked3 = test_df3.copy()
    test_masked3['time_based_rssi'] = test_masked3['time_based_rssi'].apply(lambda x: mask_anchors(x, anchor_set))
    llm_csv = test_masked3[['time_based_rssi']].copy()
    llm_csv.insert(0, 'id', range(1, len(llm_csv)+1))
    llm_csv.to_csv(f"{out_dir}case3_anchor_{n_lost}lost_test.csv", index=False)

print("\n=== ALL ROBUSTNESS RESULTS ===")
print(json.dumps(results, indent=2))

# Save prompts for LLMs
prompts = {
    'noise': """You are predicting labels for a BLE RSSI test dataset with added Gaussian noise (sigma={sigma} dBm).

Task: {task_desc}

Attached CSV format:
- id: Row identifier
- time_based_rssi: One string per episode. Semicolon (;) separates time steps. Each step is timestamp,r1,r2,r3,r4 (RSSI in dBm for 4 BLE anchors). Blanks indicate missing values. NOTE: Gaussian noise has been added to RSSI values.

Output: Table with columns: id, predicted ({output_format}).

I will merge your output with held-out labels for evaluation.""",
    'anchor': """You are predicting labels for a BLE RSSI test dataset with simulated anchor failure ({n_lost} anchor(s) lost).

Task: {task_desc}

Attached CSV format:
- id: Row identifier
- time_based_rssi: One string per episode. Semicolon (;) separates time steps. Each step is timestamp,r1,r2,r3,r4 (RSSI in dBm for 4 BLE anchors). Blanks indicate missing values. NOTE: {n_lost} anchor(s) have been removed (their values are blank).

Output: Table with columns: id, predicted ({output_format}).

I will merge your output with held-out labels for evaluation."""
}

tasks = {
    'case1': ('Predict Facing in (0) or Facing out (1)', '0 or 1'),
    'case2': ('Predict In zone 4 (0) or Out zone 4 (1)', '0 or 1'),
    'case3': ('Predict the zone sequence (4 zone IDs, e.g. "4 3 2 1")', 'space-separated 4-digit sequence')
}

os.makedirs(f"{out_dir}prompts/", exist_ok=True)
for case in ['case1', 'case2', 'case3']:
    task_desc, output_fmt = tasks[case]
    for sigma in [6, 12]:
        prompt = prompts['noise'].format(sigma=sigma, task_desc=task_desc, output_format=output_fmt)
        with open(f"{out_dir}prompts/{case}_noise_{sigma}_prompt.txt", 'w') as f:
            f.write(prompt)
    for n_lost in [1, 2]:
        prompt = prompts['anchor'].format(n_lost=n_lost, task_desc=task_desc, output_format=output_fmt)
        with open(f"{out_dir}prompts/{case}_anchor_{n_lost}lost_prompt.txt", 'w') as f:
            f.write(prompt)

print("\nPrompts and CSVs saved to:", out_dir)
