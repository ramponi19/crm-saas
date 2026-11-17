import { valorPorExtenso } from '@/lib/contrato-extenso'
import type { ContratoItem } from '@/lib/contrato-tipos'
import type { ContratoTroca } from '@/lib/contrato-modelo'

/**
 * O CONTRATO DE UMA LOJA DE CELULAR (módulo Celulares e aparelhos, `check_imei`; 17/11/2026).
 *
 * O contrato do core fala de produto e nº de série. A troca de aparelho — o cliente entrega o usado
 * e ele abate no total — é do módulo de celular: os marcadores {{trocas}} e companhia, a tabela
 * "Aparelho entregue" e a coluna "IMEI / Nº série" saem daqui. lib/contrato-modelo.ts só os usa com
 * o módulo ligado ou quando a venda tem troca (uma venda antiga com troca continua saindo inteira).
 */

const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))
const TH = 'border-bottom:1px solid currentColor;padding:4px 6px'

/** Cabeçalho da coluna de série na tabela de itens, com o módulo de celular. */
export const COLUNA_SERIE_CELULAR = 'IMEI / Nº série'

/** Os marcadores da troca, para a tela de montar o documento. */
export const MARCADORES_TROCA: { chave: string; rotulo: string }[] = [
  { chave: 'trocas', rotulo: 'Tabela dos aparelhos entregues na troca' },
  { chave: 'trocas.descricao', rotulo: 'Aparelhos da troca em texto corrido' },
  { chave: 'trocas.total', rotulo: 'Valor total dado na troca (R$)' },
  { chave: 'trocas.total_extenso', rotulo: 'Valor da troca por extenso' },
  { chave: 'trocas.quantidade', rotulo: 'Quantos aparelhos na troca' },
]

/** O rótulo do marcador {{itens}} com o módulo de celular. */
export const ROTULO_ITENS_CELULAR = 'Tabela de itens (produto, IMEI, valor)'

/** Itens da pré-visualização do documento numa loja de celular. */
export const ITENS_EXEMPLO_CELULAR: ContratoItem[] = [
  { descricao: 'iPhone 15 Pro 256GB', imei: '350000000000001', valor: 5000, garantia_dias: 90 },
  { descricao: 'Acessório: Película', imei: null, valor: 300, garantia_dias: 90 },
]

const somaTrocas = (t?: ContratoTroca[]) => (t ?? []).reduce((s, x) => s + (Number(x.valor) || 0), 0)

/** "iPhone 12 64GB (IMEI 3548…), avaliado em R$ 1.200,00" */
function descreverTroca(t: ContratoTroca): string {
  const partes = [t.aparelho?.trim() || 'aparelho']
  if (t.imei?.trim()) partes.push(`IMEI ${t.imei.trim()}`)
  return `${partes.join(', ')}, avaliado em ${brl(t.valor)}`
}

function tabelaTrocas(trocas: ContratoTroca[]): string {
  const validas = trocas.filter((t) => t.aparelho?.trim() || t.valor > 0)
  if (!validas.length) return ''
  const linhas = validas.map((t) => `<tr>
      <td>${esc(t.aparelho?.trim() || 'Aparelho')}</td>
      <td style="text-align:right">${t.imei?.trim() ? esc(t.imei.trim()) : '—'}</td>
      <td style="text-align:right">${brl(t.valor)}</td>
    </tr>`).join('')
  return `<table style="width:100%;border-collapse:collapse;margin:6px 0">
    <thead><tr>
      <th style="text-align:left;${TH}">Aparelho entregue</th>
      <th style="text-align:right;${TH}">IMEI / Nº série</th>
      <th style="text-align:right;${TH}">Valor avaliado</th>
    </tr></thead>
    <tbody>${linhas}</tbody>
  </table>`
}

/**
 * Os valores dos marcadores da troca. Aparelhos entregues pelo cliente — base do termo de entrega
 * do usado. Sem troca, todos saem vazios (ou zerados), e o modelo que os usa não mostra nada.
 */
export function marcadoresTroca(trocas: ContratoTroca[] = []): Record<string, string> {
  return {
    'trocas': tabelaTrocas(trocas),
    'trocas.descricao': esc(trocas.map(descreverTroca).join('; ')),
    'trocas.total': brl(somaTrocas(trocas)),
    'trocas.total_extenso': valorPorExtenso(somaTrocas(trocas)),
    'trocas.quantidade': String(trocas.length),
  }
}
