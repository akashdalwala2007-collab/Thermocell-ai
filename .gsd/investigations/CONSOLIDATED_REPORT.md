# Consolidated Multi-Agent Investigation Report: ThermoCell-AI Bug Diagnosis

**Document Path**: `.gsd/investigations/CONSOLIDATED_REPORT.md`  
**Date**: November 9, 2026  
**Status**: Investigation & Technical/Regression Reviews Complete — Ready for Implementation  
**Participating Agents**:
- `health-gauge-investigator` (Agent 1 — Issue A)
- `hardware-frame-investigator` (Agent 2 — Issue B)
- `health-and-frame-reviewer` (Agent 3 — Independent Technical Review)
- `thermocell-regression-reviewer` (Agent 4 — Regression & Scope Review)

---

## 1. Executive Overview

A rigorous multi-agent diagnostic investigation was conducted inside the ThermoCell-AI repository to resolve two critical issues:
- **Issue A**: The Health Gauge displays `—` instead of the actual State of Health (SoH) percentage, while the diagnostic verdict is still visible.
- **Issue B**: Hardware streaming fails with `Hardware buffer requires exactly 100 active frames, got 200`.

The investigation established that these two symptoms are closely interconnected through a **shared state-management flaw in `frontend/src/App.tsx`**, coupled with prop severance and missing response fields in the backend.

Both independent reviewers (`health-and-frame-reviewer` and `thermocell-regression-reviewer`) verified the findings against live source code and Git status, corrected premature assumptions, and established a minimal implementation boundary.

---

## 2. Issue A: Health Gauge SoH Missing — Root Cause & Code Evidence

### Confirmed Root Cause
1. **Frontend Prop Severance (`frontend/src/App.tsx:342-345, 402-414`)**:
   `diagnosticRun` (typed as `DiagnosticRunResponse`) contains `soh?: number` and `discharge_capacity?: number`. However, `App.tsx:342-345` destructures only `telemetry`, `prediction`, and `features`. `soh` is never extracted or passed as a prop to `<DashboardView />` at lines 402-414.
2. **DashboardView Contract Omission (`frontend/src/views/DashboardView.tsx:7-18, 64-73`)**:
   `DashboardViewProps` lacks an `soh` property. `estSoh` attempts to read `telemetry?.metadata?.soh` or `features['soh']`. However, `features['soh']` is impossible because `DiagnosticPrediction.extracted_features` enforces `extra="forbid"` and strictly contains only the 14 canonical physics features.
3. **Backend Hardware Build & Session Recall Omission (`backend/app/api/routes_telemetry.py:91-96`, `backend/app/services/session_store.py:219-231`)**:
   In hardware streaming mode, `/api/telemetry/build-pulse` omits `soh` and `discharge_capacity` from its response dictionary. Furthermore, `session_store.py:get_diagnostic_run(session_id)` does not return `soh` at the top level of the returned dictionary on session recall.
4. **Decoupled Premature Verdict Badge (`frontend/src/views/DashboardView.tsx:293`)**:
   Line 293 contains `<VerdictBadge verdict={verdict ?? 'REUSE'} size="sm" showIcon />`. When `verdict` is null (prior to running a diagnostic or when cleared), this fallback forces a green `REUSE` badge to render while the gauge displays `—` and `AWAITING DIAGNOSTIC`.

---

## 3. Issue B: Hardware Frame Mismatch (200 vs 100) — Root Cause & Code Evidence

### Confirmed Root Cause
1. **Uncontrolled Dual-Execution Reactive Loop (`frontend/src/App.tsx:289-293`)**:
   Lines 289-293 implement an initial baseline execution effect with `[executeDiagnosticRun]` in its dependency array:
   ```typescript
   useEffect(() => {
     if (isAuthenticated()) {
       executeDiagnosticRun('nominal', 'B0005', 1);
     }
   }, [executeDiagnosticRun]);
   ```
   `executeDiagnosticRun` is wrapped in `useCallback` with dependencies `[isHardwareMode, profile, cellId, cycleIndex, executeSimulationRun, executeHardwareRun]`.
   Whenever a user selects a preset (e.g. clicking **Marginal C85** in `issue.mp4`):
   - `handleSelectProfile` immediately starts **Run 1** (`executeDiagnosticRun('marginal', 'B0005', 85)`) and sets state (`setProfile`, `setCycleIndex`).
   - React commits state updates and re-renders `<App />`.
   - On re-render, `executeDiagnosticRun` receives a new reference identity.
   - The reactive `useEffect` detects the dependency change and immediately triggers **Run 2** (`executeDiagnosticRun('nominal', 'B0005', 1)`).
2. **Missing Loop Cancellation & Concurrency Guard in `executeHardwareRun` (`frontend/src/App.tsx:167-273`)**:
   Neither loop (active: lines 202-225; relaxation: lines 228-249) checks `if (currentRequestId !== activeRequestIdRef.current) break;`. Both Run 1 and Run 2 execute all 120 iterations concurrently across the network.
3. **Backend Singleton Accumulation (`backend/app/services/telemetry_source.py:175-176`)**:
   Backend `routes_telemetry.py:18` uses a shared process-wide singleton `HardwareBufferSource`. Both runs stream their 100 active frames into `self._active_frames`, resulting in $100 + 100 = 200$ frames. When either run calls `/api/telemetry/build-pulse`, `len(self._active_frames) == 200 != 100`, raising `ValueError` and returning HTTP 400.

---

## 4. Technical and Regression Review Verdicts

### Technical Review Verdict: `CONFIRMED WITH CRITICAL AMENDMENTS`
- **Reviewer**: `health-and-frame-reviewer`
- **Key Finding**: Identified the common architectural root cause linking both issues: an unstable `useCallback` dependency chain in `App.tsx` recreating `executeDiagnosticRun` on every state change, triggering duplicate executions that overflow the hardware buffer and leave `diagnosticRun` null, which in turn triggers the misleading fallback `REUSE` badge in `DashboardView.tsx`.
- **Corrections**:
  - Refuted Agent 2's claim of a DCIR typo on line 190 of `App.tsx` (the code already assigned `bench.marginalDcir`).
  - Corrected Agent 1's proposed fix for line 293: passing `null` to `VerdictBadge` defaults to amber `'INVESTIGATE'`; conditional rendering `{verdict ? ... : ...}` is required.
  - Added required `try...except ValueError` in `routes_telemetry.py:ingest_hardware_frame` to prevent HTTP 500 errors.

### Regression Review Verdict: `APPROVED WITH CONSTRAINTS`
- **Reviewer**: `thermocell-regression-reviewer`
- **Key Finding**: Validated baseline stability (207 backend pytest tests, 5 frontend tests currently 100% passing) and verified all 20 uncommitted working files.
- **Constraints**:
  - Protect NASA Leave-One-Group-Out CV isolation (`cell_id` physical cell vs `cycle_index`).
  - Strict 3-tier data provenance (`REAL`, `SYNTHETIC`, `PREDICTED`).
  - For unknown cells (e.g. `HW-001`), `soh` must remain `None`, not synthetic data labeled `REAL`.
  - Enforce unconditional lock release in `finally { isStreamingRef.current = false; }`.

---

## 5. Confirmed vs. Disputed Findings Matrix

| Finding | Origin | Review Status | Resolution / Action |
|---|---|---|---|
| `App.tsx:342-345` drops `soh` | Agent 1 | **CONFIRMED** | Extract `const soh = diagnosticRun?.soh ?? null;` and pass to `DashboardView`. |
| `DashboardViewProps` lacks `soh` | Agent 1 | **CONFIRMED** | Add `soh?: number \| null;` to interface. |
| `features['soh']` fallback is dead code | Agent 1 | **CONFIRMED** | Replace with direct `soh` prop inspection. |
| False-positive `REUSE` badge on null verdict | Agent 1 | **CONFIRMED** | Conditionally render `VerdictBadge` only when `verdict !== null`. |
| Proposed fix: `verdict ?? null` for `VerdictBadge` | Agent 1 | **DISPUTED** | `VerdictBadge` defaults `null` to `'INVESTIGATE'`. Must conditionally render component. |
| `useEffect([executeDiagnosticRun])` causes dual execution | Agent 2 | **CONFIRMED** | Decouple mount effect with `hasRunInitialRef = useRef(false)`. |
| Concurrent hardware streaming loops flood buffer | Agent 2 | **CONFIRMED** | Add `isStreamingRef` mutex and in-loop cancellation check `currentRequestId !== activeRequestIdRef.current`. |
| Typo on `App.tsx:190` (DCIR vs Cycle Index) | Agent 2 | **REFUTED** | Line 190 is already correct. No change required. |
| Backend buffer capacity check needs HTTP 400 handler | Reviewer Discovery | **CONFIRMED** | Wrap buffer ingestion in `routes_telemetry.py` with `try...except ValueError: raise HTTPException(400)`. |

---

## 6. Exact Minimal Files Proposed for Modification

| # | File Path | Scope of Modification |
|---|---|---|
| 1 | `frontend/src/App.tsx` | Decouple mount effect using `hasRunInitialRef`; add `isStreamingRef` concurrency mutex; add in-loop cancellation check in `executeHardwareRun`; extract `soh` and forward to `<DashboardView />`. |
| 2 | `frontend/src/views/DashboardView.tsx` | Add `soh` to `DashboardViewProps`; update `estSoh` to use `soh` prop; conditionally render `VerdictBadge` only when `verdict !== null`; set radial arc stop color to `#334155` when verdict is null. |
| 3 | `backend/app/api/routes_telemetry.py` | Attach empirical NASA `soh` and `discharge_capacity` in `/api/telemetry/build-pulse` response; catch `ValueError` in `ingest_hardware_frame` and return HTTP 400. |
| 4 | `backend/app/services/telemetry_source.py` | Add capacity limits in `HardwareBufferSource` (100 active, 20 relaxation frames). |
| 5 | `backend/app/services/session_store.py` | Extract `soh` and `discharge_capacity` from metadata in `get_diagnostic_run()` and return as top-level keys. |
| 6 | `backend/tests/test_telemetry_source.py` | Add unit tests for buffer capacity enforcement. |

---

## 7. Regression Test Plan

1. **Gate 1: Existing Test Suite Preservation**:
   - Run `py -3.14 -m pytest backend/tests` (verify all 207 tests pass).
   - Run `npm test --prefix frontend` (verify all 5 tests pass).
2. **Gate 2: Health Gauge SoH Verification**:
   - Verify simulation mode: `POST /api/simulate` -> `soh: 92.83` -> Gauge renders `92.8%`.
   - Verify hardware mode: `POST /api/telemetry/build-pulse` -> returns `soh: 76.20` -> Gauge renders `76.2%`.
   - Verify session recall: `GET /api/sessions/{id}` -> returns top-level `soh` -> Gauge displays recalled SoH.
   - Verify initial load null verdict: No `REUSE` or `INVESTIGATE` badge displayed; status reads `AWAITING DIAGNOSTIC`; gauge displays `—`.
3. **Gate 3: Hardware Frame Count Verification**:
   - Verify `executeHardwareRun` dispatches exactly 100 active + 20 relaxation frames (120 total), never 200.
   - Verify rapid profile switching aborts superseded streaming loops cleanly.
   - Verify backend buffer rejects 101st active frame with HTTP 400.
4. **Gate 4: Provenance & Leakage Integrity**:
   - Verify `provenance` remains `REAL` for physical hardware and `SYNTHETIC` for simulation.
   - Verify `test_leakage_audit.py` passes (Leave-One-Group-Out CV intact).

---

## 8. Protected Functionality & Negative List

The following files and systems are **STRICTLY PROTECTED AND UNTOUCHED**:
- `backend/app/services/ml_service.py` (Model weights, Random Forest classifier, decision fusion)
- `backend/app/services/feature_service.py` (14 canonical physics features)
- `backend/app/models/schemas_battery.py` (Core Pydantic models, `DiagnosticPrediction`)
- `backend/app/models/schemas_provenance.py` (Provenance tiers, physical cell ID regex)
- `backend/app/core/auth.py` (JWT operator authentication)
- `hardware/serial_bridge.py` (Serial bridge ingestion)
- `frontend/src/components/VerdictBadge.tsx` (Component design)
- `frontend/src/components/OverallHealthGauge.tsx` (Orphaned component)
- All training pipelines in `ml/` and database configuration.

---

## 9. Unresolved Questions or Missing Evidence

**None.** Both root causes were reproduced, traced through actual code paths, corroborated by video evidence (`issue.mp4`), and verified by independent technical and regression reviews.
