/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // All brand colors resolve through CSS vars set by ThemeProvider —
        // swapping teams is a config change, never a find-and-replace.
        brand: {
          primary: "var(--th-primary)",
          deep: "var(--th-primary-deep)",
          accent: "var(--th-accent)",
          accentSoft: "var(--th-accent-soft)",
          success: "var(--th-success)",
        },
        ink: {
          DEFAULT: "var(--th-ink)",
          soft: "var(--th-ink-2)",
          faint: "var(--th-ink-3)",
        },
      },
      fontFamily: {
        display: ['"Barlow Condensed"', "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,28,51,0.06), 0 4px 14px rgba(16,28,51,0.07)",
        hero: "0 10px 28px rgba(11,24,54,0.24)",
        sheet: "0 -10px 36px rgba(11,24,54,0.28)",
      },
      borderRadius: {
        xl: "20px",
      },
    },
  },
  plugins: [],
};
