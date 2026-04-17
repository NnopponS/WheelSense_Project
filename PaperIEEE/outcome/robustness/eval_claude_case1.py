import pandas as pd
import numpy as np

# Load true labels
test_df = pd.read_csv("c:/Users/worap/Documents/TSE/PaperIEEE/outcome/case1/case1_test.csv")
# Add a fake 'ep' column 1 to 35 corresponding to row index (1-based) as per combine_for_llm.py output
test_df['ep'] = range(1, len(test_df) + 1)
true_labels_map = test_df.set_index('ep')['label'].to_dict()

# Load Claude predictions
pred_df = pd.read_csv("c:/Users/worap/Documents/TSE/PaperIEEE/outcome/robustness/combined/Claude_case1_robustness_predictions.csv")

# Parse conditions and calculate accuracy
results = {}

for _, row in pred_df.iterrows():
    pred_id = row['id']
    pred = int(row['predicted'])
    
    # parse condition and ep
    # format e.g., noise_2_ep1, anchor_1lost_ep1
    if "_ep" in pred_id:
        condition, ep_str = pred_id.rsplit("_ep", 1)
        ep = int(ep_str)
        true_label = int(true_labels_map[ep])
        
        if condition not in results:
            results[condition] = {'correct': 0, 'total': 0}
            
        if pred == true_label:
            results[condition]['correct'] += 1
        results[condition]['total'] += 1

# Print results
print("=== Claude Case 1 Robustness Accuracy ===")
for condition, stats in results.items():
    acc = (stats['correct'] / stats['total']) * 100
    print(f"{condition}: {acc:.2f}%")
