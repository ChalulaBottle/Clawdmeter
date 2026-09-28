#include "../../hal/display_hal.h"
#include "../../hal/imu_hal.h"
#include "../../brightness.h"
#include "board.h"
#include "io_expander.h"
#include <Arduino.h>
#include <Arduino_GFX_Library.h>
#include <lvgl.h>

// First RGB-parallel port in this tree. Arduino_RGB_Display owns a full
// 480x480 RGB565 framebuffer in PSRAM and the LCD peripheral scans it out
// continuously; draw16bitRGBBitmap() is a memcpy into that buffer, so LVGL's
// partial strips land with no bus transaction of their own. Brightness is
// not a panel command here: it goes through the IO expander (PWM on V4,
// on/off on V1..V3).

static Arduino_DataBus*       bus   = nullptr;
static Arduino_ESP32RGBPanel* panel = nullptr;
static Arduino_RGB_Display*   gfx   = nullptr;

void display_hal_init(void) {
    // ST7701 takes its init sequence over 3-wire SPI (9-bit, no DC line).
    bus = new Arduino_SWSPI(
        GFX_NOT_DEFINED /* DC */, LCD_SPI_CS, LCD_SPI_SCK, LCD_SPI_MOSI, GFX_NOT_DEFINED /* MISO */);
    panel = new Arduino_ESP32RGBPanel(
        LCD_DE, LCD_VSYNC, LCD_HSYNC, LCD_PCLK,
        LCD_R0, LCD_R1, LCD_R2, LCD_R3, LCD_R4,
        LCD_G0, LCD_G1, LCD_G2, LCD_G3, LCD_G4, LCD_G5,
        LCD_B0, LCD_B1, LCD_B2, LCD_B3, LCD_B4,
        LCD_HSYNC_POLARITY, LCD_HSYNC_FRONT, LCD_HSYNC_PULSE, LCD_HSYNC_BACK,
        LCD_VSYNC_POLARITY, LCD_VSYNC_FRONT, LCD_VSYNC_PULSE, LCD_VSYNC_BACK,
        0 /* pclk_active_neg */, GFX_NOT_DEFINED /* prefer_speed */, false /* big endian */,
        0 /* de_idle_high */, 0 /* pclk_idle_high */,
        LCD_BOUNCE_LINES * LCD_WIDTH /* bounce buffer, see board.h */);
    gfx = new Arduino_RGB_Display(
        LCD_WIDTH, LCD_HEIGHT, panel, LCD_ROTATION, true /* auto_flush */,
        bus, GFX_NOT_DEFINED /* RST: via expander in board_init */,
        st7701_type1_init_operations, sizeof(st7701_type1_init_operations));
}

void display_hal_begin(void) {
    if (!gfx->begin()) {
        Serial.println("gfx->begin() failed (ST7701 RGB panel)");
    } else {
        Serial.println("ST7701 RGB panel up, 480x480, framebuffer in PSRAM");
    }
    gfx->fillScreen(0x0000);
    io_expander_set_backlight(200);
}

void display_hal_set_brightness(uint8_t level) {
    io_expander_set_backlight(level);
}

void display_hal_fill_screen(uint16_t color) {
    if (gfx) gfx->fillScreen(color);
}

void display_hal_draw_bitmap(int32_t x, int32_t y, int32_t w, int32_t h,
                             const uint16_t* pixels) {
    if (gfx) gfx->draw16bitRGBBitmap(x, y, (uint16_t*)pixels, w, h);
}

// Auto-rotate. Arduino_RGB_Display rotates on its own: setRotation() changes
// how draw16bitRGBBitmap lands each LVGL strip in the framebuffer, so the
// panel's native mounting (LCD_ROTATION) and the IMU quadrant simply add. On
// a change: backlight off, new rotation, full LVGL redraw, then the backlight
// ramps back to the user's level over ~125 ms so the turn reads as deliberate.
// The redraw is 24 strips through the library's rotated copy; the time is
// logged once per turn so the PSRAM cost stays measured, not assumed.
void display_hal_tick(void) {
    static uint8_t  last_rotation = 0;
    static uint8_t  ramp_step = 0;     // 0 = idle, 1..4 = ramping
    static uint32_t ramp_last = 0;
    static uint32_t turned_at = 0;

    uint8_t rot = imu_hal_rotation_quadrant();
    if (rot != last_rotation) {
        display_hal_set_brightness(0);
        last_rotation = rot;
        turned_at = millis();
        if (gfx) gfx->setRotation((LCD_ROTATION + rot) & 3);
        lv_obj_invalidate(lv_screen_active());
        lv_refr_now(NULL);   // draw the whole screen at the new orientation before the light comes back
        Serial.printf("rotate: quadrant %d, redraw %lu ms\n", rot, (unsigned long)(millis() - turned_at));
        ramp_step = 1;
        return;
    }

    if (ramp_step == 0) return;
    uint32_t now = millis();
    if (now - ramp_last < 25) return;
    ramp_last = now;

    static const uint8_t pct[] = {30, 60, 85, 100};
    uint8_t target = brightness_get();
    display_hal_set_brightness((uint8_t)(((uint16_t)target * pct[ramp_step - 1]) / 100));
    if (ramp_step >= 4) ramp_step = 0;
    else                ramp_step++;
}

// The panel's own framebuffer (what it is scanning out right now), for the
// `fbshot` serial capture: unlike the LVGL snapshot this shows the rotation.
const uint16_t* display_lcd4_framebuffer(void) {
    return gfx ? gfx->getFramebuffer() : nullptr;
}

// No alignment constraint on a framebuffer panel.
void display_hal_round_area(int32_t* x1, int32_t* y1, int32_t* x2, int32_t* y2) {
    (void)x1; (void)y1; (void)x2; (void)y2;
}
