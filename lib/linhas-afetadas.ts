/**
 * UPDATE QUE NÃO GRAVOU NADA É ERRO, NÃO "OK" (04/11/2026).
 *
 * Com RLS, um UPDATE que a política não deixa passar não dá erro: afeta 0 linhas
 * e o PostgREST responde 200. O card do lead e o /api/leads/mover diziam "ok" e a
 * justificativa da perda sumia (contato de uma loja, negócio na outra). Toda
 * gravação que a tela confirma ao usuário pede as linhas de volta (`.select('id')`)
 * e passa por aqui.
 */
export function nadaGravado(linhas: readonly unknown[] | null | undefined): boolean {
  return !linhas || linhas.length === 0
}

export const SEM_PERMISSAO_CONTATO =
  'Não foi possível gravar no contato: você não tem permissão para editá-lo nesta loja.'
export const SEM_PERMISSAO_NEGOCIO =
  'Não foi possível gravar no lead: você não tem permissão para editá-lo nesta loja.'
