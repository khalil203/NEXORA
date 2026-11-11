/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#07070c', 900: '#0b0b12', 850: '#101019', 800: '#15151f', 700: '#1d1d29', 600: '#282836', 500: '#3a3a4c' },
        sky: { glow: '#5aa8f5' },
        violet: { glow: '#8b7cf6', deep: '#6d5ae6' },
      },
      fontFamily: {
        ui: ['"IBM Plex Sans Thai"', '"Noto Sans Thai"', 'system-ui', 'sans-serif'],
        display: ['Prompt', 'Kanit', '"Noto Sans Thai"', 'sans-serif'],
      },
      borderRadius: { '4xl': '2rem' },
      boxShadow: {
        glow: '0 0 0 1px rgba(139,124,246,.35), 0 8px 30px -6px rgba(110,90,230,.55)',
        card: '0 10px 30px -12px rgba(0,0,0,.7)',
      },
      backgroundImage: {
        hero: 'linear-gradient(160deg,#4aa3f0 0%,#6f8cf2 45%,#9a86f5 100%)',
        accent: 'linear-gradient(135deg,#5aa8f5 0%,#8b7cf6 100%)',
      },
    },
  },
  plugins: [],
};
