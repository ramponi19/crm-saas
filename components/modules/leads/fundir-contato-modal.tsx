'use client'

import { useEffect, useState } from 'react'
import { Modal, Input, Button, notify } from '@/components/ui'

interface Achado {
  id: number
  nome: string | null
  telefone: string | null
  instagram: string | null
  origem: string | null
  negocios: { id: number; status: string; filial: { nome: string } | null }[]
}

const CANAL: Record<string, string> = { whatsapp: 'WhatsApp', instagram: 'Instagram', messenger: 'Messenger', site: 'Site', manual: 'Loja' }

/**
 * FUNDIR COM OUTRO CONTATO (03/11/2026) — a classe 2 dos duplicados: a mesma
 * pessoa chegou por canais sem chave comum e virou dois contatos. Quem conhece o
 * cliente escolhe o outro; o contato deste card FICA, o escolhido SAI e tudo dele
 * (conversas, negócios, identidades) passa para cá. Registro em contato_fusoes.
 * Só dono e admin (a rota confere).
 */
export function FundirContatoModal({ contatoId, nomeAtual, onClose, onFundido }: {
  contatoId: number
  nomeAtual: string
  onClose: () => void
  onFundido: () => void
}) {
  const [q, setQ] = useState('')
  const [achados, setAchados] = useState<Achado[]>([])
  const [buscando, setBuscando] = useState(false)
  const [escolhido, setEscolhido] = useState<Achado | null>(null)
  const [fundindo, setFundindo] = useState(false)

  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) return
    let vivo = true
    const id = setTimeout(async () => {
      setBuscando(true)
      const r = await fetch(`/api/contatos/fundir?q=${encodeURIComponent(t)}&exceto=${contatoId}`)
      const j = await r.json().catch(() => ({}))
      if (!vivo) return
      setAchados(Array.isArray(j.contatos) ? j.contatos : [])
      setBuscando(false)
    }, 300)
    return () => { vivo = false; clearTimeout(id) }
  }, [q, contatoId])

  async function fundir() {
    if (!escolhido) return
    setFundindo(true)
    const r = await fetch('/api/contatos/fundir', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ principal: contatoId, removido: escolhido.id }),
    })
    const j = await r.json().catch(() => ({}))
    setFundindo(false)
    if (!r.ok) { notify.bad('Não foi possível fundir', j.error); return }
    notify.ok('Contatos fundidos', `${escolhido.nome ?? 'O contato escolhido'} agora faz parte de ${nomeAtual}.`)
    onFundido()
  }

  const descreve = (a: Achado) => [
    a.telefone, a.instagram ? `@${a.instagram.replace(/^@/, '')}` : null, a.origem ? CANAL[a.origem] ?? a.origem : null,
  ].filter(Boolean).join(' · ')
  const lojas = (a: Achado) => [...new Set(a.negocios.map((n) => n.filial?.nome?.replace(/^.*·\s*/, '') ?? '—'))].join(', ')

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Fundir com outro contato"
      footer={escolhido ? (
        <>
          <Button variant="ghost" onClick={() => setEscolhido(null)} disabled={fundindo}>Voltar</Button>
          <Button variant="danger" onClick={fundir} loading={fundindo}>Fundir</Button>
        </>
      ) : (
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      )}
    >
      {escolhido ? (
        <div className="flex flex-col gap-3 text-[13px] text-ink-2">
          <p><strong className="text-ink">Fica:</strong> {nomeAtual} (este card)</p>
          <p><strong className="text-ink">Sai:</strong> {escolhido.nome ?? 'Sem nome'} — {descreve(escolhido) || 'sem telefone nem Instagram'}</p>
          <p>
            As conversas, os negócios ({escolhido.negocios.length}) e os canais do contato que sai passam para {nomeAtual}.
            Campos vazios aqui recebem os de lá. <strong className="text-ink">Não dá para desfazer.</strong>
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] text-ink-3">
            Para quando a mesma pessoa chegou por canais diferentes (ex.: WhatsApp e Instagram) e virou dois contatos.
          </p>
          <Input label="Buscar por nome, telefone ou Instagram" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="flex max-h-[300px] flex-col gap-1.5 overflow-y-auto">
            {buscando && <span className="text-[12px] text-ink-3">Buscando…</span>}
            {!buscando && q.trim().length >= 2 && achados.length === 0 && <span className="text-[12px] text-ink-3">Nenhum contato encontrado.</span>}
            {achados.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setEscolhido(a)}
                className="flex flex-col items-start rounded-[8px] border border-line px-3 py-2 text-left hover:border-ink-3"
              >
                <span className="text-[13px] font-medium text-ink">{a.nome ?? 'Sem nome'}</span>
                <span className="text-[11.5px] text-ink-3">
                  {descreve(a) || 'sem telefone nem Instagram'}{a.negocios.length ? ` · ${a.negocios.length} negócio(s) em ${lojas(a)}` : ''}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
