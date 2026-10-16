/**
 * O pedido veio de uma pagina deste mesmo site? (Origin, ou Sec-Fetch-Site.)
 *
 * Para rotas que MUDAM estado por POST com o cookie de sessao (impersonacao,
 * previa do superadmin). O SameSite=Lax do cookie barra outro site, mas nao um
 * subdominio irmao do mesmo dominio; conferir a origem fecha esse caminho.
 * Sem Origin, vale o Sec-Fetch-Site; sem nenhum dos dois, recusa.
 */
export function mesmaOrigem(req: Request): boolean {
  const origem = req.headers.get('origin')
  if (origem) {
    try { return new URL(origem).host === new URL(req.url).host } catch { return false }
  }
  return req.headers.get('sec-fetch-site') === 'same-origin'
}
