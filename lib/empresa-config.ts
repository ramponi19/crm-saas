import type { SupabaseClient } from '@supabase/supabase-js'
import type { MenuConfigDono, MenuOverrideRow, MenuOverridesSuperadmin, SegOverride } from '@/lib/menu'
import type { ModuloPlano } from '@/lib/plano'

/**
 * A CONFIGURAÇÃO DA EMPRESA SAI DAS TABELAS DO CORE, NUM LUGAR SÓ.
 *
 * Até 21/10/2026 o menu e a trava de rota liam `segmentos_config` e três colunas
 * de `empresas` (`menu_override`, `menu_config`, `modulos_override`). O core v1
 * já tinha as tabelas certas desde o corte — `presets_onboarding`,
 * `empresa_menu`, `empresa_modulos` —, mas ninguém lia nem gravava nelas: o
 * que o superadmin e o dono mudavam depois de 20/10 ia só para o legado.
 *
 * O formato que o menu recebe NÃO muda (SegOverride, MenuOverrideRow,
 * MenuConfigDono): troca a fonte, a tela fica igual. Os mapeamentos são puros e
 * exportados para o teste que compara o menu antes e depois
 * (scripts/comparar-menu.mts).
 *
 *   presets_onboarding.rotulos      rótulos do segmento + `_menu` com as quatro listas
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

/** A camada do segmento, no formato que o menu sempre recebeu de segmentos_config. */
export function segOverrideDoPreset(p: PresetRow | null | undefined): SegOverride | undefined {
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

/** Módulo ligado para a empresa: linha ativa em empresa_modulos. */
export function moduloLigado(rows: ModuloRow[] | null | undefined, modulo: string): boolean {
  return (rows ?? []).some((r) => r.modulo === modulo && r.ativo)
}

export interface ConfigEmpresa {
  preset: string | null
  segOverride: SegOverride | undefined
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
export function camadasParaMenu(cfg: Pick<ConfigEmpresa, 'segOverride' | 'superadmin' | 'dono' | 'forcados'>, permHidden: string[] = []) {
  const mo = cfg.superadmin
  return {
    overrides: {
      modulos: cfg.forcados,
      hidden: [...(mo?.hidden ?? []), ...permHidden],
      labels: mo?.labels,
      habilitados: mo?.habilitados,
    } satisfies MenuOverridesSuperadmin,
    configDono: cfg.dono,
    segOverride: cfg.segOverride,
    /** Mesma precedência do menu: segmento, superadmin, dono. */
    rotulos: { ...(cfg.segOverride?.labelOverrides ?? {}), ...(mo?.labels ?? {}), ...(cfg.dono?.labels ?? {}) } as Record<string, string>,
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
    segOverride: segOverrideDoPreset(p as PresetRow | null),
    superadmin,
    dono,
    modulos: rows,
    forcados: modulosForcados(rows),
  }
}
