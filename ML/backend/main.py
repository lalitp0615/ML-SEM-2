from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import asyncio
import json
import os

from ml_service import ml_engine
from blockchain_service import ledger

app = FastAPI(title="MediTrust-ML Clinical Intelligence Console")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TelemetryPayload(BaseModel):
    truck_id: str
    timestamp: str
    cargo_type: str
    external_temperature: float
    temperature_celsius: float
    humidity_percent: float
    vibration_g: float
    latitude: float
    longitude: float
    is_anomaly: int

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                pass

manager = ConnectionManager()
fleet_state = {}

# India highway corridor bounds for coordinate clamping (Land only)
INDIA_LAT_MIN, INDIA_LAT_MAX = 16.0, 26.0
INDIA_LON_MIN, INDIA_LON_MAX = 74.0, 82.0

@app.post("/api/ingest")
async def ingest_telemetry(payload: TelemetryPayload):
    data = payload.dict()
    
    # Clamp truck coordinates to India highway bounds
    data["latitude"] = max(INDIA_LAT_MIN, min(INDIA_LAT_MAX, data["latitude"]))
    data["longitude"] = max(INDIA_LON_MIN, min(INDIA_LON_MAX, data["longitude"]))
    
    # 1. Run ML Inference (Antigravity Pipeline)
    inference = await ml_engine.run_inference(data)
    data.update(inference)
    
    # 2. Blockchain Lockout
    if inference["risk_level"] == "Critical":
        if data["truck_id"] not in fleet_state or fleet_state[data["truck_id"]].get("risk_level") != "Critical":
            # Only add to ledger on state transition
            block = ledger.add_transaction(data["truck_id"], "CERTIFICATE REVOKED")
            data["ledger_event"] = block
    elif inference["risk_level"] == "Warning":
        if data["truck_id"] not in fleet_state or fleet_state[data["truck_id"]].get("risk_level") != "Warning":
            block = ledger.add_transaction(data["truck_id"], "WARNING DETECTED")
            data["ledger_event"] = block
            
    # Update fleet state
    fleet_state[data["truck_id"]] = data
    
    # 3. WebSocket Telemetry Push
    await manager.broadcast(json.dumps(data))
    
    return {"status": "success"}

@app.get("/api/dashboard")
async def get_dashboard_state():
    return {
        "fleet_state": fleet_state,
        "block_height": ledger.block_height,
        "chain": ledger.chain
    }

@app.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Mount frontend
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
os.makedirs(frontend_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

@app.get("/")
async def serve_frontend():
    return FileResponse(os.path.join(frontend_dir, "index.html"))
