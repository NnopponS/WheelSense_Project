"""
Combine all robustness test CSVs into 3 files (one per case).
Each row has an ID like: noise_2_ep1, noise_4_ep1, ..., anchor_1lost_ep1, ...
One prompt per case references all scenarios.
"""
import pandas as pd
import os

base = "c:/Users/worap/Documents/TSE/PaperIEEE/outcome/robustness/"
out_dir = "c:/Users/worap/Documents/TSE/PaperIEEE/outcome/robustness/combined/"
os.makedirs(out_dir, exist_ok=True)

cases = {
    'case1': {
        'task': 'Predict Facing in (0) or Facing out (1)',
        'output': '0 or 1',
    },
    'case2': {
        'task': 'Predict In zone 4 (0) or Out zone 4 (1)',
        'output': '0 or 1',
    },
    'case3': {
        'task': 'Predict the zone sequence as 4 space-separated digits (e.g. "4 3 2 1")',
        'output': 'space-separated 4-digit sequence',
    },
}

for case, info in cases.items():
    all_rows = []
    
    # Noise scenarios
    for sigma in [2, 4, 6, 8, 10, 12]:
        csv_path = f"{base}{case}_noise_{sigma}_test.csv"
        if os.path.exists(csv_path):
            df = pd.read_csv(csv_path)
            for _, row in df.iterrows():
                all_rows.append({
                    'id': f"noise_{sigma}_ep{row['id']}",
                    'time_based_rssi': row['time_based_rssi']
                })
    
    # Anchor failure scenarios
    for n_lost in [1, 2]:
        csv_path = f"{base}{case}_anchor_{n_lost}lost_test.csv"
        if os.path.exists(csv_path):
            df = pd.read_csv(csv_path)
            for _, row in df.iterrows():
                all_rows.append({
                    'id': f"anchor_{n_lost}lost_ep{row['id']}",
                    'time_based_rssi': row['time_based_rssi']
                })
    
    combined_df = pd.DataFrame(all_rows)
    csv_out = f"{out_dir}{case}_robustness_test.csv"
    combined_df.to_csv(csv_out, index=False)
    print(f"{case}: {len(combined_df)} rows -> {csv_out}")
    
    # Create combined prompt
    prompt = f"""You are predicting labels for a BLE RSSI robustness test dataset ({case.replace('case','Case ')}).

Task: {info['task']}

This file contains episodes under different signal degradation conditions:
- noise_{{sigma}}_ep{{N}}: Gaussian noise (sigma dBm) added to RSSI values. Sigma = 2, 4, 6, 8, 10, 12.
- anchor_1lost_ep{{N}}: 1 anchor failed (RSSI = -100 for that anchor).
- anchor_2lost_ep{{N}}: 2 anchors failed (RSSI = -100 for those anchors).

Each condition has 35 episodes (ep1..ep35). Total rows = 6 noise levels x 35 + 2 anchor conditions x 35 = 280 rows.

CSV format:
- id: Identifies condition and episode (e.g. "noise_6_ep12", "anchor_2lost_ep5").
- time_based_rssi: Semicolon-separated time steps. Each step is timestamp,r1,r2,r3,r4 (RSSI in dBm for 4 BLE anchors). Blanks or -100 indicate missing/failed anchors.

Output: Table with exactly two columns:
- id: Same as input (keep exact id strings).
- predicted: Your prediction ({info['output']}).

I will split your output by condition to evaluate accuracy per degradation level."""
    
    prompt_path = f"{out_dir}{case}_robustness_prompt.txt"
    with open(prompt_path, 'w') as f:
        f.write(prompt)
    print(f"  Prompt -> {prompt_path}")

print("\nDone! 3 CSVs + 3 prompts in:", out_dir)
