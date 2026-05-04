# MediTrust-ML: Clinical Intelligence Console

> *"MediTrust-ML is a high-velocity Clinical Intelligence Console. We utilized asynchronous Python to create an 'antigravity' data pipeline, allowing us to stream live IoT telemetry and execute machine learning inference in milliseconds. By wrapping this predictive Isolation Forest model and our Solidity Blockchain Ledger inside a sterile, laboratory-grade interface, we provide logistics managers with the exact diagnostic proof they need to guarantee the biological integrity of global medicine shipments."*

## Architecture

This project is a complete rewrite prioritizing high performance and zero frontend crashes:

1. **The Antigravity Engine (Backend)**: Built with FastAPI and Uvicorn. Uses native WebSockets to stream thousands of data points to the browser instantly.
2. **Predictive ML**: Scikit-Learn `IsolationForest` runs asynchronously to detect mechanical fatigue and thermal breaches in real-time.
3. **Immutable Ledger**: A simulated blockchain logs "Certificate Revoked" events the moment the ML model detects a critical failure.
4. **Clinical UI**: A vanilla HTML/CSS/JS frontend using Leaflet for mapping and Canvas for micro-sparklines. It utilizes a glassmorphic, pharmaceutical-grade design without the overhead or fragility of heavy frameworks.

## Quick Start

1. Open PowerShell and navigate to the project directory.
2. Run the launcher:
   ```powershell
   .\run.ps1
   ```
3. Open your browser to `http://localhost:8000` to view the Clinical Console.

## Features
- **Neural Map**: Live topographic tracking of shipments.
- **Molecular Ledger**: Auto-scrolling, immutable event log.
- **Vial TTF Indicators**: Visualizes the predicted time-to-failure for cooling compressors.
- **Dynamic Stability**: Change cargo profiles (e.g. mRNA Vaccine) to instantly tighten the ML decision boundary.
