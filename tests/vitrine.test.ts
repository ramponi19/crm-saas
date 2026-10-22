/**
 * VITRINE DE MÓDULO DESLIGADO (etapa 0, 2.5).
 *
 * O proxy reescreve para a vitrine só os módulos que têm uma (lib/modulos-vitrine.ts);
 * o resto continua caindo no dashboard com o aviso. Aqui se garante que os três
 * estão lá, que cada um traz os 3 números, e que cada vitrine aponta para um tile da
 * Central de Módulos (22/10/2026) — senão o botão "Ver na Central" cairia no vazio.
 *
 *   npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { VITRINES, temVitrine } from '@/lib/modulos-vitrine'
import { moduloPorHref } from '@/core/modulos'
import { moduloDaRota } from '@/lib/menu'

test('os três módulos têm vitrine; os outros não', () => {
  for (const href of ['/agenda', '/executivo', '/gestao-leads']) assert.ok(temVitrine(href), href)
  assert.ok(!temVitrine('/pdv'))
  assert.ok(!temVitrine('/toString'))
})

test('cada vitrine é um módulo que a trava conhece, com 3 números', () => {
  for (const [href, v] of Object.entries(VITRINES)) {
    assert.equal(moduloDaRota(href), href, `${href} precisa estar no catálogo para a trava agir`)
    assert.equal(v.numeros.length, 3)
  }
})

test('cada vitrine aponta para um tile do manifesto', () => {
  for (const href of Object.keys(VITRINES)) assert.ok(moduloPorHref(href), `${href} sem módulo em core/modulos.ts`)
})
