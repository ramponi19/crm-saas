/**
 * `contatos.nome` aceita nulo — 6 contatos na JM em 21/10/2026, nenhum deles
 * cliente. Os tipos antigos (de antes do core v1) diziam `nome: string`, e as
 * telas confiavam nisso; com os tipos gerados do core o nulo apareceu. Quem
 * lista cliente recebe texto: "Sem nome", decidido na leitura, num lugar só.
 */
export const SEM_NOME = 'Sem nome'

export function comNome<T extends { nome: string | null }>(r: T): Omit<T, 'nome'> & { nome: string } {
  return { ...r, nome: r.nome ?? SEM_NOME }
}

/** O mesmo, para o cliente embutido numa linha (`clientes:contatos!cliente_id(nome, ...)` do PostgREST). */
export function comNomeDoCliente<T extends { clientes: { nome: string | null } | null }>(r: T) {
  return { ...r, clientes: r.clientes ? comNome(r.clientes) : null }
}

/**
 * Iniciais do avatar: a primeira letra (ou número) da primeira e da última palavra.
 *
 * Por ponto de código, nunca por `nome[0]`: o nome que começa com emoji ("🌸 Ana")
 * dava meia letra (um surrogate solto), que o servidor manda como "�" e o navegador
 * não — e /clientes quebrava a hidratação (React #418, 05/11/2026).
 */
export function iniciais(nome: string | null | undefined, padrao = 'CL'): string {
  const letras = (nome ?? '').trim().split(/\s+/)
    .map((p) => Array.from(p).filter((ch) => /[\p{L}\p{N}]/u.test(ch)))
    .filter((l) => l.length > 0)
  if (letras.length >= 2) return (letras[0][0] + letras[letras.length - 1][0]).toUpperCase()
  if (letras.length === 1) return letras[0].slice(0, 2).join('').toUpperCase()
  return padrao
}
