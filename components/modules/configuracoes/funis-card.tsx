'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Plus, Trash2, Star, SlidersHorizontal } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, Button, Input, Select, Badge, notify } from '@/components/ui'

interface Funil { id: number; nome: string; padrao: boolean }

export function FunisCard() {
  const supabase = createClient()
  const [empresaId, setEmpresaId] = useState<number | null>(null)
  const [funis, setFunis] = useState<Funil[]>([])
  const [novoNome, setNovoNome] = useState('')
  const [origemId, setOrigemId] = useState<string>('')
  const [criando, setCriando] = useState(false)

  const carregar = useCallback(async (empId: number) => {
    const { data } = await supabase.from('funis').select('id, nome, padrao')
      .eq('empresa_id', empId).order('padrao', { ascending: false }).order('nome')
    setFunis(((data ?? []) as Funil[]))
  }, [supabase])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: vinculo } = await supabase
        .from('empresa_usuarios').select('empresa_id').eq('usuario_id', user.id).eq('ativo', true).single()
      if (!vinculo) return
      setEmpresaId(vinculo.empresa_id)
      await carregar(vinculo.empresa_id)
    })()
  }, [supabase, carregar])

  async function chamar(method: string, body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch('/api/funis', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) { const j = await res.json().catch(() => ({})); notify.bad('Erro', j.error); return false }
    return true
  }

  async function criar() {
    if (!novoNome.trim()) { notify.bad('Informe o nome do funil'); return }
    setCriando(true)
    const ok = await chamar('POST', { nome: novoNome.trim(), origemFunilId: origemId ? Number(origemId) : undefined })
    setCriando(false)
    if (ok && empresaId) { notify.ok('Funil criado'); setNovoNome(''); setOrigemId(''); await carregar(empresaId) }
  }
  async function renomear(id: number, nome: string) {
    if (!nome.trim()) return
    await chamar('PATCH', { id, nome: nome.trim() })
  }
  async function definirPadrao(id: number) {
    const ok = await chamar('PATCH', { id, padrao: true })
    if (ok && empresaId) { notify.ok('Funil padrão atualizado'); await carregar(empresaId) }
  }
  async function excluir(id: number) {
    const ok = await chamar('DELETE', { id })
    if (ok && empresaId) { notify.ok('Funil excluído'); await carregar(empresaId) }
  }

  return (
    <div className="space-y-5">
      <Card title="Novo funil">
        <p className="-mt-0.5 mb-4 text-[12.5px] text-ink-2">
          Crie funis paralelos (ex.: Vendas e Locação, Novos e Seminovos). As etapas são copiadas de um funil
          existente — depois você edita cada uma em <strong className="text-ink">Editar etapas</strong>.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Nome do funil" value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Ex.: Locação" />
          <Select label="Copiar etapas de" value={origemId} onChange={e => setOrigemId(e.target.value)}>
            <option value="">Funil padrão</option>
            {funis.map(f => <option key={f.id} value={String(f.id)}>{f.nome}</option>)}
          </Select>
        </div>
        <div className="mt-4">
          <Button onClick={criar} loading={criando} icon={<Plus size={15} strokeWidth={1.7} />}>Criar funil</Button>
        </div>
      </Card>

      <Card title={`Funis (${funis.length})`} flush>
        <div className="divide-y divide-line-soft">
          {funis.map(f => (
            <div key={f.id} className="flex items-center gap-2 px-4 py-2.5">
              <Input wrapperClassName="flex-1" defaultValue={f.nome} onBlur={e => renomear(f.id, e.target.value)} />
              {f.padrao
                ? <Badge tone="ok" dot>Padrão</Badge>
                : <Button variant="ghost" size="sm" icon={<Star size={14} strokeWidth={1.7} />} onClick={() => definirPadrao(f.id)}>Definir padrão</Button>}
              <Link
                href={`/funil?funil=${f.id}`}
                className="inline-flex items-center gap-1.5 rounded-control border border-line px-2.5 py-1.5 text-[12.5px] font-semibold text-ink-2 transition-colors hover:text-ink"
              >
                <SlidersHorizontal size={14} strokeWidth={1.7} /> Editar etapas
              </Link>
              {!f.padrao && (
                <Button variant="ghost" size="sm" icon={<Trash2 size={14} strokeWidth={1.7} />} className="text-bad hover:bg-bad/10" onClick={() => excluir(f.id)}>
                  <span className="sr-only">Excluir</span>
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
