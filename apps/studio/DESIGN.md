---
name: Content Gen
description: Internal AI content studio, restyled as a flat Notion-style workspace on HeroUI v3.
colors:
  accent: "oklch(0.58 0.15 254)"
  accent-dark: "oklch(0.66 0.15 254)"
  background: "oklch(1 0 0)"
  surface: "oklch(1 0 0)"
  surface-secondary: "oklch(0.975 0.002 285.8)"
  surface-tertiary: "oklch(0.955 0.003 285.8)"
  border: "oklch(0.914 0.003 285.8)"
  foreground: "oklch(0.2103 0.0059 285.89)"
  muted: "oklch(0.5517 0.0138 285.94)"
  danger: "oklch(0.6532 0.2328 25.74)"
  success: "oklch(0.7329 0.1935 150.81)"
  warning: "oklch(0.7819 0.1585 72.33)"
typography:
  ui:
    fontFamily: "Geist, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  heading:
    fontFamily: "Geist, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.3
  mono:
    fontFamily: "Geist Mono, monospace"
rounded:
  base: "8px"
  field: "12px"
  xs: "2px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
spacing:
  sidebar: "240px"
  header: "56px"
  gutter: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.base}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: Content Gen

## Overview

**Creative North Star: "The Workspace, Not the Dashboard"**

Content Gen is an internal daily-driver for a small team producing AI content across formats (carousel, video, ads, articles). The redesign replaces a dark glass-and-gradient SaaS-dashboard look with a plain, document-like workspace in the language of Notion: flat white surfaces, hairline borders instead of shadows, one calm accent color, and text-led hierarchy. The app is read and operated many times a day by the same people, so the interface stays out of the way — no floating cards, no glow, no backdrop blur on app chrome. Components are built on HeroUI v3 (React Aria under the hood) restyled to this flat, bordered, low-chroma language; icons are Lucide at 18px / stroke-width 1.5.

The one deliberate exception is the content-preview surfaces themselves — the carousel slide renderer, the Instagram/TikTok mock frames, the ad renderer. Those render the *actual social media content* the user is producing, not app chrome, and keep their own dark, high-contrast visual language untouched by this system.

**Key Characteristics:**
- Flat white canvas; surfaces distinguished by a 1px border, not elevation.
- One restrained accent (a calm blue) used sparingly: primary actions, active nav state, links, focus rings.
- Slim, hairline-bottom page headers instead of large hero-style titles.
- A fixed 240px workspace sidebar with grouped, icon-led navigation — no active "pill" background, just a subtle fill + hairline left accent.
- Lucide icons throughout, 18px, stroke-width 1.5, never filled.

## Colors

Neutral-first palette with a single accent; almost every screen is white/near-white with dark, near-black text and one blue used deliberately.

### Primary
- **Notion Blue** (`oklch(0.58 0.15 254)` / dark theme `oklch(0.66 0.15 254)`): primary buttons, active nav item, links, focus rings, selected states. This is the only saturated color in app chrome.

### Neutral
- **Canvas White** (`oklch(1 0 0)`): page background and card/surface fill — surfaces sit flush with the page.
- **Workspace Gray** (`oklch(0.975 0.002 285.8)`): sidebar background, hover fill for list/nav rows.
- **Hover Gray** (`oklch(0.955 0.003 285.8)`): active/pressed nav item fill, icon tile backgrounds.
- **Hairline Border** (`oklch(0.914 0.003 285.8)`): the only separator between regions — page header bottom rule, card borders, sidebar border, field borders.
- **Ink** (`oklch(0.2103 0.0059 285.89)`): primary text.
- **Muted Ink** (`oklch(0.5517 0.0138 285.94)`): secondary text, labels, placeholders, group headings.

### Status
- **Danger** (`oklch(0.6532 0.2328 25.74)`), **Success** (`oklch(0.7329 0.1935 150.81)`), **Warning** (`oklch(0.7819 0.1585 72.33)`): destructive actions, success/error notices. Used as soft (tinted) fills by default, solid only for the destructive button variant.

### Named Rules
**The One Accent Rule.** The blue accent appears on primary actions, links, active nav, and focus rings only — never as a decorative fill, gradient, or background wash. If a screen needs a second strong color, that's a status color (danger/success/warning) tied to a real state, not a stylistic choice.

## Typography

**UI Font:** Geist (with system sans-serif fallback)
**Mono Font:** Geist Mono — reserved for numeric/data-dense values (costs, IDs), not general UI.

**Character:** A single workhorse UI sans throughout — no display serif, no multi-font showcase. (Playfair Display, Space Grotesk, and Sora stay loaded only because the carousel slide renderer's font picker offers them as options for user-generated slide content; they are never used for app chrome.)

### Hierarchy
- **Page title** (600 weight, 20–24px, tight line-height): the slim page header, next to a bottom hairline.
- **Section/Card title** (600 weight, 14px): card and section headings.
- **Body** (400 weight, 14px, 1.5 line-height): default UI text.
- **Label** (500 weight, 11px, uppercase, wide tracking, muted ink): sidebar group headings, field labels, eyebrows.

## Layout

Fixed 240px sidebar on desktop (`md:pl-60` offset on the content column), collapsing to a 56px top bar + slide-out Drawer below `md`. Content sits in a max-width container (`max-w-7xl`) with generous horizontal padding. Every page opens with a slim header block: eyebrow (optional) + title + optional description + actions, closed off by a single bottom hairline — never a large hero banner. Density is high (compact form fields, tight list rows) because this is a daily operator tool, not a marketing surface.

## Elevation & Depth

**The Flat-By-Default Rule.** No drop shadows on cards, panels, or fields at rest (`--surface-shadow`, `--field-shadow` are both `none` in light mode). Depth is conveyed by hairline borders and background-fill contrast (white canvas vs. workspace gray vs. hover gray) instead of shadow layering. The only overlay elevation is the Drawer/mobile-nav backdrop, which uses HeroUI's default opaque scrim, not blur.

## Shapes

Small, consistent corner radius: 8px base (`--radius`), scaling down to 2–6px for compact chips/badges and up to 12px for form fields (`--field-radius`). Borders are always 1px hairline. No pill-shaped buttons or cards; pill shape is reserved for badges/avatars only.

## Components

All components are HeroUI v3 (`@heroui/react`) primitives, restyled via the token overrides above — not custom-built from scratch — kept behind the app's existing component names (`Button`, `Card`, `Input`, `Select`, `Tabs`, `Badge`, `Sheet`) as thin adapters, so the rest of the app didn't need touching component-by-component.

### Buttons
- **Shape:** 8px radius, 1px border on the outline variant only.
- **Primary** (`default`): solid accent fill, white text — the one strong color per screen.
- **Secondary / Outline / Ghost:** neutral fills or hairline border, ink text — the default for most actions.
- **Destructive:** solid danger fill.
- **Link:** text-only, accent color, underline on hover.

### Badges (HeroUI Chip)
- Small (`sm`), soft-tinted fills by default (`default` → accent-soft, `destructive` → danger-soft), tertiary (bordered, no fill) for the `outline` variant.

### Cards
- **Corner:** 8px.
- **Background:** white, same as page canvas (`variant="transparent"` on HeroUI's Card — border only, no gray fill), so cards read as "regions" not "floating panels."
- **Border:** 1px hairline.
- **Shadow:** none.

### Inputs / Selects / Textareas
- **Style:** 1px hairline border (HeroUI's `secondary` field variant — no shadow), 12px radius, workspace-gray-on-hover.
- **Focus:** border shifts to a stronger neutral + 2px accent focus ring.
- Select uses HeroUI's `Select` + `ListBox` primitives; the trigger and popover both keep the same hairline-border language as inputs.

### Navigation (sidebar)
- Fixed 240px, workspace-gray background, hairline right border.
- Grouped items with small uppercase muted group labels.
- Items: icon (18px) + label, flat — no pill background. Active state: hover-gray fill + medium-weight text, no colored background block.
- Mobile: 56px top bar + hamburger opens a left Drawer with the same nav.

### Sheet / Drawer (mobile nav)
- HeroUI `Drawer`, opaque backdrop, slide from the named edge, close button top-right.

## Do's and Don'ts

### Do:
- **Do** keep every app-chrome surface flat: border for separation, never `box-shadow` or `backdrop-blur`.
- **Do** reuse the semantic Tailwind tokens (`bg-background`, `bg-surface-secondary`, `text-muted-foreground`, `border-border`, `bg-primary`) rather than hardcoded colors — this is what let the whole app re-skin without per-page edits, and it's what keeps future screens on-system.
- **Do** use the accent color only for primary actions, links, active nav state, and focus rings.
- **Do** use Lucide icons at 18px, `strokeWidth={1.5}`.

### Don't:
- **Don't** add gradients, glows, or glassmorphism (`backdrop-blur`, translucent panel fills) to app chrome — sidebar, headers, cards, buttons, dialogs.
- **Don't** touch the carousel slide renderer (`components/slide-renderer.tsx`, `components/slides/*`) or its hand-authored CSS block in `app/globals.css`, or the Instagram/TikTok/ad preview frames — those render real social content and intentionally keep their own dark, high-contrast look.
- **Don't** give cards a background fill distinct from the page canvas by default; a hairline border is enough.
- **Don't** reintroduce the old multi-font stack (Playfair/Space Grotesk/Sora) for app UI text — those fonts exist only for the carousel's own font picker.
