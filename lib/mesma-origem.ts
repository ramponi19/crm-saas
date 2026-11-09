/**
 * O pedido veio de uma pagina deste mesmo site? (Origin, ou Sec-Fetch-Site.)
 *
 * Para rotas que MUDAM estado por POST com o cookie de sessao (impersonacao,
 * previa do superadmin). O SameSite=Lax do cookie barra outro site, mas nao um
 * subdominio irmao do mesmo dominio; conferir a origem fecha esse caminho.
 * Sem Origin, vale o Sec-Fetch-Site; sem nenhum dos dois, recusa.
 *
 * O host de comparacao e o do pedido (`req.url`) ou o que o proxy repassou
 * (`x-forwarded-host` / `host`): atras da Vercel os dois coincidem, mas conferir
 * os cabecalhos evita recusar o proprio site se a URL interna vier diferente.
 */
export function mesmaOrigem(req: Request): boolean {
  const origem = req.headers.get('origin')
  if (origem) {
    let hostOrigem: string
    try { hostOrigem = new URL(origem).host } catch { return false }
    const hosts = new Set<string>()
    try { hosts.add(new URL(req.url).host) } catch { /* sem url valida, fica nos cabecalhos */ }
    for (const h of [req.headers.get('x-forwarded-host'), req.headers.get('host')]) {
      if (h) hosts.add(h.split(',')[0].trim())
    }
    return hosts.has(hostOrigem)
  }
  return req.headers.get('sec-fetch-site') === 'same-origin'
}
