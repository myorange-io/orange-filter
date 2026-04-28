# Orangeimpact UI Kit

A recreation of Orangeimpact's core surfaces — the AI proposal composer, organization dashboard, and pricing page — using only tokens from `../../colors_and_type.css`.

## Components
- `Header.jsx` — top bar with logo, workspace switcher, and user avatar
- `Sidebar.jsx` — left rail in the app (proposals, templates, team, settings)
- `ProposalComposer.jsx` — split-pane editor with AI assist panel
- `ProposalCard.jsx` — card for the dashboard grid
- `PricingCard.jsx` — plan card used on the pricing page
- `Button.jsx`, `Chip.jsx`, `Field.jsx` — primitives
- `Icon.jsx` — Lucide SVG wrapper

## Screens (in `index.html`)
1. **Dashboard** — recent proposals grid + "새 제안서" primary CTA
2. **Composer** — AI-assisted proposal editor
3. **Pricing** — `플랜 상세 비교` page

Screens share chrome via a small router (hash-based) so the index.html is a real clickable prototype.
