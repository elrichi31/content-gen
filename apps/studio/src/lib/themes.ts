// Central theme definitions — imported by editor-panel, slide-renderer, etc.

export const colorThemes = {
  green:   { label: 'Green',   primary: 'oklch(0.55 0.12 145)' },
  blue:    { label: 'Blue',    primary: 'oklch(0.55 0.18 220)' },
  purple:  { label: 'Purple',  primary: 'oklch(0.60 0.18 290)' },
  orange:  { label: 'Orange',  primary: 'oklch(0.65 0.18 40)'  },
  red:     { label: 'Red',     primary: 'oklch(0.58 0.22 25)'  },
  pink:    { label: 'Pink',    primary: 'oklch(0.65 0.20 350)' },
  teal:    { label: 'Teal',    primary: 'oklch(0.60 0.14 185)' },
  yellow:  { label: 'Yellow',  primary: 'oklch(0.78 0.18 90)'  },
} as const

export type ColorThemeId = keyof typeof colorThemes

// Custom color stored as a hex/oklch string not in the preset list
export const CUSTOM_COLOR_ID = '__custom__' as const

export const fontThemes = {
  geist:    { label: 'Geist Sans',    family: 'var(--font-geist)'      },
  playfair: { label: 'Playfair',      family: 'var(--font-playfair)'   },
  space:    { label: 'Space Grotesk', family: 'var(--font-space)'      },
  sora:     { label: 'Sora',          family: 'var(--font-sora)'       },
  mono:     { label: 'Monospace',     family: 'var(--font-geist-mono)' },
} as const

export type FontThemeId = keyof typeof fontThemes

// Background style patterns overlaid on the primary color gradient
export const bgStyles = {
  gradient: { label: 'Gradient' },
  lines:    { label: 'Lines' },
  dots:     { label: 'Dots' },
  grid:     { label: 'Grid' },
  noise:    { label: 'Noise' },
  radial:   { label: 'Radial' },
} as const

export type BgStyleId = keyof typeof bgStyles

/**
 * Returns CSS properties for the given background style.
 *
 * Uses `backgroundImage` (NOT the `background` shorthand) so that
 * `backgroundColor` always acts as a solid dark fallback. If `color-mix()`
 * or `oklch()` is unsupported, the dark `#111` still shows through.
 */
export function buildBgStyle(primary: string, style: BgStyleId, startPct: number, endPct: number): Record<string, string> {
  const mix = (pct: number) => `color-mix(in srgb, ${primary} ${pct}%, transparent)`
  const base = `linear-gradient(to bottom right, ${mix(startPct)}, ${mix(endPct)})`
  const dark = '#111111'

  switch (style) {
    case 'gradient':
      return { backgroundColor: dark, backgroundImage: base }

    case 'lines':
      return {
        backgroundColor: dark,
        backgroundImage: `repeating-linear-gradient(-45deg, ${mix(6)} 0px, ${mix(6)} 1px, transparent 1px, transparent 12px), ${base}`,
      }

    case 'dots':
      return {
        backgroundColor: dark,
        backgroundImage: `radial-gradient(${mix(10)} 1px, transparent 1px), ${base}`,
        backgroundSize: '16px 16px, 100% 100%',
      }

    case 'grid':
      return {
        backgroundColor: dark,
        backgroundImage: `linear-gradient(${mix(5)} 1px, transparent 1px), linear-gradient(90deg, ${mix(5)} 1px, transparent 1px), ${base}`,
        backgroundSize: '24px 24px, 24px 24px, 100% 100%',
      }

    case 'noise':
      return {
        backgroundColor: dark,
        backgroundImage: `repeating-linear-gradient(0deg, ${mix(3)} 0px, transparent 1px, transparent 2px), repeating-linear-gradient(90deg, ${mix(3)} 0px, transparent 1px, transparent 3px), ${base}`,
        backgroundSize: '3px 3px, 3px 3px, 100% 100%',
      }

    case 'radial':
      return {
        backgroundColor: dark,
        backgroundImage: `radial-gradient(ellipse at 30% 20%, ${mix(startPct + 10)} 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, ${mix(startPct)} 0%, transparent 50%), ${base}`,
      }

    default:
      return { backgroundColor: dark, backgroundImage: base }
  }
}

/**
 * Export-safe version of buildBgStyle.
 * html2canvas cannot parse `color-mix()` or `oklch()`, so this version
 * uses plain `rgba()` values instead. Requires a resolved hex primary color.
 */
export function buildBgStyleExport(hexPrimary: string, style: BgStyleId, startPct: number, endPct: number): Record<string, string> {
  const r = parseInt(hexPrimary.slice(1, 3), 16)
  const g = parseInt(hexPrimary.slice(3, 5), 16)
  const b = parseInt(hexPrimary.slice(5, 7), 16)
  const rgba = (pct: number) => `rgba(${r}, ${g}, ${b}, ${(pct / 100).toFixed(2)})`

  const base = `linear-gradient(to bottom right, ${rgba(startPct)}, ${rgba(endPct)})`
  const dark = '#111111'

  switch (style) {
    case 'gradient':
      return { backgroundColor: dark, backgroundImage: base }
    case 'lines':
      return {
        backgroundColor: dark,
        backgroundImage: `repeating-linear-gradient(-45deg, ${rgba(6)} 0px, ${rgba(6)} 1px, transparent 1px, transparent 12px), ${base}`,
      }
    case 'dots':
      return {
        backgroundColor: dark,
        backgroundImage: `radial-gradient(${rgba(10)} 1px, transparent 1px), ${base}`,
        backgroundSize: '16px 16px, 100% 100%',
      }
    case 'grid':
      return {
        backgroundColor: dark,
        backgroundImage: `linear-gradient(${rgba(5)} 1px, transparent 1px), linear-gradient(90deg, ${rgba(5)} 1px, transparent 1px), ${base}`,
        backgroundSize: '24px 24px, 24px 24px, 100% 100%',
      }
    case 'noise':
      return {
        backgroundColor: dark,
        backgroundImage: `repeating-linear-gradient(0deg, ${rgba(3)} 0px, transparent 1px, transparent 2px), repeating-linear-gradient(90deg, ${rgba(3)} 0px, transparent 1px, transparent 3px), ${base}`,
        backgroundSize: '3px 3px, 3px 3px, 100% 100%',
      }
    case 'radial':
      return {
        backgroundColor: dark,
        backgroundImage: `radial-gradient(ellipse at 30% 20%, ${rgba(startPct + 10)} 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, ${rgba(startPct)} 0%, transparent 50%), ${base}`,
      }
    default:
      return { backgroundColor: dark, backgroundImage: base }
  }
}
