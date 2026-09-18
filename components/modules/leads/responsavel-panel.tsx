'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UserPlus, UserMinus, ArrowLeftRight, History } from 'lucide-react'
import { Button, Select, Badge, notify } from '@/components/ui'
import type { Usuario } from './types'

interface HistItem { acao: string; de_responsavel: string | null; para_responsavel: string | null; created_at: string }

const ACAO_LABEL: Record<string, string> = {
  pegar: 'pegou', devolver: 'devolveu à esteira', transferir: 'transferiu', atribuir: 'atribuiu',
}

/**
 * O DONO VEM DE CIMA — este painel nao guarda copia.
 *
 * Antes o responsavel era `useState(responsavelInicial)`, e a prop so alimentava
 * o primeiro render. Quando o lead era assumido POR FORA — responder o cliente
 * assume o lead, em `assumirSeLivre` no modal — o banco e o estado do pai
 * mudavam e aqui continuava "Na esteira — sem dono".
 *
 * O estrago nao era so visual: sem dono na tela aparece "Pegar lead" e o botao
 * de DEVOLVER some, entao quem assumiu sem querer nao tinha como desfazer.
 * Relatado em 18/09/2026: "fui retirar e nao estava dando a opcao de salvar...
 * dei F5 e estava como responsavel jm".
 *
 * Sem estado espelhado nao ha o que dessincronizar: a acao avisa o pai, o pai
 * manda a prop nova, a tela segue. Por isso `onChange` e obrigatorio.
 */
export function ResponsavelPanel({ leadId, usuarios, responsavel, onChange }: {
  leadId: number
  usuarios: Usuario[]
  responsavel: string | null
  onChange: (id: string | null) => void
}) {
  const supabase = createClient()
  const [meuId, setMeuId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [hist, setHist] = useState<HistItem[]>([])
  const [salvando, setSalvando] = useState(false)
  const [transferir, setTransferir] = useState('')

  const nome = (id: string | null) => usuarios.find(u => u.id === id)?.nome ?? '—'

  const carregarHist = useCallback(async () => {
    const { data } = await supabase.from('lead_atribuicoes')
      .select('acao, de_responsavel, para_responsavel, created_at')
      .eq('lead_id', leadId).order('created_at', { ascending: false }).limit(8)
    setHist(((data ?? []) as HistItem[]))
  }, [supabase, leadId])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setMeuId(user.id)
        const found = usuarios.find(u => u.id === user.id)
        setIsAdmin(found?.role === 'owner' || found?.role === 'admin')
      }
      await carregarHist()
    })()
  }, [supabase, usuarios, carregarHist])

  async function acao(tipo: string, paraResponsavel?: string | null) {
    setSalvando(true)
    try {
      const res = await fetch('/api/leads/atribuir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, acao: tipo, paraResponsavel }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error)
      onChange(j.responsavel_id ?? null)
      notify.ok('Responsável atualizado')
      setTransferir('')
      await carregarHist()
    } catch (e) {
      notify.bad('Não foi possível', e instanceof Error ? e.message : undefined)
    } finally {
      setSalvando(false)
    }
  }

  const respId = responsavel
  const souDono = respId && respId === meuId

  return (
    <div className="border-t border-line-soft pt-[13px]">
      <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">Responsável</span>

      <div className="mb-2 flex items-center gap-2">
        {respId
          ? <span className="text-[13px] font-semibold text-ink">{nome(respId)}{souDono ? ' (você)' : ''}</span>
          : <Badge tone="warn" dot>Na esteira — sem dono</Badge>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {!respId && (
          <Button size="sm" icon={<UserPlus size={14} strokeWidth={1.7} />} loading={salvando} onClick={() => acao('pegar')}>
            Pegar lead
          </Button>
        )}
        {respId && (souDono || isAdmin) && (
          <Button size="sm" variant="outline" icon={<UserMinus size={14} strokeWidth={1.7} />} loading={salvando} onClick={() => acao('devolver')}>
            Devolver à esteira
          </Button>
        )}
        {isAdmin && (
          <div className="flex items-center gap-1.5">
            <Select wrapperClassName="w-[150px]" value={transferir} onChange={e => setTransferir(e.target.value)}>
              <option value="">Transferir para…</option>
              {usuarios.filter(u => u.id !== respId).map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </Select>
            <Button size="sm" variant="outline" icon={<ArrowLeftRight size={14} strokeWidth={1.7} />} disabled={!transferir} loading={salvando} onClick={() => acao('transferir', transferir)}>
              Transferir
            </Button>
          </div>
        )}
      </div>

      {hist.length > 0 && (
        <div className="mt-3">
          <span className="mb-1 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3"><History size={12} strokeWidth={1.7} /> Histórico</span>
          <div className="space-y-1">
            {hist.map((h, i) => (
              <div key={i} className="text-[11.5px] text-ink-3">
                <span className="text-ink-2">{ACAO_LABEL[h.acao] ?? h.acao}</span>
                {h.acao === 'transferir' || h.acao === 'atribuir' ? ` → ${nome(h.para_responsavel)}` : ''}
                {' · '}{new Date(h.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
