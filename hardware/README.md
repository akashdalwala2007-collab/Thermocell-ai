# ThermoCell-AI Hardware Architecture & Integration Guide

This guide documents the physical hardware testbench, sensor wiring schematic, microcontroller firmware, and Bill of Materials (BOM) for the **ThermoCell-AI** rapid second-life battery diagnostic system.

---

## 1. System Overview

ThermoCell-AI employs a low-cost, off-the-shelf hardware bench designed to evaluate single-cell Li-ion batteries (18650 form factor) using a controlled 10-second pulse discharge (~3A) while acquiring synchronized high-frequency electrical telemetry (10Hz) and spatial infrared thermal imaging (8×8 AMG8833 array).

```
                      +-----------------------------+
                      |       18650 Li-ion Cell     |
                      |     (Nominal 3.6V - 4.2V)   |
                      +--------------+--------------+
                                     |
               +---------------------+---------------------+
               | (High-Side Bus)                           |
               v                                           v
       +---------------+                           +---------------+
       |  INA219 VIN+  |                           |  AMG8833 8x8  |
       |  Voltage &    |                           |  Thermal IR   |
       |  Current      |                           |  Sensor (10Hz)|
       |  Sensor       |                           +-------+-------+
       +-------+-------+                                   |
               |                                           |
               v                                           |
       +---------------+                                   |
       | Power MOSFET  |<--- [Gate: ESP32 GPIO 25]         |
       | (IRLZ44N)     |                                   |
       +-------+-------+                                   |
               |                                           |
               v                                           |
       +---------------+                                   |
       | 1.2Ω 10W      |                                   |
       | Dummy Resistor|                                   |
       +-------+-------+                                   |
               |                                           |
               v (GND)                                     v
       +-----------------------------------------------------------+
       |                  ESP32 NodeMCU Controller                 |
       |              (10Hz Sampling, I2C Fast Mode)               |
       +-----------------------------+-----------------------------+
                                     | (USB Serial / HTTP 115200)
                                     v
       +-----------------------------------------------------------+
       |          ThermoCell-AI Diagnostic Processing Engine       |
       +-----------------------------------------------------------+
```

---

## 2. Bill of Materials (BOM)

Total target prospective hardware budget: **strictly under $35–$40**.

| Item | Component Description | Source / Reference | Unit Price (USD) |
|---|---|---|---|
| 1 | **ESP32 NodeMCU-32S** (Dual-Core, WiFi, BLE, USB-UART CP2102) | Generic / Amazon / AliExpress | $4.50 |
| 2 | **AMG8833 8×8 Infrared Thermal Camera Sensor Module** ($60^\circ$ FOV, I2C 0x69) | CJMCU-8833 / Clone | $14.50 |
| 3 | **INA219 High-Side DC I2C Voltage/Current Sensor** (0–26V, up to 3.2A, 0x40) | CJMCU-219 / Adafruit clone | $2.50 |
| 4 | **IRLZ44N Logic-Level N-Channel Power MOSFET** (TO-220, $V_{\text{GS(th)}} \approx 1-2\text{V}$, $R_{\text{DS(on)}} \approx 22\text{m}\Omega$) | International Rectifier / Vishay | $1.20 |
| 5 | **1.2Ω to 1.5Ω 10W Aluminum Ceramic Wirewound Power Resistor** (Dummy Load) | Generic Electronics | $2.00 |
| 6 | **18650 Battery Holder / High-Contact-Pressure Clip** | Keystone / Generic | $1.50 |
| 7 | **Passive Components & Breadboard** (100Ω gate resistor, 10kΩ pull-down resistor, breadboard, jumpers) | Generic | $2.50 |
| **TOTAL** | **Complete Hardware Bill of Materials** | | **$28.70** |

---

## 3. Circuit Schematic & Pin Mapping

### A. I2C Bus Wiring (3.3V Logic)

Both the INA219 and AMG8833 share the ESP32 hardware I2C bus:

| ESP32 Pin | Sensor Pin | Connection Details |
|---|---|---|
| **3V3** | INA219 VCC, AMG8833 VIN | 3.3V Power Rail |
| **GND** | INA219 GND, AMG8833 GND | Common Ground |
| **GPIO 21** | INA219 SDA, AMG8833 SDA | I2C Data Line (400kHz) |
| **GPIO 22** | INA219 SCL, AMG8833 SCL | I2C Clock Line (400kHz) |

### B. Controlled Pulse Discharge Circuit

The discharge pulse is switched through an N-channel logic-level MOSFET:

- **ESP32 GPIO 25** $\longrightarrow$ **100Ω Resistor** $\longrightarrow$ **MOSFET Gate**
- **MOSFET Gate** $\longrightarrow$ **10kΩ Pull-Down Resistor** $\longrightarrow$ **GND** (prevents floating state on boot)
- **Cell Positive Terminal (+)** $\longrightarrow$ **INA219 VIN+**
- **INA219 VIN-** $\longrightarrow$ **MOSFET Drain**
- **MOSFET Source** $\longrightarrow$ **1.2Ω 10W Dummy Resistor** $\longrightarrow$ **Cell Negative Terminal (-)** and **Common Ground**

*Load Current Calculation:*
$$I_{\text{pulse}} = \frac{V_{\text{cell}} - V_{\text{DS}}}{R_{\text{load}} + R_{\text{shunt}}} \approx \frac{4.1\text{V} - 0.07\text{V}}{1.2\Omega + 0.1\Omega} \approx 3.1\text{A}$$

### C. Thermal Sensor Placement

- Mount the AMG8833 module **30mm to 50mm directly above** the 18650 cell body.
- Align row 0, columns 3–4 with the cell's positive terminal tab to enable spatial gradient ($\nabla T_{\text{tab-body}}$) and hotspot detection.

---

## 4. Firmware Protocol

The firmware (`hardware/firmware/esp32_thermocell.ino`) operates a 10Hz timed loop controlled over USB Serial (115200 baud):

1. **Host initiates pulse**: Send `"PULSE <cell_id> [cycle_index]\n"` (e.g. `PULSE CELL-001 0`).
2. **Pre-Pulse Baseline**: Firmware settles for 50ms at $I=0\text{A}$, reads $V_{\text{pre-pulse}}$, and emits `{"event": "PRE_PULSE_BASELINE", "v_pre_pulse": 4.143, ...}`.
3. **Active Pulse (10.0s)**: Firmware raises GPIO 25, samples sensors every 100ms, and emits 100 `TelemetryFrame` JSON lines with `provenance: "REAL"`.
4. **Relaxation (2.0s)**: Firmware lowers GPIO 25, samples open-circuit recovery for 20 frames.
5. **Completion**: Firmware returns to `IDLE` and emits `{"event": "PULSE_SEQUENCE_COMPLETE"}`.

