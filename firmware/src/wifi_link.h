#pragma once
// Wi-Fi station for the album art on the music card (plans/labdaemon.md,
// "Increment 2"). Built only where the env sets FEATURE_PICTURE (lcd_4); on
// every other board this header declares nothing and wifi_link.cpp is empty.
//
// The credentials live in the board's NVS and nowhere else (Preferences
// namespace "wifi", keys "ssid" and "pass"); the password is never printed.
// They come over serial (`wifi <ssid>|<password>`) or from the host over BLE
// ({"wf":"<ssid>","wp":"<password>"}, main.cpp), which the board answers with
// {"ack":true,"wf":"ok"} once they are stored or {"err":true,"wf":"no"} when
// it did not store them, so a host knows a board with Wi-Fi has them. Joining
// and rejoining run on a task of their own, so the LVGL loop never waits on
// the radio. BLE is left alone, and so is the modem sleep default, which Wi-Fi
// and BLE coexistence on one radio needs.
#ifdef FEATURE_PICTURE
#include <stdint.h>

// Load the stored credentials and start the Wi-Fi task, which joins when there
// are any. Call once in setup().
void wifi_link_init(void);

// Print on the loop what the Wi-Fi and art tasks logged (wifi_link_log), so
// their lines never land inside a screenshot dump. Call every loop pass.
void wifi_link_tick(void);

// Store new credentials and join with them, leaving the network the board is
// on. False, with nothing stored, when the SSID is not 1 to 32 bytes or the
// password is none of these: empty (an open network), a passphrase of 8 to 63
// characters, a raw key of exactly 64 hex digits (the driver reads any 64
// character password as a raw key, so one that is not hex could never join).
bool wifi_link_set(const char* ssid, const char* pass);

// Forget the credentials and leave the network.
void wifi_link_forget(void);

// Joined, with an address.
bool wifi_link_up(void);

// How many times the board has joined since boot; a new value says the link
// came back.
uint32_t wifi_link_joins(void);

// `wifi status`: state, address, signal and the SSID; never the password.
void wifi_link_print_status(void);

// The `wifi` serial poke, given the text after "wifi ": "off", "status", or
// "<ssid>|<password>". The first '|' splits them and must be there: an open
// network is "<ssid>|", and a line without one stores nothing (a space typed
// for the bar would make the password part of the SSID, which is printed).
// Any text other than "off" and "status" is wiped from the line buffer
// afterwards, stored or not.
void wifi_link_serial(char* args);

// A line for the serial log from another task; wifi_link_tick prints it.
void wifi_link_log(const char* fmt, ...) __attribute__((format(printf, 1, 2)));
#endif
