import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "deep-space": "#030712",
        brand: {
          blue: "#3B82F6",
          red: "#EF4444",
          green: "#10B981",
          yellow: "#F59E0B",
          navy: "#0F172A",
          slate: "#1E293B",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
      },
      animation: {
        "pulse-red": "pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "slide-in": "slideIn 0.3s ease-out",
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
      },
      keyframes: {
        slideIn: {
          "0%": { transform: "translateY(-10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 8px rgba(244, 63, 94, 0.3)" },
          "50%": { boxShadow: "0 0 16px rgba(244, 63, 94, 0.6)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
