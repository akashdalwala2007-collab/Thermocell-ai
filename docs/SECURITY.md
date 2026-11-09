# ThermoCell-AI Production Security Architecture & Hardening Guide

## 1. Executive Summary

ThermoCell-AI is an edge-diagnostic and software-first platform for rapid, second-life lithium-ion battery screening. This document details the security posture, cryptographic controls, authentication boundaries, rate-limiting rules, and runtime hardening implemented in **Phase 9: Production Security Hardening**.

---

## 2. Threat Model & Trust Boundaries

```
+-----------------------------------------------------------------------------------+
| UNTRUSTED EXTERNAL ZONE (Internet / College LAN)                                   |
+-----------------------------------------------------------------------------------+
      |                                              |
      | Browser Client                               | Serial Bridge / ESP32 Microcontroller
      | (Operator)                                   | (Hardware Sensor Rig)
      v                                              v
+-----------------------------------------------------------------------------------+
| BOUNDARY DEFENSE LAYER                                                             |
| - SecurityHeadersMiddleware (CSP, nosniff, DENY, HSTS)                             |
| - PayloadSizeLimitMiddleware (1MB Max Payload Cap)                                 |
| - RateLimitMiddleware (Route-specific sliding window)                             |
| - CORSMiddleware (Explicit origin whitelist)                                       |
+-----------------------------------------------------------------------------------+
      |                                              |
      | Authorization: Bearer <JWT>                  | X-API-Key: <HARDWARE_API_KEY>
      v                                              v
+-----------------------------------------------------------------------------------+
| AUTHENTICATION & ACCESS CONTROL                                                    |
| - get_current_operator: HMAC-SHA256 JWT           - get_hardware_or_operator:     |
|   (2hr expiry, PyJWT, subject claim)                constant-time compare_digest   |
+-----------------------------------------------------------------------------------+
      |                                              |
      +----------------------+-----------------------+
                             |
                             v
+-----------------------------------------------------------------------------------+
| APPLICATION SERVICE LAYER (FastAPI)                                               |
| - /api/simulate          - /api/telemetry/frame                                    |
| - /api/screen            - /api/telemetry/baseline                                 |
| - /api/sessions          - /api/telemetry/build-pulse                              |
+-----------------------------------------------------------------------------------+
                             |
                             v
+-----------------------------------------------------------------------------------+
| DATA PERSISTENCE & ML EXECUTION (Zero-Trust Validation)                           |
| - Pydantic Strict Typing & Regex Physical Cell ID Validation                       |
| - Immutable Diagnostic Records with Provenance Stamping (REAL/SYNTHETIC/PREDICTED)|
| - Dialect-Agnostic SQLAlchemy 2.0 (PostgreSQL / SQLite fallback)                   |
+-----------------------------------------------------------------------------------+
```

---

## 3. Cryptographic Controls & Authentication

### 3.1 Operator Authentication (JWT)
- **Token Format**: Standard RFC 7519 JWT signed with HMAC-SHA256 (`HS256`).
- **Required Claims**: `sub` (operator identity), `iat` (issued-at epoch), `exp` (expiration epoch), `iss` (`thermocell-ai`).
- **Token Lifetime**: 120 minutes (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`).
- **Password Storage**: Stored as high-work-factor bcrypt hashes (12 salt rounds).
- **Endpoint**: `POST /api/auth/token` returns `{ "access_token": "...", "token_type": "bearer", "expires_in": 7200 }`.

### 3.2 Hardware Bridge Authentication (`X-API-Key`)
- Microcontrollers (ESP32) and local edge bridges authenticate via the `X-API-Key` HTTP header.
- Verification uses `secrets.compare_digest` to prevent timing attacks.
- Dual-auth fallback: Telemetry ingestion endpoints accept either a valid `X-API-Key` or a valid Operator Bearer JWT.

---

## 4. Rate Limiting Architecture

To thwart brute-force password guessing and denial-of-service without interrupting the high-throughput 10Hz hardware telemetry stream, route-specific sliding window limiters are enforced:

| Bucket | Matching Routes | Limit | Window | Purpose |
|---|---|---|---|---|
| **`auth`** | `/api/auth/token` | 5 req | 60 sec | Prevents credential brute-forcing |
| **`compute`** | `/api/simulate`, `/api/screen` | 30 req | 60 sec | Throttles CPU-intensive ECM simulation & ML inference |
| **`telemetry_frame`** | `/api/telemetry/frame` | 600 req | 60 sec | Accommodates 100 active + 20 relaxation frames at 10Hz (120 frames / 12s) without dropping packets |
| **`general_api`** | `/api/sessions`, `/api/cells/*` | 120 req | 60 sec | Standard operational throughput |

When a limit is reached, the API returns `HTTP 429 Too Many Requests` with a RFC-compliant `Retry-After` header.

---

## 5. Security Middlewares

1. **SecurityHeadersMiddleware**:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `X-XSS-Protection: 0`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy: geolocation=(), microphone=(), camera=()`
   - `Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'`
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains` (enforced when `ENVIRONMENT=production`)

2. **PayloadSizeLimitMiddleware**:
   - Inspects `Content-Length` header and blocks requests exceeding `MAX_PAYLOAD_BYTES` (default: 1,048,576 bytes / 1MB) with `HTTP 413 Payload Too Large`.

3. **CORSMiddleware**:
   - Production validation forbids wildcard `*` origins.
   - Restricts methods to `["GET", "POST", "OPTIONS"]`.
   - Restricts headers to `["Content-Type", "Authorization", "X-API-Key"]`.

4. **Global Sanitized Error Handlers**:
   - In production, unhandled exceptions log the stack trace with a unique `error_id` (UUIDv4) and return an opaque JSON error to clients, preventing information disclosure.

---

## 6. Production Invariants & Startup Validation

The `Settings` model in `app.core.config` runs strict startup validation. The application will refuse to start in `ENVIRONMENT=production` if:
1. `SECRET_KEY` is empty, equal to default dev fallback, or shorter than 32 characters.
2. `DATABASE_URL` points to SQLite (`sqlite://`). Production requires PostgreSQL.
3. `ALLOWED_ORIGINS` contains wildcard `*` or loopback addresses (`localhost`, `127.0.0.1`).
4. `HARDWARE_API_KEY` is set to the default development fallback (`dev-hw-key-18650`).

---

## 7. Verification Results (Phase 9 Audit)

- **Backend PyTest Suite**: 185 / 185 tests passed (100% green).
- **Security Specific Suites**:
  - `test_security_auth.py`: JWT validation, 401 unauthenticated, expired token handling, dual auth.
  - `test_security_middleware.py`: Security headers, 413 payload size limits, CORS preflight.
  - `test_security_rate_limits.py`: 5 req/min auth throttle, 120-frame continuous 10Hz burst passing.
- **Frontend Production Build**: Vite + TypeScript compiled with 0 errors.
- **Leakage Audit**: `VERIFIED_ZERO_LEAKAGE` across all 4 benchmark cells.
- **Hardware Mock Ingestion**: Validated E2E with `--mock` and `X-API-Key`.
