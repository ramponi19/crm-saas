import { createServiceClient } from '@/lib/supabase/service'
import { encryptCredenciais, decryptCredenciais } from '@/lib/payments/crypto'

type Svc = ReturnType<typeof createServiceClient>

/**
 * Contact2Sale (C2S) — a plataforma por onde a imobiliária recebe lead hoje.
 *
 * Documentação pública: https://api.contact2sale.com/docs/api
 *
 * COMO FUNCIONA A LIGAÇÃO. O C2S EMPURRA o lead por webhook, com três gatilhos
 * (`on_create_lead`, `on_update_lead`, `on_close_lead`), e a assinatura é feita por
 * API — não pela tela deles. Por isso guardamos o token DELES: sem token não há
 * como assinar. O token vai cifrado (mesmo cofre das credenciais de pagamento).
 *
 * ⚠ UM ENDPOINT POR TOKEN. A doc é explícita: assinar um segundo endpoint APAGA o
 * primeiro. Como a URL que damos ao C2S é por empresa, dois tenants com o MESMO
 * token brigariam pelo webhook — e o segundo a assinar roubaria os leads do
 * primeiro, calado. `assinar()` devolve isso na resposta para a tela avisar.
 */

const BASE = 'https://api.contact2sale.com/integration'
const CHAVE = 'contact2sale'

export type AcaoC2S = 'on_create_lead' | 'on_update_lead' | 'on_close_lead'
export const ACOES: { id: AcaoC2S; label: string; descricao: string }[] = [
  { id: 'on_create_lead', label: 'Lead criado',      descricao: 'Manda o lead no momento em que nasce lá.' },
  { id: 'on_update_lead', label: 'Lead atualizado',  descricao: 'Manda a cada alteração registrada no lead.' },
  { id: 'on_close_lead',  label: 'Lead encerrado',   descricao: 'Manda quando arquivam ou fecham o negócio.' },
]

export interface ConfigC2S {
  /** Token DELES, cifrado. Nunca sai daqui em claro para a tela. */
  token?: string
  /** Nosso token de entrada, que vai na URL do webhook. */
  entrada?: string
  assinaturas?: AcaoC2S[]
  assinado_em?: string | null
  /**
   * A URL que foi REGISTRADA no C2S — guardada, não recalculada.
   *
   * O endereço fica do lado deles; recalcular na tela mostra o que nós ACHAMOS que
   * está lá. Se a variável de ambiente mudar, ou o painel for aberto por outro
   * domínio, os dois divergem e ninguém percebe até o lead não chegar.
   */
  url_assinada?: string | null
}

/** Config crua do banco (o token segue cifrado). */
export async function carregarConfig(svc: Svc, empresaId: number): Promise<ConfigC2S> {
  const { data } = await svc.from('configuracoes_sistema')
    .select('valor').eq('empresa_id', empresaId).eq('chave', CHAVE).maybeSingle()
  return (data?.valor ?? {}) as ConfigC2S
}

export async function salvarConfig(svc: Svc, empresaId: number, cfg: ConfigC2S): Promise<void> {
  await svc.from('configuracoes_sistema').upsert(
    { empresa_id: empresaId, chave: CHAVE, valor: cfg as never },
    { onConflict: 'empresa_id,chave' },
  )
}

/**
 * Token de ENTRADA: o segredo da nossa URL de webhook.
 *
 * O C2S não assina o corpo da requisição (não há `X-Hub-Signature` como na Meta),
 * então a URL secreta é a única autenticação possível — mesmo desenho do webhook
 * dos portais. Gerado sob demanda e nunca reaproveitado de outro segredo.
 */
export async function getOrCreateTokenEntrada(svc: Svc, empresaId: number): Promise<string> {
  const cfg = await carregarConfig(svc, empresaId)
  if (cfg.entrada) return cfg.entrada
  const entrada = crypto.randomUUID().replace(/-/g, '')
  await salvarConfig(svc, empresaId, { ...cfg, entrada })
  return entrada
}

/** Token deles em claro — só dentro do servidor, para falar com a API do C2S. */
export function tokenEmClaro(cfg: ConfigC2S): string | null {
  if (!cfg.token) return null
  try {
    return decryptCredenciais(cfg.token).token ?? null
  } catch {
    return null
  }
}

export function cifrarToken(token: string): string {
  return encryptCredenciais({ token })
}

/** Cabeçalhos da API deles. `Authorization: Bearer` é o preferencial na doc. */
const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Authentication: token,
  'Content-Type': 'application/json',
})

export interface RespostaC2S { ok: boolean; status: number; corpo: string }

async function chamar(caminho: string, token: string, body?: unknown): Promise<RespostaC2S> {
  try {
    const r = await fetch(`${BASE}${caminho}`, {
      method: 'POST',
      headers: headers(token),
      body: body ? JSON.stringify(body) : undefined,
      // Timeout explícito: parceiro fora do ar não pode pendurar a nossa tela.
      signal: AbortSignal.timeout(15000),
    })
    return { ok: r.ok, status: r.status, corpo: (await r.text()).slice(0, 400) }
  } catch (e) {
    return { ok: false, status: 0, corpo: e instanceof Error ? e.message : 'falha de rede' }
  }
}

/**
 * Base pública do CRM. A conta mora em `lib/url-publica.ts` desde que o conector
 * do Instagram passou a precisar da MESMA regra para o `redirect_uri` — duas
 * cópias divergiriam, e divergência aqui significa endereço registrado no parceiro
 * que ninguém atende.
 */
export { basePublica } from '@/lib/url-publica'

export const assinar = (token: string, acao: AcaoC2S, url: string) =>
  chamar('/api/subscribe', token, { hook_action: acao, hook_url: url })

export const cancelar = (token: string, acao: AcaoC2S) =>
  chamar('/api/unsubscribe', token, { hook_action: acao })

/** Testa o token pedindo os dados da empresa — leitura, sem efeito colateral. */
export async function testarToken(token: string): Promise<RespostaC2S & { empresa?: string }> {
  try {
    const r = await fetch(`${BASE}/company`, { headers: headers(token), signal: AbortSignal.timeout(15000) })
    const corpo = (await r.text()).slice(0, 400)
    let empresa: string | undefined
    try { empresa = (JSON.parse(corpo) as { company_name?: string }).company_name } catch { /* corpo não-JSON */ }
    return { ok: r.ok, status: r.status, corpo, empresa }
  } catch (e) {
    return { ok: false, status: 0, corpo: e instanceof Error ? e.message : 'falha de rede' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tradução do lead
// ─────────────────────────────────────────────────────────────────────────────

export interface LeadC2S {
  externoId: string | null
  nome: string
  telefone: string | null
  email: string | null
  produto: string | null
  valor: number | null
  bairro: string | null
  cidade: string | null
  origem: string | null
  canal: string | null
  vendedorEmail: string | null
  vendedorNome: string | null
  observacao: string | null
  statusAlias: string | null
  fechado: boolean
  arquivado: boolean
}

const txt = (v: unknown): string | null => {
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (typeof v === 'number') return String(v)
  return null
}

/**
 * Traduz o payload do webhook para o nosso lead.
 *
 * ACEITA DUAS FORMAS de propósito: a doc mostra o envelope `{ data: { attributes } }`
 * do `GET /leads/:id`, mas NÃO mostra o corpo que o webhook envia. Em vez de apostar
 * numa e falhar calado no primeiro lead real, a função aceita as duas e a rota grava
 * o payload cru no log — o primeiro evento de verdade nos diz qual é.
 */
export function leadDoPayload(payload: unknown): LeadC2S | null {
  const raiz = payload as Record<string, unknown> | null
  if (!raiz || typeof raiz !== 'object') return null

  const data = (raiz.data ?? raiz) as Record<string, unknown>
  const attrs = (data.attributes ?? data) as Record<string, unknown>
  const obj = (k: string) => (attrs[k] ?? {}) as Record<string, unknown>

  const customer = obj('customer')
  const product = obj('product')
  const seller = obj('seller')
  const fonte = obj('lead_source')
  const canal = obj('channel')
  const status = obj('lead_status')
  const done = obj('done_details')
  const arquivo = obj('archive_details')

  const nome = txt(customer.name) ?? txt(attrs.name) ?? 'Lead do Contact2Sale'
  const externoId = txt(data.id) ?? txt(data.internal_id) ?? txt(attrs.id)

  // Sem nada que identifique a pessoa, não há lead — só ruído com nome genérico.
  const telefone = txt(customer.phone_global) ?? txt(customer.phone) ?? txt(customer.phone2)
  const email = txt(customer.email)
  if (!telefone && !email && !externoId) return null

  const precoBruto = product.price_float ?? product.price
  const valor = typeof precoBruto === 'number'
    ? precoBruto
    // "350.000,00" → 350000.00: ponto é milhar e vírgula é decimal no formato deles.
    : typeof precoBruto === 'string' && precoBruto.trim()
      ? Number(precoBruto.replace(/\./g, '').replace(',', '.')) || null
      : null

  return {
    externoId,
    nome,
    telefone,
    email,
    produto: txt(product.description) ?? txt(product.prop_ref),
    valor,
    bairro: txt(product.neighbourhood),
    cidade: txt(product.city),
    origem: txt(fonte.name),
    canal: txt(canal.name),
    vendedorEmail: txt(seller.email),
    vendedorNome: txt(seller.name),
    observacao: txt(attrs.observation) ?? txt(attrs.description),
    statusAlias: txt(status.alias),
    fechado: done.done === true,
    arquivado: arquivo.archived === true,
  }
}
