'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { empresaAtualId } from '@/lib/empresa-atual'
import { Card, Button, Input, Select, Badge, notify } from '@/components/ui'
import type { Json } from '@/types/database'

interface Automacao {
  id: number
  etapa_slug: string | null
  gatilho: string
  horas: number | null
  acao: string
  config: Record<string, unknown> | null
  ativo: boolean
}
interface Etapa { slug: string; label: string; tipo: string | null }

const TEMPLATES = [
  { chave: 'boas_vindas', label: 'Boas-vindas' },
  { chave: 'confirmacao_visita', label: 'Confirmação de visita' },
  { chave: 'cobranca', label: 'Cobrança' },
  { chave: 'followup', label: 'Follow-up' },
  { chave: 'agradecimento', label: 'Pós-venda' },
]

const ACAO_LABEL: Record<string, string> = {
  criar_tarefa: 'criar tarefa',
  enviar_whatsapp_template: 'preparar WhatsApp',
  notificar_gestor: 'notificar gestor',
}

export function AutomacoesCard() {
  const supabase = createClient()
  const [empresaId, setEmpresaId] = useState<number | null>(null)
  const [segmento, setSegmento] = useState<string | null>(null)
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [lista, setLista] = useState<Automacao[]>([])
  const [salvando, setSalvando] = useState(false)

  // form
  const [gatilho, setGatilho] = useState('entrou_na_etapa')
  const [etapaSlug, setEtapaSlug] = useState('')
  const [horas, setHoras] = useState('48')
  const [acao, setAcao] = useState('criar_tarefa')
  const [titulo, setTitulo] = useState('')
  const [prazoDias, setPrazoDias] = useState('0')
  const [templateChave, setTemplateChave] = useState('boas_vindas')

  const carregar = useCallback(async (empId: number) => {
    const { data } = await supabase
      .from('automacoes').select('id, etapa_slug, gatilho, horas, acao, config, ativo')
      .eq('empresa_id', empId).order('created_at', { ascending: false })
    setLista(((data ?? []) as unknown as Automacao[]))
  }, [supabase])

  useEffect(() => {
    (async () => {
      const id = await empresaAtualId(supabase)
      if (!id) return
      setEmpresaId(id)
      const { data: emp } = await supabase.from('empresas').select('segmento').eq('id', id).maybeSingle()
      setSegmento(emp?.segmento ?? null)
      const { data: et } = await supabase
        .from('funil_etapas').select('slug, label, tipo').eq('empresa_id', id).eq('ativo', true).order('ordem')
      setEtapas(((et ?? []) as Etapa[]))
      await carregar(id)
    })()
  }, [supabase, carregar])

  function etapaLabel(slug: string | null) {
    if (!slug) return 'qualquer etapa'
    return etapas.find(e => e.slug === slug)?.label ?? slug
  }

  function frase(a: Automacao) {
    const quando = a.gatilho === 'parado_x_horas'
      ? `Quando o lead fica ${a.horas ?? 48}h parado em ${etapaLabel(a.etapa_slug)}`
      : `Quando o lead entra em ${etapaLabel(a.etapa_slug)}`
    let oQue = ACAO_LABEL[a.acao] ?? a.acao
    const cfg = a.config ?? {}
    if (a.acao === 'enviar_whatsapp_template' && cfg.template_chave) {
      oQue += ` (${TEMPLATES.find(t => t.chave === cfg.template_chave)?.label ?? cfg.template_chave})`
    } else if (cfg.titulo) {
      oQue += ` "${cfg.titulo as string}"`
    }
    const prazo = Number(cfg.prazo_dias) || 0
    if (a.acao === 'criar_tarefa' && prazo > 0) oQue += ` (daqui a ${prazo} dias)`
    return `${quando} → ${oQue}`
  }

  async function adicionar() {
    if (!empresaId) { notify.bad('Empresa não identificada'); return }
    setSalvando(true)
    try {
      const config: Record<string, unknown> = {}
      if (acao === 'enviar_whatsapp_template') config.template_chave = templateChave
      else if (titulo.trim()) config.titulo = titulo.trim()
      if (acao === 'criar_tarefa' && Number(prazoDias) > 0) config.prazo_dias = Number(prazoDias)
      const { error } = await supabase.from('automacoes').insert({
        empresa_id: empresaId,
        gatilho,
        etapa_slug: etapaSlug || null,
        horas: gatilho === 'parado_x_horas' ? Math.max(1, Number(horas) || 48) : null,
        acao,
        config: config as Json,
        ativo: true,
      })
      if (error) throw new Error(error.message)
      notify.ok('Automação criada')
      setTitulo('')
      setPrazoDias('0')
      await carregar(empresaId)
    } catch (e) {
      notify.bad('Erro ao criar', e instanceof Error ? e.message : undefined)
    } finally {
      setSalvando(false)
    }
  }

  async function toggle(a: Automacao) {
    await supabase.from('automacoes').update({ ativo: !a.ativo }).eq('id', a.id)
    if (empresaId) await carregar(empresaId)
  }
  async function remover(a: Automacao) {
    await supabase.from('automacoes').delete().eq('id', a.id)
    if (empresaId) await carregar(empresaId)
  }

  const ganhoSlug = etapas.find(e => e.tipo === 'ganho')?.slug ?? null

  async function ativarPosVenda() {
    if (!empresaId) { notify.bad('Empresa não identificada'); return }
    if (!ganhoSlug) { notify.warn('Sem etapa de fechamento', 'Marque uma etapa do funil como "ganho" primeiro.'); return }
    setSalvando(true)
    try {
      const regras = [
        { titulo: 'Revisão pós-venda (6 meses)', prazo_dias: 180 },
        { titulo: 'Revisão pós-venda (1 ano)', prazo_dias: 365 },
      ]
      const jaTem = (dias: number) => lista.some(a =>
        a.gatilho === 'entrou_na_etapa' && a.etapa_slug === ganhoSlug && a.acao === 'criar_tarefa' && Number(a.config?.prazo_dias) === dias)
      const novas = regras.filter(r => !jaTem(r.prazo_dias)).map(r => ({
        empresa_id: empresaId, gatilho: 'entrou_na_etapa', etapa_slug: ganhoSlug,
        horas: null, acao: 'criar_tarefa', config: { titulo: r.titulo, prazo_dias: r.prazo_dias } as Json, ativo: true,
      }))
      if (novas.length === 0) { notify.warn('Pós-venda já ativado'); setSalvando(false); return }
      const { error } = await supabase.from('automacoes').insert(novas as never)
      if (error) throw new Error(error.message)
      notify.ok('Pós-venda ativado', 'Tarefas de revisão em 180 e 365 dias após o fechamento.')
      await carregar(empresaId)
    } catch (e) {
      notify.bad('Erro ao ativar', e instanceof Error ? e.message : undefined)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-5">
      {segmento === 'concessionaria' && (
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <Zap size={18} strokeWidth={1.7} className="flex-none text-accent" />
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-ink">Pós-venda automático</div>
              <div className="text-[12.5px] text-ink-2">Ao fechar a venda, cria tarefas de revisão em 180 e 365 dias.</div>
            </div>
            <Button variant="outline" onClick={ativarPosVenda} loading={salvando}>Ativar pós-venda</Button>
          </div>
        </Card>
      )}

      <Card title="Nova automação">
        <p className="-mt-0.5 mb-4 text-[12.5px] text-ink-2">
          Regras que disparam sozinhas. As ações criam <strong className="text-ink">tarefas internas</strong> —
          o WhatsApp vira uma tarefa com a mensagem pronta (não envia sozinho).
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select label="Gatilho" value={gatilho} onChange={e => setGatilho(e.target.value)}>
            <option value="entrou_na_etapa">Quando o lead entra na etapa</option>
            <option value="parado_x_horas">Quando o lead fica parado</option>
          </Select>
          <Select label="Etapa" value={etapaSlug} onChange={e => setEtapaSlug(e.target.value)}>
            <option value="">Qualquer etapa</option>
            {etapas.map(e => <option key={e.slug} value={e.slug}>{e.label}</option>)}
          </Select>
          {gatilho === 'parado_x_horas' && (
            <Input label="Horas parado" type="number" min={1} value={horas} onChange={e => setHoras(e.target.value)} />
          )}
          <Select label="Ação" value={acao} onChange={e => setAcao(e.target.value)}>
            <option value="criar_tarefa">Criar tarefa</option>
            <option value="enviar_whatsapp_template">Preparar WhatsApp (tarefa)</option>
            <option value="notificar_gestor">Notificar gestor</option>
          </Select>
          {acao === 'enviar_whatsapp_template' ? (
            <Select label="Modelo de mensagem" value={templateChave} onChange={e => setTemplateChave(e.target.value)}>
              {TEMPLATES.map(t => <option key={t.chave} value={t.chave}>{t.label}</option>)}
            </Select>
          ) : (
            <Input label="Título da tarefa (opcional)" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex.: Responder o lead" />
          )}
          {acao === 'criar_tarefa' && (
            <Input label="Prazo (dias)" type="number" min={0} value={prazoDias} onChange={e => setPrazoDias(e.target.value)}
              hint="0 = hoje · pós-venda: 180 / 365" />
          )}
        </div>
        <div className="mt-4">
          <Button onClick={adicionar} loading={salvando} icon={<Plus size={15} strokeWidth={1.7} />}>Adicionar automação</Button>
        </div>
      </Card>

      <Card title={`Automações ativas (${lista.filter(a => a.ativo).length})`} flush>
        {lista.length === 0 ? (
          <p className="p-6 text-[13px] text-ink-3">Nenhuma automação. Crie a primeira acima.</p>
        ) : (
          <div className="divide-y divide-line-soft">
            {lista.map(a => (
              <div key={a.id} className={`flex items-center gap-3 px-4 py-3 ${!a.ativo ? 'opacity-55' : ''}`}>
                <Zap size={15} strokeWidth={1.7} className="flex-none text-accent" />
                <span className="min-w-0 flex-1 text-[13px] text-ink">{frase(a)}</span>
                {!a.ativo && <Badge tone="neutro">inativa</Badge>}
                <Button variant="ghost" size="sm" onClick={() => toggle(a)}>{a.ativo ? 'Desativar' : 'Ativar'}</Button>
                <Button variant="ghost" size="sm" icon={<Trash2 size={14} strokeWidth={1.7} />} className="text-bad hover:bg-bad/10" onClick={() => remover(a)}>
                  <span className="sr-only">Remover</span>
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
