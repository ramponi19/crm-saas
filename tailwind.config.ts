import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

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
        // ── Sistema ÁPICE: navy = primária, dourado = accent, vermelho = só perigo ──
        navy: {
          DEFAULT: '#16212E',
          soft: '#22303F',
          900: '#111A24',
        },
        gold: {
          DEFAULT: '#C9A24B',
          deep: '#A8884A',
          wash: 'rgba(201,162,75,0.14)',
        },
        danger: {
          DEFAULT: '#DC2626',
          soft: '#F0656B',
          dark: '#B91C1C',
        },
        ink: {
          DEFAULT: '#16212E',
          2: '#55647A',
          3: '#8A97A8',
        },
        // `brand` mantido como apelido → agora aponta pra navy (compat durante a migração)
        brand: {
          DEFAULT: '#16212E',
          light: '#22303F',
          dark: '#111A24',
        },
        surface: {
          DEFAULT: '#EEF1F5',
          card: '#FFFFFF',
          raised: '#F6F8FB',
          border: 'rgba(22,32,46,0.08)',
        },
      },
      backgroundImage: {
        'hero-gradient':
          'radial-gradient(130% 150% at 88% 0%, rgba(201,162,75,0.20), transparent 52%), linear-gradient(135deg, #17263F 0%, #101D32 55%, #0B1422 100%)',
        'sidebar-gradient':
          'linear-gradient(180deg, #FFFFFF 0%, #F4F6F9 100%)',
        'sidebar-navy':
          'radial-gradient(120% 60% at 50% -10%, rgba(201,162,75,0.10), transparent 60%), linear-gradient(180deg, #16212E 0%, #111A24 100%)',
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
  plugins: [typography],
}

export default config
