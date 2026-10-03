#pragma once
#include <stdint.h>

// User-controlled display brightness, persisted to NVS. aux on the usage
// screen cycles through the levels via brightness_cycle(); the host sets a
// percentage with the cmd message's bright (brightness_set_pct, cmd.h).
// idle owns the actual panel brightness, so this routes the chosen level
// through idle_set_awake_brightness().
void    brightness_init(void);    // load saved level from NVS and apply
void    brightness_cycle(void);   // advance to the next step above the level, save, apply
uint8_t brightness_get(void);     // current PWM level (0..255)

// The level as a percentage, 0..100. 0 is the dimmest the panel goes, never
// dark (a level of 0 is black on every panel, and kept in NVS it would boot
// black); turning the panel off is the idle timeout's job.
uint8_t brightness_pct(void);
// Take a percentage (over 100 counts as 100) as the level, save it, apply it.
void    brightness_set_pct(uint8_t pct);
