/**
 * Telas da venda fechada (23/11/2026, Entrega A do pós-venda): os modais renderizados de verdade
 * (`react-dom/server`), com a UI básica trocada por elementos simples (o Modal real usa portal).
 *
 *   - Venda fechada: no máximo 4 campos — data (hoje por padrão, sem futuro), categoria,
 *     novo/seminovo, valor com teclado numérico no celular (inputMode decimal);
 *   - Reabrir venda e Corrigir data: o botão só liga com o motivo;
 *   - quadro e ficha: "Reabrir" e "Corrigir data da venda" só para dono/admin.
 *
 *   npm test
 */
import { test, describe, mock } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { diaNoFuso } from '@/lib/datas'

type P = Record<string, unknown> & { children?: ReactNode }
const tira = (p: P, ...fora: string[]) => Object.fromEntries(Object.entries(p).filter(([k]) => ![...fora, 'children'].includes(k)))
mock.module('@/components/ui', {
  namedExports: {
    Modal: (p: P) => createElement('section', { 'data-modal': String(p.title) }, createElement('h2', null, p.title as string), p.children, createElement('footer', null, p.footer as ReactNode)),
    Button: (p: P) => createElement('button', { disabled: !!p.disabled || !!p.loading, 'data-variant': p.variant as string }, p.children),
    Input: (p: P) => createElement('label', { 'data-campo': p.label as string }, p.label as string, createElement('input', tira(p, 'label', 'hint', 'error', 'icon', 'wrapperClassName'))),
    Select: (p: P) => createElement('label', { 'data-campo': p.label as string }, p.label as string, createElement('select', tira(p, 'label', 'hint', 'error', 'wrapperClassName'), p.children)),
    Textarea: (p: P) => createElement('label', { 'data-campo': p.label as string }, p.label as string, createElement('textarea', tira(p, 'label', 'hint', 'error', 'wrapperClassName'))),
    notify: { ok: () => {}, bad: () => {}, warn: () => {} },
  },
})
mock.module('@/lib/supabase/client', { namedExports: { createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) }, from: () => ({}) }) } })

const { GanhoModal } = await import('@/components/modules/leads/ganho-modal')
const { ReabrirVendaModal } = await import('@/components/modules/leads/reabrir-venda-modal')
const { CorrigirDataModal } = await import('@/components/modules/leads/corrigir-data-modal')

const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el)
const nada = () => {}

describe('Venda fechada (GanhoModal)', () => {
  const h = html(createElement(GanhoModal, { leadNome: 'Ana', valorInicial: 3295, onConfirm: nada, onCancel: nada }))
  const hoje = diaNoFuso(new Date(), 'America/Sao_Paulo')

  test('data da venda: hoje por padrão e sem futuro', () => {
    assert.match(h, new RegExp(`type="date"[^>]*value="${hoje}"`))
    assert.match(h, new RegExp(`max="${hoje}"`))
    assert.match(h, /min="2024-01-01"/)
  })
  test('valor com teclado numérico no celular, já preenchido com o valor do negócio', () => {
    assert.match(h, /inputMode="decimal"|inputmode="decimal"/)
    assert.match(h, /value="3295"/)
  })
  test('condição em dois botões: Novo e Usado (ou o termo da empresa)', () => {
    assert.match(h, /role="radiogroup" aria-label="Condição"/)
    assert.ok(h.includes('>Novo<') && h.includes('>Usado<'))
    const jm = html(createElement(GanhoModal, { leadNome: 'Ana', rotuloUsado: 'Seminovo', onConfirm: nada, onCancel: nada }))
    assert.ok(jm.includes('>Seminovo<'), 'o vocabulário da empresa troca o rótulo do usado')
  })
  test('no máximo 4 campos visíveis: data, categoria, condição, valor', () => {
    const campos = [...h.matchAll(/data-campo="([^"]+)"/g)].map((m) => m[1])
    const grupos = [...h.matchAll(/role="radiogroup" aria-label="([^"]+)"/g)].map((m) => m[1])
    const categoria = h.includes('Carregando categorias') ? 1 : 0 // a lista chega depois (efeito)
    assert.deepEqual(campos, ['Data da venda', 'Valor da venda (R$)'])
    assert.ok(campos.length + grupos.length + categoria <= 4)
  })
  test('erro do servidor aparece (422 GANHO_DADOS)', () => {
    const e = html(createElement(GanhoModal, { leadNome: 'Ana', erroServidor: { campo: 'valor', erro: 'Informe o valor da venda.' }, onConfirm: nada, onCancel: nada }))
    assert.ok(e.includes('Venda fechada'))
  })
})

describe('Reabrir venda e Corrigir data: o botão só liga com o motivo', () => {
  test('Reabrir venda começa desligado', () => {
    const h = html(createElement(ReabrirVendaModal, { leadNome: 'Ana', onConfirm: nada, onCancel: nada }))
    assert.match(h, /<button disabled="" data-variant="danger">Reabrir venda<\/button>/)
  })
  test('Corrigir data começa desligado e já mostra a data atual da venda', () => {
    const h = html(createElement(CorrigirDataModal, { leadId: 1, leadNome: 'Ana', ganhoEm: '2026-11-23T14:46:08Z', onClose: nada, onCorrigido: nada }))
    assert.match(h, /type="date"[^>]*value="2026-11-23"/)
    assert.match(h, /<button disabled="">Corrigir data<\/button>/)
  })
})

describe('Só dono/admin veem reabrir e corrigir', () => {
  const ficha = readFileSync('components/modules/leads/lead-modal.tsx', 'utf8')
  const quadro = readFileSync('components/modules/leads/kanban-board.tsx', 'utf8')
  test('ficha: "Corrigir data da venda" dentro de souAdmin', () => {
    assert.match(ficha, /\{souAdmin && \(\s*<Button[^\n]{0,140}>Corrigir data da venda<\/Button>/)
  })
  test('ficha: sair do ganho sem ser admin avisa e não abre o modal', () => {
    assert.match(ficha, /if \(saindoDoGanho\) \{\s*if \(!souAdmin\) \{ notify\.warn\([^)]*\); return \}\s*setReabrirPendente\(novo\)/)
  })
  test('quadro: arrastar para fora do ganho sem ser admin devolve o card', () => {
    assert.match(quadro, /if \(!souAdmin\) \{\s*notify\.warn\('Venda fechada'[^)]*\)\s*setLocalLeads\(leads\)\s*return/)
  })
  test('quadro e ficha: entrar no ganho abre o modal da venda antes de gravar', () => {
    assert.match(quadro, /destCol\?\.tipo === 'ganho' && origCol\?\.tipo !== 'ganho'\) \{ setErroGanho\(null\); setPendingGanho\(lead\); return \}/)
    assert.match(ficha, /alvo\?\.tipo === 'ganho' && !etapaEhGanho\([^)]*\)\) \{\s*setErroGanho\(null\); setGanhoPendente\(\{ etapa: novo, converter: false \}\); return/)
    assert.match(ficha, /onClick=\{iniciarConversao\}/, '"Converter em cliente" passa pelo modal da venda')
  })
})
