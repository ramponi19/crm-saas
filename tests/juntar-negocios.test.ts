import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planoDeJuncao, TABELAS_DO_NEGOCIO, TABELAS_COM_REGRA } from '@/lib/juntar-negocios'

type N = { id: number; filial_id: number | null; funil_id: number | null; ordem: number | null; created_at: string; status?: string; ganho_em?: string | null; perdido_em?: string | null }
const n = (id: number, filial: number | null, funil: number | null, ordem: number | null, criado: string, extra: Partial<N> = {}): N =>
  ({ id, filial_id: filial, funil_id: funil, ordem, created_at: criado, status: 'aberto', ...extra })
const resumo = (xs: N[]) => planoDeJuncao(xs).map((p) => [p.fica.id, p.saem.map((s) => s.id)]).sort()

test('junção: dois abertos — fica o mais avançado; empate, o mais recente', () => {
  assert.deepEqual(resumo([
    n(512, 3, 1, 2, '2026-08-12'), n(885, 3, 1, 2, '2026-08-13'), // Osvaldo Junior: empate → 885
    n(10, 6, 1, 5, '2026-01-01'), n(11, 6, 1, 1, '2026-10-01'),    // mais avançado vence o mais novo
    n(700, 3, 2, 0, '2026-10-01'), n(701, 6, 2, 0, '2026-10-01'),  // outro funil / outra loja: sozinhos
  ]), [[10, [11]], [885, [512]]])
})

test('junção: aberto x fechado — fica o aberto, mesmo atrás no funil (Byanca: o ganho de setembro sai)', () => {
  assert.deepEqual(resumo([
    n(2607, 6, 1, 13, '2026-09-08', { status: 'ganho', ganho_em: '2026-09-10' }),
    n(6259, 6, 1, 1, '2026-10-19'),
  ]), [[6259, [2607]]])
  assert.deepEqual(resumo([n(1, 3, 1, 9, '2026-01-01', { status: 'perdido', perdido_em: '2026-11-01' }), n(2, 3, 1, 0, '2025-01-01')]), [[2, [1]]])
})

test('junção: dois fechados — fica o fechado mais recentemente', () => {
  assert.deepEqual(resumo([
    n(1, 3, 1, 13, '2026-01-01', { status: 'ganho', ganho_em: '2026-03-01' }),
    n(2, 3, 1, 12, '2026-02-01', { status: 'perdido', perdido_em: '2026-09-01' }),
    n(3, 3, 1, 13, '2026-05-01', { status: 'ganho', ganho_em: null }), // sem data: vale a criação
  ]), [[2, [3, 1]]])
})

test('junção: etapa sem ordem perde para qualquer etapa; três abertos viram um', () => {
  const plano = planoDeJuncao([n(1, 3, 1, null, '2026-11-01'), n(2, 3, 1, 0, '2026-01-01'), n(3, 3, 1, 0, '2026-02-01')])
  assert.equal(plano[0].fica.id, 3)
  assert.deepEqual(plano[0].saem.map((s) => s.id), [2, 1])
})

// As 21 colunas com chave estrangeira para `negocios` (levantadas no banco em 06/11/2026):
// cada uma muda de negócio ou tem regra própria. Coluna nova com FK para negocios tem de entrar aqui.
test('junção: nenhuma coluna que aponta para negocios fica de fora', () => {
  const fks = ['assistencia_orcamentos.lead_id', 'automacao_execucoes.negocio_id', 'avaliacao_cotacoes.lead_id', 'avaliacao_usados.lead_id',
    'cadencia_inscricoes.lead_id', 'cadencia_inscricoes.negocio_id', 'chamadas.lead_id', 'estoque_unidades.reservado_lead_id',
    'imoveis_negocios.lead_id', 'imoveis_perfis_busca.lead_id', 'integracao_eventos.lead_id', 'negocio_historico.negocio_id',
    'rastreamento_eventos.lead_id', 'rastreamento_visitas.lead_id', 'tarefas.lead_id', 'tarefas.negocio_id',
    'vendas_fichas_financiamento.lead_id', 'vendas_propostas.lead_id', 'visitas.lead_id', 'zapintel_lead_perfil.lead_id', 'zapintel_venda_lead.lead_id']
  const cobertas = new Set([...TABELAS_DO_NEGOCIO.map((t) => `${t.tabela}.${t.coluna}`), ...TABELAS_COM_REGRA])
  assert.deepEqual(fks.filter((f) => !cobertas.has(f)), [])
})
