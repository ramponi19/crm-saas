import { createHash, timingSafeEqual } from 'crypto'

/**
 * Token das rotas que sistemas de fora chamam (portais do Grupo OLX, site da
 * imobiliária).
 *
 * SÓ `Authorization: Bearer <token>` (22/10/2026). O token na query string
 * (`?token=`) foi aceito com aviso no log desde 20/10, com prazo até 19/11; saiu
 * antes do prazo, por decisão do Lucas: token na URL vai parar em log de servidor,
 * em histórico de navegador e no Sentry. Nenhuma empresa usa portal hoje (o módulo
 * Imóveis está em preparação), então ninguém fica sem receber lead.
 */
export function tokenDaRequisicao(req: Request): string | null {
  const auth = req.headers.get('authorization') ?? ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() || null : null
}

/** Comparação em tempo constante (o hash iguala o tamanho antes do timingSafeEqual). */
export function tokenConfere(recebido: string | null | undefined, esperado: string | null | undefined): boolean {
  if (!recebido || !esperado) return false
  const a = createHash('sha256').update(recebido).digest()
  const b = createHash('sha256').update(esperado).digest()
  return timingSafeEqual(a, b)
}
