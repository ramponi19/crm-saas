import { createHmac } from 'crypto'
import * as Sentry from '@sentry/nextjs'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Limite de chamadas para as rotas ABERTAS (sem login).
 *
 * Existe porque as rotas públicas de escrita não tinham teto nenhum:
 * `/api/register` cria usuário já confirmado e empresa — e o próprio comentário
 * dele diz que contorna o rate limit do signUp do Supabase de propósito, para não
 * depender de e-mail. Um script criava tenants confirmados sem parar. Agendamento
 * e pedido do cardápio tinham o mesmo problema em menor escala: lead atrás de lead
 * entrando na roleta e consumindo o limite do plano da loja.
 *
 * O IP **não** é guardado. A chave é um HMAC-SHA256 do IP com um segredo que só
 * existe no servidor: serve para contar chamadas da mesma origem, não para saber
 * quem é. Sem o segredo não há como voltar do hash para o IP.
 */

/** IP de quem chamou, atrás do proxy da Vercel. */
function ipDaRequisicao(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  // O primeiro da lista é o cliente; os seguintes são proxies.
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip')?.trim() || 'desconhecido'
}

function chaveDoIp(escopo: string, req: Request): string {
  // Qualquer segredo de servidor serve como chave do HMAC — o que importa é não
  // ser adivinhável de fora. Sem nenhum configurado, o hash ainda agrupa por IP
  // dentro do processo; deixar de limitar seria pior que limitar com salt fraco.
  const segredo =
    process.env.PAYMENT_ENCRYPTION_KEY ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'nexus'
  const hash = createHmac('sha256', segredo).update(ipDaRequisicao(req)).digest('hex').slice(0, 32)
  return `${escopo}:${hash}`
}

/**
 * Conta esta chamada e diz se a origem passou do teto na janela.
 *
 * Devolve `false` (deixa passar) quando o próprio contador falha: um problema no
 * banco não pode derrubar o cadastro público inteiro — a rota é a função, o limite
 * é a proteção.
 */
export async function excedeuLimite(
  svc: SupabaseClient,
  escopo: string,
  req: Request,
  max: number,
  janelaMinutos = 60,
): Promise<boolean> {
  const ms = janelaMinutos * 60_000
  // Janela fixa (não deslizante): barata, uma linha por origem por período.
  const janela = new Date(Math.floor(Date.now() / ms) * ms).toISOString()

  const { data, error } = await svc.rpc('rate_limit_bump', {
    p_chave: chaveDoIp(escopo, req),
    p_janela: janela,
  })
  if (error) {
    console.error('[rate-limit] contador falhou, chamada liberada:', error.message)
    return false
  }
  return Number(data) > max
}

/**
 * O mesmo contador, por USUÁRIO logado em vez de por IP — para rotas que gastam
 * dinheiro por chamada (IA do ZapIntel). Janela fixa de `janelaMinutos`.
 *
 * Também deixa passar quando o contador falha, pelo mesmo motivo de
 * `excedeuLimite`: o limite protege a rota, não pode derrubá-la.
 *
 * Mas liberar CALADO deixava o teto cego sem ninguém saber — e cego, ele não
 * segura o laço que gasta a chave de IA. Desde 16/10 cada falha deixa um log
 * JSON (`zapintel.rate_limit.falha`) e um evento no Sentry com
 * `modulo=zapintel`. Uma vez por falha: é uma chamada por clique, não um laço.
 */
export async function excedeuLimiteDoUsuario(
  svc: SupabaseClient,
  escopo: string,
  userId: string,
  max: number,
  janelaMinutos = 60,
): Promise<boolean> {
  const ms = janelaMinutos * 60_000
  const janela = new Date(Math.floor(Date.now() / ms) * ms).toISOString()
  let resposta: { data: unknown; error: { message: string } | null }
  try {
    resposta = await svc.rpc('rate_limit_bump', { p_chave: `${escopo}:u:${userId}`, p_janela: janela })
  } catch (e) {
    resposta = { data: null, error: { message: e instanceof Error ? e.message : String(e) } }
  }
  if (resposta.error) {
    avisarContadorCego(escopo, userId, resposta.error.message)
    return false
  }
  return Number(resposta.data) > max
}

/**
 * Fora do Next (scripts no Node puro) o import de `@sentry/nextjs` cai na
 * versão CommonJS e `captureException` não vem como exportação nomeada — o
 * mesmo cuidado de `lib/zapintel/ponte.ts`. Ali o log JSON basta.
 */
function avisarContadorCego(escopo: string, userId: string, mensagem: string) {
  console.error(JSON.stringify({
    evento: 'zapintel.rate_limit.falha', escopo, user_id: userId, erro: mensagem, liberado: true,
  }))
  if (typeof Sentry.captureException !== 'function') return
  Sentry.captureException(new Error(`rate limit cego (${escopo}): ${mensagem}`), {
    tags: { modulo: 'zapintel', escopo },
    user: { id: userId },
  })
}
