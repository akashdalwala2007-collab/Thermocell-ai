# ThermoCell-AI

> **Rapid Physics-Informed Second-Life Lithium-Ion Battery Triage and Diagnostics**

ThermoCell-AI is a software-first diagnostic prototype designed for rapid, low-cost second-life lithium-ion battery grading and triage in college and hackathon settings. It combines real-world NASA battery degradation telemetry with a physics-informed 10-second controlled pulse discharge simulation, generating synthetic thermal responses (including 8×8 spatial thermal frames resembling an AMG8833 sensor) to classify batteries into **REUSE**, **RETIRE**, or **INVESTIGATE** categories with strict data provenance integrity.

---

## Core Value Proposition

- **10-Second Diagnostic Pulse**: Eliminates full-cycle charge/discharge hours by evaluating immediate ohmic drop ($\Delta V_0$), transient diffusion polarization, relaxation recovery ($V_{\text{recovery\_rate}}$), and transient spatial heat dissipation.
- **Strict Data Provenance**: Every metric, frame, and payload carries an explicit provenance tag:
  - `REAL`: Empirical laboratory measurements (NASA Ames battery aging dataset).
  - `SYNTHETIC`: Numerically simulated 10-second pulse responses and 8×8 thermal frames.
  - `PREDICTED`: Machine learning triage classifications, calibrated probabilities, and health estimates.
- **Leakage Prevention & Group Identity**: `cell_id` represents ONLY the physical cell entity (e.g. `"B0005"`). The cycle index is isolated in `cycle_index` (e.g. `40`). Cross-validation and evaluations group strictly on `cell_id` (Leave-One-Group-Out CV).
- **Target Hardware BOM Under $30–$40**: Directly compatible with low-cost hardware validation (ESP32 ~$5, AMG8833 ~$15, INA219 ~$3, power MOSFET load ~$5).

---

## Repository Architecture

```text
ThermoCell-AI/
├── backend/                  # Python 3.10+ FastAPI backend service
│   ├── app/                  # Application code (API routers, models, services)
│   │   ├── models/           # Unified Pydantic schemas (battery, provenance)
│   │   └── main.py           # FastAPI entrypoint and health endpoints
│   ├── data/                 # Data directory
│   │   ├── raw/              # NASA raw aging data cache (ignored by git)
│   │   └── processed/        # Extracted cycle degradation records
│   ├── tests/                # Pytest test suite (schemas, API contracts)
│   └── requirements.txt      # Pinned Python dependencies
├── frontend/                 # React 18 + TypeScript + Vite + Tailwind CSS dashboard
│   ├── src/                  # Components, state, visualizations, and types
│   ├── package.json          # Frontend dependencies and scripts
│   ├── vite.config.ts        # Vite configuration
│   ├── tsconfig.json         # TypeScript configuration
│   └── tailwind.config.js    # Tailwind CSS design system
├── ml/                       # Machine learning pipelines and saved models
│   ├── models/               # Serialized triage classifiers and scalers
│   └── pipelines/            # Training, calibration, and feature extraction scripts
├── hardware/                 # ESP32 firmware sketch and wiring schematics
│   ├── firmware/             # Arduino/PlatformIO C++ sketch for ESP32
│   └── schematics/           # Wiring diagrams and bill of materials (BOM)
├── docs/                     # Architecture, technical specs, and verification records
├── .planning/                # GSD planning documentation, roadmap, and state
└── README.md                 # Project documentation
```

---

## Technical Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Backend Framework** | FastAPI (Python 3.10+) | High-performance async API with Pydantic validation |
| **Data & ML** | pandas, NumPy, scikit-learn | Data processing, feature extraction, and triage classification |
| **Image / Spatial Ops**| OpenCV-headless / SciPy | 8×8 spatial thermal interpolation and gradient analysis |
| **Frontend UI** | React 18, TypeScript, Vite | Fast modular web dashboard |
| **Styling & UI** | Tailwind CSS, Lucide Icons | Responsive telemetry visualization and status badges |
| **Testing** | Pytest, HTTPX TestClient | Automated schema validation and API contract testing |

---

## Quickstart Guide

### 1. Backend Setup

```bash
cd backend
python -m venv .venv

# On Windows (PowerShell):
.venv\Scripts\Activate.ps1
# On Linux/macOS:
# source .venv/bin/activate

pip install -r requirements.txt
pytest -v
uvicorn app.main:app --reload --port 8000
```

The API documentation is accessible at `http://localhost:8000/docs`.

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The dashboard will launch at `http://localhost:5173`.

---

## License

MIT License. Designed for second-life battery research, educational benchmarks, and collegiate engineering hackathons.

