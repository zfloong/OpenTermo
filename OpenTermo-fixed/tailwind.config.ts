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
        full: "var(--radius-full)",
      },
      colors: {
        accent: "rgb(var(--accent-rgb) / <alpha-value>)",
        success: "rgb(var(--color-success-rgb) / <alpha-value>)",
        warning: "rgb(var(--color-warning-rgb) / <alpha-value>)",
        danger: "rgb(var(--color-danger-rgb) / <alpha-value>)",
      },
      fontFamily: {
        // 唯一声明源是 index.css 的 --font-ui；这里只是让 preflight 与 body 一致，
        // 不要再写第二套字体栈。
        sans: ["var(--font-ui)"],
        mono: ["JetBrains Mono", "Source Code Pro", "Cascadia Code", "Consolas", "monospace"],
      },
    },
  },
  plugins: [animate],
} satisfies Config;