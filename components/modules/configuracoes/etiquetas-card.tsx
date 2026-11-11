'use client'

/**
 * CONFIGURAÇÕES → ETIQUETAS (core, 11/11/2026). Dono e admin criam, renomeiam, trocam a cor e
 * apagam; a equipe aplica e tira no card do lead e no quadro. Apagar tira a etiqueta de todos
 * os contatos (com histórico) e apaga as automações "recebeu etiqueta" dela.
 */
import { useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button, Card, ConfirmDialog, Input, notify } from '@/components/ui'
import { cn } from '@/lib/utils'
import { CORES_ETIQUETA, NOME_DA_COR, NOME_MAX, PONTO_DA_COR, type CorEtiqueta, type Etiqueta } from '@/lib/etiquetas'
import { EtiquetaChip, recarregarEtiquetas, useEtiquetas } from '@/components/modules/etiquetas/etiquetas'

async function enviar(metodo: 'POST' | 'PATCH' | 'DELETE', corpo?: Record<string, unknown>, id?: number): Promise<boolean> {
  const r = await fetch(`/api/leads/etiquetas${id ? `?id=${id}` : ''}`, {
    method: metodo, headers: { 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const j = await r.json().catch(() => ({})) as { error?: string }
  if (!r.ok) { notify.bad('Não foi possível gravar', j.error); return false }
  await recarregarEtiquetas()
  return true
}

function Cores({ valor, onChange }: { valor: CorEtiqueta; onChange: (c: CorEtiqueta) => void }) {
  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Cor">
      {CORES_ETIQUETA.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={valor === c} title={NOME_DA_COR[c]} data-cor={c}
          onClick={() => onChange(c)}
          className={cn('grid h-6 w-6 place-items-center rounded-full border', valor === c ? 'border-ink' : 'border-transparent')}>
          <span className={cn('h-3.5 w-3.5 rounded-full', PONTO_DA_COR[c])} />
        </button>
      ))}
    </div>
  )
}

function Linha({ e }: { e: Etiqueta }) {
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(e.nome)
  const [cor, setCor] = useState<CorEtiqueta>(e.cor)
  const [ocupado, setOcupado] = useState(false)
  const [apagar, setApagar] = useState(false)

  async function salvar() {
    setOcupado(true)
    const ok = await enviar('PATCH', { id: e.id, nome, cor })
    setOcupado(false)
    if (ok) { setEditando(false); notify.ok('Etiqueta salva') }
  }

  return (
    <div data-linha-etiqueta={e.id} className="flex flex-wrap items-center gap-3 border-b border-line-soft py-2.5 last:border-0">
      {editando ? (
        <>
          <Input aria-label="Nome" value={nome} maxLength={NOME_MAX} onChange={(x) => setNome(x.target.value)} wrapperClassName="w-[220px]" />
          <Cores valor={cor} onChange={setCor} />
          <div className="ml-auto flex gap-1.5">
            <Button size="sm" loading={ocupado} icon={<Check size={13} strokeWidth={2} />} onClick={salvar}>Salvar</Button>
            <Button size="sm" variant="ghost" icon={<X size={13} strokeWidth={2} />} onClick={() => { setEditando(false); setNome(e.nome); setCor(e.cor) }}>Cancelar</Button>
          </div>
        </>
      ) : (
        <>
          <EtiquetaChip etiqueta={e} />
          <div className="ml-auto flex gap-1.5">
            <Button size="sm" variant="ghost" icon={<Pencil size={13} strokeWidth={1.8} />} onClick={() => setEditando(true)}>Editar</Button>
            <Button size="sm" variant="ghost" icon={<Trash2 size={13} strokeWidth={1.8} />} onClick={() => setApagar(true)}>Apagar</Button>
          </div>
        </>
      )}
      <ConfirmDialog
        open={apagar}
        title={`Apagar a etiqueta "${e.nome}"?`}
        description='Ela sai de todos os contatos (fica registrado no histórico de cada negócio) e as automações de "recebeu esta etiqueta" são apagadas. Não dá para desfazer.'
        confirmLabel="Apagar"
        tone="danger"
        onClose={() => setApagar(false)}
        onConfirm={async () => { setApagar(false); if (await enviar('DELETE', undefined, e.id)) notify.ok('Etiqueta apagada') }}
      />
    </div>
  )
}

export function EtiquetasCard() {
  const todas = useEtiquetas()
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState<CorEtiqueta>('azul')
  const [ocupado, setOcupado] = useState(false)

  async function criar() {
    setOcupado(true)
    const ok = await enviar('POST', { nome, cor })
    setOcupado(false)
    if (ok) { setNome(''); notify.ok('Etiqueta criada') }
  }

  return (
    <div className="space-y-4" data-config-etiquetas>
      <Card className="p-5">
        <h3 className="text-[14px] font-semibold text-ink">Nova etiqueta</h3>
        <p className="mt-1 text-[12.5px] text-ink-3">
          A equipe aplica no card do lead ou em vários de uma vez no quadro (Selecionar). Filtra o quadro, a Comunicação, a busca e a Transmissão, e pode disparar automação.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Input label="Nome" value={nome} maxLength={NOME_MAX} placeholder="Ex.: Cliente VIP" onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && nome.trim()) void criar() }} wrapperClassName="w-[260px]" />
          <div>
            <div className="mb-1.5 text-[12px] font-medium text-ink-2">Cor</div>
            <Cores valor={cor} onChange={setCor} />
          </div>
          <Button loading={ocupado} disabled={!nome.trim()} icon={<Plus size={14} strokeWidth={1.8} />} onClick={criar}>Criar</Button>
        </div>
      </Card>
      <Card className="p-5">
        <h3 className="text-[14px] font-semibold text-ink">Etiquetas da empresa ({todas.length})</h3>
        {todas.length === 0
          ? <p className="mt-2 text-[12.5px] text-ink-3">Nenhuma ainda.</p>
          : <div className="mt-2">{todas.map((e) => <Linha key={`${e.id}-${e.nome}-${e.cor}`} e={e} />)}</div>}
      </Card>
    </div>
  )
}
