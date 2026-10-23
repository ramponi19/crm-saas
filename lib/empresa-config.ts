import type { SupabaseClient } from '@supabase/supabase-js'
import type { CamadaBase, MenuConfigDono, MenuOverrideRow, MenuOverridesSuperadmin } from '@/lib/menu'
import type { ModuloPlano } from '@/lib/plano'
import { moduloPorChave } from '@/core/modulos'
import { habilitadosDoMolde, hrefsHabilitados, type ResolverMenuInput } from '@/lib/menu'
import { SEGMENTOS, normalizarSegmento, type PainelDoLead } from '@/lib/segmentos'

/**
 * A CONFIGURAÇÃO DA EMPRESA SAI DAS TABELAS DO CORE, NUM LUGAR SÓ.
 *
 * Até 21/10/2026 o menu e a trava de rota liam `segmentos_config` e três colunas
 * de `empresas` (`menu_override`, `menu_config`, `modulos_override`). O core v1
 * já tinha as tabelas certas desde o corte — `presets_onboarding`,
 * `empresa_menu`, `empresa_modulos` —, mas ninguém lia nem gravava nelas: o
 * que o superadmin e o dono mudavam depois de 20/10 ia só para o legado.
 *
 * O menu recebe a camada base PRONTA (`CamadaBase`, montada por `camadaBase`
 * com o banco e o molde estático já resolvidos), mais MenuOverrideRow e
 * MenuConfigDono. Os mapeamentos são puros e exportados para o teste que compara
 * o menu antes e depois (scripts/comparar-menu.mts).
 *
 *   presets_onboarding.rotulos      rótulos do preset + `_menu` com as quatro listas
 *   empresa_menu.itens.superadmin   { hidden, labels, habilitados }  (era menu_override)
 *   empresa_menu.itens.dono         { hidden, labels, ordem }        (era menu_config)
 *   empresa_modulos.config.forcado  liga/desliga módulo de plano      (era modulos_override)
 */

export interface PresetRow {
  chave: string
  rotulos: Record<string, unknown> | null
}

interface MenuDoPreset {
  hidden_hrefs?: string[] | null
  modulos_habilitados?: string[] | null
  modulos_extra?: { href: string; label: string; icon: string; grupo?: string }[] | null
  menu_layout?: Record<string, string[]> | null
}

/**
 * O que a linha do preset diz, CRU: sem o molde estático por baixo. A trava de
 * rota (proxy.ts), o ranking e o laboratório leem só isto; o menu recebe
 * `camadaBase`, que junta esta leitura ao molde.
 */
export function menuDoPreset(p: PresetRow | null | undefined): CamadaBase | undefined {
  if (!p) return undefined
  const { _menu, ...labels } = (p.rotulos ?? {}) as Record<string, unknown> & { _menu?: MenuDoPreset }
  const m = _menu ?? {}
  return {
    hiddenHrefs: m.hidden_hrefs ?? [],
    labelOverrides: labels as Record<string, string>,
    modulosExtra: m.modulos_extra ?? [],
    habilitados: m.modulos_habilitados ?? undefined,
    menuLayout: m.menu_layout ?? undefined,
  }
}

/** O molde estático de um preset; preset desconhecido ou vazio = varejo. */
function moldeDoPreset(preset: string | null | undefined) {
  return SEGMENTOS[normalizarSegmento(preset)]
}

/**
 * A CAMADA 1 DO MENU, PRONTA: a linha do preset sobre o molde estático com que
 * a empresa nasceu (o cadastro de presets em lib/segmentos.ts).
 *
 * Até 22/10/2026 esta mescla morava dentro de lib/menu.ts, que recebia o nome da
 * vertical e ia buscar o molde sozinho. As regras são as mesmas, cada uma no seu
 * campo:
 *   - módulos ligados: a lista do banco; sem lista, o catálogo comum menos os
 *     ocultos do molde, mais os extras dele;
 *   - rótulos: os do banco quando há linha; sem linha, os do molde;
 *   - extras: LISTA VAZIA DO BANCO NÃO É "NENHUM EXTRA" — É "NÃO CONFIGURADO".
 *     Com `modulos_extra = []` (o estado real da imobiliária em 20/08/2026) o
 *     array vazio vencia o molde e derrubava "Metas e Ranking" do menu — e, junto,
 *     o acesso do corretor à tela. Para TIRAR um extra existe `hidden_hrefs`;
 *   - ordem: rasa, grupo a grupo — o que o superadmin editou vence o molde.
 */
export function camadaBase(lido: CamadaBase | undefined, preset: string | null): CamadaBase {
  const molde = moldeDoPreset(preset)
  return {
    habilitados: lido?.habilitados ?? habilitadosDoMolde(molde),
    labelOverrides: lido?.labelOverrides ?? molde.labelOverrides,
    modulosExtra: lido?.modulosExtra?.length ? lido.modulosExtra : (molde.modulosExtra ?? []),
    menuLayout: { ...(molde.menuLayout ?? {}), ...(lido?.menuLayout ?? {}) },
  }
}

export interface ItensMenu {
  superadmin?: MenuOverrideRow
  dono?: MenuConfigDono
}

/** As camadas da empresa: o que o superadmin define e o que o dono arrasta. */
export function camadasDoMenu(itens: unknown): { superadmin: MenuOverrideRow | null; dono: MenuConfigDono | undefined } {
  const i = (itens ?? {}) as ItensMenu
  return { superadmin: i.superadmin ?? null, dono: i.dono ?? undefined }
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
 * que o preset já ligava — o menu de hoje não muda.
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
  preset: string | null
  /** A linha do preset, crua (`menuDoPreset`); `camadasParaMenu` junta o molde. */
  presetLido: CamadaBase | undefined
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
export function camadasParaMenu(cfg: Pick<ConfigEmpresa, 'preset' | 'presetLido' | 'superadmin' | 'dono' | 'forcados'> & Partial<Pick<ConfigEmpresa, 'modulos'>>, permHidden: string[] = []) {
  const mo = cfg.superadmin
  const base = camadaBase(cfg.presetLido, cfg.preset)
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
 * A linha que a tela de Segmentos do superadmin edita (o formato antigo de
 * segmentos_config), lida de e gravada em presets_onboarding. A tela não muda.
 */
export interface SegmentoRow {
  chave: string
  label: string
  descricao: string | null
  hidden_hrefs: string[]
  label_overrides: Record<string, string>
  modulos_extra: { href: string; label: string; icon: string; grupo?: string }[]
  modulos_habilitados: string[] | null
  menu_layout: Record<string, string[]> | null
  ordem: number
  ativo: boolean
}

export function segmentoDoPreset(p: { chave: string; nome: string; descricao: string | null; rotulos: Record<string, unknown> | null; ativo: boolean }): SegmentoRow {
  const { _menu, ...labels } = (p.rotulos ?? {}) as Record<string, unknown> & { _menu?: MenuDoPreset & { ordem?: number } }
  const m = _menu ?? {}
  return {
    chave: p.chave, label: p.nome, descricao: p.descricao,
    hidden_hrefs: m.hidden_hrefs ?? [], label_overrides: labels as Record<string, string>,
    modulos_extra: m.modulos_extra ?? [], modulos_habilitados: m.modulos_habilitados ?? null,
    menu_layout: m.menu_layout ?? null, ordem: m.ordem ?? 0, ativo: p.ativo,
  }
}

export function presetDoSegmento(s: SegmentoRow) {
  return {
    chave: s.chave, nome: s.label, descricao: s.descricao, ativo: s.ativo,
    rotulos: {
      ...(s.label_overrides ?? {}),
      _menu: {
        hidden_hrefs: s.hidden_hrefs ?? [], modulos_habilitados: s.modulos_habilitados,
        modulos_extra: s.modulos_extra ?? [], menu_layout: s.menu_layout, ordem: s.ordem,
      },
    },
  }
}

/**
 * Grava UMA camada do menu da empresa sem tocar na outra (o superadmin não
 * apaga a ordem do dono, o dono não apaga a liberação do superadmin).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function gravarCamadaMenu(db: SupabaseClient<any>, empresaId: number, camada: 'superadmin' | 'dono', valor: unknown) {
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

/**
 * Lê as três tabelas de uma vez. `preset` é `empresas.preset_onboarding`, que o
 * chamador já tem na mão (vem junto com a empresa).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function carregarConfigEmpresa(db: SupabaseClient<any>, empresaId: number, preset: string | null): Promise<ConfigEmpresa> {
  const [{ data: p }, { data: menu }, { data: modulos }] = await Promise.all([
    db.from('presets_onboarding').select('chave, rotulos').eq('chave', preset ?? 'varejo').eq('ativo', true).maybeSingle(),
    db.from('empresa_menu').select('itens').eq('empresa_id', empresaId).maybeSingle(),
    db.from('empresa_modulos').select('modulo, ativo, config').eq('empresa_id', empresaId),
  ])
  const { superadmin, dono } = camadasDoMenu((menu as { itens?: unknown } | null)?.itens)
  const rows = (modulos ?? []) as ModuloRow[]
  return {
    preset,
    presetLido: menuDoPreset(p as PresetRow | null),
    superadmin,
    dono,
    modulos: rows,
    forcados: modulosForcados(rows),
  }
}

/**
 * OS MÓDULOS LIGADOS PARA A EMPRESA — a pergunta que o código novo faz no lugar
 * de "qual é o segmento?" (22/10/2026, zero-segmento no código novo).
 *
 * Endereços ligados pelas camadas de sempre (preset, superadmin, Central de
 * Módulos), a mesma conta do menu e da trava. O preset é lido AQUI, no adaptador
 * de presets_onboarding, e em nenhum outro lugar do código novo.
 */
export function ligadosDaEmpresa(cfg: ConfigEmpresa): Set<string> {
  const { overrides, base, instalados } = camadasParaMenu(cfg)
  return hrefsHabilitados({ overrides, base, instalados })
}

/** A entrada do resolvedor do menu para esta empresa, sem o chamador tocar no preset. */
export function entradaDoMenu(
  cfg: ConfigEmpresa,
  quem: { plano?: string; role: string; isSuperAdmin: boolean },
  permHidden: string[] = [],
): ResolverMenuInput {
  const { overrides, configDono, base, instalados } = camadasParaMenu(cfg, permHidden)
  return { ...quem, overrides, configDono, base, instalados }
}

/**
 * O QUE O CARD DO LEAD MOSTRA ALÉM DO COMUM (23/10/2026).
 *
 * O modal perguntava quem a empresa é e ia buscar no cadastro de presets o
 * rótulo do campo de interesse e os painéis. A resposta é a mesma de antes — sai
 * do molde do preset —, só que perguntada aqui: o modal recebe o perfil pronto.
 * Quando o card ganhar campos personalizados (05, item 1), é esta função que
 * passa a ler `campos_personalizados`, e nenhuma tela muda.
 *
 *   paineis        painéis próprios, na ordem declarada (negócio, match...)
 *   interesse      rótulo do campo "produto" do lead
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

export function perfilDoLead(cfg: Pick<ConfigEmpresa, 'preset'>): PerfilDoLead {
  const m = moldeDoPreset(cfg.preset)
  return {
    paineis: m.paineisDoLead,
    interesse: m.interesseLabel,
    agendaVisitas: !!m.capacidades.agendaVisitas,
    textoLivre: m.paineisDoLead.length > 0,
  }
}

/** Como a empresa chama quem atende ("Corretor" na imobiliária). Padrão "Vendedor". */
export function vocabulario(cfg: Pick<ConfigEmpresa, 'preset'>): { equipe: string } {
  return { equipe: moldeDoPreset(cfg.preset).equipeLabel ?? 'Vendedor' }
}

/**
 * O QUE O MOLDE DO PRESET DIZ QUE A EMPRESA FAZ — para o que ainda não tem módulo
 * próprio (23/10/2026): placa e chassi no estoque, comanda no PDV, vocabulário de
 * clínica na agenda, bloco de veículos nas automações, tela inicial depois do
 * login. O que já tem módulo (Imóveis, Executivo, Cardápio, Agenda) pergunta
 * `ligadosDaEmpresa(cfg).has(href)`, não isto.
 */
export type Capacidades = ReturnType<typeof moldeDoPreset>['capacidades']

export function capacidadesDoPreset(cfg: Pick<ConfigEmpresa, 'preset'>): Capacidades {
  return moldeDoPreset(cfg.preset).capacidades
}
