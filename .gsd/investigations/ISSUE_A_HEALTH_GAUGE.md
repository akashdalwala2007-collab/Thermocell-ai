# Root-Cause Investigation Report: Issue A — Health Gauge SoH Missing

**Document Path**: `.gsd/investigations/ISSUE_A_HEALTH_GAUGE.md`  
**Date**: November 9, 2026  
**Investigator**: `health-gauge-investigator`  
**Status**: Diagnosed  

---

## Executive Summary

In ThermoCell-AI, the **Health Gauge** on the main diagnostics dashboard displays `—` instead of the actual State of Health (SoH) percentage, even when a diagnostic triage classification (e.g. `REUSE`, `INVESTIGATE`, `RETIRE`) is clearly displayed on the dashboard.

This investigation traced the end-to-end data lifecycle of State of Health (SoH) across all 9 architectural stages: from backend NASA data parsing and ML inference to database session persistence, FastAPI Pydantic serialization, frontend HTTP ingestion, React state management, component prop hierarchies, and radial SVG rendering.

The root cause is a **multi-point propagation breakdown**:
1. **Frontend Prop Severance**: In `frontend/src/App.tsx` (lines 342-345 and lines 402-414), the top-level `soh` property returned by the backend `DiagnosticRunResponse` is completely ignored and dropped; it is never forwarded into `frontend/src/views/DashboardView.tsx` (lines 7-18).
2. **DashboardView Prop Contract Omission**: `frontend/src/views/DashboardView.tsx` (lines 64-73) does not accept `soh` as a prop; instead, it relies on an fragile fallback scraping `telemetry?.metadata?.soh` or `features['soh']` (where `features['soh']` is strictly impossible because the canonical feature extractor forbids non-canonical keys).
3. **Backend Hardware Telemetry & Session Persistence Omission**: In `backend/app/api/routes_telemetry.py` (lines 91-96) (`/api/telemetry/build-pulse`) and `backend/app/services/session_store.py` (lines 219-231) (`get_diagnostic_run`), `soh` is never returned in the payload, and `HardwareBufferSource` does not attach `soh` to metadata.
4. **Premature Default Verdict Decoupling**: In `frontend/src/views/DashboardView.tsx` (line 293), line 293 contains `<VerdictBadge verdict={verdict ?? 'REUSE'} size="sm" showIcon />`. When `verdict` is null (prior to running a diagnostic or when cleared), this fallback forces a green `REUSE` badge to render while the gauge displays `—` and `AWAITING DIAGNOSTIC`.
5. **Orphaned Component**: `frontend/src/components/OverallHealthGauge.tsx` is completely unreferenced by any view and contains a hardcoded default `sohPercentage = 84`.

---

## 9-Stage End-to-End SoH Lifecycle Trace

```mermaid
flowchart TD
    subgraph Stage1_BackendResponse ["Stage 1 & 5: Backend API Serialization"]
        A1["routes_simulation.py /api/simulate"] -->|Returns DiagnosticRunResponse| A2["soh: float (92.83)<br/>telemetry.metadata.soh: '92.83'"]
        B1["routes_telemetry.py /api/telemetry/build-pulse"] -->|Omits soh!| B2["soh: None<br/>metadata: {'source': 'ESP32...'}"]
    end

    subgraph Stage2_MLModel ["Stage 2: ML Inference"]
        M1["ml_service.py: predict_diagnostic_triage()"]
        M1 -->|Pure Classifier (Model 1)| M2["DiagnosticPrediction:<br/>triage_class: REUSE | RETIRE | INVESTIGATE<br/>class_probabilities: Dict<br/>NO SOH (Forbidden by schema)"]
    end

    subgraph Stage3_NASA ["Stage 3: Telemetry Metadata"]
        N1["nasa_service.py: get_nasa_cycle_record()"] -->|Empirical SoH| N2["NASACycleRecord.soh = (cap / 2.0) * 100"]
    end

    subgraph Stage4_SessionStore ["Stage 4: Session Persistence"]
        S1["session_store.py: save_diagnostic_run()"]
        S2["session_store.py: get_diagnostic_run()"] -->|Omits top-level soh!| S3["Returns telemetry, prediction, features<br/>NO top-level soh"]
    end

    subgraph Stage6_FrontendAPI ["Stage 6: Frontend API Client"]
        F1["api.ts: DiagnosticRunResponse"] -->|Declares soh?: number| F2["simulatePulse(): Promise<DiagnosticRunResponse>"]
    end

    subgraph Stage7_AppState ["Stage 7: App.tsx State Management"]
        AP1["diagnosticRun state receives DiagnosticRunResponse"]
        AP2["telemetry = diagnosticRun?.telemetry<br/>prediction = diagnosticRun?.prediction<br/>features = diagnosticRun?.features"]
        AP3["diagnosticRun.soh is DROPPED!"]
    end

    subgraph Stage8_Props ["Stage 8: DashboardView Props"]
        D1["DashboardViewProps lacks soh!"]
        D2["estSoh = useMemo(() => telemetry?.metadata?.soh ?? features['soh'])"]
    end

    subgraph Stage9_Rendering ["Stage 9: Health Gauge Rendering"]
        R1["DashboardView.tsx L348: estSoh !== null ? estSoh.toFixed(1) : '—'"]
        R2["DashboardView.tsx L293: verdict ?? 'REUSE' (renders REUSE even when null!)"]
        R3["OverallHealthGauge.tsx: Orphaned, hardcoded default 84%"]
    end

    A2 --> F2
    B2 --> F2
    N2 --> A1
    M2 --> A1
    S3 --> F2
    F2 --> AP1
    AP1 --> AP2
    AP2 -.->|soh omitted| D1
    D1 --> D2
    D2 -->|estSoh is null| R1
```

### Stage 1: Backend Diagnostic Response
- **File**: `backend/app/api/routes_simulation.py` (lines 29-37)
  - `DiagnosticRunResponse` schema explicitly defines `soh: Optional[float] = Field(default=None, description="Empirical State of Health (%) from NASA literature benchmark")`.
  - Line 85 & 117: Sets `metadata["soh"] = f"{soh:.2f}"`.
  - Line 141-148: Returns `DiagnosticRunResponse(session_id=session_id, telemetry=telemetry, prediction=prediction, features=..., soh=soh, discharge_capacity=discharge_capacity)`.
- **File**: `backend/app/api/routes_telemetry.py` (lines 91-96)
  - `/api/telemetry/build-pulse` returns only `{ "session_id", "telemetry", "prediction", "features" }`.
  - `soh` and `discharge_capacity` are **completely missing** from the hardware diagnostic response.

### Stage 2: ML Prediction and SoH Generation
- **File**: `backend/app/services/ml_service.py` (lines 152-236)
  - Model 1 (`health_model.joblib`) is a **Random Forest / Logistic Regression classifier** that predicts class probabilities for `REUSE`, `INVESTIGATE`, `RETIRE`.
  - It does **not** predict a numeric SoH percentage.
  - `DiagnosticPrediction` (lines 227-236) outputs `triage_class`, `confidence`, `class_probabilities`, and `extracted_features`.
  - In `backend/app/models/schemas_battery.py` (line 214), `DiagnosticPrediction` enforces `ConfigDict(frozen=True, extra="forbid")`. SoH cannot be stored on `prediction`.
  - **Key Finding**: Verdict calculation and numeric SoH are **strictly decoupled** in the machine learning architecture.

### Stage 3: Telemetry Metadata
- **File**: `backend/app/services/nasa_service.py` (lines 28, 56-63)
  - `NASACycleRecord.soh` is computed from empirical discharge capacity: `(discharge_capacity / 2.0) * 100.0`.
- **File**: `backend/app/services/telemetry_source.py` (line 244)
  - `HardwareBufferSource.get_pulse_telemetry()` hardcodes `metadata={"source": "ESP32_INA219_AMG8833"}` with **no `soh`**.

### Stage 4: Session Persistence
- **File**: `backend/app/services/session_store.py` (lines 207-231)
  - `get_diagnostic_run(session_id)` deserializes `telemetry_json`, `features_json`, and `prediction_json`.
  - It **omits `soh` and `discharge_capacity`** at the top level of the returned dictionary, even though `list_recent_sessions()` (lines 304-308) extracts `d["soh"] = float(meta["soh"])`.
  - Recalling a session via `/api/sessions/{session_id}` therefore returns `soh: None`.

### Stage 5: API Serialization
- **File**: `backend/app/models/schemas_battery.py` (line 151)
  - `BatteryPulseTelemetry.metadata: Optional[Dict[str, str]] = Field(default_factory=dict)`.
  - All metadata values must be strings (e.g. `"soh": "92.83"`).
  - In `routes_simulation.py`, `DiagnosticRunResponse` serializes top-level `soh: 92.83` as a float.

### Stage 6: Frontend API Parsing
- **File**: `frontend/src/services/api.ts` (lines 44-51)
  - The TypeScript contract explicitly defines `soh?: number`.
  - `simulatePulse()` receives `{ soh: 92.83, ... }` from FastAPI.

### Stage 7: App-Level State Management
- **File**: `frontend/src/App.tsx` (lines 342-345)
  - `const telemetry = diagnosticRun?.telemetry ?? null;`
  - `const prediction = diagnosticRun?.prediction ?? null;`
  - `const features = diagnosticRun?.features ?? null;`
  - **SEVERANCE POINT**: `diagnosticRun?.soh` is **NEVER extracted**!
- **File**: `frontend/src/App.tsx` (lines 402-414)
  - **SEVERANCE POINT**: `soh` is **never passed** down to `DashboardView`!

### Stage 8: DashboardView Props
- **File**: `frontend/src/views/DashboardView.tsx` (lines 7-18)
  - `DashboardViewProps` defines `telemetry`, `prediction`, `features`, `recentSessions`, `isHardwareMode`, etc.
  - It has **no `soh` prop**.
- **File**: `frontend/src/views/DashboardView.tsx` (lines 64-73)
  - `estSoh` tries to parse `telemetry?.metadata?.soh` or `features['soh']`.
  - `(features as any)['soh']` never exists because `extracted_features` contains only the 14 canonical physics features (`OCV`, `DCIR`, `ΔV10`, etc.).
  - `telemetry?.metadata?.soh` fails on hardware mode, recalled sessions, and whenever metadata is absent.

### Stage 9: Health Gauge Rendering
- **File**: `frontend/src/views/DashboardView.tsx` (line 293)
  - `<VerdictBadge verdict={verdict ?? 'REUSE'} size="sm" showIcon />`
  - **FALSE POSITIVE VERDICT**: `verdict ?? 'REUSE'` forces the verdict badge to render a green `REUSE` badge even when `verdict` is `null`.
- **File**: `frontend/src/views/DashboardView.tsx` (lines 347-353)
  - Center of gauge displays `'—'` whenever `estSoh === null`.
- **File**: `frontend/src/views/DashboardView.tsx` (lines 886-890)
  - Secondary "Model 1: SoH Classifier" card also renders `'—'` when `estSoh === null`.
- **File**: `frontend/src/components/OverallHealthGauge.tsx` (lines 10-14)
  - Unused/orphaned component; contains hardcoded default `sohPercentage = 84`.

---

## Detailed Evidence Matrix

| # | File & Line | Code Snippet | Flaw / Impact |
|---|---|---|---|
| 1 | `backend/app/api/routes_telemetry.py:91-96` | `return {"session_id": session_id, "telemetry": ..., "prediction": ..., "features": ...}` | `/api/telemetry/build-pulse` fails to return `soh` and `discharge_capacity`. |
| 2 | `backend/app/services/telemetry_source.py:244` | `metadata={"source": "ESP32_INA219_AMG8833"}` | `HardwareBufferSource` sets telemetry metadata without `soh`. |
| 3 | `backend/app/services/session_store.py:219-231` | `return {"session_id": ..., "telemetry": ..., "features": ..., "prediction": ...}` | `get_diagnostic_run(session_id)` omits top-level `soh` on session recall. |
| 4 | `frontend/src/App.tsx:342-344` | `const telemetry = diagnosticRun?.telemetry ?? null;` | `diagnosticRun?.soh` is completely ignored and dropped in React state. |
| 5 | `frontend/src/App.tsx:402-414` | `<DashboardView telemetry={telemetry} ... />` | `soh` is never passed to `DashboardView`. |
| 6 | `frontend/src/views/DashboardView.tsx:7-18` | `interface DashboardViewProps { ... }` | `DashboardViewProps` contract lacks `soh?: number \| null;`. |
| 7 | `frontend/src/views/DashboardView.tsx:64-73` | `const estSoh = useMemo(() => { if (telemetry?.metadata?.soh) ... if (features['soh']) ... })` | Fails to inspect `soh` prop; `features['soh']` never exists; fails on hardware and recalled sessions. |
| 8 | `frontend/src/views/DashboardView.tsx:293` | `<VerdictBadge verdict={verdict ?? 'REUSE'} size="sm" showIcon />` | Erroneously displays `'REUSE'` badge when `verdict` is null, creating false impression that verdict is available while SoH is `'—'`. |
| 9 | `frontend/src/components/OverallHealthGauge.tsx:10-14` | `export const OverallHealthGauge: React.FC<OverallHealthGaugeProps> = ({ sohPercentage = 84, ... })` | Orphaned component; prohibited hardcoded default `84`. |

---

## Minimal Proposed Fix

### 1. Backend: Telemetry Build Route (`backend/app/api/routes_telemetry.py`)
In `build_pulse_and_diagnose`:
Add `soh` and `discharge_capacity` using `get_nasa_cycle_record(validated_cell_id, cycle_index=request.cycle_index)` if available, or DCIR empirical correlation. Return `soh` and `discharge_capacity` in the response dict.

### 2. Backend: Session Store Recall (`backend/app/services/session_store.py`)
In `get_diagnostic_run(session_id)`:
Extract `soh` and `discharge_capacity` from stored telemetry metadata and return them at the top level of the dictionary.

### 3. Frontend: App State Propagation (`frontend/src/App.tsx`)
Extract `const soh = diagnosticRun?.soh ?? null;` and pass `soh={soh}` to `<DashboardView />`.

### 4. Frontend: DashboardView Prop & estSoh Calculation (`frontend/src/views/DashboardView.tsx`)
- Add `soh?: number | null;` to `DashboardViewProps`.
- Update `estSoh` to inspect `soh` prop first, falling back to `telemetry?.metadata?.soh`.
- Fix line 293: Change `verdict ?? 'REUSE'` to `verdict ?? null` so no false positive badge appears before diagnostic completion.
- Fix lines 319-325: Default radial arc to neutral dark slate (`#334155`) when `verdict` is null.

---

## Regression Test Requirements

1. **Simulation Mode SoH Propagation**:
   - Assert `data.soh` is present and matches `NASACycleRecord.soh` within 0.01%.
   - In `DashboardView`, verify `estSoh` equals `data.soh` and gauge displays `${soh.toFixed(1)}%`.
2. **Hardware Mode SoH Propagation**:
   - Execute `/api/telemetry/build-pulse`. Assert response contains `soh` and `discharge_capacity`.
3. **Session Recall SoH Integrity**:
   - Save and recall session via `/api/sessions/{session_id}`. Assert top-level `soh` is restored.
4. **Decoupled Null Verdict Handling**:
   - On initial load prior to diagnostic execution (`verdict === null`, `soh === null`), verify verdict badge does NOT display `REUSE`.
5. **NASA Ground Truth Immutability**:
   - Ensure all existing NASA cycle benchmark fixtures in `nasa_service.py` remain untouched.
