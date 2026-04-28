# myorange Design System (ODS v2.0)

Design system for **myorange** (마이오렌지) — the parent company — and the surfaces it publishes under:

- **orangeimpact** (오렌지임팩트) — the product/solution. A Korean SaaS that uses AI specialized for social‑impact work to help organizations write the most persuasive grant/funding proposals.
- **orangeletter** (오렌지레터) — the company newsletter.

> 소셜 임팩트 특화 AI와 가장 설득력 있는 제안서를 완성하세요
> *"Complete the most persuasive proposal with social‑impact‑specialized AI."* (orangeimpact hero)

The system is orange‑led, Korean‑first (Pretendard typeface), with a calm zinc neutral scale and a reserved blue accent for informational and secondary actions. Each surface has its own lockup and symbol but shares the same color, type, and component vocabulary.

---

## Sources

- **Figma file:** `[ver 2.0] ODS.fig` (mounted read‑only as a virtual filesystem in this project).
  - Page `cover/` — "Orangeimpact Design System ver 2.0" cover frame.
  - Page `page/` — 94 frames covering the color scales (Orange / Blue / Neutral), text‑role semantic tokens (Strong, Normal, Alternative, Assistive, Disabled, Helper Text, Non‑Interactive, Secondary Action), and a typography sheet (Heading XS–XL, Body XS–L in Bold/Medium/Regular, Data).
- No codebase was attached. UI components in this system are built from the Figma foundations.

---

## Index — what lives at the root

| Path | What it is |
|---|---|
| `README.md` | This file — manifest, content fundamentals, visual foundations, iconography. |
| `SKILL.md` | Claude Skill entrypoint (works inside this project and as a downloadable Agent Skill). |
| `colors_and_type.css` | The canonical CSS variable layer — color tokens, type scale, semantic helpers. |
| `fonts/` | Pretendard web fonts (variable). |
| `assets/` | Logos, marks, and shared raster/vector assets. |
| `preview/` | Design‑system spec cards (colors, type, components, tokens) shown in the Design System tab. |
| `ui_kits/orangeimpact/` | UI kit — real product screens (composer, dashboard, pricing) with reusable JSX components. |

Product surfaces covered in `ui_kits/`:

- **orangeimpact** — the proposal‑writing web app: a split‑pane AI composer with an organization dashboard, templates, and a pricing page.

Additional brand surfaces (logos only; no UI kit yet):

- **myorange** — corporate / company pages. Symbol: the 3‑petal "M" crown mark.
- **orangeletter** — the company newsletter. Symbol: the dot (the `.` at the end of the wordmark doubles as the mark).

---

## Content fundamentals

Copy is written for Korean nonprofit staff, grant writers, and social‑enterprise operators. The voice is **encouraging but professional** — the product helps you win funding, so the tone is confident, never playful.

- **Language.** Korean‑first. English is used sparingly for product terms of art (e.g. `AI`, `Plan`, `Pro`). Where a product concept has a widely understood English term, the Korean term is shown first with the English term in parentheses: `도움말(Helper Text)`, `상호작용이 불가능함(Non-Interactive)`, `2차 액션(Secondary Action)`. Never English‑only for a Korean user.
- **Pronouns & address.** Addresses the reader with polite formal Korean (`‑세요`, `‑합니다`). Not the casual `반말` form. The product is "you" speaking to the user; it is not a chatty character.
- **Casing.** English words use **Title Case** for labels and product terms ("Secondary Action", "Helper Text", "Design System"), **sentence case** for descriptive sentences, and preserve the official lowercase/mixed casing of brand marks (`ver 2.0`). Numeric scales are written as hex codes in caps (`FAFAFA`, `737373`) or as scale numbers (`50`, `500`, `950`).
- **Numerals.** Always Arabic numerals, never Korean‑script numbers. Units are lowercased (`px`, `rem`). `0.5px` and `-0.5px` letter‑spacing values are shown exactly.
- **Punctuation.** Korean sentences use standard Korean punctuation. English inclusions keep English punctuation (straight apostrophes inside quoted examples: `'취소'`, `'닫기'`).
- **Sentence rhythm.** Short, declarative sentences. Headings are statements of value, not questions. The hero line "소셜 임팩트 특화 AI와 가장 설득력 있는 제안서를 완성하세요" is the canonical voice sample — a single imperative sentence, no period, no exclamation.
- **Emoji.** Not used. The brand communicates warmth through the orange palette and the friendly‑but‑serious typography, not through emoji. Do not add emoji to Orangeimpact surfaces.
- **Exclamation marks.** Avoid. The product respects the seriousness of the user's work (nonprofit funding).
- **Naming semantic tokens.** Text roles are named after their *intent*, not their color: `Strong`, `Normal`, `Alternative`, `Assistive`, `Disabled`, `Helper Text`, `Non‑Interactive`, `2차 액션 (Secondary Action)`. Prefer the semantic name in code (`--fg-strong`, not `--neutral-900`).

**Example copy — keep this feel:**

- Page title: `플랜 상세 비교` ("Plan detail comparison")
- Subtitle: `플랜 상세 비교입니다.` ("This is the plan detail comparison.")
- Chip: `ver 2.0`
- Field helper: `도움말(Helper Text) 제공` ("Provides helper text")
- Disabled state note: `상호작용이 불가능함(Non-Interactive)을 시각적으로 알림` ("Visually signals that interaction is not possible")

---

## Visual foundations

**Color philosophy.** One hero color (orange), one reserved accent (blue), a full neutral ramp. All surfaces are built from these three ramps — no tertiary hues, no gradients of arbitrary color pairs. White is the default canvas; tinted surfaces are always a `50` or `100` step of orange or blue.

- **Orange** is used for primary action, brand identity, and emphasis (chips, primary buttons, focused highlights). The `500` step (`#FF6F1F`) is the reference brand color.
- **Blue** is used for informational callouts, links in dense content, and secondary actionable UI. The `500` step (`#0075FF`) is the reference accent.
- **Neutral (zinc)** carries the entire product shell — text, borders, backgrounds, and non‑interactive surfaces.
- **Backgrounds.** Flat white (`#FFFFFF`) for the product. The cover uses a gentle vertical gradient from `#FFFFFF` → `#FFF2E7` (white to Orange 100) — this gradient is reserved for marketing/hero surfaces, never used on product chrome. No hand‑drawn illustration, no textures, no noise, no patterns. Imagery when used is photographic and warm‑toned (not cool, not grayscale).
- **Transparency & blur.** Used only for modal scrims (`rgb(10 10 10 / 0.5)`) and sticky headers over scroll (`backdrop-filter: blur(12px)` on `rgb(255 255 255 / 0.8)`). Not used decoratively.

**Typography.** [Pretendard](https://cactus.tistory.com/306) — a free, modern Korean/Latin sans‑serif that pairs hangul and Latin glyphs with matched vertical metrics. Weights in use: **400 Regular**, **500 Medium**, **700 Bold**. No italic. No condensed. No display cut.

- **Heading — all Bold 700:**
  - `Heading/XL` — 48 px / 68 lh
  - `Heading/L`  — 36 px / 48 lh
  - `Heading/M`  — 32 px / 42 lh
  - `Heading/S`  — 24 px / 32 lh
  - `Heading/XS` — 20 px / 28 lh
- **Body — Bold 700 / Medium 500 / Regular 400 at each size:**
  - `Body/L`  — 18 px / 28 lh
  - `Body/M`  — 16 px / 26 lh
  - `Body/S`  — 14 px / 22 lh
  - `Body/XS` — 12 px / 18 lh
- **Letter‑spacing.** `-0.5px` on `Heading/XL`, `-0.3px` on `Heading/L`. `0.031em` on 11 px micro labels. Otherwise `0`.

**Spacing.** 4‑px grid: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / 80 / 120`. Component inner padding is always a multiple of 4.

**Radii.** Small `6` (inputs, chips inside cards), medium `8` (buttons, cards), large `12` (sheets, large cards), pill `999` (chips, tags like `ver 2.0`). No sharp corners in product UI.

**Borders.** `1px` solid. Default border color is Neutral 200 (`#E5E5E5`). Strong dividers use Neutral 300 (`#D4D4D4`). Selected/focused border is Orange 500.

**Shadows — elevation system.**

- `--shadow-xs`: `0 1px 2px rgb(10 10 10 / 0.04)` — resting buttons, list rows.
- `--shadow-sm`: `0 2px 6px rgb(10 10 10 / 0.06)` — cards at rest.
- `--shadow-md`: `0 8px 24px rgb(10 10 10 / 0.08)` — floating menus, popovers.
- `--shadow-lg`: `0 24px 48px rgb(10 10 10 / 0.12)` — modal dialogs.
- No colored (orange/blue) shadows. No inner shadows in product UI.

**Cards.** White fill, `1px` Neutral 200 border, `--shadow-sm`, `border-radius: 12px`, `padding: 24px` by default. Card headers are `Heading/S/Bold`, body is `Body/M/Regular`. No left‑color accents, no gradient card backgrounds.

**Animation.** Calm and functional.
- Duration: `150ms` for hover/press micro‑interactions, `200ms` for panel reveals, `280ms` for modal enter. Exit is always 20–40ms faster than enter.
- Easing: `cubic-bezier(0.2, 0, 0, 1)` ("ease‑out‑expo" feel) for entries; `cubic-bezier(0.4, 0, 1, 1)` for exits. No bounce, no overshoot, no spring physics. No "fun" scale pops.
- Motion is always **fade + small translate** (4–8 px). Never flip, rotate, or 3D.

**Hover states.**
- Filled (orange/blue) buttons: background steps **down** one token (`500 → 600`). Do not lighten.
- Outline / neutral buttons: background fills with Neutral 50 (`#FAFAFA`).
- Text links: underline appears; color stays the same.
- Cards: `--shadow-sm → --shadow-md`, and a `1px` border‑color shift to Neutral 300. No scale.

**Press / active states.**
- Filled buttons: step down a second token (`600 → 700`). No shrink / scale.
- A `1.5px` inset Orange 200 ring appears on focus‑visible (`box-shadow: 0 0 0 3px rgb(255 212 179 / 0.6)`). Keyboard‑only; mouse users don't see it.

**Disabled.**
- Background becomes Neutral 100, text becomes Neutral 400 (`Assistive`), border becomes Neutral 200. `cursor: not-allowed`. No opacity dimming of the whole control.

**Layout rules.**
- Max content width `1200px` centered for marketing surfaces, `1440px` for the app shell.
- Fixed app header (`64px`), fixed left sidebar in the composer (`280px`), composer canvas fills the rest.
- Page gutters: `80px` desktop, `24px` mobile.
- No overlapping floating elements (no full‑bleed hero with content overlay). Clarity > drama.

---

## Iconography

The Figma file does not define a custom icon system or icon font. For all product UI, Orangeimpact uses **[Lucide](https://lucide.dev/)** — linked from a CDN — because it matches ODS's visual temperature: rounded line‑cap strokes, `1.5px` stroke, 24×24 artboard, no fills. This is the closest open‑source match to the quiet, precise UI language the Figma type/color foundation implies.

- **Format.** Inline SVG via `lucide@latest` CDN (see `colors_and_type.css` import examples in `ui_kits/orangeimpact/index.html`).
- **Sizing.** Icons render at `16`, `20`, or `24` px. Never scale to non‑standard sizes.
- **Color.** Inherits `currentColor`. Default is `--fg-normal` (Neutral 700). Orange is reserved for icons that accompany a primary action (send, generate, upload‑to‑submit).
- **Emoji.** Never used as iconography or decoration.
- **Unicode symbols.** `·` (middle dot) for inline separators, `→` (rightwards arrow) for "see more" links. Nothing else.
- **Logo.** See `assets/orangeimpact-logo.svg` (wordmark) and `assets/orangeimpact-mark.svg` (circle‑O mark). The `o` in "orangeimpact" is set as a filled orange disc — this is the only permitted logo treatment.

> **Substitution flag.** The Figma file ships neither an icon sprite nor raster icons, so we substituted the closest CDN‑available match. If you have an internal icon set, drop it into `assets/icons/` and update `ICONOGRAPHY` here and `SKILL.md`.
