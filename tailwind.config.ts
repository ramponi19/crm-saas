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
        // ── Precisão: fonte única (mono só p/ códigos) ──
        sans: ['var(--font-geist)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
      },
      colors: {
        // ══ Sistema PRECISÃO (oficial) ══
        bg: '#FAFAF9',            // fundo da página
        card: '#FFFFFF',
        raised: '#FCFCFB',        // sidebar, barras
        ink: {
          DEFAULT: '#15181C',     // texto principal
          2: '#5C6470',           // texto secundário
          3: '#9199A3',           // metadados, placeholders
        },
        line: {
          DEFAULT: 'rgba(21,24,28,.09)',   // bordas padrão
          soft: 'rgba(21,24,28,.06)',      // divisores internos
        },
        accent: {
          DEFAULT: '#2E5CE6',              // cobalto: links, ativo, foco, CTA secundário
          soft: 'rgba(46,92,230,.08)',
        },
        ok: { DEFAULT: '#188A54', soft: 'rgba(24,138,84,.09)' },
        warn: { DEFAULT: '#B45309', soft: 'rgba(180,83,9,.08)' },
        bad: { DEFAULT: '#D92D20', soft: 'rgba(217,45,32,.07)' },
        // Vermelho JM — SOMENTE o quadrado do logo Nexus. Nunca em botões/estados/textos.
        jm: '#D7282F',
      },
      borderRadius: {
        // Precisão: 8 (controles) · 10-12 (cards) · 12 (modais)
        control: '8px',
        card: '12px',
        modal: '12px',
        // TEMP ÁPICE
        xl: '1rem',
        '2xl': '1.25rem',
        '3xl': '1.5rem',
      },
      backgroundImage: {
        // TEMP ÁPICE — remover ao fim da Fase 2
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
    },
  },
  plugins: [typography],
}

export default config
