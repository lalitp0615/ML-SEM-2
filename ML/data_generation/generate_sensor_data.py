import pandas as pd
import numpy as np
import os
from datetime import datetime, timedelta

def generate_telemetry_data(num_trucks=12, days=30, interval_mins=5):
    """Generates synthetic IoT telemetry data for pharmaceutical trucks."""
    print("Initializing Antigravity Data Engine...")
    
    # Create output directory
    output_dir = "dataset_output"
    os.makedirs(output_dir, exist_ok=True)
    
    records = []
    start_time = datetime.now() - timedelta(days=days)
    
    # Cargo profiles
    cargo_profiles = {
        "mRNA_Vaccine": {"temp_mean": -70.0, "temp_std": 2.0, "vib_mean": 0.5, "vib_std": 0.2},
        "Liquid_Antibiotics": {"temp_mean": 5.0, "temp_std": 1.5, "vib_mean": 0.8, "vib_std": 0.3},
        "Blood_Plasma": {"temp_mean": -20.0, "temp_std": 1.0, "vib_mean": 0.4, "vib_std": 0.1}
    }
    
    # Wider landmass corridor (covering most of India)
    lat_min, lat_max = 8.0, 32.0
    lon_min, lon_max = 68.0, 90.0
    center_lat, center_lon = 21.0, 78.0
    
    total_steps = (days * 24 * 60) // interval_mins
    
    for truck_id in range(1, num_trucks + 1):
        cargo_type = list(cargo_profiles.keys())[truck_id % len(cargo_profiles)]
        profile = cargo_profiles[cargo_type]
        
        current_time = start_time
        
        # Initial coordinates spread widely across India
        lat = np.random.uniform(lat_min + 2, lat_max - 2)
        lon = np.random.uniform(lon_min + 2, lon_max - 2)
        
        # Velocity vectors (Increased for visibility)
        v_lat = np.random.uniform(-0.012, 0.012)
        v_lon = np.random.uniform(-0.012, 0.012)
        
        # Base external weather for this truck's starting zone
        base_ext_temp = np.random.choice([42.0, 35.0, 25.0, 15.0, 5.0, -10.0])
        
        print(f"Generating pipeline for Truck-{truck_id:03d} [{cargo_type}]")
        
        for step in range(total_steps):
            # Normal variations
            temp = np.random.normal(profile["temp_mean"], profile["temp_std"])
            humidity = np.random.normal(45.0, 5.0)
            vib = np.random.normal(profile["vib_mean"], profile["vib_std"])
            
            # Weather fluctuates slightly over time
            ext_temp = base_ext_temp + np.random.normal(0, 2.0)
            
            # The "Chain Reaction": High Thermal Delta causes Compressor Overdrive -> High Vibration
            thermal_delta = abs(ext_temp - temp)
            if thermal_delta > 35.0:
                vib += (thermal_delta - 35.0) * 0.08 + np.random.uniform(0.2, 0.5)
            elif thermal_delta > 25.0:
                vib += np.random.uniform(0.1, 0.3)
            
            # Simulate anomalies
            is_anomaly = 0
            if np.random.random() < 0.08:
                is_anomaly = 1
                anomaly_type = np.random.choice(["temp_spike", "vib_burst", "compressor_fail"])
                if anomaly_type == "temp_spike":
                    temp += np.random.uniform(8.0, 15.0)
                elif anomaly_type == "vib_burst":
                    vib += np.random.uniform(3.0, 6.0)
                elif anomaly_type == "compressor_fail":
                    temp += np.random.uniform(5.0, 10.0)
                    vib -= np.random.uniform(0.2, 0.4)
            
            # Removed centering force to allow full geographic exploration
            
            # Move truck directionally
            lat += v_lat + np.random.normal(0, 0.001)
            lon += v_lon + np.random.normal(0, 0.001)
            
            # Keep within bounds (Bounce effect)
            if lat < lat_min or lat > lat_max: v_lat *= -0.8
            if lon < lon_min or lon > lon_max: v_lon *= -0.8
            
            # Final hard clip to safety
            lat = np.clip(lat, lat_min, lat_max)
            lon = np.clip(lon, lon_min, lon_max)
            
            records.append({
                "truck_id": f"TRK-{truck_id:03d}",
                "timestamp": current_time.isoformat(),
                "cargo_type": cargo_type,
                "external_temperature": round(ext_temp, 2),
                "temperature_celsius": round(temp, 2),
                "humidity_percent": round(humidity, 2),
                "vibration_g": round(vib, 2),
                "latitude": round(lat, 4),
                "longitude": round(lon, 4),
                "is_anomaly": is_anomaly
            })
            
            current_time += timedelta(minutes=interval_mins)

    df = pd.DataFrame(records)
    output_path = os.path.join(output_dir, "sensor_data.csv")
    df.to_csv(output_path, index=False)
    
    print(f"\n[SUCCESS] Generated {len(df):,} clinical telemetry records.")
    print(f"[SUCCESS] Exported to: {output_path}")

if __name__ == "__main__":
    generate_telemetry_data()
