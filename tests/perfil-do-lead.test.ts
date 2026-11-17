/**
 * O CARD DO LEAD RECEBE O PERFIL PRONTO (zero-segmento, 23/10/2026; pela empresa desde 29/10).
 *
 * O modal deixou de perguntar quem a empresa é; `perfilDoLead` responde o que ele
 * mostrava antes, para uma empresa recém-cadastrada com cada preset. Se um destes
 * mudar, o card de alguém mudou.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { perfilDoLead, vocabulario, camadasDoMenu } from '@/lib/empresa-config'
import { PRESETS, empresaNascidaCom } from './presets-da-migracao'

test('a migração traz os 7 presets', () => {
  assert.deepEqual(Object.keys(PRESETS).sort(), ['assistencia', 'concessionaria', 'food', 'imobiliaria', 'saude', 'servicos', 'varejo'])
})

// Imóveis, Agenda, Avaliações e Financiamento estão em preparação (17/11/2026): nunca ligados, então
// o card dessas empresas é o comum — só o vocabulário do preset fica. Quando um módulo sair da
// preparação, o painel dele volta aqui.
test('imobiliária: módulos em preparação não ligam painel; vocabulário fica (corretor)', () => {
  const cfg = empresaNascidaCom('imobiliaria')
  assert.deepEqual(perfilDoLead(cfg), {
    paineis: [], interesse: 'Imóvel interessado', agendaVisitas: false, textoLivre: false,
  })
  assert.equal(vocabulario(cfg).equipe, 'Corretor')
})

// Reservar do estoque e Orçamentos são painéis de módulo desde 17/11/2026 (antes o card os mostrava
// sempre): quem nasce com Estoque e Orçamentos os tem — e continua no autocomplete do catálogo.
test('loja de veículos: Avaliações em preparação, nenhum painel de veículo', () => {
  assert.deepEqual(perfilDoLead(empresaNascidaCom('concessionaria')), {
    paineis: ['orcamento', 'reserva-estoque'], interesse: 'Veículo interessado', agendaVisitas: false, textoLivre: false,
  })
})

test('varejo: autocomplete do catálogo, reservar e orçar, vendedor', () => {
  const varejo = { paineis: ['orcamento', 'reserva-estoque'], interesse: 'Produto interessado', agendaVisitas: false, textoLivre: false }
  assert.deepEqual(perfilDoLead(empresaNascidaCom('varejo')), varejo)
  assert.equal(vocabulario(empresaNascidaCom('varejo')).equipe, 'Vendedor')
})

test('empresa sem base gravada: o texto padrão, nunca um painel de vertical', () => {
  const cfg = { ...camadasDoMenu({}), modulos: [], forcados: undefined }
  assert.deepEqual(perfilDoLead(cfg), { paineis: [], interesse: 'Produto interessado', agendaVisitas: false, textoLivre: false })
  assert.equal(vocabulario(cfg).equipe, 'Vendedor')
})

test('desinstalar Imóveis na Central tira painéis e visitas do card da imobiliária', () => {
  const cfg = empresaNascidaCom('imobiliaria', [{ modulo: 'imoveis', ativo: false, config: {} }])
  assert.deepEqual(perfilDoLead(cfg).paineis, [])
  assert.equal(perfilDoLead(cfg).agendaVisitas, false)
})

test('clínica: tela inicial na Agenda e a Agenda falando de consulta e paciente', () => {
  const cfg = empresaNascidaCom('saude')
  assert.equal(cfg.telaInicial, '/agenda')
  assert.equal(cfg.vocabulario.contato, 'Paciente')
  assert.equal(cfg.vocabulario.agenda?.novo, 'Nova consulta')
  assert.equal(empresaNascidaCom('imobiliaria').telaInicial, null)
})

test('o funil de partida vem do preset: imobiliária com o dela, o resto com o padrão', async () => {
  const { KANBAN_COLUMNS } = await import('@/components/modules/leads/types')
  const ids = (p: string) => (PRESETS[p].etapas as { id: string }[]).map((e) => e.id)
  assert.deepEqual(ids('imobiliaria'), ['novo', 'contato', 'credito', 'aprovado', 'visita_agendada', 'proposta', 'contrato', 'vistoria', 'entrega_chaves', 'fechamento', 'perdido'])
  for (const p of ['varejo', 'assistencia', 'servicos', 'saude', 'food', 'concessionaria']) {
    assert.deepEqual(ids(p), KANBAN_COLUMNS.map((c) => c.id), p)
  }
})

test('só a loja de veículos nasce com o campo placa no item', () => {
  for (const [p, linha] of Object.entries(PRESETS)) {
    const placa = (linha.campos as { entidade: string; chave: string; modulo_dono: string }[]).find((c) => c.chave === 'placa')
    if (p === 'concessionaria') assert.deepEqual([placa?.entidade, placa?.modulo_dono], ['item', 'estoque'])
    else assert.equal(placa, undefined, p)
  }
})
