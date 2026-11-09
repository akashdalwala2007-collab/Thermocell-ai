/*
 * ThermoCell-AI ESP32 Acquisition Firmware
 * Fixed Hardware Target: ESP32 NodeMCU + Adafruit INA219 + Adafruit AMG8833
 * 
 * Functions:
 * 1. Reads I2C INA219 (0x40) for cell voltage (V) and discharge current (A) at 10Hz.
 * 2. Reads I2C AMG8833 (0x69) for 8x8 infrared thermal frame (64 pixels, °C) at 10Hz.
 * 3. Controls logic-level power MOSFET (GPIO 25) for 10-second controlled pulse discharge (~3A).
 * 4. Emits structured TelemetryFrame JSON packets over USB Serial at 115200 baud.
 * 
 * Provenance: All output telemetry carries strictly provenance: "REAL".
 */

#include <Wire.h>
#include <Adafruit_INA219.h>
#include <Adafruit_AMG88xx.h>
#include <ArduinoJson.h>

// Pinout Definitions
#define I2C_SDA_PIN 21
#define I2C_SCL_PIN 22
#define MOSFET_GATE_PIN 25
#define LED_INDICATOR_PIN 2

// Sensor Addresses & Constants
#define INA219_I2C_ADDR 0x40
#define AMG8833_I2C_ADDR 0x69
#define SAMPLING_INTERVAL_MS 100 // 10Hz sampling (100ms)

// Hardware Sensor Objects
Adafruit_INA219 ina219(INA219_I2C_ADDR);
Adafruit_AMG88xx amg8833;

// Acquisition State Machine
enum PulseState {
  STATE_IDLE,
  STATE_MEASURE_BASELINE,
  STATE_ACTIVE_PULSE,
  STATE_RELAXATION,
  STATE_COMPLETE
};

PulseState currentState = STATE_IDLE;
String targetCellId = "HW-001";
int targetCycleIndex = 0;
unsigned long pulseStartTime = 0;
unsigned long nextSampleTime = 0;
int tickCount = 0;
float prePulseVoltage = 0.0;
float pixels[AMG88xx_PIXEL_ARRAY_SIZE]; // 64 pixels

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000); // Wait for serial console

  pinMode(MOSFET_GATE_PIN, OUTPUT);
  pinMode(LED_INDICATOR_PIN, OUTPUT);
  digitalWrite(MOSFET_GATE_PIN, LOW); // Ensure load is OFF
  digitalWrite(LED_INDICATOR_PIN, LOW);

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN, 400000); // 400kHz Fast I2C

  // Initialize INA219
  if (!ina219.begin(&Wire)) {
    Serial.println("{\"error\": \"INA219 initialization failed at 0x40\"}");
  } else {
    ina219.setCalibration_32V_2A(); // Configured for precision current up to 3.2A
  }

  // Initialize AMG8833
  if (!amg8833.begin(AMG8833_I2C_ADDR, &Wire)) {
    Serial.println("{\"error\": \"AMG8833 initialization failed at 0x69\"}");
  }

  Serial.println("{\"status\": \"READY\", \"firmware\": \"ThermoCell-AI-ESP32-v1.0\", \"provenance\": \"REAL\"}");
}

void loop() {
  handleSerialCommands();

  unsigned long currentMillis = millis();

  switch (currentState) {
    case STATE_IDLE:
      digitalWrite(MOSFET_GATE_PIN, LOW);
      digitalWrite(LED_INDICATOR_PIN, LOW);
      break;

    case STATE_MEASURE_BASELINE: {
      digitalWrite(MOSFET_GATE_PIN, LOW); // Zero load current
      delay(50); // Settle
      prePulseVoltage = ina219.getBusVoltage_V();
      
      StaticJsonDocument<256> doc;
      doc["event"] = "PRE_PULSE_BASELINE";
      doc["cell_id"] = targetCellId;
      doc["cycle_index"] = targetCycleIndex;
      doc["v_pre_pulse"] = round(prePulseVoltage * 1000.0) / 1000.0;
      doc["provenance"] = "REAL";
      serializeJson(doc, Serial);
      Serial.println();

      // Begin active pulse
      currentState = STATE_ACTIVE_PULSE;
      tickCount = 0;
      pulseStartTime = millis();
      nextSampleTime = pulseStartTime;
      digitalWrite(MOSFET_GATE_PIN, HIGH); // Engage load
      digitalWrite(LED_INDICATOR_PIN, HIGH);
      break;
    }

    case STATE_ACTIVE_PULSE: {
      if (currentMillis >= nextSampleTime) {
        float timestamp = (float)tickCount * 0.1f;
        sampleAndEmitFrame(timestamp, true);
        tickCount++;
        nextSampleTime += SAMPLING_INTERVAL_MS;

        if (tickCount >= 100) { // 10.0s elapsed (100 ticks)
          digitalWrite(MOSFET_GATE_PIN, LOW); // Cut load immediately
          digitalWrite(LED_INDICATOR_PIN, LOW);
          currentState = STATE_RELAXATION;
          tickCount = 0;
          pulseStartTime = millis();
          nextSampleTime = pulseStartTime;
        }
      }
      break;
    }

    case STATE_RELAXATION: {
      if (currentMillis >= nextSampleTime) {
        float timestamp = 10.0f + ((float)tickCount * 0.1f);
        sampleAndEmitFrame(timestamp, false);
        tickCount++;
        nextSampleTime += SAMPLING_INTERVAL_MS;

        if (tickCount >= 20) { // 2.0s elapsed (20 ticks)
          currentState = STATE_COMPLETE;
        }
      }
      break;
    }

    case STATE_COMPLETE: {
      digitalWrite(MOSFET_GATE_PIN, LOW);
      digitalWrite(LED_INDICATOR_PIN, LOW);
      StaticJsonDocument<256> doc;
      doc["event"] = "PULSE_SEQUENCE_COMPLETE";
      doc["cell_id"] = targetCellId;
      doc["cycle_index"] = targetCycleIndex;
      doc["provenance"] = "REAL";
      serializeJson(doc, Serial);
      Serial.println();
      currentState = STATE_IDLE;
      break;
    }
  }
}

void sampleAndEmitFrame(float timestamp, bool isActive) {
  float busVoltage = ina219.getBusVoltage_V();
  float current_mA = ina219.getCurrent_mA();
  float current_A = current_mA / 1000.0f;

  amg8833.readPixels(pixels);

  // Compute bulk temperature as mean of all 64 pixels
  float tempSum = 0.0f;
  for (int i = 0; i < 64; i++) {
    tempSum += pixels[i];
  }
  float bulkTemp = tempSum / 64.0f;

  // Build TelemetryFrame JSON (allocation: ~2048 bytes for 8x8 nested array)
  DynamicJsonDocument doc(2500);
  doc["cell_id"] = targetCellId;
  doc["cycle_index"] = targetCycleIndex;
  doc["timestamp"] = round(timestamp * 10.0) / 10.0;
  doc["voltage"] = round(busVoltage * 10000.0) / 10000.0;
  doc["current"] = round(current_A * 1000.0) / 1000.0;
  doc["bulk_temperature"] = round(bulkTemp * 100.0) / 100.0;
  doc["provenance"] = "REAL";

  JsonArray thermalGrid = doc.createNestedArray("thermal_frame_8x8");
  for (int row = 0; row < 8; row++) {
    JsonArray rowArr = thermalGrid.createNestedArray();
    for (int col = 0; col < 8; col++) {
      int idx = (row * 8) + col;
      rowArr.add(round(pixels[idx] * 100.0) / 100.0);
    }
  }

  serializeJson(doc, Serial);
  Serial.println();
}

void handleSerialCommands() {
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();

    if (cmd.startsWith("PULSE")) {
      // Command format: PULSE <cell_id> [cycle_index]
      int firstSpace = cmd.indexOf(' ');
      if (firstSpace > 0) {
        String args = cmd.substring(firstSpace + 1);
        int secondSpace = args.indexOf(' ');
        if (secondSpace > 0) {
          targetCellId = args.substring(0, secondSpace);
          targetCycleIndex = args.substring(secondSpace + 1).toInt();
        } else {
          targetCellId = args;
          targetCycleIndex = 0;
        }
      } else {
        targetCellId = "HW-001";
        targetCycleIndex = 0;
      }
      currentState = STATE_MEASURE_BASELINE;
    } else if (cmd == "ABORT" || cmd == "RESET") {
      digitalWrite(MOSFET_GATE_PIN, LOW);
      digitalWrite(LED_INDICATOR_PIN, LOW);
      currentState = STATE_IDLE;
      Serial.println("{\"status\": \"ABORTED\"}");
    } else if (cmd == "PING") {
      Serial.println("{\"status\": \"PONG\", \"state\": \"IDLE\"}");
    }
  }
}
