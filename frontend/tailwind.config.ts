import type { Config } from "tailwindcss";

// Theme tokens — rebrand by editing these + src/app/globals.css CSS vars.
// Colors are RGB channels so /alpha modifiers work in both light & dark scopes.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-2": "rgb(var(--accent-2) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        green: "rgb(var(--green) / <alpha-value>)",
        blue: "rgb(var(--blue) / <alpha-value>)",
      },
      borderRadius: { xl2: "1.25rem" },
      backdropBlur: { xs: "2px" },
    },
  },
  plugins: [],
};

export default config;
