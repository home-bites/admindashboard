import tailwindForms from "@tailwindcss/forms";
import containerQueries from "@tailwindcss/container-queries";

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "on-secondary-fixed-variant": "#3d4756",
        "on-tertiary-container": "#003a25",
        "on-secondary-fixed": "#121c2a",
        "surface-variant": "#dce2f3",
        "tertiary": "#006c49",
        "surface": "#f9f9ff",
        "surface-bright": "#f9f9ff",
        "inverse-primary": "#ffb59d",
        "secondary-container": "#d6e0f3",
        "secondary": "#555f6f",
        "surface-tint": "#ab3500",
        "on-error": "#ffffff",
        "tertiary-container": "#00af79",
        "primary": "#ab3500",
        "on-primary-fixed": "#390c00",
        "on-tertiary": "#ffffff",
        "on-surface": "#151c27",
        "on-surface-variant": "#594139",
        "secondary-fixed": "#d9e3f6",
        "inverse-surface": "#2a313d",
        "outline-variant": "#e1bfb5",
        "primary-container": "#ff6b35",
        "surface-container": "#e7eefe",
        "on-tertiary-fixed-variant": "#005236",
        "tertiary-fixed-dim": "#4edea3",
        "on-error-container": "#93000a",
        "inverse-on-surface": "#ebf1ff",
        "tertiary-fixed": "#6ffbbe",
        "primary-fixed-dim": "#ffb59d",
        "surface-dim": "#d3daea",
        "on-secondary-container": "#596373",
        "primary-fixed": "#ffdbd0",
        "on-secondary": "#ffffff",
        "surface-container-low": "#f0f3ff",
        "secondary-fixed-dim": "#bdc7d9",
        "error-container": "#ffdad6",
        "surface-container-high": "#e2e8f8",
        "surface-container-lowest": "#ffffff",
        "background": "#f9f9ff",
        "outline": "#8d7168",
        "on-tertiary-fixed": "#002113",
        "on-primary-container": "#5f1900",
        "error": "#ba1a1a",
        "on-background": "#151c27",
        "surface-container-highest": "#dce2f3",
        "on-primary": "#ffffff",
        "on-primary-fixed-variant": "#832600"
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
      spacing: {
        "gutter": "16px",
        "unit-3": "1.5rem",
        "unit-4": "2rem",
        "container-margin": "24px",
        "unit-2": "1rem",
        "base": "8px",
        "unit-1": "0.5rem"
      },
      fontFamily: {
        "body-lg": ["Inter", "sans-serif"],
        "headline-lg": ["Geist", "sans-serif"],
        "label-md": ["Geist", "sans-serif"],
        "headline-display": ["Geist", "sans-serif"],
        "body-md": ["Inter", "sans-serif"],
        "headline-md": ["Geist", "sans-serif"],
        "body-sm": ["Inter", "sans-serif"],
        "label-sm": ["Geist", "sans-serif"]
      },
      fontSize: {
        "body-lg": ["18px", { "lineHeight": "28px", "fontWeight": "400" }],
        "headline-lg": ["32px", { "lineHeight": "40px", "letterSpacing": "-0.02em", "fontWeight": "600" }],
        "label-md": ["14px", { "lineHeight": "16px", "letterSpacing": "0.02em", "fontWeight": "500" }],
        "headline-display": ["48px", { "lineHeight": "56px", "letterSpacing": "-0.02em", "fontWeight": "700" }],
        "body-md": ["16px", { "lineHeight": "24px", "fontWeight": "400" }],
        "headline-md": ["24px", { "lineHeight": "32px", "letterSpacing": "-0.01em", "fontWeight": "600" }],
        "body-sm": ["14px", { "lineHeight": "20px", "fontWeight": "400" }],
        "label-sm": ["12px", { "lineHeight": "14px", "fontWeight": "600" }]
      }
    },
  },
  plugins: [
    tailwindForms,
    containerQueries
  ],
}
