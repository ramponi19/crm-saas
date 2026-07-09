'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Gift, Plus, Trash2 } from 'lucide-react'
import { Card, Button, Input, Select, Badge, notify } from '@/components/ui'

interface Campanha { id: number; nome: string; gatilho: string; dias: number | null; titulo: string | null; ativo: boolean }

const GATILHOS: Record<string, string> = {
  aniversario_compra: 'Após a compra (recompra/revisão)',
  retorno_consulta: 'Após a consulta (retorno)',
  aniversario_cliente: 'Aniversário do cliente',
}

export function FidelidadeCard() {
  const supabase = createClient()
  const [empresaId, setEmpresaId] = useState<number | null>(null)
  const [lista, setLista] = useState<Campanha[]>([])
  const [salvando, setSalvando] = useState(false)
  const [gatilho, setGatilho] = useState('aniversario_compra')
  const [nome, setNome] = useState('')
  const [dias, setDias] = useState('180')
  const [titulo, setTitulo] = useState('')

  const carregar = useCallback(async (empId: number) => {
    const { data } = await supabase.from('campanhas_fidelidade').select('id, nome, gatilho, dias, titulo, ativo').eq('empresa_id', empId).order('created_at', { ascending: false })
    setLista((data ?? []) as Campanha[])
  }, [supabase])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: v } = await supabase.from('empresa_usuarios').select('empresa_id').eq('usuario_id', user.id).eq('ativo', true).single()
      if (!v) return
      setEmpresaId(v.empresa_id); await carregar(v.empresa_id)
    })()
  }, [supabase, carregar])

  const usaDias = gatilho !== 'aniversario_cliente'

  async function adicionar() {
    if (!empresaId) return
    if (!nome.trim()) { notify.warn('Dê um nome à campanha'); return }
    setSalvando(true)
    const { error } = await supabase.from('campanhas_fidelidade').insert({
      empresa_id: empresaId, nome: nome.trim(), gatilho,
      dias: usaDias ? Math.max(1, Number(dias) || 0) : null,
      titulo: titulo.trim() || null, ativo: true,
    })
    setSalvando(false)
    if (error) { notify.bad('Erro ao criar', error.message); return }
    notify.ok('Campanha criada'); setNome(''); setTitulo('')
    carregar(empresaId)
  }
  async function toggle(c: Campanha) {
    await supabase.from('campanhas_fidelidade').update({ ativo: !c.ativo }).eq('id', c.id)
    if (empresaId) carregar(empresaId)
  }
  async function remover(c: Campanha) {
    await supabase.from('campanhas_fidelidade').delete().eq('id', c.id)
    if (empresaId) carregar(empresaId)
  }

  return (
    <div className="space-y-5">
      <Card title="Nova campanha de fidelidade">
        <p className="-mt-0.5 mb-4 text-[12.5px] text-ink-2">
          Gera <strong className="text-ink">tarefas internas</strong> automaticamente em datas-alvo (recompra, retorno, aniversário). Não envia nada sozinho — o time faz o contato.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input wrapperClassName="sm:col-span-2" label="Nome da campanha" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Revisão 6 meses" />
          <Select label="Quando disparar" value={gatilho} onChange={(e) => setGatilho(e.target.value)}>
            {Object.entries(GATILHOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          {usaDias && <Input label="Dias após o evento" type="number" min={1} value={dias} onChange={(e) => setDias(e.target.value)} />}
          <Input wrapperClassName="sm:col-span-2" label="Título da tarefa (opcional · {{nome}} = cliente)" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Oferecer revisão para {{nome}}" />
        </div>
        <div className="mt-4"><Button onClick={adicionar} loading={salvando} icon={<Plus size={15} strokeWidth={1.7} />}>Adicionar campanha</Button></div>
      </Card>

      <Card title={`Campanhas (${lista.filter((c) => c.ativo).length} ativas)`} flush>
        {lista.length === 0 ? (
          <p className="p-6 text-[13px] text-ink-3">Nenhuma campanha ainda.</p>
        ) : (
          <div className="divide-y divide-line-soft">
            {lista.map((c) => (
              <div key={c.id} className={`flex items-center gap-3 px-4 py-3 ${!c.ativo ? 'opacity-55' : ''}`}>
                <Gift size={15} strokeWidth={1.7} className="flex-none text-accent" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-ink">{c.nome}</div>
                  <div className="text-[11.5px] text-ink-3">{GATILHOS[c.gatilho] ?? c.gatilho}{c.dias != null ? ` · ${c.dias} dias` : ''}</div>
                </div>
                {!c.ativo && <Badge tone="neutro">inativa</Badge>}
                <Button variant="ghost" size="sm" onClick={() => toggle(c)}>{c.ativo ? 'Desativar' : 'Ativar'}</Button>
                <Button variant="ghost" size="sm" icon={<Trash2 size={14} strokeWidth={1.7} />} className="text-bad hover:bg-bad/10" onClick={() => remover(c)}><span className="sr-only">Remover</span></Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
