#include "../../hal/sound_hal.h"
#include "io_expander.h"
#include <Arduino.h>

// No codec on this kit, just a buzzer behind an expander pin, so it is on/off
// only (an active, self-oscillating buzzer is assumed; a passive one would
// need PWM neither expander pin offers and simply stays silent). The chime is
// a short beep pattern stepped from tick(); play_reset() only arms it and
// never blocks, per the sound_hal contract.

// on, off, on, off, on — milliseconds
static const uint16_t pattern_ms[] = {60, 40, 60, 40, 120};
static const int      pattern_len  = sizeof(pattern_ms) / sizeof(pattern_ms[0]);

static int      step = -1;
static uint32_t step_started_ms = 0;

void sound_hal_init(void) {
    io_expander_set_buzzer(false);
}

void sound_hal_play_reset(void) {
    step = 0;
    step_started_ms = millis();
    io_expander_set_buzzer(true);
}

void sound_hal_tick(void) {
    if (step < 0) return;
    if (millis() - step_started_ms < pattern_ms[step]) return;
    step++;
    if (step >= pattern_len) {
        io_expander_set_buzzer(false);
        step = -1;
        return;
    }
    io_expander_set_buzzer((step % 2) == 0);   // even steps are "on"
    step_started_ms = millis();
}
