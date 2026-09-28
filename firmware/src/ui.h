#pragma once
#include "data.h"
#include "ble.h"

enum screen_t {
    SCREEN_SPLASH,
    SCREEN_USAGE,
    SCREEN_COUNT,
};

void ui_init(void);
void ui_update(const UsageData* data);
void ui_tick_anim(void);
void ui_show_screen(screen_t screen);
void ui_toggle_splash(void);
screen_t ui_get_current_screen(void);
void ui_update_ble_status(ble_state_t state, const char* name, const char* mac);
void ui_update_battery(int percent, bool charging);

// Approve overlay: a Claude Code permission prompt relayed by the host. It sits
// over whatever screen is up until the button/tap answers it, the host clears
// it, or expire_s runs out (0 = the default window).
void ui_approve_show(const char* id, const char* tool, const char* text, int expire_s);
void ui_approve_clear(void);
bool ui_approve_visible(void);
// The answer. Ignored until the prompt has been up for a moment, so a press
// meant for the screen toggle can't approve something.
void ui_approve_accept(void);
