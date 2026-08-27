import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  safelist: [
    {
      pattern: /(bg|text|border|ring|shadow|from|to)-(indigo|emerald|rose|amber|violet)-(400|500|600|700)/,
    },
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'sans-serif'],
        outfit: ['var(--font-outfit)', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        slate: {
          850: '#131b2e',
          900: '#0f172a',
          950: '#060a13',
        },
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'pulse-glow': 'pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: '1', filter: 'drop-shadow(0 0 8px rgba(99, 102, 241, 0.6))' },
          '50%': { opacity: '.6', filter: 'drop-shadow(0 0 2px rgba(99, 102, 241, 0.2))' },
        },
      },
    },
  },
  plugins: [],
};
export default config;
