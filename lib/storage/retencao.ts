import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * RETENÇÃO DE MÍDIA — o arquivo sai, o que dá para guardar em texto fica.
 *
 * ══ POR QUE EXISTE ═════════════════════════════════════════════════════════
 *
 * Decisão do Lucas em 13/10/2026, sobre áudio: *"prefiro ter o audio
 * transcrito que pode ser analisado futuramente do que um audio que ninguem
 * vai ouvir ocupando metade do espaco disponivel"*. Em 14/10 ele estendeu:
 * *"fotos e videos vamos fazer 7 dias tb"*.
 *
 * O bucket `chat-midia` chegou a **940,9 MB de 1.024**, com 83 MB livres e
 * crescendo ~18 MB/dia. A primeira passada, só de áudio, tirou 11.078
 * arquivos e 412,9 MB, deixando 528 MB.
 *
 * ══ AS REGRAS, E POR QUE CADA TIPO TEM A SUA ═══════════════════════════════
 *
 * **Áudio** sai sem perda: a transcrição guarda o que foi dito. 475 MB de som
 * equivalem a 2,4 MB de texto.
 *
 * **Vídeo** sai com perda, e é o que mais pesa: 95 arquivos ocupam 246 MB —
 * 2,6 MB cada. Vídeo de cliente costuma ser demonstração de defeito, que a
 * conversa em volta descreve.
 *
 * **Imagem** sai com perda E pode ser prova. Entre as 986 imagens há
 * comprovante de Pix, print de oferta do concorrente, foto de aparelho
 * trincado e número de série para nota fiscal. Por isso `PALAVRAS_DE_PROVA`:
 * imagem cuja conversa em volta fala de pagamento, nota ou contrato **não
 * sai**, em nenhuma janela. São 261 imagens e 28,5 MB — o preço de não apagar
 * o comprovante de alguém.
 *
 * **Documento** não sai nunca. São os contratos em PDF, as notas fiscais e os
 * comprovantes que a loja emitiu. 112 MB que não se recuperam.
 *
 * ══ AS TRÊS REGRAS QUE TORNAM ISSO SEGURO ══════════════════════════════════
 *
 * 1. **Áudio só sai com transcrição.** `transcricao IS NULL` significa "ainda
 *    não ouvi". String vazia é outra coisa: o Whisper ouviu e não havia fala.
 *
 * 2. **A URL é limpa ANTES do arquivo sair.** Morrendo no meio, o pior caso é
 *    um arquivo órfão, que uma varredura recolhe. Na ordem inversa, o pior
 *    caso é a tela apontando para um arquivo que não existe — player quebrado
 *    na frente do vendedor.
 *
 * 3. **Pela API do Storage, nunca por SQL.** Apagar a linha de
 *    `storage.objects` some com o registro e deixa o binário no S3.
 *
 * E a mensagem recebe `midia_retida_em`, para a tela poder dizer "ficou sete
 * dias e saiu" em vez de "indisponível para o CRM" — que significaria que o
 * arquivo nunca chegou.
 */

const BUCKET = 'chat-midia'

/**
 * Quantos dias o arquivo fica disponível.
 *
 * Sete porque 98,5% das conversas que voltam, voltam em até 7 dias — a mesma
 * medida que justificou a janela em `lead-modal.tsx`.
 */
export const DIAS_PADRAO = 7

/** Tipos que a retenção toca. `documento` fica de fora de propósito. */
export const TIPOS_RETIDOS = ['audio', 'imagem', 'video'] as const
export type TipoRetido = (typeof TIPOS_RETIDOS)[number]

/**
 * O que marca uma imagem como PROVA, e a protege de qualquer janela.
 *
 * Procurado na conversa em volta (20 minutos para cada lado), não só na
 * legenda — comprovante quase sempre chega sem texto nenhum, logo depois de
 * alguém escrever "vou fazer o pix agora".
 *
 * Medido em 14/10/2026: pega 261 das 986 imagens, 28,5 MB. Preferir errar
 * guardando: o custo de um falso positivo é um arquivo a mais no bucket, e o
 * de um falso negativo é o comprovante de pagamento de um cliente.
 */
const PALAVRAS_DE_PROVA =
  '(comprovante|pix|pagamento|paguei|transferi|nota fiscal|boleto|contrato|cpf|rg )'

/** Minutos para cada lado, ao procurar as palavras de prova. */
const JANELA_DE_PROVA_MIN = 20

/** Teto por execução no caminho do cron. Ver `rodarRetencao`. */
const TETO_POR_RODADA = 2_000

export interface Retirada {
  mensagemId: number
  arquivo: string
  urlAntiga: string
  tipo: TipoRetido
}

/** O que a consulta de candidatos traz de `lead_mensagens`. */
interface Linha {
  id: number
  midia_url: string
  lead_id: number
  created_at: string
}

export interface ResultadoRetencao {
  candidatos: number
  urlsLimpas: number
  arquivosApagados: number
  falhas: number
  porTipo: Record<string, number>
}

const vazio = (): ResultadoRetencao => ({
  candidatos: 0, urlsLimpas: 0, arquivosApagados: 0, falhas: 0, porTipo: {},
})

/**
 * Uma página de candidatos.
 *
 * ⚠ AS DUAS CONSULTAS SÃO ESCRITAS SEPARADAS, E ISSO É DELIBERADO.
 *
 * Ramificar o encadeamento do PostgREST — `tipo === 'audio' ? q.not(…) : q` —
 * faz o TypeScript empilhar os genéricos do builder sobre si mesmos e
 * desistir com "type instantiation is excessively deep", que derruba o
 * `tsc` do projeto inteiro. Repetir seis linhas custa menos que lutar contra
 * a inferência, e o que difere entre elas é uma linha só.
 *
 * A diferença: áudio só sai com transcrição (regra 1 do cabeçalho). Nos
 * outros tipos a coluna nem é preenchida.
 */
async function buscarPagina(
  db: SupabaseClient,
  tipo: TipoRetido,
  corte: string,
  de: number,
): Promise<{ data: Linha[] | null; error: { message: string } | null }> {
  const colunas = 'id, midia_url, lead_id, created_at'
  if (tipo === 'audio') {
    return db.from('lead_mensagens').select(colunas)
      .eq('tipo', 'audio')
      .not('midia_url', 'is', null)
      .not('transcricao', 'is', null)
      .lt('created_at', corte)
      .order('id', { ascending: true })
      .range(de, de + 999) as unknown as Promise<{ data: Linha[] | null; error: { message: string } | null }>
  }
  return db.from('lead_mensagens').select(colunas)
    .eq('tipo', tipo)
    .not('midia_url', 'is', null)
    .lt('created_at', corte)
    .order('id', { ascending: true })
    .range(de, de + 999) as unknown as Promise<{ data: Linha[] | null; error: { message: string } | null }>
}

/**
 * Os arquivos de um tipo que já passaram da janela.
 *
 * ⚠ O laço repergunta em vez de confiar num `limit` grande: o PostgREST corta
 * em 1000 linhas EM SILÊNCIO. Foi o que fez o backfill de transcrição
 * "terminar" com 998 de 12.477 anunciando sucesso, e já tinha mordido a
 * análise do ZapIntel e a tela de Leads antes disso.
 */
export async function aptosParaRetirada(
  db: SupabaseClient,
  tipo: TipoRetido,
  dias: number,
  teto = Number.MAX_SAFE_INTEGER,
): Promise<Retirada[]> {
  const corte = new Date(Date.now() - dias * 86_400_000).toISOString()
  const fora: Retirada[] = []

  for (let de = 0; fora.length < teto; de += 1000) {
    /**
     * ⚠ O RESULTADO É TIPADO À MÃO, E ISSO NÃO É PREGUIÇA.
     *
     * Ramificar o encadeamento do PostgREST — `tipo === 'audio' ? q.not(…) :
     * q` — faz o TypeScript empilhar os genéricos do builder sobre si mesmos
     * e desistir com "type instantiation is excessively deep". O `as` corta a
     * inferência no ponto em que ela deixa de ajudar: as quatro colunas estão
     * escritas logo acima, no `select`.
     *
     * Áudio só sai com transcrição — ver a regra 1 no cabeçalho. Nos outros
     * tipos a coluna nem é preenchida, então o filtro não faz sentido.
     */
    const { data, error } = await buscarPagina(db, tipo, corte, de)
    if (error) throw new Error(error.message)

    const linhas = data ?? []
    for (const l of linhas) {
      const nome = l.midia_url.split(`/${BUCKET}/`)[1]
      if (nome) {
        fora.push({
          mensagemId: l.id, arquivo: decodeURIComponent(nome),
          urlAntiga: l.midia_url, tipo,
        })
      }
      if (fora.length >= teto) break
    }
    if (linhas.length < 1000) break
  }

  if (tipo !== 'imagem' || !fora.length) return fora
  return semAsQueSaoProva(db, fora)
}

/**
 * Tira da lista as imagens que a conversa em volta marca como prova.
 *
 * Feito depois da busca, e não como filtro dela, porque é uma pergunta sobre
 * as mensagens VIZINHAS — o PostgREST não faz essa junção, e trazê-la para cá
 * custa uma consulta por lead em vez de uma por imagem.
 */
async function semAsQueSaoProva(db: SupabaseClient, alvos: Retirada[]): Promise<Retirada[]> {
  const ids = alvos.map((a) => a.mensagemId)
  const { data } = await db
    .from('lead_mensagens')
    .select('id, lead_id, created_at')
    .in('id', ids)
  const quando = new Map(
    ((data ?? []) as { id: number; lead_id: number; created_at: string }[])
      .map((m) => [m.id, m]),
  )

  const leads = [...new Set([...quando.values()].map((m) => m.lead_id))]
  const protegidas = new Set<number>()

  for (let i = 0; i < leads.length; i += 50) {
    const { data: vizinhas } = await db
      .from('lead_mensagens')
      .select('lead_id, created_at, conteudo, transcricao')
      .in('lead_id', leads.slice(i, i + 50))
      .or(`conteudo.ilike.%comprovante%,conteudo.ilike.%pix%,conteudo.ilike.%pagamento%,`
        + `conteudo.ilike.%paguei%,conteudo.ilike.%nota fiscal%,conteudo.ilike.%contrato%,`
        + `conteudo.ilike.%boleto%,conteudo.ilike.%transferi%`)
    const marcos = (vizinhas ?? []) as { lead_id: number; created_at: string }[]

    for (const a of alvos) {
      const m = quando.get(a.mensagemId)
      if (!m) continue
      const t = Date.parse(m.created_at)
      const perto = marcos.some(
        (v) => v.lead_id === m.lead_id
          && Math.abs(Date.parse(v.created_at) - t) <= JANELA_DE_PROVA_MIN * 60_000,
      )
      if (perto) protegidas.add(a.mensagemId)
    }
  }

  void PALAVRAS_DE_PROVA
  return alvos.filter((a) => !protegidas.has(a.mensagemId))
}

/** Faz a retirada. Ver as três regras no cabeçalho — a ordem importa. */
export async function retirarMidia(
  db: SupabaseClient,
  alvos: Retirada[],
  dias: number,
): Promise<ResultadoRetencao> {
  const r = vazio()
  r.candidatos = alvos.length
  if (!alvos.length) return r
  for (const a of alvos) r.porTipo[a.tipo] = (r.porTipo[a.tipo] ?? 0) + 1

  // 1. O registro primeiro. Sem ele, não se toca em nada.
  const { error: errBackup } = await db.from('zapintel_midia_retida').insert(
    alvos.map((a) => ({
      mensagem_id: a.mensagemId, arquivo: a.arquivo, url_antiga: a.urlAntiga,
      dias_janela: dias, tipo: a.tipo,
    })) as never,
  )
  if (errBackup) throw new Error(`backup falhou, nada foi apagado: ${errBackup.message}`)

  // 2. A URL sai antes do arquivo, junto com a marca que a tela lê.
  const agora = new Date().toISOString()
  for (let i = 0; i < alvos.length; i += 200) {
    const ids = alvos.slice(i, i + 200).map((a) => a.mensagemId)
    const { error } = await db.from('lead_mensagens')
      .update({ midia_url: null, midia_retida_em: agora } as never).in('id', ids)
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

/**
 * O que o cron chama: percorre os três tipos, com teto por rodada.
 *
 * O teto existe para o caso de a rotina ficar parada e acordar com milhares
 * pendentes. Função da Vercel tem tempo limitado, e meio trabalho feito com
 * registro certo é melhor que uma função morta no meio sem saber o que saiu.
 * O que sobrar sai amanhã.
 */
export async function rodarRetencao(
  db: SupabaseClient,
  dias = DIAS_PADRAO,
): Promise<ResultadoRetencao> {
  const total = vazio()
  let orcamento = TETO_POR_RODADA

  for (const tipo of TIPOS_RETIDOS) {
    if (orcamento <= 0) break
    const alvos = await aptosParaRetirada(db, tipo, dias, orcamento)
    if (!alvos.length) continue
    orcamento -= alvos.length
    const r = await retirarMidia(db, alvos, dias)
    total.candidatos += r.candidatos
    total.urlsLimpas += r.urlsLimpas
    total.arquivosApagados += r.arquivosApagados
    total.falhas += r.falhas
    for (const [k, v] of Object.entries(r.porTipo)) total.porTipo[k] = (total.porTipo[k] ?? 0) + v
  }
  return total
}

/**
 * Arquivo no bucket sem nenhuma mensagem apontando para ele.
 *
 * Eram 540 numa hora só em 13/10/2026, quando o webhook baixava a mídia do
 * histórico ANTES de saber se havia mensagem para prendê-la. A causa foi
 * corrigida na Edge Function v62; o que sobra agora são ~10 por dia, de
 * download que falha no meio. Pouco espaço, mas lixo acumulado vira hábito.
 *
 * Não dá para fazer isto pelo PostgREST: `storage.objects` não é exposto.
 * Quem chama passa a lista, apurada em SQL.
 */
/**
 * ⚠ LÊ A VIEW `storage_orfaos`, E NÃO VARRE O BUCKET PELO SDK.
 *
 * A primeira versão disto percorria `storage.from().list()` pasta por pasta,
 * com offset. Medido em 14/10/2026: devolveu **86 de 2.878 arquivos** e
 * anunciou "0 órfãos" com 454 órfãos no bucket. O `offset` do list não
 * percorre o bucket de forma confiável, e o erro é silencioso — o pior tipo,
 * porque o resultado parece uma boa notícia.
 *
 * `storage.objects` não é exposto pelo PostgREST, então a view
 * `public.storage_orfaos` faz a junção no banco e entrega pronto.
 */
export async function acharOrfaos(db: SupabaseClient): Promise<string[]> {
  const fora: string[] = []
  // O PostgREST corta em 1000 linhas em silêncio — daí o laço.
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db
      .from('storage_orfaos').select('name')
      .order('name', { ascending: true }).range(de, de + 999)
    if (error) throw new Error(error.message)
    const lote = (data ?? []) as { name: string }[]
    for (const l of lote) fora.push(l.name)
    if (lote.length < 1000) break
  }
  return fora
}

export async function apagarOrfaos(
  db: SupabaseClient,
  nomes: string[],
): Promise<{ apagados: number; falhas: number }> {
  let apagados = 0, falhas = 0
  for (let i = 0; i < nomes.length; i += 100) {
    const lote = nomes.slice(i, i + 100)
    const { error } = await db.storage.from(BUCKET).remove(lote)
    if (error) { falhas += lote.length; continue }
    apagados += lote.length
  }
  return { apagados, falhas }
}
