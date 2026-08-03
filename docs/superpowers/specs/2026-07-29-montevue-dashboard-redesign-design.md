# MonteVue Dashboard Redesign — Design

**Date:** 2026-07-29
**Scope:** `StressTest.tsx` (MonteVue) layout, `PortfolioSummary`, `CorrelationHeatmap`, `EfficientFrontier`, `theme.css`
**Out of scope:** Landing page, Vantage module, all `src/lib/` financial math

## Problem

Three complaints, all confirmed against the code rather than assumed:

1. **Dead space in the left column.** `.cockpit` is `grid-template-columns: 300px 1fr 300px` with `align-items: start` (`StressTest.css:4-9`). The left column holds only `PortfolioSummary` (`StressTest.tsx:89-91`) while center holds hero + stat row + fan chart and right holds three cards. The left rail therefore ends early and everything below it is empty — and the gap grows as the portfolio card grows, because the card renders one row per holding with no cap.

2. **Vertical scrolling.** `.analysis-row` (correlation heatmap + efficient frontier) is rendered *below* the cockpit (`StressTest.tsx:202-218`), pushing the dashboard past one screen.

3. **Visual direction.** The current look is near-black with a blue accent. The user supplied a reference image: a downward red→white ombre gradient with glassmorphic cards.

Two further blockers were discovered during exploration and are part of this design:

4. **The heatmap grows with the portfolio.** `CorrelationHeatmap` renders an N×N grid, one row/column per holding (`CorrelationHeatmap.tsx:54`), with `aspect-ratio: 1` and `min-height: 34px` per cell. At the full 13-asset universe that is roughly 520px square — it would overflow a 360px column and destroy any fixed-height layout. Capping the portfolio card alone is not sufficient.

5. **The frontier is far too tall to span full width.** `EfficientFrontier` uses `viewBox 460×300` with `width: 100%; height: auto` (`EfficientFrontier.tsx:17`, `EfficientFrontier.css:2`). At today's half-width (~625px) it already renders ~407px tall — this is the "oversized card" already noted in `CLAUDE.md`. Stretched to full width (~1290px) it would render **~840px tall**, worse than the status quo.

## Decisions taken

Recorded because two of them reverse previously documented positions:

- **The red ombre overrides `CLAUDE.md`.** `CLAUDE.md` lists "ambient warm-terracotta gradients" and "warm gold palettes" under *Rejected directions (do not revisit)* and specifies "dark, cool-toned, near-black with a blue accent". The user was shown this conflict and chose to reverse it. `CLAUDE.md` will be updated so the file stops contradicting the app.
- **Text stays light throughout**, per explicit user instruction, rather than flipping to dark on the pale end of the gradient. Contrast is instead carried by the card tint: glass cards lower on the page use a deeper red tint, which is how the panels actually read in the reference image.
- **The frontier spans all three columns**, not center+right as in the reference. The reference leaves a gap at bottom-left; spanning full width removes it entirely and gives the frontier the width a scatter plot wants.
- **Charts are compressed toward a ~900px viewport** rather than matching the reference's ~990px content height. Note that a full no-scroll result at 1440×900 is *not* achievable this way — see the height budget in §3 for what actually lands.

## 1. Layout — one grid replaces two

`.cockpit` and `.analysis-row` merge into a single named-area grid so all seven cards participate in one layout.

```css
.cockpit {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr) 360px;
  grid-template-areas:
    "portfolio hero     crash"
    "sidestack fan      corr"
    "frontier  frontier frontier";
  gap: var(--s5);
  align-items: stretch;
}
```

`minmax(0, 1fr)` on the center column is required — a bare `1fr` would let the fan chart's SVG establish a minimum content width and push the grid wider than its container.

| Area | Contents |
|---|---|
| `portfolio` | `PortfolioSummary` |
| `hero` | hero Card + `.stat-row` (3 stat cards), stacked |
| `crash` | Historical Crash Replay card, stretched to match the stat row's bottom edge |
| `sidestack` | Risk Profile card + `RetirementCard`, stacked |
| `fan` | fan chart / crash replay chart card |
| `corr` | correlation heatmap card |
| `frontier` | Risk vs. Return frontier, spanning all three columns |

In `StressTest.tsx`, the three `<aside>` / `<section>` wrappers and the separate `.analysis-row` block are replaced by seven area divs. The right column widens 300px → 360px to give the heatmap room for labels; the left stays 300px.

The `.analysis-row` and `.analysis-card` rules are deleted from `StressTest.css`.

**Responsive:** below 1100px the grid collapses to `grid-template-columns: 1fr` with all seven areas stacked in reading order (portfolio, hero, crash, sidestack, fan, corr, frontier). This matches the existing single-column collapse behaviour.

## 2. Portfolio card — capped at four rows

`PortfolioSummary.tsx` currently maps every holding to a row. New behaviour:

- Define `MAX_ROWS = 4` (matching the four default holdings in `INITIAL_HOLDINGS`).
- When `holdings.length <= 4`: render exactly as today.
- When `holdings.length > 4`: sort holdings by `dollars` descending, render the top 3, then a fourth **synthetic** row:
  - name: `Other assets`
  - swatch: `var(--text-muted)` (neutral, distinguishable from real asset colors)
  - weight: the summed remainder — a dollar sum in `$` mode, `remainder / total` in `%` mode, so both toggle states stay correct
  - a `title` tooltip listing each collapsed holding's name and individual weight

  The tooltip is not decoration: `CLAUDE.md`'s design philosophy requires every number to carry its interpretation, and an opaque "Other assets · 25%" would hide information the user needs.
- The stacked allocation bar continues to render **all** real segments. It shows true composition and costs no vertical height.
- The card's height is locked so the grid row never shifts, via a single custom property `--ps-card-h` defined once in `PortfolioSummary.css`. Initial value 264px, to be confirmed by measurement. Content is top-aligned, so the card holds the same height for an empty or single-asset portfolio as for a capped one.

Sorting is for display only. `holdings` state order and everything passed to the math engines are untouched.

## 3. Charts fit the height budget

**Heatmap** (`CorrelationHeatmap.tsx`, `.css`):
- Define `MAX_HEAT = 6`. Filter to `dollars > 0` as today, sort by `dollars` descending, take the top 6.
- When capped, the card's `section-note` reads `top 6 holdings · hover a cell`, and the footer states how many holdings are not shown.
- Cell `min-height` 34px → 30px.
- `correlation()` in `src/lib/assets.ts` is **not** touched. Only real pairwise correlations between real assets are displayed — there is no "Other assets" row here, because averaging correlations is not valid math and inventing an aggregate correlation would violate the golden rule.

**Frontier** (`EfficientFrontier.tsx`, `.css`):
- Reshape the geometry constants from `W = 460, H = 300` to `W = 1100, H = 170` — a wide, flat ratio suited to the full-width row. `PAD_L` stays 44 (y-axis tick labels), `PAD_R` stays 16, `PAD_T` 16 → 10, `PAD_B` stays 36 (x-axis title and ticks both live there and do not shrink with the plot).
- Add `max-height: 170px` to `.ef-svg` so the SVG cannot scale past its natural height in a ~1290px-wide container.
- This is coordinate mapping inside a component, not engine math, so it is not a `CLAUDE.md` "formula" change. It is still verified: the plotted portfolio dot and frontier line must correspond to the same underlying (risk, return) data as before. Verification method — capture `frontier.current` and several `frontier.cloud` points, then confirm that inverting the new pixel mapping returns those same data values, and that the portfolio dot still sits on the frontier line at its own risk level.

**Fan chart:** fixed height 200px.

**Height budget.** Card chrome is the dominant cost and is easy to under-count: each card carries `var(--s5)` padding top and bottom (48px total) plus a `.section-head` (~32px), and the frontier and heatmap each add a legend/footer row (~18px). A 170px frontier SVG therefore yields a ~270px card, not a 170px one.

Realistic totals with the compressions above:

| Band | Target |
|---|---|
| page padding (top + bottom) | 48px |
| TopBar | ~70px |
| Row 1 (hero ~145 + gap 24 + stat row ~121) | ~290px |
| Row 2 (chart cards) | ~280px |
| Row 3 (frontier card) | ~270px |
| row gaps (2 × 24) | 48px |
| **Total** | **~1006px** |

Consequences, stated plainly rather than optimistically:

- **1920×1080** (~980px usable): fits or comes within a few pixels. This is the no-scroll target.
- **1440×900** (~800px usable): roughly **200px of residual scroll remains.** Eliminating it entirely would require chart heights small enough to damage the charts, which is the tradeoff the user rejected when choosing this option over the viewport-relative one.

To reach the 1080p target, page padding drops from `var(--s6)` to `var(--s5)` and the hero card's padding drops from `var(--s6)` to `var(--s5)`.

Every figure in this table is an estimate derived from the CSS, not a measurement. All chart heights are defined as CSS custom properties (`--fan-h`, `--ef-h`) so they can be tuned in one place against real measurements during implementation. The acceptance criterion is the measured result in §Verification, not this table.

## 4. Theme — red ombre + glassmorphism

All changes land in `src/styles/theme.css`.

**Scoping — important:** the gradient is applied to `.app-shell`, **not** `body`. `App.tsx:17` adds a `v2` class to `body`, and `body.v2`'s background is shared with the Landing page. Landing is unfinished and out of scope, so it must keep its current appearance.

**Gradient tokens:**

```css
--ombre-top: #3A0F0F;  /* deep oxblood */
--ombre-mid: #A8503C;  /* terracotta   */
--ombre-low: #E8CFC4;  /* pale clay    */
--ombre-end: #F5EAE4;  /* warm off-white */
```

Applied as a fixed `linear-gradient(180deg, ...)` with stops near 0% / 45% / 85% / 100%, so the wash reaches white only at the very bottom of the viewport.

**Glass tokens** — tint deepens with vertical position so light text survives the pale end:

```css
--glass-tint-hi:  rgba(58, 15, 15, 0.38);   /* row 1 cards */
--glass-tint-mid: rgba(74, 22, 18, 0.46);   /* row 2 cards */
--glass-tint-lo:  rgba(88, 30, 24, 0.55);   /* row 3 / frontier */
--glass-border:   rgba(255, 255, 255, 0.16);
--glass-blur:     18px;
```

`.card` gains `backdrop-filter: blur(var(--glass-blur))` (with `-webkit-` prefix) as default behaviour rather than an opt-in class. Row placement selects the tint.

**Accent:** `--accent: #E8563F`, `--accent-bright: #FF7A5C`, with `--accent-dim` / `--accent-glow` updated to match. Every component already references these tokens, so the fan chart, frontier, risk bars and hero glow follow automatically.

**Text:** `--text-primary: #FFF5F2`, `--text-secondary: rgba(255,240,236,0.78)`, `--text-muted: rgba(255,235,230,0.58)`. The hero value's gradient becomes `linear-gradient(180deg, #fff, #FFD9CE)`.

**Gain/loss** keeps hue *and* the existing arrow icons. On a warm background a saturated red loss chip nearly vanishes — visible in the reference image, where the `-39.3%` chips disappear into their own panel. So chips get contrast from a darker background rather than hue alone:

- gain: `color: #7BE8A8` on `rgba(10, 60, 35, 0.45)`
- loss: `color: #FFD9D2` on `rgba(120, 20, 10, 0.55)`

Arrows are retained, so meaning survives for colorblind users — the `CLAUDE.md` accessibility rule holds.

**Heatmap scale is left as-is:** blue for positive correlation, amber for negative. It is a divergent two-hue scale that stays legible on the warm background, and the reference image keeps it too.

**Dead code removed:** `--gold`, `--gold-bright`, `--gold-dim`, `--gold-glow`, `--electric-1`, `--electric-2`, `--font-display`, and the `.glass` / `.electric` opt-in rules. A grep across `src/` confirms no component references any of them. `--font-grotesk`, `--font-mono` and the `body.v2 .tabular` mono rule are kept and unchanged.

**Sidebar** keeps its current structure and its existing icon components (`LogoMark`, `IconStress`, `IconValuation`, `IconScreener`, `IconSettings`) exactly as they are, per explicit user instruction. Only its surface colors are restyled to sit on the gradient.

## 5. Sequencing

`CLAUDE.md` states that bundling speculative visual changes is precisely how this project has broken before. So this ships as four commits, each measured and screenshotted, each stopping for confirmation before the next:

1. Grid restructure (§1)
2. Portfolio card capping (§2)
3. Chart resizing (§3)
4. Theme (§4)

Then a fifth commit updating `CLAUDE.md`: the visual-direction section, the "correlation/frontier cards are oversized" known-open item (resolved by §3), and the MonteVue layout description.

## Verification

Layout claims must be measured, not eyeballed — `CLAUDE.md` requires evidence before any "fixed" claim.

- Playwright is **not** currently installed in this project and no browsers are cached. It needs `npm i -D playwright` plus a Chromium download (~100MB). Ask the user before installing.
- For each commit, at 1440×900 and 1920×1080: screenshot, then report the exact value of `document.scrollHeight - window.innerHeight`, and measure the bounding box of every card. The pass condition is no overflow at 1920×1080; at 1440×900 the residual overflow is recorded as a number, not treated as a failure.
- Specifically verify: no dead space in the left column; the portfolio card's height is identical at 4 and at 8 holdings; the heatmap's width and height are constant from 6 holdings upward; the frontier card renders under 280px tall at full width.
- Confirm `backdrop-filter` actually renders (it is silently dropped in some configurations) rather than assuming the glass effect is present.
- Test portfolios: the 4-asset default, a single asset, an empty portfolio, 8 assets, and all 13.
- Frontier math verified by the inverse-mapping check described in §3.
- `npx tsc --noEmit` clean after each commit.
