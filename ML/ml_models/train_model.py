import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import joblib
import os

def engineer_features(df):
    """Generates rolling window features for time-series anomaly detection."""
    df = df.sort_values(by=['truck_id', 'timestamp'])
    
    # Calculate rolling statistics (simulating historical context)
    df['temp_rolling_mean'] = df.groupby('truck_id')['temperature_celsius'].transform(lambda x: x.rolling(12, min_periods=1).mean())
    df['temp_rolling_std'] = df.groupby('truck_id')['temperature_celsius'].transform(lambda x: x.rolling(12, min_periods=1).std().fillna(0.8)) # fallback std
    df['vib_rolling_mean'] = df.groupby('truck_id')['vibration_g'].transform(lambda x: x.rolling(12, min_periods=1).mean())
    
    return df

def train_ml_engine():
    print("Initializing Clinical Isolation Forest Training...")
    
    data_path = '../data_generation/dataset_output/sensor_data.csv'
    if not os.path.exists(data_path):
        print(f"Error: Dataset not found at {data_path}")
        return
        
    df = pd.read_csv(data_path)
    print(f"Loaded {len(df)} records. Engineering rolling features...")
    
    df = engineer_features(df)
    
    # Feature Selection
    features = [
        'external_temperature',
        'temperature_celsius', 
        'humidity_percent', 
        'vibration_g',
        'temp_rolling_mean',
        'temp_rolling_std',
        'vib_rolling_mean'
    ]
    
    X = df[features]
    
    print("Scaling features...")
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    X_scaled_df = pd.DataFrame(X_scaled, columns=features)
    
    print("Training Isolation Forest Model (Contamination=0.08)...")
    # n_jobs=-1 uses all CPU cores for faster training
    model = IsolationForest(n_estimators=200, contamination=0.08, random_state=42, n_jobs=-1)
    model.fit(X_scaled_df)
    
    # Save the artifacts
    output_dir = 'saved_models'
    os.makedirs(output_dir, exist_ok=True)
    
    joblib.dump(model, os.path.join(output_dir, 'isolation_forest_model.joblib'))
    joblib.dump(scaler, os.path.join(output_dir, 'scaler.joblib'))
    
    print(f"[SUCCESS] ML Engine ready. Model and Scaler saved to {output_dir}/")

if __name__ == "__main__":
    train_ml_engine()
