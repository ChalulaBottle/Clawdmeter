#include "ui.h"
#include "splash.h"
#include "charge_anim.h"
#include "idle.h"
#include <lvgl.h>
#include <time.h>
#include <esp_random.h>
#include <Preferences.h>
#include "logo.h"
#include "icons.h"
#include "hal/board_caps.h"
#ifdef FEATURE_PICTURE
#include "art.h"
#endif

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
// approve prompt, and is the third stop of the screen cycle (ui_cycle_screens).
// Left with the cycle or a tap it goes out of sight, still live (page_hidden),
// until the next cycle or another page. Its buttons are main.cpp's.
//
// Fixed slots, top to bottom: the title, a band for the creature, the three
// lines, the bar along the bottom edge. An empty slot stays empty; nothing moves.
// Boards built with FEATURE_PICTURE have a second layout for a page with album
// art (pi): the square beside the title and the lines, the band below them
// (page_art_init). A page that dances (pa "dance", the music card while a track
// plays) takes the dance view (below), which can make the dancer most of the
// panel or all of it.
#define PAGE_NAME_MAX   15   // protocol limits, plans/labdaemon.md "Protocol"
#define PAGE_TITLE_MAX  23
#define PAGE_LINE_MAX   40
#define PAGE_ANIM_MAX   23

static lv_obj_t* page_group       = nullptr;
static lv_obj_t* page_lbl_title   = nullptr;
static lv_obj_t* page_lbl_line[3] = {nullptr, nullptr, nullptr};
static lv_obj_t* page_bar         = nullptr;
static lv_obj_t* page_band        = nullptr;   // holds the creature, centred
static lv_obj_t* page_strip       = nullptr;   // under the two lines in the full view
static lv_obj_t* page_creature    = nullptr;   // the one mini creature (splash.cpp), made on first use
static int       page_creature_px = 0;
static bool      page_creature_on = false;     // a creature is on the band
static char      page_name[PAGE_NAME_MAX + 1] = "";
static char      page_anim[PAGE_ANIM_MAX + 1] = "";   // what the creature was asked to show; "" = none
static char      page_txt_title[PAGE_TITLE_MAX + 1] = "";       // the texts last set on the labels
static char      page_txt_line[3][PAGE_LINE_MAX + 1] = { "", "", "" };
static bool      page_hidden = false;   // left by the cycle or a tap; page_name stays, the page is live

// The dance view (operator, 2026-10-03: "a close up that almost overtakes the
// screen imitating a music video view"): how big the dance floor draws its
// dancer (pa "dance": the music card while a track plays).
//   card   the card as it always was, the creature in its band between the
//          title and the three lines
//   large  the creature as big as the panel allows over two compact lines, the
//          title in the lines' type and p1 (the track and the artist on the
//          music card), and a bar half the card's height; p2 and p3 go, album
//          art turns into a thumbnail beside the two lines
//   full   a music video: the creature over the whole panel, the same two lines
//          and a thin bar on a strip along the bottom, drawn over the creature
//          at the overlay opacity (0 to 100)
// Every other page keeps the card in every view, all three lines in sight: one
// with a fixed creature (the music card while paused, which says so in p2, and
// every other controller's card) or none. Both settings live in NVS (namespace
// clawdmeter, keys dview and dvo), written only when they change.
// Large and full draw the mini creature at up to the panel's size, 460,800 B at
// 480 px, which only PSRAM holds: boards without it keep the card and refuse
// the other two (cmd.h, "no"). No blur: blurring the dancer is a filter pass
// over every px it redraws, too much for this ESP32 beside an RGB panel that
// scans out of the same PSRAM; the strip's opacity is the see-through option.
enum dance_view_t : uint8_t { DVIEW_CARD, DVIEW_LARGE, DVIEW_FULL, DVIEW_COUNT };
static const char* const DVIEW_NAME[DVIEW_COUNT] = { "card", "large", "full" };
#define DVIEW_OPA_DEFAULT 55
#ifdef BOARD_HAS_PSRAM
static bool    dview_big = true;     // large and full can be drawn (false once their buffer is refused)
#else
static bool    dview_big = false;
#endif
static uint8_t dview     = DVIEW_LARGE;          // the setting
static uint8_t dview_opa = DVIEW_OPA_DEFAULT;    // the strip's opacity, percent

// Where the card's parts sit in one layout, inside the page's margin.
struct PageGeom {
    int16_t text_x, line0_y;                  // the title and the lines, a pitch apart
    int16_t band_x, band_y, band_w, band_h;   // the creature's band; the creature is centred in it
    int16_t bar_y, bar_h;
};
#define PAGE_GEOM_ART DVIEW_COUNT             // the card with album art (FEATURE_PICTURE)
static PageGeom page_geom[DVIEW_COUNT + 1];   // card, large, full, the card with art
static int16_t  page_px[DVIEW_COUNT];         // the creature's size in each view
static int16_t  page_pitch = 0;               // line to line
static int16_t  page_gap   = 0;
static int16_t  page_thumb = 0;               // the album art's side beside the two lines (large, full)
static bool     page_long  = false;           // this touch has been a long press
static uint8_t  page_view  = DVIEW_CARD;      // the view page_layout last laid the page out in

static void page_layout(void);

// The view the setting gives on this board: the card where the big two cannot be drawn.
static uint8_t dview_now(void) {
    return dview_big ? dview : DVIEW_CARD;
}

// True while the page dances: pa "dance" with a dancer on the band, the one
// creature the dance view sizes. Read from page_anim, not dance_on:
// page_set_creature sets dance_on only after dance_switch has placed the first
// dancer, and placing it lays the page out.
static bool page_dancing(void) {
    return page_creature_on && strcmp(page_anim, "dance") == 0;
}

// The view the page wants now: the setting while it dances, the card otherwise.
static uint8_t page_view_wanted(void) {
    return page_dancing() ? dview_now() : DVIEW_CARD;
}

static void set_hidden(lv_obj_t* o, bool hidden) {
    if (hidden) lv_obj_add_flag(o, LV_OBJ_FLAG_HIDDEN);
    else        lv_obj_clear_flag(o, LV_OBJ_FLAG_HIDDEN);
}

// A setting in NVS, written only when it changed (a host slider sends many).
static void dview_store(const char* key, uint8_t v) {
    Preferences prefs;
    prefs.begin("clawdmeter", false);
    prefs.putUChar(key, v);
    prefs.end();
}

// A tap on the page is the cycle's step from it: the creature comes up and the
// page goes out of sight, live, its updates landing unseen (ui_page_leave). A
// long press while the page dances is the next dance view instead, on boards
// with working touch; LVGL still sends the click on its release, which the flag
// set here swallows. On any other page a long press is a tap.
static void page_touch_cb(lv_event_t* e) {
    const lv_event_code_t code = lv_event_get_code(e);
    if (code == LV_EVENT_PRESSED) {
        page_long = false;
    } else if (code == LV_EVENT_LONG_PRESSED) {
        if (page_dancing() && dview_big) {
            page_long = true;
            ui_dance_view_set(DVIEW_NAME[(dview_now() + 1) % DVIEW_COUNT]);
        }
    } else if (!page_long) {   // LV_EVENT_CLICKED
        ui_page_leave();
    }
}

// The dance floor: pa "dance" puts the two pools on the band in turn, a
// feature for 90 s, then a clip (a short repeating move) for 30 s, then
// another feature. Each pick is random within its pool and never the pool's
// last pick while the pool has another. Between two dancers the creature
// shrinks to a dot and comes back up as the next one (LVGL scale on the mini
// canvas, DANCE_HALF_MS each way). The clock runs only while the page is on
// top (ui_tick_anim). Names this board's table lacks are skipped at pick time,
// so the same pools serve every board.
#define DANCE_N       6
#define DANCE_HALF_MS 600
#define DANCE_DOT     8    // scale at the swap, of 256: a dot of a few px

static const char* const DANCE_POOL[2][DANCE_N] = {
    { "echo breakdance hd", "echo acrobat hd", "echo rave bunny hd",    // features
      "echo dj", "echo rave", "echo mixer" },
    { "echo moonwalk hd", "echo hop", "echo swing",                      // clips
      "echo headphones", "echo notes", "echo cartwheel" },
};
static const char* const DANCE_KIND[2] = { "feature", "clip" };
static const uint32_t    DANCE_MS[2]   = { 90000, 30000 };

enum dance_phase_t : uint8_t { DANCE_PLAY, DANCE_DOWN, DANCE_UP };

static bool          dance_on      = false;      // pa is "dance" and a dancer is on the band
static uint8_t       dance_pool    = 0;          // the pool of the dancer on the band, 0 or 1
static int8_t        dance_prev[2] = { -1, -1 }; // each pool's last pick; [dance_pool] is on the band
static dance_phase_t dance_phase   = DANCE_PLAY; // dancing, shrinking to the dot, growing back
static uint32_t      dance_left    = 0;          // page on top ms left in this phase
static uint32_t      dance_last    = 0;          // lv_tick when that was last counted down

#ifdef FEATURE_PICTURE
// ---- Album art (art.h) ----
// With a picture for the page's pi the card takes its second layout: the art
// square on the left, the title and the three lines beside it, the creature's
// band across the whole width under both, the bar where it always is. Without
// one it keeps the layout above. While a picture is on its way the square
// stands empty in the panel colour, so a new track moves the text once, not
// twice; a picture that fails leaves the card without art. The square sits
// centred in the room the layout keeps for it and takes the size of its
// picture, never stretched (page_art_place). In the large and full views it is
// a thumbnail beside the two lines instead, the picture scaled down into it.
enum page_art_t : uint8_t { PAGE_ART_NONE, PAGE_ART_COMING, PAGE_ART_SHOWN };

static lv_obj_t*  page_art_box = nullptr;    // the square, with the picture centred in it
static lv_obj_t*  page_art_img = nullptr;
static const lv_image_dsc_t* page_art_pic = nullptr;   // the picture on the square, NULL while empty
static int        page_art_room = 0;         // the side of the room the card keeps for the square
static int        page_art_px   = 0;         // the square's side while it waits for a picture
static page_art_t page_art     = PAGE_ART_NONE;
static char       page_pi[ART_ID_MAX + 1]     = "";   // the page's picture; "" none
static char       page_art_id[ART_ID_MAX + 1] = "";   // the picture on the square now
static bool       page_pi_warned = false;             // a pi the board will not fetch has been logged

// The square at its picture's size (page_art_px a side while it is empty):
// centred in its room at the card's top left, or as a thumbnail page_thumb a
// side at (0, y) with the picture scaled down into it. Shown while the page
// has a picture or one on its way.
static void page_art_place(bool thumb, int y) {
    if (!page_art_box) return;
    const int w   = page_art_pic ? (int)page_art_pic->header.w : page_art_px;
    const int h   = page_art_pic ? (int)page_art_pic->header.h : page_art_px;
    const int big = w > h ? w : h;
    if (thumb && big > 0) {
        lv_obj_set_size(page_art_box, w * page_thumb / big, h * page_thumb / big);
        lv_obj_set_pos(page_art_box, 0, y);
        lv_image_set_scale(page_art_img, (uint32_t)(page_thumb * LV_SCALE_NONE / big));
    } else {
        lv_obj_set_size(page_art_box, w, h);
        lv_obj_set_pos(page_art_box, (page_art_room - w) / 2, (page_art_room - h) / 2);
        lv_image_set_scale(page_art_img, LV_SCALE_NONE);
    }
    set_hidden(page_art_box, page_art == PAGE_ART_NONE);
}

// Match the card to its picture: on the square, on its way (the square empty)
// or none (the layout without art). Every page update and every loop pass; the
// art_get call is also what takes a finished fetch in. Only the card's children
// move: a page out of sight stays out of sight.
static void page_art_sync(void) {
    if (!page_art_img) return;
    bool coming = false;
    const lv_image_dsc_t* pic = art_get(page_pi, &coming);
    const page_art_t want = pic ? PAGE_ART_SHOWN : coming ? PAGE_ART_COMING : PAGE_ART_NONE;
    if (want == page_art && (!pic || strcmp(page_art_id, page_pi) == 0)) return;
    if (pic) {
        lv_image_set_src(page_art_img, pic);
        strlcpy(page_art_id, page_pi, sizeof(page_art_id));
    } else {
        page_art_id[0] = '\0';
    }
    set_hidden(page_art_img, !pic);
    page_art_pic = pic;
    page_art     = want;
    page_layout();   // the square at its picture's size, the text and the band around it
}

// The page's pi: an id art.cpp will fetch, or none. One it will not fetch
// counts as none and is logged once.
static void page_art_set(const char* pi) {
    const bool ok = pi && art_id_ok(pi);
    if (pi && *pi && !ok) {
        if (!page_pi_warned) Serial.println("page: pi is not 8 to 16 of a to z and 0 to 9, no art");
        page_pi_warned = true;
    } else {
        page_pi_warned = false;
    }
    const char* id = ok ? pi : "";
    if (strcmp(id, page_pi) != 0) {
        strlcpy(page_pi, id, sizeof(page_pi));
        art_want(page_pi);
    }
    page_art_sync();
}

// The layout with art, worked out from the one without (init_page_overlay's
// numbers) and L. The room for the square is the creature's size (L.idle_px,
// 160 on the 480 px boards) or half the width beside it when that is less; the
// text lays out around the room. The title sits level with the room's top and
// the three lines end level with its bottom; on a room too short for both the
// lines stack under the title. The square itself is ART_PX (the art comes 128
// px on both paths), no more than the room, centred in it. Makes the square and
// starts art.cpp at its size. No room for the band under it: no art layout,
// the card goes without.
static void page_art_init(int gap, int title_h, int line_h, int pitch, int bar_y) {
    const int half    = (L.content_w - gap) / 2;
    const int room    = L.idle_px < half ? L.idle_px : half;
    const int px      = ART_PX < room ? ART_PX : room;
    const int text_x  = room + gap;
    const int lines_h = line_h + 2 * pitch;
    int a_line0 = room - lines_h;
    if (a_line0 < title_h + gap) a_line0 = title_h + gap;
    const int top_h    = a_line0 + lines_h > room ? a_line0 + lines_h : room;
    const int a_band_y = top_h + gap;
    const int a_band_h = bar_y - gap - a_band_y;
    if (px <= 0 || a_band_h <= 0) {
        Serial.println("page: no room for album art on this layout");
        return;
    }
    page_geom[PAGE_GEOM_ART] = { (int16_t)text_x, (int16_t)a_line0, 0, (int16_t)a_band_y,
                                 (int16_t)L.content_w, (int16_t)a_band_h, (int16_t)bar_y, (int16_t)L.bar_h };
    // The creature has one size in the card: small enough for both bands.
    if (a_band_h < page_creature_px) page_creature_px = a_band_h;
    page_art_room = room;
    page_art_px   = px;

    // Panel colour while empty, no border; not clickable, so a tap still lands
    // on the page. page_art_place sizes and places it.
    page_art_box = lv_obj_create(page_group);
    lv_obj_set_style_bg_color(page_art_box, COL_PANEL, 0);
    lv_obj_set_style_bg_opa(page_art_box, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(page_art_box, 0, 0);
    lv_obj_set_style_radius(page_art_box, 0, 0);
    lv_obj_set_style_pad_all(page_art_box, 0, 0);
    lv_obj_clear_flag(page_art_box, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_clear_flag(page_art_box, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_flag(page_art_box, LV_OBJ_FLAG_HIDDEN);

    page_art_img = lv_image_create(page_art_box);   // sized to its picture, which is never over px
    lv_obj_clear_flag(page_art_img, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_center(page_art_img);
    lv_obj_add_flag(page_art_img, LV_OBJ_FLAG_HIDDEN);

    art_init(px);
}
#endif

// Lay the card out for what it shows now: the dance view while the page dances,
// the card otherwise, either with or without album art. On a change of the
// view, of the creature being there, of the page dancing or not
// (page_place_creature) or of the art (page_art_sync).
static void page_layout(void) {
    const uint8_t v = page_view_wanted();
    page_view = v;
    bool art = false;
#ifdef FEATURE_PICTURE
    art = page_art != PAGE_ART_NONE;
#endif
    const bool card = v == DVIEW_CARD;
    const PageGeom& g = page_geom[card && art ? PAGE_GEOM_ART : v];
    const int tx = g.text_x + (!card && art ? page_thumb + page_gap : 0);
    // Large and full keep two compact lines: the title (the track, on the music
    // card) in the lines' type, then p1 (the artist) dimmed; p2 and p3 go.
    const lv_font_t* line_font = &font_mono_18;
    lv_obj_set_style_text_font(page_lbl_title, card ? L.title_font : line_font, 0);
    lv_obj_set_size(page_lbl_title, L.content_w - tx,
                    card ? L.title_font->line_height : line_font->line_height);
    lv_obj_set_pos(page_lbl_title, tx, card ? 0 : g.line0_y);
    for (int i = 0; i < 3; i++) {
        lv_obj_set_pos(page_lbl_line[i], tx, g.line0_y + (card ? i : i + 1) * page_pitch);
        lv_obj_set_width(page_lbl_line[i], L.content_w - tx);
    }
    lv_obj_set_style_text_color(page_lbl_line[0], card ? COL_TEXT : COL_DIM, 0);
    set_hidden(page_lbl_line[1], !card);
    set_hidden(page_lbl_line[2], !card);
    set_hidden(page_strip, v != DVIEW_FULL);
    lv_obj_set_pos(page_band, g.band_x, g.band_y);
    lv_obj_set_size(page_band, g.band_w, g.band_h > 0 ? g.band_h : 1);   // the creature is centred in it
    lv_obj_set_pos(page_bar, 0, g.bar_y);
    lv_obj_set_height(page_bar, g.bar_h);
#ifdef FEATURE_PICTURE
    page_art_place(v != DVIEW_CARD, g.line0_y);
#endif
    if (!page_creature_on) return;
    // Square pixels when the big creature is scaled for a change of dancer, and
    // a cheaper transform; the card keeps the smoothing it always had.
    lv_image_set_antialias(page_creature, v == DVIEW_CARD);
    if (!splash_mini_set_px(page_px[v])) {
        Serial.println("page: no buffer for the big dancer, card view");
        dview_big = false;   // its buffer was made for the card only; the card always fits
        page_layout();
    }
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
    // Large: two lines and a bar half the card's under the creature, which takes
    // the height left, no more than the width: 360 px on the 480 px panels, which
    // the 20, 40 and 60 cell lattices all divide, so every dancer is one size.
    const int lg_bar_h  = L.bar_h / 2;
    const int lg_bar_y  = inner_h - lg_bar_h;
    const int lg_line0  = lg_bar_y - gap - line_h - pitch;
    const int lg_px     = lg_line0 - gap < L.content_w ? lg_line0 - gap : L.content_w;
    // Full: the creature on the whole panel; the two lines and a bar a quarter of
    // the card's on the strip, which starts a gap above the first line.
    const int fl_bar_h  = L.bar_h / 4;
    const int fl_bar_y  = inner_h - fl_bar_h;
    const int fl_line0  = fl_bar_y - gap - line_h - pitch;
    const int strip_y   = fl_line0 - gap;

    page_pitch = pitch;
    page_gap   = gap;
    page_thumb = line_h + pitch;   // as tall as the two compact lines
    page_geom[DVIEW_CARD]  = { 0, (int16_t)line0_y, 0, (int16_t)band_y, (int16_t)L.content_w,
                               (int16_t)band_h, (int16_t)bar_y, L.bar_h };
    page_geom[DVIEW_LARGE] = { 0, (int16_t)lg_line0, 0, 0, (int16_t)L.content_w,
                               (int16_t)lg_px, (int16_t)lg_bar_y, (int16_t)lg_bar_h };
    page_geom[DVIEW_FULL]  = { 0, (int16_t)fl_line0, (int16_t)-L.margin, (int16_t)-L.margin,
                               L.scr_w, L.scr_h, (int16_t)fl_bar_y, (int16_t)fl_bar_h };
    page_px[DVIEW_LARGE] = lg_px;
    page_px[DVIEW_FULL]  = L.scr_w < L.scr_h ? L.scr_w : L.scr_h;
    {   // the dance view as last set
        Preferences prefs;
        prefs.begin("clawdmeter", true);
        dview     = prefs.getUChar("dview", DVIEW_LARGE);
        dview_opa = prefs.getUChar("dvo", DVIEW_OPA_DEFAULT);
        prefs.end();
        if (dview >= DVIEW_COUNT) dview = DVIEW_LARGE;
        if (dview_opa > 100)      dview_opa = DVIEW_OPA_DEFAULT;
    }

    page_group = lv_obj_create(scr);
    lv_obj_set_pos(page_group, 0, 0);
    lv_obj_set_size(page_group, L.scr_w, L.scr_h);
    lv_obj_set_style_bg_color(page_group, COL_BG, 0);
    lv_obj_set_style_bg_opa(page_group, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(page_group, 0, 0);
    lv_obj_set_style_radius(page_group, 0, 0);
    lv_obj_set_style_pad_all(page_group, L.margin, 0);
    lv_obj_clear_flag(page_group, LV_OBJ_FLAG_SCROLLABLE);
    // Clickable so a tap ends here (and leaves the page); none reach the splash
    // toggle underneath. A long press is the next dance view (page_touch_cb).
    lv_obj_add_flag(page_group, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(page_group, page_touch_cb, LV_EVENT_PRESSED, NULL);
    lv_obj_add_event_cb(page_group, page_touch_cb, LV_EVENT_LONG_PRESSED, NULL);
    lv_obj_add_event_cb(page_group, page_touch_cb, LV_EVENT_CLICKED, NULL);
    lv_obj_add_flag(page_group, LV_OBJ_FLAG_HIDDEN);

    // The creature's band and the full view's strip come first: LVGL draws a
    // parent's children in the order they were made, so the title, the lines,
    // the bar and the art made after them all draw over the creature, which the
    // full view spreads under every one of them. Not clickable, so a tap on the
    // creature still lands on the page.
    page_band = lv_obj_create(page_group);
    lv_obj_set_pos(page_band, 0, band_y);
    lv_obj_set_size(page_band, L.content_w, band_h > 0 ? band_h : 1);
    lv_obj_set_style_bg_opa(page_band, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(page_band, 0, 0);
    lv_obj_set_style_pad_all(page_band, 0, 0);
    lv_obj_clear_flag(page_band, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_clear_flag(page_band, LV_OBJ_FLAG_CLICKABLE);
    page_creature_px = band_h < L.idle_px ? band_h : L.idle_px;

    // The full view's strip, over the creature and under the title and the
    // lines, from a gap above the title's row to the panel's bottom edge, the
    // panel's width. No border; not clickable, so a tap still lands on the
    // page. bg_opa only, which LVGL blends in place (an obj opa would render it
    // through a layer).
    page_strip = lv_obj_create(page_group);
    lv_obj_set_pos(page_strip, -L.margin, strip_y);
    lv_obj_set_size(page_strip, L.scr_w, inner_h + L.margin - strip_y);
    lv_obj_set_style_bg_color(page_strip, COL_BG, 0);
    lv_obj_set_style_bg_opa(page_strip, (lv_opa_t)(dview_opa * 255 / 100), 0);
    lv_obj_set_style_border_width(page_strip, 0, 0);
    lv_obj_set_style_radius(page_strip, 0, 0);
    lv_obj_clear_flag(page_strip, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_flag(page_strip, LV_OBJ_FLAG_HIDDEN);

    // One line; what doesn't fit ends in an ellipsis.
    page_lbl_title = lv_label_create(page_group);
    lv_label_set_text(page_lbl_title, "");
    lv_obj_set_style_text_font(page_lbl_title, L.title_font, 0);
    lv_obj_set_style_text_color(page_lbl_title, COL_TEXT, 0);
    lv_obj_set_size(page_lbl_title, L.content_w, title_h);
    lv_label_set_long_mode(page_lbl_title, LV_LABEL_LONG_DOT);
    lv_obj_align(page_lbl_title, LV_ALIGN_TOP_LEFT, 0, 0);

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

#ifdef FEATURE_PICTURE
    page_art_init(gap, title_h, line_h, pitch, bar_y);   // the card with art
#endif
    page_px[DVIEW_CARD] = page_creature_px;   // after the card with art, which may make it smaller
    page_layout();
}

bool ui_page_visible(void) {
    return page_group && !lv_obj_has_flag(page_group, LV_OBJ_FLAG_HIDDEN);
}

// The one mini creature (splash.cpp) pointed at `anim`: made here the first
// time a page asks for one, re-pointed with splash_mini_set_anim after that,
// never made twice. It is made at the card's size with a buffer for the
// biggest view the board has; page_layout sizes it for the view once it is on
// the band. NULL when the table has no such name; the creature then keeps what
// it had.
static lv_obj_t* page_creature_at(const char* anim) {
    if (page_creature_px <= 0) return nullptr;
    if (!page_creature) {
        return page_creature = splash_mini_create(page_band, anim, page_creature_px,
                                                  dview_big ? page_px[DVIEW_FULL] : 0);
    }
    return splash_mini_set_anim(anim) ? page_creature : nullptr;
}

// Put `c` on the band, or with NULL take the creature off it. The page is laid
// out again when the creature comes or goes (a creature that comes back is sized
// for the view it lands in) and when the page starts or stops dancing with a
// creature on the band throughout: a paused track turns the dance floor into
// echo headphones, which takes the card again.
static void page_place_creature(lv_obj_t* c) {
    if (c) {
        lv_obj_align(c, LV_ALIGN_CENTER, 0, 0);   // its edge follows the animation's lattice
        lv_obj_clear_flag(c, LV_OBJ_FLAG_HIDDEN);
    } else if (page_creature) {
        lv_obj_add_flag(page_creature, LV_OBJ_FLAG_HIDDEN);
    }
    const bool came_or_went = (c != nullptr) != page_creature_on;
    page_creature_on = c != nullptr;
    if (came_or_went || page_view_wanted() != page_view) page_layout();
}

const char* ui_dance_view_set(const char* name) {
    uint8_t v = 0;
    while (v < DVIEW_COUNT && strcmp(name, DVIEW_NAME[v]) != 0) v++;
    if (v == DVIEW_COUNT) return "value";
    if (v != DVIEW_CARD && !dview_big) return "no";
    if (v != dview) {
        dview = v;
        dview_store("dview", v);
        Serial.printf("page: dance view %s\n", DVIEW_NAME[v]);
        if (page_group) page_layout();
    }
    return nullptr;
}

const char* ui_dance_opa_set(int pct) {
    if (!dview_big) return "no";
    if (pct < 0 || pct > 100) return "value";
    if (pct != dview_opa) {
        dview_opa = (uint8_t)pct;
        dview_store("dvo", dview_opa);
        if (page_strip) lv_obj_set_style_bg_opa(page_strip, (lv_opa_t)(pct * 255 / 100), 0);
    }
    return nullptr;
}

const char* ui_dance_view_name(void) {
    return DVIEW_NAME[dview_now()];
}

int ui_dance_opa(void) {
    return dview_opa;
}

// A random entry of `pool` that this board's table has, other than the pool's
// last pick while it has another. That last pick again when it is the only
// one; -1 when the table has none of the pool.
static int8_t dance_pick(uint8_t pool) {
    const int8_t prev = dance_prev[pool];
    int8_t cand[DANCE_N];
    int n = 0;
    for (int i = 0; i < DANCE_N; i++) {
        if (i != prev && splash_anim_known(DANCE_POOL[pool][i])) cand[n++] = (int8_t)i;
    }
    return n ? cand[esp_random() % (uint32_t)n] : prev;
}

// The next dancer on the band, logged: from the other pool, or from this one
// again when the table has none of the other. False, with the band as it was,
// when the table has none of either or the band has no room for a creature.
static bool dance_switch(void) {
    uint8_t p = dance_pool ^ 1;
    int8_t  k = dance_pick(p);
    if (k < 0) {
        p ^= 1;
        k = dance_pick(p);
    }
    lv_obj_t* c = k >= 0 ? page_creature_at(DANCE_POOL[p][k]) : nullptr;
    if (!c) return false;
    dance_pool    = p;
    dance_prev[p] = k;
    page_place_creature(c);
    Serial.printf("page: dance %s %s\n", DANCE_KIND[p], DANCE_POOL[p][k]);
    return true;
}

// Count the dance clock down by the time the page has been on top since the
// last call. A dancer has its pool's time, then shrinks to the dot, where the
// next one takes its place and grows back to full size; its time starts there.
static void dance_tick(void) {
    const uint32_t now = lv_tick_get();
    const uint32_t dt  = now - dance_last;
    dance_last = now;
    if (dt < dance_left) {
        dance_left -= dt;
    } else if (dance_phase == DANCE_PLAY) {
        dance_phase = DANCE_DOWN;
        dance_left  = DANCE_HALF_MS;
    } else if (dance_phase == DANCE_DOWN) {
        dance_switch();   // a dancer is on, so its own pool always has one to give
        dance_phase = DANCE_UP;
        dance_left  = DANCE_HALF_MS;
    } else {
        dance_phase = DANCE_PLAY;
        dance_left  = DANCE_MS[dance_pool];
    }
    // Full size while dancing. On the way down and back up the size follows
    // the clock, never under the dot; set after the switch, so the next
    // dancer comes in at the dot.
    uint32_t s = LV_SCALE_NONE;
    if (dance_phase != DANCE_PLAY) {
        const uint32_t t = dance_phase == DANCE_DOWN ? dance_left : DANCE_HALF_MS - dance_left;
        s = LV_SCALE_NONE * t / DANCE_HALF_MS;
        if (s < DANCE_DOT) s = DANCE_DOT;
    }
    lv_image_set_scale(page_creature, s);
}

// Point the page's creature at `anim`: a creature name (that one, fixed),
// "dance" (the dance floor, from its first feature), or "" for none.
static void page_set_creature(const char* anim) {
    if (strcmp(anim, page_anim) == 0) return;   // unchanged, including none to none and a dance going on
    strlcpy(page_anim, anim, sizeof(page_anim));
    // Full size again: a dance stopped halfway through a change leaves it small.
    if (page_creature) lv_image_set_scale(page_creature, LV_SCALE_NONE);
    dance_pool    = 1;   // so the first pick is a feature
    dance_prev[0] = dance_prev[1] = -1;
    dance_phase   = DANCE_PLAY;
    dance_on      = strcmp(anim, "dance") == 0 && dance_switch();
    if (dance_on) {
        dance_left = DANCE_MS[dance_pool];
        dance_last = lv_tick_get();
        return;
    }
    // A fixed creature or none; "dance" with no dancer in the table ends up here too.
    lv_obj_t* c = *anim ? page_creature_at(anim) : nullptr;
    if (*anim && !c) Serial.printf("page: no creature '%s'\n", anim);
    page_place_creature(c);
}

bool ui_dance_next(void) {
    if (!dance_on) return false;
    if (dance_phase == DANCE_PLAY) dance_left = 0;   // a change under way carries on
    return true;
}

void ui_dance_serial(const char* arg) {
    const bool next = strcmp(arg, "next") == 0;
    if (!next && strcmp(arg, "status") != 0) {
        Serial.println("usage: dance next|status");
    } else if (!dance_on) {
        Serial.println("dance: off");
    } else {
        if (next) ui_dance_next();
        // Seconds until the next change starts; while a dancer grows in, all its time is still ahead.
        const uint32_t ms = dance_left + (dance_phase == DANCE_UP ? DANCE_MS[dance_pool] : 0);
        Serial.printf("dance: %s %s, %lu s left%s\n", DANCE_KIND[dance_pool],
                      DANCE_POOL[dance_pool][dance_prev[dance_pool]],
                      (unsigned long)((ms + 999) / 1000), dance_phase == DANCE_PLAY ? "" : ", changing");
    }
}

void ui_page_show(const char* pg, const char* title, const char* l1, const char* l2,
                  const char* l3, int pp, const char* anim, const char* pi) {
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
    // Left by the cycle or a tap: the same page's updates, whatever they change,
    // land out of sight; a page with another pg comes up whole.
    if (!same_page) page_hidden = false;
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
#ifdef FEATURE_PICTURE
    page_art_set(pi);           // the picture and the layout with it, in sight or not
#else
    (void)pi;                   // no Wi-Fi on this board: the card never has art
#endif

    if (page_hidden) return;    // out of sight: no show, no wake, the panel keeps its own timeout
    if (appearing) {
        lv_obj_clear_flag(page_group, LV_OBJ_FLAG_HIDDEN);
        // Direct-draw boards paint the creature straight onto the panel, over
        // anything LVGL has there; stop it while the page is up.
        splash_hide();
        idle_note_activity();   // a dark panel lights up for a new page, never for its updates
        Serial.printf("page: show %s\n", page_name);
    } else {
        idle_keep_awake();      // a page still being updated (a track playing) keeps a lit panel lit
    }
}

void ui_page_clear(void) {
    if (page_name[0]) Serial.printf("page: %s cleared\n", page_name);
    page_name[0] = '\0';
    page_hidden = false;        // a clear ends a leave too: the next page shows
    page_set_creature("");      // and starts with no creature and no dance
#ifdef FEATURE_PICTURE
    page_art_set("");           // and no picture
#endif
    if (!ui_page_visible()) return;
    lv_obj_add_flag(page_group, LV_OBJ_FLAG_HIDDEN);
    ui_show_screen(current_screen);   // the splash comes back unless a notification or a prompt still covers it
}

bool ui_page_live(void) {
    return page_name[0] != '\0';
}

// A page in sight goes out of sight, live (the cycle, a tap, the screen verb).
static void page_put_away(void) {
    if (!ui_page_visible()) return;
    lv_obj_add_flag(page_group, LV_OBJ_FLAG_HIDDEN);
    page_hidden = true;
    Serial.printf("page: %s out of sight, still live\n", page_name);
}

// The live page, whole, over the screen underneath; its clock and creature carry on.
static void page_bring_back(void) {
    page_hidden = false;
    lv_obj_clear_flag(page_group, LV_OBJ_FLAG_HIDDEN);
    splash_hide();
    Serial.printf("page: show %s\n", page_name);
}

void ui_page_leave(void) {
    page_put_away();
    ui_show_screen(SCREEN_SPLASH);   // the creature, unless a notification or a prompt covers it
}

void ui_cycle_screens(void) {
    if (ui_page_visible()) {
        ui_page_leave();
    } else if (current_screen == SCREEN_SPLASH) {
        ui_show_screen(SCREEN_USAGE);
    } else if (ui_page_live()) {
        page_bring_back();
    } else {
        ui_show_screen(SCREEN_SPLASH);
    }
}

bool ui_go_to(const char* scr) {
    if (strcmp(scr, "page") == 0) {
        if (!ui_page_live()) return false;
        if (!ui_page_visible()) page_bring_back();
        return true;
    }
    const screen_t want = strcmp(scr, "splash") == 0 ? SCREEN_SPLASH
                        : strcmp(scr, "usage") == 0  ? SCREEN_USAGE : SCREEN_COUNT;
    if (want == SCREEN_COUNT) return false;
    // Showing the splash again would pick the next creature: leave it be.
    if (!ui_page_visible() && current_screen == want) return true;
    page_put_away();
    ui_show_screen(want);
    return true;
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
#ifdef FEATURE_PICTURE
    page_art_sync();   // a picture that has come in; the card lays out around it, in sight or not
#endif
    // The page's creature moves, and its dance changes, only while the page is
    // on top; under a notification or a prompt it would redraw for nothing, and
    // out of sight the dance clock stands still.
    if (ui_page_visible() && !ui_notify_visible() && !ui_approve_visible()) {
        if (dance_on) dance_tick();
        splash_mini_tick();
    } else {
        dance_last = lv_tick_get();
    }

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

// A tap on the creature or the usage screen: the next screen of the cycle
// (a tap on the page has its own, page_touch_cb, to the same end).
static void global_click_cb(lv_event_t* e) {
    (void)e;
    ui_cycle_screens();
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
