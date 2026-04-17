import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

# File paths for all 3 cases
case1_path = 'c:/Users/worap/Documents/TSE/PaperIEEE/data/experiments/EXP_001_Case1_Room4/actions/action_001_01-Near-Facing-In-E.csv'
case2_path = 'c:/Users/worap/Documents/TSE/PaperIEEE/data/experiments/EXP_004_Case2_Boundary_Transition/actions/action_001_01_in_Room4_Cornor3.csv'
case3_path = 'c:/Users/worap/Documents/TSE/PaperIEEE/data/experiments/EXP_003_Case3_Trajectory/actions/action_003_03_R3-R4-R1-R2.csv'

def load_and_prep(path):
    import os
    if not os.path.exists(path):
        # Graceful fallback if we misguessed the Case 2 path
        return None
    df = pd.read_csv(path)
    if 'timestamp' in df.columns:
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df = df.set_index('timestamp')
    
    cols = ['S1_RSSI', 'S2_RSSI', 'S3_RSSI', 'S4_RSSI']
    for c in cols:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors='coerce')
            df[c] = df[c].interpolate(method='linear').ffill().bfill()
    return df

df1 = load_and_prep(case1_path)
df2 = load_and_prep(case2_path)
df3 = load_and_prep(case3_path)

# Trim initial spike from Case 2
if df2 is not None:
    trim_n = len(df2) // 5  # remove first 20%
    df2 = df2.iloc[trim_n:]

fig, axes = plt.subplots(1, 3, figsize=(15, 4), sharey=True)

colors = {'S1_RSSI': '#1f77b4', 'S2_RSSI': '#ff7f0e', 'S3_RSSI': '#2ca02c', 'S4_RSSI': '#d62728'}
labels = {'S1_RSSI': 'A1 (Zone A)', 'S2_RSSI': 'A2 (Zone B)', 'S3_RSSI': 'A3 (Zone C)', 'S4_RSSI': 'A4 (Zone D)'}
markers = {'S1_RSSI': 'o', 'S2_RSSI': 's', 'S3_RSSI': '^', 'S4_RSSI': 'x'}

def plot_df(ax, df, title):
    if df is None:
        ax.set_title(title + ' (Data missing)')
        return
    for c in ['S1_RSSI', 'S2_RSSI', 'S3_RSSI', 'S4_RSSI']:
        if c in df.columns and df[c].notna().sum() > 0:
            ax.plot(df.index, df[c], marker=markers[c], color=colors[c], label=labels[c], markersize=4, linewidth=1.5)
    ax.set_title(title)
    ax.set_xlabel('Time')
    ax.grid(True, linestyle='--', alpha=0.6)
    
    # Use MaxNLocator to limit the number of time labels (e.g., max 5 ticks)
    from matplotlib.ticker import MaxNLocator
    ax.xaxis.set_major_locator(MaxNLocator(nbins=5))
    ax.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M:%S'))

plot_df(axes[0], df1, 'Case 1: Body Orientation (Near, Facing In)')
plot_df(axes[1], df2, 'Case 2: Boundary Transition')
plot_df(axes[2], df3, 'Case 3: Trajectory Sequence')

axes[0].set_ylabel('RSSI (dBm)')
axes[2].legend(loc='lower right', fontsize='small')

plt.tight_layout(pad=0.5)
plt.savefig('c:/Users/worap/Documents/TSE/PaperIEEE/paper/combined_rssi_plot.pdf', bbox_inches='tight', pad_inches=0.02)
plt.close()
