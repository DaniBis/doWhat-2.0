export const palette = {
  brand: {
    teal: "#16B3A3",
    tealDark: "#0E8E81",
    yellow: "#FDB515",
  },
  ink: {
    primary: "#111827",
    strong: "#1F2937",
    medium: "#4B5563",
    muted: "#9CA3AF",
    subtle: "#E5E7EB",
  },
  surface: {
    base: "#FFFFFF",
    alt: "#F9FBFB",
    canvas: "#F8FAFC",
  },
  accent: {
    sky: "#0EA5E9",
  },
  feedback: {
    success: "#10B981",
    danger: "#EF4444",
    warning: "#F59E0B",
  },
  midnight: {
    base: "#020817",
    alt: "#0F172A",
    border: "#1E293B",
    text: "#CBD5F5",
    muted: "#94A3B8",
  },
  emerald: {
    surface: "#042F2E",
    ink: "#022C22",
  },
} as const;

export const spacing = {
  none: 0,
  hairline: 2,
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  gutter: 48,
  jumbo: 64,
} as const;

type SpacingEntries = typeof spacing;

const toRem = (value: number) => (value === 0 ? "0px" : `${value / 16}rem`);

export const spacingRem = Object.fromEntries(
  Object.entries(spacing).map(([token, value]) => [token, toRem(value as SpacingEntries[keyof SpacingEntries])]),
) as Record<keyof SpacingEntries, string>;

export type ThemeSpacingToken = keyof SpacingEntries;

export const theme = {
  palette,
  colors: {
    brandTeal: palette.brand.teal,
    brandTealDark: palette.brand.tealDark,
    brandYellow: palette.brand.yellow,
    brandInk: palette.ink.primary,
    ink80: palette.ink.strong,
    ink60: palette.ink.medium,
    ink40: palette.ink.muted,
    ink20: palette.ink.subtle,
    surface: palette.surface.base,
    surfaceAlt: palette.surface.alt,
    bg: palette.surface.canvas,
    success: palette.feedback.success,
    danger: palette.feedback.danger,
    warning: palette.feedback.warning,
    accentSky: palette.accent.sky,
    night: palette.midnight.base,
    nightAlt: palette.midnight.alt,
    slateBorder: palette.midnight.border,
    slateText: palette.midnight.text,
    slateMuted: palette.midnight.muted,
    emeraldSurface: palette.emerald.surface,
    emeraldInk: palette.emerald.ink,
  },
  gradients: {
    brand: [palette.brand.teal, palette.brand.tealDark],
    sunrise: [palette.brand.yellow, "#F97316"],
  },
  spacing,
  spacingRem,
  radius: {
    sm: 8,
    md: 12,
    lg: 20,
    xl: 28,
    pill: 999,
  },
  border: {
    hairline: 1,
    thin: 1.5,
    thick: 2,
  },
  shadow: {
    card: {
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
  },
  typography: {
    family: {
      display: 'Inter, "SF Pro Display", system-ui, -apple-system, sans-serif',
      body: 'Inter, "SF Pro Text", system-ui, -apple-system, sans-serif',
      mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    },
    size: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 18,
      xl: 20,
      xxl: 24,
    },
    weight: {
      regular: "400",
      medium: "500",
      semibold: "600",
      bold: "700",
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.7,
    },
  },
} as const;

