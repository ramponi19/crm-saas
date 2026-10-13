/**
 * APAGA A MÍDIA ÓRFÃ DO BUCKET `chat-midia`.
 *
 * Órfão = objeto que NENHUMA coluna do banco referencia. Em 13/10/2026 eram
 * 903 arquivos e 107 MB, com o bucket em 1.028 MB de um teto de 1 GB.
 *
 *     node scripts/limpar-orfaos-chat-midia.mjs          (só mostra)
 *     node scripts/limpar-orfaos-chat-midia.mjs --apagar (apaga de verdade)
 *
 * ══ AS QUATRO REGRAS QUE VIERAM DA LIMPEZA DE 11/09/2026 ═══════════════════
 *
 * 1. **Corrigir a causa ANTES de limpar**, senão enche de novo. A causa desta
 *    leva era `enriquecerMidiaDoHistorico`, que baixava o arquivo e só depois
 *    procurava a mensagem — quando não achava, o arquivo ficava. Consertado no
 *    mesmo dia; **o deploy da Edge Function tem que ir primeiro**.
 *
 * 2. **Apagar pela API do Storage, nunca por SQL.** Deletar a linha de
 *    `storage.objects` deixa o binário no S3 e o espaço continua contando.
 *
 * 3. **Duas colunas apontam para o bucket**, e as duas são conferidas aqui:
 *    `lead_mensagens.midia_url` e `leads.foto_url`. Em setembro os avatares
 *    quase entraram na lista por engano porque só a primeira foi olhada.
 *
 * 4. **Avatares ficam de fora** (`<empresa>/avatares/`). São 13 arquivos de
 *    poucos KB: o ganho não paga o risco de errar de novo no mesmo lugar.
 *
 * ══ POR QUE RECONFERE NA HORA DE APAGAR ════════════════════════════════════
 *
 * A lista foi tirada antes. Entre tirar e apagar, uma mensagem nova pode ter
 * passado a usar o arquivo (o caminho vem do id da Meta, então um reenvio cai
 * no mesmo nome). Cada lote é reconferido contra o banco imediatamente antes
 * da remoção: custa uma consulta e evita apagar anexo de conversa viva.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const APAGAR = process.argv.includes('--apagar')
const BUCKET = 'chat-midia'
const LOTE = 100

const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`

/** Dos nomes dados, quais AINDA são órfãos agora? */
async function aindaOrfaos(nomes) {
  const vivos = new Set()
  for (const col of [['lead_mensagens', 'midia_url'], ['leads', 'foto_url']]) {
    const [tabela, coluna] = col
    for (const nome of nomes) {
      const { data, error } = await db.from(tabela).select('id')
        .like(coluna, `%/${BUCKET}/${nome}`).limit(1)
      if (error) throw new Error(`${tabela}.${coluna}: ${error.message}`)
      if (data?.length) vivos.add(nome)
    }
  }
  return nomes.filter((n) => !vivos.has(n))
}

/**
 * A lista sai da VIEW, não da tabela de backup.
 *
 * O schema `backup` não é exposto pela API REST — de propósito: tabela de
 * auditoria não deve ser legível por cliente nenhum. E ler a fonte viva é
 * melhor: arquivo que deixou de ser órfão desde ontem simplesmente não
 * aparece. `backup.storage_orfaos_20261013` segue como o retrato do momento
 * em que a decisão foi tomada.
 */
const { data: lista, error } = await db
  .from('v_orfaos_chat_midia').select('name, bytes')
  .not('name', 'like', '%/avatares/%')
  .order('bytes', { ascending: false })
if (error) { console.error('não consegui ler a lista:', error.message); process.exit(1) }

const total = lista.reduce((a, l) => a + Number(l.bytes), 0)
console.log(`\nórfãos agora: ${lista.length} arquivos, ${mb(total)}`)

if (!APAGAR) {
  console.log('\nmodo de conferência — nada foi apagado.')
  console.log('os 10 maiores:')
  for (const l of lista.slice(0, 10)) console.log(`  ${mb(Number(l.bytes)).padStart(9)}  ${l.name}`)
  console.log('\npara apagar de verdade: node scripts/limpar-orfaos-chat-midia.mjs --apagar\n')
  process.exit(0)
}

let apagados = 0, bytes = 0, resgatados = 0, falhas = 0

for (let i = 0; i < lista.length; i += LOTE) {
  const fatia = lista.slice(i, i + LOTE)
  const nomes = fatia.map((l) => l.name)

  const confirmados = await aindaOrfaos(nomes)
  resgatados += nomes.length - confirmados.length
  if (!confirmados.length) continue

  const { data, error: err } = await db.storage.from(BUCKET).remove(confirmados)
  if (err) { console.error(`lote ${i / LOTE + 1}: ${err.message}`); falhas += confirmados.length; continue }

  apagados += data?.length ?? 0
  bytes += fatia.filter((l) => confirmados.includes(l.name)).reduce((a, l) => a + Number(l.bytes), 0)
  console.log(`  lote ${String(i / LOTE + 1).padStart(2)}: ${data?.length ?? 0} apagados  (${mb(bytes)} acumulado)`)
}

console.log(`\napagados ...... ${apagados} arquivos, ${mb(bytes)}`)
if (resgatados) console.log(`resgatados .... ${resgatados} (passaram a ser usados depois da lista)`)
if (falhas) console.log(`falhas ........ ${falhas}`)
console.log(`\no retrato de hoje continua em backup.storage_orfaos_20261013\n`)
