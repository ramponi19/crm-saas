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
 * migrações).
 *
 * PADRÕES EXPLÍCITOS (etapa 1.1i, 26/11/2026): toda chave tem o seu padrão aqui, com o MESMO valor que as funções do
 * banco e as telas calculam quando a empresa não gravou nada (conferido no teste). Esta lista é a fonte do gerador
 * `scripts/gerar-config-padroes.mts`, que escreve os padrões no banco (`config_padroes()`); a empresa nasce com eles
 * gravados em `empresa_config` (gatilho em `empresas`) e cada módulo grava os seus ao ser instalado (gatilho em
 * `empresa_modulos`). Padrão nulo não é gravado (a tabela não aceita valor nulo): a chave fica "sem valor" de propósito.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { PARAMETROS as PARAMETROS_POSVENDA, BOTAO_SEM_OFERTAS_PADRAO, CONFIRMACAO_SEM_OFERTAS_PADRAO } from '@/lib/posvenda/config'
import { HORARIO_PADRAO } from '@/lib/horario'

export type EscopoConfig = 'empresa' | 'empresa_ou_loja'

export interface DefinicaoConfig {
  modulo: string
  chave: string
  escopo: EscopoConfig
  /** Valor de fábrica quando a empresa não gravou nada. */
  padrao: unknown
  rotulo: string
  /** Chave que ninguém mais lê: fica no catálogo (migrações antigas a citam) mas não é gravada na empresa nova. */
  obsoleta?: string
  /** Módulo do manifesto que precisa estar instalado para a chave ser gravada (nulo: nasce com a empresa). */
  modulo_requerido?: string
}

const CORE: DefinicaoConfig[] = [
  // 'exigida' é o que lib/venda-ganho.ts (modoCondicao) aplica a qualquer valor que não seja 'opcional'/'nao_usa'
  { modulo: 'core', chave: 'condicao_venda', escopo: 'empresa', padrao: 'exigida', rotulo: 'Condição do produto obrigatória na venda' },
  // seg–sex 09–18, sábado e domingo fechados: core_horario (banco) e HORARIO_PADRAO (lib/horario) — o mesmo objeto
  { modulo: 'core', chave: 'horario', escopo: 'empresa_ou_loja', padrao: HORARIO_PADRAO, rotulo: 'Horário de funcionamento' },
  // core_sem_ofertas_pelo_botao e core_sem_ofertas_confirmacao_padrao (banco) = constantes de lib/posvenda/config
  { modulo: 'core', chave: 'sem_ofertas', escopo: 'empresa',
    padrao: { botoes: [BOTAO_SEM_OFERTAS_PADRAO], confirmacao: CONFIRMACAO_SEM_OFERTAS_PADRAO }, rotulo: '"Não quero receber ofertas"' },
  { modulo: 'calendario', chave: 'dias_semana_uteis', escopo: 'empresa_ou_loja', padrao: [1, 2, 3, 4, 5],
    obsoleta: 'desde 24/11 (20261124001200) o pós-venda usa core_proximo_dia_aberto (horário); ninguém lê esta chave',
    rotulo: 'Dias da semana úteis' },
  // core_sem_dono_modo: tudo que não for 'roleta' é 'esteira'
  { modulo: 'distribuicao', chave: 'sem_dono', escopo: 'empresa_ou_loja', padrao: 'esteira', rotulo: 'Negócio sem responsável' },
  // core_liberar_lote_esteira: sem configuração ou sem ativo=true → "desligado"
  { modulo: 'distribuicao', chave: 'liberacao_diaria', escopo: 'empresa_ou_loja', padrao: { ativo: false }, rotulo: 'Liberação diária da esteira' },
]

const POSVENDA: DefinicaoConfig[] = (Object.entries(PARAMETROS_POSVENDA) as [string, { porLoja: boolean; padrao: unknown }][])
  .map(([chave, d]) => ({ modulo: 'posvenda', chave, escopo: d.porLoja ? 'empresa_ou_loja' : 'empresa', padrao: d.padrao, rotulo: chave,
    modulo_requerido: 'posvenda' }))

/** O que a empresa grava ao nascer (sem `modulo_requerido`) ou ao instalar o módulo: padrão não nulo e chave viva. */
export function padroesParaSemear(): { modulo: string; chave: string; valor: unknown; modulo_requerido: string | null }[] {
  return DEFINICOES_CONFIG
    .filter((d) => d.padrao !== null && d.padrao !== undefined && !d.obsoleta)
    .map((d) => ({ modulo: d.modulo, chave: d.chave, valor: d.padrao, modulo_requerido: d.modulo_requerido ?? null }))
}

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
