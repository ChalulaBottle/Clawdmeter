#pragma once
#include <stdint.h>

// Pure geometry for the 20x20 splash canvas. Deliberately free of LVGL/Arduino
// dependencies so it can be unit-tested on the host (see
// test/test_splash_geometry/). Decides the in-buffer pixel size of each grid
// cell and the LVGL image scale needed to fill the panel.
//
// PSRAM boards render the canvas at full panel size (scale = 1.0x) as before.
// PSRAM-less boards (e.g. the ESP32-C6 sibling) cannot hold a 480x480 RGB565
// framebuffer (460 KB) in internal SRAM, so they render a tiny 20x20 buffer
// (~800 bytes) and let LVGL upscale it with nearest-neighbour. A full-screen
// splash then costs ~800 bytes instead of 460 KB, with no cropping.

#define SPLASH_GRID         20
#define SPLASH_SCALE_UNITY  256   // LVGL image-scale denominator (256 == 1.0x)

typedef struct {
    int cell;        // px per grid cell inside the canvas buffer
    int canvas_dim;  // SPLASH_GRID * cell (canvas is square)
    int scale;       // LVGL image scale in 1/256 units (SPLASH_SCALE_UNITY == none)
} SplashGeometry;

static inline SplashGeometry splash_compute_geometry(int width, int height,
                                                     bool has_psram) {
    int min_dim = (width < height) ? width : height;
    int target_cell = min_dim / SPLASH_GRID;   // desired on-screen px per cell
    if (target_cell < 1) target_cell = 1;

    SplashGeometry g;
    if (has_psram) {
        g.cell  = target_cell;             // render at full size...
        g.scale = SPLASH_SCALE_UNITY;      // ...and don't scale
    } else {
        g.cell  = 1;                       // tiny 20x20 buffer...
        g.scale = SPLASH_SCALE_UNITY * target_cell;  // ...scaled up to full size
    }
    g.canvas_dim = SPLASH_GRID * g.cell;
    return g;
}

// Per animation lattice. The canvas above is sized for the 20 cell lattice;
// an animation with a finer one (40 or 60 cells a side) is drawn into that
// same square with smaller cells: cell is the square's edge divided by the
// lattice size, rounded down to whole px, and offset centres the art when the
// division leaves px over (on 480 px panels 20, 40 and 60 divide exactly, so
// the offset is 0). Because the square is 20 times a whole cell, a lattice
// never needs a bigger buffer than the 20 cell one, so RAM stays flat.
//
// even keeps cell and offset even, for panels that only take even aligned
// writes (the direct draw path bypasses the LVGL rounder that handles this
// for everything else). It never changes the 20 cell case on the direct draw
// boards in this tree: their 20 cell px values, 24 and 18, are already even.
//
// fits is false when the lattice has more cells than the square has px;
// such an animation cannot be drawn and the renderer skips it.
typedef struct {
    int  size;     // cells a side
    int  cell;     // px per cell
    int  offset;   // px from the square's left and top edge to the art
    bool fits;
} SplashLattice;

static inline SplashLattice splash_fit_lattice(int square_px, int size, bool even) {
    SplashLattice l;
    l.size = (size > 0) ? size : SPLASH_GRID;
    l.cell = square_px / l.size;
    if (even && l.cell > 1) l.cell &= ~1;
    if (l.cell < 1) l.cell = 1;
    const int art = l.size * l.cell;
    l.fits   = art <= square_px;
    l.offset = l.fits ? (square_px - art) / 2 : 0;
    if (even) l.offset &= ~1;
    return l;
}
