import type { Config } from 'tailwindcss'

const config: Config = {
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
          DEFAULT: '#F4F6F9',
          card: '#FFFFFF',
          raised: '#F6F8FB',
          border: 'rgba(22,32,46,0.08)',
        },
      },
      backgroundImage: {
        'hero-gradient':
          'radial-gradient(130% 150% at 88% 0%, rgba(215,40,47,0.14), transparent 52%), linear-gradient(135deg, #EEF1F5 0%, #E8ECF2 55%, #DFE5ED 100%)',
        'sidebar-gradient':
          'linear-gradient(180deg, #FFFFFF 0%, #F4F6F9 100%)',
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
