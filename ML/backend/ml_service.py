import asyncio
import pandas as pd
import joblib
import os
import json

class MLEngine:
    def __init__(self):
        print("Starting ML Engine (Isolation Forest)...")
        model_path = '../ml_models/saved_models/isolation_forest_model.joblib'
        scaler_path = '../ml_models/saved_models/scaler.joblib'
        
        self.model = joblib.load(model_path)
        self.scaler = joblib.load(scaler_path)
        
        # Keep a rolling window of 12 for each truck
        self.history = {}
        
        self.cargo_thresholds = {
            "mRNA_Vaccine": 0.5,
            "Liquid_Antibiotics": 3.0,
            "Blood_Plasma": 1.5
        }

    async def run_inference(self, data):
        """Asynchronous inference engine using Isolation Forest."""
        truck_id = data["truck_id"]
        cargo_type = data["cargo_type"]
        
        if truck_id not in self.history:
            self.history[truck_id] = {
                "temp": [],
                "vib": []
            }
            
        h = self.history[truck_id]
        h["temp"].append(data["temperature_celsius"])
        h["vib"].append(data["vibration_g"])
        
        if len(h["temp"]) > 12:
            h["temp"].pop(0)
            h["vib"].pop(0)
            
        # Calculate rolling features
        temp_series = pd.Series(h["temp"])
        vib_series = pd.Series(h["vib"])
        
        temp_rolling_mean = temp_series.mean()
        temp_rolling_std = temp_series.std()
        if pd.isna(temp_rolling_std) or temp_rolling_std == 0.0:
            temp_rolling_std = 0.8  # Fallback for single data point
            
        vib_rolling_mean = vib_series.mean()
        
        features = [
            data["external_temperature"],
            data["temperature_celsius"],
            data["humidity_percent"],
            data["vibration_g"],
            temp_rolling_mean,
            temp_rolling_std,
            vib_rolling_mean
        ]
        
        # Predict
        df_features = pd.DataFrame([features], columns=[
            'external_temperature', 'temperature_celsius', 'humidity_percent', 'vibration_g',
            'temp_rolling_mean', 'temp_rolling_std', 'vib_rolling_mean'
        ])
        
        X_scaled = self.scaler.transform(df_features)
        
        # Async delay simulation for heavy inference
        await asyncio.sleep(0.01) 
        
        prediction = self.model.predict(X_scaled)[0] # 1 is normal, -1 is anomaly
        anomaly_score = self.model.score_samples(X_scaled)[0]
        
        # Determine risk level based on cargo threshold
        risk_level = "Normal"
        ttf = 100 # Time to failure percentage
        
        if prediction == -1:
            risk_level = "Warning"
            ttf = 40
            if anomaly_score < -0.65:
                risk_level = "Critical"
                ttf = 0
                
        # Calculate environmental stress for Bio-Climatic map
        thermal_delta = round(abs(data["external_temperature"] - data["temperature_celsius"]), 1)
        compressor_stress_pct = min(100, int(max(0, (thermal_delta - 10) * 3)))
                
        return {
            "prediction": int(prediction),
            "anomaly_score": float(anomaly_score),
            "risk_level": risk_level,
            "ttf_percentage": ttf,
            "thermal_delta": thermal_delta,
            "compressor_stress_pct": compressor_stress_pct
        }

ml_engine = MLEngine()
