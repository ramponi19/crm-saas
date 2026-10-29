import type { SupabaseClient } from '@supabase/supabase-js'
import type { CamadaBase, MenuConfigDono, MenuOverrideRow, MenuOverridesSuperadmin } from '@/lib/menu'
import type { ModuloPlano } from '@/lib/plano'
import { capacidadesDosModulos, moduloPorChave, paineisDosModulos, type CapacidadesDoModulo, type PainelDoLead } from '@/core/modulos'
import { hrefsHabilitados, type ResolverMenuInput } from '@/lib/menu'
import { SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'

/**
 * A CONFIGURAÇÃO DA EMPRESA SAI DAS TABELAS DA EMPRESA, NUM LUGAR SÓ.
 *
 * Até 21/10/2026 o menu e a trava de rota liam `segmentos_config` e três colunas
 * de `empresas`; de 21 a 29/10, a linha de `presets_onboarding` mesclada com um
 * molde estático por vertical, a cada request. Desde 29/10/2026 o preset é só a
 * ficha de partida (lib/presets.ts): o cadastro a copia para a empresa, e daqui
 * em diante só as tabelas DA EMPRESA contam.
 *
 *   empresa_menu.itens.base         a base com que a empresa nasceu: habilitados,
 *                                   rótulos, extras, ordem, tela inicial, vocabulário
 *   empresa_menu.itens.superadmin   { hidden, labels, habilitados }  (era menu_override)
 *   empresa_menu.itens.dono         { hidden, labels, ordem }        (era menu_config)
 *   empresa_modulos                 módulos instalados (Central) e forçados (config.forcado)
 *
 * O que um módulo liga nas outras telas (capacidades, painéis do lead) vem do
 * manifesto (core/modulos.ts) pelos módulos ligados — não de quem a empresa é.
 */

/** Textos da Agenda que mudam com o negócio (clínica: consulta, paciente). */
export interface RotulosAgenda {
  evento?: string
  novo?: string
  pessoa?: string
  profissional?: string
  subtitulo?: string
  vazio?: string
  agendado?: string
  exemplo?: string
  tipos?: { v: string; l: string }[]
}

/** Como a empresa chama as coisas. Ausente = o texto padrão de cada tela. */
export interface Vocabulario {
  /** Quem atende ("Corretor"). Padrão "Vendedor". */
  equipe?: string
  /** O campo "o que o cliente quer", no card do lead. */
  interesse?: string
  /** Quem é atendido ("Paciente"). */
  contato?: string
  agenda?: RotulosAgenda
}

/** empresa_menu.itens.base, como o cadastro grava (lib/presets.ts → baseDoPreset). */
export interface BaseGravada {
  habilitados?: string[]
  labels?: Record<string, string>
  extras?: { href: string; label: string; icon: string; grupo?: string }[]
  layout?: Record<string, string[]>
  tela_inicial?: string | null
  vocabulario?: Vocabulario
}

export interface ItensMenu {
  base?: BaseGravada
  superadmin?: MenuOverrideRow
  dono?: MenuConfigDono
}

/** As camadas da empresa: a base com que nasceu, o que o superadmin define e o que o dono arrasta. */
export function camadasDoMenu(itens: unknown): {
  base: CamadaBase; telaInicial: string | null; vocabulario: Vocabulario
  superadmin: MenuOverrideRow | null; dono: MenuConfigDono | undefined
} {
  const i = (itens ?? {}) as ItensMenu
  const b = i.base ?? {}
  return {
    base: {
      habilitados: b.habilitados ?? undefined,
      labelOverrides: b.labels ?? {},
      modulosExtra: b.extras ?? [],
      menuLayout: b.layout ?? {},
    },
    telaInicial: b.tela_inicial ?? null,
    vocabulario: b.vocabulario ?? {},
    superadmin: i.superadmin ?? null,
    dono: i.dono ?? undefined,
  }
}

export interface ModuloRow {
  modulo: string
  ativo: boolean
  config: Record<string, unknown> | null
}

/** Módulos de plano forçados pelo superadmin (o antigo modulos_override). */
export function modulosForcados(rows: ModuloRow[] | null | undefined): Partial<Record<ModuloPlano, boolean>> | undefined {
  const fora: Partial<Record<ModuloPlano, boolean>> = {}
  let algum = false
  for (const r of rows ?? []) {
    const f = r.config?.forcado
    if (typeof f === 'boolean') { fora[r.modulo as ModuloPlano] = f; algum = true }
  }
  return algum ? fora : undefined
}

/**
 * O ZapIntel é o módulo `inteligencia` em empresa_modulos (origem addon). Até
 * 21/10/2026 era a tabela à parte complementos_empresa (zapintel_ativo).
 */
export const MODULO_INTELIGENCIA = 'inteligencia'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function inteligenciaLigada(db: SupabaseClient<any>, empresaId: number): Promise<boolean> {
  const { data } = await db.from('empresa_modulos').select('ativo')
    .eq('empresa_id', empresaId).eq('modulo', MODULO_INTELIGENCIA).maybeSingle()
  return !!(data as { ativo?: boolean } | null)?.ativo
}

/** Módulo ligado para a empresa: linha ativa em empresa_modulos. */
export function moduloLigado(rows: ModuloRow[] | null | undefined, modulo: string): boolean {
  return (rows ?? []).some((r) => r.modulo === modulo && r.ativo)
}

/**
 * A camada da Central de Módulos para o menu e a trava: `href → instalado?`, só
 * das linhas cuja chave está no manifesto (core/modulos.ts). As linhas do corte
 * que não são módulo de menu (`vendas`, `avaliacao`) ficam de fora; as que são
 * (`estoque`, `financeiro`, `assistencia`) vieram ativas, e ativo só confirma o
 * que a base já ligava — o menu de hoje não muda.
 */
export function instaladosDoManifesto(rows: ModuloRow[] | null | undefined): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const r of rows ?? []) {
    const m = moduloPorChave(r.modulo)
    if (m) out[m.href] = r.ativo
  }
  return out
}

export interface ConfigEmpresa {
  /** Camada 1 do menu: a base com que a empresa nasceu (empresa_menu.itens.base). */
  base: CamadaBase
  /** Rota depois do login, quando não é o primeiro item do menu (clínica: /agenda). */
  telaInicial: string | null
  vocabulario: Vocabulario
  superadmin: MenuOverrideRow | null
  dono: MenuConfigDono | undefined
  modulos: ModuloRow[]
  forcados: Partial<Record<ModuloPlano, boolean>> | undefined
}

/**
 * As camadas do menu como o layout sempre as passou ao resolverMenu. `permHidden`
 * são os itens que o PAPEL não pode ver (financeiro, relatórios), somados aos
 * ocultos do superadmin — exatamente como o layout fazia.
 */
export function camadasParaMenu(cfg: Pick<ConfigEmpresa, 'base' | 'superadmin' | 'dono' | 'forcados'> & Partial<Pick<ConfigEmpresa, 'modulos'>>, permHidden: string[] = []) {
  const mo = cfg.superadmin
  const base = cfg.base
  return {
    /** Camada da Central de Módulos (empresa_modulos pelo manifesto). */
    instalados: instaladosDoManifesto(cfg.modulos),
    overrides: {
      modulos: cfg.forcados,
      hidden: [...(mo?.hidden ?? []), ...permHidden],
      labels: mo?.labels,
      habilitados: mo?.habilitados,
    } satisfies MenuOverridesSuperadmin,
    configDono: cfg.dono,
    base,
    /** Mesma precedência do menu: base, superadmin, dono. */
    rotulos: { ...(base.labelOverrides ?? {}), ...(mo?.labels ?? {}), ...(cfg.dono?.labels ?? {}) } as Record<string, string>,
  }
}

/**
 * Grava UMA camada do menu da empresa sem tocar nas outras (o superadmin não
 * apaga a ordem do dono, o dono não apaga a liberação do superadmin, nenhum dos
 * dois apaga a base).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function gravarCamadaMenu(db: SupabaseClient<any>, empresaId: number, camada: 'base' | 'superadmin' | 'dono', valor: unknown) {
  const { data } = await db.from('empresa_menu').select('itens').eq('empresa_id', empresaId).maybeSingle()
  const itens = { ...(((data as { itens?: Record<string, unknown> } | null)?.itens) ?? {}) }
  if (valor == null) delete itens[camada]
  else itens[camada] = valor
  return db.from('empresa_menu').upsert({ empresa_id: empresaId, itens, updated_at: new Date().toISOString() }, { onConflict: 'empresa_id' })
}

/**
 * Grava os módulos de plano forçados pelo superadmin (config.forcado). Chave
 * fora do mapa perde o forcado; a linha do módulo continua (ela diz se ele está
 * instalado, que é outra coisa).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function gravarModulosForcados(db: SupabaseClient<any>, empresaId: number, mapa: Record<string, boolean> | null) {
  const { data } = await db.from('empresa_modulos').select('modulo, ativo, config').eq('empresa_id', empresaId)
  const atuais = (data ?? []) as ModuloRow[]
  const alvo = mapa ?? {}
  for (const r of atuais) {
    if (typeof r.config?.forcado === 'boolean' && !(r.modulo in alvo)) {
      const { forcado: _fora, ...resto } = r.config ?? {}
      void _fora
      const { error } = await db.from('empresa_modulos').update({ config: resto, updated_at: new Date().toISOString() })
        .eq('empresa_id', empresaId).eq('modulo', r.modulo)
      if (error) return { error }
    }
  }
  for (const [modulo, forcado] of Object.entries(alvo)) {
    const atual = atuais.find((r) => r.modulo === modulo)
    const { error } = atual
      ? await db.from('empresa_modulos').update({ config: { ...(atual.config ?? {}), forcado }, updated_at: new Date().toISOString() })
          .eq('empresa_id', empresaId).eq('modulo', modulo)
      : await db.from('empresa_modulos').insert({ empresa_id: empresaId, modulo, origem: 'addon', config: { forcado }, ativo: true })
    if (error) return { error }
  }
  return { error: null }
}

/** Lê as duas tabelas da empresa de uma vez: o menu (base e camadas) e os módulos. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function carregarConfigEmpresa(db: SupabaseClient<any>, empresaId: number): Promise<ConfigEmpresa> {
  const [{ data: menu }, { data: modulos }] = await Promise.all([
    db.from('empresa_menu').select('itens').eq('empresa_id', empresaId).maybeSingle(),
    db.from('empresa_modulos').select('modulo, ativo, config').eq('empresa_id', empresaId),
  ])
  const camadas = camadasDoMenu((menu as { itens?: unknown } | null)?.itens)
  const rows = (modulos ?? []) as ModuloRow[]
  return { ...camadas, modulos: rows, forcados: modulosForcados(rows) }
}

/**
 * OS MÓDULOS LIGADOS PARA A EMPRESA — a pergunta que o código faz no lugar de
 * "qual é o segmento?" (22/10/2026).
 *
 * Endereços ligados pelas camadas de sempre (base, superadmin, Central de
 * Módulos), a mesma conta do menu e da trava.
 */
export function ligadosDaEmpresa(cfg: ConfigEmpresa): Set<string> {
  const { overrides, base, instalados } = camadasParaMenu(cfg)
  return hrefsHabilitados({ overrides, base, instalados })
}

/** A entrada do resolvedor do menu para esta empresa. */
export function entradaDoMenu(
  cfg: ConfigEmpresa,
  quem: { plano?: string; role: string; isSuperAdmin: boolean },
  permHidden: string[] = [],
): ResolverMenuInput {
  const { overrides, configDono, base, instalados } = camadasParaMenu(cfg, permHidden)
  return { ...quem, overrides, configDono, base, instalados }
}

/**
 * O QUE OS MÓDULOS LIGADOS FAZEM NAS OUTRAS TELAS (29/10/2026): visitas no lead,
 * telas próprias, portais, comissão por negócio, captação, cliente com funil,
 * bloco de veículos, match por veículo, comanda. Vem do manifesto, somado.
 */
export function capacidades(cfg: ConfigEmpresa): CapacidadesDoModulo {
  return capacidadesDosModulos(ligadosDaEmpresa(cfg))
}

/**
 * Campo personalizado ativo na empresa (29/10/2026). A placa do veículo é um
 * campo do item (entidade `item`, módulo dono `estoque`), criado pelo preset de
 * veículos no cadastro; com ele, o estoque é de veículos.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function campoAtivo(db: SupabaseClient<any>, empresaId: number, entidade: string, chave: string): Promise<boolean> {
  const { data } = await db.from('campos_personalizados').select('id')
    .eq('empresa_id', empresaId).eq('entidade', entidade).eq('chave', chave).eq('ativo', true).limit(1)
  return (data ?? []).length > 0
}

/**
 * O QUE O CARD DO LEAD MOSTRA ALÉM DO COMUM (23/10/2026; desde 29/10 pela empresa).
 *
 *   paineis        painéis dos módulos ligados, na ordem do manifesto
 *   interesse      rótulo do campo "produto" do lead (vocabulário da empresa)
 *   textoLivre     item vive em tabela própria (imóvel, veículo): campo de texto,
 *                  sem o autocomplete do catálogo
 *   agendaVisitas  bloco de visitas no painel de ações
 */
export interface PerfilDoLead {
  paineis: PainelDoLead[]
  interesse: string
  agendaVisitas: boolean
  textoLivre: boolean
}

export type { PainelDoLead }

export function perfilDoLead(cfg: ConfigEmpresa): PerfilDoLead {
  const ligados = ligadosDaEmpresa(cfg)
  const paineis = paineisDosModulos(ligados)
  return {
    paineis,
    interesse: cfg.vocabulario.interesse ?? 'Produto interessado',
    agendaVisitas: !!capacidadesDosModulos(ligados).agendaVisitas,
    textoLivre: paineis.length > 0,
  }
}

/** Como a empresa chama quem atende ("Corretor" na imobiliária). Padrão "Vendedor". */
export function vocabulario(cfg: Pick<ConfigEmpresa, 'vocabulario'>): { equipe: string } {
  return { equipe: cfg.vocabulario.equipe ?? 'Vendedor' }
}

/**
 * TRANSITÓRIO (29/10/2026): a lista e a validação de presets do cadastro e do
 * superadmin, ainda pelo código. Saem quando o /register ler presets_onboarding
 * e a troca de preset sair da ficha da empresa.
 */
const MOLDES = SEGMENTOS
const chaveDoMolde = normalizarSegmento

/** A chave do preset como o código a conhece; desconhecida ou vazia = varejo. */
export function normalizarPreset(preset: string | null | undefined): string {
  return chaveDoMolde(preset)
}

/** O preset existe no código? (troca de preset no superadmin). */
export function presetConhecido(preset: string | null | undefined): boolean {
  return !!preset && preset in MOLDES
}

/** Os presets do código, na ordem do cadastro, com o rótulo do molde. */
export const PRESETS_DO_CODIGO: { chave: string; nome: string }[] =
  Object.entries(MOLDES).map(([chave, m]) => ({ chave, nome: m.label }))
