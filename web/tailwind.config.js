/** @type {import('tailwindcss').Config} */
const v = (n) => `rgb(var(--${n}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: v('bg'), 'bg-2': v('bg-2'), surface: v('surface'), 'surface-2': v('surface-2'),
        raised: v('raised'), line: v('line'), ink: v('ink'), muted: v('muted'),
        primary: v('primary'), 'primary-2': v('primary-2'), violet: v('violet'), cyan: v('cyan'),
        ok: v('ok'), warn: v('warn'), bad: v('bad'), gold: v('gold'),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Noto Sans Thai', 'sans-serif'],
        display: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Noto Sans Thai', 'sans-serif'],
      },
      fontSize: {
        display: ['clamp(1.75rem,2.2vw+1rem,2.5rem)', { lineHeight: '1.1', letterSpacing: '-0.03em', fontWeight: '700' }],
      },
      borderRadius: { xl2: '1.25rem', xl3: '1.75rem' },
      boxShadow: {
        soft: '0 18px 40px -24px rgb(0 0 0 / 0.45)',
        glow: '0 10px 30px -10px rgb(var(--primary) / 0.55)',
        'glow-v': '0 10px 30px -10px rgb(var(--violet) / 0.45)',
        card: '0 1px 0 rgb(255 255 255 / 0.04) inset, 0 20px 40px -28px rgb(0 0 0 / 0.55)',
      },
      backgroundImage: {
        mesh: 'radial-gradient(900px 420px at 100% -10%, rgb(var(--violet) / 0.14), transparent 60%), radial-gradient(800px 420px at -5% 0%, rgb(var(--primary) / 0.14), transparent 55%), radial-gradient(600px 300px at 50% 120%, rgb(var(--cyan) / 0.10), transparent 60%)',
      },
      transitionTimingFunction: { nx: 'cubic-bezier(.2,.8,.2,1)' },
    },
  },
};
