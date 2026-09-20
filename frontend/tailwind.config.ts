import type { Config } from "tailwindcss";

// Theme tokens — rebrand by editing these + src/app/globals.css CSS vars
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        border: "var(--border)",
        accent: "var(--accent)",
        "accent-2": "var(--accent-2)",
        muted: "var(--muted)",
      },
      borderRadius: { xl2: "1.25rem" },
      backdropBlur: { xs: "2px" },
    },
  },
  plugins: [],
};

export default config;
