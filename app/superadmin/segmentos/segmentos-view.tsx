'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Eye } from 'lucide-react'
import { Card, Button, IconButton, Input, Modal, Badge, notify } from '@/components/ui'
import { CATALOGO, resolverMenuPlano } from '@/lib/menu'
import { normalizarSegmento } from '@/lib/segmentos'
import { MenuOrdenavel, type LayoutMenu } from '@/components/layout/menu-ordenavel'

export interface SegmentoRow {
  chave: string
  label: string
  descricao: string | null
  hidden_hrefs: unknown
  label_overrides: unknown
  modulos_extra: unknown
  modulos_habilitados: unknown
  menu_layout: unknown
  ordem: number
  ativo: boolean
}

const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : [])
const obj = (v: unknown): Record<string, string> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {})
const layoutDe = (v: unknown): LayoutMenu => (v && typeof v === 'object' && !Array.isArray(v) ? (v as LayoutMenu) : {})

// Núcleo: sempre ligado (não dá pra desmarcar). Espelha o NUCLEO de lib/menu.
const TRAVADOS = new Set(['/dashboard', '/leads', '/clientes'])

interface FormState {
  novo: boolean; chave: string; label: string; descricao: string; ordem: string; ativo: boolean
  habilitados: string[]                 // hrefs ligados (opt-in)
  labels: Record<string, string>        // href -> novo nome
  menu_layout: LayoutMenu               // ordem: grupo -> hrefs (+ __grupos)
  extras: { href: string; label: string; icon: string }[]  // só para o preview da ordem
}

function fromRow(s: SegmentoRow): FormState {
  return {
    novo: false, chave: s.chave, label: s.label, descricao: s.descricao ?? '', ordem: String(s.ordem), ativo: s.ativo,
    habilitados: arr(s.modulos_habilitados), labels: obj(s.label_overrides),
    menu_layout: layoutDe(s.menu_layout),
    extras: Array.isArray(s.modulos_extra) ? (s.modulos_extra as FormState['extras']) : [],
  }
}
const EMPTY: FormState = { novo: true, chave: '', label: '', descricao: '', ordem: '99', ativo: true, habilitados: [], labels: {}, menu_layout: {}, extras: [] }

export function SegmentosView({ initial }: { initial: SegmentoRow[] }) {
  const router = useRouter()
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState<string | null>(null)
  const set = (k: keyof FormState, v: string | boolean) => setForm((f) => (f ? { ...f, [k]: v } : f))

  async function preview(chave: string) {
    setPreviewing(chave)
    try {
      const res = await fetch(`/api/superadmin/segmentos/${chave}/preview`, { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Falha ao abrir o preview')
      // Recarga INTEIRA de propósito: entrar no preview de outro segmento troca o
      // contexto do tenant, e `router.push` manteria cache e estado do anterior.
      // eslint-disable-next-line react-hooks/immutability, @next/next/no-location-assign-relative-destination
      window.location.href = '/dashboard'
    } catch (e) {
      notify.bad('Não foi possível abrir o preview', e instanceof Error ? e.message : undefined)
      setPreviewing(null)
    }
  }

  const ligado = (href: string) => TRAVADOS.has(href) || !!form?.habilitados.includes(href)
  function toggle(href: string) {
    if (TRAVADOS.has(href)) return
    setForm((f) => {
      if (!f) return f
      const habilitados = f.habilitados.includes(href) ? f.habilitados.filter((h) => h !== href) : [...f.habilitados, href]
      return { ...f, habilitados }
    })
  }
  function renomear(href: string, valor: string) {
    setForm((f) => {
      if (!f) return f
      const labels = { ...f.labels }
      if (valor.trim()) labels[href] = valor.trim(); else delete labels[href]
      return { ...f, labels }
    })
  }

  /**
   * O MENU DESTE SEGMENTO, resolvido aqui na tela.
   *
   * Usa o MESMO `resolverMenu` que o CRM usa, alimentado com o formulário em
   * edição — então a lista que se arrasta é o menu que o segmento vai gerar, e não
   * uma cópia da lista de checkboxes que precisa ser conferida de cabeça.
   *
   * `modulosExtra` só entra quando existe: lista vazia significa "não configurado"
   * e deixa o código valer, exatamente como a engine faz.
   */
  const menuDoSegmento = form
    ? resolverMenuPlano({
        segmento: normalizarSegmento(form.chave),
        role: 'owner',
        isSuperAdmin: false,
        segOverride: {
          habilitados: Array.from(new Set([...TRAVADOS, ...form.habilitados])),
          labelOverrides: form.labels,
          modulosExtra: form.extras.length ? form.extras : undefined,
          menuLayout: form.menu_layout,
        },
      })
    : []

  async function salvar() {
    if (!form) return
    if (!form.label.trim()) { notify.warn('Informe o label'); return }
    setSaving(true)
    try {
      // Núcleo sempre incluído nos habilitados.
      const habilitados = Array.from(new Set([...TRAVADOS, ...form.habilitados]))
      const res = await fetch('/api/superadmin/segmentos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novo: form.novo, chave: form.chave, label: form.label, descricao: form.descricao,
          ordem: Number(form.ordem) || 0, ativo: form.ativo,
          label_overrides: form.labels,
          modulos_habilitados: habilitados,
          menu_layout: form.menu_layout,
        }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? 'Falha ao salvar') }
      notify.ok('Segmento salvo')
      setForm(null)
      router.refresh()
    } catch (e) {
      notify.bad('Não foi possível salvar', e instanceof Error ? e.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-[900px] px-4 py-4 sm:px-8 sm:py-7">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold tracking-[-0.03em] text-ink">Segmentos</h1>
          <p className="mt-0.5 text-[13px] text-ink-2">Crie e edite verticais sem deploy — menu por caixa de seleção, labels, funil e ordem.</p>
        </div>
        <Button icon={<Plus size={15} strokeWidth={1.7} />} className="!bg-[#6D28D9] hover:!bg-[#6D28D9]/90" onClick={() => setForm(EMPTY)}>Novo segmento</Button>
      </div>

      <Card flush>
        <div className="divide-y divide-line-soft">
          {initial.map((s) => (
            <div key={s.chave} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] font-semibold text-ink">{s.label}</span>
                  <span className="num text-[11px] text-ink-3">{s.chave}</span>
                  {!s.ativo && <Badge tone="neutro">inativo</Badge>}
                </div>
                <div className="mt-0.5 text-[11.5px] text-ink-3">{arr(s.modulos_habilitados).length} módulos ligados · {Object.keys(obj(s.label_overrides)).length} rótulos trocados</div>
              </div>
              <IconButton aria-label="Prever CRM deste segmento" onClick={() => preview(s.chave)} disabled={previewing !== null}>
                <Eye size={15} strokeWidth={1.7} className={previewing === s.chave ? 'animate-pulse' : ''} />
              </IconButton>
              <IconButton aria-label="Editar" onClick={() => setForm(fromRow(s))}><Pencil size={15} strokeWidth={1.7} /></IconButton>
            </div>
          ))}
        </div>
      </Card>

      {form && (
        <Modal
          open
          onClose={() => setForm(null)}
          size="lg"
          title={form.novo ? 'Novo segmento' : `Editar · ${form.label}`}
          footer={<><Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button><Button className="!bg-[#6D28D9] hover:!bg-[#6D28D9]/90" onClick={salvar} loading={saving}>Salvar</Button></>}
        >
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Label" value={form.label} onChange={(e) => set('label', e.target.value)} />
              <Input label="Chave" value={form.chave} onChange={(e) => set('chave', e.target.value)} disabled={!form.novo} hint={form.novo ? 'gerada do label se vazia' : 'não editável'} />
              <Input wrapperClassName="col-span-2" label="Descrição" value={form.descricao} onChange={(e) => set('descricao', e.target.value)} />
            </div>

            {/* Menu do CRM por caixa de seleção (opt-in) */}
            <div>
              <div className="mb-1 text-[12.5px] font-semibold text-ink">Menu do CRM</div>
              <p className="mb-3 text-[11.5px] text-ink-3">Ligue os módulos que aparecem neste segmento. Módulos novos nascem desligados. Renomeie ao lado (opcional).</p>
              <div className="space-y-4 rounded-card border border-line-soft p-3">
                {CATALOGO.map((grupo) => (
                  <div key={grupo.label}>
                    <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">{grupo.label}</div>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {grupo.items.map((it) => {
                        const travado = TRAVADOS.has(it.href)
                        const on = ligado(it.href)
                        return (
                          <div key={it.href} className="flex items-center gap-2">
                            <label className={`flex min-w-0 flex-1 items-center gap-2 rounded-control border px-2.5 py-1.5 text-[12.5px] ${on ? 'border-line bg-card text-ink' : 'border-line-soft bg-bg text-ink-3'} ${travado ? 'opacity-70' : 'cursor-pointer'}`}>
                              <input type="checkbox" checked={on} disabled={travado} onChange={() => toggle(it.href)} className="h-3.5 w-3.5 accent-[#6D28D9]" />
                              <span className="truncate">{it.label}</span>
                              {travado && <span className="ml-auto text-[9.5px] text-ink-3">fixo</span>}
                              {it.opcional && !travado && <span className="ml-auto text-[9.5px] text-ink-3">opcional</span>}
                            </label>
                            <input
                              value={form.labels[it.href] ?? ''}
                              onChange={(e) => renomear(it.href, e.target.value)}
                              placeholder="renomear"
                              disabled={!on}
                              className="h-8 w-[92px] flex-none rounded-control border border-line bg-card px-2 text-[11.5px] text-ink placeholder:text-ink-3 outline-none focus:border-accent disabled:opacity-40"
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ordem do menu — arrastando */}
            <div>
              <div className="mb-1 text-[12.5px] font-semibold text-ink">Ordem do menu</div>
              <p className="mb-3 text-[11.5px] text-ink-3">
                Arraste pela alça para mudar a sequência do menu. Vale para toda empresa deste
                segmento; cada dono ainda pode reordenar o dele em Administração → Meu menu.
              </p>
              {/*
                `key` pela lista de hrefs: ligar ou desligar um módulo acima remonta
                esta parte. Sem isso, o item recém-ligado não aparecia para ordenar —
                o estado interno do arrastável nasce da lista e não se atualizava.
              */}
              <MenuOrdenavel
                key={menuDoSegmento.map((i) => i.href).join('|')}
                itens={menuDoSegmento.map((i) => ({ href: i.href, label: i.label, icon: i.icon }))}
                onChange={(menu_layout) => setForm((f) => (f ? { ...f, menu_layout } : f))}
              />
            </div>

            {/*
              O FUNIL SAIU DAQUI (19/08/2026).
              Este bloco editava um campo de funil no proprio segmento, que NADA no
              sistema lia — nem para empresa nova. O dono editou, a tela disse
              "salvo", e o funil da imobiliária continuou igual, porque o funil de
              uma empresa são as linhas de `funil_etapas` dela. Campo que promete e
              não cumpre é pior que campo ausente: quem edita acredita.
              Funil se edita por empresa, em Administração → Funil.
            */}

            <div className="grid grid-cols-2 gap-4">
              <Input label="Ordem do segmento" className="num" value={form.ordem} onChange={(e) => set('ordem', e.target.value.replace(/[^0-9]/g, ''))} />
              <label className="flex items-center gap-2 pt-6 text-[13px] text-ink">
                <input type="checkbox" checked={form.ativo} onChange={(e) => set('ativo', e.target.checked)} className="h-4 w-4 accent-[#6D28D9]" /> Ativo
              </label>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
