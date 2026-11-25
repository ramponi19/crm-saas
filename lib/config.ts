/**
 * MOTOR DE CONFIGURAÇÃO (etapa 1.1a, 25/11/2026; docs/etapa-1.1-plano.md §1, PDV v2 §A).
 *
 * Os valores moram em `empresa_config` (uma linha por empresa, `filial_id` nulo, e uma por loja), gravados só
 * pela RPC `config_salvar` (que confere a permissão e audita). Leitura no banco: `config_valor` /
 * `config_valor_emp` (loja → empresa → nulo). Aqui no servidor:
 *   - `lerConfig`: o valor que vale para a loja (loja → empresa → padrão do catálogo);
 *   - `envelopesDaConfig`: o formato {empresa, lojas} que as telas de configuração usam para mostrar
 *     "toda a empresa" e "esta loja" lado a lado.
 *
 * O catálogo (`DEFINICOES_CONFIG`) lista toda chave que existe, com o padrão quando ele é um valor simples.
 * Chave nova: entra no catálogo no mesmo commit (o teste tests/config.test.ts confere contra o código e as
 * migrações). Padrões que ainda moram no chamador (horário, liberação diária, sem ofertas) ficam marcados
 * `padraoNoChamador` até o módulo ser tocado.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { PARAMETROS as PARAMETROS_POSVENDA } from '@/lib/posvenda/config'

export type EscopoConfig = 'empresa' | 'empresa_ou_loja'

export interface DefinicaoConfig {
  modulo: string
  chave: string
  escopo: EscopoConfig
  /** Valor de fábrica quando a empresa não gravou nada. */
  padrao: unknown
  /** O padrão é calculado por quem lê (função do banco ou tela), não é um valor simples. */
  padraoNoChamador?: string
  rotulo: string
}

const CORE: DefinicaoConfig[] = [
  { modulo: 'core', chave: 'condicao_venda', escopo: 'empresa', padrao: null, rotulo: 'Condição do produto obrigatória na venda' },
  { modulo: 'core', chave: 'horario', escopo: 'empresa_ou_loja', padrao: null,
    padraoNoChamador: 'core_horario (seg–sex, sábado fechado)', rotulo: 'Horário de funcionamento' },
  { modulo: 'core', chave: 'sem_ofertas', escopo: 'empresa', padrao: null,
    padraoNoChamador: 'core_sem_ofertas_* (botões e confirmação padrão)', rotulo: '"Não quero receber ofertas"' },
  { modulo: 'calendario', chave: 'dias_semana_uteis', escopo: 'empresa_ou_loja', padrao: null,
    padraoNoChamador: 'posvenda_responsavel (segunda a sexta)', rotulo: 'Dias da semana úteis' },
  { modulo: 'distribuicao', chave: 'sem_dono', escopo: 'empresa_ou_loja', padrao: 'esteira', rotulo: 'Negócio sem responsável' },
  { modulo: 'distribuicao', chave: 'liberacao_diaria', escopo: 'empresa_ou_loja', padrao: null,
    padraoNoChamador: 'liberacao_diaria (desligada)', rotulo: 'Liberação diária da esteira' },
]

const POSVENDA: DefinicaoConfig[] = (Object.entries(PARAMETROS_POSVENDA) as [string, { porLoja: boolean; padrao: unknown }][])
  .map(([chave, d]) => ({ modulo: 'posvenda', chave, escopo: d.porLoja ? 'empresa_ou_loja' : 'empresa', padrao: d.padrao, rotulo: chave }))

export const DEFINICOES_CONFIG: DefinicaoConfig[] = [...CORE, ...POSVENDA]

export function definicaoConfig(modulo: string, chave: string): DefinicaoConfig | undefined {
  return DEFINICOES_CONFIG.find((d) => d.modulo === modulo && d.chave === chave)
}

/** Formato das telas de configuração: valor da empresa e de cada loja. */
export interface EnvelopeConfig { empresa: unknown; lojas: Record<string, unknown> }

interface LinhaConfig { modulo: string; chave: string; filial_id: number | null; valor: unknown }

/** Monta {empresa, lojas} por '<modulo>.<chave>' a partir das linhas de empresa_config. Pura (testável). */
export function montarEnvelopes(linhas: LinhaConfig[]): Record<string, EnvelopeConfig> {
  const out: Record<string, EnvelopeConfig> = {}
  for (const l of linhas) {
    const k = `${l.modulo}.${l.chave}`
    const env = (out[k] ??= { empresa: null, lojas: {} })
    if (l.filial_id == null) env.empresa = l.valor
    else env.lojas[String(l.filial_id)] = l.valor
  }
  return out
}

/** Valor que vale: loja → empresa → padrão do catálogo. Pura (testável). */
export function resolverConfig(env: EnvelopeConfig | undefined, filialId: number | null | undefined, padrao: unknown): unknown {
  if (env && filialId != null && env.lojas[String(filialId)] !== undefined) return env.lojas[String(filialId)]
  if (env && env.empresa !== null && env.empresa !== undefined) return env.empresa
  return padrao ?? null
}

// A tabela é nova e ainda não está em types/database.gerado.ts (gerado da produção).
function semTipo(db: SupabaseClient<any>): SupabaseClient { return db as unknown as SupabaseClient } // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Envelopes de várias chaves de um módulo (ou de chaves soltas), para as telas de configuração.
 * `db` pode ser o cliente da sessão (RLS: só a própria empresa) ou o de serviço.
 */
export async function envelopesDaConfig(
  db: SupabaseClient<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  empresaId: number,
  filtro: { modulos?: string[]; chaves?: string[] },
): Promise<Record<string, EnvelopeConfig>> {
  const ors: string[] = []
  for (const m of filtro.modulos ?? []) ors.push(`modulo.eq.${m}`)
  for (const c of filtro.chaves ?? []) {
    const [m, k] = c.split('.')
    if (m && k) ors.push(`and(modulo.eq.${m},chave.eq.${k})`)
  }
  if (!ors.length) return {}
  const { data, error } = await semTipo(db).from('empresa_config')
    .select('modulo, chave, filial_id, valor').eq('empresa_id', empresaId).or(ors.join(','))
  if (error) throw new Error(`config: ${error.message}`)
  return montarEnvelopes((data ?? []) as LinhaConfig[])
}

/** O valor de uma chave para a loja (ou para a empresa, sem loja), com o padrão do catálogo. */
export async function lerConfig(
  db: SupabaseClient<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  empresaId: number, modulo: string, chave: string, filialId?: number | null,
): Promise<unknown> {
  const envs = await envelopesDaConfig(db, empresaId, { chaves: [`${modulo}.${chave}`] })
  return resolverConfig(envs[`${modulo}.${chave}`], filialId, definicaoConfig(modulo, chave)?.padrao)
}
