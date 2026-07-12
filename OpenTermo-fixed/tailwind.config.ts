import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
        xs: "var(--radius-xs)",
        full: "var(--radius-full)",
      },
      fontFamily: {
        sans: ["Inter", "SF Pro Text", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Source Code Pro", "Cascadia Code", "Consolas", "monospace"],
      },
    },
  },
  plugins: [animate],
} satisfies Config;