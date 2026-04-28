---
name: orangeimpact-design
description: Use this skill to generate well-branded interfaces and assets for Orangeimpact (a Korean social-impact AI proposal-writing SaaS), either for production or throwaway prototypes/mocks/slides. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available files.

Key files:
- `README.md` — product context, content fundamentals, visual foundations, iconography
- `colors_and_type.css` — canonical CSS variables (colors, type, spacing, shadows)
- `fonts/PretendardVariable.woff2` — self-hosted brand typeface
- `assets/` — logos and the circle-O mark
- `ui_kits/orangeimpact/` — reusable JSX components (Header, Sidebar, ProposalComposer, PricingCard, primitives) and a working multi-screen demo at `index.html`
- `preview/` — design-system spec cards

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. Import `colors_and_type.css` rather than hand-rolling colors. For any icon, use Lucide via CDN — do NOT add emoji or redraw icons from scratch.

If working on production code, you can copy assets and read the rules in `README.md` to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design (a new screen, a landing page, a pitch deck, a specific component), ask a few clarifying questions about audience and scope, then act as an expert designer who outputs HTML artifacts _or_ production code.

Writing rules for Orangeimpact copy:
- Korean-first, polite formal register (`-세요`, `-합니다`).
- English product terms are fine in parentheses after the Korean: `도움말(Helper Text)`.
- No emoji. No exclamation marks. Avoid casual tone.
- Arabic numerals only; `tnum` figures for dashboard data.
