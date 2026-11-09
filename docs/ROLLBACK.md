# ThermoCell-AI Production Rollback & Recovery Runbook

This runbook outlines emergency mitigation, fast rollback procedures, and troubleshooting playbooks for ThermoCell-AI cloud deployments.

---

## 1. Quick Emergency Rollback Matrix

| Component | Target Platform | Primary Rollback Action | Estimated Recovery Time |
|---|---|---|---|
| **Frontend UI** | Netlify | UI Deploy Rollback | < 30 seconds |
| **Backend API** | Render / Railway | Revert to previous image/commit SHA | 1 – 2 minutes |
| **Database** | Neon / Supabase | Point-in-Time Recovery (PITR) | 3 – 5 minutes |

---

## 2. Frontend Rollback Procedure (Netlify)

1. Navigate to your site on the **Netlify Dashboard**.
2. Go to **Deploys** (`https://app.netlify.com/sites/<your-site>/deploys`).
3. Locate the last known working deployment (marked with a green checkmark).
4. Click on that deploy entry, then click **Publish deploy**.
5. Netlify instantly switches traffic on its global CDN edge to the selected bundle without re-running build steps.

### CLI Rollback Fallback
If UI access is constrained, deploy the local production build directly:
```bash
cd frontend
npm run build
netlify deploy --prod --dir=dist
```

---

## 3. Backend Rollback Procedure (Render / Railway)

### On Render
1. Navigate to **Dashboard** -> **Web Services** -> Your ThermoCell Backend service.
2. Under **Events / Deploys**, locate the previous successful deployment.
3. Click the triple dots (`...`) -> **Rollback to this deploy**.
4. Render re-provisions the previously working container image immediately.

### On Railway
1. Navigate to your project architecture canvas.
2. Select the Backend service -> **Deployments**.
3. Click the previous healthy deployment -> **Redeploy**.

---

## 4. PostgreSQL Database Disaster Recovery

1. **Schema Initialization is Non-Destructive**:
   - `DiagnosticSessionStore._init_db()` executes `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.
   - Backend redeployments or container restarts will **never** drop or overwrite existing `diagnostic_sessions` data.
2. **Point-In-Time Recovery (PITR)**:
   - On **Neon**: Go to **Branches** -> create a restore branch from a timestamp prior to the incident, then repoint `DATABASE_URL`.
   - On **Supabase**: Go to **Database** -> **Backups** -> select restore point.
3. **Emergency Table Re-index / Repair**:
   If index corruption occurs, run:
   ```sql
   REINDEX TABLE diagnostic_sessions;
   REINDEX TABLE rate_limit_events;
   ```

---

## 5. Troubleshooting Common Production Incidents

### A. Backend Fails to Start (Container Exits with Code 1)
- **Symptom**: Web service repeatedly crashes upon startup.
- **Root Cause**: `validate_production_hardening()` caught insecure default credentials while `ENVIRONMENT=production`.
- **Log Signature**:
  ```
  ValueError: Production environment must not use the default dev SECRET_KEY.
  ```
- **Remedy**: Update the environment variables in your cloud dashboard with unique cryptographically random keys:
  ```bash
  SECRET_KEY=$(openssl rand -hex 32)
  HARDWARE_API_KEY=$(openssl rand -hex 32)
  ```
  Ensure `OPERATOR_PASSWORD_HASH` differs from the development bcrypt hash.

### B. CORS Error on Frontend (`Cross-Origin Request Blocked`)
- **Symptom**: Browser console reports blocked requests from `https://your-site.netlify.app`.
- **Root Cause**: `ALLOWED_ORIGINS` mismatch in backend environment variables.
- **Remedy**:
  - Ensure `ALLOWED_ORIGINS` does NOT have a trailing slash:
    ```
    ALLOWED_ORIGINS=https://thermocell.netlify.app
    ```
  - If multiple origins are needed, provide a valid JSON array:
    ```
    ALLOWED_ORIGINS=["https://thermocell.netlify.app"]
    ```

### C. ML Models Not Found (`FileNotFoundError`)
- **Symptom**: `/api/simulate` or `/api/predict` returns 500 error on model evaluation.
- **Root Cause**: Model weights were not bundled into the container image or path resolution failed.
- **Remedy**:
  - Verify that `Dockerfile` includes `COPY ml/saved_models /app/ml/saved_models`.
  - Set the explicit container environment variable:
    ```
    MODEL_DIR=/app/ml/saved_models
    ```

### D. PostgreSQL SSL Mode Connection Refusal
- **Symptom**: Backend logs report `psycopg2.OperationalError: no pg_hba.conf entry for host ... no encryption`.
- **Root Cause**: Managed cloud databases require TLS/SSL.
- **Remedy**: Append `?sslmode=require` to `DATABASE_URL`:
  ```
  postgresql://user:pass@host:5432/dbname?sslmode=require
  ```

---

## 6. Post-Rollback Validation
After executing any rollback, run the automated smoke test suite to confirm operational status:
```bash
python scripts/smoke_test_production.py --api-url https://<your-backend-url> --username <operator-user>
```
All 7 validation stages must report `OK`.
