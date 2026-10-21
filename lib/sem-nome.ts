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

/** O mesmo, para o cliente embutido numa linha (`clientes(nome, ...)` do PostgREST). */
export function comNomeDoCliente<T extends { clientes: { nome: string | null } | null }>(r: T) {
  return { ...r, clientes: r.clientes ? comNome(r.clientes) : null }
}
