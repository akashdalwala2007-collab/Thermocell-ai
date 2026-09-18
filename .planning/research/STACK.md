# Technology Stack & Tooling Decisions

## Core Stack Overview

| Layer | Selected Technology | Alternative Considered | Rationale |
|-------|---------------------|------------------------|-----------|
| **Frontend Framework** | React 18+ (TypeScript) | Vue, Svelte, Vanilla JS | Broad team familiarity, rich ecosystem for data visualization and state management |
| **Frontend Build Tool** | Vite | Create React App, Webpack | Instant HMR, zero-config TS support, lightweight and ultra-fast build times |
| **Frontend Styling** | Tailwind CSS | CSS Modules, Material UI | Rapid UI prototyping, customizable utility classes for dark/light themes and telemetry cards |
| **Visualization & Heatmap**| HTML5 Canvas API / SVG + Lucide Icons | Chart.js, Recharts, D3.js | Direct 8×8 grid rendering via Canvas/SVG enables smooth bilinear interpolation without heavy charting overhead |
| **Backend Framework** | FastAPI (Python 3.10+) | Flask, Django | High-performance async endpoints, automatic OpenAPI/Swagger docs, Pydantic type validation |
| **ML & Data Processing** | pandas, NumPy, scikit-learn | PyTorch, TensorFlow | Lightweight tabular ML (Random Forest, Gradient Boosting); no GPU requirement; student-friendly |
| **Image / Spatial Ops** | OpenCV (opencv-python-headless) or SciPy `ndimage` | PIL, pure Python | Minimal footprint; useful specifically for Gaussian filtering, spatial thermal gradient computation, and 8×8 upscaling |
| **Storage** | Flat files (CSV, JSON) | PostgreSQL, SQLite | Zero installation friction for a 5-member student team; raw and synthetic data remain versionable and human-readable |

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
- `httpx>=0.27.0` (for FastAPI async test client)

### Frontend Dependencies (`package.json`)
- `react`, `react-dom`
- `typescript`
- `vite`
- `@vitejs/plugin-react`
- `tailwindcss`, `postcss`, `autoprefixer`
- `lucide-react` (clean icons for battery, thermometer, status alerts)
- `clsx`, `tailwind-merge` (UI utility helpers)

## Key Tradeoffs & Decisions
1. **No PostgreSQL or External DB**: Adding a relational database adds Docker or local service management burdens for team members across Windows/macOS. Preprocessed NASA cycles and synthetic batch runs are stored as structured JSON/CSV in `backend/data/`.
2. **Headless OpenCV vs SciPy**: `opencv-python-headless` avoids unnecessary GUI dependencies on servers or CI while delivering optimized 2D interpolation and convolution for the 8×8 thermal array.
3. **Pydantic Validation with Strict Provenance Tags**: Every API schema requires an enum field `provenance: "REAL" | "SYNTHETIC" | "PREDICTED"` to ensure data origin is programmatically enforced.
4. **Zero GPU / Deep Learning Overhead**: Tabular tree models (Random Forest, GBDT) train in seconds on any student laptop and offer higher interpretability than deep neural networks on tabular battery features.
