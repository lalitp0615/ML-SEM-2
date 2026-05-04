let map;
let markers = {};
let sparklineHistories = {}; // { truck_id: [temps] }
let truckStates = {}; // Stores latest full data per truck
let ws;
let currentCargoFilter = "ALL";
let scatterChartInstance = null;
let kineticChartInstance = null;
let spectrogramChartInstance = null;
let degradationChartInstance = null;
let sortColumn = null;
let sortDirection = 1;
let activeView = 'mission-control';
let activeDiagTruck = null;

// India geographic bounds for clamping truck positions (Expanded coverage)
const INDIA_BOUNDS = { latMin: 8.0, latMax: 32.0, lonMin: 68.0, lonMax: 90.0 };
function clampToIndia(lat, lon) {
    return [
        Math.max(INDIA_BOUNDS.latMin, Math.min(INDIA_BOUNDS.latMax, lat)),
        Math.max(INDIA_BOUNDS.lonMin, Math.min(INDIA_BOUNDS.lonMax, lon))
    ];
}

let climateMap = null;
let climateMarkers = {};
let weatherHeatLayer = null;

// DOM Elements
const activeShipmentsEl = document.getElementById('active-shipments');
const blockHeightEl = document.getElementById('block-height');
const ledgerScrollEl = document.getElementById('ledger-scroll');
const telemetryBodyEl = document.getElementById('telemetry-body');
const modalOverlay = document.getElementById('drill-down-modal');

// Initialize Map
function initMap() {
    // Fixed India view - locked bounds so map never drifts
    const indiaBounds = L.latLngBounds([8, 68], [35, 97]);
    map = L.map('map', {
        maxBounds: indiaBounds.pad(0.1),
        maxBoundsViscosity: 1.0,
        minZoom: 4,
        maxZoom: 12
    }).setView([22.0, 78.5], 5);
    
    // Light clinical map tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);
    
    // Initialize Bio-Climatic Map
    climateMap = L.map('climate-map', {zoomControl: false}).setView([21.0, 78.0], 5);
    // Use Dark Matter to simulate radar screen
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CartoDB'
    }).addTo(climateMap);
    
    // Initialize Heatmap
    try {
        if(L.heatLayer) {
            weatherHeatLayer = L.heatLayer([], {
                radius: 60,
                blur: 40,
                maxZoom: 10,
                max: 1.0,
                gradient: {0.2: 'blue', 0.4: 'cyan', 0.6: 'lime', 0.8: 'yellow', 1.0: 'red'}
            }).addTo(climateMap);
        }
    } catch(e) {
        console.error("Heatmap plugin not loaded", e);
    }
}

// Connect WebSocket
function connectWebSocket() {
    ws = new WebSocket('ws://localhost:8000/ws/telemetry');
    
    ws.onopen = () => console.log('Antigravity WS Connected');
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        processTelemetry(data);
    };
    
    ws.onclose = () => {
        console.log('WS Disconnected. Reconnecting in 2s...');
        setTimeout(connectWebSocket, 2000);
    };
}

// Process Incoming Data
function processTelemetry(data) {
    // Clamp coordinates immediately so all views use bounded positions
    const [clampedLat, clampedLon] = clampToIndia(data.latitude, data.longitude);
    data.latitude = clampedLat;
    data.longitude = clampedLon;
    
    truckStates[data.truck_id] = data; // Store full state for click events
    
    updateSystemVitals(data);
    
    // Check if it passes filter
    if (currentCargoFilter !== "ALL" && data.cargo_type !== currentCargoFilter) {
        // If it doesn't match filter, maybe dim marker or hide it? 
        // For now, let's just update the map but hide from table
        updateMapMarker(data, false);
        let row = document.getElementById(`row-${data.truck_id}`);
        if(row) row.style.display = 'none';
        return;
    }
    
    updateMapMarker(data, true);
    updateTelemetryTable(data);
    
    if(data.ledger_event) {
        addLedgerBlock(data.ledger_event);
    }
    
    // Update Diagnostics if view is active
    if(activeView === 'diagnostics' && activeDiagTruck === data.truck_id) {
        updateDiagnosticsView();
    }
    
    // Update Climate Map if view is active
    if(activeView === 'fleet-map') {
        updateClimateMarker(data);
    }
}

// Update Vitals
function updateSystemVitals(data) {
    // Only fetch full dashboard state occasionally to update counts if needed, 
    // but for Antigravity, we manage state client-side for speed.
    activeShipmentsEl.innerText = Object.keys(markers).length || 12; 
}

// Map Markers
function updateMapMarker(data, isVisible) {
    const { truck_id, risk_level } = data;
    // Clamp coordinates to India bounds so trucks don't fly off the map
    const [latitude, longitude] = clampToIndia(data.latitude, data.longitude);
    
    let markerClass = 'marker-safe';
    if(risk_level === 'Warning') markerClass = 'marker-warn';
    if(risk_level === 'Critical') markerClass = 'marker-crit';
    if(!isVisible) markerClass += ' marker-dimmed'; // add CSS for this later or just set opacity
    
    const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div class="truck-marker ${markerClass}" style="opacity: ${isVisible ? 1 : 0.2}"></div>`,
        iconSize: [16, 8],
        iconAnchor: [8, 4]
    });

    const tooltipContent = `<div style="font-family: 'Inter', sans-serif; font-size: 0.8rem;">
        <b>${truck_id}</b> | ${data.temperature_celsius.toFixed(1)}°C | ${risk_level}
    </div>`;

    if (markers[truck_id]) {
        markers[truck_id].setLatLng([latitude, longitude]);
        markers[truck_id].setIcon(icon);
        markers[truck_id].setTooltipContent(tooltipContent);
    } else {
        markers[truck_id] = L.marker([latitude, longitude], {icon: icon})
            .bindTooltip(tooltipContent, {direction: 'top', offset: [0, -10]})
            .addTo(map)
            .on('click', () => openDrillDown(truckStates[truck_id]));
    }
}

// Ledger UI
function addLedgerBlock(block) {
    const el = document.createElement('div');
    let statusClass = 'tx-block';
    if(block.event.includes('REVOKED')) statusClass += ' revoked';
    if(block.event.includes('WARNING')) statusClass += ' warning';
    
    el.className = statusClass;
    el.setAttribute('onclick', `flyToTruck('${block.truck_id}')`);
    el.innerHTML = `
        <div class="tx-header">
            <span class="mono">BLK #${block.block_height}</span>
            <span class="mono">${block.truck_id}</span>
        </div>
        <div class="tx-event">${block.event}</div>
        <div class="tx-hash">${block.tx_hash}</div>
    `;
    
    ledgerScrollEl.prepend(el);
    blockHeightEl.innerText = `#${block.block_height}`;
    
    if(ledgerScrollEl.children.length > 50) {
        ledgerScrollEl.removeChild(ledgerScrollEl.lastChild);
    }
}

// Telemetry Table
function updateTelemetryTable(data) {
    const { truck_id, cargo_type, risk_level, temperature_celsius, vibration_g, ttf_percentage } = data;
    
    // Update Sparkline History
    if(!sparklineHistories[truck_id]) sparklineHistories[truck_id] = [];
    sparklineHistories[truck_id].push(temperature_celsius);
    if(sparklineHistories[truck_id].length > 20) sparklineHistories[truck_id].shift();

    let row = document.getElementById(`row-${truck_id}`);
    
    let badgeClass = 'safe';
    if(risk_level === 'Warning') badgeClass = 'warn';
    if(risk_level === 'Critical') badgeClass = 'crit';
    
    let ttfColor = '#10B981';
    if(ttf_percentage < 50) ttfColor = '#F59E0B';
    if(ttf_percentage < 20) ttfColor = '#EF4444';

    if (!row) {
        row = document.createElement('tr');
        row.id = `row-${truck_id}`;
        // We will append it later, sorting might reorder
    }
    
    // Calculate hours for TTF label (assuming 100% = ~24h for demo)
    const ttfHours = Math.floor(ttf_percentage * 0.24);
    
    row.innerHTML = `
        <td class="mono cursor-pointer" onclick="openDrillDown(truckStates['${truck_id}'])" style="color:var(--caduceus-blue);text-decoration:underline;cursor:pointer;">${truck_id}</td>
        <td>${cargo_type.replace('_', ' ')}</td>
        <td><span class="badge ${badgeClass}">${risk_level}</span></td>
        <td class="mono">${temperature_celsius.toFixed(1)}</td>
        <td class="mono">${vibration_g.toFixed(2)}</td>
        <td><canvas id="spark-${truck_id}" width="80" height="20"></canvas></td>
        <td>
            <div class="ttf-container">
                <div class="ttf-vial">
                    <div class="ttf-liquid" style="width: ${ttf_percentage}%; background-color: ${ttfColor}"></div>
                </div>
                <div class="ttf-label">${ttfHours}h</div>
            </div>
        </td>
    `;
    
    // Only sort/append if it's new, otherwise let sortTable handle order
    if(!document.getElementById(`row-${truck_id}`)) {
        telemetryBodyEl.appendChild(row);
    }
    
    // Maintain filter visibility
    if (currentCargoFilter !== "ALL" && cargo_type !== currentCargoFilter) {
        row.style.display = 'none';
    } else {
        row.style.display = 'table-row';
    }
    
    if(sortColumn) {
        sortTable(sortColumn, true);
    }

    // Must draw sparkline AFTER element is in DOM
    setTimeout(() => { drawSparkline(`spark-${truck_id}`, sparklineHistories[truck_id]); }, 0);
}

// Canvas Sparkline
function drawSparkline(canvasId, dataPoints) {
    const canvas = document.getElementById(canvasId);
    if(!canvas || dataPoints.length === 0) return;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const min = Math.min(...dataPoints);
    const max = Math.max(...dataPoints);
    const range = (max - min) || 1;
    
    const stepX = canvas.width / (20 - 1); // 20 max points
    
    // Draw Area gradient
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, 'rgba(42, 92, 130, 0.4)');
    grad.addColorStop(1, 'rgba(42, 92, 130, 0.0)');
    
    ctx.beginPath();
    ctx.moveTo(0, canvas.height);
    dataPoints.forEach((val, i) => {
        const x = i * stepX;
        const y = canvas.height - ((val - (min - range*0.1)) / (range * 1.2)) * canvas.height;
        ctx.lineTo(x, y);
    });
    ctx.lineTo(canvas.width, canvas.height);
    ctx.fillStyle = grad;
    ctx.fill();
    
    // Draw Line
    ctx.beginPath();
    ctx.strokeStyle = '#2A5C82';
    ctx.lineWidth = 2;
    dataPoints.forEach((val, i) => {
        const x = i * stepX;
        const y = canvas.height - ((val - (min - range*0.1)) / (range * 1.2)) * canvas.height;
        if(i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
    
    // Add text info
    ctx.fillStyle = '#64748B';
    ctx.font = '9px Inter';
    ctx.fillText(`${min.toFixed(1)}°`, 2, canvas.height - 2);
}

// Modal Drill Down
function openDrillDown(data) {
    // In a real app, fetch latest data for truck if clicked from table
    // For demo, we just use the passed event data
    if(!data.risk_level) return; // Ignore clicks that don't have full data
    
    document.getElementById('modal-truck-id').innerText = data.truck_id;
    
    const badge = document.getElementById('modal-badge');
    badge.innerText = data.risk_level;
    badge.className = 'badge';
    if(data.risk_level === 'Normal') badge.classList.add('safe');
    if(data.risk_level === 'Warning') badge.classList.add('warn');
    if(data.risk_level === 'Critical') badge.classList.add('crit');
    
    document.getElementById('modal-cargo').innerText = data.cargo_type.replace('_', ' ');
    
    let tol = "±1.0°C";
    if(data.cargo_type === 'mRNA_Vaccine') tol = "±0.5°C";
    if(data.cargo_type === 'Liquid_Antibiotics') tol = "±3.0°C";
    document.getElementById('modal-tolerance').innerText = tol;
    
    // Set Blockchain TX Hash
    if (data.ledger_event) {
        document.getElementById('modal-tx-hash').innerText = data.ledger_event.tx_hash;
    } else {
        document.getElementById('modal-tx-hash').innerText = "0x" + Array.from({length: 40}, () => Math.floor(Math.random()*16).toString(16)).join('');
    }
    
    drawKineticChart(data.truck_id);
    drawScatterPlot(data);
    
    modalOverlay.classList.remove('hidden');
}

function closeModal() {
    modalOverlay.classList.add('hidden');
}

function flyToTruck(truck_id) {
    if(!markers[truck_id] || !truckStates[truck_id]) return;
    map.setView(markers[truck_id].getLatLng(), 12, { animate: true, duration: 1.5 });
    openDrillDown(truckStates[truck_id]);
}

function drawKineticChart(truck_id) {
    const canvas = document.getElementById('kinetic-canvas');
    const ctx = canvas.getContext('2d');
    
    if (kineticChartInstance) {
        kineticChartInstance.destroy();
    }

    const dataPoints = sparklineHistories[truck_id] || [];
    const labels = dataPoints.map((_, i) => `-${(dataPoints.length - i) * 5}s`);

    kineticChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Temperature (°C)',
                data: dataPoints,
                borderColor: '#2A5C82',
                backgroundColor: 'rgba(42, 92, 130, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHitRadius: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { display: false },
                y: { display: true, grid: { color: 'rgba(0,0,0,0.05)' } }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function drawScatterPlot(data) {
    const canvas = document.getElementById('scatter-canvas');
    const ctx = canvas.getContext('2d');
    
    if (scatterChartInstance) {
        scatterChartInstance.destroy();
    }
    
    // Generate historical background points dynamically
    const historicalPoints = Array.from({length: 100}, () => ({
        x: data.temperature_celsius + (Math.random() - 0.5) * 10,
        y: data.vibration_g + (Math.random() - 0.5) * 2
    }));
    
    // Current live point
    const currentPoint = {
        x: data.temperature_celsius,
        y: data.vibration_g
    };
    
    let ptColor = '#10B981';
    if(data.risk_level === 'Warning') ptColor = '#F59E0B';
    if(data.risk_level === 'Critical') ptColor = '#EF4444';

    scatterChartInstance = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Historical Fleet Norms',
                data: historicalPoints,
                backgroundColor: 'rgba(42, 92, 130, 0.2)',
                pointRadius: 3
            }, {
                label: `Current Target: ${data.truck_id}`,
                data: [currentPoint],
                backgroundColor: ptColor,
                borderColor: '#1E293B',
                borderWidth: 2,
                pointRadius: 8,
                pointHoverRadius: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Temperature (°C)' },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                y: {
                    title: { display: true, text: 'Vibration (g)' },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                }
            },
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `Temp: ${ctx.raw.x.toFixed(2)}°C | Vib: ${ctx.raw.y.toFixed(2)}g`
                    }
                }
            }
        }
    });
}

// Init
window.onload = () => {
    initMap();
    connectWebSocket();
    
    // Setup Diagnostics Truck Selector
    document.getElementById('diag-truck-selector').addEventListener('change', (e) => {
        activeDiagTruck = e.target.value;
        updateDiagnosticsView();
    });
    
    document.getElementById('cargo-selector').addEventListener('change', (e) => {
        currentCargoFilter = e.target.value;
        // Hide non-matching rows in table immediately
        Object.keys(truckStates).forEach(tid => {
            let row = document.getElementById(`row-${tid}`);
            if (row) {
                if (currentCargoFilter === "ALL" || truckStates[tid].cargo_type === currentCargoFilter) {
                    row.style.display = 'table-row';
                    updateMapMarker(truckStates[tid], true);
                } else {
                    row.style.display = 'none';
                    updateMapMarker(truckStates[tid], false);
                }
            }
        });
    });
};

// Table Sorting
function sortTable(column, maintainDirection = false) {
    if(!maintainDirection) {
        if(sortColumn === column) {
            sortDirection *= -1;
        } else {
            sortColumn = column;
            sortDirection = 1;
        }
    }
    
    const rows = Array.from(telemetryBodyEl.children);
    rows.sort((a, b) => {
        const truckIdA = a.id.replace('row-', '');
        const truckIdB = b.id.replace('row-', '');
        const dataA = truckStates[truckIdA];
        const dataB = truckStates[truckIdB];
        
        if(!dataA || !dataB) return 0;
        
        let valA = dataA[column];
        let valB = dataB[column];
        
        // Custom sort logic for risk level
        if(column === 'risk_level') {
            const riskWeight = { 'Critical': 3, 'Warning': 2, 'Normal': 1 };
            valA = riskWeight[valA];
            valB = riskWeight[valB];
        }
        
        if (valA < valB) return -1 * sortDirection;
        if (valA > valB) return 1 * sortDirection;
        return 0;
    });
    
    rows.forEach(row => telemetryBodyEl.appendChild(row));
}

// ==========================================
// NEW FEATURE: Multi-View & Routing
// ==========================================
function switchView(viewId, event) {
    if(event) event.preventDefault();
    activeView = viewId;
    
    // Update Nav UI
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    if(event) event.currentTarget.classList.add('active');
    
    // Toggle DOM visibility
    document.getElementById('view-mission-control').className = (viewId === 'mission-control') ? 'view-active' : 'view-hidden';
    document.getElementById('view-diagnostics').className = (viewId === 'diagnostics') ? 'view-active' : 'view-hidden';
    
    // Fleet map uses flex for layout
    const fm = document.getElementById('view-fleet-map');
    if (viewId === 'fleet-map') {
        fm.className = 'view-active';
        fm.style.display = 'flex';
        setTimeout(() => { if(climateMap) climateMap.invalidateSize(); }, 100);
        
        // Populate existing markers
        Object.values(truckStates).forEach(ts => updateClimateMarker(ts));
    } else {
        fm.className = 'view-hidden';
        fm.style.display = 'none';
        document.getElementById('impact-panel').style.display = 'none';
    }
    
    if(viewId === 'mission-control') {
        // Map needs to know container resized if it was hidden
        setTimeout(() => { if(map) map.invalidateSize(); }, 100);
    } else if (viewId === 'diagnostics') {
        populateDiagSelector();
    }
}

// ==========================================
// NEW FEATURE: Regulatory Export (Bio-Cert)
// ==========================================
function exportBioCertificate() {
    let csvContent = "data:text/csv;charset=utf-8,";
    // Header
    csvContent += "Timestamp,Truck_ID,Cargo,Temp_C,Vib_g,Risk_Level,Ledger_TX_Hash\n";
    
    // Get all known states
    Object.values(truckStates).forEach(ts => {
        let timestamp = new Date().toISOString(); // Simulated time
        let tx = ts.ledger_event ? ts.ledger_event.tx_hash : "Verified_In_Memory_Buffer";
        let row = `${timestamp},${ts.truck_id},${ts.cargo_type},${ts.temperature_celsius.toFixed(2)},${ts.vibration_g.toFixed(2)},${ts.risk_level},${tx}`;
        csvContent += row + "\n";
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Bio_Integrity_Certificate_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==========================================
// NEW FEATURE: Deep-Dive Diagnostics
// ==========================================
function populateDiagSelector() {
    const sel = document.getElementById('diag-truck-selector');
    const trucks = Object.keys(truckStates).sort();
    
    // Remember previous selection if possible
    const prev = sel.value;
    sel.innerHTML = '';
    
    trucks.forEach(t => {
        let opt = document.createElement('option');
        opt.value = t;
        opt.innerText = t;
        sel.appendChild(opt);
    });
    
    if (trucks.includes(prev)) {
        sel.value = prev;
        activeDiagTruck = prev;
    } else if (trucks.length > 0) {
        sel.value = trucks[0];
        activeDiagTruck = trucks[0];
    }
    
    if(activeDiagTruck) updateDiagnosticsView();
}

function calculateMKT(temperatures) {
    if(!temperatures || temperatures.length === 0) return "--";
    // Simulated MKT using Arrhenius Equation approximation
    // MKT = dH/R / -ln( (e^(-dH/RT1) + e^(-dH/RT2) ... ) / n )
    // For pharma dashboard, we calculate a weighted non-linear average.
    const deltaH = 83.144; // activation energy kJ/mol
    const R = 0.0083144; // universal gas constant kJ/mol-K
    
    let sumExp = 0;
    temperatures.forEach(t => {
        let tKelvin = t + 273.15;
        sumExp += Math.exp(-deltaH / (R * tKelvin));
    });
    
    let mktKelvin = (-deltaH / R) / Math.log(sumExp / temperatures.length);
    let mktCelsius = mktKelvin - 273.15;
    return mktCelsius.toFixed(2);
}

function updateDiagnosticsView() {
    if(!activeDiagTruck || !truckStates[activeDiagTruck]) return;
    const data = truckStates[activeDiagTruck];
    const history = sparklineHistories[activeDiagTruck] || [];
    
    // 1. Update MKT
    const mkt = calculateMKT(history);
    document.getElementById('diag-mkt').innerText = `${mkt} °C`;
    
    // 2. Update Compliance Status
    const compEl = document.getElementById('diag-compliance');
    if (data.risk_level === 'Critical') {
        compEl.innerText = "Revoked (Out of Tolerance)";
        compEl.style.color = "var(--crit-red)";
    } else if (data.risk_level === 'Warning') {
        compEl.innerText = "Warning (Deviation Logged)";
        compEl.style.color = "var(--warn-amber)";
    } else {
        compEl.innerText = "Verified Compliant";
        compEl.style.color = "var(--safe-green)";
    }
    
    drawSpectrogram(data);
    drawDegradationCurve(data, history);
}

function drawSpectrogram(data) {
    const canvas = document.getElementById('spectrogram-canvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (spectrogramChartInstance) spectrogramChartInstance.destroy();
    
    // Simulate frequency bins based on raw vibration_g
    // High G -> More energy in High Freq (Lipid Shear)
    // Low G -> Energy mostly in Low Freq (Vial rattle)
    const baseG = data.vibration_g;
    
    let lowFreq = baseG * (1 + Math.random()*0.2); // 10-50Hz
    let midFreq = (baseG * 0.5) * (1 + Math.random()*0.3); // 50-200Hz
    let highFreq = (baseG > 1.2 ? baseG * 1.5 : baseG * 0.1) * (1 + Math.random()*0.5); // 200Hz+ (Shear risk)
    
    spectrogramChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Low (10-50Hz)', 'Mid (50-200Hz)', 'High (200Hz+)'],
            datasets: [{
                label: 'Spectral Energy Distribution',
                data: [lowFreq, midFreq, highFreq],
                backgroundColor: [
                    'rgba(42, 92, 130, 0.6)',
                    'rgba(16, 185, 129, 0.6)',
                    highFreq > 1.5 ? 'rgba(239, 68, 68, 0.8)' : 'rgba(245, 158, 11, 0.6)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, title: {display: true, text: 'Energy Amplitude'} } }
        }
    });
}

function drawDegradationCurve(data, history) {
    const canvas = document.getElementById('degradation-canvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (degradationChartInstance) degradationChartInstance.destroy();
    
    // Simulate Efficacy Drop over the 60s window
    let efficacy = 100.0;
    let efficacyData = [];
    
    history.forEach(t => {
        // If Temp deviates too far from -70 (for mRNA), efficacy drops
        let deviation = Math.abs(t - (-70.0));
        if (data.cargo_type === 'Liquid_Antibiotics') deviation = Math.abs(t - 4.0);
        
        if (deviation > 5) {
            efficacy -= (deviation * 0.1); 
        }
        efficacyData.push(Math.max(efficacy, 0));
    });

    const labels = history.map((_, i) => `-${(history.length - i) * 5}s`);

    degradationChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Temperature (°C)',
                    data: history,
                    borderColor: '#2A5C82',
                    yAxisID: 'yTemp',
                    tension: 0.4
                },
                {
                    label: 'Bio-Efficacy (%)',
                    data: efficacyData,
                    borderColor: '#EF4444',
                    borderDash: [5, 5],
                    yAxisID: 'yEff',
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                yTemp: { type: 'linear', position: 'left', title: {display:true, text:'Temp °C'} },
                yEff: { type: 'linear', position: 'right', min: 80, max: 100, title: {display:true, text:'Efficacy %'} }
            }
        }
    });
}

// ==========================================
// NEW FEATURE: Bio-Climatic Map & Impact Diagnostic
// ==========================================
function updateClimateMarker(data) {
    if(!climateMap) return;
    
    // Clamp to India bounds
    const [clampedLat, clampedLon] = clampToIndia(data.latitude, data.longitude);
    
    // Determine shield state based on compressor stress
    let shieldClass = 'shield-safe';
    let stress = data.compressor_stress_pct || 0;
    
    if(stress > 80) shieldClass = 'shield-crit';
    else if (stress > 40) shieldClass = 'shield-warn';
    
    const iconHtml = `<div class="thermal-shield ${shieldClass}"></div>`;
    const icon = L.divIcon({ className: '', html: iconHtml, iconSize: [24,24], iconAnchor: [12,12] });
    
    if (climateMarkers[data.truck_id]) {
        climateMarkers[data.truck_id].setLatLng([clampedLat, clampedLon]);
        climateMarkers[data.truck_id].setIcon(icon);
    } else {
        const marker = L.marker([clampedLat, clampedLon], {icon: icon}).addTo(climateMap);
        marker.on('click', () => openImpactPanel(data.truck_id));
        climateMarkers[data.truck_id] = marker;
    }
    
    // Update Global Heatmap
    updateWeatherHeatmap();
}

function updateWeatherHeatmap() {
    if(!weatherHeatLayer) return;
    const heatData = [];
    Object.values(truckStates).forEach(ts => {
        // Normalize external temp to 0.0 - 1.0 (assuming range -20 to 50)
        let extTemp = ts.external_temperature || 25;
        let intensity = (extTemp + 20) / 70;
        intensity = Math.max(0, Math.min(1, intensity));
        heatData.push([ts.latitude, ts.longitude, intensity]);
    });
    weatherHeatLayer.setLatLngs(heatData);
}

function openImpactPanel(truckId) {
    const data = truckStates[truckId];
    if(!data) return;
    
    document.getElementById('impact-panel').style.display = 'flex';
    document.getElementById('impact-truck-id').innerText = truckId;
    
    let tDelta = data.thermal_delta || 0.0;
    const deltaEl = document.getElementById('impact-delta');
    deltaEl.innerText = `${tDelta.toFixed(1)} °C`;
    if(tDelta > 30) deltaEl.style.color = "var(--crit-red)";
    else if(tDelta > 15) deltaEl.style.color = "var(--warn-amber)";
    else deltaEl.style.color = "var(--safe-green)";
    
    document.getElementById('impact-delta-sub').innerText = `External: ${data.external_temperature || '--'}°C | Internal: ${data.temperature_celsius}°C`;
    
    document.getElementById('impact-cargo').innerText = `Cargo: ${data.cargo_type.replace('_', ' ')}`;
    
    const vulnEl = document.getElementById('impact-vuln');
    if(data.cargo_type === 'mRNA_Vaccine') {
        vulnEl.innerText = tDelta > 40 ? "CRITICAL RISK: Lipid Nanoparticle Shear via Compressor Overdrive" : "Tolerance: Strict (-70°C). Requires 100% Cooling Duty Cycle in Heat.";
    } else if(data.cargo_type === 'Liquid_Antibiotics') {
        vulnEl.innerText = (data.external_temperature && data.external_temperature < 0) ? "CRITICAL RISK: API Crystallization via Freezing" : "Tolerance: Standard (2-8°C). Avoid Freezing.";
    } else {
        vulnEl.innerText = "Tolerance: Moderate (-20°C). Resilient to short-term stress.";
    }
    vulnEl.style.color = (tDelta > 30 || (data.cargo_type === 'Liquid_Antibiotics' && data.external_temperature < 0)) ? "var(--crit-red)" : "var(--text-muted)";
    
    const stress = data.compressor_stress_pct || 0;
    const ttfEl = document.getElementById('impact-ttf-text');
    if (stress > 50) {
        ttfEl.innerHTML = `<span style="color:var(--crit-red)">Current Ambient Heat is accelerating compressor fatigue by +${stress}%.</span><br><br><b>New Estimated Failure: ${Math.max(1, Math.round(data.ttf_percentage / 10))} Hours</b>`;
    } else {
        ttfEl.innerHTML = `<span style="color:var(--safe-green)">Thermal shield holding. Compressor operating within normal margins.</span>`;
    }
}
