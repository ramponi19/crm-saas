'use client'

import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, Textarea, Button, notify } from '@/components/ui'
import type { Json } from '@/types/database'

// Modelos padrão usados por cobranças, confirmações, régua e automações (Fase 4).
const TEMPLATES: { chave: string; label: string; descricao: string; exemplo: string }[] = [
  { chave: 'boas_vindas', label: 'Boas-vindas', descricao: 'Primeiro contato com um lead novo', exemplo: 'Olá {{nome}}! Obrigado pelo contato. Como posso ajudar?' },
  { chave: 'confirmacao_visita', label: 'Confirmação de visita', descricao: 'Confirmar agendamento (imobiliária, serviços)', exemplo: 'Oi {{nome}}, confirmando sua visita em {{data}}. Podemos manter?' },
  { chave: 'cobranca', label: 'Cobrança', descricao: 'Lembrete de pagamento pendente', exemplo: 'Olá {{nome}}, consta um valor de {{valor}} em aberto. Pague em {{link}}.' },
  { chave: 'followup', label: 'Follow-up', descricao: 'Retomar contato com lead parado', exemplo: 'Oi {{nome}}, ainda tem interesse? Estou à disposição.' },
  { chave: 'agradecimento', label: 'Pós-venda', descricao: 'Agradecer após fechar', exemplo: 'Obrigado pela confiança, {{nome}}! Qualquer coisa, é só chamar.' },
]

type Valores = Record<string, string>

export function TemplatesCard() {
  const supabase = createClient()
  const [empresaId, setEmpresaId] = useState<number | null>(null)
  const [valores, setValores] = useState<Valores>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: vinculo } = await supabase
        .from('empresa_usuarios').select('empresa_id').eq('usuario_id', user.id).eq('ativo', true).single()
      if (!vinculo) return
      setEmpresaId(vinculo.empresa_id)
      const { data } = await supabase
        .from('configuracoes_sistema').select('valor').eq('empresa_id', vinculo.empresa_id).eq('chave', 'mensagens_templates').maybeSingle()
      if (data?.valor && typeof data.valor === 'object') setValores(data.valor as Valores)
    })()
  }, [supabase])

  async function salvar() {
    if (!empresaId) { notify.bad('Empresa não identificada'); return }
    setLoading(true)
    const { error } = await supabase
      .from('configuracoes_sistema')
      .upsert({ chave: 'mensagens_templates', valor: valores as unknown as Json, empresa_id: empresaId }, { onConflict: 'empresa_id,chave' })
    setLoading(false)
    if (error) { notify.bad('Erro ao salvar modelos'); return }
    notify.ok('Modelos de mensagem salvos')
  }

  return (
    <Card
      title="Modelos de mensagem (WhatsApp)"
      actions={
        <Button onClick={salvar} loading={loading} icon={<Save size={15} strokeWidth={1.7} />}>
          {loading ? 'Salvando…' : 'Salvar modelos'}
        </Button>
      }
    >
      <p className="-mt-0.5 mb-4 text-[12.5px] text-ink-2">
        Variáveis disponíveis: <code className="rounded bg-ink/[0.05] px-1 text-ink">{'{{nome}}'}</code>{' '}
        <code className="rounded bg-ink/[0.05] px-1 text-ink">{'{{valor}}'}</code>{' '}
        <code className="rounded bg-ink/[0.05] px-1 text-ink">{'{{link}}'}</code>{' '}
        <code className="rounded bg-ink/[0.05] px-1 text-ink">{'{{data}}'}</code> — usadas por cobranças, confirmações e automações.
      </p>
      <div className="space-y-4">
        {TEMPLATES.map(t => (
          <div key={t.chave}>
            <Textarea
              label={t.label}
              hint={t.descricao}
              rows={2}
              value={valores[t.chave] ?? ''}
              placeholder={t.exemplo}
              onChange={e => setValores(v => ({ ...v, [t.chave]: e.target.value }))}
            />
          </div>
        ))}
      </div>
    </Card>
  )
}
