# MediTrust-ML Launcher

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "   MediTrust-ML Clinical Console" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 1. Start FastAPI Backend in background
Write-Host "Starting Antigravity Backend (FastAPI)..." -ForegroundColor Green
Start-Process -NoNewWindow -FilePath "py" -ArgumentList "-3.10", "-m", "uvicorn", "main:app", "--reload" -WorkingDirectory ".\backend"

# Wait a moment for server to bind
Start-Sleep -Seconds 3

# 2. Start IoT Telemetry Streamer in foreground
Write-Host "Starting IoT Telemetry Simulation..." -ForegroundColor Green
Set-Location ".\backend"
py -3.10 simulate_realtime_stream.py

Write-Host "Simulation ended." -ForegroundColor Yellow
