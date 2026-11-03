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

interface Fusao {
  id: number; em: string; nome: string | null; telefone: string | null; instagram: string | null
  podeDesfazer: boolean; desfeita: boolean
}

const CANAL: Record<string, string> = { whatsapp: 'WhatsApp', instagram: 'Instagram', messenger: 'Messenger', site: 'Site', manual: 'Loja' }

/**
 * FUNDIR COM OUTRO CONTATO (03/11/2026) — a classe 2 dos duplicados: a mesma
 * pessoa chegou por canais sem chave comum e virou dois contatos. Quem conhece o
 * cliente escolhe o outro; o contato deste card FICA, o escolhido SAI e tudo dele
 * (conversas, negócios, identidades) passa para cá. Registro em contato_fusoes.
 * Só dono e admin (a rota confere).
 *
 * Em cima, as fusões em que ESTE contato ficou, com "Desfazer": a fusão guarda
 * a foto do que mudou e o desfazer recria o contato que saiu com o mesmo id
 * (lib/fusao-contatos.ts).
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
  const [fusoes, setFusoes] = useState<Fusao[]>([])
  const [aDesfazer, setADesfazer] = useState<Fusao | null>(null)

  useEffect(() => {
    let vivo = true
    fetch(`/api/contatos/fundir?fusoes=${contatoId}`).then((r) => r.json()).then((j) => {
      if (vivo && Array.isArray(j.fusoes)) setFusoes(j.fusoes)
    }).catch(() => {})
    return () => { vivo = false }
  }, [contatoId])

  async function desfazer() {
    if (!aDesfazer) return
    setFundindo(true)
    const r = await fetch('/api/contatos/fundir/desfazer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fusaoId: aDesfazer.id }),
    })
    const j = await r.json().catch(() => ({}))
    setFundindo(false)
    if (!r.ok) { notify.bad('Não foi possível desfazer', j.error); return }
    notify.ok('Fusão desfeita', `${aDesfazer.nome ?? 'O contato'} voltou a ser um contato separado.`)
    onFundido()
  }

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
      footer={aDesfazer ? (
        <>
          <Button variant="ghost" onClick={() => setADesfazer(null)} disabled={fundindo}>Voltar</Button>
          <Button variant="danger" onClick={desfazer} loading={fundindo}>Desfazer a fusão</Button>
        </>
      ) : escolhido ? (
        <>
          <Button variant="ghost" onClick={() => setEscolhido(null)} disabled={fundindo}>Voltar</Button>
          <Button variant="danger" onClick={fundir} loading={fundindo}>Fundir</Button>
        </>
      ) : (
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      )}
    >
      {aDesfazer ? (
        <div className="flex flex-col gap-3 text-[13px] text-ink-2">
          <p>
            <strong className="text-ink">{aDesfazer.nome ?? 'O contato'}</strong> volta a ser um contato separado, com o mesmo cadastro,
            e as conversas, negócios e canais que eram dele voltam para ele.
          </p>
          <p>O que chegou depois da fusão (mensagem ou negócio novo) continua com {nomeAtual}.</p>
        </div>
      ) : escolhido ? (
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
          {fusoes.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-[8px] border border-line-soft p-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Fusões deste contato</span>
              {fusoes.map((fz) => (
                <div key={fz.id} className="flex items-center gap-2 text-[12.5px]">
                  <span className="min-w-0 flex-1 truncate text-ink-2">
                    {fz.nome ?? 'Contato'}{fz.telefone || fz.instagram ? ` · ${fz.telefone ?? '@' + fz.instagram}` : ''} — {new Date(fz.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {fz.podeDesfazer
                    ? <Button size="sm" variant="outline" onClick={() => setADesfazer(fz)}>Desfazer</Button>
                    : <span className="text-[11px] text-ink-3">{fz.desfeita ? 'desfeita' : 'sem foto para desfazer'}</span>}
                </div>
              ))}
            </div>
          )}
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
