// Next 16: o eslint-config-next passou a exportar flat config nativa — o
// FlatCompat de antes quebrava com "config-validator". Imports diretos, como
// manda o guia de upgrade.
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const config = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'supabase/functions/**', 'arquivos/**']),
  {
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'react/no-unescaped-entities': 'warn',
      'prefer-const': 'warn',
      // Regras NOVAS do react-hooks v6 (preset do Next 16, era React Compiler).
      // Apontaram 85 ocorrências em código que sempre rodou — padrão antigo,
      // não regressão. Ficam como AVISO para não travar build/CI enquanto o
      // refactor não vira mutirão próprio; não apagar, o sinal é o backlog.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-render': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
  {
    // Precisão: kit de UI só pode usar tokens do tailwind.config — zero hex literal.
    files: ['components/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error',
        {
          selector: 'Literal[value=/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})/]',
          message: 'Precisão: hex literal proibido em components/ui — use tokens (bg, card, raised, ink, ink-2/3, line, accent, ok, warn, bad).',
        },
        {
          selector: 'TemplateElement[value.raw=/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})/]',
          message: 'Precisão: hex literal proibido em components/ui — use tokens (bg, card, raised, ink, ink-2/3, line, accent, ok, warn, bad).',
        },
      ],
    },
  },
  {
    // TEMP ÁPICE — legado pré-Precisão em components/ui. Migrar/mover e remover esta exceção.
    files: ['components/ui/animated-value.tsx', 'components/ui/area-chart.tsx'],
    rules: { 'no-restricted-syntax': 'off' },
  },
])

export default config
