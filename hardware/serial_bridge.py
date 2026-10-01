"""Host-side serial bridge streaming ESP32 TelemetryFrames into ThermoCell-AI."""
from __future__ import annotations

import argparse
import json
import sys
import time
from typing import Optional, Generator, Dict, Any

from app.models.schemas_battery import TelemetryFrame
from app.models.schemas_provenance import ProvenanceEnum
from app.services.telemetry_source import HardwareBufferSource


def generate_mock_hardware_stream(
    cell_id: str = "HW-001",
    cycle_index: Optional[int] = 0,
    v_pre_pulse: float = 4.14,
    pulse_current: float = 3.0,
    dcir: float = 0.095,
) -> Generator[Dict[str, Any], None, None]:
    """Generate realistic mock serial stream lines mirroring the ESP32 firmware output."""
    # 1. Baseline Event
    yield {
        "event": "PRE_PULSE_BASELINE",
        "cell_id": cell_id,
        "cycle_index": cycle_index,
        "v_pre_pulse": v_pre_pulse,
        "provenance": "REAL",
    }

    # 2. 100 Active Pulse Frames (t = 0.0 to 9.9s @ 10Hz)
    for i in range(100):
        t = round(i * 0.1, 1)
        v = round(v_pre_pulse - (pulse_current * dcir) - (0.05 * (1.0 - 2.718 ** (-t / 1.5))), 4)
        temp = round(24.0 + (0.25 * (t / 10.0)), 2)
        grid = [[round(temp + (0.15 if r == 0 and 3 <= c <= 4 else 0.0), 2) for c in range(8)] for r in range(8)]
        yield {
            "cell_id": cell_id,
            "cycle_index": cycle_index,
            "timestamp": t,
            "voltage": v,
            "current": pulse_current,
            "bulk_temperature": temp,
            "thermal_frame_8x8": grid,
            "provenance": "REAL",
        }

    # 3. 20 Relaxation Frames (t = 10.0 to 11.9s @ 10Hz)
    for i in range(20):
        t = round(10.0 + (i * 0.1), 1)
        v = round(v_pre_pulse - (0.03 * (2.718 ** (-(t - 10.0) / 1.5))), 4)
        temp = round(24.25 - (0.05 * ((t - 10.0) / 2.0)), 2)
        grid = [[round(temp, 2) for _ in range(8)] for _ in range(8)]
        yield {
            "cell_id": cell_id,
            "cycle_index": cycle_index,
            "timestamp": t,
            "voltage": v,
            "current": 0.0,
            "bulk_temperature": temp,
            "thermal_frame_8x8": grid,
            "provenance": "REAL",
        }

    # 4. Completion Event
    yield {
        "event": "PULSE_SEQUENCE_COMPLETE",
        "cell_id": cell_id,
        "cycle_index": cycle_index,
        "provenance": "REAL",
    }


def ingest_stream_into_buffer(
    stream: Generator[Dict[str, Any], None, None],
    buffer: HardwareBufferSource,
) -> None:
    """Process a stream of firmware events and feed them into the hardware buffer."""
    for packet in stream:
        event = packet.get("event")
        if event == "PRE_PULSE_BASELINE":
            buffer.set_pre_pulse_baseline(packet["v_pre_pulse"])
        elif event == "PULSE_SEQUENCE_COMPLETE":
            break
        elif "thermal_frame_8x8" in packet:
            # Validate frame schema
            frame = TelemetryFrame(**packet)
            if frame.timestamp < 10.0:
                buffer.ingest_active_frame(frame)
            else:
                buffer.ingest_relaxation_frame(frame)


def main():
    parser = argparse.ArgumentParser(description="ThermoCell-AI Serial Hardware Bridge")
    parser.add_argument("--port", default="/dev/ttyUSB0", help="Serial port")
    parser.add_argument("--baud", type=int, default=115200, help="Baud rate")
    parser.add_argument("--mock", action="store_true", help="Run with mock simulated hardware")
    parser.add_argument("--cell-id", default="HW-001", help="Target cell identifier")
    args = parser.parse_args()

    buffer = HardwareBufferSource()

    if args.mock:
        print(f"[BRIDGE] Streaming mock hardware frames for {args.cell_id}...")
        stream = generate_mock_hardware_stream(cell_id=args.cell_id)
        ingest_stream_into_buffer(stream, buffer)
        telemetry = buffer.get_pulse_telemetry(cell_id=args.cell_id)
        print(f"[BRIDGE] Aggregated {len(telemetry.timestamps)} active samples, {len(telemetry.relaxation.timestamps)} relaxation samples.")
        print(f"[BRIDGE] Success: Provenance={telemetry.provenance}, OCV={telemetry.v_pre_pulse}V")
    else:
        print(f"[BRIDGE] Connecting to physical ESP32 on {args.port} at {args.baud} baud...")
        # Note: pyserial can be imported conditionally if hardware is physically plugged in
        try:
            import serial
            ser = serial.Serial(args.port, args.baud, timeout=1.0)
            print("[BRIDGE] Connected. Listening for firmware telemetry...")
            while True:
                line = ser.readline().decode("utf-8", errors="ignore").strip()
                if line.startswith("{") and line.endswith("}"):
                    data = json.loads(line)
                    # Process frame...
        except ImportError:
            print("[BRIDGE] Error: pyserial not installed. Run 'pip install pyserial' or use '--mock'.")
            sys.exit(1)


if __name__ == "__main__":
    main()
