/**
 * Haanta design tokens, from docs/brand-guide.pdf.
 * Apps must not hard-code colours (enforced by ESLint); use these tokens or the CSS variables in tokens.css.
 *
 * Colour world: Haanta Brown ~60%, Haanta Tan ~30%, accent red ~10%.
 */
export const palette = {
  brown: "#522b08",
  tan: "#d2b48c",
  red: "#a52a2a",
  gradientFrom: "#8b4512",
  gradientTo: "#502404",
  white: "#ffffff",
  /** Warm off-white: the storefront page background (quieter than pure white, never yellow). */
  ivory: "#fbf9f5",
  /** Light tan tint for page backgrounds. */
  cream: "#f8f3ec",
  /** Warm stone: image wells and quiet panels on ivory. */
  stone: "#efe9e0",
  /** Mid tint for borders and dividers on light surfaces. */
  sand: "#e9dcc9",
  /** Dark neutral for long-form body text. */
  ink: "#2b1a0b",
  /** Muted text on light surfaces (AA on white and cream). */
  muted: "#6b5440",
  success: "#2f6b3a",
  warning: "#8a5a00",
} as const

export const colors = {
  background: palette.white,
  surface: palette.cream,
  surfaceInverse: palette.brown,
  border: palette.sand,
  text: palette.ink,
  textMuted: palette.muted,
  textInverse: palette.white,
  textOnBrown: palette.tan,
  brand: palette.brown,
  brandContrast: palette.tan,
  accent: palette.red,
  accentContrast: palette.white,
  focus: palette.red,
  success: palette.success,
  warning: palette.warning,
  danger: palette.red,
  gradient: `linear-gradient(225deg, ${palette.gradientFrom} 0%, ${palette.gradientTo} 100%)`,
  /** Marketing gradients take light from the bottom right. */
  gradientMarketing: `linear-gradient(315deg, ${palette.gradientFrom} 0%, ${palette.gradientTo} 100%)`,
} as const

/**
 * Text/background pairs the apps may use. Every pair is tested for WCAG 2.2 AA contrast.
 * Tan text is only allowed on brown/gradient (it fails on white).
 */
export const approvedTextPairs: { name: string; fg: string; bg: string; large?: boolean }[] = [
  { name: "body on white", fg: palette.ink, bg: palette.white },
  { name: "body on cream", fg: palette.ink, bg: palette.cream },
  { name: "body on ivory", fg: palette.ink, bg: palette.ivory },
  { name: "body on stone", fg: palette.ink, bg: palette.stone },
  { name: "brown on ivory", fg: palette.brown, bg: palette.ivory },
  { name: "muted on ivory", fg: palette.muted, bg: palette.ivory },
  { name: "muted on stone", fg: palette.muted, bg: palette.stone },
  { name: "red on ivory", fg: palette.red, bg: palette.ivory },
  { name: "ivory on brown", fg: palette.ivory, bg: palette.brown },
  { name: "ivory on ink", fg: palette.ivory, bg: palette.ink },
  { name: "tan on ink", fg: palette.tan, bg: palette.ink },
  { name: "brown on white", fg: palette.brown, bg: palette.white },
  { name: "brown on cream", fg: palette.brown, bg: palette.cream },
  { name: "brown on tan", fg: palette.brown, bg: palette.tan },
  { name: "muted on white", fg: palette.muted, bg: palette.white },
  { name: "muted on cream", fg: palette.muted, bg: palette.cream },
  { name: "tan on brown", fg: palette.tan, bg: palette.brown },
  { name: "tan on gradient end", fg: palette.tan, bg: palette.gradientFrom, large: true },
  { name: "white on brown", fg: palette.white, bg: palette.brown },
  { name: "white on gradient start", fg: palette.white, bg: palette.gradientFrom },
  { name: "white on red", fg: palette.white, bg: palette.red },
  { name: "red on white", fg: palette.red, bg: palette.white },
  { name: "red on cream", fg: palette.red, bg: palette.cream },
  { name: "success on white", fg: palette.success, bg: palette.white },
  { name: "warning on white", fg: palette.warning, bg: palette.white },
]

/** Font families. Avenir needs a licence; Figtree is the free fallback. Change in this one place. */
export const fonts = {
  sans: `"Avenir", "Avenir Next", var(--font-sans-fallback, "Figtree"), system-ui, -apple-system, "Segoe UI", sans-serif`,
  /** Cinzel is for marketing headlines only. */
  display: `var(--font-display, "Cinzel"), Georgia, serif`,
} as const

/** Type scale (rem). Leading/tracking from the brand guide's core overview. */
export const typography = {
  headline: { size: "2.5rem", lineHeight: 0.9, tracking: "-0.03em", weight: 900 },
  conversational: { size: "2rem", lineHeight: 1.15, tracking: "-0.02em", weight: 800 },
  sectionHeader: { size: "1.5rem", lineHeight: 1.15, tracking: "-0.02em", weight: 800 },
  subhead: { size: "1.125rem", lineHeight: 1.25, tracking: "0", weight: 500 },
  body: { size: "1rem", lineHeight: 1.5, tracking: "0.01em", weight: 400 },
  small: { size: "0.875rem", lineHeight: 1.45, tracking: "0.01em", weight: 400 },
} as const

/** 1:1 grid. One grid unit is 8px; page margins are two grid units. */
export const GRID_UNIT_PX = 8
export const space = {
  0: "0",
  1: `${GRID_UNIT_PX * 0.5}px`,
  2: `${GRID_UNIT_PX}px`,
  3: `${GRID_UNIT_PX * 1.5}px`,
  4: `${GRID_UNIT_PX * 2}px`,
  6: `${GRID_UNIT_PX * 3}px`,
  8: `${GRID_UNIT_PX * 4}px`,
  12: `${GRID_UNIT_PX * 6}px`,
  16: `${GRID_UNIT_PX * 8}px`,
} as const

export const layout = {
  /** Two grid units on mobile; scales by doubling the unit on wide screens. */
  marginMobile: `${GRID_UNIT_PX * 2}px`,
  marginDesktop: `${GRID_UNIT_PX * 2 * 2}px`,
  maxWidth: "1440px",
} as const

export const radii = { none: "0", sm: "2px", md: "4px", pill: "999px" } as const

export const breakpoints = { sm: 640, md: 768, lg: 1024, xl: 1280 } as const

export const tokens = { palette, colors, fonts, typography, space, layout, radii, breakpoints } as const

/** CSS custom properties generated from the tokens. Written to src/tokens.css by `pnpm gen:css`. */
export function toCssVariables(): string {
  const lines: string[] = [":root {"]
  for (const [k, v] of Object.entries(palette)) lines.push(`  --haanta-${kebab(k)}: ${v};`)
  for (const [k, v] of Object.entries(colors)) lines.push(`  --color-${kebab(k)}: ${v};`)
  lines.push(`  --font-sans: ${fonts.sans};`)
  lines.push(`  --font-display-stack: ${fonts.display};`)
  for (const [k, v] of Object.entries(space)) lines.push(`  --space-${k}: ${v};`)
  for (const [k, v] of Object.entries(layout)) lines.push(`  --layout-${kebab(k)}: ${v};`)
  for (const [k, v] of Object.entries(radii)) lines.push(`  --radius-${kebab(k)}: ${v};`)
  for (const [k, v] of Object.entries(typography)) {
    lines.push(`  --type-${kebab(k)}-size: ${v.size};`)
    lines.push(`  --type-${kebab(k)}-leading: ${v.lineHeight};`)
    lines.push(`  --type-${kebab(k)}-tracking: ${v.tracking};`)
    lines.push(`  --type-${kebab(k)}-weight: ${v.weight};`)
  }
  lines.push("}")
  return lines.join("\n") + "\n"
}

function kebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()
}
