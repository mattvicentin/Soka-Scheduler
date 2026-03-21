import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        soka: {
          blue: "#003A8F",
          "blue-hover": "#002f73",
          "light-blue": "#0072CE",
          gold: "#C5A900",
          surface: "#F5F5F5",
          border: "#D9D9D9",
          body: "#333333",
          muted: "#666666",
          disabled: "#A0A0A0",
          success: "#2E7D32",
          warning: "#ED6C02",
          error: "#D32F2F",
          info: "#0288D1",
          heatmap: {
            low: "#4CAF50",
            medium: "#FFC107",
            high: "#FF9800",
            critical: "#D32F2F",
          },
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      fontSize: {
        h1: ["1.75rem", { lineHeight: "1.2", fontWeight: "600" }],
        h2: ["1.375rem", { lineHeight: "1.25", fontWeight: "600" }],
        h3: ["1.125rem", { lineHeight: "1.35", fontWeight: "500" }],
      },
    },
  },
  plugins: [],
};
export default config;
