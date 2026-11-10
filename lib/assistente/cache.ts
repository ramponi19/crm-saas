/**
 * O QUE O ASSISTENTE LEU HÁ MENOS DE 60 s, POR EMPRESA (10/11/2026).
 *
 * Em 10/11, das 10h42 às 10h44, o Eduardo fez 5 perguntas em 2 minutos e cada
 * uma releu do zero o status de todas as conversas, as fichas e a equipe. Com
 * isto, a segunda pergunta em diante (na mesma instância da Vercel) não vai ao
 * banco para o que já leu — e duas leituras iguais ao mesmo tempo viram uma
 * (a promessa fica guardada desde o pedido, não só depois da resposta).
 *
 * Só para o que é da EMPRESA e vem do service role (status + fichas, equipe).
 * O que depende de quem pergunta (leads visíveis, lojas, RLS) nunca entra aqui.
 * O preço: o que mudou nos últimos 60 s pode não aparecer na resposta.
 */
export const VALIDADE_MS = 60_000
const TETO = 200

const guardados = new Map<string, { ate: number; valor: Promise<unknown> }>()

export function lembrar<T>(chave: string, ler: () => Promise<T>, agora: number = Date.now(), validade: number = VALIDADE_MS): Promise<T> {
  const g = guardados.get(chave)
  if (g && g.ate > agora) return g.valor as Promise<T>
  if (guardados.size >= TETO) {
    for (const [k, v] of guardados) if (v.ate <= agora) guardados.delete(k)
    if (guardados.size >= TETO) guardados.delete(guardados.keys().next().value as string)
  }
  const valor = ler()
  guardados.set(chave, { ate: agora + validade, valor })
  // Erro não fica guardado: a próxima pergunta tenta de novo.
  valor.catch(() => { if (guardados.get(chave)?.valor === valor) guardados.delete(chave) })
  return valor
}

/** Para os testes. */
export function esquecerTudo(): void {
  guardados.clear()
}
