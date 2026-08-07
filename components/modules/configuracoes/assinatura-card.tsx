'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { empresaAtualId } from '@/lib/empresa-atual'
import { Card, Button, notify } from '@/components/ui'

interface Cfg { ativo: boolean; incluir_empresa: boolean }
const PADRAO: Cfg = { ativo: true, incluir_empresa: true }

function Chave({ ligado, onToggle, titulo, descricao }: {
  ligado: boolean; onToggle: () => void; titulo: string; descricao: string
}) {
  return (
    <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 rounded-control p-2 text-left transition-colors hover:bg-ink/[0.03]">
      <span className={`mt-0.5 grid h-[22px] w-[38px] flex-none items-center rounded-full px-[3px] transition-colors ${ligado ? 'bg-accent' : 'bg-ink/15'}`}>
        <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${ligado ? 'translate-x-4' : ''}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink">{titulo}</span>
        <span className="block text-[11.5px] text-ink-3">{descricao}</span>
      </span>
    </button>
  )
}

/**
 * Assinatura do atendente nas mensagens que saem do CRM.
 *
 * A API do WhatsApp entrega tudo pelo número da loja, sem identidade por
 * atendente: para o cliente, três vendedores diferentes são a mesma pessoa. O
 * prefixo no texto é o único jeito de ele saber com quem falou — e de cobrar
 * "mas o Thomas me disse que…".
 */
export function AssinaturaCard() {
  const supabase = createClient()
  const [cfg, setCfg] = useState<Cfg>(PADRAO)
  const [nome, setNome] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [carregou, setCarregou] = useState(false)

  useEffect(() => {
    (async () => {
      const empId = await empresaAtualId(supabase)
      if (!empId) { setCarregou(true); return }
      const [{ data: row }, { data: emp }, { data: auth }] = await Promise.all([
        supabase.from('configuracoes_sistema').select('valor').eq('empresa_id', empId).eq('chave', 'assinatura_atendente').maybeSingle(),
        supabase.from('empresas').select('nome').eq('id', empId).maybeSingle(),
        supabase.auth.getUser(),
      ])
      if (row?.valor) setCfg({ ...PADRAO, ...(row.valor as Partial<Cfg>) })
      setEmpresa(emp?.nome ?? '')
      if (auth?.user) {
        const { data: u } = await supabase.from('usuarios').select('nome').eq('id', auth.user.id).maybeSingle()
        setNome((u?.nome ?? '').split(' ')[0])
      }
      setCarregou(true)
    })()
  }, [supabase])

  async function salvar() {
    setSalvando(true)
    const empId = await empresaAtualId(supabase)
    if (!empId) { notify.bad('Empresa não encontrada'); setSalvando(false); return }
    const { error } = await supabase.from('configuracoes_sistema')
      .upsert({ empresa_id: empId, chave: 'assinatura_atendente', valor: cfg } as never,
              { onConflict: 'empresa_id,chave' })
    setSalvando(false)
    if (error) { notify.bad('Erro ao salvar', error.message); return }
    notify.ok('Assinatura salva')
  }

  const exemplo = cfg.ativo
    ? `${nome || 'Fulano'}${cfg.incluir_empresa && empresa ? ` - ${empresa.toUpperCase()}` : ''}:`
    : null

  if (!carregou) return null

  return (
    <Card title="Assinatura do atendente">
      <div className="space-y-3">
        <p className="text-[12.5px] text-ink-2">
          O WhatsApp entrega tudo pelo número da loja, sem separar quem respondeu. Com a assinatura
          ligada, o nome de quem está atendendo vai na frente da mensagem.
        </p>

        <Chave ligado={cfg.ativo} onToggle={() => setCfg((c) => ({ ...c, ativo: !c.ativo }))}
          titulo="Assinar as mensagens enviadas pelo CRM"
          descricao="Vale para WhatsApp, Instagram e Messenger." />

        <Chave ligado={cfg.incluir_empresa} onToggle={() => setCfg((c) => ({ ...c, incluir_empresa: !c.incluir_empresa }))}
          titulo="Incluir o nome da loja"
          descricao="Ex.: “Thomas - JM STORE:” em vez de só “Thomas:”." />

        <div className="rounded-control border border-line-soft bg-raised p-3">
          <div className="mb-1 text-[11px] uppercase tracking-[0.06em] text-ink-3">Como o cliente vê</div>
          {exemplo ? (
            <>
              <div className="text-[13px] font-semibold italic text-ink">{exemplo}</div>
              <div className="text-[13px] text-ink-2">Boa tarde! Chegou o aparelho que você pediu.</div>
            </>
          ) : (
            <div className="text-[13px] text-ink-2">Boa tarde! Chegou o aparelho que você pediu.</div>
          )}
        </div>

        <p className="text-[11.5px] text-ink-3">
          Mensagem por modelo aprovado não é assinada: o texto dela é aprovado pela Meta e não pode
          ser alterado no envio.
        </p>

        <div className="flex justify-end">
          <Button onClick={salvar} loading={salvando}>Salvar</Button>
        </div>
      </div>
    </Card>
  )
}
