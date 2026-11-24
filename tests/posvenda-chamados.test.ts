import test from 'node:test'
import assert from 'node:assert/strict'
import { ordenarChamados, resumoNps, situacaoDoPrazo } from '@/lib/posvenda/chamados'
import { depoisDaNota, MENSAGEM_NEUTRO_PADRAO, PARAMETROS } from '@/lib/posvenda/config'

// C7 bloco 4 (24/11/2026): depois da nota, NPS, prazo e ordem dos chamados.

const LINK = 'https://g.page/r/loja-teste/review'

test('depois da nota: 9–10 pede avaliação com o link da loja; 7–8 pergunta o que melhorar; até o limite, chamado', () => {
  const p = depoisDaNota(10, { limiteChamado: 6, nome: 'Ana Paula', link: LINK })
  assert.equal(p.faixa, 'promotor')
  assert.equal(p.texto, `Que bom, Ana! Obrigado pela nota. Se puder, conte como foi no Google, ajuda muito a loja: ${LINK}`)
  const n = depoisDaNota(8, { limiteChamado: 6, nome: 'Ana', link: LINK })
  assert.equal(n.faixa, 'neutro'); assert.equal(n.texto, MENSAGEM_NEUTRO_PADRAO.replace('{{nome}}', 'Ana'))
  const d = depoisDaNota(6, { limiteChamado: 6, nome: 'Ana', link: LINK })
  assert.equal(d.faixa, 'detrator'); assert.equal(d.texto, null)
  // limite 8: 7 e 8 já abrem chamado
  assert.equal(depoisDaNota(8, { limiteChamado: 8, nome: 'Ana', link: LINK }).faixa, 'detrator')
})

test('depois da nota: promotor sem link da loja não sugere texto, avisa onde configurar; texto da empresa vence o padrão', () => {
  const p = depoisDaNota(9, { limiteChamado: 6, nome: 'Ana', link: null })
  assert.equal(p.texto, null); assert.match(p.aviso ?? '', /link de avaliação/)
  const e = depoisDaNota(9, { limiteChamado: 6, nome: 'Bia', link: LINK, textoPromotor: 'Valeu, {{nome}}! Avalie: {{link}}' })
  assert.equal(e.texto, `Valeu, Bia! Avalie: ${LINK}`)
})

test('parâmetros novos: link só https; mensagens com pelo menos 3 letras', () => {
  assert.equal(PARAMETROS.link_avaliacao.validar('http://exemplo.com'), undefined)
  assert.equal(PARAMETROS.link_avaliacao.validar('nao é link'), undefined)
  assert.equal(PARAMETROS.link_avaliacao.validar(LINK), LINK)
  assert.equal(PARAMETROS.link_avaliacao.porLoja, true)
  assert.equal(PARAMETROS.mensagem_promotor.validar('  '), undefined)
})

test('NPS: % promotores menos % detratores', () => {
  assert.deepEqual(resumoNps([10, 9, 8, 7, 6, 0]), { respostas: 6, promotores: 2, neutros: 2, detratores: 2, nps: 0 })
  assert.equal(resumoNps([10, 10, 9, 5]).nps, 50)
  assert.equal(resumoNps([]).nps, null)
})

test('prazo: sem 1ª resposta vale o da resposta; vencido = atrasado; perto = atenção; resolvido = verde', () => {
  const agora = new Date('2026-11-24T15:00:00Z')
  const f = (iso: string) => iso.slice(11, 16)
  const base = { resolvido_em: null, primeira_resposta_em: null, sla_resposta_vence: '2026-11-24T14:00:00Z', sla_resolucao_vence: '2026-11-27T14:00:00Z' }
  assert.deepEqual(situacaoDoPrazo(base, agora, f), { tone: 'bad', texto: '1ª resposta atrasada desde 14:00' })
  assert.equal(situacaoDoPrazo({ ...base, primeira_resposta_em: '2026-11-24T13:00:00Z' }, agora, f).tone, 'neutro')
  assert.equal(situacaoDoPrazo({ ...base, sla_resposta_vence: '2026-11-24T17:00:00Z' }, agora, f).tone, 'warn')
  assert.equal(situacaoDoPrazo({ ...base, resolvido_em: '2026-11-24T14:30:00Z' }, agora, f).texto, 'resolvido')
})

test('ordem: abertos pelo prazo mais apertado; resolvidos depois, do mais recente', () => {
  const c = (id: number, resp: string | null, resolvido: string | null) => ({ id, aberto_em: '2026-11-20T10:00:00Z', resolvido_em: resolvido,
    primeira_resposta_em: null, sla_resposta_vence: resp, sla_resolucao_vence: null })
  const lista = [c(1, '2026-11-26T10:00:00Z', null), c(2, null, '2026-11-22T10:00:00Z'), c(3, '2026-11-25T10:00:00Z', null), c(4, null, '2026-11-23T10:00:00Z')]
  assert.deepEqual(ordenarChamados(lista).map((x) => x.id), [3, 1, 4, 2])
})
