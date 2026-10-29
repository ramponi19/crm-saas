import type { BaseGravada, Vocabulario } from '@/lib/empresa-config'
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
