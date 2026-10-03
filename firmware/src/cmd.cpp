#include "cmd.h"
#include <Arduino.h>
#include <string.h>

#include "ble.h"
#include "brightness.h"
#include "idle.h"
#include "splash.h"
#include "ui.h"
#include "hal/board_caps.h"

// The longest answer, the status report with the longest creature and board
// names, fits with room to spare; TX may take less (send_status).
#define CMD_REPLY_MAX 160
// An unknown verb is named in its answer only as a short word of a to z.
#define CMD_VERB_MAX  15

// The answer on TX in place of the plain ack, while a host is linked, and on serial.
static void reply(const char* msg) {
    ble_send_cmd_reply(msg);
    Serial.printf("cmd: %s\n", msg);
}

// {"c":"<verb>","ok":1}, or {"c":"<verb>","err":"<why>"} when why is set.
static void answer(const char* verb, const char* why) {
    char msg[64];
    if (why) snprintf(msg, sizeof(msg), "{\"c\":\"%s\",\"err\":\"%s\"}", verb, why);
    else     snprintf(msg, sizeof(msg), "{\"c\":\"%s\",\"ok\":1}", verb);
    reply(msg);
}

// An unknown verb as its answer names it: as it came when it is a short word of
// a to z, else "?", so the answer stays JSON and short whatever came in.
static const char* verb_echo(const char* verb) {
    const size_t n = strlen(verb);
    if (!n || n > CMD_VERB_MAX) return "?";
    for (size_t i = 0; i < n; i++) {
        if (verb[i] < 'a' || verb[i] > 'z') return "?";
    }
    return verb;
}

// A whole percentage, 0 to 100 in digits only; -1 for anything else.
static int parse_pct(const char* v) {
    const size_t n = strlen(v);
    if (!n || n > 3) return -1;
    int pct = 0;
    for (size_t i = 0; i < n; i++) {
        if (v[i] < '0' || v[i] > '9') return -1;
        pct = pct * 10 + (v[i] - '0');
    }
    return pct <= 100 ? pct : -1;
}

// The report (cmd.h). Table names and board names are plain ASCII with no quote
// or backslash, so they go in as they are. When the whole would not fit one TX
// notification the creature's name gives up its end; the rest is at most 111
// bytes (with the longest board name, 26), so a whole report with a 23
// character name is 134, under CMD_REPLY_MAX, and the boards ask for an MTU of
// 256, which carries 253.
#define STATUS_FMT "{\"c\":\"status\",\"br\":%d,\"scr\":\"%s\",\"an\":\"%.*s\",\"fw\":\"%s\",\"n\":%d,\"dv\":\"%s\",\"do\":%d}"

static void send_status(void) {
    const int br   = board_caps().fixed_brightness ? -1 : brightness_pct();
    const char* scr = ui_screen_name();
    const char* an  = splash_anim_name();
    const char* fw  = board_caps().name;
    const int n    = splash_anim_count();
    const char* dv  = ui_dance_view_name();
    const int dop  = ui_dance_opa();
    size_t room = ble_tx_max();   // 0 with nobody on TX: serial takes it whole
    if (!room || room > CMD_REPLY_MAX) room = CMD_REPLY_MAX;
    char msg[CMD_REPLY_MAX + 1];
    // Everything but the creature's name first, to see how much of it fits.
    const int rest = snprintf(msg, sizeof(msg), STATUS_FMT, br, scr, 0, "", fw, n, dv, dop);
    const int keep = (int)room - rest;
    snprintf(msg, sizeof(msg), STATUS_FMT, br, scr, keep > 0 ? keep : 0, an, fw, n, dv, dop);
    reply(msg);
}

void cmd_run(const char* verb, const char* value) {
    if (!verb)  verb = "";
    if (!value) value = "";
    if (strcmp(verb, "status") == 0) {
        send_status();   // a look, not a change: a dark panel stays dark
        return;
    }
    const char* why = nullptr;
    if (strcmp(verb, "bright") == 0) {
        const int pct = parse_pct(value);
        if (board_caps().fixed_brightness) why = "no";
        else if (pct < 0)                  why = "value";
        else                               brightness_set_pct((uint8_t)pct);
    } else if (strcmp(verb, "anim") == 0) {
        if (!splash_hold_anim(value)) why = "name";
    } else if (strcmp(verb, "screen") == 0) {
        if (strcmp(value, "page") == 0 && !ui_page_live()) why = "no page";
        else if (!ui_go_to(value))                         why = "value";
    } else if (strcmp(verb, "dance") == 0) {
        if (strcmp(value, "next") != 0) why = "value";
        else if (!ui_dance_next())      why = "no dance";
    } else if (strcmp(verb, "dview") == 0) {
        why = ui_dance_view_set(value);
    } else if (strcmp(verb, "dvo") == 0) {
        why = ui_dance_opa_set(parse_pct(value));
    } else {
        answer(verb_echo(verb), "verb");
        return;
    }
    // A change the host asked for is there to be seen: a dark panel lights up
    // and a lit one keeps its full timeout, as for a new page.
    if (!why) idle_note_activity();
    answer(verb, why);
}
