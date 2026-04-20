import pandas as pd
import matplotlib.pyplot as plt
import os

df = pd.read_csv('c:/Users/worap/Documents/TSE/PaperIEEE/data/experiments/EXP_001_Case1_Room4/actions/action_001_01-Near-Facing-In-E.csv')
# Columns: timestamp,S1_RSSI,S2_RSSI,S3_RSSI,S4_RSSI
df['timestamp'] = pd.to_datetime(df['timestamp'])
df = df.set_index('timestamp')

plt.figure(figsize=(8, 4))
if 'S1_RSSI' in df.columns and df['S1_RSSI'].notna().sum() > 0:
    plt.plot(df.index, df['S1_RSSI'], marker='o', label='Anchor 1')
if 'S2_RSSI' in df.columns and df['S2_RSSI'].notna().sum() > 0:
    plt.plot(df.index, df['S2_RSSI'], marker='s', label='Anchor 2')
if 'S3_RSSI' in df.columns and df['S3_RSSI'].notna().sum() > 0:
    plt.plot(df.index, df['S3_RSSI'], marker='^', label='Anchor 3')
if 'S4_RSSI' in df.columns and df['S4_RSSI'].notna().sum() > 0:
    plt.plot(df.index, df['S4_RSSI'], marker='x', label='Anchor 4')

plt.title('RSSI Time Series for Action: Near, Facing In (East)')
plt.xlabel('Time')
plt.ylabel('RSSI (dBm)')
plt.legend()
plt.grid(True)
plt.tight_layout()
plt.savefig('c:/Users/worap/Documents/TSE/PaperIEEE/paper/rssi_plot.pdf')
plt.close()
