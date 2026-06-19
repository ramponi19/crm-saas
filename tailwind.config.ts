import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        serif: ['Fraunces', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        // Design tokens do CRM — mesmos do Claude Design original
        brand: {
          DEFAULT: '#D7282F',
          light: '#F0656B',
          dark: '#A8161D',
        },
        surface: {
          DEFAULT: '#0A111E',
          card: '#122036',
          raised: '#0E1A2C',
          border: 'rgba(255,255,255,0.06)',
        },
      },
      backgroundImage: {
        'hero-gradient':
          'radial-gradient(130% 150% at 88% 0%, rgba(215,40,47,0.24), transparent 52%), linear-gradient(135deg, #17263F 0%, #101D32 55%, #0B1422 100%)',
        'sidebar-gradient':
          'linear-gradient(180deg, #0C1526 0%, #0A1120 100%)',
      },
      animation: {
        'fade-up': 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both',
        'pulse-dot': 'pulseDot 2.2s ease-in-out infinite',
        'grow-x': 'growX 0.8s ease both',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        pulseDot: {
          '0%': { boxShadow: '0 0 0 0 rgba(52,211,153,0.5)' },
          '70%': { boxShadow: '0 0 0 7px rgba(52,211,153,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(52,211,153,0)' },
        },
        growX: {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}

export default config
