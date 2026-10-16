/**
 * Cache de 60 s da contagem do robô (`/zapintel/api/perfil/pendentes`), por
 * empresa + lojas visíveis — ver o cabeçalho da rota. Fica fora do arquivo da
 * rota porque o Next só aceita nele os exports de rota (GET, dynamic…).
 *
 * Memória da instância da função: some num cold start e não é compartilhado
 * entre instâncias. Para o que serve — não reconsultar a cada abertura do
 * chat — é o bastante.
 */
export const CACHE_PENDENTES_MS = 60_000

const guardado = new Map<string, { em: number; resposta: unknown }>()

export function lerCachePendentes<T>(chave: string, agora = Date.now()): { resposta: T; idadeMs: number } | null {
  const g = guardado.get(chave)
  if (!g || agora - g.em >= CACHE_PENDENTES_MS) return null
  return { resposta: g.resposta as T, idadeMs: agora - g.em }
}

export function gravarCachePendentes(chave: string, resposta: unknown, agora = Date.now()) {
  guardado.set(chave, { em: agora, resposta })
}

/** Para os testes: cada caso começa sem o que o anterior guardou. */
export function limparCachePendentes() { guardado.clear() }
