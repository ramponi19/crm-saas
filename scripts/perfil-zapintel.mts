/**
 * A FICHA DE IA DE UM LEAD — montada aqui fora, para ser julgada antes de ir
 * para a tela. E, com `--todos`, a base inteira de uma vez.
 *
 *     npx tsx scripts/perfil-zapintel.mts 439          (só o prompt)
 *     npx tsx scripts/perfil-zapintel.mts 439 --ia     (chama o modelo)
 *     npx tsx scripts/perfil-zapintel.mts 439 --ia --salvar
 *
 *     npx tsx scripts/perfil-zapintel.mts --todos 1 --limite 20   (prova)
 *     npx tsx scripts/perfil-zapintel.mts --todos 1               (tudo)
 *
 * ══ POR QUE UM SCRIPT, E NÃO ABRIR A TELA ══════════════════════════════════
 *
 * Porque o que decide se esta funcionalidade presta é o TEXTO, e texto se
 * julga lendo. Abrir a tela mostra o resultado dentro de um cartão bonito, o
 * que é exatamente o jeito de não reparar que a frase está errada.
 *
 * Sem `--ia` ele não chama o modelo nem gasta cota: imprime o PROMPT inteiro,
 * que é a metade do trabalho que dá para conferir de graça. Se o contexto
 * estiver errado — mensagem faltando, transcrição não marcada, fato do CRM
 * ausente —, nenhuma qualidade de modelo conserta.
 *
 * ⚠ `--salvar` grava em `zapintel_lead_perfil`, e a tela passa a mostrar o que
 * for gravado. Serve para provar o caminho inteiro num lead escolhido, não
 * para encher a base.
 */

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { carregarConversas } from '../lib/zapintel/conversas'
import { montarFicha } from '../lib/zapintel/ficha'
import { ondeTravou } from '../lib/zapintel/travou'
import {
  contextoDoPerfil, gerarPerfil, guardarPerfil, lerPerfil, marcaDaConversa,
} from '../lib/zapintel/perfil'
import type { RawMessage } from '../types/zapintel'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
// `perguntarIA` e o client de serviço leem de `process.env` — num script não
// há Next para carregar o `.env.local`, então ele entra aqui.
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v as string

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const COM_IA = process.argv.includes('--ia')
const SALVAR = process.argv.includes('--salvar')
const TODOS = process.argv.includes('--todos')
const arg = (nome: string): number | null => {
  const i = process.argv.indexOf(nome)
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN
  return Number.isFinite(v) ? v : null
}

if (TODOS) { await base(arg('--todos') ?? 1, arg('--limite')); process.exit(0) }

const LEAD = Number(process.argv[2])
if (!Number.isInteger(LEAD) || LEAD <= 0) {
  console.error('uso: npx tsx scripts/perfil-zapintel.mts <leadId> [--ia] [--salvar]')
  console.error('     npx tsx scripts/perfil-zapintel.mts --todos <empresaId> [--limite N]')
  process.exit(1)
}

const { data: dono } = await db.from('leads').select('empresa_id').eq('id', LEAD).maybeSingle()
if (!dono) { console.error(`lead ${LEAD} nao existe`); process.exit(1) }
const EMPRESA = dono.empresa_id as number

const { analisados, porId, nomeDaLoja } = await carregarConversas(db, EMPRESA, [LEAD])
const lead = analisados[0]
const banco = porId.get(LEAD)
if (!lead || !banco) { console.error('conversa nao encontrada'); process.exit(1) }

const { data: ponte } = await db
  .from('zapintel_venda_lead').select('venda_id, dias_ate_venda')
  .eq('empresa_id', EMPRESA).eq('lead_id', LEAD)
  .order('dias_ate_venda', { ascending: true }).limit(1).maybeSingle()

let valorVenda: number | null = null
if (ponte?.venda_id) {
  const { data: v } = await db.from('vendas').select('valor_venda').eq('id', ponte.venda_id).maybeSingle()
  valorVenda = v?.valor_venda != null ? Number(v.valor_venda) : null
}

const ficha = montarFicha(lead, {
  leadId: LEAD,
  filialId: banco.filial_id,
  canal: banco.origem ?? 'whatsapp',
  comprou: !!ponte,
  valorVenda,
  diasAteVenda: (ponte?.dias_ate_venda as number | null) ?? null,
})
const travou = ondeTravou(lead, !!ponte)
const marca = marcaDaConversa(lead)

const contexto = contextoDoPerfil({
  lead, ficha, travou, nomeDaLoja,
  kanban: banco.kanban_status,
  temVendaRegistrada: !!ponte,
  valorVenda,
  diasAteVenda: (ponte?.dias_ate_venda as number | null) ?? null,
})

const risco = '─'.repeat(74)
console.log(`\n${risco}\nLEAD ${LEAD} · ${lead.contact} · ${nomeDaLoja}\n${risco}`)
console.log(`mensagens ............ ${marca.mensagens}`)
console.log(`transcritas de audio . ${marca.transcritos}`)
console.log(`contexto ............. ${contexto.length.toLocaleString('pt-BR')} caracteres (~${Math.round(contexto.length / 3.6).toLocaleString('pt-BR')} tokens)`)
console.log(`\n${risco}\nO QUE A IA VAI LER\n${risco}\n`)
console.log(contexto)

if (!COM_IA) {
  console.log(`\n${risco}\n(sem --ia: nao chamei o modelo e nao gastei cota)\n`)
  process.exit(0)
}

console.log(`\n${risco}\nCHAMANDO O MODELO...\n${risco}`)
const r = await gerarPerfil({
  empresaId: EMPRESA, lead, ficha, travou, nomeDaLoja,
  kanban: banco.kanban_status,
  temVendaRegistrada: !!ponte,
  valorVenda,
  diasAteVenda: (ponte?.dias_ate_venda as number | null) ?? null,
})

if (!r.ok) { console.error(`\nFALHOU (${r.status}): ${r.erro}\n`); process.exit(1) }

const p = r.perfil
console.log(`\nrespondeu em ${(r.ms / 1000).toFixed(1)}s\n`)
console.log(`${risco}\nA FICHA\n${risco}\n`)
console.log(`CLASSIFICACAO .. ${p.classificacao}`)
console.log(`SCORE .......... ${p.score}`)
console.log(`RISCO DE PERDA . ${p.riscoPerda}%`)
console.log(`PERFIL ......... ${p.perfil}`)
console.log(`URGENCIA ....... ${p.urgencia}`)
console.log(`\nANALISE DE IA\n  ${p.diagnostico}`)
console.log(`\nO QUE ACONTECEU\n${p.relato.split('\n').map((l) => `  ${l}`).join('\n')}`)
console.log('\nSINAIS DE COMPRA')
for (const s of p.sinais) console.log(`  + ${s.rotulo}\n      "${s.evidencia}"`)
console.log('\nOBJECOES')
for (const o of p.objecoes) console.log(`  ! ${o.rotulo}\n      "${o.evidencia}"\n      -> ${o.desfecho}`)
console.log('\nFICOU EM ABERTO')
for (const x of p.pontasSoltas) console.log(`  - ${x}`)
console.log(`\nPROXIMA ACAO\n  ${p.proximaAcao}\n  por que: ${p.proximaAcaoPorque}`)
console.log(`\nRASCUNHO PARA MANDAR\n  ${p.mensagemSugerida}\n`)

if (SALVAR) {
  const { data: cfg } = await db.from('assistente_config').select('modelo').eq('id', 1).maybeSingle()
  await guardarPerfil(db, EMPRESA, LEAD, marca, p, (cfg?.modelo as string) ?? null, r.ms)
  console.log(`guardado em zapintel_lead_perfil (lead ${LEAD}).\n`)
}

/**
 * A BASE INTEIRA — a ficha de todo lead que tem conversa de verdade.
 *
 * ══ POR QUE EM LOTE, SE A TELA JÁ GERA SOZINHA ═════════════════════════════
 *
 * Porque sob demanda o primeiro a abrir cada lead espera o modelo, e porque o
 * Lucas quer a base pronta: *"podemos ja realizar a construcao para todos"*.
 * Medido em 13/10/2026 na empresa 1: 1.914 leads com conversa real, 30,3
 * mensagens de média — cerca de R$ 5 com Haiku, R$ 24 com Gemini Flash pago.
 *
 * ══ QUEM FICA DE FORA, E POR QUÊ ═══════════════════════════════════════════
 *
 * Lead com menos de 2 mensagens, ou em que o cliente nunca falou. São 89 na
 * empresa 1 — disparo, casca de sincronização, número errado. Pagar por uma
 * ficha de uma conversa que não existiu produziria exatamente o texto vazio
 * que este módulo veio eliminar.
 *
 * ══ AS TRÊS PROTEÇÕES ══════════════════════════════════════════════════════
 *
 * `LADO_A_LADO = 3` ... provedor tem limite por minuto, e estourá-lo faz o
 *                      lote inteiro falhar em cascata com 429.
 * `--limite N` ....... prova com 20 antes de gastar com 1.914.
 * falhas seguidas .... 5 erros em sequência param tudo. Cota esgotada ou
 *                      chave errada devolvem erro em TODO lead, e sem este
 *                      corte o laço percorreria a base inteira gastando
 *                      tempo para gravar nada.
 */
async function base(empresaId: number, limite: number | null): Promise<void> {
  const t0 = Date.now()
  console.log(`\nlendo as conversas da empresa ${empresaId}...`)
  const { analisados, porId, nomeDaLoja } = await carregarConversas(db, empresaId)

  const { data: ponteRaw } = await db
    .from('zapintel_venda_lead').select('lead_id, venda_id, dias_ate_venda')
    .eq('empresa_id', empresaId).not('lead_id', 'is', null)
  const { data: vendasRaw } = await db
    .from('vendas').select('id, valor_venda').eq('empresa_id', empresaId)
  const valorDa = new Map((vendasRaw ?? []).map((v) => [v.id as number, Number(v.valor_venda ?? 0)]))
  const compra = new Map<number, { valor: number | null; dias: number | null }>()
  for (const p of ponteRaw ?? []) {
    compra.set(p.lead_id as number, {
      valor: valorDa.get(p.venda_id as number) ?? null,
      dias: (p.dias_ate_venda as number | null) ?? null,
    })
  }

  const { data: cfg } = await db.from('assistente_config').select('modelo').eq('id', 1).maybeSingle()
  const modelo = (cfg?.modelo as string) ?? null

  /**
   * Quem NÃO recebe ficha, por id, passado na linha de comando.
   *
   * Existe para as conversas internas que o CRM guarda como lead — a loja de
   * Jaguariúna falando com a de Mogi, o dono da loja com 1.641 mensagens com
   * o vendedor. Ficha disso é texto sem sentido pago à IA. Por argumento, e
   * não numa lista no código, porque quais são os números internos é dado de
   * cada empresa, e o código não pode saber o telefone de nenhuma delas.
   */
  const pular = new Set(
    (process.argv.includes('--pular') ? process.argv[process.argv.indexOf('--pular') + 1] : '')
      .split(',').map(Number).filter(Boolean),
  )

  // Só quem teve conversa. Ver o cabeçalho.
  const alvos = analisados.filter((a) => {
    const id = Number(String(a.id).replace('lead-', ''))
    return porId.has(id) && !pular.has(id)
      && a.messages.length >= 2 && a.messages.some((m: RawMessage) => !m.isStore)
  })

  /**
   * A ORDEM É A DO PLANO DE AÇÃO: primeiro quem está esperando a loja.
   *
   * Se o lote parar no meio — cota do dia, provedor fora —, o que já foi
   * feito tem de ser o que mais vale amanhã de manhã: as conversas em que o
   * CLIENTE falou por último. Dentro de cada grupo, a mais recente primeiro.
   */
  const lojaDeve = (a: (typeof alvos)[number]) => !a.messages[a.messages.length - 1]?.isStore
  alvos.sort((x, y) => (Number(lojaDeve(y)) - Number(lojaDeve(x))) || (x.daysInactive - y.daysInactive))

  const fila = limite ? alvos.slice(0, limite) : alvos
  console.log(`${analisados.length} leads · ${alvos.length} com conversa real · vou fazer ${fila.length}\n`)

  let feitos = 0, pulados = 0, falhas = 0, seguidas = 0
  const LADO_A_LADO = 3

  for (let i = 0; i < fila.length; i += LADO_A_LADO) {
    if (seguidas >= 5) {
      console.log(`\nPAREI: 5 falhas seguidas. Cota, chave ou provedor — nada a ganhar insistindo.\n`)
      break
    }
    await Promise.all(fila.slice(i, i + LADO_A_LADO).map(async (a) => {
      const id = Number(String(a.id).replace('lead-', ''))
      const banco = porId.get(id)!
      const marca = marcaDaConversa(a)

      const guardado = await lerPerfil(db, empresaId, id, marca)
      if (guardado?.atual) { pulados++; return }

      const c = compra.get(id)
      const ficha = montarFicha(a, {
        leadId: id, filialId: banco.filial_id, canal: banco.origem ?? 'whatsapp',
        comprou: !!c, valorVenda: c?.valor ?? null, diasAteVenda: c?.dias ?? null,
      })
      /**
       * ATÉ TRÊS TENTATIVAS, COM ESPERA CRESCENTE.
       *
       * No teste de 14/10, 2 de 3 chamadas pegaram "alta demanda" do Google
       * (503). `perguntarIA` já tenta uma segunda vez após 2 s; num lote de
       * quase duas mil chamadas isso não basta, e 5 falhas seguidas parariam
       * tudo por um pico que passa em segundos. 8 s e depois 25 s cobrem o
       * pico sem mascarar o que é permanente — cota esgotada ou chave
       * recusada continuam falhando, e aí o corte das 5 seguidas age.
       */
      const pedido = {
        empresaId, lead: a, ficha, travou: ondeTravou(a, !!c), nomeDaLoja,
        kanban: banco.kanban_status, temVendaRegistrada: !!c,
        valorVenda: c?.valor ?? null, diasAteVenda: c?.dias ?? null,
      }
      let r = await gerarPerfil(pedido)
      for (const espera of [8_000, 25_000]) {
        if (r.ok || r.status === 400 || r.status === 404) break
        await new Promise((ok) => setTimeout(ok, espera))
        r = await gerarPerfil(pedido)
      }
      if (!r.ok) {
        falhas++; seguidas++
        if (falhas <= 3) console.log(`  [${id}] falhou: ${r.erro}`)
        return
      }
      seguidas = 0
      await guardarPerfil(db, empresaId, id, marca, r.perfil, modelo, r.ms)
      feitos++
    }))

    const n = Math.min(i + LADO_A_LADO, fila.length)
    if (n % 30 === 0 || n === fila.length) {
      const min = (Date.now() - t0) / 60000
      const resto = feitos ? ((fila.length - n) / (feitos / min)) : 0
      console.log(`  ${n}/${fila.length} · ${feitos} escritas, ${pulados} ja estavam, ${falhas} falhas`
        + (resto > 0.5 ? ` · faltam ~${Math.round(resto)} min` : ''))
    }
  }

  console.log(`\n${feitos} fichas escritas, ${pulados} ja estavam atuais, ${falhas} falhas`)
  console.log(`em ${((Date.now() - t0) / 60000).toFixed(1)} min\n`)
}
