'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, Button, Input, Badge, notify } from '@/components/ui'
import { Copy, Link2, PlugZap, Unplug, ShieldCheck } from 'lucide-react'

/**
 * Contact2Sale — a plataforma por onde a imobiliária recebe lead hoje.
 *
 * A ASSINATURA DO WEBHOOK É POR API, não pela tela deles: por isso o token do C2S
 * é pedido aqui. Ele é validado contra a API deles antes de ser guardado (cifrado),
 * e NUNCA volta para a tela — nem mascarado. A tela só sabe se existe.
 */

export interface EstadoC2S {
  temToken: boolean
  assinaturas: string[]
  assinadoEm: string | null
  urlWebhook: string
}

export interface EventoIntegracao {
  id: number
  acao: string | null
  status: string
  lead_id: number | null
  detalhes: string | null
  created_at: string
}

const GATILHOS: Record<string, string> = {
  on_create_lead: 'Lead criado',
  on_update_lead: 'Lead atualizado',
  on_close_lead: 'Lead encerrado',
}

const TOM: Record<string, 'ok' | 'bad' | 'neutro'> = { sucesso: 'ok', erro: 'bad', ignorado: 'neutro' }

const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function C2SCard({ estado, eventos }: { estado: EstadoC2S; eventos: EventoIntegracao[] }) {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const resumo = {
    total: eventos.length,
    sucesso: eventos.filter((e) => e.status === 'sucesso').length,
    erro: eventos.filter((e) => e.status === 'erro').length,
    ignorado: eventos.filter((e) => e.status === 'ignorado').length,
  }

  async function agir(acao: string, corpo: Record<string, unknown> = {}) {
    setOcupado(acao)
    setAviso(null)
    const r = await fetch('/api/admin/c2s', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao, ...corpo }),
    })
    const j = await r.json().catch(() => ({}))
    setOcupado(null)
    if (!r.ok || j?.error) { notify.bad('Não deu certo', j?.error); return }

    if (acao === 'salvar_token') {
      setToken('')
      notify.ok('Token validado e guardado', j?.empresa ? `Conta: ${j.empresa}` : undefined)
    }
    if (acao === 'testar') notify.ok('Token respondendo', j?.empresa ? `Conta: ${j.empresa}` : `HTTP ${j?.status}`)
    if (acao === 'assinar') {
      const n = (j?.assinados ?? []).length
      notify.ok(n ? `${n} gatilho(s) assinado(s)` : 'Nada assinado', (j?.erros ?? []).join(' · ') || undefined)
      if (j?.aviso) setAviso(j.aviso)
    }
    if (acao === 'cancelar') notify.ok('Assinatura cancelada')
    if (acao === 'remover_token') notify.ok('Token removido')
    router.refresh()
  }

  function copiar(txt: string) {
    navigator.clipboard.writeText(txt).then(
      () => notify.ok('Copiado'),
      () => notify.bad('O navegador não deixou copiar'),
    )
  }

  return (
    <Card
      title={<span className="inline-flex items-center gap-2"><PlugZap size={15} strokeWidth={1.8} className="text-accent" />Contact2Sale</span>}
      actions={
        estado.assinaturas.length > 0
          ? <Badge tone="ok" dot>recebendo</Badge>
          : estado.temToken ? <Badge tone="warn">token salvo, sem assinar</Badge> : <Badge tone="neutro">inativa</Badge>
      }
    >
      <p className="mb-3 text-[12.5px] leading-snug text-ink-2">
        O C2S <strong>empurra</strong> o lead para o CRM em tempo real. A assinatura é feita por
        API — não há tela no painel deles para isso — então o token abaixo é o que
        permite ligar e desligar daqui.
      </p>

      {/* URL de entrada: o segredo está nela, porque o C2S não assina o corpo. */}
      <div className="mb-3">
        <div className="mb-1 text-[12px] font-semibold text-ink-2">URL que o C2S vai chamar</div>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-control border border-line bg-bg px-3 py-2 text-[11.5px] text-ink-2">
            {estado.urlWebhook}
          </code>
          <Button variant="outline" size="sm" icon={<Copy size={13} strokeWidth={1.8} />} onClick={() => copiar(estado.urlWebhook)}>
            Copiar
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-ink-3">
          Contém um token secreto: é ele que autentica a chamada, porque o C2S não assina o corpo. Não publique.
        </p>
      </div>

      {estado.temToken ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">
            <ShieldCheck size={14} strokeWidth={1.8} className="text-ok" />Token guardado (cifrado)
          </span>
          <Button variant="outline" size="sm" loading={ocupado === 'testar'} onClick={() => agir('testar')}>Testar</Button>
          <Button variant="outline" size="sm" loading={ocupado === 'assinar'} icon={<Link2 size={13} strokeWidth={1.8} />} onClick={() => agir('assinar')}>
            {estado.assinaturas.length ? 'Reassinar os 3 gatilhos' : 'Assinar os 3 gatilhos'}
          </Button>
          {estado.assinaturas.length > 0 && (
            <Button variant="ghost" size="sm" loading={ocupado === 'cancelar'} icon={<Unplug size={13} strokeWidth={1.8} />} onClick={() => agir('cancelar')}>
              Cancelar
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-bad hover:bg-bad/10" loading={ocupado === 'remover_token'} onClick={() => agir('remover_token')}>
            Remover token
          </Button>
        </div>
      ) : (
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <Input
            wrapperClassName="min-w-[260px] flex-1"
            label="Token do Contact2Sale"
            type="password"
            hint="Gerado no C2S. É validado antes de salvar e nunca volta para esta tela."
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="cole aqui"
          />
          <Button loading={ocupado === 'salvar_token'} onClick={() => agir('salvar_token', { token })}>Validar e salvar</Button>
        </div>
      )}

      {estado.assinaturas.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {estado.assinaturas.map((a) => <Badge key={a} tone="acc">{GATILHOS[a] ?? a}</Badge>)}
          {estado.assinadoEm && <span className="text-[11.5px] text-ink-3">desde {quando(estado.assinadoEm)}</span>}
        </div>
      )}

      {aviso && (
        <p className="mb-3 rounded-control border border-warn/30 bg-warn-soft px-3 py-2 text-[12px] leading-snug text-ink-2">
          {aviso}
        </p>
      )}

      {/* Log: é o que torna "o lead não chegou" depurável. */}
      <div className="rounded-control border border-line">
        <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-3 py-2 text-[12px]">
          <span className="font-semibold text-ink">Últimos eventos</span>
          <span className="num text-ink-2">{resumo.total} total</span>
          <span className="num text-ok">{resumo.sucesso} sucesso</span>
          <span className="num text-ink-3">{resumo.ignorado} ignorado</span>
          <span className="num text-bad">{resumo.erro} erro</span>
        </div>
        {eventos.length === 0 ? (
          <p className="px-3 py-4 text-[12px] text-ink-3">
            Nada recebido ainda. Depois de assinar, o primeiro lead criado no C2S aparece aqui.
          </p>
        ) : (
          <div className="divide-y divide-line-soft">
            {eventos.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[12px]">
                <span className="num shrink-0 text-ink-3">{quando(e.created_at)}</span>
                <Badge tone={TOM[e.status] ?? 'neutro'}>{e.status}</Badge>
                <span className="shrink-0 text-ink-2">{e.acao ? (GATILHOS[e.acao] ?? e.acao) : '—'}</span>
                {e.lead_id && <span className="num shrink-0 text-ink-3">lead #{e.lead_id}</span>}
                <span className="min-w-0 flex-1 truncate text-ink-2">{e.detalhes}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}
