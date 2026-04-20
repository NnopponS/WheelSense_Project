import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

# Read Case 3 Action 3
csv_path = 'c:/Users/worap/Documents/TSE/PaperIEEE/data/experiments/EXP_003_Case3_Trajectory/actions/action_003_03_R3-R4-R1-R2.csv'
df = pd.read_csv(csv_path)

# Convert timestamp to datetime and set as index
df['timestamp'] = pd.to_datetime(df['timestamp'])
df = df.set_index('timestamp')

# Interpolate missing values to ensure the lines are continuous
cols = ['S1_RSSI', 'S2_RSSI', 'S3_RSSI', 'S4_RSSI']
for c in cols:
    if c in df.columns:
        df[c] = pd.to_numeric(df[c], errors='coerce')
        # Interpolate linearly, then forward and backward fill remaining edge NaNs
        df[c] = df[c].interpolate(method='linear').ffill().bfill()

plt.figure(figsize=(8, 4))
if 'S1_RSSI' in df.columns and df['S1_RSSI'].notna().sum() > 0:
    plt.plot(df.index, df['S1_RSSI'], marker='o', label='Anchor 1 (Zone A)', markersize=4)
if 'S2_RSSI' in df.columns and df['S2_RSSI'].notna().sum() > 0:
    plt.plot(df.index, df['S2_RSSI'], marker='s', label='Anchor 2 (Zone B)', markersize=4)
if 'S3_RSSI' in df.columns and df['S3_RSSI'].notna().sum() > 0:
    plt.plot(df.index, df['S3_RSSI'], marker='^', label='Anchor 3 (Zone C)', markersize=4)
if 'S4_RSSI' in df.columns and df['S4_RSSI'].notna().sum() > 0:
    plt.plot(df.index, df['S4_RSSI'], marker='x', label='Anchor 4 (Zone D)', markersize=4)

plt.title('RSSI Time Series for Trajectory (Zone C $\\rightarrow$ D $\\rightarrow$ A $\\rightarrow$ B)')
plt.xlabel('Time')
plt.ylabel('RSSI (dBm)')

# Formatting x-axis to be more legible for time series
plt.gca().xaxis.set_major_formatter(mdates.DateFormatter('%H:%M:%S'))

plt.legend()
plt.grid(True)
plt.tight_layout()
plt.savefig('c:/Users/worap/Documents/TSE/PaperIEEE/paper/rssi_plot.pdf')
plt.close()
