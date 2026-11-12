import { test } from 'node:test'
import assert from 'node:assert/strict'
import { atualizadoHa } from '@/lib/publicos/tempo'
import { MODULOS } from '@/core/modulos'
import { VITRINES } from '@/lib/modulos-vitrine'
import { CATALOGO, GRUPO_DO_HREF } from '@/lib/menu'
import { MENU_ICONS } from '@/components/layout/menu-icons'

const AGORA = new Date('2026-11-12T15:00:00Z')
const antes = (min: number) => new Date(AGORA.getTime() - min * 60_000).toISOString()

test('públicos: "atualizado há X" diz de quando é a conta', () => {
  assert.equal(atualizadoHa(null, AGORA), 'ainda não contado')
  assert.equal(atualizadoHa('lixo', AGORA), 'ainda não contado')
  assert.equal(atualizadoHa(antes(0), AGORA), 'atualizado agora')
  assert.equal(atualizadoHa(antes(0.5), AGORA), 'atualizado agora')
  assert.equal(atualizadoHa(antes(1), AGORA), 'atualizado há 1 min')
  assert.equal(atualizadoHa(antes(59), AGORA), 'atualizado há 59 min')
  assert.equal(atualizadoHa(antes(60), AGORA), 'atualizado há 1 h')
  assert.equal(atualizadoHa(antes(23 * 60 + 59), AGORA), 'atualizado há 23 h')
  assert.equal(atualizadoHa(antes(24 * 60), AGORA), 'atualizado há 1 dia')
  assert.equal(atualizadoHa(antes(3 * 24 * 60), AGORA), 'atualizado há 3 dias')
  // Relógio do aparelho atrasado (conta "no futuro"): não vira número negativo.
  assert.equal(atualizadoHa(new Date(AGORA.getTime() + 5 * 60_000).toISOString(), AGORA), 'atualizado agora')
})

test('públicos: nasce como módulo (manifesto sem requisito, menu opcional, vitrine)', () => {
  const m = MODULOS.find((x) => x.chave === 'publicos')
  assert.ok(m, 'no manifesto')
  assert.equal(m!.href, '/publicos')
  assert.equal(m!.grupo, 'comunicacao')
  assert.ok(!m!.requer?.length, 'não depende de outro módulo')
  const item = CATALOGO.flatMap((g) => g.items).find((i) => i.href === '/publicos')
  assert.ok(item?.opcional, 'item opcional no menu')
  assert.ok(MENU_ICONS[item!.icon], 'ícone existe no mapa do menu')
  assert.equal(GRUPO_DO_HREF['/publicos'], 'comunicacao')
  assert.ok(VITRINES['/publicos'], 'vitrine quando desligado')
})
