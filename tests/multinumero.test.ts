/**
 * MAIS DE UM NÚMERO POR LOJA (23/11/2026, itens 1, 5 e 6 do levantamento de multinúmero).
 *
 * Os itens 3 e 4 (resposta pelo canal da conversa, rótulo no card) estão em resolver-canal.test.ts.
 * Aqui: a tela de Canais lista todos os números de cada tipo (item 1); Transmissão e Automatize
 * saem pelo número escolhido / da conversa, conferido na Edge (item 5); a lista de modelos do card
 * e da Comunicação é a do número escolhido (item 6). Função pura + travas de código.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { finalDoNumero } from '@/lib/canais/modelos-waba'

const ler = (p: string) => readFileSync(p, 'utf8')

test('final do número: do nome de exibição, senão do id da Meta', () => {
  assert.equal(finalDoNumero('+55 19 99886-2028 · JM Store', '1541'), '2028')
  assert.equal(finalDoNumero('+55 19 98944-7419', null), '7419')
  assert.equal(finalDoNumero(null, '1275209519005928'), '5928')
  assert.equal(finalDoNumero('Atendimento · Loja', 'x'), '?')
})

test('item 1: a tela de Canais mostra TODOS os números de cada tipo, cada um com loja e botões', () => {
  const tela = ler('components/modules/canais/canais-view.tsx')
  assert.match(tela, /const lista = canais\.filter\(\(x\) => x\.tipo === tipo\)/)
  assert.match(tela, /lista\.map\(\(c\) =>/)
  assert.match(tela, /Conectar outro número/)
  // O "Atende" e o Desconectar são por linha (por canal), não por tipo.
  assert.match(tela, /onChange=\{\(e\) => definirLoja\(c, e\.target\.value\)\}/)
  assert.match(tela, /onClick=\{\(\) => setADesconectar\(c\)\}/)
  // O cartão por tipo não escolhe mais "um" canal para mostrar.
  assert.doesNotMatch(tela, /const c = por\(tipo\)/)
  assert.doesNotMatch(tela, /nasce na loja\s+principal/)
})

test('item 5: Transmissão guarda o número e a Edge envia por ele, conferido', () => {
  const rota = ler('app/api/transmissao/route.ts')
  assert.match(rota, /canal_id: canal\?\.id \?\? null/)
  assert.match(rota, /mais de um número de WhatsApp: escolha por qual a transmissão sai/)
  const tela = ler('app/(dashboard)/transmissao/transmissao-view.tsx')
  assert.match(tela, /canal_id: canal\?\.id \?\? null/)
  assert.match(tela, /data-transmissao-numero/)
  const sql = ler('supabase/migrations/20261123000100_transmissao_canal.sql')
  assert.match(sql, /add column if not exists canal_id bigint references public\.canais\(id\) on delete set null/)
  assert.match(sql, /create trigger transmissoes_canal_valido/)
  assert.match(sql, /modelo_aprovado_no_canal\(v_emp, t\.modelo_id, t\.canal_id\)/)
  // Sem número escolhido, a transmissão antiga segue pela regra de antes.
  assert.match(sql, /elsif not modelo_aprovado_na_loja\(v_emp, t\.modelo_id, t\.filial_id, false\)/)
  const edge = ler('supabase/functions/webhook-leads/index.ts')
  assert.match(edge, /select\("id, empresa_id, filial_id, status, modelo_id, canal_id"\)/)
  assert.match(edge, /if \(t\.canal_id != null\) \{/)
})

test('item 5: Automatize manda pelo WhatsApp da conversa e a Edge confere', () => {
  const auto = ler('lib/automacoes.ts')
  assert.match(auto, /whatsappDoClienteNaLoja\(db, e\.empresa_id, neg\.contato_id, neg\.filial_id\)/)
  assert.match(auto, /enviarModeloPelaEdge\(e, a, neg, modelo, telefone, doCliente\?\.canalId \?\? null\)/)
  const edge = ler('supabase/functions/webhook-leads/index.ts')
  // Envio do CRM (3) + Automatize + Transmissão: todos pela mesma conferência de canal.
  assert.equal((edge.match(/await canalDaResposta\(/g) ?? []).length, 5)
})

test('item 6: modelos do número escolhido no card e na Comunicação; a rota confere o número', () => {
  const rota = ler('app/api/modelos/route.ts')
  assert.match(rota, /searchParams\.get\('canal'\)/)
  assert.match(rota, /Este número não envia por esta loja\./)
  assert.match(rota, /aprovadosNoCanal\(svc, empresaId, wabaDoCanal\)/)
  assert.match(ler('components/modules/leads/lead-modal.tsx'), /&canal=\$\{canalEscolhido\.canalId\}/)
  assert.match(ler('components/modules/comunicacao/conversa-painel.tsx'), /&canal=\$\{conversa\.canal_id\}/)
  // A tela de modelos diz QUAL número (loja + final), não só a loja.
  assert.match(rota, /·\$\{n\.finais\[i\]\}/)
})
