---
name: Content Gen
description: Internal AI content studio, sharing BethaSpend's (control-gastos) CRM-style system on shadcn/ui + Radix.
colors:
  primary: "hsl(141 45% 40%)"
  primary-dark: "hsl(141 45% 45%)"
  background: "hsl(0 0% 100%)"
  background-dark: "hsl(240 4% 5%)"
  card-dark: "hsl(240 4% 6.5%)"
  popover-dark: "hsl(240 4% 9%)"
  sidebar: "hsl(0 0% 98%)"
  sidebar-dark: "hsl(240 5% 4%)"
  muted: "hsl(240 5% 96%)"
  muted-dark: "hsl(240 4% 11%)"
  accent: "hsl(240 5% 95%)"
  accent-dark: "hsl(240 4% 12%)"
  border: "hsl(240 6% 91%)"
  border-dark: "hsl(240 4% 13%)"
  input: "hsl(240 6% 89%)"
  input-dark: "hsl(240 4% 16%)"
  foreground: "hsl(240 10% 8%)"
  foreground-dark: "hsl(0 0% 96%)"
  muted-foreground: "hsl(240 4% 46%)"
  muted-foreground-dark: "hsl(240 4% 56%)"
  destructive: "hsl(0 72% 51%)"
  chart-1: "hsl(217 91% 55%)"
  chart-2: "hsl(152 60% 38%)"
  chart-3: "hsl(32 95% 48%)"
  chart-4: "hsl(262 70% 60%)"
  chart-5: "hsl(350 80% 55%)"
typography:
  ui:
    fontFamily: "Inter, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "14px"
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "11px"
    fontWeight: 500
  heading:
    fontFamily: "Inter, sans-serif"
    fontSize: "20px"
    fontWeight: 600
  mono:
    fontFamily: "Geist Mono, monospace"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
spacing:
  sidebar: "240px"
  sidebar-collapsed: "64px"
  header: "56px"
  gutter: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    height: "36px"
  card:
    rounded: "{rounded.xl}"
    border: "1px {colors.border}"
    shadow: "shadow-xs"
---

# Design System: Content Gen

## Overview

**Creative North Star: "One family with BethaSpend"**

Content Gen now shares its visual system with BethaSpend (the control-gastos app), by explicit
user request: the same CRM-style workspace in the vein of Attio/Linear. Dark mode is near-black
with surfaces stepped only slightly apart (background 5% → card 6.5% → popover 9%), hairline
borders do the separating, and one green primary carries every action. Light mode is white with a
#fafafa sidebar. The theme follows the operating system, with a toggle in the sidebar.

Components are shadcn/ui on Radix primitives, kept behind the existing names in
`components/ui/` so screens never import Radix directly. Notifications are shadcn's Sonner
toasts. Icons are Lucide at 16px, stroke 1.75 in navigation.

The content previews (carousel slide renderer, Instagram/TikTok frames, ad renderer) render the
actual social content and keep their own look; their CSS block at the end of `globals.css` is
never part of a redesign.

## Colors

- **Primary green** (`hsl(141 45% 40%)`, dark `45%` lightness): primary buttons, active states,
  focus rings, links, the favicon. The only saturated color in app chrome.
- **Surfaces**: background, card, popover, sidebar, muted and accent are near-identical neutrals
  (hue 240, ~4% saturation). Depth comes from these small steps plus a 1px border.
- **Destructive red** for destructive actions and error toasts; chart-1…5 only for data.
- Tokens are full colors (`hsl(...)`), not HSL triplets: the carousel preview CSS reads
  `var(--primary)` and `var(--foreground)` directly.

## Typography

Inter for all interface text (`--font-inter`), with ligatures on. Base UI size is 13px
(buttons, nav, selects, labels); inputs are 16px on mobile and 14px from `md` so iOS does not
zoom. Page title 20px/600, card title 14px/600, group labels 11px/500 uppercase with wide
tracking in muted ink. Geist Mono only for data. Playfair, Space Grotesk, Sora, Geist and
Archivo stay loaded only for the carousel and ad content.

## Layout

- **Sidebar**: fixed, 240px, collapsible to 64px icons; the width lives in `--sidebar-w` on
  `<html>` (class `sidebar-collapsed`, persisted in localStorage and applied before hydration).
  Grouped nav with uppercase group labels and a hairline between groups. Active item: accent
  fill, hairline border, semibold, `shadow-xs`. Footer: theme toggle, collapse button and a user
  card (initials, name, email, sign out).
- **Top bar**: fixed, 56px, translucent background with blur, route crumb
  ("Crear / Carrusel") and the user pill.
- **Page**: `max-w-7xl`, `px-4 py-5` → `sm:px-6 sm:py-6`. `PageHeading` is title + description +
  actions, no eyebrow (the route is already in the top bar).
- **Mobile** (< md): top bar with menu button; the sidebar opens as a left sheet.

## Elevation & Depth

Flat by default: cards and inputs get `shadow-xs` only; popovers, selects and toasts get
`shadow-lg`. Overlays use an opaque black scrim (`bg-black/60`), never blur on content.

## Shapes

Radius 8px base (`rounded-lg`) for buttons, inputs and selects; 12px (`rounded-xl`) for cards
and workspace panels; 6px for badges and menu items; full round only for avatars and switches.

## Components

- **Button**: 36px, 13px medium, `active:scale-[0.97]`. Primary has an inner top highlight and a
  1px primary ring. Variants: default, outline (card fill + border), secondary, ghost,
  destructive, link.
- **Input / Textarea / Select trigger**: card fill, `border-input`, `shadow-xs`; focus shifts the
  border to the ring color with a soft 3px ring at 20%.
- **Badge**: soft tinted fill with a matching 30% border (primary, destructive) or neutral.
- **Tabs**: segmented list on `muted/50` with a border; active tab is a card chip with ring.
- **Sheet**: Radix dialog sliding from the edge with the iOS drawer curve; title is required
  (use `SheetTitle`, `sr-only` if hidden).
- **Toasts**: Sonner, bottom-right, popover surface with border. Success auto-closes in 6s;
  errors stay until closed. Screens keep using `<Notice>`, which now fires the toast.

## Do's and Don'ts

### Do
- Use the semantic tokens (`bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`).
- Keep green for actions and states; status colors only for real states.
- Report results with `<Notice>` / toasts, not inline banners.

### Don't
- Don't add eyebrows above headings, gradients, glows or glass on app chrome.
- Don't touch the carousel/ad preview renderers or their CSS block.
- Don't import Radix or Sonner directly from screens; go through `components/ui/`.
