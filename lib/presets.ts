import type { SupabaseClient } from '@supabase/supabase-js'
import { gravarCamadaMenu, type BaseGravada, type Vocabulario } from '@/lib/empresa-config'
import { MODULOS } from '@/core/modulos'
import type { Json } from '@/types/database'

/**
 * O PRESET DE ONBOARDING — lido só no cadastro (/register) e nas ferramentas de
 * preset do superadmin (tela de Presets, preview, laboratório). 29/10/2026.
 *
 * Até aqui o app lia `presets_onboarding` a cada request para montar o menu, a
 * trava de rota e o que cada tela mostrava, e por baixo ainda havia o molde
 * estático por vertical. Agora o preset é a FICHA DE PARTIDA: no cadastro ela é
 * copiada para a empresa (empresa_menu.itens.base, empresa_modulos, campos,
 * funil, motivos de perda) e, dali em diante, a empresa é dona do que tem.
 *
 *   rotulos              rótulos do menu por href
 *   rotulos._menu        habilitados, extras, ordem, ocultos e a tela inicial
 *   rotulos._vocabulario como a empresa chama as coisas (interesse, equipe, Agenda)
 *   etapas               o funil de partida
 *   campos               campos personalizados de partida (veículos: placa do item)
 *   motivos_perda        motivos de perda de partida
 */

interface MenuDoPreset {
  hidden_hrefs?: string[] | null
  modulos_habilitados?: string[] | null
  modulos_extra?: { href: string; label: string; icon: string; grupo?: string }[] | null
  menu_layout?: Record<string, string[]> | null
  tela_inicial?: string | null
  ordem?: number
}

/**
 * A base da empresa a partir da linha do preset — o mesmo mapeamento do SQL que
 * gravou a base das empresas existentes (20261029000100_presets_completos.sql).
 */
export function baseDoPreset(rotulos: Record<string, unknown> | null | undefined): BaseGravada {
  const { _menu, _vocabulario, ...labels } = (rotulos ?? {}) as Record<string, unknown> & {
    _menu?: MenuDoPreset; _vocabulario?: Vocabulario
  }
  const m = _menu ?? {}
  return {
    habilitados: m.modulos_habilitados ?? undefined,
    labels: labels as Record<string, string>,
    extras: m.modulos_extra ?? [],
    layout: m.menu_layout ?? {},
    tela_inicial: m.tela_inicial ?? null,
    vocabulario: _vocabulario ?? {},
  }
}

/**
 * A linha que a tela de presets do superadmin edita (o formato que ela sempre
 * editou), lida de e gravada em presets_onboarding.
 */
export interface PresetEditavel {
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
  /** Tela inicial e vocabulário do preset (29/10/2026): a tela não edita, mas salvar conserva. */
  tela_inicial?: string | null
  vocabulario?: Vocabulario | null
}

export function editavelDoPreset(p: { chave: string; nome: string; descricao: string | null; rotulos: Record<string, unknown> | null; ativo: boolean }): PresetEditavel {
  const { _menu, _vocabulario, ...labels } = (p.rotulos ?? {}) as Record<string, unknown> & { _menu?: MenuDoPreset; _vocabulario?: Vocabulario }
  const m = _menu ?? {}
  return {
    chave: p.chave, label: p.nome, descricao: p.descricao,
    hidden_hrefs: m.hidden_hrefs ?? [], label_overrides: labels as Record<string, string>,
    modulos_extra: m.modulos_extra ?? [], modulos_habilitados: m.modulos_habilitados ?? null,
    menu_layout: m.menu_layout ?? null, ordem: m.ordem ?? 0, ativo: p.ativo,
    tela_inicial: m.tela_inicial ?? null, vocabulario: _vocabulario ?? null,
  }
}

export function presetDoEditavel(s: PresetEditavel) {
  return {
    chave: s.chave, nome: s.label, descricao: s.descricao, ativo: s.ativo,
    rotulos: {
      ...(s.label_overrides ?? {}),
      _menu: {
        hidden_hrefs: s.hidden_hrefs ?? [], modulos_habilitados: s.modulos_habilitados,
        modulos_extra: s.modulos_extra ?? [], menu_layout: s.menu_layout, ordem: s.ordem,
        ...(s.tela_inicial ? { tela_inicial: s.tela_inicial } : {}),
      },
      ...(s.vocabulario ? { _vocabulario: s.vocabulario as Json } : {}),
    },
  }
}

/** A linha inteira do preset, como o cadastro usa. */
export interface PresetCompleto {
  chave: string
  nome: string
  rotulos: Record<string, unknown> | null
  etapas: { id: string; label: string; color?: string; tipo?: string }[] | null
  campos: { entidade: string; chave: string; rotulo: string; tipo: string; modulo_dono?: string | null }[] | null
  motivos_perda: string[] | null
}

/** Preset que vale quando a escolha não existe (ou está desativada). */
export const PRESET_PADRAO = 'varejo'

/** Os presets ativos, na ordem do cadastro, para os botões do /register. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function lerPresets(db: SupabaseClient<any>): Promise<{ chave: string; nome: string }[]> {
  const { data } = await db.from('presets_onboarding').select('chave, nome, rotulos').eq('ativo', true)
  return ((data ?? []) as { chave: string; nome: string; rotulos: { _menu?: MenuDoPreset } | null }[])
    .map((p) => ({ chave: p.chave, nome: p.nome, ordem: p.rotulos?._menu?.ordem ?? 0 }))
    .sort((a, b) => a.ordem - b.ordem || a.chave.localeCompare(b.chave))
    .map(({ chave, nome }) => ({ chave, nome }))
}

/** A linha do preset escolhido; escolha desconhecida ou desativada = o padrão. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function lerPreset(db: SupabaseClient<any>, chave: string | null | undefined): Promise<PresetCompleto | null> {
  const campos = 'chave, nome, rotulos, etapas, campos, motivos_perda'
  if (chave) {
    const { data } = await db.from('presets_onboarding').select(campos).eq('chave', chave).eq('ativo', true).maybeSingle()
    if (data) return data as PresetCompleto
  }
  const { data } = await db.from('presets_onboarding').select(campos).eq('chave', PRESET_PADRAO).maybeSingle()
  return (data as PresetCompleto | null) ?? null
}

/** Probabilidade de fechamento por tipo de etapa (a mesma conta de /api/funil). */
const PROB_POR_TIPO: Record<string, number> = { ganho: 100, perdido: 0, negociacao: 60, normal: 25 }

/**
 * COPIA O PRESET PARA A EMPRESA — no cadastro (empresa nova) e no preview do
 * superadmin (a empresa de demonstração, com `substituir`).
 *
 *   empresa_menu.itens.base  base do menu, tela inicial e vocabulário (obrigatório:
 *                            sem ele o menu da empresa cai para o núcleo)
 *   empresa_modulos          os módulos do manifesto que a base liga
 *   campos_personalizados    os campos de partida (veículos: placa do item)
 *   funis + funil_etapas     o funil de partida, como funil padrão (se não houver)
 *   motivos_perda            os motivos de partida (se não houver)
 *
 * `substituir` (só o preview): antes de gravar, tira os módulos do manifesto e
 * os campos de módulo (modulo_dono preenchido) que o preset anterior deixou —
 * senão prever a imobiliária depois da loja de veículos mostraria as duas.
 *
 * Devolve o erro da base (o cadastro desfaz tudo se ela falhar); os demais só
 * vão para o log — a loja consegue cadastrar à mão depois, e derrubar o cadastro
 * por uma lista de apoio seria pior.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function aplicarPreset(db: SupabaseClient<any>, empresaId: number, preset: PresetCompleto, { substituir = false } = {}): Promise<{ error: string | null }> {
  const base = baseDoPreset(preset.rotulos)
  const { error: errBase } = await gravarCamadaMenu(db, empresaId, 'base', base)
  if (errBase) return { error: `base do menu: ${errBase.message}` }

  const avisar = (onde: string, e: { message: string } | null) => { if (e) console.error(`[preset] ${onde}:`, e.message) }

  if (substituir) {
    const doManifesto = MODULOS.filter((m) => !m.addon).map((m) => m.chave)
    avisar('limpar módulos', (await db.from('empresa_modulos').delete().eq('empresa_id', empresaId).in('modulo', doManifesto)).error)
    avisar('limpar campos', (await db.from('campos_personalizados').delete().eq('empresa_id', empresaId).not('modulo_dono', 'is', null)).error)
  }

  const ligados = new Set(base.habilitados ?? [])
  const modulos = MODULOS.filter((m) => ligados.has(m.href)).map((m) => ({ empresa_id: empresaId, modulo: m.chave, origem: 'plano', ativo: true }))
  if (modulos.length) {
    const { error } = await db.from('empresa_modulos').upsert(modulos, { onConflict: 'empresa_id,modulo', ignoreDuplicates: true })
    avisar('módulos', error)
  }

  const campos = (preset.campos ?? []).map((c, i) => ({
    empresa_id: empresaId, entidade: c.entidade, chave: c.chave, rotulo: c.rotulo, tipo: c.tipo,
    modulo_dono: c.modulo_dono ?? null, ordem: i, ativo: true,
  }))
  if (campos.length) {
    const { error } = await db.from('campos_personalizados').upsert(campos, { onConflict: 'empresa_id,entidade,chave', ignoreDuplicates: true })
    avisar('campos', error)
  }

  const etapas = preset.etapas ?? []
  const { count: funisJa } = await db.from('funis').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId)
  if (etapas.length && !funisJa) {
    const { data: funil, error } = await db.from('funis').insert({ empresa_id: empresaId, nome: 'Funil principal', padrao: true }).select('id').single()
    avisar('funil', error)
    if (funil) {
      const { error: errEt } = await db.from('funil_etapas').insert(etapas.map((e, i) => {
        const tipo = e.tipo ?? 'normal'
        return { empresa_id: empresaId, funil_id: funil.id, slug: e.id, label: e.label, cor: e.color ?? '#9199A3', tipo, ordem: i, ativo: true, probabilidade: PROB_POR_TIPO[tipo] ?? 25 }
      }))
      avisar('etapas', errEt)
    }
  }

  const motivos = preset.motivos_perda ?? []
  const { count: motivosJa } = await db.from('motivos_perda').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId)
  if (motivos.length && !motivosJa) {
    const { error } = await db.from('motivos_perda').insert(motivos.map((label, i) => ({ empresa_id: empresaId, label, ordem: i, ativo: true })))
    avisar('motivos de perda', error)
  }
  return { error: null }
}

/** A linha do preset pela chave, ativo ou não (o preview do superadmin mostra qualquer um). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function lerPresetParaPreview(db: SupabaseClient<any>, chave: string): Promise<PresetCompleto | null> {
  const { data } = await db.from('presets_onboarding').select('chave, nome, rotulos, etapas, campos, motivos_perda').eq('chave', chave).maybeSingle()
  return (data as PresetCompleto | null) ?? null
}
