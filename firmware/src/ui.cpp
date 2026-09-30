#include "ui.h"
#include "splash.h"
#include "charge_anim.h"
#include "idle.h"
#include <lvgl.h>
#include <time.h>
#include "logo.h"
#include "icons.h"
#include "hal/board_caps.h"

// Custom fonts (scaled for 314 PPI, ~1.9x from original 165 PPI)
LV_FONT_DECLARE(font_tiempos_56);
LV_FONT_DECLARE(font_tiempos_34);
LV_FONT_DECLARE(font_styrene_48);
LV_FONT_DECLARE(font_styrene_28);
LV_FONT_DECLARE(font_styrene_24);
LV_FONT_DECLARE(font_styrene_20);
LV_FONT_DECLARE(font_styrene_16);
LV_FONT_DECLARE(font_styrene_14);
LV_FONT_DECLARE(font_styrene_12);
LV_FONT_DECLARE(font_mono_32);
LV_FONT_DECLARE(font_mono_18);

// Layout values computed from the active board's geometry. Populated once
// in ui_init() and treated as const for the rest of the program. Adding a
// new display size means extending compute_layout() with another
// breakpoint — never editing the screen-builder functions below.
struct Layout {
    int16_t scr_w, scr_h;
    int16_t margin;
    int16_t title_y;
    int16_t content_y;
    int16_t content_w;

    // Usage screen
    int16_t usage_panel_h;
    int16_t usage_panel_gap;
    int16_t usage_bar_y;
    int16_t usage_reset_y;
    int16_t bar_h;
    int16_t panel_pad_x, panel_pad_y;
    int16_t pill_pad_x, pill_pad_y;
    const lv_font_t* title_font;     // screen title / clock
    const lv_font_t* pct_font;       // big percentage number
    const lv_font_t* ent_pct_font;   // enterprise spending number
    const lv_font_t* pill_font;      // "Current" / "Weekly" pill
    const lv_font_t* reset_font;     // "Resets in ..." line
    const lv_font_t* pace_font;      // enterprise "Under/On/Over pace" line
    const lv_font_t* anim_font;      // animated status line
    int16_t anim_y;                  // status line offset from bottom
    const lv_font_t* agents_font;    // "N AGENTS" tag; nullptr = no room on this layout
    int16_t agents_y;                // tag top edge inside the session panel
    bool    small_icons;             // 40px logo + 24px battery (vs 80/48) on small screens
    int16_t title_nudge;             // title x-shift balancing the corner logo
    int16_t logo_y;                  // logo top edge
    int16_t batt_y;                  // battery icon top edge
    int16_t batt_w;                  // battery icon width, for position math

    // Pairing hint / idle screen
    int16_t pair_y1, pair_y2, pair_y3;
    int16_t idle_px;                 // sleeping-creature size on the idle screen

    // Bluetooth screen
    int16_t bt_info_panel_h;
    int16_t bt_reset_zone_h;
    const lv_font_t* bt_title_font;
    const lv_font_t* bt_status_font;
    const lv_font_t* bt_device_font;
    const lv_font_t* bt_credit_1_font;
    const lv_font_t* bt_credit_2_font;
};
static Layout L = {};

// Pick layout values from the active board's pixel dimensions. The two
// existing boards happen to land on the two breakpoints below; new ports
// inherit the closer one — visually OK, may need a polish pass for
// pixel-perfect alignment but never blocks the port from booting.
static void compute_layout(const BoardCaps& c) {
    L.scr_w = c.width;
    L.scr_h = c.height;
    L.margin = 20;
    L.title_y = 30;

    // Values shared by the two original breakpoints; the small branch below
    // overrides them wholesale.
    L.bar_h = 24;
    L.panel_pad_x = 16;
    L.panel_pad_y = 12;
    L.pill_pad_x = 18;
    L.pill_pad_y = 6;
    L.title_font   = &font_tiempos_56;
    L.pct_font     = &font_styrene_48;
    L.ent_pct_font = &font_tiempos_56;
    L.pill_font    = &font_styrene_28;
    L.reset_font   = &font_styrene_28;
    L.pace_font    = &font_styrene_16;
    L.anim_font    = &font_mono_32;
    L.anim_y = -15;
    L.small_icons = false;
    L.title_nudge = 16;
    L.logo_y = L.title_y - 10;
    L.batt_y = L.title_y;
    L.batt_w = ICON_BATTERY_W;
    L.pair_y1 = 40;
    L.pair_y2 = 120;
    L.pair_y3 = 160;
    L.idle_px = 160;

    if (c.height >= 460) {
        // Large layout — tuned for 480x480 (AMOLED-2.16).
        L.content_y = 100;
        L.usage_panel_h = 150;
        L.usage_panel_gap = 16;
        L.usage_bar_y = 56;
        L.usage_reset_y = 94;
        L.bt_info_panel_h = 160;
        L.bt_reset_zone_h = 110;
        L.bt_title_font    = &font_tiempos_56;
        L.bt_status_font   = &font_styrene_48;
        L.bt_device_font   = &font_styrene_28;
        L.bt_credit_1_font = &font_styrene_24;
        L.bt_credit_2_font = &font_styrene_20;
    } else if (c.height >= 300) {
        // Compact layout — tuned for 368x448 (AMOLED-1.8).
        L.content_y = 85;
        L.usage_panel_h = 130;
        L.usage_panel_gap = 12;
        L.usage_bar_y = 48;
        L.usage_reset_y = 78;
        L.bt_info_panel_h = 140;
        L.bt_reset_zone_h = 90;
        L.bt_title_font    = &font_tiempos_34;
        L.bt_status_font   = &font_styrene_28;
        L.bt_device_font   = &font_styrene_20;
        L.bt_credit_1_font = &font_styrene_16;
        L.bt_credit_2_font = &font_styrene_14;
    } else {
        // Small layout — tuned for 240x240 (LCD-1.54 and similar square TFTs).
        // Everything shrinks: fonts two steps down, panels ~half height, and
        // the corner logo/battery switch to the 40px/24px small assets.
        L.margin = 8;
        L.title_y = 4;
        L.content_y = 44;
        L.usage_panel_h = 74;
        L.usage_panel_gap = 6;
        L.usage_bar_y = 30;
        L.usage_reset_y = 46;
        L.bar_h = 12;
        L.panel_pad_x = 10;
        L.panel_pad_y = 6;
        L.pill_pad_x = 8;
        L.pill_pad_y = 2;
        L.title_font   = &font_tiempos_34;
        L.pct_font     = &font_styrene_24;
        L.ent_pct_font = &font_tiempos_34;
        L.pill_font    = &font_styrene_14;
        L.reset_font   = &font_styrene_14;
        L.pace_font    = &font_styrene_12;
        L.anim_font    = &font_mono_18;
        // Center the status line in the strip below the weekly panel; flush
        // against the bottom edge it reads as unevenly spaced.
        L.anim_y = -10;
        L.small_icons = true;
        L.title_nudge = 8;
        L.logo_y = 2;
        L.batt_y = 10;
        L.batt_w = ICON_BATTERY_SMALL_W;
        L.pair_y1 = 12;
        L.pair_y2 = 56;
        L.pair_y3 = 80;
        L.idle_px = 96;
        L.bt_info_panel_h = 90;
        L.bt_reset_zone_h = 60;
        L.bt_title_font    = &font_tiempos_34;
        L.bt_status_font   = &font_styrene_20;
        L.bt_device_font   = &font_styrene_14;
        L.bt_credit_1_font = &font_styrene_12;
        L.bt_credit_2_font = &font_styrene_12;
    }

    L.content_w = L.scr_w - 2 * L.margin;

    // "N AGENTS" tag: right end of the session panel's reset row, sitting on the
    // reset line's baseline. The row has to hold the widest session reset text
    // (digits are proportional, 4 and 0 are the widest) beside a two-digit count;
    // only the 480-wide panels manage that, narrower ones go without the tag.
    L.agents_font = &font_mono_18;
    L.agents_y = L.usage_reset_y
               + (L.reset_font->line_height - L.reset_font->base_line)
               - (L.agents_font->line_height - L.agents_font->base_line);
    lv_point_t reset_sz, tag_sz;
    lv_text_get_size(&reset_sz, "Resets in 4h 40m", L.reset_font, 0, 0, LV_COORD_MAX, LV_TEXT_FLAG_NONE);
    lv_text_get_size(&tag_sz, "99 AGENTS", L.agents_font, 0, 0, LV_COORD_MAX, LV_TEXT_FLAG_NONE);
    if (reset_sz.x + L.panel_pad_x + tag_sz.x > L.content_w - 2 * L.panel_pad_x) {
        L.agents_font = nullptr;
    }
}

// Anthropic brand palette — design tokens live in theme.h
#include "theme.h"
#define COL_BG        THEME_BG
#define COL_PANEL     THEME_PANEL
#define COL_TEXT      THEME_TEXT
#define COL_DIM       THEME_DIM
#define COL_ACCENT    THEME_ACCENT
#define COL_GREEN     THEME_GREEN
#define COL_AMBER     THEME_AMBER
#define COL_RED       THEME_RED
#define COL_BAR_BG    THEME_BAR_BG

// ---- Usage screen widgets (single non-splash view) ----
static lv_obj_t* usage_container;
static lv_obj_t* lbl_title;
// Clock fed by the daemon: base epoch (local wall-clock seconds) + the lv_tick at
// which it landed, so the title ticks forward locally between 60s payloads.
static long     clock_base_epoch = 0;
static uint32_t clock_base_ms = 0;
static int      clock_fmt = 24;   // 12 or 24, set from the daemon payload
static int      clock_last_min = -1;   // last rendered minute; avoids redrawing the title every tick
static lv_obj_t* usage_group;   // the two usage panels — shown when connected
static lv_obj_t* pair_group;    // pairing hint — shown when disconnected
static lv_obj_t* bar_session;
static lv_obj_t* lbl_session_pct;
static lv_obj_t* lbl_session_label;
static lv_obj_t* lbl_session_reset;
static lv_obj_t* bar_weekly;
static lv_obj_t* lbl_weekly_pct;
static lv_obj_t* lbl_weekly_label;
static lv_obj_t* lbl_weekly_reset;
static lv_obj_t* panel_session = nullptr;
static lv_obj_t* panel_weekly = nullptr;
// Enterprise-only widgets inside panel_session
static lv_obj_t* lbl_session_pct_sym = nullptr;  // "%" in smaller font
static lv_obj_t* lbl_spending_desc = nullptr;     // "of your monthly budget"
static lv_obj_t* lbl_spending_status = nullptr;   // "Under pace" / "On pace" / "Over pace"
static lv_obj_t* lbl_agents = nullptr;   // "N AGENTS" tag on the session reset row
static lv_obj_t* lbl_anim;      // status line: connection state + whimsical idle

// ---- Battery indicator (shared, on top) ----
static lv_obj_t* battery_img;
static lv_obj_t* logo_img;
static lv_image_dsc_t battery_dscs[5];  // empty, low, medium, full, charging

// ---- Agent count on the splash (top-left badge, bare number) ----
static lv_obj_t* splash_badge = nullptr;

// ---- Live-data freshness → which usage sub-view to show ----
// usage panels when data is flowing, an idle "Zzz" screen when the host is
// connected but no usage update landed within DATA_FRESH_MS, the pairing hint
// when BLE is down. Re-evaluated every loop in ui_tick_anim().
static lv_obj_t* idle_group;            // the "Zzz" idle screen
static uint32_t  last_data_ms = 0;      // lv_tick when the last valid usage update landed
static bool      data_received = false; // any valid update since boot
static int       view_state = -1;       // -1 unknown / 0 pair / 1 idle / 2 usage
static const uint32_t DATA_FRESH_MS = 90000;  // usage counts as "live" within this window (daemon sends ~60s)

// ---- Shared ----
static lv_image_dsc_t logo_dsc;
static screen_t current_screen = SCREEN_USAGE;
static bool     s_ble_connected = false;   // cached BLE connection state
static uint32_t connected_at_ms = 0;       // when we last entered CONNECTED ("Connected" dwell)

// Animation state
static uint32_t anim_last_ms = 0;
static uint8_t anim_spinner_idx = 0;
static uint8_t anim_phase = 0;
static uint8_t anim_msg_idx = 0;
static uint32_t anim_msg_start = 0;
#define ANIM_MSG_MS     4000

static const char* const spinner_frames[] = {
    "\xC2\xB7", "\xE2\x9C\xBB", "\xE2\x9C\xBD",
    "\xE2\x9C\xB6", "\xE2\x9C\xB3", "\xE2\x9C\xA2",
};
#define SPINNER_COUNT 6
#define SPINNER_PHASES (2 * (SPINNER_COUNT - 1))  // 10: ping-pong 0..5..0

static const uint16_t spinner_ms[SPINNER_COUNT] = {
    260, 130, 130, 130, 130, 260,
};

static const char* const anim_messages[] = {
    "Accomplishing", "Elucidating", "Perusing",
    "Actioning", "Enchanting", "Philosophising",
    "Actualizing", "Envisioning", "Pondering",
    "Baking", "Finagling", "Pontificating",
    "Booping", "Flibbertigibbeting", "Processing",
    "Brewing", "Forging", "Puttering",
    "Calculating", "Forming", "Puzzling",
    "Cerebrating", "Frolicking", "Reticulating",
    "Channelling", "Generating", "Ruminating",
    "Churning", "Germinating", "Scheming",
    "Clauding", "Hatching", "Schlepping",
    "Coalescing", "Herding", "Shimmying",
    "Cogitating", "Honking", "Shucking",
    "Combobulating", "Hustling", "Simmering",
    "Computing", "Ideating", "Smooshing",
    "Concocting", "Imagining", "Spelunking",
    "Conjuring", "Incubating", "Spinning",
    "Considering", "Inferring", "Stewing",
    "Contemplating", "Jiving", "Sussing",
    "Cooking", "Manifesting", "Synthesizing",
    "Crafting", "Marinating", "Thinking",
    "Creating", "Meandering", "Tinkering",
    "Crunching", "Moseying", "Transmuting",
    "Deciphering", "Mulling", "Unfurling",
    "Deliberating", "Mustering", "Unravelling",
    "Determining", "Musing", "Vibing",
    "Discombobulating", "Noodling", "Wandering",
    "Divining", "Percolating", "Whirring",
    "Doing", "Wibbling",
    "Effecting", "Wizarding",
    "Working", "Wrangling",
};
#define ANIM_MSG_COUNT (sizeof(anim_messages) / sizeof(anim_messages[0]))

static lv_color_t pct_color(float pct) {
    if (pct >= 80.0f) return COL_RED;
    if (pct >= 50.0f) return COL_AMBER;
    return COL_GREEN;
}

static void format_reset_time(int mins, char* buf, size_t len) {
    if (mins < 0) {
        snprintf(buf, len, "---");
    } else if (mins < 60) {
        snprintf(buf, len, "Resets in %dm", mins);
    } else if (mins < 1440) {
        snprintf(buf, len, "Resets in %dh %dm", mins / 60, mins % 60);
    } else {
        snprintf(buf, len, "Resets in %dd %dh", mins / 1440, (mins % 1440) / 60);
    }
}

// Forward decls — callbacks defined near ui_show_screen below
static void global_click_cb(lv_event_t* e);

static lv_obj_t* make_panel(lv_obj_t* parent, int x, int y, int w, int h) {
    lv_obj_t* panel = lv_obj_create(parent);
    lv_obj_set_pos(panel, x, y);
    lv_obj_set_size(panel, w, h);
    lv_obj_set_style_bg_color(panel, COL_PANEL, 0);
    lv_obj_set_style_bg_opa(panel, LV_OPA_COVER, 0);
    lv_obj_set_style_radius(panel, 8, 0);
    lv_obj_set_style_border_width(panel, 0, 0);
    lv_obj_set_style_pad_left(panel, L.panel_pad_x, 0);
    lv_obj_set_style_pad_right(panel, L.panel_pad_x, 0);
    lv_obj_set_style_pad_top(panel, L.panel_pad_y, 0);
    lv_obj_set_style_pad_bottom(panel, L.panel_pad_y, 0);
    lv_obj_clear_flag(panel, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(panel, LV_OBJ_FLAG_EVENT_BUBBLE);
    return panel;
}

static lv_obj_t* make_bar(lv_obj_t* parent, int x, int y, int w, int h) {
    lv_obj_t* bar = lv_bar_create(parent);
    lv_obj_set_pos(bar, x, y);
    lv_obj_set_size(bar, w, h);
    lv_bar_set_range(bar, 0, 100);
    lv_bar_set_value(bar, 0, LV_ANIM_OFF);
    lv_obj_set_style_bg_color(bar, COL_BAR_BG, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(bar, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_set_style_radius(bar, 6, LV_PART_MAIN);
    lv_obj_set_style_bg_color(bar, COL_GREEN, LV_PART_INDICATOR);
    lv_obj_set_style_bg_opa(bar, LV_OPA_COVER, LV_PART_INDICATOR);
    lv_obj_set_style_radius(bar, 6, LV_PART_INDICATOR);
    return bar;
}

static void init_icon_dsc_rgb565a8(lv_image_dsc_t* dsc, int w, int h, const uint8_t* data) {
    dsc->header.w = w;
    dsc->header.h = h;
    dsc->header.cf = LV_COLOR_FORMAT_RGB565A8;
    dsc->header.stride = w * 2;
    dsc->data = data;
    dsc->data_size = w * h * 3;
}

static lv_obj_t* make_pill(lv_obj_t* parent, const char* text) {
    lv_obj_t* lbl = lv_label_create(parent);
    lv_label_set_text(lbl, text);
    lv_obj_set_style_text_font(lbl, L.pill_font, 0);
    lv_obj_set_style_text_color(lbl, COL_TEXT, 0);
    lv_obj_set_style_bg_color(lbl, COL_BAR_BG, 0);
    lv_obj_set_style_bg_opa(lbl, LV_OPA_COVER, 0);
    lv_obj_set_style_radius(lbl, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_pad_left(lbl, L.pill_pad_x, 0);
    lv_obj_set_style_pad_right(lbl, L.pill_pad_x, 0);
    lv_obj_set_style_pad_top(lbl, L.pill_pad_y, 0);
    lv_obj_set_style_pad_bottom(lbl, L.pill_pad_y, 0);
    return lbl;
}

// ======== Approve overlay ========
// A permission prompt from Claude Code, relayed by the host as its own BLE
// message. Covers whatever screen is up. The BOOT press, or a tap on the
// button once the panel has touch, sends {"approve": id} back; the host's
// hook turns that into the allow. Only a yes ever leaves the device: a deny
// is given in the terminal, and doing nothing here hands the prompt back to
// the terminal when the host's wait runs out.
#define APPROVE_ARM_MS     700    // a press this soon after the prompt appears was meant for something else
#define APPROVE_SENT_MS    1500   // "Approved" stays this long, then the overlay goes
#define APPROVE_DEFAULT_S  45

static lv_obj_t* approve_group   = nullptr;
static lv_obj_t* approve_lbl_tool = nullptr;
static lv_obj_t* approve_lbl_text = nullptr;
static lv_obj_t* approve_btn      = nullptr;
static lv_obj_t* approve_btn_lbl  = nullptr;
static lv_obj_t* approve_lbl_hint = nullptr;
static char      approve_id[24]   = "";
static uint32_t  approve_shown_ms = 0;
static uint32_t  approve_until_ms = 0;
static uint32_t  approve_sent_ms  = 0;   // 0 = not answered yet

#define APPROVE_HINT "Press the button to approve. Deny in the terminal."

static void approve_btn_cb(lv_event_t* e) {
    (void)e;
    ui_approve_accept();
}

static void init_approve_overlay(lv_obj_t* scr) {
    const int btn_h  = L.scr_h >= 460 ? 72 : L.scr_h >= 300 ? 56 : 36;
    const int gap    = L.scr_h >= 300 ? 12 : 6;
    const lv_font_t* text_font = &font_mono_18;
    const lv_font_t* hint_font = L.pace_font;

    approve_group = lv_obj_create(scr);
    lv_obj_set_pos(approve_group, 0, 0);
    lv_obj_set_size(approve_group, L.scr_w, L.scr_h);
    lv_obj_set_style_bg_color(approve_group, COL_BG, 0);
    lv_obj_set_style_bg_opa(approve_group, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(approve_group, 0, 0);
    lv_obj_set_style_radius(approve_group, 0, 0);
    lv_obj_set_style_pad_all(approve_group, L.margin, 0);
    lv_obj_clear_flag(approve_group, LV_OBJ_FLAG_SCROLLABLE);
    // Clickable so a tap ends here; none reach the splash toggle underneath.
    lv_obj_add_flag(approve_group, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_flag(approve_group, LV_OBJ_FLAG_HIDDEN);

    lv_obj_t* title = lv_label_create(approve_group);
    lv_label_set_text(title, "Approve?");
    lv_obj_set_style_text_font(title, L.title_font, 0);
    lv_obj_set_style_text_color(title, COL_TEXT, 0);
    lv_obj_align(title, LV_ALIGN_TOP_LEFT, 0, 0);

    // What is really being approved: the tool, in the biggest type on the page.
    const int tool_y = L.title_font->line_height + gap;
    approve_lbl_tool = lv_label_create(approve_group);
    lv_label_set_text(approve_lbl_tool, "");
    lv_obj_set_style_text_font(approve_lbl_tool, L.pct_font, 0);
    lv_obj_set_style_text_color(approve_lbl_tool, COL_ACCENT, 0);
    lv_obj_set_width(approve_lbl_tool, L.content_w);
    lv_label_set_long_mode(approve_lbl_tool, LV_LABEL_LONG_CLIP);
    lv_obj_align(approve_lbl_tool, LV_ALIGN_TOP_LEFT, 0, tool_y);

    // The rest of the prompt (command, path, url), wrapped; what doesn't fit
    // ends in an ellipsis, and the terminal always has the whole thing.
    const int hint_h = hint_font->line_height;
    const int text_y = tool_y + L.pct_font->line_height + gap;
    const int text_h = (L.scr_h - 2 * L.margin) - text_y - (btn_h + hint_h + 3 * gap);
    approve_lbl_text = lv_label_create(approve_group);
    lv_label_set_text(approve_lbl_text, "");
    lv_obj_set_style_text_font(approve_lbl_text, text_font, 0);
    lv_obj_set_style_text_color(approve_lbl_text, COL_TEXT, 0);
    lv_obj_set_size(approve_lbl_text, L.content_w, text_h > text_font->line_height ? text_h : text_font->line_height);
    lv_label_set_long_mode(approve_lbl_text, LV_LABEL_LONG_DOT);
    lv_obj_align(approve_lbl_text, LV_ALIGN_TOP_LEFT, 0, text_y);

    // The touch answer. Same path as the button press.
    approve_btn = lv_obj_create(approve_group);
    lv_obj_set_size(approve_btn, L.content_w, btn_h);
    lv_obj_set_style_bg_color(approve_btn, COL_PANEL, 0);
    lv_obj_set_style_bg_opa(approve_btn, LV_OPA_COVER, 0);
    lv_obj_set_style_radius(approve_btn, 8, 0);
    lv_obj_set_style_border_width(approve_btn, 0, 0);
    lv_obj_set_style_pad_all(approve_btn, 0, 0);
    lv_obj_clear_flag(approve_btn, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(approve_btn, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(approve_btn, approve_btn_cb, LV_EVENT_CLICKED, NULL);
    lv_obj_align(approve_btn, LV_ALIGN_BOTTOM_LEFT, 0, -(hint_h + gap));
    approve_btn_lbl = lv_label_create(approve_btn);
    lv_label_set_text(approve_btn_lbl, "APPROVE");
    lv_obj_set_style_text_font(approve_btn_lbl, L.pill_font, 0);
    lv_obj_set_style_text_color(approve_btn_lbl, COL_TEXT, 0);
    lv_obj_center(approve_btn_lbl);

    approve_lbl_hint = lv_label_create(approve_group);
    lv_label_set_text(approve_lbl_hint, APPROVE_HINT);
    lv_obj_set_style_text_font(approve_lbl_hint, hint_font, 0);
    lv_obj_set_style_text_color(approve_lbl_hint, COL_DIM, 0);
    lv_obj_set_width(approve_lbl_hint, L.content_w);
    lv_label_set_long_mode(approve_lbl_hint, LV_LABEL_LONG_CLIP);
    lv_obj_align(approve_lbl_hint, LV_ALIGN_BOTTOM_LEFT, 0, 0);
}

bool ui_approve_visible(void) {
    return approve_group && !lv_obj_has_flag(approve_group, LV_OBJ_FLAG_HIDDEN);
}

void ui_approve_show(const char* id, const char* tool, const char* text, int expire_s) {
    if (!approve_group || !id || !*id) return;
    if (expire_s <= 0) expire_s = APPROVE_DEFAULT_S;
    const uint32_t now = lv_tick_get();
    // The host re-sends the same request on every state push while it waits;
    // only the deadline moves, the arm timer does not restart.
    if (ui_approve_visible() && strcmp(approve_id, id) == 0) {
        if (!approve_sent_ms) approve_until_ms = now + (uint32_t)expire_s * 1000;
        return;
    }
    strlcpy(approve_id, id, sizeof(approve_id));
    lv_label_set_text(approve_lbl_tool, (tool && *tool) ? tool : "Tool");
    lv_label_set_text(approve_lbl_text, text ? text : "");
    lv_label_set_text(approve_btn_lbl, "APPROVE");
    lv_label_set_text(approve_lbl_hint, APPROVE_HINT);
    approve_shown_ms = now;
    approve_until_ms = now + (uint32_t)expire_s * 1000;
    approve_sent_ms  = 0;
    lv_obj_clear_flag(approve_group, LV_OBJ_FLAG_HIDDEN);
    // Direct-draw boards paint the creature straight onto the panel, over
    // anything LVGL has there; stop it while the prompt is up.
    if (current_screen == SCREEN_SPLASH) splash_hide();
    idle_note_activity();   // a dark panel lights up for the prompt
    Serial.printf("approve: show %s (%s)\n", approve_id, tool ? tool : "");
}

void ui_approve_clear(void) {
    if (!ui_approve_visible()) return;
    lv_obj_add_flag(approve_group, LV_OBJ_FLAG_HIDDEN);
    approve_id[0] = '\0';
    approve_sent_ms = 0;
    ui_show_screen(current_screen);   // puts the splash back if that is where we were
}

void ui_approve_accept(void) {
    if (!ui_approve_visible() || approve_sent_ms) return;
    const uint32_t now = lv_tick_get();
    if (now - approve_shown_ms < APPROVE_ARM_MS) return;
    ble_send_approve(approve_id);
    approve_sent_ms = now;
    lv_label_set_text(approve_btn_lbl, "APPROVED");
    lv_label_set_text(approve_lbl_hint, "Sent to the host.");
}

static void approve_tick(void) {
    if (!ui_approve_visible()) return;
    const uint32_t now = lv_tick_get();
    if (approve_sent_ms) {
        if (now - approve_sent_ms >= APPROVE_SENT_MS) ui_approve_clear();
        return;
    }
    if ((int32_t)(now - approve_until_ms) >= 0) {
        Serial.printf("approve: %s expired on the device\n", approve_id);
        ui_approve_clear();
        return;
    }
    idle_note_activity();   // the panel stays lit while a prompt is waiting
}

// Host text into `dst` (n bytes): control characters become spaces (a newline
// stays when keep_newline), and a cut never leaves half a UTF-8 character. The
// fonts only carry printable ASCII; anything else shows as a gap.
static void copy_text(char* dst, size_t n, const char* src, bool keep_newline) {
    if (!n) return;
    if (!src) src = "";
    size_t i = 0;
    for (; src[i] && i + 1 < n; i++) {
        const unsigned char c = (unsigned char)src[i];
        dst[i] = (c < 0x20 && !(keep_newline && c == '\n')) ? ' ' : (char)c;
    }
    dst[i] = '\0';
    if (((unsigned char)src[i] & 0xC0) == 0x80) {   // the cut landed inside a character
        while (i > 0 && ((unsigned char)dst[i - 1] & 0xC0) == 0x80) i--;
        if (i > 0) i--;                              // and its lead byte
        dst[i] = '\0';
    }
}

// A page is re-sent as it changes (a track's progress every second or so);
// leave the labels whose text did not change alone instead of redrawing them.
// Compared against `shadow` (n bytes), the text last set: a label cut with an
// ellipsis keeps the dots in its own buffer, so its text never matches again.
static void set_text_if_changed(lv_obj_t* lbl, char* shadow, size_t n, const char* text) {
    if (strcmp(shadow, text) == 0) return;
    strlcpy(shadow, text, n);
    lv_label_set_text(lbl, text);
}

// ======== Notify overlay ========
// A short message from the host (LabDaemon Engine, relayed by the tray as its
// own BLE message). Built like the approve overlay without the button: it
// covers the screens and a page, an approve prompt covers it, and it goes by
// itself after its seconds, on a PWR or aux press (main.cpp), or on a tap.
#define NOTIFY_DEFAULT_S   8
#define NOTIFY_MAX_S       86400   // keeps seconds * 1000 far from overflowing
#define NOTIFY_TITLE_MAX   23      // protocol limits, plans/labdaemon.md "Protocol"
#define NOTIFY_TEXT_MAX    96
#define NOTIFY_TITLE_LINES 2

static lv_obj_t* notify_group     = nullptr;
static lv_obj_t* notify_lbl_title = nullptr;
static lv_obj_t* notify_lbl_text  = nullptr;
static uint32_t  notify_until_ms  = 0;

static void notify_click_cb(lv_event_t* e) {
    (void)e;
    Serial.println("notify: tap");
    ui_notify_clear();
}

static void init_notify_overlay(lv_obj_t* scr) {
    notify_group = lv_obj_create(scr);
    lv_obj_set_pos(notify_group, 0, 0);
    lv_obj_set_size(notify_group, L.scr_w, L.scr_h);
    lv_obj_set_style_bg_color(notify_group, COL_BG, 0);
    lv_obj_set_style_bg_opa(notify_group, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(notify_group, 0, 0);
    lv_obj_set_style_radius(notify_group, 0, 0);
    lv_obj_set_style_pad_all(notify_group, L.margin, 0);
    lv_obj_clear_flag(notify_group, LV_OBJ_FLAG_SCROLLABLE);
    // Clickable so a tap ends here (and clears it); none reach the splash toggle underneath.
    lv_obj_add_flag(notify_group, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(notify_group, notify_click_cb, LV_EVENT_CLICKED, NULL);
    lv_obj_add_flag(notify_group, LV_OBJ_FLAG_HIDDEN);

    // The title, wrapped to at most two lines; its height is set per message.
    notify_lbl_title = lv_label_create(notify_group);
    lv_label_set_text(notify_lbl_title, "");
    lv_obj_set_style_text_font(notify_lbl_title, L.title_font, 0);
    lv_obj_set_style_text_color(notify_lbl_title, COL_TEXT, 0);
    lv_obj_set_width(notify_lbl_title, L.content_w);
    lv_label_set_long_mode(notify_lbl_title, LV_LABEL_LONG_DOT);
    lv_obj_align(notify_lbl_title, LV_ALIGN_TOP_LEFT, 0, 0);

    // The text under it, in the approve prompt's type, wrapped; what doesn't
    // fit ends in an ellipsis.
    notify_lbl_text = lv_label_create(notify_group);
    lv_label_set_text(notify_lbl_text, "");
    lv_obj_set_style_text_font(notify_lbl_text, &font_mono_18, 0);
    lv_obj_set_style_text_color(notify_lbl_text, COL_TEXT, 0);
    lv_obj_set_width(notify_lbl_text, L.content_w);
    lv_label_set_long_mode(notify_lbl_text, LV_LABEL_LONG_DOT);
}

bool ui_notify_visible(void) {
    return notify_group && !lv_obj_has_flag(notify_group, LV_OBJ_FLAG_HIDDEN);
}

void ui_notify_show(const char* title, const char* text, int expire_s) {
    if (!notify_group) return;
    char t[NOTIFY_TITLE_MAX + 1];
    char b[NOTIFY_TEXT_MAX + 1];
    copy_text(t, sizeof(t), title, false);
    copy_text(b, sizeof(b), text, true);
    if (!t[0] && !b[0]) {
        ui_notify_clear();
        return;
    }
    if (expire_s <= 0) expire_s = NOTIFY_DEFAULT_S;
    if (expire_s > NOTIFY_MAX_S) expire_s = NOTIFY_MAX_S;

    const int gap     = L.scr_h >= 300 ? 12 : 6;
    const int inner_h = L.scr_h - 2 * L.margin;
    int title_h = 0;
    if (t[0]) {
        lv_point_t sz;
        lv_text_get_size(&sz, t, L.title_font, 0, 0, L.content_w, LV_TEXT_FLAG_NONE);
        const int max_h = NOTIFY_TITLE_LINES * L.title_font->line_height;
        title_h = sz.y < max_h ? sz.y : max_h;
        lv_label_set_text(notify_lbl_title, t);
        lv_obj_set_height(notify_lbl_title, title_h);
        lv_obj_clear_flag(notify_lbl_title, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_add_flag(notify_lbl_title, LV_OBJ_FLAG_HIDDEN);   // text only: it starts at the top
    }
    const int text_y = title_h ? title_h + gap : 0;
    const int text_h = inner_h - text_y;
    lv_label_set_text(notify_lbl_text, b);
    lv_obj_set_height(notify_lbl_text, text_h > font_mono_18.line_height ? text_h : font_mono_18.line_height);
    lv_obj_align(notify_lbl_text, LV_ALIGN_TOP_LEFT, 0, text_y);

    notify_until_ms = lv_tick_get() + (uint32_t)expire_s * 1000;
    lv_obj_clear_flag(notify_group, LV_OBJ_FLAG_HIDDEN);
    // Direct-draw boards paint the creature straight onto the panel, over
    // anything LVGL has there; stop it while the notification is up.
    splash_hide();
    idle_note_activity();   // a dark panel lights up for it
    Serial.printf("notify: show \"%s\" (%d s)\n", t, expire_s);
}

void ui_notify_clear(void) {
    if (!ui_notify_visible()) return;
    lv_obj_add_flag(notify_group, LV_OBJ_FLAG_HIDDEN);
    Serial.println("notify: cleared");
    ui_show_screen(current_screen);   // the splash comes back unless a page or a prompt still covers it
}

static void notify_tick(void) {
    if (!ui_notify_visible()) return;
    if ((int32_t)(lv_tick_get() - notify_until_ms) >= 0) {
        Serial.println("notify: expired");
        ui_notify_clear();
        return;
    }
    idle_note_activity();   // the panel stays lit while it is up
}

// ======== Page ========
// A card the host keeps up while something is going on (a track playing): a
// title, three lines, a progress bar and a creature. The first page type after
// usage. It sits over the screens like an overlay, under a notification and an
// approve prompt. PWR and aux on a page are the host's (main.cpp sends them and
// does nothing here unless no host is listening); a tap leaves it until the host
// sends something other than a new progress for it (see page_click_cb).
//
// Fixed slots, top to bottom: the title, a band for the creature, the three
// lines, the bar along the bottom edge. An empty slot stays empty; nothing moves.
#define PAGE_NAME_MAX   15   // protocol limits, plans/labdaemon.md "Protocol"
#define PAGE_TITLE_MAX  23
#define PAGE_LINE_MAX   40
#define PAGE_ANIM_MAX   23

static lv_obj_t* page_group       = nullptr;
static lv_obj_t* page_lbl_title   = nullptr;
static lv_obj_t* page_lbl_line[3] = {nullptr, nullptr, nullptr};
static lv_obj_t* page_bar         = nullptr;
static lv_obj_t* page_band        = nullptr;   // holds the creature, centred
static lv_obj_t* page_creature    = nullptr;   // the one mini creature (splash.cpp), made on first use
static int       page_creature_px = 0;
static char      page_name[PAGE_NAME_MAX + 1] = "";
static char      page_anim[PAGE_ANIM_MAX + 1] = "";   // what the creature was asked to show; "" = none
static char      page_txt_title[PAGE_TITLE_MAX + 1] = "";       // the texts last set on the labels
static char      page_txt_line[3][PAGE_LINE_MAX + 1] = { "", "", "" };
static bool      page_dismissed = false;   // left by a tap; page_name stays to know its updates

// A tap leaves the page until the host sends it with something other than a new
// progress: a playing track moves the bar every second or two, and each of
// those would otherwise bring the page back and wake the panel. A change of
// text or creature, another page, or the host's clear ends it (ui_page_show,
// ui_page_clear).
static void page_click_cb(lv_event_t* e) {
    (void)e;
    if (!ui_page_visible()) return;
    lv_obj_add_flag(page_group, LV_OBJ_FLAG_HIDDEN);
    page_dismissed = true;
    Serial.printf("page: %s left by a tap\n", page_name);
    ui_show_screen(current_screen);   // the splash comes back unless a notification or a prompt still covers it
}

static void init_page_overlay(lv_obj_t* scr) {
    const int gap       = L.scr_h >= 300 ? 12 : 6;
    const int inner_h   = L.scr_h - 2 * L.margin;
    const lv_font_t* line_font = &font_mono_18;
    const int line_h    = line_font->line_height;
    const int pitch     = line_h + (L.scr_h >= 300 ? 6 : 2);
    const int title_h   = L.title_font->line_height;
    const int bar_y     = inner_h - L.bar_h;
    const int line0_y   = bar_y - gap - line_h - 2 * pitch;
    const int band_y    = title_h + gap;
    const int band_h    = line0_y - gap - band_y;

    page_group = lv_obj_create(scr);
    lv_obj_set_pos(page_group, 0, 0);
    lv_obj_set_size(page_group, L.scr_w, L.scr_h);
    lv_obj_set_style_bg_color(page_group, COL_BG, 0);
    lv_obj_set_style_bg_opa(page_group, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(page_group, 0, 0);
    lv_obj_set_style_radius(page_group, 0, 0);
    lv_obj_set_style_pad_all(page_group, L.margin, 0);
    lv_obj_clear_flag(page_group, LV_OBJ_FLAG_SCROLLABLE);
    // Clickable so a tap ends here (and leaves the page); none reach the splash toggle underneath.
    lv_obj_add_flag(page_group, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(page_group, page_click_cb, LV_EVENT_CLICKED, NULL);
    lv_obj_add_flag(page_group, LV_OBJ_FLAG_HIDDEN);

    // One line; what doesn't fit ends in an ellipsis.
    page_lbl_title = lv_label_create(page_group);
    lv_label_set_text(page_lbl_title, "");
    lv_obj_set_style_text_font(page_lbl_title, L.title_font, 0);
    lv_obj_set_style_text_color(page_lbl_title, COL_TEXT, 0);
    lv_obj_set_size(page_lbl_title, L.content_w, title_h);
    lv_label_set_long_mode(page_lbl_title, LV_LABEL_LONG_DOT);
    lv_obj_align(page_lbl_title, LV_ALIGN_TOP_LEFT, 0, 0);

    // The creature's band. Not clickable, so a tap on the creature still lands on the page.
    page_band = lv_obj_create(page_group);
    lv_obj_set_pos(page_band, 0, band_y);
    lv_obj_set_size(page_band, L.content_w, band_h > 0 ? band_h : 1);
    lv_obj_set_style_bg_opa(page_band, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(page_band, 0, 0);
    lv_obj_set_style_pad_all(page_band, 0, 0);
    lv_obj_clear_flag(page_band, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_clear_flag(page_band, LV_OBJ_FLAG_CLICKABLE);
    page_creature_px = band_h < L.idle_px ? band_h : L.idle_px;

    // Three lines, one line each, the first in full text colour and the other
    // two dimmed; what doesn't fit ends in an ellipsis.
    for (int i = 0; i < 3; i++) {
        page_lbl_line[i] = lv_label_create(page_group);
        lv_label_set_text(page_lbl_line[i], "");
        lv_obj_set_style_text_font(page_lbl_line[i], line_font, 0);
        lv_obj_set_style_text_color(page_lbl_line[i], i == 0 ? COL_TEXT : COL_DIM, 0);
        lv_obj_set_size(page_lbl_line[i], L.content_w, line_h);
        lv_label_set_long_mode(page_lbl_line[i], LV_LABEL_LONG_DOT);
        lv_obj_set_pos(page_lbl_line[i], 0, line0_y + i * pitch);
    }

    // Progress along the bottom edge. Bars take taps by default; this one hands them to the page.
    page_bar = make_bar(page_group, 0, bar_y, L.content_w, L.bar_h);
    lv_obj_set_style_bg_color(page_bar, COL_ACCENT, LV_PART_INDICATOR);
    lv_obj_clear_flag(page_bar, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_flag(page_bar, LV_OBJ_FLAG_HIDDEN);
}

bool ui_page_visible(void) {
    return page_group && !lv_obj_has_flag(page_group, LV_OBJ_FLAG_HIDDEN);
}

// Point the page's creature at `anim` ("" = none). splash_mini_create is one
// instance for the program's life: made here the first time a page asks for a
// creature, re-pointed with splash_mini_set_anim after that, never made twice.
static void page_set_creature(const char* anim) {
    if (strcmp(anim, page_anim) == 0) return;   // unchanged, including none to none
    strlcpy(page_anim, anim, sizeof(page_anim));
    lv_obj_t* c = nullptr;
    if (*anim && page_creature_px > 0) {
        if (!page_creature)                  c = page_creature = splash_mini_create(page_band, anim, page_creature_px);
        else if (splash_mini_set_anim(anim)) c = page_creature;
        if (!c) Serial.printf("page: no creature '%s'\n", anim);
    }
    if (c) {
        lv_obj_align(c, LV_ALIGN_CENTER, 0, 0);   // its edge follows the animation's lattice
        lv_obj_clear_flag(c, LV_OBJ_FLAG_HIDDEN);
    } else if (page_creature) {
        lv_obj_add_flag(page_creature, LV_OBJ_FLAG_HIDDEN);
    }
}

void ui_page_show(const char* pg, const char* title, const char* l1, const char* l2,
                  const char* l3, int pp, const char* anim) {
    if (!page_group || !pg || !*pg) return;
    char name[PAGE_NAME_MAX + 1];
    char t[PAGE_TITLE_MAX + 1];
    char lines[3][PAGE_LINE_MAX + 1];
    char a[PAGE_ANIM_MAX + 1];
    const char* src[3] = { l1, l2, l3 };
    copy_text(name, sizeof(name), pg, false);
    copy_text(t, sizeof(t), title, false);
    for (int i = 0; i < 3; i++) copy_text(lines[i], sizeof(lines[i]), src[i], false);
    copy_text(a, sizeof(a), anim, false);

    const bool same_page = strcmp(name, page_name) == 0;
    if (page_dismissed) {
        // Left by a tap (page_click_cb): a send that moves only the progress stays out.
        if (same_page && strcmp(t, page_txt_title) == 0 && strcmp(a, page_anim) == 0 &&
            strcmp(lines[0], page_txt_line[0]) == 0 && strcmp(lines[1], page_txt_line[1]) == 0 &&
            strcmp(lines[2], page_txt_line[2]) == 0) {
            return;
        }
        page_dismissed = false;
    }
    // A new page (or one coming back) is shown whole; the same page again is an
    // update in place: no wake, no bar sweep.
    const bool appearing = !ui_page_visible() || !same_page;
    strlcpy(page_name, name, sizeof(page_name));

    set_text_if_changed(page_lbl_title, page_txt_title, sizeof(page_txt_title), t);
    for (int i = 0; i < 3; i++) {
        set_text_if_changed(page_lbl_line[i], page_txt_line[i], sizeof(page_txt_line[i]), lines[i]);
    }

    if (pp < 0) {
        lv_obj_add_flag(page_bar, LV_OBJ_FLAG_HIDDEN);
    } else {
        const bool bar_hidden = lv_obj_has_flag(page_bar, LV_OBJ_FLAG_HIDDEN);
        lv_bar_set_value(page_bar, pp > 100 ? 100 : pp,
                         (appearing || bar_hidden) ? LV_ANIM_OFF : LV_ANIM_ON);
        lv_obj_clear_flag(page_bar, LV_OBJ_FLAG_HIDDEN);
    }

    page_set_creature(a);

    if (appearing) {
        lv_obj_clear_flag(page_group, LV_OBJ_FLAG_HIDDEN);
        // Direct-draw boards paint the creature straight onto the panel, over
        // anything LVGL has there; stop it while the page is up.
        splash_hide();
        idle_note_activity();   // a dark panel lights up for a new page, never for its updates
        Serial.printf("page: show %s\n", page_name);
    }
}

void ui_page_clear(void) {
    page_dismissed = false;   // a clear ends a tap's leave too: the next send shows the page
    if (!ui_page_visible()) {
        page_name[0] = '\0';
        return;
    }
    lv_obj_add_flag(page_group, LV_OBJ_FLAG_HIDDEN);
    Serial.printf("page: %s cleared\n", page_name);
    page_name[0] = '\0';
    ui_show_screen(current_screen);   // the splash comes back unless a notification or a prompt still covers it
}

static void init_battery_icons(void) {
    if (L.small_icons) {
        init_icon_dsc_rgb565a8(&battery_dscs[0], ICON_BATTERY_SMALL_W, ICON_BATTERY_SMALL_H, icon_battery_small_data);
        init_icon_dsc_rgb565a8(&battery_dscs[1], ICON_BATTERY_LOW_SMALL_W, ICON_BATTERY_LOW_SMALL_H, icon_battery_low_small_data);
        init_icon_dsc_rgb565a8(&battery_dscs[2], ICON_BATTERY_MEDIUM_SMALL_W, ICON_BATTERY_MEDIUM_SMALL_H, icon_battery_medium_small_data);
        init_icon_dsc_rgb565a8(&battery_dscs[3], ICON_BATTERY_FULL_SMALL_W, ICON_BATTERY_FULL_SMALL_H, icon_battery_full_small_data);
        init_icon_dsc_rgb565a8(&battery_dscs[4], ICON_BATTERY_CHARGING_SMALL_W, ICON_BATTERY_CHARGING_SMALL_H, icon_battery_charging_small_data);
        return;
    }
    init_icon_dsc_rgb565a8(&battery_dscs[0], ICON_BATTERY_W, ICON_BATTERY_H, icon_battery_data);
    init_icon_dsc_rgb565a8(&battery_dscs[1], ICON_BATTERY_LOW_W, ICON_BATTERY_LOW_H, icon_battery_low_data);
    init_icon_dsc_rgb565a8(&battery_dscs[2], ICON_BATTERY_MEDIUM_W, ICON_BATTERY_MEDIUM_H, icon_battery_medium_data);
    init_icon_dsc_rgb565a8(&battery_dscs[3], ICON_BATTERY_FULL_W, ICON_BATTERY_FULL_H, icon_battery_full_data);
    init_icon_dsc_rgb565a8(&battery_dscs[4], ICON_BATTERY_CHARGING_W, ICON_BATTERY_CHARGING_H, icon_battery_charging_data);
}

// ======== Usage Screen ========

static lv_obj_t* make_usage_panel(lv_obj_t* parent, int y, const char* pill_text,
                                  lv_obj_t** out_pct, lv_obj_t** out_pill,
                                  lv_obj_t** out_bar, lv_obj_t** out_reset) {
    lv_obj_t* panel = make_panel(parent, L.margin, y, L.content_w, L.usage_panel_h);

    *out_pct = lv_label_create(panel);
    lv_label_set_text(*out_pct, "---%");
    lv_obj_set_style_text_font(*out_pct, L.pct_font, 0);
    lv_obj_set_style_text_color(*out_pct, COL_TEXT, 0);
    lv_obj_set_pos(*out_pct, 0, 0);

    *out_pill = make_pill(panel, pill_text);
    lv_obj_align(*out_pill, LV_ALIGN_TOP_RIGHT, 0, 1);

    *out_bar = make_bar(panel, 0, L.usage_bar_y,
                        L.content_w - 2 * L.panel_pad_x, L.bar_h);

    *out_reset = lv_label_create(panel);
    lv_label_set_text(*out_reset, "---");
    lv_obj_set_style_text_font(*out_reset, L.reset_font, 0);
    lv_obj_set_style_text_color(*out_reset, COL_DIM, 0);
    lv_obj_set_pos(*out_reset, 0, L.usage_reset_y);

    return panel;
}

// Pairing hint — shown when disconnected so the screen isn't empty and the
// user knows how to (re)pair. Wording matches the 3-second release gesture.
static void build_pair_group(lv_obj_t* parent) {
    pair_group = lv_obj_create(parent);
    lv_obj_set_size(pair_group, L.scr_w, L.scr_h - L.content_y);
    lv_obj_set_pos(pair_group, 0, L.content_y);
    lv_obj_set_style_bg_opa(pair_group, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(pair_group, 0, 0);
    lv_obj_set_style_pad_all(pair_group, 0, 0);
    lv_obj_clear_flag(pair_group, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(pair_group, LV_OBJ_FLAG_EVENT_BUBBLE);

    lv_obj_t* l1 = lv_label_create(pair_group);
    lv_label_set_text(l1, "To pair");
    lv_obj_set_style_text_font(l1, L.bt_status_font, 0);
    lv_obj_set_style_text_color(l1, COL_TEXT, 0);
    lv_obj_align(l1, LV_ALIGN_TOP_MID, 0, L.pair_y1);

    lv_obj_t* l2 = lv_label_create(pair_group);
    lv_label_set_text(l2, "hold the power button");
    lv_obj_set_style_text_font(l2, L.bt_device_font, 0);
    lv_obj_set_style_text_color(l2, COL_DIM, 0);
    lv_obj_align(l2, LV_ALIGN_TOP_MID, 0, L.pair_y2);

    lv_obj_t* l3 = lv_label_create(pair_group);
    lv_label_set_text(l3, "for 3 seconds, then release");
    lv_obj_set_style_text_font(l3, L.bt_device_font, 0);
    lv_obj_set_style_text_color(l3, COL_DIM, 0);
    lv_obj_align(l3, LV_ALIGN_TOP_MID, 0, L.pair_y3);

    lv_obj_add_flag(pair_group, LV_OBJ_FLAG_HIDDEN);  // ui_update_ble_status decides
}

// Idle "Zzz" screen — shown when the host is connected but no usage update has
// landed recently (token expired, daemon down, host asleep…). Full-screen, like
// the pairing hint, so we never render hours-old numbers as if they were live.
static void build_idle_group(lv_obj_t* parent) {
    idle_group = lv_obj_create(parent);
    lv_obj_set_size(idle_group, L.scr_w, L.scr_h - L.content_y);
    lv_obj_set_pos(idle_group, 0, L.content_y);
    lv_obj_set_style_bg_opa(idle_group, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(idle_group, 0, 0);
    lv_obj_set_style_pad_all(idle_group, 0, 0);
    lv_obj_clear_flag(idle_group, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(idle_group, LV_OBJ_FLAG_EVENT_BUBBLE);

    // A shrunk-down sleeping creature (reused claudepix "expression sleep" art)
    // sits between the header and the status line; the animated "Listening…"
    // status line carries the words, so no extra text is needed here.
    // Note: the table no longer has "expression sleep", so this returns NULL and
    // the one mini creature (splash_mini_create) is left to the page. Naming a
    // live animation here would make the idle screen its owner, and the page
    // would then have to borrow it and hand it back.
    lv_obj_t* creature = splash_mini_create(idle_group, "expression sleep", L.idle_px);
    if (creature) lv_obj_align(creature, LV_ALIGN_CENTER, 0, -20);

    lv_obj_add_flag(idle_group, LV_OBJ_FLAG_HIDDEN);  // update_view_state decides
}

static void init_usage_screen(lv_obj_t* scr) {
    usage_container = lv_obj_create(scr);
    lv_obj_set_size(usage_container, L.scr_w, L.scr_h);
    lv_obj_set_pos(usage_container, 0, 0);
    lv_obj_set_style_bg_opa(usage_container, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(usage_container, 0, 0);
    lv_obj_set_style_pad_all(usage_container, 0, 0);
    lv_obj_clear_flag(usage_container, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_event_cb(usage_container, global_click_cb, LV_EVENT_CLICKED, NULL);

    lbl_title = lv_label_create(usage_container);
    lv_label_set_text(lbl_title, "Usage");
    lv_obj_set_style_text_font(lbl_title, L.title_font, 0);
    lv_obj_set_style_text_color(lbl_title, COL_TEXT, 0);
    // The nudge balances the corner logo on the left; smaller on small
    // screens where the logo is 40px and the battery icon sits closer.
    lv_obj_align(lbl_title, LV_ALIGN_TOP_MID, L.title_nudge, L.title_y);

    // Usage panels (shown when connected) live in a transparent full-size group
    // so they can be toggled against the pairing hint as one unit.
    usage_group = lv_obj_create(usage_container);
    lv_obj_set_size(usage_group, L.scr_w, L.scr_h);
    lv_obj_set_pos(usage_group, 0, 0);
    lv_obj_set_style_bg_opa(usage_group, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(usage_group, 0, 0);
    lv_obj_set_style_pad_all(usage_group, 0, 0);
    lv_obj_clear_flag(usage_group, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(usage_group, LV_OBJ_FLAG_EVENT_BUBBLE);

    panel_session = make_usage_panel(usage_group, L.content_y, "Current",
                     &lbl_session_pct, &lbl_session_label,
                     &bar_session, &lbl_session_reset);

    // Enterprise-only overlays inside panel_session — hidden until enterprise data arrives
    lbl_session_pct_sym = lv_label_create(panel_session);
    lv_label_set_text(lbl_session_pct_sym, "%");
    lv_obj_set_style_text_font(lbl_session_pct_sym, L.reset_font, 0);
    lv_obj_set_style_text_color(lbl_session_pct_sym, COL_TEXT, 0);
    lv_obj_add_flag(lbl_session_pct_sym, LV_OBJ_FLAG_HIDDEN);

    lbl_spending_desc = lv_label_create(panel_session);
    lv_label_set_text(lbl_spending_desc, "of your monthly budget");
    lv_obj_set_style_text_font(lbl_spending_desc, L.reset_font, 0);
    lv_obj_set_style_text_color(lbl_spending_desc, COL_DIM, 0);
    lv_obj_set_pos(lbl_spending_desc, 0, L.usage_reset_y);
    lv_obj_add_flag(lbl_spending_desc, LV_OBJ_FLAG_HIDDEN);

    lbl_spending_status = lv_label_create(panel_session);
    lv_label_set_text(lbl_spending_status, "");
    lv_obj_set_style_text_font(lbl_spending_status, L.pace_font, 0);
    lv_obj_set_pos(lbl_spending_status, 0, L.usage_reset_y + 20);
    lv_obj_add_flag(lbl_spending_status, LV_OBJ_FLAG_HIDDEN);

    // Agents tag — hidden until the host reports agents at work (ui_update).
    if (L.agents_font) {
        lbl_agents = lv_label_create(panel_session);
        lv_label_set_text(lbl_agents, "");
        lv_obj_set_style_text_font(lbl_agents, L.agents_font, 0);
        lv_obj_set_style_text_color(lbl_agents, COL_ACCENT, 0);
        lv_obj_align(lbl_agents, LV_ALIGN_TOP_RIGHT, 0, L.agents_y);
        lv_obj_add_flag(lbl_agents, LV_OBJ_FLAG_HIDDEN);
    }

    panel_weekly = make_usage_panel(usage_group,
                     L.content_y + L.usage_panel_h + L.usage_panel_gap, "Weekly",
                     &lbl_weekly_pct, &lbl_weekly_label,
                     &bar_weekly, &lbl_weekly_reset);
    // Recolor enabled so enterprise period box can color pace and reset separately
    lv_label_set_recolor(lbl_weekly_reset, true);

    build_pair_group(usage_container);
    build_idle_group(usage_container);

    // Status line — always visible on the usage view. Driven by ui_tick_anim().
    lbl_anim = lv_label_create(usage_container);
    lv_label_set_text(lbl_anim, "");
    lv_obj_set_style_text_font(lbl_anim, L.anim_font, 0);
    lv_obj_set_style_text_color(lbl_anim, COL_ACCENT, 0);
    lv_obj_align(lbl_anim, LV_ALIGN_BOTTOM_MID, 0, L.anim_y);
}

// ======== Public API ========

void ui_init(void) {
    compute_layout(board_caps());

    lv_obj_t* scr = lv_screen_active();
    lv_obj_set_style_bg_color(scr, COL_BG, 0);
    lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);

    if (L.small_icons) init_icon_dsc_rgb565a8(&logo_dsc, LOGO_SMALL_WIDTH, LOGO_SMALL_HEIGHT, logo_small_data);
    else               init_icon_dsc_rgb565a8(&logo_dsc, LOGO_WIDTH, LOGO_HEIGHT, logo_data);
    init_battery_icons();

    init_usage_screen(scr);
    splash_init(scr);

    if (splash_get_root()) {
        lv_obj_add_event_cb(splash_get_root(), global_click_cb, LV_EVENT_CLICKED, NULL);
    }

#ifdef BOARD_HAS_PSRAM
    // Agent-count badge in the splash's top-left corner. PSRAM boards draw the
    // creature through an LVGL canvas, so a label on top of it composes for
    // free (labels aren't clickable, the splash click still lands). PSRAM-less
    // boards paint the creature straight onto the panel and would wipe the
    // badge, so they go without.
    if (splash_get_root()) {
        splash_badge = make_pill(splash_get_root(), "");
        lv_obj_set_style_text_font(splash_badge, &font_mono_18, 0);
        lv_obj_set_style_text_color(splash_badge, COL_ACCENT, 0);
        lv_obj_set_pos(splash_badge, L.margin, L.margin);
        lv_obj_add_flag(splash_badge, LV_OBJ_FLAG_HIDDEN);
    }
#endif

    logo_img = lv_image_create(scr);
    lv_image_set_src(logo_img, &logo_dsc);
    lv_obj_set_pos(logo_img, L.margin, L.logo_y);

    battery_img = lv_image_create(scr);
    lv_image_set_src(battery_img, &battery_dscs[0]);
    lv_obj_set_pos(battery_img, L.scr_w - L.batt_w - L.margin, L.batt_y);
    // Boards without battery telemetry never show the indicator (per the HAL
    // contract; previously every board drew the empty-battery glyph).
    if (!board_caps().has_battery) {
        lv_obj_del(battery_img);
        battery_img = nullptr;
    }

    // Above the screens, below the charge overlay. Created bottom to top: a page,
    // then a notification over it, then an approve prompt over everything.
    init_page_overlay(scr);
    init_notify_overlay(scr);
    init_approve_overlay(scr);

    // Last, so the charge overlay covers everything else when it plays.
    charge_anim_init(scr);
}

void ui_update(const UsageData* data) {
    if (!data->valid) return;
    last_data_ms = lv_tick_get();   // a valid usage update just landed → dot goes green
    data_received = true;

    if (data->clock_epoch > 0) {    // daemon supplied wall-clock time → drive the title clock
        clock_base_epoch = data->clock_epoch;
        clock_base_ms = last_data_ms;
        clock_fmt = data->clock_fmt;
    } else if (clock_base_epoch != 0) {   // clock turned off daemon-side → revert title to "Usage"
        clock_base_epoch = 0;
        clock_last_min = -1;
        lv_label_set_text(lbl_title, "Usage");
    }

    int s_pct = (int)(data->session_pct + 0.5f);

    if (data->enterprise) {
        // Spending box: big number-only label + small "%" symbol + desc + pace
        lv_obj_set_style_text_font(lbl_session_pct, L.ent_pct_font, 0);
        lv_label_set_text(lbl_session_label, "Spending");
        lv_obj_add_flag(lbl_session_reset, LV_OBJ_FLAG_HIDDEN);
        lv_obj_clear_flag(lbl_session_pct_sym, LV_OBJ_FLAG_HIDDEN);
        lv_obj_clear_flag(lbl_spending_desc,   LV_OBJ_FLAG_HIDDEN);
        lv_obj_add_flag(lbl_spending_status,   LV_OBJ_FLAG_HIDDEN);
        if (panel_weekly) lv_obj_clear_flag(panel_weekly, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_set_style_text_font(lbl_session_pct, L.pct_font, 0);
        lv_label_set_text(lbl_session_label, "Current");
        lv_obj_clear_flag(lbl_session_reset, LV_OBJ_FLAG_HIDDEN);
        lv_obj_add_flag(lbl_session_pct_sym, LV_OBJ_FLAG_HIDDEN);
        lv_obj_add_flag(lbl_spending_desc,   LV_OBJ_FLAG_HIDDEN);
        lv_obj_add_flag(lbl_spending_status, LV_OBJ_FLAG_HIDDEN);
        if (panel_weekly) lv_obj_clear_flag(panel_weekly, LV_OBJ_FLAG_HIDDEN);
    }

    char buf[48];

    // Pace vars used in both enterprise blocks below
    const char* pace_text = "Under pace";
    lv_color_t  pace_color = COL_GREEN;
    const char* pace_hex   = "788c5d";   // matches THEME_GREEN
    if (data->session_pct > (float)data->time_pct + 15.0f) {
        pace_text = "Over pace";  pace_color = COL_RED;   pace_hex = "c0392b";
    } else if (data->session_pct > (float)data->time_pct - 15.0f) {
        pace_text = "On pace";    pace_color = COL_AMBER; pace_hex = "d97757";
    }

    if (data->enterprise) {
        lv_label_set_text_fmt(lbl_session_pct, "%d", s_pct);
        lv_obj_align_to(lbl_session_pct_sym, lbl_session_pct,
                        LV_ALIGN_OUT_RIGHT_TOP, 4, 12);
    } else {
        lv_label_set_text_fmt(lbl_session_pct, "%d%%", s_pct);
        format_reset_time(data->session_reset_mins, buf, sizeof(buf));
        lv_label_set_text(lbl_session_reset, buf);
    }

    lv_bar_set_value(bar_session, s_pct, LV_ANIM_ON);
    lv_obj_set_style_bg_color(bar_session, pct_color(data->session_pct), LV_PART_INDICATOR);

    if (data->enterprise) {
        // Period box: time % + dynamic pace color + "Resets <date>" label
        lv_label_set_text(lbl_weekly_label, "Period");
        lv_label_set_text_fmt(lbl_weekly_pct, "%d%%", data->time_pct);
        lv_bar_set_value(bar_weekly, data->time_pct, LV_ANIM_ON);
        lv_color_t bar_pace = (data->session_pct <= (float)data->time_pct) ? COL_GREEN :
                              (data->session_pct <= (float)data->time_pct + 15.0f) ? COL_AMBER :
                              COL_RED;
        lv_obj_set_style_bg_color(bar_weekly, bar_pace, LV_PART_INDICATOR);
        snprintf(buf, sizeof(buf), "#%s %s# - #faf9f5 Resets %s#",
                 pace_hex, pace_text, data->reset_date);
        lv_label_set_text(lbl_weekly_reset, buf);
    } else {
        int w_pct = (int)(data->weekly_pct + 0.5f);
        lv_label_set_text_fmt(lbl_weekly_pct, "%d%%", w_pct);
        lv_bar_set_value(bar_weekly, w_pct, LV_ANIM_ON);
        lv_obj_set_style_bg_color(bar_weekly, pct_color(data->weekly_pct), LV_PART_INDICATOR);
        format_reset_time(data->weekly_reset_mins, buf, sizeof(buf));
        lv_label_set_text(lbl_weekly_reset, buf);
    }

    // Agents the host reports working: "N AGENTS" tag + splash badge, both only
    // while n > 0. Capped at two digits so the tag keeps clear of the reset text.
    int agents = data->agents < 0 ? 0 : data->agents > 99 ? 99 : data->agents;
    if (lbl_agents) {
        // Enterprise fills the reset row with the longer spending line — no room.
        if (agents > 0 && !data->enterprise) {
            lv_label_set_text_fmt(lbl_agents, "%d AGENT%s", agents, agents == 1 ? "" : "S");
            lv_obj_clear_flag(lbl_agents, LV_OBJ_FLAG_HIDDEN);
        } else {
            lv_obj_add_flag(lbl_agents, LV_OBJ_FLAG_HIDDEN);
        }
    }
    if (splash_badge) {
        if (agents > 0) {
            lv_label_set_text_fmt(splash_badge, "%d", agents);
            lv_obj_clear_flag(splash_badge, LV_OBJ_FLAG_HIDDEN);
        } else {
            lv_obj_add_flag(splash_badge, LV_OBJ_FLAG_HIDDEN);
        }
    }
}

// Pick the usage-view sub-screen: pairing hint (BLE down), the idle "Zzz" screen
// (connected but data has gone stale), or the live usage panels. Only re-lays-out
// on an actual change. The animated status line stays visible everywhere — it
// reads "Listening…" on the idle screen, keeping it alive rather than frozen.
static void update_view_state(void) {
    if (!usage_group || !pair_group || !idle_group) return;
    int v;
    if (!s_ble_connected) {
        v = 0;  // pairing hint
    } else if (data_received && (lv_tick_get() - last_data_ms) < DATA_FRESH_MS) {
        v = 2;  // live usage
    } else {
        v = 1;  // idle / Zzz
    }
    if (v == view_state) return;
    view_state = v;
    lv_obj_add_flag(pair_group, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(idle_group, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(usage_group, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(v == 0 ? pair_group : v == 1 ? idle_group : usage_group,
                      LV_OBJ_FLAG_HIDDEN);
}

void ui_tick_anim(void) {
    approve_tick();
    notify_tick();
    // The page's creature moves only while the page is on top; under a
    // notification or a prompt it would redraw for nothing.
    if (ui_page_visible() && !ui_notify_visible() && !ui_approve_visible()) splash_mini_tick();

    // The usage tag goes stale with its panels (idle / pairing views); the
    // splash badge has no such view behind it, so drop it once the host goes
    // quiet — a count from a machine that slept mid-run isn't agents working.
    if (splash_badge && !lv_obj_has_flag(splash_badge, LV_OBJ_FLAG_HIDDEN) &&
        (!s_ble_connected || lv_tick_get() - last_data_ms >= DATA_FRESH_MS)) {
        lv_obj_add_flag(splash_badge, LV_OBJ_FLAG_HIDDEN);
    }

    if (current_screen != SCREEN_USAGE) return;
    update_view_state();
    // The sleeping creature on the idle screen, were it there (build_idle_group).
    // Not while a page is up: the one mini creature is then the page's, ticked
    // above only while nothing covers it.
    if (view_state == 1 && !ui_page_visible()) splash_mini_tick();

    uint32_t now = lv_tick_get();

    // Title clock: once the daemon has sent wall-clock time, replace "Usage" with
    // the live time, advanced locally so it ticks every minute between payloads.
    if (clock_base_epoch > 0) {
        time_t cur = (time_t)(clock_base_epoch + (now - clock_base_ms) / 1000);
        struct tm tmv;
        gmtime_r(&cur, &tmv);   // epoch is already local wall-clock → gmtime keeps it as-is
        if (tmv.tm_min != clock_last_min) {   // only rewrite the title when the minute changes
            clock_last_min = tmv.tm_min;
            char tbuf[12];
            if (clock_fmt == 12) {
                int h12 = tmv.tm_hour % 12;
                if (h12 == 0) h12 = 12;
                snprintf(tbuf, sizeof(tbuf), "%d:%02d %s", h12, tmv.tm_min,
                         tmv.tm_hour < 12 ? "AM" : "PM");
            } else {
                snprintf(tbuf, sizeof(tbuf), "%02d:%02d", tmv.tm_hour, tmv.tm_min);
            }
            lv_label_set_text(lbl_title, tbuf);
        }
    }

    if (now - anim_msg_start >= ANIM_MSG_MS) {
        anim_msg_idx = (anim_msg_idx + 1) % ANIM_MSG_COUNT;
        anim_msg_start = now;
    }

    if (now - anim_last_ms < spinner_ms[anim_spinner_idx]) return;
    anim_last_ms = now;
    anim_phase = (anim_phase + 1) % SPINNER_PHASES;
    anim_spinner_idx = (anim_phase < SPINNER_COUNT) ? anim_phase
                                                    : (SPINNER_PHASES - anim_phase);

    // Status text by priority. Whimsical messages only when connected & settled.
    const char* text;
    if (!s_ble_connected) {
        text = "Waiting";              // advertising / waiting for a host connection
    } else if (view_state == 1) {      // idle — alternate so it reads as alive AND data-less
        text = (anim_msg_idx & 1) ? "No data" : "Listening";
    } else if (now - connected_at_ms < 5000) {
        text = "Connected";
    } else {
        text = anim_messages[anim_msg_idx];
    }

    // All states share the whimsical style: "<glyph> <Title-case word>…"
    static char buf[80];
    snprintf(buf, sizeof(buf), "%s %s\xE2\x80\xA6",
             spinner_frames[anim_spinner_idx], text);
    lv_label_set_text(lbl_anim, buf);
}

bool ui_local_time(int* hour, int* yday) {
    if (clock_base_epoch <= 0) return false;
    time_t cur = (time_t)(clock_base_epoch + (lv_tick_get() - clock_base_ms) / 1000);
    struct tm tmv;
    gmtime_r(&cur, &tmv);   // epoch is already local wall-clock
    if (hour) *hour = tmv.tm_hour;
    if (yday) *yday = tmv.tm_yday;
    return true;
}

static screen_t prev_non_splash_screen = SCREEN_USAGE;
static void apply_battery_visibility(void) {
    if (!battery_img) return;
    if (current_screen == SCREEN_SPLASH) lv_obj_add_flag(battery_img, LV_OBJ_FLAG_HIDDEN);
    else                                  lv_obj_clear_flag(battery_img, LV_OBJ_FLAG_HIDDEN);
}

static void global_click_cb(lv_event_t* e) {
    (void)e;
    if (current_screen == SCREEN_SPLASH) ui_show_screen(prev_non_splash_screen);
    else                                  ui_show_screen(SCREEN_SPLASH);
}

void ui_show_screen(screen_t screen) {
    lv_obj_add_flag(usage_container, LV_OBJ_FLAG_HIDDEN);
    splash_hide();

    switch (screen) {
    // While a prompt, a notification or a page is up the splash stays hidden
    // (see ui_approve_show); each one's clear re-runs this to bring it back.
    case SCREEN_SPLASH:
        if (!ui_approve_visible() && !ui_notify_visible() && !ui_page_visible()) splash_show();
        break;
    case SCREEN_USAGE:   lv_obj_clear_flag(usage_container, LV_OBJ_FLAG_HIDDEN); break;
    default: break;
    }

    if (logo_img) {
        if (screen == SCREEN_SPLASH) lv_obj_add_flag(logo_img, LV_OBJ_FLAG_HIDDEN);
        else                          lv_obj_clear_flag(logo_img, LV_OBJ_FLAG_HIDDEN);
    }

    if (screen != SCREEN_SPLASH) prev_non_splash_screen = screen;
    current_screen = screen;
    apply_battery_visibility();
}

void ui_toggle_splash(void) {
    if (current_screen == SCREEN_SPLASH) ui_show_screen(prev_non_splash_screen);
    else                                  ui_show_screen(SCREEN_SPLASH);
}

screen_t ui_get_current_screen(void) {
    return current_screen;
}

const char* ui_screen_name(void) {
    if (ui_approve_visible()) return "approve";
    if (ui_notify_visible())  return "notify";
    if (ui_page_visible())    return "page";
    return current_screen == SCREEN_SPLASH ? "splash" : "usage";
}

void ui_update_ble_status(ble_state_t state, const char* name, const char* mac) {
    (void)name; (void)mac;
    bool was_connected = s_ble_connected;
    s_ble_connected = (state == BLE_STATE_CONNECTED);

    if (s_ble_connected && !was_connected) connected_at_ms = lv_tick_get();
    // pair / idle / usage — picked from connection + data freshness.
    update_view_state();
}

void ui_update_battery(int percent, bool charging) {
    if (!battery_img) return;
    int idx;
    if (charging) {
        idx = 4;
    } else if (percent < 0) {
        idx = 0;
    } else if (percent <= 10) {
        idx = 0;
    } else if (percent <= 35) {
        idx = 1;
    } else if (percent <= 75) {
        idx = 2;
    } else {
        idx = 3;
    }
    lv_image_set_src(battery_img, &battery_dscs[idx]);
    apply_battery_visibility();
}
