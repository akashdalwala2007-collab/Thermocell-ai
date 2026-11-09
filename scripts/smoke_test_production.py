#!/usr/bin/env python3
"""
ThermoCell-AI Production Smoke Test Suite.
Performs non-destructive end-to-end verification against local or deployed production instances.
Validates: Health, Security Headers, Operator Auth, Pulse Simulation, ML Inference, Persistence, and Route Protection.
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import sys
import time
from typing import Dict, Any, Optional

try:
    import httpx
except ImportError:
    print("[ERROR] httpx is required. Install via: pip install httpx")
    sys.exit(1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="ThermoCell-AI Production Smoke Test")
    parser.add_argument(
        "--api-url",
        default=os.getenv("API_URL", "http://127.0.0.1:8000"),
        help="Backend base URL (e.g. https://thermocell-backend.onrender.com or http://127.0.0.1:8000)",
    )
    parser.add_argument(
        "--username",
        default=os.getenv("OPERATOR_USERNAME", "operator"),
        help="Operator username for authentication",
    )
    parser.add_argument(
        "--frontend-url",
        default=os.getenv("FRONTEND_URL", None),
        help="Optional frontend origin URL to verify CORS headers (e.g. https://thermocell.netlify.app)",
    )
    return parser.parse_args()


def log_step(step_num: int, title: str) -> None:
    print(f"\n[Stage {step_num}] {title}...")


def assert_condition(condition: bool, message: str) -> None:
    if not condition:
        print(f"  FAILED: {message}")
        sys.exit(1)
    print(f"  OK: {message}")


def run_smoke_test():
    args = parse_args()
    api_url = args.api_url.rstrip("/")
    username = args.username
    frontend_url = args.frontend_url.rstrip("/") if args.frontend_url else None

    # Retrieve sensitive credentials from environment or prompt interactively
    password = os.getenv("OPERATOR_PASSWORD")
    if not password:
        if sys.stdin.isatty():
            password = getpass.getpass(f"Enter operator password for user '{username}': ")
        else:
            # Fallback for automated test suites
            password = "thermocell2026"

    hardware_key = os.getenv("HARDWARE_API_KEY", "dev-hardware-key-thermocell-2026")

    print("=" * 70)
    print("ThermoCell-AI Production Smoke Test Runner")
    print(f"Target API:      {api_url}")
    print(f"Operator User:   {username}")
    if frontend_url:
        print(f"Frontend Origin: {frontend_url}")
    print("=" * 70)

    client = httpx.Client(timeout=15.0)

    # -------------------------------------------------------------------------
    # Stage 1: Health & Readiness Check
    # -------------------------------------------------------------------------
    log_step(1, "Checking Service Health (/health)")
    health_resp = client.get(f"{api_url}/health")
    assert_condition(health_resp.status_code == 200, f"Health endpoint returned HTTP {health_resp.status_code}")
    health_data = health_resp.json()
    assert_condition(health_data.get("status") == "healthy", f"Service status is '{health_data.get('status')}'")
    assert_condition("STRICT_ENFORCEMENT" in health_data.get("provenance_system", ""), "Provenance enforcement verified")

    # -------------------------------------------------------------------------
    # Stage 2: Security & CORS Inspection
    # -------------------------------------------------------------------------
    log_step(2, "Inspecting Security & CORS Headers")
    headers = health_resp.headers
    assert_condition("nosniff" in headers.get("X-Content-Type-Options", ""), "X-Content-Type-Options: nosniff present")
    assert_condition("DENY" in headers.get("X-Frame-Options", ""), "X-Frame-Options: DENY present")

    if frontend_url:
        cors_resp = client.options(
            f"{api_url}/health",
            headers={"Origin": frontend_url, "Access-Control-Request-Method": "GET"},
        )
        assert_condition(
            200 <= cors_resp.status_code < 300,
            f"CORS preflight /health returned HTTP {cors_resp.status_code}",
        )
        allowed_origin = cors_resp.headers.get("Access-Control-Allow-Origin")
        assert_condition(
            allowed_origin == frontend_url or allowed_origin == "*",
            f"CORS allow origin '{allowed_origin}' matches frontend '{frontend_url}'",
        )

        sim_preflight = client.options(
            f"{api_url}/api/simulate",
            headers={
                "Origin": frontend_url,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )
        assert_condition(
            200 <= sim_preflight.status_code < 300,
            f"CORS preflight /api/simulate returned HTTP {sim_preflight.status_code}",
        )
        sim_origin = sim_preflight.headers.get("Access-Control-Allow-Origin")
        assert_condition(
            sim_origin == frontend_url or sim_origin == "*",
            f"CORS allow origin for /api/simulate '{sim_origin}' matches frontend '{frontend_url}'",
        )
        sim_methods = sim_preflight.headers.get("Access-Control-Allow-Methods", "")
        assert_condition(
            "POST" in sim_methods or "*" in sim_methods,
            f"CORS preflight permits POST method (got: '{sim_methods}')",
        )
        sim_headers = sim_preflight.headers.get("Access-Control-Allow-Headers", "").lower()
        assert_condition(
            ("authorization" in sim_headers and "content-type" in sim_headers) or "*" in sim_headers,
            f"CORS preflight permits requested headers (got: '{sim_headers}')",
        )

    # -------------------------------------------------------------------------
    # Stage 3: Operator Authentication
    # -------------------------------------------------------------------------
    log_step(3, "Authenticating Operator (/api/auth/token)")
    auth_resp = client.post(
        f"{api_url}/api/auth/token",
        json={"username": username, "password": password},
    )
    assert_condition(auth_resp.status_code == 200, f"Authentication succeeded with status {auth_resp.status_code}")
    token_data = auth_resp.json()
    token = token_data.get("access_token")
    assert_condition(bool(token), "Received valid JWT access token")
    auth_headers = {"Authorization": f"Bearer {token}"}

    # -------------------------------------------------------------------------
    # Stage 4: Pulse Simulation & ML Decision Fusion Inference
    # -------------------------------------------------------------------------
    log_step(4, "Executing Diagnostic Pulse Simulation & ML Inference (/api/simulate)")
    start_time = time.monotonic()
    sim_resp = client.post(
        f"{api_url}/api/simulate",
        headers=auth_headers,
        json={"cell_id": "B0005_SMOKE", "profile_type": "nominal", "cycle_index": 50},
    )
    end_time = time.monotonic()
    round_trip_ms = (end_time - start_time) * 1000.0

    assert_condition(sim_resp.status_code == 200, f"Simulation endpoint returned HTTP {sim_resp.status_code}")
    sim_data = sim_resp.json()

    session_id = sim_data.get("session_id")
    prediction = sim_data.get("prediction", {})
    features = sim_data.get("features", {})
    telemetry = sim_data.get("telemetry", {})

    assert_condition(bool(session_id), f"Diagnostic session created: {session_id}")
    assert_condition(len(features) == 14, f"Extracted canonical feature count is {len(features)} (expected 14)")
    triage_class = prediction.get("triage_class")
    assert_condition(triage_class in ["REUSE", "INVESTIGATE", "RETIRE"], f"Triage class is valid: {triage_class}")
    assert_condition(telemetry.get("provenance") == "SYNTHETIC", f"Simulation provenance strictly labeled SYNTHETIC")

    probs = prediction.get("class_probabilities", {})
    prob_sum = sum(probs.values())
    assert_condition(abs(prob_sum - 1.0) < 0.01, f"Class probabilities sum to 1.0 (got {prob_sum:.4f})")
    print(f"  OK: Diagnostic evaluation completed. Round-trip: {round_trip_ms:.1f}ms")

    # -------------------------------------------------------------------------
    # Stage 5: Relational Session Persistence Recall
    # -------------------------------------------------------------------------
    log_step(5, f"Verifying Relational Database Recall (/api/sessions/{session_id})")
    sess_resp = client.get(f"{api_url}/api/sessions/{session_id}", headers=auth_headers)
    assert_condition(sess_resp.status_code == 200, f"Session retrieval returned HTTP {sess_resp.status_code}")
    stored_sess = sess_resp.json()
    assert_condition(stored_sess.get("cell_id") == "B0005_SMOKE", "Stored session cell_id matches")
    assert_condition(stored_sess.get("triage_class") == triage_class, "Stored session triage_class matches")

    # -------------------------------------------------------------------------
    # Stage 6: Cell History Aggregation
    # -------------------------------------------------------------------------
    log_step(6, "Verifying Cell History Aggregation (/api/cells/B0005_SMOKE/history)")
    hist_resp = client.get(f"{api_url}/api/cells/B0005_SMOKE/history", headers=auth_headers)
    assert_condition(hist_resp.status_code == 200, f"History endpoint returned HTTP {hist_resp.status_code}")
    history_list = hist_resp.json()
    assert_condition(any(s.get("session_id") == session_id for s in history_list), "New session found in cell history")

    # -------------------------------------------------------------------------
    # Stage 7: Hardware Ingest Security Boundary
    # -------------------------------------------------------------------------
    log_step(7, "Testing Hardware Boundary Route Protection (/api/telemetry/frame)")
    unauth_resp = client.post(
        f"{api_url}/api/telemetry/frame",
        json={
            "cell_id": "HW-UNAUTH",
            "timestamp": 1.0,
            "voltage": 3.7,
            "current": 2.0,
            "bulk_temperature": 25.0,
            "thermal_frame_8x8": [[25.0] * 8 for _ in range(8)],
            "provenance": "REAL",
        },
    )
    assert_condition(
        unauth_resp.status_code in [401, 403],
        f"Unauthenticated hardware frame request blocked with HTTP {unauth_resp.status_code}",
    )

    print("\n" + "=" * 70)
    print("ALL PRODUCTION SMOKE TESTS PASSED CLEANLY (7/7 Stages Successful)")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    run_smoke_test()
