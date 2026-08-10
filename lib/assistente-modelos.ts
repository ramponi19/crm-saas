/**
 * Descoberta dos modelos que a CHAVE realmente pode usar.
 *
 * O modelo vivia como texto fixo no código e na config. Quando o Google aposenta
 * um (foi o caso do gemini-2.0-flash, que passou a responder `limit: 0`), o
 * assistente morre e alguém precisa descobrir na mão qual é o substituto — com o
 * lojista vendo erro na tela nesse meio-tempo.
 *
 * Aqui o CRM pergunta ao provedor. `ListModels` devolve o que aquela chave tem
 * direito de chamar, então a lista já vem correta para a conta do lojista.
 */

export interface ModeloDisponivel {
  /** Nome curto, como vai na URL: "gemini-2.5-flash". */
  nome: string
  rotulo: string
  /** Quanto de contexto ele aceita — mostrado ao superadmin para comparar. */
  entradaMax: number | null
}

const URL_LISTA = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * Ordena por PREFERÊNCIA, não por nome.
 *
 * Ordenar alfabeticamente colocaria "gemini-1.5" à frente de "gemini-2.5", e
 * pegar "o último da lista" adotaria qualquer preview instável que a Google
 * publicasse. A regra aqui: versão maior primeiro; entre iguais, `flash` antes
 * de `pro` (o assistente é conversa curta, e flash é a ordem de grandeza de
 * custo que faz esse recurso caber num CRM de pequeno negócio); e experimental
 * ou preview sempre por último.
 */
function pontuar(nome: string): number {
  const versao = Number(/gemini-(\d+(?:\.\d+)?)/.exec(nome)?.[1] ?? 0)
  let p = versao * 100
  if (/flash/.test(nome)) p += 20
  if (/pro/.test(nome)) p += 10
  if (/lite/.test(nome)) p += 5
  if (/(exp|preview|thinking)/.test(nome)) p -= 500
  if (/\d{2}-\d{2}$/.test(nome)) p -= 30   // fixado numa data: envelhece sozinho
  if (/latest/.test(nome)) p += 15
  return p
}

interface ModeloApi {
  name?: string
  displayName?: string
  inputTokenLimit?: number
  supportedGenerationMethods?: string[]
}

/**
 * Lista os modelos de geração de texto, do mais recomendado ao menos.
 * Erro devolve lista vazia: descoberta é conveniência, não pode derrubar nada.
 */
export async function listarModelos(apiKey: string): Promise<ModeloDisponivel[]> {
  try {
    const r = await fetch(`${URL_LISTA}?key=${apiKey}&pageSize=200`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) return []
    const j = (await r.json()) as { models?: ModeloApi[] }
    return (j.models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m) => ({
        nome: (m.name ?? '').replace(/^models\//, ''),
        rotulo: m.displayName ?? (m.name ?? '').replace(/^models\//, ''),
        entradaMax: m.inputTokenLimit ?? null,
      }))
      // Só a linha Gemini de texto: embedding e imagem não servem ao chat.
      .filter((m) => m.nome.startsWith('gemini-') && !/embedding|image|vision-only|tts|audio/.test(m.nome))
      .sort((a, b) => pontuar(b.nome) - pontuar(a.nome))
  } catch {
    return []
  }
}

/** O melhor disponível agora, ou null se a listagem falhar. */
export async function melhorModelo(apiKey: string): Promise<string | null> {
  const lista = await listarModelos(apiKey)
  return lista[0]?.nome ?? null
}
