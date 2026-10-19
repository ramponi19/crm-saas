import { createHash, timingSafeEqual } from 'crypto'

/**
 * Token das rotas que sistemas de fora chamam (portais do Grupo OLX, site da
 * imobiliária, Contact2Sale).
 *
 * O jeito certo é `Authorization: Bearer <token>`. O token por query string
 * (`?token=`) — o que essas integrações usam hoje — continua aceito por 30 dias,
 * com aviso no log a cada uso, para dar tempo de trocar a configuração de cada
 * parceiro. Passado o prazo o aviso vira erro no log; retirar de vez a query é
 * uma mudança de código deliberada, depois de conferir no log que ninguém mais
 * usa, e não um corte automático que pararia a entrada de leads sem aviso.
 */
export const QUERY_ACEITA_ATE = '2026-11-19'

export function tokenDaRequisicao(req: Request, rota: string): string | null {
  const auth = req.headers.get('authorization') ?? ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (m) return m[1].trim() || null

  const daQuery = new URL(req.url).searchParams.get('token')
  if (daQuery) {
    const vencido = new Date() > new Date(`${QUERY_ACEITA_ATE}T23:59:59-03:00`)
    const msg = `[token-na-url] ${rota}: token recebido por query string (aceito até ${QUERY_ACEITA_ATE}); use Authorization: Bearer`
    if (vencido) console.error(msg + ' — PRAZO VENCIDO')
    else console.warn(msg)
  }
  return daQuery || null
}

/** Comparação em tempo constante (o hash iguala o tamanho antes do timingSafeEqual). */
export function tokenConfere(recebido: string | null | undefined, esperado: string | null | undefined): boolean {
  if (!recebido || !esperado) return false
  const a = createHash('sha256').update(recebido).digest()
  const b = createHash('sha256').update(esperado).digest()
  return timingSafeEqual(a, b)
}
