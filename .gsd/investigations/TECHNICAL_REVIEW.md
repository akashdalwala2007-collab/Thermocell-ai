# Independent Technical Review: Health Gauge SoH Propagation and Hardware Frame Pipeline

**Document Path**: `.gsd/investigations/TECHNICAL_REVIEW.md`  
**Reviewer**: `health-and-frame-reviewer` (Independent Technical Reviewer)  
**Date**: November 9, 2026  
**Status**: Completed — Findings Evaluated & Boundary-Scoped  
**Target Investigations Reviewed**:
1. Agent 1: `.gsd/investigations/ISSUE_A_HEALTH_GAUGE.md` (Issue A: Health Gauge SoH Missing)
2. Agent 2: `.gsd/investigations/ISSUE_B_HARDWARE_FRAME.md` (Issue B: Hardware Buffer Active Frame Overflow)

---

## 1. Executive Summary & Verdict

An exhaustive, skeptical technical peer review was conducted on both root-cause investigation reports. The investigation findings were verified directly against the live repository source files, git diff history, and frontend component lifecycles.

### Master Verdict
| Investigation | Verdict | Confidence | Primary Evaluation Summary |
|---|---|---|---|
| **Agent 1 (Issue A: Health Gauge SoH)** | **Confirmed with Critical Fix Amendments** | High (95%) | Verified the multi-point severance in `App.tsx:342-345` and `DashboardView.tsx:64-73`. However, Agent 1's proposed UI fix for line 293 (`verdict ?? null`) would cause `VerdictBadge.tsx` to default to `'INVESTIGATE'` (amber badge), creating a new false positive. A conditional render `{verdict ? ... : ...}` is required instead. Hardware SoH fallback for non-benchmark cells was also underspecified. |
| **Agent 2 (Issue B: Hardware Frame Overflow)** | **Confirmed with Corrections & Exception Handling Fix** | High (95%) | Empirically verified the dual-execution reactive loop triggered by `useEffect([executeDiagnosticRun])` in `App.tsx:289-293`. However, Agent 2 **misquoted line 190 of `App.tsx`** claiming a DCIR benchmark typo that does not actually exist in the code (`bench.marginalDcir` is already correctly assigned). Furthermore, Agent 2's backend capacity fix in `HardwareBufferSource` omitted the necessary `try...except ValueError` in `routes_telemetry.py:ingest_hardware_frame`, which would turn buffer overflow rejections into unhandled HTTP 500 errors. |

---

## 2. Review of Agent 1 (Health Gauge SoH Missing)

### 2.1 Findings Assessment & Evidence Quality
Agent 1 traced the SoH lifecycle across 9 architectural stages. Direct code verification confirms:
1. **Frontend App Prop Severance (`frontend/src/App.tsx:342-345, 402-414`) [CONFIRMED]**:
   `diagnosticRun` (typed as `DiagnosticRunResponse`) contains `soh?: number` and `discharge_capacity?: number`. However, lines 342-344 destructure only `telemetry`, `prediction`, and `features`. `soh` is never extracted into state or passed into `<DashboardView />` at lines 402-414.
2. **DashboardView Contract Omission (`frontend/src/views/DashboardView.tsx:7-18, 64-73`) [CONFIRMED]**:
   `DashboardViewProps` lacks an `soh` property. `estSoh` relies on:
   ```typescript
   const estSoh = useMemo(() => {
     if (telemetry?.metadata?.soh) {
       const parsed = parseFloat(telemetry.metadata.soh);
       if (!isNaN(parsed) && parsed > 0) return parsed;
     }
     if (features && typeof (features as any)['soh'] === 'number') {
       return (features as any)['soh'];
     }
     return null;
   }, [telemetry, features]);
   ```
   The `features['soh']` fallback is a dead code branch: `DiagnosticPrediction.extracted_features` enforces the canonical 14 physics features (`DCIR`, `ΔV10`, etc.) and extra keys are strictly forbidden by `ConfigDict(extra="forbid")` in `schemas_battery.py:214`.
3. **Hardware & Session Persistence Omission (`routes_telemetry.py:91-96`, `session_store.py:219-231`) [CONFIRMED]**:
   In hardware streaming mode, `/api/telemetry/build-pulse` fails to look up or attach `soh` and `discharge_capacity`. In addition, `get_diagnostic_run(session_id)` does not return `soh` at the top level of the returned dictionary.
4. **Premature Default Verdict Decoupling (`DashboardView.tsx:293`) [CONFIRMED]**:
   Line 293 contains `<VerdictBadge verdict={verdict ?? 'REUSE'} size="sm" showIcon />`. When `verdict` is null (prior to running a diagnostic or when cleared), this fallback forces a green `REUSE` badge to render while the gauge displays `—` and `AWAITING DIAGNOSTIC`.

### 2.2 Fix Soundness & Defect Critique
- **Critique of Fix 4 (Line 293 Badge)**: Agent 1 proposed changing `verdict ?? 'REUSE'` to `verdict ?? null`.  
  **FLAW**: Direct inspection of `frontend/src/components/VerdictBadge.tsx:14` reveals `const norm = (verdict || 'INVESTIGATE').toUpperCase();`. Passing `null` to `VerdictBadge` defaults to `'INVESTIGATE'`, rendering an amber warning badge!
  **Required Fix**: Conditional rendering in `DashboardView.tsx`:
  ```tsx
  {verdict ? (
    <VerdictBadge verdict={verdict} size="sm" showIcon />
  ) : (
    <span className="px-1.5 py-0.5 rounded bg-[#0b1324] text-slate-400 font-mono text-[10px] border border-[#1a2d52]">
      AWAITING
    </span>
  )}
  ```
- **Critique of Fix 1 (Hardware SoH)**: For hardware mode (`routes_telemetry.py`), query `get_nasa_cycle_record(validated_cell_id, cycle_index=request.cycle_index)`. For non-benchmark cells (e.g. `HW-001`), calculate `soh` from empirical DCIR correlation or preserve null cleanly without failing.

---

## 3. Review of Agent 2 (Hardware Frame Pipeline)

### 3.1 Findings Assessment & Evidence Quality
Agent 2 investigated the HTTP 400 Bad Request error (`Hardware buffer requires exactly 100 active frames, got 200`). Direct code verification confirms:
1. **Uncontrolled Dual-Execution Reactive Loop (`frontend/src/App.tsx:289-293`) [CONFIRMED]**:
   Lines 289-293 implement an initial baseline execution effect with `[executeDiagnosticRun]` in its dependency array. Because `executeDiagnosticRun` is recreated whenever state updates, user clicks immediately trigger a second, duplicate execution.
2. **Missing Loop Cancellation & Concurrency Guard in `executeHardwareRun` (`App.tsx:167-273`) [CONFIRMED]**:
   Neither loop (active: lines 202-225; relaxation: lines 228-249) checks `if (currentRequestId !== activeRequestIdRef.current) break;`. Both Run 1 and Run 2 execute all 120 iterations concurrently.
3. **Backend Buffer Aggregation (`telemetry_source.py:175-176`) [CONFIRMED]**:
   Backend `routes_telemetry.py:18` uses a shared singleton `HardwareBufferSource`. Both runs stream their 100 active frames into `self._active_frames`, resulting in $100 + 100 = 200$ frames. When either run calls `/api/telemetry/build-pulse`, `len(self._active_frames) == 200 != 100`, raising `ValueError` and returning HTTP 400.

### 3.2 Disputed / Unsupported Finding in Agent 2 Report
- **Section 5 (Secondary Bug: Benchmark DCIR vs Cycle Index Typo) [DISPUTED / REFUTED]**:
  Agent 2 claimed line 190 in `frontend/src/App.tsx` assigned `bench.marginalCycle` ($85\,\Omega$) to `dcir` instead of `bench.marginalDcir` ($0.145\,\Omega$). Direct inspection of `frontend/src/App.tsx:190` shows line 190 already correctly references `bench.marginalDcir` and `bench.degradedDcir`. Line 191 assigns cycle indices to `targetCycleIndex`. No code change is required for line 190.

### 3.3 Backend Defense-in-Depth Exception Handling Defect
Agent 2 proposed enforcing capacity bounds in `HardwareBufferSource.ingest_active_frame`:
```python
if len(self._active_frames) >= 100:
    raise ValueError("Hardware buffer active frames at capacity (100). Clear buffer before starting a new run.")
```
**FLAW**: Direct inspection of `backend/app/api/routes_telemetry.py:50-68` reveals that `/api/telemetry/frame` has no exception handler for `ValueError`. If `ingest_active_frame` raises `ValueError`, FastAPI will respond with **HTTP 500 Internal Server Error** instead of a handled HTTP 400.  
**Required Fix**: Wrap frame ingestion in `routes_telemetry.py` with `try...except ValueError as e: raise HTTPException(status_code=400, detail=str(e))`.

---

## 4. Cross-Cutting Analysis: Shared Root Causes

1. **Cascading Re-render Storm in `frontend/src/App.tsx`**:
   The `useEffect(..., [executeDiagnosticRun])` hook was intended as a one-time initial baseline run. Because `executeDiagnosticRun` closes over mutable props, every preset click re-triggers this hook with hardcoded `'nominal'`, `'B0005'`, `1`.
   - In hardware mode, this causes Issue B (200 frames overflow).
   - In simulation mode, this causes a silent race condition where user clicks (e.g. Marginal C85) are cancelled by `activeRequestIdRef` and overwritten by the hardcoded Nominal C1 baseline run!
2. **Severance of Unified `DiagnosticRunResponse` Contract**:
   Both simulation and hardware endpoints produce diagnostic runs. The backend and frontend TypeScript interfaces declare `soh?: number`. Yet `App.tsx` discards `soh` on line 342 and never passes it to `DashboardView`, while `routes_telemetry.py` fails to populate it in hardware mode.
3. **Improper Handling of Null Diagnostic State**:
   When a diagnostic run is awaiting execution or fails due to a network/buffer error, `diagnosticRun` is `null`. `DashboardView.tsx` improperly masks this with `verdict ?? 'REUSE'`, misleading the operator into thinking a valid verdict was produced while the Health Gauge is blank.

---

## 5. Confirmed vs. Disputed Findings Matrix

| Finding | Investigator | Reviewer Verdict | Code Evidence / Justification |
|---|---|---|---|
| `App.tsx:342-345` drops `soh` and `discharge_capacity` | Agent 1 | **CONFIRMED** | `telemetry`, `prediction`, and `features` are extracted; `soh` is completely ignored (`App.tsx:342-344`). |
| `DashboardViewProps` lacks `soh` | Agent 1 | **CONFIRMED** | `DashboardViewProps` (`DashboardView.tsx:7-18`) has no `soh` property. |
| `features['soh']` fallback is dead code | Agent 1 | **CONFIRMED** | `DiagnosticPrediction.extracted_features` schema permits only 14 canonical physics features (`schemas_battery.py:214`). |
| `DashboardView.tsx:293` displays false positive `REUSE` | Agent 1 | **CONFIRMED** | `<VerdictBadge verdict={verdict ?? 'REUSE'} ... />` forces `'REUSE'` when `verdict` is `null`. |
| Fix: change `verdict ?? 'REUSE'` to `verdict ?? null` | Agent 1 | **DISPUTED** | `VerdictBadge.tsx:14` internally falls back `(verdict || 'INVESTIGATE')`, which turns `null` into amber `'INVESTIGATE'`. Must use conditional render instead. |
| `useEffect([executeDiagnosticRun])` causes dual execution | Agent 2 | **CONFIRMED** | `executeDiagnosticRun` dependency churn triggers reactive effect on every user interaction (`App.tsx:289-293`). |
| Concurrent hardware streaming loops flood buffer to 200 | Agent 2 | **CONFIRMED** | `executeHardwareRun` loops lack cancellation checks; Run 1 and Run 2 stream $100 + 100 = 200$ active frames into singleton. |
| `App.tsx:190` has DCIR vs Cycle Index typo | Agent 2 | **DISPUTED / REFUTED** | `App.tsx:190` already uses `bench.marginalDcir` and `bench.degradedDcir`. Line 191 handles cycle index. |
| Backend buffer capacity check needs HTTP 400 handler | Reviewer Discovery | **CONFIRMED** | `telemetry_source.py` raises `ValueError`, but `routes_telemetry.py:ingest_hardware_frame` lacks `try...except ValueError`. |

---

## 6. Recommended Minimal Implementation Boundaries

### Boundary 1: Frontend Lifecycle & State Decoupling (`frontend/src/App.tsx`)
- **Mount Effect**: Replace `useEffect(..., [executeDiagnosticRun])` with an initialization ref guard:
  ```typescript
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (isAuthenticated() && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      executeDiagnosticRun('nominal', 'B0005', 1);
    }
  }, [isLoggedIn]);
  ```
- **Concurrency Mutex & Loop Cancellation**: In `executeHardwareRun`:
  - Add active streaming ref `isStreamingRef = useRef(false)`. If already streaming, abort or ignore duplicate trigger.
  - Inside both active (line 202) and relaxation (line 228) `for` loops, check:
    ```typescript
    if (currentRequestId !== activeRequestIdRef.current) return;
    ```
- **SoH Prop Propagation**:
  - Line 345: Add `const soh = diagnosticRun?.soh ?? null;`.
  - Pass `soh={soh}` to `<DashboardView />` at line 403.

### Boundary 2: Health Gauge Component & State Sync (`frontend/src/views/DashboardView.tsx`)
- Add `soh?: number | null;` to `DashboardViewProps`.
- Update `estSoh`:
  ```typescript
  const estSoh = useMemo(() => {
    if (soh !== undefined && soh !== null) return soh;
    if (telemetry?.metadata?.soh) {
      const parsed = parseFloat(telemetry.metadata.soh);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return null;
  }, [soh, telemetry]);
  ```
- Line 293: Replace `<VerdictBadge verdict={verdict ?? 'REUSE'} ... />` with conditional render:
  ```tsx
  {verdict ? (
    <VerdictBadge verdict={verdict} size="sm" showIcon />
  ) : (
    <span className="px-1.5 py-0.5 rounded bg-[#0b1324] text-slate-400 font-mono text-[10px] border border-[#1a2d52]">
      AWAITING
    </span>
  )}
  ```
- Lines 319-326: When `verdict` is null, radial arc stroke color stops must use neutral dark slate (`#334155`).

### Boundary 3: Backend Hardware Telemetry & Session Ingestion
- **`backend/app/api/routes_telemetry.py`**:
  - In `build_pulse_and_diagnose`: Look up empirical NASA record via `get_nasa_cycle_record(validated_cell_id, cycle_index=request.cycle_index)`. Include `soh` and `discharge_capacity` in the response dict.
  - In `ingest_hardware_frame`: Wrap frame ingestion in `try...except ValueError as e: raise HTTPException(status_code=400, detail=str(e))`.
- **`backend/app/services/telemetry_source.py`**:
  - In `HardwareBufferSource.ingest_active_frame`: Raise `ValueError` if `len(self._active_frames) >= 100`.
  - In `HardwareBufferSource.ingest_relaxation_frame`: Raise `ValueError` if `len(self._relax_frames) >= 20`.
- **`backend/app/services/session_store.py`**:
  - In `get_diagnostic_run(session_id)`: Extract `soh` and `discharge_capacity` from `metadata` in `telemetry_json` and include in top-level returned dict.
