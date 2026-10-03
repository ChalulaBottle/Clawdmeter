#pragma once
#include <stdint.h>
#include <lvgl.h>

// Initialize splash module. Creates the canvas widget inside `parent` and
// allocates the 480x480 pixel buffer (PSRAM).
void splash_init(lv_obj_t *parent);

// Advance animation frame if hold time elapsed. Call from main loop.
void splash_tick(void);

// Cycle to the next animation in the catalog.
void splash_next(void);

// Show/hide the splash container.
void splash_show(void);
void splash_hide(void);

// Repaint every cell on the next tick instead of only the ones that changed.
// Needed whenever something else has drawn over the splash — a screen switch,
// or an overlay that has just gone away. Without it the covered part stays
// black until the animation happens to change those cells, which on a mostly
// still frame can be never.
void splash_request_full_redraw(void);

// Pick the next animation matching the current usage-rate group.
// Called automatically by splash_show(); also exposed so other modules can
// trigger a re-pick when the rate group changes mid-display.
void splash_pick_for_current_rate(void);

// Let the host drive the animation instead of the usage-rate heuristic.
// `name` is a splash_anims[] name (e.g. "work coding"); "" or NULL hands
// control back to splash_pick_for_current_rate(). Only acts when the requested
// name actually changes, so a host repeating the same name every poll doesn't
// fight the PWR button.
void splash_set_anim(const char *name);

// Hold the named creature on the splash (the cmd message's anim, cmd.h): it
// takes the place of the usage-rate groups and stays, with no rotation, until
// another hold, a hold of "" or NULL (back to the groups), or splash_next (the
// creature button at the desk). A creature the host names in usage comes first
// while it lasts and the held one comes back after it. False, with nothing
// changed, for a name this board's table lacks.
bool splash_hold_anim(const char *name);
// The creature on the splash now ("" with no table), and how many the table has.
const char* splash_anim_name(void);
int splash_anim_count(void);

// Aus dem LVGL-Flush-Callback zu rufen, sobald der letzte Streifen eines
// Bilddurchlaufs draussen ist. Der Splash malt auf manchen Boards direkt auf
// den Panel und muss wissen, wann LVGL fertig ist - sonst uebermalt ein noch
// laufender Durchlauf das gerade Gezeichnete.
void splash_note_refresh_done(void);

// True when splash is currently rendering (used to gate re-picks).
bool splash_is_active(void);

// True while the host has named an animation (splash_set_anim with a known name)
// or holds one (splash_hold_anim).
bool splash_host_named(void);

// Root container (so ui.cpp can attach a click event).
lv_obj_t* splash_get_root(void);

// Mini animated creature for embedding elsewhere (e.g. the idle screen).
// Renders the named claudepix animation (e.g. "expression sleep") at ~px×px
// inside `parent`; returns the canvas object (position it with lv_obj_align) or
// NULL if the animation isn't found / allocation fails. Drive it with
// splash_mini_tick(). Any lattice size works: each cell is px divided by the
// animation's size, and never under 1 px.
//
// There is one mini creature for the program's life, never a second buffer. A
// later call from the same parent re-points it at the new animation (and
// returns it); a call from another parent returns NULL and changes nothing. Its
// edge follows the animation's lattice, so align it again after a change.
lv_obj_t* splash_mini_create(lv_obj_t *parent, const char *anim_name, int px);
// Re-point the existing mini creature at another animation, from its first
// frame. False when none has been made yet or the name is unknown; the creature
// then keeps what it had.
bool splash_mini_set_anim(const char *anim_name);
// Advance its frame when due; does nothing while it is hidden.
void splash_mini_tick(void);
// True when this board's table has an animation of that name (the lookup the
// mini creature uses), without pointing anything at it.
bool splash_anim_known(const char *anim_name);
