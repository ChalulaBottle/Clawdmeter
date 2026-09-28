#include "io_expander.h"
#include "board.h"
#include <Arduino.h>
#include <Wire.h>

// Two revisions of this kit ship different expanders on the same bus. Probe
// 0x24 (CH32V003, V4) first, then 0x20 (TCA9554, V1..V3), and run that part's
// documented power-on sequence. Both sequences come from Waveshare's own
// examples; the CH32 one is their initDisplayPower() step for step.

// TCA9554 registers
#define TCA_REG_INPUT     0x00
#define TCA_REG_OUTPUT    0x01
#define TCA_REG_CONFIG    0x03   // 1 = input, 0 = output
// Outputs: TP_RST(0) BL(1) LCD_RST(2) SD(3) BUZZER(5). Config bit = 1 means
// input, so the mask is the inverse of bits 0,1,2,3,5: ~0x2F = 0xD0.
#define TCA_CONFIG_MASK   0xD0

// CH32V003 registers (WS_CH32_IO.h)
#define CH32_REG_DIR      0x02
#define CH32_REG_OUTPUT   0x03
#define CH32_REG_INPUT    0x04
#define CH32_REG_PWM      0x05
#define CH32_REG_ADC      0x06
#define CH32_DIR_DEFAULT  0xFF
#define CH32_ADC_REF_MV   3300
#define CH32_ADC_MAX      1023
#define CH32_BAT_DIVIDER  3

static IoxVariant variant     = IOX_NONE;
static uint8_t    out_state   = 0x00;
static int        cached_bl   = -1;

static bool write_reg(uint8_t addr, uint8_t reg, uint8_t val) {
    for (int attempt = 0; attempt < 3; attempt++) {
        Wire.beginTransmission(addr);
        Wire.write(reg);
        Wire.write(val);
        if (Wire.endTransmission() == 0) return true;
        delay(10 + attempt * 10);
    }
    return false;
}

static bool read_regs(uint8_t addr, uint8_t reg, uint8_t* buf, uint8_t len) {
    Wire.beginTransmission(addr);
    Wire.write(reg);
    if (Wire.endTransmission(false) != 0) return false;
    if (Wire.requestFrom(addr, len) != len) return false;
    for (uint8_t i = 0; i < len; i++) buf[i] = Wire.read();
    return true;
}

static bool probe(uint8_t addr) {
    Wire.beginTransmission(addr);
    return Wire.endTransmission() == 0;
}

static uint8_t out_addr(void) {
    return variant == IOX_CH32 ? IOX_CH32_ADDR : IOX_TCA9554_ADDR;
}
static uint8_t out_reg(void) {
    return variant == IOX_CH32 ? CH32_REG_OUTPUT : TCA_REG_OUTPUT;
}

static void set_bit(uint8_t bit, bool high) {
    if (variant == IOX_NONE || bit > 7) return;
    uint8_t next = high ? (out_state | (1u << bit)) : (out_state & ~(1u << bit));
    if (next == out_state) return;
    out_state = next;
    write_reg(out_addr(), out_reg(), out_state);
}

bool io_expander_init(void) {
    if (probe(IOX_CH32_ADDR)) {
        variant = IOX_CH32;
        // Everything low for 200 ms, then SYS_EN + both resets high. SYS_EN is
        // the battery power latch: clearing it later drops the board when it
        // is not on USB, so it is set once here and never touched again.
        write_reg(IOX_CH32_ADDR, CH32_REG_DIR, CH32_DIR_DEFAULT);
        out_state = 0x00;
        write_reg(IOX_CH32_ADDR, CH32_REG_OUTPUT, out_state);
        delay(200);
        write_reg(IOX_CH32_ADDR, CH32_REG_DIR, CH32_DIR_DEFAULT);
        out_state = (1u << CH32_BIT_SYS_EN) | (1u << CH32_BIT_LCD_RST) | (1u << CH32_BIT_TP_RST);
        write_reg(IOX_CH32_ADDR, CH32_REG_OUTPUT, out_state);
        delay(200);   // Waveshare waits this long before touching the panel
        Serial.println("IO expander: CH32V003 @0x24 (board rev V4)");
        // Read back what the CH32 thinks it holds, so a write that ACKs but
        // does not land shows up in the log instead of as a dark panel.
        io_expander_dump_regs();
        return true;
    }
    if (probe(IOX_TCA9554_ADDR)) {
        variant = IOX_TCA9554;
        if (!write_reg(IOX_TCA9554_ADDR, TCA_REG_CONFIG, TCA_CONFIG_MASK)) {
            Serial.println("TCA9554 init failed (config)");
            return false;
        }
        // Both resets and the backlight low, hold, then release with the
        // backlight on. SD (P3) stays LOW as Waveshare's example leaves it.
        out_state = 0x00;
        write_reg(IOX_TCA9554_ADDR, TCA_REG_OUTPUT, out_state);
        delay(100);
        out_state = (1u << TCA_PIN_TP_RST) | (1u << TCA_PIN_LCD_RST) | (1u << TCA_PIN_BL);
        write_reg(IOX_TCA9554_ADDR, TCA_REG_OUTPUT, out_state);
        cached_bl = 255;
        delay(120);
        Serial.println("IO expander: TCA9554 @0x20 (board rev V1..V3)");
        return true;
    }
    Serial.println("IO expander: nothing at 0x24 or 0x20 — panel stays in reset");
    return false;
}

IoxVariant io_expander_variant(void) { return variant; }

void io_expander_set_backlight(uint8_t level) {
    if (variant == IOX_NONE) return;
    if (variant == IOX_CH32) {
        if (cached_bl == level) return;
        cached_bl = level;
        write_reg(IOX_CH32_ADDR, CH32_REG_PWM, level);
        return;
    }
    int on = level > 0 ? 255 : 0;
    if (cached_bl == on) return;
    cached_bl = on;
    set_bit(TCA_PIN_BL, on != 0);
}

void io_expander_set_buzzer(bool on) {
    set_bit(variant == IOX_CH32 ? CH32_BIT_BUZZER : TCA_PIN_BUZZER, on);
}

void io_expander_touch_reset(bool assert_reset) {
    set_bit(variant == IOX_CH32 ? CH32_BIT_TP_RST : TCA_PIN_TP_RST, !assert_reset);
}

// Datasheet GT911 reset on the CH32 board, where both RST and INT are
// expander pins: hold RST low with INT at the address-select level, release
// RST, keep INT there >5 ms, then hand INT back to the controller by making
// that one expander bit an input (DIR bit clear). INT low -> 0x5D, high -> 0x14.
void io_expander_gt911_reset(bool int_high) {
    if (variant != IOX_CH32) {
        io_expander_touch_reset(true);
        delay(20);
        io_expander_touch_reset(false);
        delay(100);
        return;
    }
    write_reg(IOX_CH32_ADDR, CH32_REG_DIR, CH32_DIR_DEFAULT);       // all outputs
    out_state &= ~(1u << CH32_BIT_TP_RST);
    if (int_high) out_state |=  (1u << CH32_BIT_TP_INT);
    else          out_state &= ~(1u << CH32_BIT_TP_INT);
    write_reg(IOX_CH32_ADDR, CH32_REG_OUTPUT, out_state);
    delay(20);
    out_state |= (1u << CH32_BIT_TP_RST);
    write_reg(IOX_CH32_ADDR, CH32_REG_OUTPUT, out_state);
    delay(60);
    write_reg(IOX_CH32_ADDR, CH32_REG_DIR, (uint8_t)(CH32_DIR_DEFAULT & ~(1u << CH32_BIT_TP_INT)));
    delay(100);
    Serial.printf("GT911 reset done (INT %s during reset, now input); ", int_high ? "high" : "low");
    io_expander_dump_regs();
}

bool io_expander_reg_write(uint8_t reg, uint8_t val) {
    if (variant == IOX_NONE) return false;
    // Keep the shadow honest when the poke interface writes the output register.
    if (reg == out_reg()) out_state = val;
    return write_reg(out_addr(), reg, val);
}

int io_expander_reg_read(uint8_t reg) {
    if (variant == IOX_NONE) return -1;
    uint8_t v = 0;
    if (!read_regs(out_addr(), reg, &v, 1)) return -1;
    return v;
}

void io_expander_dump_regs(void) {
    if (variant == IOX_CH32) {
        int r[6];
        for (uint8_t i = 0; i < 6; i++) r[i] = io_expander_reg_read((uint8_t)(0x02 + i));
        Serial.printf("CH32 regs: DIR=0x%02X OUT=0x%02X IN=0x%02X PWM=0x%02X ADC=0x%02X RTC=0x%02X\n",
                      r[0], r[1], r[2], r[3], r[4], r[5]);
    } else if (variant == IOX_TCA9554) {
        Serial.printf("TCA9554 regs: IN=0x%02X OUT=0x%02X POL=0x%02X CFG=0x%02X\n",
                      io_expander_reg_read(0x00), io_expander_reg_read(0x01),
                      io_expander_reg_read(0x02), io_expander_reg_read(0x03));
    }
}

void io_expander_i2c_scan_log(void) {
    Serial.print("I2C scan:");
    for (uint8_t a = 0x08; a < 0x78; a++) {
        Wire.beginTransmission(a);
        if (Wire.endTransmission() == 0) Serial.printf(" 0x%02X", a);
    }
    Serial.println();
}

int io_expander_battery_mv(void) {
    if (variant != IOX_CH32) return -1;
    uint8_t b[2] = {0, 0};
    if (!read_regs(IOX_CH32_ADDR, CH32_REG_ADC, b, 2)) return -1;
    uint16_t raw = ((uint16_t)b[1] << 8) | b[0];
    if (raw > CH32_ADC_MAX) raw = CH32_ADC_MAX;
    return (int)((uint32_t)raw * CH32_ADC_REF_MV * CH32_BAT_DIVIDER / CH32_ADC_MAX);
}
