#include "splash.h"
#include "splash_animations.h"
#include "splash_geometry.h"
#include "charge_anim.h"
#include "theme.h"
#include "usage_rate.h"
#include "ui.h"          // ui_local_time for the morning coffee pick
#include "hal/board_caps.h"
#include "hal/display_hal.h"
#include <Arduino.h>
#include <string.h>
#include <esp_heap_caps.h>

// 20×20 grid. CELL sized so the canvas fits the smaller display dimension —
// the canvas is square and centered, so on portrait or letterboxed panels
// it leaves vertical margin rather than cropping. On PSRAM-less boards the
// buffer is rendered tiny (cell == 1) and LVGL scales it up to fill the panel;
// the geometry decision lives in splash_compute_geometry() (splash_geometry.h).
//
// Every animation carries its own lattice size (the size field of its table
// row; 0 reads as 20). The square stays the one sized for 20 cells; a finer
// lattice gets smaller cells inside it, the square's edge divided by the
// lattice size (splash_fit_lattice). On the 480 px panels that is 24, 12 and
// 8 px for 20, 40 and 60 cells.
#define GRID         SPLASH_GRID
static int  canvas_w  = GRID * 24;   // recomputed in splash_init()
static int  canvas_h  = GRID * 24;

// Background fallback when palette is missing
#define COL_EMPTY    0x0000  // true black (matches THEME_BG)

LV_FONT_DECLARE(font_styrene_28);

static lv_obj_t *splash_container = NULL;
static lv_obj_t *canvas = NULL;
static lv_obj_t *label_status = NULL;     // shown only when no animations loaded
static uint16_t *canvas_buf = NULL;        // 480x480 RGB565 (PSRAM)

static uint16_t cur_anim = 0;
static uint16_t cur_frame = 0;
static uint32_t frame_started_ms = 0;
static uint32_t last_pick_ms = 0;
static bool active = false;

// While splash is showing, auto-cycle to another animation after a random
// stretch between these two bounds (a fixed beat made the rotation feel like
// a playlist on repeat).
#define SPLASH_ROTATE_MIN_MS 14000
#define SPLASH_ROTATE_MAX_MS 32000
static uint32_t rotate_after_ms = SPLASH_ROTATE_MIN_MS;

// Usage-rate animation groups: 4 groups × up to 14 animations each.
// Filled at init by matching literal names from splash_anims[].
#define GROUP_COUNT 4
#define GROUP_MAX   14
static int8_t  group_lists[GROUP_COUNT][GROUP_MAX];
static uint8_t group_size[GROUP_COUNT] = {0};

// Each group is drawn as a shuffle bag: every member once in a random order,
// then a fresh shuffle, so nothing repeats until the whole group has played
// and the order differs on every pass and every boot (esp_random is the
// hardware RNG, seeded by the radio).
static uint8_t group_order[GROUP_COUNT][GROUP_MAX];
static uint8_t group_left[GROUP_COUNT] = {0};

// The wildcard pool: ambient creatures that belong to no usage group, so they
// used to be reachable only by pressing a button. One pick in three on the calm
// groups and one in five on the busy ones comes from here instead. Creatures
// that stand for a Claude state (model names, ultracode, agents, credits out,
// job done) are left out on purpose: shown at random they would lie. Names
// missing from a board's table are skipped, so the big tier ones only appear
// on SPLASH_BIG boards.
static const char* WILD_NAMES[] = {
    "echo float", "echo walk", "echo love", "echo kiss", "echo kiss b", "echo eye spin",
    "echo portal", "echo door", "echo cartwheel", "echo glance", "echo hop", "echo swing",
    "echo high five", "echo catch", "echo bubble", "echo notes", "echo ponder", "echo code",
    "echo consult", "echo build", "echo openclaw", "echo nanoclaw", "echo ssh", "ctf hoodie",
    "fable gaze", "fable eyes", "echo dj", "echo rave", "echo mixer", "echo summon hd",
    "echo mushroom b", "echo mushroom hd b", "echo breakdance hd", "echo breakdance hd b",
    "echo acrobat hd", "echo moonwalk hd", "echo moonwalk hd b", "echo rave bunny hd",
    "echo rave bunny hd b",
#ifdef SPLASH_BIG
    // The culture batch (docs/bench/anims_culture_*.js): famous paintings, memes and
    // pop culture moments with the ECHO creature in every role, all big tier. Listed
    // inside the #ifdef so the stock 2.16 binary does not grow by a single byte.
    "echo creation", "echo crosswalk", "echo distracted", "echo galaxy brain",
    "echo great wave", "echo melting clock", "echo mona lisa", "echo pearl earring",
    "echo saber duel", "echo scream", "echo slow dodge", "echo starry night",
    "echo stonks", "echo thinker", "echo this is fine", "echo vitruvian",
#endif
};
#define WILD_MAX (sizeof(WILD_NAMES) / sizeof(WILD_NAMES[0]))
static int8_t  wild_list[WILD_MAX];
static uint8_t wild_order[WILD_MAX];
static uint8_t wild_size = 0;
static uint8_t wild_left = 0;

static inline uint32_t rnd(uint32_t n) { return n ? esp_random() % n : 0; }

static void shuffle(uint8_t *order, uint8_t n) {
    for (uint8_t i = 0; i < n; i++) order[i] = i;
    for (uint8_t i = n; i > 1; i--) {
        uint8_t j = (uint8_t)rnd(i);
        uint8_t t = order[i - 1]; order[i - 1] = order[j]; order[j] = t;
    }
}

// The next member of a shuffle bag; `avoid` (the animation on screen) is
// never drawn twice in a row when the bag holds anything else.
static int8_t bag_draw(const int8_t *list, uint8_t *order, uint8_t *left, uint8_t size, int avoid) {
    if (size == 0) return -1;
    for (int tries = 0; tries < 2; tries++) {
        if (*left == 0) { shuffle(order, size); *left = size; }
        int8_t idx = list[order[--(*left)]];
        if (idx != avoid || size == 1) return idx;
    }
    return list[order[*left ? --(*left) : 0]];
}

static const char* GROUP_NAMES[GROUP_COUNT][GROUP_MAX] = {
    // Every animation in splash_anims[] should appear in exactly one group,
    // otherwise it is only ever reachable by pressing PWR. The five Session
    // Browser ones are sorted by mood, not by their buddy meaning — "limit"
    // lands in heavy because that is when it reads as true here.
    //
    // Group 0 — idle / sleepy. The ECHO edition's own creatures (tools/add_echo_anims.py)
    // live here too, listed first so they come up in normal rotation and not only on
    // request; names missing from the table are skipped by resolve_group_lists().
    // "echo mushroom hd" is big tier (SPLASH_BIG boards only) and takes the dead
    // "echo breathe" slot there; elsewhere the slot keeps the old name, because the
    // longer literal alone added 16 bytes to the stock 2.16 binary (2026-09-30).
    { "echo idle", "echo mushroom",
#ifdef SPLASH_BIG
      "echo mushroom hd",
#else
      "echo breathe",
#endif
      "echo wink", "echo coffee", "echo happy", "echo headphones", "echo morning", "echo pizza",
      "echo doze", "echo breath", "echo blink", "echo winky", "echo done" },
    // Group 1 — normal pace
    { "echo look around", "echo think", "echo loading", "echo eye spin", "fable gaze", "echo glance", "echo ponder", "echo code", "echo bubble", "echo ask" },
    // Group 2 — active
    { "echo bounce", "echo sway", "echo surprise", "echo openclaw", "echo nanoclaw", "echo ssh", "echo swing", "echo startle", "echo hop", "echo high five", "echo catch", "echo notes" },
    // Group 3 — heavy
    { "echo summon", "echo dj", "echo rave", "echo mixer", "echo alarm", NULL },
};

// Host-driven animation (see splash_set_anim). -1 = no override, the usage-rate
// groups decide. `forced_req` remembers what the host last asked for so a poll
// repeating the same name is a no-op rather than a re-render.
static int  forced_idx = -1;
static char forced_req[24] = "";

// Held creature (see splash_hold_anim): -1 = none. It stands in for the groups,
// below a host-named one, so the usage poll that names nothing leaves it be.
static int  hold_idx = -1;

// Mornings (MORNING_FROM..MORNING_TO local, once the daemon has sent the clock):
// the idle and normal-pace groups often show the creature with its coffee.
// Two mugs on every third day of the year, one otherwise. One pick in three,
// at random, comes from here so the other creatures still get most turns.
#define MORNING_FROM 6
#define MORNING_TO   10
static const char* MORNING_NAMES[] = { "echo morning", "echo coffee", "echo double coffee" };
static const char* MORNING_DOUBLE  = "echo double coffee";
#define MORNING_MAX (sizeof(MORNING_NAMES) / sizeof(MORNING_NAMES[0]))
static int8_t  morning_list[MORNING_MAX];
static int8_t  morning_double_idx = -1;
static uint8_t morning_size = 0;
static uint8_t morning_rotation = 0;

static int8_t find_anim(const char* want) {
    for (int i = 0; i < SPLASH_ANIM_COUNT; i++) {
        if (strcmp(splash_anims[i].name, want) == 0) return (int8_t)i;
    }
    return -1;
}

static void resolve_morning_list(void) {
    morning_size = 0;
    for (size_t s = 0; s < MORNING_MAX; s++) {
        int8_t idx = find_anim(MORNING_NAMES[s]);
        if (idx >= 0) morning_list[morning_size++] = idx;
    }
    morning_double_idx = find_anim(MORNING_DOUBLE);
}

// The coffee pick for right now, or -1 when it is not morning, the clock is
// unknown, or this rotation is one of the "other creatures" turns.
static int morning_pick(void) {
    int hour, yday;
    if (morning_size == 0 || !ui_local_time(&hour, &yday)) return -1;
    if (hour < MORNING_FROM || hour >= MORNING_TO) return -1;
    if (rnd(3) != 0) return -1;
    int8_t idx = morning_list[morning_rotation++ % morning_size];
    if (morning_double_idx >= 0 && yday % 3 == 0 && strcmp(splash_anims[idx].name, "echo coffee") == 0) {
        idx = morning_double_idx;   // a two-mug day
    }
    return idx;
}

static void resolve_group_lists(void) {
    resolve_morning_list();
    wild_size = 0;
    wild_left = 0;
    for (size_t s = 0; s < WILD_MAX; s++) {
        int8_t idx = find_anim(WILD_NAMES[s]);
        if (idx >= 0) wild_list[wild_size++] = idx;
    }
    for (int g = 0; g < GROUP_COUNT; g++) group_left[g] = 0;
    for (int g = 0; g < GROUP_COUNT; g++) {
        group_size[g] = 0;
        for (int s = 0; s < GROUP_MAX; s++) {
            group_lists[g][s] = -1;
            const char* want = GROUP_NAMES[g][s];
            if (!want) continue;
            for (int i = 0; i < SPLASH_ANIM_COUNT; i++) {
                if (strcmp(splash_anims[i].name, want) == 0) {
                    group_lists[g][group_size[g]++] = (int8_t)i;
                    break;
                }
            }
        }
    }
}

static uint16_t *row_buf = NULL;   // scratch row, sized to canvas_w (PSRAM path)

// ─── Frame data ──────────────────────────────────────────────────────────────
// A table row holds frame_count frames of size by size cells, back to back;
// inside a frame the cells run row by row from the top left. Rows written
// before the size field existed leave it 0, which is the 20 cell lattice.
static inline int anim_size(const splash_anim_def_t *a) {
    return a->size ? a->size : GRID;
}

static inline const uint8_t* anim_cells(const splash_anim_def_t *a, uint16_t frame) {
    const size_t s = (size_t)anim_size(a);
    return (const uint8_t*)a->frames + (size_t)frame * s * s;
}

static inline uint16_t cell_color(const uint16_t *palette, uint8_t code) {
    return (palette && code < SPLASH_PALETTE_SIZE) ? palette[code] : COL_EMPTY;
}

// What the splash holds right now: the animation and the frame last drawn.
// The frame is a pointer into the table in flash, so remembering it costs no
// RAM whatever the lattice. The next frame of the same animation is compared
// with it cell by cell and only what differs is drawn; a switch to another
// animation (or nothing drawn yet) is a full paint.
static const splash_anim_def_t *shown_anim  = NULL;
static const uint8_t           *shown_cells = NULL;

// First and last column that differ in one lattice row of `s` cells. False
// when the row is unchanged.
static bool row_span(const uint8_t *was, const uint8_t *now, int s, int *x0, int *x1) {
    if (memcmp(was, now, (size_t)s) == 0) return false;
    int l = 0;
    while (was[l] == now[l]) l++;
    int r = s - 1;
    while (was[r] == now[r]) r--;
    *x0 = l;
    *x1 = r;
    return true;
}

// ─── Two render paths ────────────────────────────────────────────────────────
// PSRAM boards (S3) draw the pixel art into an LVGL canvas at native size and
// let LVGL flush it — they have the RAM and cores to spare, no transform needed.
//
// PSRAM-less boards (C6) can't hold a 480×480 canvas. The prior approach (tiny
// 20×20 canvas + LVGL image-scale) made LVGL software-transform the whole
// upscaled frame on every redraw — measured ~0.76 µs/output-px, i.e. 100–220 ms
// per frame on the single-core C6, and partial invalidation of a transformed
// image both fails to clip the transform and smears. Instead we upscale the
// 20×20 cells ourselves with trivial nearest-neighbour replication and push only
// the *changed* cells straight to the panel via the display HAL, bypassing LVGL.
// That removes the transform cost (leaving just the QSPI flush) and the
// dirty-rect is exact, so no smearing.
//
// Both paths draw only what changed between two frames of one animation
// (shown_cells above). That matters most for the fine lattices: a 60 cell
// frame is 3600 cells, and a blink touches a few dozen of them. The canvas
// path repaints the changed span of each lattice row into the canvas buffer
// and hands LVGL the bounding box; the direct path pushes the bounding box.
#ifndef BOARD_HAS_PSRAM
#  define SPLASH_DIRECT_DRAW 1
#else
#  define SPLASH_DIRECT_DRAW 0
#endif

#if !SPLASH_DIRECT_DRAW
// PSRAM boards render the splash through an LVGL canvas and never wait on a
// flush pass, but main.cpp's flush callback calls this on every board.
void splash_note_refresh_done(void) {}
#endif

#if SPLASH_DIRECT_DRAW
static uint16_t*       strip_buf = NULL;   // one grid-row band: (GRID*scr_cell)×scr_cell
static int             strip_px  = 0;      // strip_buf capacity in px
static int             scr_cell  = 24;     // on-screen px per cell of the 20 cell lattice
static int             scr_side  = 480;    // the square the art lives in: GRID * scr_cell
static int             scr_offx  = 0;      // centering offsets (square art on panel)
static int             scr_offy  = 0;
static bool            force_full   = false;  // repaint everything on the next render
// Zaehlt abgeschlossene LVGL-Durchlaeufe (hochgezaehlt aus dem Flush-Callback).
// splash_show merkt sich den Stand und wartet auf eine Aenderung, bevor es
// wieder direkt auf den Panel malt.
static volatile uint32_t refresh_seq = 0;
static uint32_t          wait_seq      = 0;
static uint32_t          wait_until_ms = 0;

void splash_note_refresh_done(void) { refresh_seq++; }

// How many px rows of a band `w` px wide the strip takes in one push, at
// most `want`. Kept even (when above 1) for panels that need even writes.
static int strip_lines(int w, int want) {
    int lines = strip_px / w;
    if (lines > want) lines = want;
    if (lines > 1) lines &= ~1;
    return lines;
}

// Paint a panel rect in the background colour: the margin a lattice leaves
// when it does not fill the square.
static void clear_rect(int x, int y, int w, int h) {
    if (w <= 0 || h <= 0) return;
    const int lines = strip_lines(w, h);
    if (lines < 1) return;
    for (int i = 0; i < w * lines; i++) strip_buf[i] = COL_EMPTY;
    for (int done = 0; done < h; done += lines) {
        const int hh = (h - done < lines) ? h - done : lines;
        display_hal_draw_bitmap(x, y + done, w, hh, strip_buf);
    }
}

// Upscale lattice cells [gx0..gx1]×[gy0..gy1] and push them to the panel,
// one lattice row at a time. The strip holds one row of the 20 cell lattice;
// a finer lattice has smaller cells, so a row goes out in one push as before.
// A coarser one would need more lines than the strip has and goes out in
// chunks: every px row of a lattice row is the same, so the strip is filled
// once and pushed again lower down.
static void blit_cells(const uint8_t* cells, const uint16_t* palette,
                       const SplashLattice& L, int gx0, int gy0, int gx1, int gy1) {
    if (!strip_buf) return;
    const int c     = L.cell;
    const int bw    = (gx1 - gx0 + 1) * c;          // band width, px
    const int lines = strip_lines(bw, c);
    if (lines < 1) return;
    const int px    = scr_offx + L.offset + gx0 * c;
    for (int gy = gy0; gy <= gy1; gy++) {
        const uint8_t* row = cells + gy * L.size;
        uint16_t* p = strip_buf;
        for (int gx = gx0; gx <= gx1; gx++) {       // expand one lattice row across
            const uint16_t color = cell_color(palette, row[gx]);
            for (int i = 0; i < c; i++) *p++ = color;
        }
        for (int dy = 1; dy < lines; dy++)           // replicate that row down
            memcpy(&strip_buf[dy * bw], strip_buf, bw * 2);
        const int y = scr_offy + L.offset + gy * c;
        for (int done = 0; done < c; done += lines) {
            const int h = (c - done < lines) ? c - done : lines;
            display_hal_draw_bitmap(px, y + done, bw, h, strip_buf);
        }
    }
}

// Bounding box, in cells, of everything that differs between two frames of
// one lattice. False when the frames are identical.
static bool changed_box(const uint8_t* was, const uint8_t* now, int s,
                        int* gx0, int* gy0, int* gx1, int* gy1) {
    int bx0 = s, by0 = s, bx1 = -1, by1 = -1;
    for (int gy = 0; gy < s; gy++) {
        int x0, x1;
        if (!row_span(was + gy * s, now + gy * s, s, &x0, &x1)) continue;
        if (x0 < bx0) bx0 = x0;
        if (x1 > bx1) bx1 = x1;
        if (gy < by0) by0 = gy;
        by1 = gy;
    }
    if (bx1 < 0) return false;
    *gx0 = bx0; *gy0 = by0; *gx1 = bx1; *gy1 = by1;
    return true;
}

static void render_frame(const splash_anim_def_t *a, uint16_t frame) {
    if (!strip_buf) return;
    if (!active) return;          // never draw to the panel while not shown
    const SplashLattice L = splash_fit_lattice(scr_side, anim_size(a), true);
    if (!L.fits) return;          // more cells than the square has px
    const uint8_t* cells = anim_cells(a, frame);
    const bool full = force_full || a != shown_anim || !shown_cells;
    force_full = false;

    int gx0 = 0, gy0 = 0, gx1 = L.size - 1, gy1 = L.size - 1;
    if (full) {
        // A lattice that does not fill the square leaves a margin, and the
        // previous animation may have drawn there.
        const int art = L.size * L.cell;
        if (art < scr_side) {
            const int end = L.offset + art;          // first px past the art
            clear_rect(scr_offx, scr_offy, scr_side, L.offset);
            clear_rect(scr_offx, scr_offy + end, scr_side, scr_side - end);
            clear_rect(scr_offx, scr_offy + L.offset, L.offset, art);
            clear_rect(scr_offx + end, scr_offy + L.offset, scr_side - end, art);
        }
    } else if (!changed_box(shown_cells, cells, L.size, &gx0, &gy0, &gx1, &gy1)) {
        shown_cells = cells;                         // identical frame, nothing to do
        return;
    }

    blit_cells(cells, a->palette, L, gx0, gy0, gx1, gy1);
    shown_anim  = a;
    shown_cells = cells;
}

#else  // ── PSRAM: LVGL canvas render ──

// Paint lattice cells [gx0..gx1] of lattice row gy into the canvas buffer:
// one px row built in row_buf, copied down the height of the cell.
static void paint_span(const uint8_t *cells, const uint16_t *palette,
                       const SplashLattice &L, int gy, int gx0, int gx1) {
    const int c = L.cell;
    const int x = L.offset + gx0 * c;
    const int w = (gx1 - gx0 + 1) * c;
    const uint8_t *row = cells + gy * L.size;
    uint16_t *p = &row_buf[x];
    for (int gx = gx0; gx <= gx1; gx++) {
        const uint16_t color = cell_color(palette, row[gx]);
        for (int i = 0; i < c; i++) *p++ = color;
    }
    uint16_t *dst = &canvas_buf[(L.offset + gy * c) * canvas_w + x];
    for (int dy = 0; dy < c; dy++, dst += canvas_w)
        memcpy(dst, &row_buf[x], w * 2);
}

static void render_frame(const splash_anim_def_t *a, uint16_t frame) {
    if (!row_buf || !canvas_buf) return;
    const SplashLattice L = splash_fit_lattice(canvas_w, anim_size(a), false);
    if (!L.fits) return;          // more cells than the canvas has px
    const uint8_t *cells = anim_cells(a, frame);
    const bool full = a != shown_anim || !shown_cells;

    int gx0 = 0, gy0 = 0, gx1 = L.size - 1, gy1 = L.size - 1;
    if (full) {
        if (L.size * L.cell < canvas_w) {            // margin around the art
            for (int i = 0; i < canvas_w * canvas_h; i++) canvas_buf[i] = COL_EMPTY;
        }
        for (int gy = 0; gy < L.size; gy++) paint_span(cells, a->palette, L, gy, 0, L.size - 1);
    } else {
        // Repaint the changed span of each row and grow the box LVGL redraws.
        gx0 = L.size; gy0 = L.size; gx1 = -1; gy1 = -1;
        for (int gy = 0; gy < L.size; gy++) {
            int x0, x1;
            if (!row_span(shown_cells + gy * L.size, cells + gy * L.size, L.size, &x0, &x1)) continue;
            paint_span(cells, a->palette, L, gy, x0, x1);
            if (x0 < gx0) gx0 = x0;
            if (x1 > gx1) gx1 = x1;
            if (gy < gy0) gy0 = gy;
            gy1 = gy;
        }
        if (gx1 < 0) {                               // identical frame, nothing to do
            shown_cells = cells;
            return;
        }
    }
    shown_anim  = a;
    shown_cells = cells;
    if (!canvas) return;
    if (full) {
        lv_obj_invalidate(canvas);
        return;
    }
    // One area per frame: LVGL keeps a short list of dirty areas and redraws
    // the whole screen once it overflows. Coordinates are absolute.
    lv_obj_update_layout(canvas);
    lv_area_t box;
    lv_obj_get_coords(canvas, &box);
    const int32_t ox = box.x1 + L.offset;
    const int32_t oy = box.y1 + L.offset;
    box.x1 = ox + gx0 * L.cell;
    box.y1 = oy + gy0 * L.cell;
    box.x2 = ox + (gx1 + 1) * L.cell - 1;
    box.y2 = oy + (gy1 + 1) * L.cell - 1;
    lv_obj_invalidate_area(canvas, &box);
}
#endif

// ---- Mini creature: a small animated creature for embedding in other screens
//      (e.g. the idle "sleeping" indicator). Self-contained — its own canvas and
//      buffer, independent of the full-screen splash above. There is exactly one
//      for the program's life: made by the first splash_mini_create, re-pointed
//      at other animations after that, never allocated twice. The page's dance
//      view draws it at up to the panel's size (ui.cpp), so it takes the
//      splash's rule: only what changed is painted and redrawn. ----
static lv_obj_t  *mini_canvas = NULL;
static lv_obj_t  *mini_parent = NULL;   // where the one mini creature lives
static uint16_t  *mini_buf = NULL;
static int        mini_px = 0;          // the size it is drawn at now
static int        mini_cap = 0;         // the largest px its buffer holds
static int        mini_cell = 0;
static int        mini_w = 0;
static const splash_anim_def_t *mini_anim = NULL;
static const uint8_t *mini_shown = NULL;   // the frame the buffer holds; NULL: paint every cell
static uint16_t   mini_frame = 0;
static uint32_t   mini_started = 0;

// Cells [gx0..gx1] of lattice row gy (`row`, its cells) into the buffer: one px
// row built in place, copied down the height of the cell.
static void mini_paint(const uint8_t *row, const uint16_t *pal, int gy, int gx0, int gx1) {
    uint16_t *dst = &mini_buf[gy * mini_cell * mini_w + gx0 * mini_cell];
    uint16_t *p = dst;
    for (int gx = gx0; gx <= gx1; gx++) {
        const uint16_t color = cell_color(pal, row[gx]);
        for (int i = 0; i < mini_cell; i++) *p++ = color;
    }
    for (int dy = 1; dy < mini_cell; dy++) memcpy(dst + dy * mini_w, dst, (size_t)(p - dst) * 2);
}

// The buffer brought to the current frame: every cell after a switch or a new
// size (mini_shown NULL), otherwise the changed span of each lattice row, and
// LVGL redraws only their bounding box. A whole 480 px canvas is 230,400 px a
// frame; a dancer moving a limb should not cost the panel that. While the
// canvas is scaled (a change of dancer) the box is not where it is drawn, so
// the whole canvas is redrawn then (the transform smears on a part, see above).
static void mini_render(void) {
    if (!mini_buf || !mini_anim) return;
    const int s = anim_size(mini_anim);
    const uint8_t *cells = anim_cells(mini_anim, mini_frame);
    const bool all = !mini_shown;
    int bx0 = s, by0 = s, bx1 = -1, by1 = -1;
    for (int gy = 0; gy < s; gy++) {
        const uint8_t *row = cells + gy * s;
        int x0 = 0, x1 = s - 1;
        if (!all && !row_span(mini_shown + gy * s, row, s, &x0, &x1)) continue;
        mini_paint(row, mini_anim->palette, gy, x0, x1);
        if (x0 < bx0) bx0 = x0;
        if (x1 > bx1) bx1 = x1;
        if (gy < by0) by0 = gy;
        by1 = gy;
    }
    mini_shown = cells;
    if (!mini_canvas || bx1 < 0) return;           // the same picture: nothing to redraw
    if (all || lv_image_get_scale(mini_canvas) != LV_SCALE_NONE) {
        lv_obj_invalidate(mini_canvas);
        return;
    }
    lv_obj_update_layout(mini_canvas);
    lv_area_t box;
    lv_obj_get_coords(mini_canvas, &box);
    const int32_t ox = box.x1, oy = box.y1;
    box.x1 = ox + bx0 * mini_cell;
    box.y1 = oy + by0 * mini_cell;
    box.x2 = ox + (bx1 + 1) * mini_cell - 1;
    box.y2 = oy + (by1 + 1) * mini_cell - 1;
    lv_obj_invalidate_area(mini_canvas, &box);
}

// Edge in px of `a` drawn as a mini creature of about `px`: whole cells, any
// lattice (a finer one gets smaller cells), and never under 1 px a cell.
static int mini_side(const splash_anim_def_t *a, int px) {
    const int s = anim_size(a);
    const int cell = px / s;
    return s * (cell < 1 ? 1 : cell);
}

static const splash_anim_def_t* anim_named(const char *name) {
    if (!name) return NULL;
    for (int i = 0; i < SPLASH_ANIM_COUNT; i++) {
        if (strcmp(splash_anims[i].name, name) == 0) return &splash_anims[i];
    }
    return NULL;
}

bool splash_anim_known(const char *anim_name) {
    return anim_named(anim_name) != NULL;
}

// The canvas at the edge the animation needs at mini_px, every cell painted;
// the buffer was made for the largest one at mini_cap, so it always fits.
static void mini_fit(void) {
    mini_w     = mini_side(mini_anim, mini_px);
    mini_cell  = mini_w / anim_size(mini_anim);
    mini_shown = NULL;
    lv_canvas_set_buffer(mini_canvas, mini_buf, mini_w, mini_w, LV_COLOR_FORMAT_RGB565);
    mini_render();
}

// Show `a` from its first frame.
static void mini_point_at(const splash_anim_def_t *a) {
    mini_anim  = a;
    mini_frame = 0;
    mini_started = millis();
    mini_fit();
}

lv_obj_t* splash_mini_create(lv_obj_t *parent, const char *anim_name, int px, int cap_px) {
    const splash_anim_def_t *a = anim_named(anim_name);
    if (!a) return NULL;                  // unknown name: whatever exists keeps running
    if (mini_canvas) {
        // Already made. The same owner asking again gets it re-pointed; another
        // owner would take it away from the first, so that is refused.
        if (parent != mini_parent) {
            Serial.printf("splash: mini creature already in use, '%s' not shown\n", anim_name);
            return NULL;
        }
        if (a != mini_anim) mini_point_at(a);
        return mini_canvas;
    }
#ifdef BOARD_HAS_PSRAM
    const uint32_t caps = MALLOC_CAP_SPIRAM;
#else
    const uint32_t caps = MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT;
#endif
    // One buffer for the largest art any table row needs at cap_px (at px 160
    // a 20 cell lattice is 160 px and a 60 cell one 120 px), so re-pointing or
    // resizing it later never allocates. Short of that much, one for px, and
    // the sizes over it are refused (splash_mini_set_px).
    if (cap_px < px) cap_px = px;
    for (int want = cap_px; !mini_buf; want = px) {
        int cap = 0;
        for (int i = 0; i < SPLASH_ANIM_COUNT; i++) {
            const int side = mini_side(&splash_anims[i], want);
            if (side > cap) cap = side;
        }
        mini_buf = (uint16_t*)heap_caps_malloc((size_t)cap * cap * 2, caps);
        mini_cap = want;
        if (mini_buf) break;
        Serial.printf("splash: mini creature buffer (%d px) alloc failed\n", cap);
        if (want == px) return NULL;
    }
    mini_px = px;
    mini_canvas = lv_canvas_create(parent);
    mini_parent = parent;
    mini_point_at(a);
    return mini_canvas;
}

bool splash_mini_set_anim(const char *anim_name) {
    if (!mini_canvas) return false;
    const splash_anim_def_t *a = anim_named(anim_name);
    if (!a) return false;
    if (a != mini_anim) mini_point_at(a);
    return true;
}

bool splash_mini_set_px(int px) {
    if (!mini_canvas || px <= 0 || px > mini_cap) return false;
    if (px != mini_px) {
        mini_px = px;
        mini_fit();   // the same frame, every cell at the new size
    }
    return true;
}

void splash_mini_tick(void) {
    if (!mini_buf || !mini_anim || mini_anim->frame_count == 0) return;
    // Hidden (its screen is not up): nothing to animate, skip the repaint.
    if (mini_canvas && !lv_obj_is_visible(mini_canvas)) return;
    if (millis() - mini_started < mini_anim->holds[mini_frame]) return;
    mini_started = millis();
    mini_frame = (mini_frame + 1) % mini_anim->frame_count;
    mini_render();
}

static void show_placeholder() {
    // Solid dark background + centered status label. On the direct-draw path
    // there's no canvas; the black container is the background and the LVGL
    // label shows over it.
#if !SPLASH_DIRECT_DRAW
    if (canvas_buf) {
        for (int i = 0; i < canvas_w * canvas_h; i++) canvas_buf[i] = COL_EMPTY;
    }
    if (canvas) lv_obj_invalidate(canvas);
#endif
    if (label_status) lv_obj_clear_flag(label_status, LV_OBJ_FLAG_HIDDEN);
}

void splash_init(lv_obj_t *parent) {
    const BoardCaps& c = board_caps();

    // Shared full-screen black container — the splash background.
    splash_container = lv_obj_create(parent);
    lv_obj_set_size(splash_container, c.width, c.height);
    lv_obj_set_pos(splash_container, 0, 0);
    lv_obj_set_style_bg_color(splash_container, THEME_BG, 0);
    lv_obj_set_style_bg_opa(splash_container, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(splash_container, 0, 0);
    lv_obj_set_style_pad_all(splash_container, 0, 0);
    lv_obj_clear_flag(splash_container, LV_OBJ_FLAG_SCROLLABLE);

#if SPLASH_DIRECT_DRAW
    // Direct-to-panel path (no PSRAM): no LVGL canvas. Compute on-screen cell
    // size + centering, and a scratch band buffer sized for one grid-row strip
    // across the square art (GRID*scr_cell × scr_cell). On the C6 that's
    // 480×24×2 ≈ 23 KB of internal SRAM.
    int mind = (c.width < c.height) ? c.width : c.height;
    scr_cell = mind / GRID;
    int side = GRID * scr_cell;
    scr_side = side;
    scr_offx = (c.width  - side) / 2;
    scr_offy = (c.height - side) / 2;
    strip_buf = (uint16_t*)heap_caps_malloc((size_t)side * scr_cell * 2,
                                            MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
    if (!strip_buf) {
        Serial.println("splash: strip buffer alloc failed");
        return;
    }
    strip_px = side * scr_cell;
#else
    // PSRAM path: render into an LVGL canvas at native size (no transform).
    SplashGeometry geo = splash_compute_geometry(c.width, c.height, true);
    canvas_w            = geo.canvas_dim;
    canvas_h            = geo.canvas_dim;
    const int img_scale = geo.scale;

    canvas_buf = (uint16_t*)heap_caps_malloc(canvas_w * canvas_h * 2, MALLOC_CAP_SPIRAM);
    row_buf    = (uint16_t*)heap_caps_malloc(canvas_w * 2,            MALLOC_CAP_SPIRAM);
    if (!canvas_buf || !row_buf) {
        Serial.println("splash: failed to alloc canvas buffer");
        return;
    }

    canvas = lv_canvas_create(splash_container);
    lv_canvas_set_buffer(canvas, canvas_buf, canvas_w, canvas_h, LV_COLOR_FORMAT_RGB565);
    if (img_scale != SPLASH_SCALE_UNITY) {
        lv_image_set_antialias(canvas, false);
        lv_image_set_pivot(canvas, canvas_w / 2, canvas_h / 2);
        lv_image_set_scale(canvas, img_scale);
    }
    lv_obj_center(canvas);
#endif

    // Placeholder label (visible only when no animations are loaded)
    label_status = lv_label_create(splash_container);
    lv_label_set_text(label_status,
        "no animations loaded\n\n"
        "run tools/scrape_claudepix.js\n"
        "then tools/convert_to_c.js");
    lv_obj_set_style_text_font(label_status, &font_styrene_28, 0);
    lv_obj_set_style_text_color(label_status, lv_color_hex(0xb0aea5), 0);
    lv_obj_set_style_text_align(label_status, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_center(label_status);

    resolve_group_lists();

    if (SPLASH_ANIM_COUNT == 0) {
        show_placeholder();
    } else {
        lv_obj_add_flag(label_status, LV_OBJ_FLAG_HIDDEN);
#if !SPLASH_DIRECT_DRAW
        // PSRAM path pre-renders frame 0 into the canvas buffer. The direct
        // path draws nothing here — render_frame() bails while inactive, so the
        // splash never paints to the panel before it's actually shown.
        render_frame(&splash_anims[0], 0);
#endif
        frame_started_ms = millis();
    }

    lv_obj_add_flag(splash_container, LV_OBJ_FLAG_HIDDEN);
}

void splash_tick(void) {
    if (!active || SPLASH_ANIM_COUNT == 0) return;

    // The charge overlay is an ordinary LVGL widget, but on the direct-draw
    // boards this module paints straight onto the panel and would scribble
    // over it. Standing still for the two seconds it runs is enough.
    if (charge_anim_is_active()) return;

#if SPLASH_DIRECT_DRAW
    // Voller Neuaufbau nach dem Wiederanzeigen — erst wenn LVGL einen
    // kompletten Durchlauf abgeschlossen hat, sonst uebermalen die restlichen
    // schwarzen Streifen den halben Buddy.
    //
    // Die Notbremse ist noetig, weil ohne Aenderung auch kein Durchlauf
    // stattfindet: haette LVGL nichts neu zu zeichnen, wuerde refresh_seq nie
    // hochgehen und der Splash bliebe fuer immer leer.
    if (force_full && (refresh_seq != wait_seq
                       || (int32_t)(millis() - wait_until_ms) >= 0)) {
        const splash_anim_def_t *fa = &splash_anims[cur_anim];
        if (fa->frame_count) render_frame(fa, cur_frame);
    }
#endif

    // Auto-rotate to the next animation in the current group. Suspended while
    // the host drives the animation or holds one, or its choice would be
    // dropped after rotate_after_ms.
    if (forced_idx < 0 && hold_idx < 0 && millis() - last_pick_ms >= rotate_after_ms) {
        splash_pick_for_current_rate();
    }

    const splash_anim_def_t *a = &splash_anims[cur_anim];
    if (a->frame_count == 0) return;

    uint16_t hold = a->holds[cur_frame];
    if (millis() - frame_started_ms >= hold) {
        cur_frame = (cur_frame + 1) % a->frame_count;
        frame_started_ms = millis();
        render_frame(a, cur_frame);
    }
}

void splash_next(void) {
    if (SPLASH_ANIM_COUNT == 0) return;
    hold_idx = -1;   // the button at the desk lets a held creature go
    cur_anim = (cur_anim + 1) % SPLASH_ANIM_COUNT;
    cur_frame = 0;
    frame_started_ms = millis();
    last_pick_ms = frame_started_ms;
    const splash_anim_def_t *a = &splash_anims[cur_anim];
    render_frame(a, 0);
    Serial.printf("splash: -> %s (%d cells a side)\n", a->name, anim_size(a));
}

// Switch to splash_anims[idx] and draw its first frame.
static void show_anim(int idx) {
    cur_anim = (uint16_t)idx;
    cur_frame = 0;
    frame_started_ms = millis();
    last_pick_ms = frame_started_ms;
    render_frame(&splash_anims[cur_anim], 0);
}

void splash_set_anim(const char *name) {
    if (SPLASH_ANIM_COUNT == 0) return;
    if (!name) name = "";
    if (strncmp(name, forced_req, sizeof(forced_req)) == 0) return;  // unchanged
    strlcpy(forced_req, name, sizeof(forced_req));

    if (name[0] == '\0') {                 // host released control
        forced_idx = -1;
        Serial.println("splash: host released, back to usage-rate groups");
        if (active) splash_pick_for_current_rate();
        return;
    }
    for (int i = 0; i < SPLASH_ANIM_COUNT; i++) {
        if (strcmp(splash_anims[i].name, name) == 0) {
            forced_idx = i;
            Serial.printf("splash: host -> %s (%d cells a side)\n", name, anim_size(&splash_anims[i]));
            if (active) show_anim(i);
            return;
        }
    }
    // Unknown name (host newer than firmware): keep whatever is running rather
    // than blanking the screen, but drop back to the device's own choice.
    forced_idx = -1;
    Serial.printf("splash: host asked for unknown anim '%s', ignoring\n", name);
}

bool splash_hold_anim(const char *name) {
    if (SPLASH_ANIM_COUNT == 0) return false;
    if (!name || !*name) {
        if (hold_idx < 0) return true;
        hold_idx = -1;
        Serial.println("splash: hold let go, back to usage-rate groups");
        if (active && forced_idx < 0) splash_pick_for_current_rate();
        return true;
    }
    const int8_t idx = find_anim(name);
    if (idx < 0) {
        Serial.printf("splash: no anim '%s' to hold\n", name);
        return false;
    }
    hold_idx = idx;
    Serial.printf("splash: hold %s (%d cells a side)\n", name, anim_size(&splash_anims[idx]));
    if (active && forced_idx < 0 && cur_anim != idx) show_anim(idx);
    return true;
}

const char* splash_anim_name(void) {
    return SPLASH_ANIM_COUNT ? splash_anims[cur_anim].name : "";
}

int splash_anim_count(void) {
    return SPLASH_ANIM_COUNT;
}

void splash_pick_for_current_rate(void) {
    if (SPLASH_ANIM_COUNT == 0) return;
    if (forced_idx >= 0) { show_anim(forced_idx); return; }
    if (hold_idx >= 0)   { show_anim(hold_idx); return; }
    int g = usage_rate_group();
    if (g < 0 || g >= GROUP_COUNT) g = 0;
    if (group_size[g] == 0) return;

    int8_t idx = -1;
    if (g <= 1) {   // idle / normal pace: mornings lean on the coffee creatures
        int m = morning_pick();
        if (m >= 0) {
            idx = (int8_t)m;
            Serial.printf("splash: morning -> %s\n", splash_anims[idx].name);
        }
    }
    const char *from = idx >= 0 ? "morning" : "group";
    if (idx < 0 && wild_size > 0 && rnd(g <= 1 ? 3 : 5) == 0) {
        idx = bag_draw(wild_list, wild_order, &wild_left, wild_size, cur_anim);
        from = "wild";
    }
    if (idx < 0) {
        idx = bag_draw(group_lists[g], group_order[g], &group_left[g], group_size[g], cur_anim);
    }
    if (idx < 0) return;

    rotate_after_ms = SPLASH_ROTATE_MIN_MS + rnd(SPLASH_ROTATE_MAX_MS - SPLASH_ROTATE_MIN_MS + 1);
    Serial.printf("splash: %s -> %s for %lu s\n", from, splash_anims[idx].name,
                  (unsigned long)(rotate_after_ms / 1000));
    cur_anim = (uint16_t)idx;
    cur_frame = 0;
    frame_started_ms = millis();
    last_pick_ms = frame_started_ms;
    render_frame(&splash_anims[cur_anim], 0);
}

bool splash_is_active(void) { return active; }
bool splash_host_named(void) { return forced_idx >= 0 || hold_idx >= 0; }

void splash_request_full_redraw(void) {
#if SPLASH_DIRECT_DRAW
    // LVGL fills the container black on unhide, and that black would erase a
    // creature drawn now. Deferring to the next splash_tick() was not enough:
    // this panel renders partially (BUF_LINES 20 of 480), so one
    // lv_timer_handler() pass flushes only a few strips. The creature got
    // painted between two of them, and the remaining black strips wiped part
    // of it — from then on only changed cells are redrawn, so the damage
    // stayed. Half a creature, or just the pixels that move.
    //
    // So wait for LVGL to report a finished pass (splash_note_refresh_done,
    // called from the flush callback on the last strip). lv_refr_now() would
    // be the obvious tool but the callers run from LVGL event handlers and
    // animation callbacks — starting a refresh from inside one is asking for
    // trouble.
    force_full    = true;
    wait_seq      = refresh_seq;
    wait_until_ms = millis() + 250;   // Notbremse, siehe splash_tick
#endif
}

void splash_show(void) {
    splash_pick_for_current_rate();   // select animation; direct path defers the draw
    if (splash_container) lv_obj_clear_flag(splash_container, LV_OBJ_FLAG_HIDDEN);
    active = true;
    splash_request_full_redraw();
}

void splash_hide(void) {
    if (splash_container) lv_obj_add_flag(splash_container, LV_OBJ_FLAG_HIDDEN);
    active = false;
}

lv_obj_t* splash_get_root(void) {
    return splash_container;
}
