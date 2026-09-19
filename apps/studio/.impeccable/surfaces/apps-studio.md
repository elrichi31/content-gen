---
version: 1
slug: "apps-studio"
primary_target: "apps/studio"
related_targets: []
---

## Scope

Surface: apps/studio (whole app shell + shared UI system). Mode: Operate.
Audience: Nicolas + small internal team, daily use, multi-brand content operations. Task: scan/manage content across generation formats, act fast, always know which brand/campaign context they're in. Constraints: preserve carousel slide-renderer CSS untouched; preserve all existing functionality/routes/data; component library swap is full (HeroUI replaces Radix/shadcn primitives); icons are Lucide.

## Direction contract

THESIS: A workspace, not a dashboard — Notion's plain document-and-blocks language (flat surfaces, thin hairline borders, generous whitespace, text-led hierarchy) replaces the current glass-blur/gradient SaaS-dashboard default. No cards-as-decoration, no glow, no backdrop blur.

OWN-WORLD: Near-white/near-black neutral scale with a single muted accent (used sparingly: active nav state, primary actions, focus rings) — Committed-strategy color rejected in favor of Restrained, per Operate default. 1px hairline borders (not shadows) delineate regions. Corners: small radius (6-8px), never pill-shaped except badges/avatars. Typography: one system/workhorse sans stack (Inter-class) for UI text, monospace only for numeric/code data — no display serif, no multi-font showcase (current Geist/Playfair/Space Grotesk/Sora stack is replaced). HeroUI components restyled via theme tokens to this flat, bordered, low-chroma language — no HeroUI default shadows/gradients. Lucide icons, 18px, stroke-width 1.5, never filled. Sidebar reads as a Notion workspace switcher: flat list, small icons, muted-until-hover text, no active-pill background — an active item gets a subtle bg + left accent hairline, not a filled button.

STORY: Operator opens the app, immediately reads which brand/route they're in from a slim breadcrumb-style header (no hero banners), scans dense lists/tables of content items without visual noise, and acts (generate, schedule, approve) via clear inline actions rather than hunting through chrome.

FIRST VIEWPORT: Fixed 240px sidebar (workspace-style: brand switcher/logo row, grouped nav with small uppercase muted group labels, flat items) + main column with a slim sticky page header (title + breadcrumb + primary action, ~56px, bottom hairline only) + content area with generous side padding, tables/lists as the default content shape (bordered rows, not shadowed cards).

FORM: Pinned by explicit user brief (HeroUI + Lucide + "estilo Notion") — no concept-seed roll; direction assigned directly per new-work.md step 1 (redesign) with a brief-pinned world.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
