'use client'

import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, Button, notify } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { Json } from '@/types/database'

interface Prefs {
  lead_novo: boolean
  sla: boolean
  tarefa: boolean
  pagamento: boolean
}

const EVENTOS: { key: keyof Prefs; label: string; desc: string }[] = [
  { key: 'lead_novo', label: 'Novo lead / mensagem', desc: 'Quando chega um lead ou mensagem recebida' },
  { key: 'sla', label: 'SLA estourado', desc: 'Quando um lead passa do tempo de resposta' },
  { key: 'tarefa', label: 'Tarefas', desc: 'Lembretes e tarefas atribuídas a você' },
  { key: 'pagamento', label: 'Pagamentos', desc: 'Confirmações e falhas de pagamento' },
]

const PADRAO: Prefs = { lead_novo: true, sla: true, tarefa: true, pagamento: false }

export function NotificacoesCard() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<Prefs>(PADRAO)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data } = await supabase
        .from('notificacao_prefs').select('prefs').eq('usuario_id', user.id).maybeSingle()
      if (data?.prefs && typeof data.prefs === 'object') {
        setPrefs({ ...PADRAO, ...(data.prefs as Partial<Prefs>) })
      }
    })()
  }, [supabase])

  function toggle(k: keyof Prefs) {
    setPrefs(p => ({ ...p, [k]: !p[k] }))
  }

  async function salvar() {
    if (!userId) { notify.bad('Usuário não identificado'); return }
    setLoading(true)
    const { error } = await supabase
      .from('notificacao_prefs')
      .upsert({ usuario_id: userId, prefs: prefs as unknown as Json }, { onConflict: 'usuario_id' })
    setLoading(false)
    if (error) { notify.bad('Erro ao salvar preferências'); return }
    notify.ok('Preferências de notificação salvas')
  }

  return (
    <Card
      title="Notificações"
      actions={
        <Button onClick={salvar} loading={loading} icon={<Save size={15} strokeWidth={1.7} />}>
          {loading ? 'Salvando…' : 'Salvar'}
        </Button>
      }
    >
      <p className="-mt-0.5 mb-4 text-[12.5px] text-ink-2">
        Escolha quais eventos geram alerta para <strong className="text-ink">você</strong> (badge e avisos no CRM).
      </p>
      <div className="flex flex-col gap-2.5">
        {EVENTOS.map(ev => {
          const on = prefs[ev.key]
          return (
            <button
              key={ev.key}
              type="button"
              onClick={() => toggle(ev.key)}
              className="flex items-center gap-3.5 rounded-card border border-line bg-raised px-4 py-3 text-left transition-colors hover:border-ink/20"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-ink">{ev.label}</div>
                <div className="text-[11.5px] text-ink-2">{ev.desc}</div>
              </div>
              <span
                className={cn(
                  'relative h-[22px] w-[38px] flex-none rounded-full transition-colors',
                  on ? 'bg-accent' : 'bg-ink/[0.15]',
                )}
              >
                <span
                  className={cn(
                    'absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-all',
                    on ? 'left-[19px]' : 'left-[3px]',
                  )}
                />
              </span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}
