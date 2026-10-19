import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["Lato", "sans-serif"],
      },
      /** xs/sm are 1rem minimum - keep all UI text at or above 1rem (see .cursor/rules/typography-min-1rem.mdc) */
      fontSize: {
        xs: ["1rem", { lineHeight: "1.5rem" }],
        sm: ["1rem", { lineHeight: "1.5rem" }],
      },
      typography: {
        DEFAULT: {
          css: {
            fontSize: "1rem",
            lineHeight: "1.75",
            p: { fontSize: "1rem" },
            li: { fontSize: "1rem" },
            blockquote: { fontSize: "1rem" },
            code: { fontSize: "1rem" },
            pre: { fontSize: "1rem" },
            h1: { fontSize: "1.5rem" },
            h2: { fontSize: "1.375rem" },
            h3: { fontSize: "1.25rem" },
            h4: { fontSize: "1.125rem" },
          },
        },
        sm: {
          css: {
            fontSize: "1rem",
            lineHeight: "1.75",
            p: { fontSize: "1rem" },
            li: { fontSize: "1rem" },
            blockquote: { fontSize: "1rem" },
            code: { fontSize: "1rem" },
            pre: { fontSize: "1rem" },
            h1: { fontSize: "1.5rem" },
            h2: { fontSize: "1.375rem" },
            h3: { fontSize: "1.25rem" },
            h4: { fontSize: "1.125rem" },
          },
        },
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        surface: {
          DEFAULT: "hsl(var(--surface))",
          elevated: "hsl(var(--surface-elevated))",
        },
        tile: {
          DEFAULT: "hsl(var(--tile))",
          hover: "hsl(var(--tile-hover))",
        },
        neural: {
          glow: "hsl(var(--neural-glow))",
          subtle: "hsl(var(--neural-glow-subtle))",
        },
        semantic: {
          analysis: {
            DEFAULT: "hsl(var(--semantic-analysis))",
            foreground: "hsl(var(--semantic-analysis-foreground))",
          },
          data: {
            DEFAULT: "hsl(var(--semantic-data))",
            foreground: "hsl(var(--semantic-data-foreground))",
          },
          publish: {
            DEFAULT: "hsl(var(--semantic-publish))",
            foreground: "hsl(var(--semantic-publish-foreground))",
          },
          warning: {
            DEFAULT: "hsl(var(--semantic-warning))",
            foreground: "hsl(var(--semantic-warning-foreground))",
          },
        },
        canvas: "hsl(var(--canvas-bg))",
        node: {
          bg: "hsl(var(--node-bg))",
          border: "hsl(var(--node-border))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      spacing: {
        dashboard: "1rem",
        section: "var(--gap-section)",
        page: "var(--gap-page)",
      },
      gap: {
        dashboard: "1rem",
        section: "var(--gap-section)",
      },
      boxShadow: {
        tile: "var(--shadow-tile)",
        "tile-pop": "var(--shadow-tile-pop)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        /** Meta Optimizer bulk strip - blue neon glow pulse (matches overview progress lane) */
        "meta-opt-breathe": {
          "0%, 100%": {
            boxShadow:
              "0 0 0 1px hsl(var(--semantic-data) / 0.35), 0 0 16px hsl(var(--semantic-data) / 0.32), 0 0 10px hsl(var(--semantic-publish) / 0.22)",
            borderColor: "hsl(var(--semantic-data) / 0.45)",
          },
          "50%": {
            boxShadow:
              "0 0 0 1px hsl(var(--semantic-data) / 0.65), 0 0 40px hsl(var(--semantic-data) / 0.52), 0 0 24px hsl(var(--semantic-publish) / 0.45)",
            borderColor: "hsl(var(--semantic-data) / 0.85)",
          },
        },
        /** Agree & fix indeterminate strip (Analyze uses determinate sectional bar). */
        "overview-fix-strip": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
        /** Video Studio product turntable splash while views generate (no spinners). */
        "video-product-splash-breathe": {
          "0%, 100%": { opacity: "0.65", transform: "scale(0.98)" },
          "50%": { opacity: "1", transform: "scale(1.02)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "meta-opt-breathe": "meta-opt-breathe 2.2s ease-in-out infinite",
        "overview-fix-strip": "overview-fix-strip 1.35s ease-in-out infinite",
        "video-product-splash-breathe": "video-product-splash-breathe 2.2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
