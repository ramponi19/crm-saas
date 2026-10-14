/**
 * GRAVA FICHAS ESCRITAS À MÃO, em lote, a partir de um arquivo JSON.
 *
 *     npx tsx scripts/perfil-manual.mts caminho/para/lote.json
 *     npx tsx scripts/perfil-manual.mts --falta 1        (quem ainda não tem)
 *     npx tsx scripts/perfil-manual.mts --conversas 1 --ids 1265,2961  (ler)
 *
 * ══ POR QUE ISTO EXISTE ════════════════════════════════════════════════════
 *
 * Em 13/10/2026 o Lucas pediu a ficha de todos os leads antes de haver chave
 * de IA no projeto: *"nao me importa quanto tempo leva, eu quero a sua
 * analise em todos e a ia assuma as atualizacoes quando a api ligar"*.
 *
 * Então as fichas são escritas aqui fora, lidas conversa por conversa, e
 * gravadas na MESMA tabela que a IA vai usar. A tela não distingue as duas —
 * nem precisa: o que ela mostra é a ficha, e o campo `modelo` registra quem a
 * escreveu, para que a diferença seja consultável depois.
 *
 * ⚠ GRAVA COM A VERSÃO ATUAL (`VERSAO_DO_PERFIL`), DE PROPÓSITO.
 *
 * Assim, quando a chave entrar, a IA **não** reescreve tudo: ela só refaz o
 * lead cuja conversa andou. Era exatamente o pedido — "a IA assume as
 * atualizações". Gravar com versão falsa faria a primeira rodada da IA
 * descartar todo este trabalho e cobrar por isso.
 *
 * ══ O FORMATO DO LOTE ══════════════════════════════════════════════════════
 *
 *     [ { "leadId": 1265, "perfil": { ...PerfilIA... } }, ... ]
 *
 * O `perfil` passa pela MESMA validação que a resposta da IA passa, então um
 * campo torto aqui falha do mesmo jeito que falharia lá — e não chega na tela.
 */

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { carregarConversas } from '../lib/zapintel/conversas'
import { guardarPerfil, lerPerfil, marcaDaConversa, type PerfilIA } from '../lib/zapintel/perfil'
import type { Lead, RawMessage } from '../types/zapintel'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

/** Quem escreveu. Fica no banco para a diferença ser consultável depois. */
const AUTOR = 'claude-opus-5 (analise manual)'

const arg = (nome: string): string | null => {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

/**
 * A FILA — quem ainda não tem ficha, na ordem em que vale escrever.
 *
 * Primeiro os leads em que o CLIENTE falou por último e a loja não voltou:
 * são os 236 que viram plano de ação amanhã de manhã. Depois o resto, por
 * tamanho de conversa — conversa grande tem mais o que relatar.
 */
async function falta(empresaId: number): Promise<void> {
  const { analisados, porId } = await carregarConversas(db, empresaId)
  const { data: jaTem } = await db
    .from('zapintel_lead_perfil').select('lead_id').eq('empresa_id', empresaId)
  const prontos = new Set((jaTem ?? []).map((r) => r.lead_id as number))

  const linhas: { id: number; nome: string; msgs: number; devem: boolean; dias: number }[] = []
  for (const a of analisados) {
    const id = Number(String(a.id).replace('lead-', ''))
    const banco = porId.get(id)
    if (!banco || prontos.has(id)) continue
    if (a.messages.length < 2 || !a.messages.some((m: RawMessage) => !m.isStore)) continue
    const ult = a.messages[a.messages.length - 1]
    linhas.push({
      id, nome: banco.nome ?? '(sem nome)', msgs: a.messages.length,
      devem: !ult.isStore, dias: a.daysInactive,
    })
  }
  linhas.sort((x, y) => (Number(y.devem) - Number(x.devem)) || (y.msgs - x.msgs))

  const devem = linhas.filter((l) => l.devem).length
  console.log(`\nfaltam ${linhas.length} fichas · ${devem} com a loja devendo resposta\n`)
  for (const l of linhas.slice(0, Number(arg('--mostrar') ?? 40))) {
    console.log(`${String(l.id).padStart(5)}  ${l.nome.slice(0, 32).padEnd(34)}`
      + `${String(l.msgs).padStart(4)} msgs  ${l.devem ? 'LOJA DEVE' : '         '}  ${l.dias}d`)
  }
  console.log()
}

/**
 * AS CONVERSAS DE UM LOTE, em texto, para serem lidas e viradas em ficha.
 *
 * Conversa muito longa vem cortada no meio, com o buraco anunciado: o começo
 * diz o que a pessoa queria, o fim diz o que fazer agora, e as 300 mensagens
 * do meio são variações das duas pontas.
 */
async function conversas(empresaId: number, ids: number[]): Promise<void> {
  const { analisados, porId } = await carregarConversas(db, empresaId, ids)
  const { data: ponteRaw } = await db
    .from('zapintel_venda_lead').select('lead_id').eq('empresa_id', empresaId).in('lead_id', ids)
  const comprou = new Set((ponteRaw ?? []).map((p) => p.lead_id as number))

  for (const a of analisados as Lead[]) {
    const id = Number(String(a.id).replace('lead-', ''))
    const b = porId.get(id)!
    console.log(`\n${'='.repeat(78)}`)
    console.log(`LEAD ${id} · ${a.contact} · filial ${b.filial_id} · ${b.origem}`)
    console.log(`kanban ${b.kanban_status} · ${a.messages.length} msgs · inativo ${a.daysInactive}d`
      + ` · venda registrada: ${comprou.has(id) ? 'SIM' : 'nao'}`)
    console.log('='.repeat(78))

    const ms = a.messages
    const linha = (m: RawMessage) =>
      `[${m.date} ${m.time}] ${m.isStore ? 'LOJA' : 'CLIENTE'}${m.transcrito ? ' (audio)' : ''}: `
      + ((m.body || '').trim().replace(/\s+/g, ' ').slice(0, 400) || `[${m.mediaType || 'anexo'}]`)

    if (ms.length <= 70) ms.forEach((m) => console.log(linha(m)))
    else {
      ms.slice(0, 15).forEach((m) => console.log(linha(m)))
      console.log(`\n[... ${ms.length - 70} mensagens do meio omitidas ...]\n`)
      ms.slice(-55).forEach((m) => console.log(linha(m)))
    }

    /**
     * ⚠ A MARCA DE FIM — e por que ela existe.
     *
     * Em 14/10/2026, 4 das 20 primeiras fichas foram escritas sobre conversa
     * CORTADA. Quem lê esta saída (eu) a passava por `head -N` para caber, e a
     * última conversa de cada lote saía pela metade sem nada que denunciasse.
     * Na da Alessandra (lead 3996), a ficha dizia "pagamento travado no 18x,
     * crítico" — e a conversa real continuava: ela pagou, recebeu, e mandou
     * três mensagens de pós-venda sem resposta.
     *
     * Esta linha é a prova de que a conversa chegou inteira. Sem ela visível,
     * a leitura foi truncada e a ficha NÃO pode ser escrita.
     */
    const ult = ms[ms.length - 1]
    console.log(`── FIM DO LEAD ${id} · ${ms.length} mensagens · ultima ${ult?.date ?? '?'} ${ult?.time ?? ''} ──`)
  }
  console.log()
}

/** Grava um lote de fichas escritas à mão. */
async function gravar(caminho: string): Promise<void> {
  const lote = JSON.parse(fs.readFileSync(caminho, 'utf8')) as { leadId: number; perfil: PerfilIA }[]
  const ids = lote.map((x) => x.leadId)

  const { data: dono } = await db.from('leads').select('id, empresa_id').in('id', ids)
  const empresaDe = new Map((dono ?? []).map((d) => [d.id as number, d.empresa_id as number]))
  const empresaId = empresaDe.get(ids[0])
  if (!empresaId) { console.error('lead nao encontrado'); process.exit(1) }

  const { analisados } = await carregarConversas(db, empresaId, ids)
  const porLead = new Map(analisados.map((a) => [Number(String(a.id).replace('lead-', '')), a]))

  let ok = 0
  for (const { leadId, perfil } of lote) {
    const a = porLead.get(leadId)
    if (!a) { console.log(`  [${leadId}] conversa nao encontrada`); continue }
    const marca = marcaDaConversa(a)
    await guardarPerfil(db, empresaId, leadId, marca, perfil, AUTOR, 0)
    const conf = await lerPerfil(db, empresaId, leadId, marca)
    // Confere que voltou e que vale: `guardarPerfil` nao derruba a resposta em
    // caso de erro (de proposito), entao sem esta leitura um lote inteiro
    // podia "terminar" sem ter gravado nada.
    if (conf?.atual) { ok++; console.log(`  [${leadId}] ${a.contact} — ok`) }
    else console.log(`  [${leadId}] NAO GRAVOU`)
  }
  console.log(`\n${ok} de ${lote.length} fichas gravadas.\n`)
}

const alvo = arg('--falta') ?? arg('--conversas')
if (arg('--falta')) await falta(Number(alvo))
else if (arg('--conversas')) {
  await conversas(Number(alvo), (arg('--ids') ?? '').split(',').map(Number).filter(Boolean))
} else if (process.argv[2]) await gravar(process.argv[2])
else {
  console.error('uso: npx tsx scripts/perfil-manual.mts <lote.json>')
  console.error('     npx tsx scripts/perfil-manual.mts --falta <empresaId> [--mostrar N]')
  console.error('     npx tsx scripts/perfil-manual.mts --conversas <empresaId> --ids 1,2,3')
  process.exit(1)
}
