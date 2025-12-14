const { theme: sharedTheme } = require("@dowhat/shared");

const radiusScale = Object.fromEntries(
  Object.entries(sharedTheme.radius).map(([token, value]) => [token, `${value}px`]),
);

const parseFontStack = (stack) =>
  stack
    .split(",")
    .map((font) => font.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        card: "0 4px 14px rgba(0,0,0,0.08)",
      },
      borderRadius: radiusScale,
      colors: {
        brand: {
          DEFAULT: sharedTheme.colors.brandTeal,
          teal: sharedTheme.colors.brandTeal,
          dark: sharedTheme.colors.brandTealDark,
          yellow: sharedTheme.colors.brandYellow,
        },
        ink: {
          DEFAULT: sharedTheme.colors.brandInk,
          strong: sharedTheme.colors.ink80,
          medium: sharedTheme.colors.ink60,
          muted: sharedTheme.colors.ink40,
          subtle: sharedTheme.colors.ink20,
        },
        surface: {
          DEFAULT: sharedTheme.colors.surface,
          alt: sharedTheme.colors.surfaceAlt,
          canvas: sharedTheme.colors.bg,
        },
        accent: {
          sky: sharedTheme.colors.accentSky,
        },
        feedback: {
          success: sharedTheme.colors.success,
          warning: sharedTheme.colors.warning,
          danger: sharedTheme.colors.danger,
        },
        midnight: {
          DEFAULT: sharedTheme.colors.night,
          alt: sharedTheme.colors.nightAlt,
          border: sharedTheme.colors.slateBorder,
          text: sharedTheme.colors.slateText,
          muted: sharedTheme.colors.slateMuted,
        },
        emerald: {
          surface: sharedTheme.colors.emeraldSurface,
          ink: sharedTheme.colors.emeraldInk,
        },
      },
      spacing: sharedTheme.spacingRem,
      fontFamily: {
        sans: parseFontStack(sharedTheme.typography.family.body),
        display: parseFontStack(sharedTheme.typography.family.display),
        mono: parseFontStack(sharedTheme.typography.family.mono),
      },
    },
  },
  plugins: [],
};
