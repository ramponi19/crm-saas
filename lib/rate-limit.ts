import { createHmac } from 'crypto'
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
