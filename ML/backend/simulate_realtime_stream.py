import pandas as pd
import requests
import time
import sys

def simulate_stream():
    print("Starting IoT Telemetry Simulation Stream...")
    data_path = '../data_generation/dataset_output/sensor_data.csv'
    
    try:
        df = pd.read_csv(data_path)
    except Exception as e:
        print(f"Failed to load dataset: {e}")
        sys.exit(1)
        
    print(f"Loaded {len(df)} records. Streaming to Antigravity Engine...")
    
    # Sort by timestamp to simulate real-time sequence
    df = df.sort_values('timestamp')
    
    API_URL = "http://127.0.0.1:8000/api/ingest"
    
    # Group by simulated time ticks (we'll process a batch of trucks at once)
    # Since our data has 12 trucks per timestamp interval, we can step through it
    # Skip every N timestamps so truck movement is visible on the map
    # (each 5-min step only moves ~0.016°, invisible at zoom 5)
    # Skip fewer timestamps for slower, more realistic movement
    SKIP_FACTOR = 4
    unique_times = df['timestamp'].unique()[::SKIP_FACTOR]
    print(f"Streaming every {SKIP_FACTOR}th timestamp ({len(unique_times)} ticks)...")
    
    try:
        for t in unique_times:
            batch = df[df['timestamp'] == t]
            for _, row in batch.iterrows():
                payload = row.to_dict()
                try:
                    res = requests.post(API_URL, json=payload)
                except requests.exceptions.ConnectionError:
                    print("Connection refused. Is the FastAPI backend running?")
                    time.sleep(2)
                    break
            
            # Stream at 1.2 seconds per tick for a slightly slower pace
            time.sleep(1.2)
    except KeyboardInterrupt:
        print("Simulation stopped by user.")

if __name__ == "__main__":
    simulate_stream()
