import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({ baseDirectory: __dirname })

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
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
]

export default config
