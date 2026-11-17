import type { CamposIdentificacao } from '@/lib/estoque-campos'

/**
 * Os tipos de categoria do módulo Celulares (lib/estoque-campos.ts junta com os do
 * core só com o módulo ligado). Sem o módulo, uma categoria antiga marcada como
 * `celular` cai no genérico (série + cor): nenhum campo de aparelho aparece.
 */
export const CAMPOS_CELULAR: Record<string, Partial<CamposIdentificacao>> = {
  celular: {
    titulo: 'Identificação do aparelho',
    imei: true, imei2: true, bateria: true, armazenamento: true, numeroModeloApple: true,
  },
  // Tablet e notebook com celular também têm IMEI, mas a maioria não — deixo o
  // campo fora e quem precisar usa a observação. Melhor faltar um campo raro do
  // que pedir IMEI para todo MacBook que entra.
  tablet:     { titulo: 'Identificação do tablet',   bateria: true, armazenamento: true, numeroModeloApple: true },
  notebook:   { titulo: 'Identificação do notebook', bateria: true, armazenamento: true, numeroModeloApple: true },
  smartwatch: { titulo: 'Identificação do relógio',  bateria: true, armazenamento: true, numeroModeloApple: true },
}

export const TIPOS_CELULAR: { valor: string; label: string }[] = [
  { valor: 'celular', label: 'Celular / Smartphone' },
  { valor: 'tablet', label: 'Tablet' },
  { valor: 'notebook', label: 'Notebook' },
  { valor: 'smartwatch', label: 'Smartwatch' },
]
