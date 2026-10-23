/**
 * O CARD DO LEAD RECEBE O PERFIL PRONTO (zero-segmento, 23/10/2026).
 *
 * O modal deixou de perguntar quem a empresa é; `perfilDoLead` responde o que ele
 * mostrava antes, preset a preset. Se um destes mudar, o card de alguém mudou.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { perfilDoLead, vocabulario } from '@/lib/empresa-config'

test('imobiliária: texto livre, painéis de negócio e match, visitas, corretor', () => {
  assert.deepEqual(perfilDoLead({ preset: 'imobiliaria' }), {
    paineis: ['negocio-imovel', 'match-imoveis'], interesse: 'Imóvel interessado', agendaVisitas: true, textoLivre: true,
  })
  assert.equal(vocabulario({ preset: 'imobiliaria' }).equipe, 'Corretor')
})

test('loja de veículos: texto livre, interesse e financiamento, sem visitas', () => {
  assert.deepEqual(perfilDoLead({ preset: 'concessionaria' }), {
    paineis: ['interesse-veiculo', 'financiamento'], interesse: 'Veículo interessado', agendaVisitas: false, textoLivre: true,
  })
})

test('varejo e preset desconhecido: autocomplete do catálogo, nenhum painel, vendedor', () => {
  const varejo = { paineis: [], interesse: 'Produto interessado', agendaVisitas: false, textoLivre: false }
  assert.deepEqual(perfilDoLead({ preset: 'varejo' }), varejo)
  assert.deepEqual(perfilDoLead({ preset: null }), varejo)
  assert.deepEqual(perfilDoLead({ preset: 'nao-existe' }), varejo)
  assert.equal(vocabulario({ preset: null }).equipe, 'Vendedor')
})
