// ============================================================
// TAILWIND CSS CONFIGURATION — Utility-First CSS Framework
// ============================================================
// Configures Tailwind CSS to scan all source files for classes.
// Content paths tell Tailwind which files to check for class
// usage, enabling tree-shaking of unused CSS in production.
// ============================================================

/** @type {import('tailwindcss').Config} */
module.exports = {
  // Content paths — Tailwind scans these files for class names
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      // Custom font family — matches the Google Fonts import
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};
