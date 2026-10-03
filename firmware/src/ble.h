#pragma once
#include <stddef.h>
#include <stdint.h>

enum ble_state_t {
    BLE_STATE_INIT,
    BLE_STATE_ADVERTISING,
    BLE_STATE_CONNECTED,
    BLE_STATE_DISCONNECTED,
};

void ble_init(void);
void ble_tick(void);
ble_state_t ble_get_state(void);
const char* ble_get_device_name(void);
const char* ble_get_mac_address(void);
void ble_clear_bonds(void);
bool ble_has_bonds(void);
bool ble_has_data(void);
const char* ble_get_data(void);
void ble_send_ack(void);
void ble_send_nack(void);
// The answer to a cmd message (cmd.h) on the TX char, in place of the plain
// ack: {"c":"<verb>","ok":1}, {"c":"<verb>","err":"<why>"} or the status
// report. The caller keeps it within ble_tx_max().
void ble_send_cmd_reply(const char* msg);
// The most bytes one TX notification carries to every subscribed central: the
// smallest ATT MTU among them, less 3. 0 while none is subscribed.
size_t ble_tx_max(void);
void ble_request_refresh(void);
// Answer a relayed permission prompt: {"approve":"<id>"} on the TX char. The
// device only ever says yes; a deny is given in the terminal.
void ble_send_approve(const char* id);
// A PWR or aux press for the host to act on: {"btn":"<btn>","scr":"<on top>"}
// on the TX char, btn "pwr", "aux", or on the page "aux", "pwr2" and "aux2" (the
// double taps; a single PWR there sends nothing). scr is what was showing before
// the press did anything on the device (ui_screen_name), "page" for every press
// on the page. Sent whenever a central is subscribed to TX; true only
// when a host is there to act on it (ble_host_listening). Logged on Serial
// either way, saying which.
bool ble_send_button(const char* btn, const char* scr);

// The host counts as there while it has written something within this window.
// On a live link the tray writes at least once a usage poll (60 s), a page or a
// prompt as they change; 90 s leaves room for a slow poll and is the same window
// after which the usage screen calls its numbers stale (DATA_FRESH_MS in ui.cpp).
#define BLE_HOST_QUIET_MS 90000UL
// Milliseconds since the owner host last wrote a message the board took (usage,
// prompt, notification, page); UINT32_MAX when it has written nothing since boot.
uint32_t ble_ms_since_host_write(void);
// A host is there to act on a button: a central subscribed to TX that has written
// within BLE_HOST_QUIET_MS. A subscription alone is not enough: a bonded client's
// subscription is restored on every reconnect and outlives the app that made it
// (the OS keeps the link for the keyboard after the tray quits).
bool ble_host_listening(void);

#ifdef FEATURE_PICTURE
// Album art over BLE (art.h); boards built without FEATURE_PICTURE have none of
// this, and no art characteristic.
// An answer about a picture on the TX char, {"art":"<id>","ok":1} or
// {"art":"<id>","miss":[...]}, from the loop. False when no central is
// subscribed to TX. The caller keeps it within ble_tx_max().
bool ble_send_art(const char* msg);
// millis() of the owner's last write on RX, the moment the message the loop
// has just taken came in.
uint32_t ble_last_host_write_ms(void);
#endif

void ble_set_battery_level(int pct);

// BLE HID keyboard
void ble_keyboard_press(uint8_t key, uint8_t modifier);
void ble_keyboard_release(void);
