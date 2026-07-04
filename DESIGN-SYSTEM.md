# Conchord — Fun Light Design System

Extracted from the Figma file **Conchord** (page *Protoype*), frames
*Design System — Foundation* and *Design System — Components*. Last synced **2026-07-02**
against the "Fun Light 1000×640 — Rev" screen.

---

## Colors

### Primary — Coral Orange

| Token           | Hex       | Use                                                  |
| --------------- | --------- | ---------------------------------------------------- |
| `primary-dark`  | `#e17a5f` | Logo text ("Chordette")                              |
| `primary`       | `#e88e5e` | Buttons, slider thumbs, toggle-on, **spice-zone input** |
| `primary-light` | `#f7ad86` | Slider fill, lighter accents                         |

### Secondary — Teal

A 7-step ramp used for active UI states and the chord/note **output** visualization.
Renamed and re-spaced from the earlier 5-step ramp — note the new `800`/`700` darks and
`100` light, and that mid-ramp values shifted.

| Token           | Hex       | Use                                                      |
| --------------- | --------- | -------------------------------------------------------- |
| `secondary-800` | `#1e4f4c` | Deepest teal (reserved / high-contrast text)             |
| `secondary-700` | `#286561` | Text on teal backgrounds (active tab label)              |
| `secondary-600` | `#3c8580` | Interactive text (C IONIAN, ±0), **output root**, darkest note bar |
| `secondary-400` | `#54a794` | Mid note bars                                            |
| `secondary-300` | `#8ecfc0` | **Output active note**, light note bars                  |
| `secondary-200` | `#a9e0d4` | Active tab background, lightest note bars                |
| `secondary-100` | `#cfede7` | Faintest teal fill (ghost / hover)                       |

### Neutrals — Warm Gray

| Token         | Hex       | Use                                   |
| ------------- | --------- | ------------------------------------- |
| `neutral-900` | `#3f3737` | Display text (large chord name)       |
| `neutral-700` | `#5d5d5d` | Primary UI text, icon fills, **black keys** |
| `neutral-500` | `#858585` | Secondary text, labels, placeholders  |
| `neutral-300` | `#dad4d0` | Dividers, slider track, toggle-off    |
| `neutral-200` | `#e6e5e1` | Button/container background           |
| `neutral-100` | `#eeedea` | Page / app background                 |
| `neutral-50`  | `#f5f5f5` | Card / panel background               |
| `white`       | `#ffffff` | Piano white keys, pure white surfaces |

### Warm Tints — Piano / Shadow

Used for the **spice-zone key overlay** (the input region that adds chord color).

| Token      | Hex       | Use                                        |
| ---------- | --------- | ------------------------------------------ |
| `warm-200` | `#eed9ce` | Spice-zone white key background            |
| `warm-300` | `#decfcc` | Shadow color on warm key variant           |
| `warm-400` | `#ceaca0` | Spice-zone black key background / key shadow |

### Tertiary — Functional (new)

Reserved for system feedback only — never decorative.

| Token         | Hex       | Use                              |
| ------------- | --------- | -------------------------------- |
| `red-warning` | `#e45c55` | Errors, destructive, out-of-range |
| `green-okay`  | `#48d593` | Confirmation / valid state        |
| `blue-link`   | `#3c6fe6` | Hyperlinks / external references  |

---

## Typography

Three font families are in use (Supreme Variable has been **dropped** — numeric values now
use Hanken Grotesk):

| Family         | Role                                             |
| -------------- | ------------------------------------------------ |
| Excon Variable | Product/logo only                                |
| Hanken Grotesk | Primary UI font (all labels, display, numbers)   |
| JetBrains Mono | Technical/MIDI labels (all-caps, monospaced)     |

### Type Scale

| Token     | Family           | Size    | Weight  | Tracking    | Use                                      |
| --------- | ---------------- | ------- | ------- | ----------- | ---------------------------------------- |
| `product` | Excon Variable   | 30px    | 700     | mixed       | Logo "Chordette" only                    |
| `display` | Hanken Grotesk   | 84px    | 700     | 0%          | Large chord name (G7)                    |
| `title`   | Hanken Grotesk   | 18px    | 600     | -1%         | Tagline / subtitle                       |
| `ui`      | Hanken Grotesk   | 15px    | 700     | 4%          | UI state labels (MAJOR, C IONIAN, ±0)    |
| `ui-sm`   | Hanken Grotesk   | 14px    | 700     | 1%          | Tab labels (CHORD, DUO, HARP, JAZZ)      |
| `label`   | Hanken Grotesk   | 12px    | 700–800 | 4%          | Parameter names (700), button text (800) |
| `data`    | Hanken Grotesk   | 15px    | 700     | 3%          | Numeric parameter values (3, 0, 2.1)     |
| `mono`    | JetBrains Mono   | 10–12px | 700     | 8–10% UPPER | MIDI/technical labels (PITCH, MOD, SIZE) |

**Change from v1:** `data` was Supreme Variable and is now Hanken Grotesk 15px/700 at 3%
tracking. Numbers no longer switch font — they read as one type family with UI labels.

---

## Elevation

All shadows are **solid color with zero blur** — intentional, giving a flat but physically
grounded aesthetic.

| Token             | Value                     | Use                                 |
| ----------------- | ------------------------- | ----------------------------------- |
| `shadow-xs`       | `0 2px 0 0 #E1E0DD`       | Containers, cards, parameter panels |
| `shadow-xs-inset` | `0 2px 0 0 #D7D5D1 inset` | Keys, embossed surfaces             |
| `shadow-sm`       | `0 5px 0 0 #E1E0DD`       | White piano keys                    |
| `shadow-sm-warm`  | `0 5px 0 0 #DECFCC`       | Warm-tinted (spice-zone) key variant |

---

## Corner Radius

| Token         | Value | Use                           |
| ------------- | ----- | ----------------------------- |
| `radius-none` | 0px   | Sharp rectangles, vectors     |
| `radius-xs`   | 2px   | Subtle rounding               |
| `radius-sm`   | 4px   | Small containers, key corners |
| `radius-md`   | 6px   | Zone handle / border          |
| `radius-lg`   | 10px  | Buttons, dropdowns            |
| `radius-xl`   | 24px  | Main card panels              |
| `radius-full` | 999px | Toggles, pills, circular dots |

---

## Spacing

4px base unit scale.

| Token      | Value |
| ---------- | ----- |
| `space-1`  | 4px   |
| `space-2`  | 8px   |
| `space-3`  | 12px  |
| `space-4`  | 16px  |
| `space-5`  | 20px  |
| `space-6`  | 24px  |
| `space-8`  | 32px  |
| `space-10` | 40px  |
| `space-12` | 48px  |

---

## Components

### Button
- **Ghost** — `neutral-200` bg, `neutral-700` text, `shadow-xs`, `radius-lg` (PRESETS, CONFIG)
- **Ghost Emphasis** — same as ghost but weight 800 (CLOSE, SNAP — the value side of a param row)
- **Primary** — `primary` bg, `neutral-50` text, `radius-lg` (reserved for the main action)
- **Teal** — `secondary-200` bg, `secondary-700` text, `radius-lg`

### Tab Bar
Row of pills on the page background.
- Inactive tab: `neutral-200` bg, `neutral-700` text, `ui-sm` style, `shadow-xs`
- Active tab: `secondary-200` bg, `secondary-700` text, `radius-lg`, no shadow

### Toggle
- Track: 46×24px, `radius-full` — On: `primary` fill · Off: `neutral-300` fill
- Thumb: 18×18px, `radius-full`, `white` fill, 3px inset

### Slider
- Track: 4px tall, `neutral-300` fill, `radius-xs`
- Thumb: 14px circle, `primary` fill
- Numeric value uses `data` style, left of the track

### Card / Panel
- `neutral-50` bg, `radius-xl` (24px), `shadow-xs`
- Parameter card variant: `PARAMETER NAME` in `label`, `Value` in `data`

### Keyboard & Note Visualization

The keyboard carries two independent color systems — **input** (which physical keys do
what) and **output** (which notes the engine is producing). Keep these palettes distinct.

**Base keys (input, neutral):**
- White key: `white` bg, `shadow-sm` inset bottom, `radius-sm` bottom corners
- Black key: `neutral-700` bg

**Spice-zone overlay (input — the coral region that adds chord color):**
- Spice white key: `warm-200` bg, `warm-300` shadow
- Spice black key: `warm-400` bg
- Spice-zone handle: `primary` bar, `neutral-50` label + grips, `radius-md` bottom corners
- Labeled `SPICE ZONE` (was `MOD ZONE`)

**Root-zone overlay (input — the region where pressed notes set the chord root):**
- Toggled region below the keyboard (`ROOT ZONE: C2–B2`); tint TBD — see open questions.

**Note output overlay (teal — the chord the engine emits, layered over base keys):**
- Root note: `secondary-600`
- Active chord note: `secondary-300`
- Ghost note (present in full chord but culled by current Pitch-Bend size): translucent teal / `secondary-100`

**Note bars (output histogram):** teal ramp `secondary-600 → 400 → 300 → 200`, height = velocity.

### Perf wheels (PITCH / MOD)
- Vertical track: `neutral-200` bg, `neutral-300` border, `radius-lg`
- Thumb: `primary` bar; `neutral-300` when untouched
- Sub-label: `mono` + `data`, e.g. `SIZE 4/4`, `INV +3`

### Icons
- `config` (≡♪) — flip-to-config action
- `settings` (spark/asterisk) — reserved

---

## Do's and Don'ts

- **Do** use token names when specifying values — never hardcode hex or px directly
- **Do** keep **input** color (coral/warm spice zone, root zone) and **output** color (teal
  note overlay) visually separate — a key can be both an input and lit as output at once
- **Do** use `mono` (JetBrains Mono, uppercase) for all MIDI-related and technical labels
- **Don't** introduce new colors or font sizes outside this scale without updating the system
- **Don't** use `secondary` (teal) for decorative purposes — teal is reserved for active
  states and note **output** visualization
- **Don't** use `tertiary` (red/green/blue) for anything but functional system feedback
- **Don't** use blur-based shadows — all elevation uses solid-color pixel offsets
</content>
</invoke>
