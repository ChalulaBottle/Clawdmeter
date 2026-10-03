#include "../../hal/sound_hal.h"
#include "board.h"

// BOARD_HAS_SOUND is 0 on this port on purpose (see board.h): main.cpp calls
// sound_hal_init/tick/play_reset unconditionally, so every board needs these
// symbols, and this one simply no-ops, same as sound_hal.h documents for a
// board with no speaker output. The PCM5101 + amp this kit actually has is
// wired in board.h for later, once the operator decides what, if anything,
// should play on it (the house rule is no beeps; chime.h's reset bell is an
// ES8311-codec engine anyway, not something a plain I2S DAC like the PCM5101
// can reuse as-is).

void sound_hal_init(void)      {}
void sound_hal_tick(void)      {}
void sound_hal_play_reset(void) {}
