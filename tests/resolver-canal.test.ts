/**
 * POR ONDE RESPONDER (13/11/2026, itens 3 e 4 do levantamento de multinúmero).
 *
 * A decisão do canal é pura (`decidirCanal`) e não olha a origem do contato: os casos de risco
 * de produção eram cards com origem "WhatsApp", "Loja física" ou vazia que têm conversa de
 * WhatsApp — e a resposta virava anotação. Mais três travas de código: nenhuma decisão de envio
 * do card usa `lead.origem`; card e Comunicação mandam o canal; a Edge confere o canal.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  decidirCanal, identificacaoCurta, rotuloDoCanal, rotuloSemCanal, tipoCanal,
  type CanalLido, type EntradaDecisao,
} from '@/lib/canais/resolver-canal'

const AGORA = Date.parse('2026-11-13T15:00:00Z')
const h = (horas: number) => new Date(AGORA - horas * 3_600_000).toISOString()

// Os canais da JM em produção (13/11/2026).
const WA_MOGI: CanalLido = { id: 15, tipo: 'whatsapp', nome_exibicao: '+55 19 99886-2028 · JM Store', external_id: '1541', filial_id: 3, status: 'ativo' }
const WA_JAG: CanalLido = { id: 28, tipo: 'whatsapp', nome_exibicao: '+55 19 98944-7419 · JM Store', external_id: '8928', filial_id: 6, status: 'ativo' }
const IG_MOGI: CanalLido = { id: 25, tipo: 'instagram', nome_exibicao: '@jmstore_importados', external_id: '8132', filial_id: 3, status: 'ativo' }
const IG_JAG: CanalLido = { id: 26, tipo: 'instagram', nome_exibicao: '@jmstore_jaguariuna', external_id: '1547', filial_id: 6, status: 'ativo' }
const MSG_REDE: CanalLido = { id: 1, tipo: 'messenger', nome_exibicao: 'Importados JM Store', external_id: '7987', filial_id: null, status: 'ativo' }
const TODOS = [WA_MOGI, WA_JAG, IG_MOGI, IG_JAG, MSG_REDE]

const entrada = (o: Partial<EntradaDecisao>): EntradaDecisao => ({
  negocioId: 1, lojaId: 3, canais: TODOS, conversas: [], ultimaRecebidaComCanal: null,
  tipoUltimaConversa: null, temTelefone: true, identidades: [], ...o,
})

test('rótulos: número curto, conta, e mensagem antiga sem inventar número', () => {
  assert.equal(identificacaoCurta('whatsapp', '+55 19 99886-2028 · JM Store', '1541'), '2028')
  assert.equal(rotuloDoCanal('whatsapp', '2028'), 'WhatsApp ·2028')
  assert.equal(rotuloDoCanal('instagram', '@jmstore_importados'), 'Instagram · @jmstore_importados')
  assert.equal(rotuloSemCanal('whatsapp'), 'WhatsApp (canal não registrado)')
  assert.equal(rotuloSemCanal('WhatsApp'), 'WhatsApp (canal não registrado)')
  assert.equal(rotuloSemCanal('manual'), 'Anotação')
  assert.equal(rotuloSemCanal(null), 'Anotação')
  assert.equal(tipoCanal(' Instagram '), 'instagram')
  assert.equal(tipoCanal('Loja física'), null)
})

test('1. o canal da última mensagem recebida, com a janela daquele número', () => {
  const r = decidirCanal(entrada({
    conversas: [
      { canal_id: 15, ultima_recebida_at: h(2), ultima_mensagem_at: h(2) },
      { canal_id: 25, ultima_recebida_at: h(30), ultima_mensagem_at: h(30) },
    ],
    ultimaRecebidaComCanal: { canal_id: 15 }, tipoUltimaConversa: 'whatsapp',
  }), AGORA)
  assert.equal(r.motivo, 'ultima_recebida')
  assert.equal(r.sugerido?.canalId, 15)
  assert.equal(r.sugerido?.janela24h, 'aberta')
  assert.deepEqual(r.canais.map((c) => [c.canalId, c.janela24h]), [[15, 'aberta'], [25, 'nao_se_aplica']])
})

test('quem chegou pelo Instagram e hoje escreve no WhatsApp: responde no WhatsApp', () => {
  const r = decidirCanal(entrada({
    conversas: [
      { canal_id: 25, ultima_recebida_at: h(400), ultima_mensagem_at: h(400) },
      { canal_id: 15, ultima_recebida_at: h(1), ultima_mensagem_at: h(1) },
    ],
    ultimaRecebidaComCanal: { canal_id: 15 }, tipoUltimaConversa: 'whatsapp',
  }), AGORA)
  assert.equal(r.sugerido?.tipo, 'whatsapp')
})

test('dois números na mesma loja: o do número em que o cliente escreveu, não o mais recente', () => {
  const WA_MOGI_2: CanalLido = { ...WA_MOGI, id: 40, nome_exibicao: '+55 19 90000-1111', external_id: '9999' }
  const r = decidirCanal(entrada({
    canais: [...TODOS, WA_MOGI_2],
    conversas: [
      { canal_id: 15, ultima_recebida_at: h(3), ultima_mensagem_at: h(3) },
      { canal_id: 40, ultima_recebida_at: h(50), ultima_mensagem_at: h(50) },
    ],
    ultimaRecebidaComCanal: { canal_id: 15 }, tipoUltimaConversa: 'whatsapp',
  }), AGORA)
  assert.equal(r.sugerido?.canalId, 15)
  assert.deepEqual(r.canais.filter((c) => c.podeResponder).map((c) => c.rotulo), ['WhatsApp ·2028', 'WhatsApp ·1111'])
  assert.equal(r.canais.find((c) => c.canalId === 40)?.janela24h, 'fechada')
})

test('2. conversa antiga sem canal gravado (os cards 998/2411): WhatsApp ativo da loja, janela fechada', () => {
  const r = decidirCanal(entrada({
    conversas: [{ canal_id: null, ultima_recebida_at: h(2000), ultima_mensagem_at: h(2000) }],
    tipoUltimaConversa: 'whatsapp',
  }), AGORA)
  assert.equal(r.motivo, 'mesmo_tipo_da_ultima_conversa')
  assert.equal(r.sugerido?.canalId, 15)
  assert.equal(r.sugerido?.janela24h, 'fechada')
  assert.equal(r.sugerido?.temConversa, false)
})

test('a origem não entra: o canal vem só das conversas (a entrada nem tem origem)', () => {
  // Card 6530 (origem nula), 3575 ("Loja física"), 1710 ("loja_fisica"), em Jaguariúna, com conversa de WhatsApp.
  const r = decidirCanal(entrada({
    lojaId: 6,
    conversas: [{ canal_id: 28, ultima_recebida_at: h(200), ultima_mensagem_at: h(200) }],
    ultimaRecebidaComCanal: { canal_id: 28 }, tipoUltimaConversa: 'whatsapp',
  }), AGORA)
  assert.equal(r.sugerido?.canalId, 28)
  assert.equal(r.sugerido?.rotulo, 'WhatsApp ·7419')
})

test('canal de outra loja nunca é sugerido nem pode responder', () => {
  // Conversa num canal que hoje atende outra loja (mudou o "Atende"): só rótulo.
  const r = decidirCanal(entrada({
    lojaId: 6,
    conversas: [{ canal_id: 15, ultima_recebida_at: h(1), ultima_mensagem_at: h(1) }],
    ultimaRecebidaComCanal: { canal_id: 15 }, tipoUltimaConversa: 'whatsapp',
  }), AGORA)
  assert.equal(r.canais.find((c) => c.canalId === 15)?.podeResponder, false)
  assert.equal(r.sugerido?.canalId, 28)
  assert.equal(r.motivo, 'mesmo_tipo_da_ultima_conversa')
})

test('canal desconectado: cai no ativo da loja do mesmo tipo', () => {
  const r = decidirCanal(entrada({
    canais: [{ ...WA_MOGI, status: 'expirado' }, { ...WA_MOGI, id: 41, nome_exibicao: '+55 19 95555-3333' }, IG_MOGI],
    conversas: [{ canal_id: 15, ultima_recebida_at: h(1), ultima_mensagem_at: h(1) }],
    ultimaRecebidaComCanal: { canal_id: 15 }, tipoUltimaConversa: 'whatsapp',
  }), AGORA)
  assert.equal(r.sugerido?.canalId, 41)
})

test('3. sem canal do tipo da conversa: outro canal ativo da loja que alcance o cliente', () => {
  const r = decidirCanal(entrada({
    canais: [WA_MOGI, MSG_REDE],
    conversas: [{ canal_id: null, ultima_recebida_at: h(900), ultima_mensagem_at: h(900) }],
    tipoUltimaConversa: 'instagram', temTelefone: true,
  }), AGORA)
  assert.equal(r.motivo, 'canal_ativo_da_loja')
  assert.equal(r.sugerido?.canalId, 15)
  // Sem telefone e sem identidade: ninguém alcança.
  const s = decidirCanal(entrada({
    canais: [WA_MOGI, MSG_REDE],
    conversas: [{ canal_id: null, ultima_recebida_at: h(900), ultima_mensagem_at: h(900) }],
    tipoUltimaConversa: 'instagram', temTelefone: false,
  }), AGORA)
  assert.equal(s.motivo, 'sem_canal')
})

test('Instagram: só a conta em que o cliente tem identidade (é o que evita o #100)', () => {
  const base = { conversas: [{ canal_id: null, ultima_recebida_at: h(900), ultima_mensagem_at: h(900) }], tipoUltimaConversa: 'instagram' as const, temTelefone: false }
  assert.equal(decidirCanal(entrada({ ...base, identidades: [{ canal_tipo: 'instagram', canal_id: 26 }] }), AGORA).sugerido, null)
  assert.equal(decidirCanal(entrada({ ...base, identidades: [{ canal_tipo: 'instagram', canal_id: 25 }] }), AGORA).sugerido?.canalId, 25)
  assert.equal(decidirCanal(entrada({ ...base, identidades: [{ canal_tipo: 'instagram', canal_id: null }] }), AGORA).sugerido?.canalId, 25)
})

test('4. sem conversa nenhuma na loja: sem canal (anotação), mesmo com telefone e WhatsApp na loja', () => {
  const r = decidirCanal(entrada({ temTelefone: true }), AGORA)
  assert.equal(r.motivo, 'sem_canal')
  assert.equal(r.sugerido, null)
  assert.deepEqual(r.canais, [])
})

test('Messenger da rede (filial nula) responde por qualquer loja', () => {
  const r = decidirCanal(entrada({
    lojaId: 6,
    conversas: [{ canal_id: 1, ultima_recebida_at: h(5), ultima_mensagem_at: h(5) }],
    ultimaRecebidaComCanal: { canal_id: 1 }, tipoUltimaConversa: 'messenger',
  }), AGORA)
  assert.equal(r.sugerido?.canalId, 1)
  assert.equal(r.sugerido?.janela24h, 'nao_se_aplica')
})

// ── Travas de código ──────────────────────────────────────────────────────────

const card = readFileSync('components/modules/leads/lead-modal.tsx', 'utf8')
const painel = readFileSync('components/modules/comunicacao/conversa-painel.tsx', 'utf8')
const edge = readFileSync('supabase/functions/webhook-leads/index.ts', 'utf8')

test('card: nenhuma decisão de envio usa lead.origem; texto e mídia mandam o canalId', () => {
  assert.doesNotMatch(card, /const canal = lead\.origem/)
  assert.doesNotMatch(card, /lead\.origem === 'whatsapp'/)
  const envios = card.match(/entregarViaEdge\(supabase, '(send|send_meta)', \{[^}]*\}/g) ?? []
  assert.ok(envios.length >= 4, 'texto e mídia, WhatsApp e Meta')
  for (const e of envios) assert.match(e, /canalId: canal\.canalId/)
  // Anotação só com "sem canal" de verdade, e com origem fixa (nunca a do contato).
  for (const r of card.match(/registrarSemCanal\(\{[^}]*\}\)/g) ?? []) assert.match(r, /origem: 'manual'/)
})

test('Comunicação manda o canal da conversa', () => {
  const envios = painel.match(/entregarViaEdge\(supabase, '(send|send_meta)', \{[^}]*\}/g) ?? []
  assert.equal(envios.length, 4)
  for (const e of envios) assert.match(e, /canalId: conversa\.canal_id/)
})

test('Edge: as três ações de envio do CRM passam pela conferência do canal', () => {
  assert.equal((edge.match(/await canalDaResposta\(negocio, /g) ?? []).length, 3)
  assert.match(edge, /destinoNaConta\(/)
  assert.doesNotMatch(edge, /idents\?\.\[0\]\?\.external_id/)
})
