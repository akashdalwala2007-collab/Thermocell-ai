# ThermoCell-AI Regression and Scope Review Report

**Document Path**: `.gsd/investigations/REGRESSION_REVIEW.md`  
**Date**: November 9, 2026  
**Reviewer**: `thermocell-regression-reviewer` (Subagent Regression & Scope Reviewer)  
**Status**: APPROVED WITH CONSTRAINTS  
**Evaluated Reports**:
1. Agent 1: `.gsd/investigations/ISSUE_A_HEALTH_GAUGE.md` (`health-gauge-investigator`)
2. Agent 2: `.gsd/investigations/ISSUE_B_HARDWARE_FRAME.md` (`hardware-frame-investigator`)

---

## 1. Executive Summary & Verdict

### Final Verdict: `APPROVED WITH CONSTRAINTS`

Both investigation reports accurately identify the true root causes for their respective failure modes:
- **Issue A (Health Gauge SoH Missing)**: A multi-point propagation severance where backend `routes_telemetry.py` and `session_store.py` dropped top-level `soh`, `App.tsx` discarded `diagnosticRun?.soh`, `DashboardView.tsx` omitted `soh` from its prop interface, and a premature fallback in `DashboardView.tsx:293` erroneously displayed a green `REUSE` verdict badge while the gauge rendered `—`.
- **Issue B (Hardware Frame Count Overflow 200 vs 100)**: A reactive re-render loop triggered by `App.tsx:289-293` where `useEffect` depended on the unstable reference `executeDiagnosticRun`. When a user selected an operating profile (e.g. *Marginal C85*), an initial run (Run A) and a secondary reactive default run (Run B) were spawned concurrently. Lacking an execution mutex or loop cancellation token, both loops streamed 100 active frames into the backend's shared singleton `_hardware_buffer`, accumulating 200 active frames and tripping backend validation with HTTP 400.

While both proposed fixes are sound in principle, **strict scope boundaries and regression constraints must be enforced** before implementation begins. Uncontrolled changes to session serialization, hardware buffer limits, or frontend lifecycle hooks could easily trigger regressions in ML decision fusion, violate strict data provenance rules, break Leave-One-Group-Out CV isolation, or destabilize the verified baseline test suite (207 backend pytest tests, 5 frontend node tests, all currently passing at 100%).

---

## 2. Current Working Tree & Uncommitted Changes Audit

An empirical audit of `git status` reveals **20 modified files** with uncommitted in-progress changes across frontend, backend, and hardware layers. The implementation plan must strictly preserve these working changes:

| Subsystem | Modified File | Existing In-Progress Work / Invariants to Protect |
|:---|:---|:---|
| **Backend API** | `backend/app/api/routes_simulation.py` | Implementation of `DiagnosticRunResponse` with `soh` and `discharge_capacity`; empirical benchmark lookup via `get_nasa_cycle_record`; `provenance_soh` metadata tagging. |
| **Backend Services** | `backend/app/services/nasa_service.py` | Implementation of `get_nasa_cycle_record(cell_id, cycle_index, profile_type)` providing deterministic benchmark records. |
| **Backend Services** | `backend/app/services/session_store.py` | Deserialization of `soh` and `discharge_capacity` from telemetry metadata in `list_cell_sessions` and `list_recent_sessions`. Rate limit bypass for prototype stability. |
| **Backend Tests** | `backend/tests/test_hardware_bridge.py` | Added `test_hardware_bridge_rejects_synthetic_provenance()` ensuring hardware buffer strictly rejects synthetic frames. |
| **Backend Tests** | `backend/tests/test_security_rate_limits.py` | Updated rate limit expectations. |
| **Backend Tests** | `backend/tests/test_session_store.py` | Updated session store assertions. |
| **Hardware** | `hardware/serial_bridge.py` | Parameterized `provenance` in `generate_mock_hardware_stream()` to support both physical REAL and synthetic testing. |
| **Frontend API** | `frontend/src/services/api.ts` | Added hardware telemetry methods: `setHardwareBaseline`, `ingestHardwareFrame`, `buildHardwarePulse`, `resetHardwareBuffer`; extended `DiagnosticRunResponse` with `soh?` and `discharge_capacity?`. |
| **Frontend UI** | `frontend/src/App.tsx` | Added hardware mode state toggles, DAQ streaming progress banner, operator authentication modal wiring. |
| **Frontend Config** | `frontend/package.json`, `frontend/tailwind.config.js`, `frontend/src/index.css` | UI styling tokens and Node native test runner script (`npm test`). |

---

## 3. Core Architectural Invariants & Protection Mandate

1. **NASA Ames Cell-Specific SoH Logic & Leakage Prevention**:
   - `cell_id` represents ONLY the physical 18650 battery cell (e.g., `"B0005"`, `"B0006"`, `"B0007"`, `"B0018"`, or `"HW-001"`). The cycle count must strictly remain in a separate `cycle_index` field.
   - Leave-One-Group-Out CV integrity: all cycles from a given physical cell must reside in the same validation fold (`test_leakage_audit.py`).
2. **Strict Three-Tier Data Provenance Integrity**:
   - `REAL`: Empirical NASA measurements and physical ESP32 DAQ streaming.
   - `SYNTHETIC`: Numerically simulated 10-second discharge pulse and 8x8 spatial thermal frames.
   - `PREDICTED`: Machine learning triage classification (`REUSE`, `INVESTIGATE`, `RETIRE`).
   - If an unknown cell (`HW-001`) has no NASA record, `soh` must remain `None`, not synthetic data labeled REAL.
3. **Hardware Telemetry Protocol (100 Active + 20 Relaxation = 120 Total Frames)**:
   - Exactly 100 active frames + 20 relaxation frames = 120 total frames per run.
   - $30–$40 target BOM compatibility.
4. **ML Screening Schema Immutability**:
   - `DiagnosticPrediction` enforces `extra="forbid"`. Do NOT inject `soh` into prediction schemas.

---

## 4. Allowable Modifications (Approved Blast Radius)

Modifications are strictly restricted to the following 5 files:
1. `frontend/src/App.tsx`:
   - Decouple mount effect via `hasRunInitialRef = useRef(false)`.
   - Add `isStreamingRef = useRef(false)` mutex and in-loop cancellation check `currentRequestId !== activeRequestIdRef.current`.
   - Pass `soh={soh}` to `<DashboardView />`.
2. `frontend/src/views/DashboardView.tsx`:
   - Add `soh?: number | null;` to `DashboardViewProps`.
   - Prioritize `soh` prop in `estSoh`.
   - Conditional rendering for `VerdictBadge` when `verdict !== null`.
   - Default radial arc stop color to `#334155` when `verdict === null`.
3. `backend/app/api/routes_telemetry.py`:
   - Catch `ValueError` in `ingest_hardware_frame` and raise `HTTPException(status_code=400, detail=str(e))`.
   - Attach empirical NASA `soh` and `discharge_capacity` in `build_pulse_and_diagnose` response.
4. `backend/app/services/telemetry_source.py`:
   - Add capacity guard (`len >= 100` for active, `len >= 20` for relaxation) in `HardwareBufferSource`.
5. `backend/app/services/session_store.py`:
   - In `get_diagnostic_run(session_id)`, extract `soh` and `discharge_capacity` from metadata and return as top-level keys.

---

## 5. Final Scope Recommendation

Confine bug fixes strictly to `App.tsx`, `DashboardView.tsx`, `routes_telemetry.py`, `telemetry_source.py`, and `session_store.py`. Strictly protect 207 backend and 5 frontend baseline tests, preserve 3-tier provenance, and prohibit any changes to ML models or `DiagnosticPrediction` schemas.
