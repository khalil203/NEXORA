/** @type {import('tailwindcss').Config} */
const v = (n) => `rgb(var(--${n}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: { bg: v('bg'), surface: v('surface'), raised: v('raised'), line: v('line'), ink: v('ink'), muted: v('muted'), primary: v('primary'), violet: v('violet'), ok: v('ok'), warn: v('warn'), bad: v('bad') },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Noto Sans Thai', 'sans-serif'] },
      borderRadius: { xl2: '1.25rem' },
      boxShadow: { soft: '0 10px 30px -12px rgb(0 0 0 / 0.45)', glow: '0 8px 28px -6px rgb(100 139 255 / 0.55)' },
    },
  },
};
