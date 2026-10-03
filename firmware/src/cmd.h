#pragma once

// The cmd message (plans/labdaemon.md, "Protocol"): a named verb from the host,
// {"c":"<verb>","v":"<value>"}, its own BLE write (main.cpp, handle_cmd_msg),
// and the serial poke `cmd <verb> <value>`, which runs the same verbs.
//
//   bright  0 to 100                  panel brightness, kept in NVS (brightness.h)
//   anim    a creature name           held on the splash (splash_hold_anim); "" lets go
//   screen  splash, usage or page     that screen on top (ui_go_to); page only while one is live
//   dance   next                      the dance floor's next dancer (ui_dance_next)
//   dview   card, large or full       the dance view, how big a page that dances (pa
//                                     "dance") draws its dancer (ui.h); kept in NVS,
//                                     default large
//   dvo     0 to 100                  the full view's overlay opacity, kept in NVS, default 55
//   status  empty                     the report, below
//
// The answer goes on TX in place of the plain ack, and on serial:
// {"c":"<verb>","ok":1}, or {"c":"<verb>","err":"<why>"} with why one of
// "verb" (no such verb; an odd one is named "?"), "value" (not one the verb
// takes), "no" (bright on a board whose brightness cannot be set; dview large
// or full, or dvo, on a board without PSRAM, which keeps the card), "name" (no
// creature of that name on this board), "no page", "no dance". status answers
// {"c":"status","br":<0..100>,"scr":"<screen>","an":"<creature>","fw":"<board>","n":<animations>,"dv":"<view>","do":<0..100>}
// instead, within one TX notification: br is -1 where brightness cannot be
// set, scr is ui_screen_name(), an the creature on the splash now, fw the
// board's name, n how many animations its table has, dv the dance view a page
// that dances gets on this board and do the overlay opacity. Every verb but
// status lights a dark panel, so the change is seen. Older firmware has no
// handler and answers the plain nack.
//
// The overlay is see-through, never blurred: a blur is a filter pass over
// every px the dancer redraws, too much for this ESP32 beside an RGB panel that
// scans out of the same PSRAM.
void cmd_run(const char* verb, const char* value);
