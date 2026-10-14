import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * RETENÇÃO DE ÁUDIO — o som sai, o texto fica.
 *
 * ══ POR QUE EXISTE ═════════════════════════════════════════════════════════
 *
 * Decisão do Lucas em 13/10/2026: *"prefiro ter o audio transcrito que pode
 * ser analisado futuramente do que um audio que ninguem vai ouvir ocupando
 * metade do espaco disponivel"*.
 *
 * O bucket `chat-midia` chegou a **940,9 MB de 1.024** em 14/10/2026, com 83
 * MB livres e crescendo ~18 MB/dia. Áudio era 475,5 MB disso — e 13.044 dos
 * 13.046 já estavam transcritos. A primeira passada, com janela de 7 dias,
 * tirou 11.078 arquivos e **412,9 MB**, deixando o bucket em 528 MB.
 *
 * Isto aqui existe para que aquilo não precise acontecer de novo em pânico:
 * roda todo dia, tira o que completou a janela, e o bucket fica estável.
 *
 * ══ AS TRÊS REGRAS QUE TORNAM ISSO SEGURO ══════════════════════════════════
 *
 * 1. **Só sai o que tem transcrição.** `transcricao IS NULL` significa "ainda
 *    não ouvi" — apagar perderia o conteúdo para sempre. String vazia é outra
 *    coisa: o Whisper ouviu e não havia fala. Na primeira passada foram 9
 *    arquivos assim, e o texto deles seria vazio de qualquer jeito.
 *
 * 2. **A URL é limpa ANTES do arquivo sair.** Morrendo no meio, o pior caso é
 *    um arquivo órfão — que uma varredura recolhe depois. Na ordem inversa, o
 *    pior caso é a tela apontando para um arquivo que não existe, ou seja, um
 *    player quebrado na frente do vendedor. Estado visível correto vale mais
 *    que bytes arrumados.
 *
 * 3. **Pela API do Storage, nunca por SQL.** Apagar a linha de
 *    `storage.objects` some com o registro e deixa o binário no S3: o espaço
 *    continua ocupado e ninguém mais sabe que ele existe.
 *
 * E nada sai sem registro: `zapintel_audio_retido` guarda id da mensagem,
 * arquivo, URL antiga e a janela usada. Se o backup falhar, a função para
 * antes de tocar em qualquer coisa.
 *
 * ══ A TELA JÁ ESTAVA PRONTA ════════════════════════════════════════════════
 *
 * `TranscricaoAudio`, em `components/modules/leads/lead-modal.tsx`, recebe
 * `audioGuardado={!!m.midiaUrl}`. Sem a URL ela mostra "♪ TRANSCRIÇÃO
 * AUTOMÁTICA · áudio não guardado" e o texto continua embaixo.
 */

const BUCKET = 'chat-midia'

/**
 * Quantos dias o arquivo fica ouvível.
 *
 * Sete porque 98,5% das conversas que voltam, voltam em até 7 dias — a mesma
 * medida que justificou a janela em `lead-modal.tsx`. Passado isso, quem
 * precisar lê a transcrição.
 */
export const DIAS_PADRAO = 7

/**
 * Teto por execução, no caminho do cron.
 *
 * O dia a dia entrega ~50 áudios; o teto existe para o caso de a rotina ficar
 * parada uma semana e acordar com milhares pendentes. Função da Vercel tem
 * tempo limitado, e meio trabalho feito com registro certo é melhor que uma
 * função morta no meio sem saber o que saiu. O que sobrar sai amanhã.
 */
const TETO_POR_RODADA = 2_000

export interface Retirada {
  mensagemId: number
  arquivo: string
  urlAntiga: string
}

export interface ResultadoRetencao {
  candidatos: number
  urlsLimpas: number
  arquivosApagados: number
  falhas: number
}

/**
 * Os áudios que já passaram da janela — com transcrição, e ainda com arquivo.
 *
 * ⚠ O laço repergunta em vez de confiar num `limit` grande: o PostgREST corta
 * em 1000 linhas EM SILÊNCIO. Foi o que fez o backfill de transcrição
 * "terminar" com 998 de 12.477 anunciando sucesso, e já tinha mordido a
 * análise do ZapIntel e a tela de Leads antes disso.
 */
export async function aptosParaRetirada(
  db: SupabaseClient,
  dias: number,
  teto = Number.MAX_SAFE_INTEGER,
): Promise<Retirada[]> {
  const corte = new Date(Date.now() - dias * 86_400_000).toISOString()
  const fora: Retirada[] = []

  for (let de = 0; fora.length < teto; de += 1000) {
    const { data, error } = await db
      .from('lead_mensagens')
      .select('id, midia_url')
      .eq('tipo', 'audio')
      .not('transcricao', 'is', null)
      .not('midia_url', 'is', null)
      .lt('created_at', corte)
      .order('id', { ascending: true })
      .range(de, de + 999)
    if (error) throw new Error(error.message)

    const linhas = (data ?? []) as { id: number; midia_url: string }[]
    for (const l of linhas) {
      const nome = l.midia_url.split(`/${BUCKET}/`)[1]
      if (nome) {
        fora.push({ mensagemId: l.id, arquivo: decodeURIComponent(nome), urlAntiga: l.midia_url })
      }
      if (fora.length >= teto) break
    }
    if (linhas.length < 1000) break
  }
  return fora
}

/** Faz a retirada. Ver as três regras no cabeçalho — a ordem importa. */
export async function retirarAudio(
  db: SupabaseClient,
  alvos: Retirada[],
  dias: number,
): Promise<ResultadoRetencao> {
  const r: ResultadoRetencao = {
    candidatos: alvos.length, urlsLimpas: 0, arquivosApagados: 0, falhas: 0,
  }
  if (!alvos.length) return r

  // 1. O registro primeiro. Sem ele, não se toca em nada.
  const { error: errBackup } = await db.from('zapintel_audio_retido').insert(
    alvos.map((a) => ({
      mensagem_id: a.mensagemId, arquivo: a.arquivo,
      url_antiga: a.urlAntiga, dias_janela: dias,
    })) as never,
  )
  if (errBackup) throw new Error(`backup falhou, nada foi apagado: ${errBackup.message}`)

  // 2. A URL sai antes do arquivo. Ver a regra 2.
  for (let i = 0; i < alvos.length; i += 200) {
    const ids = alvos.slice(i, i + 200).map((a) => a.mensagemId)
    const { error } = await db.from('lead_mensagens')
      .update({ midia_url: null } as never).in('id', ids)
    if (error) { r.falhas += ids.length; continue }
    r.urlsLimpas += ids.length
  }

  // 3. Os arquivos, pela API do Storage.
  for (let i = 0; i < alvos.length; i += 100) {
    const nomes = alvos.slice(i, i + 100).map((a) => a.arquivo)
    const { error } = await db.storage.from(BUCKET).remove(nomes)
    if (error) { r.falhas += nomes.length; continue }
    r.arquivosApagados += nomes.length
  }

  return r
}

/** O que o cron chama: busca e retira, com teto por rodada. */
export async function rodarRetencao(
  db: SupabaseClient,
  dias = DIAS_PADRAO,
): Promise<ResultadoRetencao> {
  const alvos = await aptosParaRetirada(db, dias, TETO_POR_RODADA)
  return retirarAudio(db, alvos, dias)
}
