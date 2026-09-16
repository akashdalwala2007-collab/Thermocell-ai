<!-- GSD:project-start source:PROJECT.md -->

## Project

**ThermoCell-AI**

ThermoCell-AI is a software-first diagnostic prototype designed for rapid, low-cost second-life lithium-ion battery grading and triage in college and hackathon settings. It combines real-world NASA battery degradation telemetry with a physics-informed 10-second controlled pulse discharge simulation, generating synthetic thermal responses (including 8×8 thermal frames resembling an AMG8833 sensor) to classify batteries into REUSE, RETIRE, or INVESTIGATE categories with strict data provenance integrity.

**Core Value:** Rapid (10-second), physics-grounded second-life battery classification (REUSE / RETIRE / INVESTIGATE) with uncompromised data integrity labeling (REAL vs. SYNTHETIC vs. PREDICTED) and a direct path to low-cost hardware validation.

### Constraints

- **Tech Stack**: Frontend in React (TypeScript, Vite, Tailwind CSS); Backend in Python 3.10+ (FastAPI, Uvicorn); ML in scikit-learn, NumPy, pandas.
- **Data Integrity**: Every piece of data displayed or exported must carry explicit provenance labels: `REAL` (NASA telemetry), `SYNTHETIC` (10s pulse and 8×8 spatial frames), or `PREDICTED` (ML classifications and health probabilities).
- **Leakage Prevention**: ML validation must split by Battery Cell ID (e.g. Train on cells B0005 & B0006, Test on B0007 & B0018), never randomly by cycle or time step.
- **Budget / Hardware**: Total potential hardware cost must remain under $30–$40 (ESP32 ~$5, AMG8833 ~$15, INA219 ~$3, dummy load resistor/MOSFET ~$5).

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Core Stack Overview

| Layer | Selected Technology | Alternative Considered | Rationale |
|-------|---------------------|------------------------|-----------|
| **Frontend Framework** | React 18+ (TypeScript) | Vue, Svelte, Vanilla JS | Broad team familiarity, rich ecosystem for data visualization and charts |
| **Frontend Build Tool** | Vite | Create React App, Webpack | Instant HMR, zero-config TS support, lightweight and fast build times |
| **Frontend Styling** | Tailwind CSS | CSS Modules, Material UI | Rapid UI prototyping, highly customizable utility classes for dark mode and telemetry cards |
| **Visualization & Heatmap**| Canvas API / HTML5 SVG + Lucide Icons | Chart.js, Recharts, D3.js | Direct 8×8 grid rendering via Canvas/SVG enables smooth interpolation (bilinear upsampling) without heavy charting overhead |
| **Backend Framework** | FastAPI (Python 3.10+) | Flask, Django | High-performance async endpoints, automatic OpenAPI/Swagger docs, Pydantic type validation |
| **ML & Data Processing** | pandas, NumPy, scikit-learn | PyTorch, TensorFlow | Lightweight tabular/feature ML (Random Forest, Gradient Boosting); no GPU requirement; student-friendly |
| **Image / Spatial Ops** | OpenCV (opencv-python-headless) or SciPy `ndimage` | PIL, pure Python | Minimal footprint; useful specifically for Gaussian filtering, spatial thermal gradient computation, and 8×8 upscaling |
| **Storage** | Flat files (CSV, JSON) | PostgreSQL, SQLite | Zero installation friction for a 5-member team; raw and synthetic data remain versionable and human-readable |

## Component Details

### Backend Dependencies (`requirements.txt`)

- `fastapi>=0.110.0`
- `uvicorn[standard]>=0.28.0`
- `pydantic>=2.6.0`
- `numpy>=1.24.0`
- `pandas>=2.0.0`
- `scikit-learn>=1.3.0`
- `scipy>=1.11.0`
- `opencv-python-headless>=4.8.0` (or `scipy.ndimage` fallback)
- `pytest>=8.0.0`
- `httpx>=0.27.0` (for FastAPI test client)

### Frontend Dependencies (`package.json`)

- `react`, `react-dom`
- `typescript`
- `vite`
- `@vitejs/plugin-react`
- `tailwindcss`, `postcss`, `autoprefixer`
- `lucide-react` (clean icons for battery, thermometer, alerts)
- `clsx`, `tailwind-merge` (UI utility helpers)

## Key Tradeoffs & Decisions

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.agent/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
