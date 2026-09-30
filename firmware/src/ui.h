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

// Local wall-clock as last sent by the daemon (payload t/tf), advanced on the
// device. false until the daemon has sent it (clock off in its config).
bool ui_local_time(int* hour, int* yday);

// Approve overlay: a Claude Code permission prompt relayed by the host. It sits
// over whatever screen is up until the button/tap answers it, the host clears
// it, or expire_s runs out (0 = the default window).
void ui_approve_show(const char* id, const char* tool, const char* text, int expire_s);
void ui_approve_clear(void);
bool ui_approve_visible(void);
// The answer. Ignored until the prompt has been up for a moment, so a press
// meant for the screen toggle can't approve something.
void ui_approve_accept(void);

// Notification overlay: a short message from the host (LabDaemon Engine). It
// covers the screens and a page, sits under an approve prompt, and goes by
// itself after expire_s (0 = the default 8 s), on a PWR or aux press, or on a
// tap. Title and text both empty clears it.
void ui_notify_show(const char* title, const char* text, int expire_s);
void ui_notify_clear(void);
bool ui_notify_visible(void);

// Page: a card the host keeps up while something is going on (a track playing).
// A title, three lines, a progress bar (pp 0..100; hidden when pp < 0) and a
// creature (anim, a splash animation name; none when ""). Above the screens,
// below a notification and an approve prompt. Sending the same pg again updates
// it in place. PWR and aux on a page are for the host (main.cpp; with no host
// listening they leave it). A tap leaves it until the same pg comes with other
// text or another creature, or another pg comes; a new progress alone stays
// out. ui_page_clear takes it down and ends a tap's leave.
void ui_page_show(const char* pg, const char* title, const char* l1, const char* l2,
                  const char* l3, int pp, const char* anim);
void ui_page_clear(void);
bool ui_page_visible(void);

// What is on top right now, the "scr" of a button event: "approve", "notify",
// "page", or the screen underneath, "splash" or "usage".
const char* ui_screen_name(void);
