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

test('imobiliária: texto livre, painéis de negócio e match, visitas, corretor', () => {
  const cfg = empresaNascidaCom('imobiliaria')
  assert.deepEqual(perfilDoLead(cfg), {
    paineis: ['negocio-imovel', 'match-imoveis'], interesse: 'Imóvel interessado', agendaVisitas: true, textoLivre: true,
  })
  assert.equal(vocabulario(cfg).equipe, 'Corretor')
})

test('loja de veículos: texto livre, interesse e financiamento, sem visitas', () => {
  assert.deepEqual(perfilDoLead(empresaNascidaCom('concessionaria')), {
    paineis: ['interesse-veiculo', 'financiamento'], interesse: 'Veículo interessado', agendaVisitas: false, textoLivre: true,
  })
})

test('varejo: autocomplete do catálogo, nenhum painel, vendedor', () => {
  const varejo = { paineis: [], interesse: 'Produto interessado', agendaVisitas: false, textoLivre: false }
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
