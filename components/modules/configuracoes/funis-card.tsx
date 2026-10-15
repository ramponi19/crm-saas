'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Plus, Trash2, Star, SlidersHorizontal, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { empresaAtualId } from '@/lib/empresa-atual'
import { Card, Button, Input, Select, Badge, notify } from '@/components/ui'

interface Funil { id: number; nome: string; padrao: boolean; interno: boolean }

export function FunisCard() {
  const supabase = createClient()
  const [empresaId, setEmpresaId] = useState<number | null>(null)
  const [funis, setFunis] = useState<Funil[]>([])
  const [novoNome, setNovoNome] = useState('')
  const [origemId, setOrigemId] = useState<string>('')
  const [criando, setCriando] = useState(false)

  const carregar = useCallback(async (empId: number) => {
    const { data } = await supabase.from('funis').select('id, nome, padrao, interno')
      .eq('empresa_id', empId).order('padrao', { ascending: false }).order('nome')
    setFunis(((data ?? []) as Funil[]))
  }, [supabase])

  useEffect(() => {
    (async () => {
      const id = await empresaAtualId(supabase)
      if (!id) return
      setEmpresaId(id)
      await carregar(id)
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
  /**
   * FUNIL INTERNO (15/10/2026): as conversas da equipe — vendedor falando com a
   * loja, as contas da própria empresa — ficam fora das métricas e das análises
   * do ZapIntel. Antes não havia como dizer isso ao sistema, e elas entravam no
   * tempo de resposta e no robô de análises como se fossem clientes.
   */
  async function alternarInterno(f: Funil) {
    const ok = await chamar('PATCH', { id: f.id, interno: !f.interno })
    if (ok && empresaId) {
      notify.ok(f.interno ? 'O funil voltou a contar nas métricas' : 'Funil marcado como interno')
      await carregar(empresaId)
    }
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
        <p className="-mt-2 mb-4 text-[12.5px] text-ink-2">
          Para conversas da própria equipe, crie um funil (ex.: <strong className="text-ink">Equipe</strong>) e marque-o como
          <strong className="text-ink"> interno</strong>: o que estiver nele fica fora das métricas e das análises do ZapIntel.
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
                : !f.interno && <Button variant="ghost" size="sm" icon={<Star size={14} strokeWidth={1.7} />} onClick={() => definirPadrao(f.id)}>Definir padrão</Button>}
              {/* O padrão recebe os leads novos: nunca pode ser interno. */}
              {!f.padrao && (
                <Button variant={f.interno ? 'outline' : 'ghost'} size="sm" icon={<Users size={14} strokeWidth={1.7} />}
                  onClick={() => alternarInterno(f)}
                  title={f.interno ? 'Fora das métricas do ZapIntel — clique para voltar a contar' : 'Conversas da equipe: tirar das métricas do ZapIntel'}>
                  {f.interno ? 'Interno' : 'Marcar como interno'}
                </Button>
              )}
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
