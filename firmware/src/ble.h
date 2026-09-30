#pragma once
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
void ble_request_refresh(void);
// Answer a relayed permission prompt: {"approve":"<id>"} on the TX char. The
// device only ever says yes; a deny is given in the terminal.
void ble_send_approve(const char* id);
// A PWR or aux press for the host to act on: {"btn":"pwr"|"aux","scr":"<on top>"}
// on the TX char. scr is what was showing before the press did anything on the
// device (ui_screen_name). Sent whenever a central is subscribed to TX; true only
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

void ble_set_battery_level(int pct);

// BLE HID keyboard
void ble_keyboard_press(uint8_t key, uint8_t modifier);
void ble_keyboard_release(void);
