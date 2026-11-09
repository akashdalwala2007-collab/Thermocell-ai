# ThermoCell-AI Production Deployment Guide

This guide describes how to deploy the production-hardened **ThermoCell-AI** second-life battery diagnostic system using a low-cost, developer-friendly cloud architecture ($0 to <$10/month).

---

## 1. System Architecture

```
+-----------------------------------------------------------------------------------+
|                           PRODUCTION ARCHITECTURE                                 |
|                                                                                   |
|  [ Netlify Static Edge CDN ]                                                      |
|  React 18 + Vite SPA                                                              |
|  - Dynamic VITE_API_BASE_URL (HTTPS)                                              |
|  - Operator JWT authentication handling & real-time telemetry card UI             |
|  - Netlify SPA redirects (/* -> /index.html 200)                                 |
|                                     │                                             |
|                                     ▼ HTTPS (Restricted CORS)                     |
|  [ Render / Railway Web Service ]                                                 |
|  FastAPI + Uvicorn ASGI (2 workers, proxy headers)                                |
|  - Security headers, shared worker rate limiting, JWT authentication              |
|  - 14-feature extraction + Dual-model decision fusion (<50ms)                     |
|  - Isolated hardware ingest route (API Key protected)                             |
|                                     │                                             |
|                                     ▼ Parameterized SQL (psycopg2)                |
|  [ Neon / Supabase Managed PostgreSQL ]                                           |
|  - Relational diagnostic sessions table & indices                                 |
|  - Shared rate_limit_events table for multi-worker synchronization                |
|  - ACID persistence for runs, telemetry, and predictions                         |
+-----------------------------------------------------------------------------------+
```

---

## 2. Artifact Boundary & Repository Safety

To ensure production security and clean separation between developer tooling and public deliverables:

1. **Local/Internal Planning Artifacts (Strictly Excluded from Public Repo & Deployments)**:
   - `.planning/` directory: Internal agent execution logs, roadmaps, and detailed phase plans. These are kept strictly local for GSD workflows, ignored in `.gitignore`, and excluded from container builds via `.dockerignore`.
   - `.env`, `.env.production`: Live production secrets.
   - `backend/data/*.db`: Local operational SQLite databases.
   - `backend/data/raw/*.mat`, `*.csv.gz`: Raw NASA datasets.
   - `tests/`, `backend/tests/`: Unit test suites (used in CI/pre-deployment validation only).

2. **Public Production & Deployment Artifacts**:
   - `frontend/`: React + Vite application, `netlify.toml`, `package.json`, Tailwind config.
   - `backend/`: FastAPI application code (`backend/app/`), pinned dependencies (`backend/requirements.txt`), benchmark reference dataset (`backend/data/processed/nasa_cycles_summary.csv`).
   - `ml/`: Model weights (`health_model.joblib`, `pattern_model.joblib`), metadata (`health_model_meta.json`, `pattern_model_meta.json`), feature extraction pipeline (`ml/features/`).
   - `hardware/`: ESP32 firmware source (`esp32_thermocell.ino`), serial bridge (`serial_bridge.py`), wiring guide (`README.md`).
   - `docs/`: Engineering documentation (`DEPLOYMENT.md`, `ROLLBACK.md`, `DEMO_GUIDE.md`, `SECURITY.md`).
   - Platform descriptors: `Dockerfile`, `.dockerignore`, `Procfile`, `.env.example`.

---

## 3. Step 1: Managed PostgreSQL Database Setup

1. Create a free PostgreSQL instance on **[Neon](https://neon.tech)**, **[Supabase](https://supabase.com)**, or **[Render](https://render.com)**.
2. Copy the connection URI:
   ```
   postgresql://username:password@ep-sample-pooler.us-east-2.aws.neon.tech/thermocell?sslmode=require
   ```
3. The database schema (tables `diagnostic_sessions` and `rate_limit_events`) will be created automatically on application startup.

---

## 4. Step 2: Backend Cloud Deployment (Render / Railway)

### Option A: Render Web Service (Recommended)
1. In the Render Dashboard, click **New +** -> **Web Service**.
2. Connect your GitHub repository.
3. Configure settings:
   - **Environment**: `Python 3` or `Docker`
   - **Build Command**: `pip install -r backend/requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT --app-dir backend --workers 2 --proxy-headers --forwarded-allow-ips='*'`
4. Set Environment Variables in the Render Dashboard:

| Variable | Recommended Production Value | Description |
|---|---|---|
| `ENVIRONMENT` | `production` | Enables production validation & disables dev overrides |
| `DATABASE_URL` | `postgresql://user:pass@host/dbname?sslmode=require` | Managed PostgreSQL connection string |
| `ALLOWED_ORIGINS` | `https://<your-netlify-app>.netlify.app` | Restricts CORS to the frontend domain |
| `SECRET_KEY` | *(Generate: `openssl rand -hex 32`)* | 64-char JWT cryptographic signing secret |
| `OPERATOR_USERNAME` | `admin_operator` | Custom operator login identifier |
| `OPERATOR_PASSWORD_HASH` | *(Generate via bcrypt)* | Custom operator password bcrypt hash |
| `HARDWARE_API_KEY` | *(Generate: `openssl rand -hex 32`)* | Dedicated secret for bench serial bridge ingestion |
| `DOCS_ENABLED` | `false` | Disables public Swagger/OpenAPI docs |
| `MODEL_DIR` | `/app/ml/saved_models` (or `ml/saved_models`) | Explicit path to scikit-learn models |

### Password Hash Generation
To generate a production password hash securely:
```bash
python -c "import bcrypt; print(bcrypt.hashpw(b'YourStrongPasswordHere', bcrypt.gensalt()).decode())"
```

---

## 5. Step 3: Frontend Deployment (Netlify)

1. Log in to **[Netlify](https://netlify.com)** and click **Add new site** -> **Import an existing project**.
2. Select your repository.
3. Configure build settings:
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
4. Set Environment Variable in Netlify (Site Settings -> Environment Variables):
   - `VITE_API_BASE_URL`: `https://<your-backend-subdomain>.onrender.com`
5. Click **Deploy Site**. Netlify will build the SPA, apply routing redirects from `netlify.toml`, and distribute assets across its global CDN.

---

## 6. Step 4: Hardware / Edge Serial Bridge Relay

Physical bench hardware is kept separate from the public Internet:
1. The **ESP32** connects via USB to a local test bench computer running `hardware/serial_bridge.py`.
2. Telemetry frames or complete pulse records are pushed over outbound HTTPS to the cloud backend:
   ```bash
   python hardware/serial_bridge.py --port COM3 --backend https://<your-backend>.onrender.com --api-key <HARDWARE_API_KEY>
   ```
3. Real physical data receives `provenance: "REAL"`.
4. In-browser simulation runs receive `provenance: "SYNTHETIC"`.
5. Triage classifications receive `provenance: "PREDICTED"`.

---

## 7. Step 5: Verification & Zero-Cost Compliance

- **Frontend**: Netlify Free Tier provides 100 GB bandwidth and automatic Let's Encrypt SSL at $0/month.
- **Backend**: Render Free/Hobby Tier provides reliable ASGI hosting at $0–$7/month.
- **Database**: Neon Free Tier provides 0.5 GB storage with automated pooling at $0/month.
- **Total Cost**: $0 to <$10/month.
