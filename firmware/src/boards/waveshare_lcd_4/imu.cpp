#include "../../hal/imu_hal.h"
#include "board.h"
#include <Arduino.h>
#include <Wire.h>
#include <SensorQMI8658.hpp>

// Orientation from a QMI8658 breakout on the I2C header (the board itself
// carries no IMU). Same tracker as the AMOLED boards: poll at ~10 Hz, a new
// quadrant has to hold for STABLE_TIME_MS before the panel turns, and a
// face-up or face-down board keeps whatever it had. Without the sensor the
// quadrant stays at 0 unless `rot N` over serial forces one, which is how the
// rotation path is exercised before the breakout is mounted.

#define IMU_POLL_MS       100
#define STABLE_TIME_MS    300
#define TILT_THRESHOLD    0.5f   // sin 30°: the board has to lean this far to count

static SensorQMI8658 imu;
static bool     imu_ok             = false;
static uint8_t  imu_addr           = 0;
static uint8_t  current_rotation   = 0;
static uint8_t  candidate_rotation = 0;
static uint32_t candidate_since    = 0;
static uint32_t last_poll_ms       = 0;
static int      forced_rotation    = -1;   // -1 = the sensor decides
static float    last_ax = 0, last_ay = 0, last_az = 0;

static uint8_t accel_to_rotation(float ax, float ay) {
    if (IMU_SWAP_XY) { float t = ax; ax = ay; ay = t; }
    if (IMU_FLIP_X)  ax = -ax;
    if (IMU_FLIP_Y)  ay = -ay;
    float abs_ax = fabsf(ax);
    float abs_ay = fabsf(ay);
    if (abs_ax < TILT_THRESHOLD && abs_ay < TILT_THRESHOLD) return 255;  // flat: ambiguous
    if (abs_ay > abs_ax) return (ay > 0) ? 3 : 1;
    return (ax > 0) ? 0 : 2;
}

static bool imu_begin_at(uint8_t addr) {
    if (!imu.begin(Wire, addr, IIC_SDA, IIC_SCL)) return false;
    imu_addr = addr;
    return true;
}

void imu_hal_init(void) {
    if (!imu_begin_at(QMI8658_ADDR_L) && !imu_begin_at(QMI8658_ADDR_H)) {
        Serial.println("IMU: no QMI8658 on the I2C header, orientation fixed (rot N to force)");
        return;
    }
    imu.configAccelerometer(
        SensorQMI8658::ACC_RANGE_4G,
        SensorQMI8658::ACC_ODR_LOWPOWER_21Hz,
        SensorQMI8658::LPF_MODE_3);
    imu.enableAccelerometer();
    imu_ok = true;
    Serial.printf("IMU: QMI8658 at 0x%02X, auto-rotate on\n", imu_addr);
}

void imu_hal_tick(void) {
    if (!imu_ok) return;
    uint32_t now = millis();
    if (now - last_poll_ms < IMU_POLL_MS) return;
    last_poll_ms = now;

    float ax, ay, az;
    if (!imu.getAccelerometer(ax, ay, az)) return;
    last_ax = ax; last_ay = ay; last_az = az;

    uint8_t target = accel_to_rotation(ax, ay);
    if (target == 255 || target == current_rotation) {
        candidate_rotation = current_rotation;
        return;
    }
    if (target != candidate_rotation) {
        candidate_rotation = target;
        candidate_since = now;
    } else if (now - candidate_since >= STABLE_TIME_MS) {
        current_rotation = target;
        Serial.printf("IMU: rotation %d\n", current_rotation);
    }
}

uint8_t imu_hal_rotation_quadrant(void) {
    return forced_rotation >= 0 ? (uint8_t)forced_rotation : current_rotation;
}

// ---- serial pokes (serial_cmd.cpp) ----

// q = 0..3 forces a quadrant, anything else hands control back to the sensor.
void imu_lcd4_force_rotation(int q) {
    forced_rotation = (q >= 0 && q <= 3) ? q : -1;
    Serial.printf("IMU: rotation %s\n", forced_rotation >= 0 ? "forced" : "from the sensor");
}

void imu_lcd4_dump(void) {
    if (!imu_ok) {
        Serial.printf("IMU: absent; quadrant %d (%s)\n", imu_hal_rotation_quadrant(),
                      forced_rotation >= 0 ? "forced" : "default");
        return;
    }
    Serial.printf("IMU: 0x%02X ax=%.2f ay=%.2f az=%.2f -> quadrant %d%s\n", imu_addr,
                  last_ax, last_ay, last_az, imu_hal_rotation_quadrant(),
                  forced_rotation >= 0 ? " (forced)" : "");
}
