# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Nicolas and a small internal team who produce and manage AI-generated content for their own brands. Not a self-serve product for external customers — everyone with access is part of the same operation, working across multiple client/brand accounts.

## Product Purpose

Content Gen ("Estudio unificado para contenido generado con IA") is the operator's internal studio for producing and managing AI-generated marketing content: carousels, video ads, static ads, and articles, plus discovering topics (Radar), scheduling posts, tracking campaigns/brand kits, and monitoring analytics and generation costs.

## Positioning

A single internal tool that unifies content generation (multiple formats: carousel, video, ad, article) with topic discovery, scheduling, and analytics/cost tracking in one place — replacing a scattered set of point tools/scripts for producing social content.

## Operating Context

- Routes cover: Radar (topic discovery), Carousel/Ads/Video/Articles (generation), Library, Campaigns, Schedule, Brands (brand kits), Analytics, Costs, Diagnostics.
- Multi-brand: work spans several brand/client accounts, each with its own brand kit.
- Content pipeline generates real assets via AI (images, video scenes, voiceover, captions) — this is a working tool used daily, not a demo.
- Carousel preview rendering (`components/slide-renderer.tsx` and the `components/slides/*` family) depends on hand-authored global CSS in `app/globals.css` that must not be touched during unrelated redesign work — see prior session note.
- Video pipeline must stay at parity with a separate `video-autom` implementation — porting behavior exactly, not reinterpreting it.

## Capabilities and Constraints

- Next.js 16 / React 19 / Tailwind v4 app inside a monorepo (`apps/studio`), consuming `@content-gen/domain` and `@content-gen/video-engine` packages.
- Current UI stack: Radix primitives + shadcn-style components in `components/ui/`, lucide-react icons.
- Team is small internal staff, not the general public — no external accessibility compliance mandate has been established.

## Brand Commitments

None binding. Name "Content Gen", current palette, and current fonts (Geist, Geist Mono, Playfair Display, Space Grotesk, Sora) are all open to change in the redesign — full creative freedom confirmed by the user.

## Evidence on Hand

No testimonials, case studies, or external marketing assets — this is an internal operator tool, not a marketed product. Do not fabricate any.

## Product Principles

- One tool, many formats: carousel/video/ad/article generation should feel like the same system, not bolted-together tools.
- Built for daily, repeated use by the same small team — optimize for speed and low friction over first-impression persuasion.
- Multi-brand by default: screens should make it obvious which brand/campaign context you're in.
- Generation and cost visibility matter — this is a production tool spending real AI credits, not a toy.
