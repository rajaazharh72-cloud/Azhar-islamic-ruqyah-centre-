# Geometric pattern construction notes

The SVG ornament in `index.html` is not decorative guesswork — the star polygons are
constructed from real coordinates. These notes exist so the geometry can be regenerated
or extended correctly.

## The octagram (khatam) — {8/2} star polygon

An 8-pointed star formed by two overlapping squares. For an outer radius `R`:

- **Outer vertices** — 8 points at radius `R`, at angles `k · 45°`
- **Inner vertices** — 8 points at radius `r = R · cos(45°) / cos(22.5°) ≈ 0.76537 · R`,
  at angles `22.5° + k · 45°`

Derivation of the inner radius: square A has the edge `x + y = R`; square B (rotated 45°)
has the edge `y = R/√2`. They meet at `(R(1 − 1/√2), R/√2) = (0.2929R, 0.7071R)`, whose
radius is `R·√(0.2929² + 0.7071²) ≈ 0.76537R` at an angle of 67.5°.

So every inner vertex is a permutation of `(±0.2929R, ±0.7071R)` and every outer vertex is
either `(±R, 0)`, `(0, ±R)` or `(±0.7071R, ±0.7071R)`.

The path walks outer → inner → outer alternately, 16 vertices in total.

| R | outer axis | outer diagonal (R/√2) | inner short (0.2929R) | inner long (0.7071R) |
|---|---|---|---|---|
| 60 | 60 | 42.426 | 17.573 | 42.426 |
| 26 | 26 | 18.385 |  7.615 | 18.385 |
| 10 | 10 |  7.071 |  2.929 |  7.071 |

## Tiling

Stars sit on a square lattice of pitch `a` with `R = a/2`, so each star's axis points land
exactly on the midpoints of the tile edges and meet the neighbouring star's point. The
negative space left between any four stars is the classic cross (khatam-and-cross).

The pattern tile is `120 × 120` with `R = 60`, drawing the star at all four corners. SVG
clips pattern content to the tile, so each corner contributes one quarter and the tiling is
seamless by construction.

## Divider

`viewBox="0 0 1200 80"`, centred medallion at `(600, 40)` with `R = 26`, flanked by two
small stars at `(545, 40)` and `(655, 40)` with `R = 10`, and tapering rules to each edge.

Every path carries `pathLength="1"` so CSS can animate
`stroke-dasharray: 1; stroke-dashoffset: 1 → 0` for the line-drawing reveal on scroll.
