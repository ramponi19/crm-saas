/**
 * A FICHA DE IA DE UM LEAD — montada aqui fora, para ser julgada antes de ir
 * para a tela.
 *
 *     npx tsx scripts/perfil-zapintel.mts 439          (só o prompt)
 *     npx tsx scripts/perfil-zapintel.mts 439 --ia     (chama o modelo)
 *     npx tsx scripts/perfil-zapintel.mts 439 --ia --salvar
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
  contextoDoPerfil, gerarPerfil, guardarPerfil, marcaDaConversa,
} from '../lib/zapintel/perfil'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
// `perguntarIA` e o client de serviço leem de `process.env` — num script não
// há Next para carregar o `.env.local`, então ele entra aqui.
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v as string

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const LEAD = Number(process.argv[2])
const COM_IA = process.argv.includes('--ia')
const SALVAR = process.argv.includes('--salvar')
if (!Number.isInteger(LEAD) || LEAD <= 0) {
  console.error('uso: npx tsx scripts/perfil-zapintel.mts <leadId> [--ia] [--salvar]')
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
