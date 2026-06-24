'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CreditCard, Power, CalendarClock, Eye, X, Check } from 'lucide-react'

const ADMIN_COR = '#7C3AED'

interface Props {
  empresaId: number
  empresaNome: string
  planoAtual: string
  statusAtual: string
}

type ModalTipo = 'plano' | 'status' | 'trial' | null

export function AcoesEmpresa({ empresaId, empresaNome, planoAtual, statusAtual }: Props) {
  const router = useRouter()
  const [modal, setModal] = useState<ModalTipo>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // estados dos formulários
  const [novoPlano, setNovoPlano] = useState(planoAtual)
  const [novoStatus, setNovoStatus] = useState(statusAtual)
  const [diasTrial, setDiasTrial] = useState(14)

  async function executar(body: Record<string, unknown>) {
    setLoading(true)
    setErro(null)
    try {
      const res = await fetch(`/api/superadmin/empresas/${empresaId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setErro(data.error ?? 'Erro ao executar ação')
        return
      }
      setModal(null)
      router.refresh()
    } catch {
      setErro('Erro de conexão')
    } finally {
      setLoading(false)
    }
  }

  async function impersonar() {
    setLoading(true)
    try {
      const res = await fetch(`/api/superadmin/empresas/${empresaId}/impersonar`, {
        method: 'POST',
      })
      if (res.ok) {
        router.push('/dashboard')
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  const botoes = [
    { tipo: 'plano' as const, label: 'Trocar plano', icon: CreditCard, cor: '#7C3AED' },
    { tipo: 'status' as const, label: 'Alterar status', icon: Power, cor: '#DC2626' },
    { tipo: 'trial' as const, label: 'Estender trial', icon: CalendarClock, cor: '#D97706' },
  ]

  return (
    <>
      <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-5">
        <h3 className="font-sans font-bold text-[15px] text-[#16212E] mb-4">Ações administrativas</h3>
        <div className="flex flex-wrap gap-2.5">
          {botoes.map(b => {
            const Icon = b.icon
            return (
              <button
                key={b.tipo}
                onClick={() => { setErro(null); setModal(b.tipo) }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[11px] text-[13px] font-semibold border transition-all hover:bg-[#16212E]/[0.02]"
                style={{ borderColor: `${b.cor}30`, color: b.cor }}
              >
                <Icon size={16} />
                {b.label}
              </button>
            )
          })}
          <button
            onClick={impersonar}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[11px] text-[13px] font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${ADMIN_COR}, #6D28D9)` }}
          >
            <Eye size={16} />
            Entrar como esta empresa
          </button>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !loading && setModal(null)}>
          <div className="bg-white rounded-[18px] w-full max-w-[420px] p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-sans font-bold text-[17px] text-[#16212E]">
                {modal === 'plano' && 'Trocar plano'}
                {modal === 'status' && 'Alterar status'}
                {modal === 'trial' && 'Estender trial'}
              </h3>
              <button onClick={() => !loading && setModal(null)} className="text-[#9AA7B6] hover:text-[#16212E]" aria-label="Fechar">
                <X size={20} />
              </button>
            </div>
            <p className="text-[13px] text-[#788698] mb-5">{empresaNome}</p>

            {modal === 'plano' && (
              <div className="space-y-2 mb-5">
                {['free', 'starter', 'pro'].map(p => (
                  <button
                    key={p}
                    onClick={() => setNovoPlano(p)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-[11px] border text-[14px] font-semibold capitalize transition-all"
                    style={novoPlano === p
                      ? { borderColor: ADMIN_COR, background: `${ADMIN_COR}0A`, color: ADMIN_COR }
                      : { borderColor: '#16212E14', color: '#56657A' }}
                  >
                    {p}
                    {novoPlano === p && <Check size={17} />}
                  </button>
                ))}
              </div>
            )}

            {modal === 'status' && (
              <div className="space-y-2 mb-5">
                {[
                  { v: 'ativo', cor: '#16A34A' },
                  { v: 'suspenso', cor: '#DC2626' },
                  { v: 'cancelado', cor: '#6B7280' },
                ].map(s => (
                  <button
                    key={s.v}
                    onClick={() => setNovoStatus(s.v)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-[11px] border text-[14px] font-semibold capitalize transition-all"
                    style={novoStatus === s.v
                      ? { borderColor: s.cor, background: `${s.cor}0A`, color: s.cor }
                      : { borderColor: '#16212E14', color: '#56657A' }}
                  >
                    {s.v}
                    {novoStatus === s.v && <Check size={17} />}
                  </button>
                ))}
              </div>
            )}

            {modal === 'trial' && (
              <div className="mb-5">
                <label className="block text-[13px] font-semibold text-[#56657A] mb-2">
                  Dias a adicionar (a partir de hoje)
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={diasTrial}
                  onChange={e => setDiasTrial(Number(e.target.value))}
                  className="w-full px-4 py-3 text-[14px] border border-[#16212E]/[0.12] rounded-[11px] outline-none focus:border-[#7C3AED]/40"
                />
                <div className="flex gap-2 mt-2">
                  {[7, 14, 30, 60].map(d => (
                    <button
                      key={d}
                      onClick={() => setDiasTrial(d)}
                      className="px-3 py-1.5 rounded-[9px] text-[12px] font-semibold border border-[#16212E]/[0.1] text-[#788698] hover:bg-[#16212E]/[0.03]"
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
            )}

            {erro && <p className="text-[13px] text-[#DC2626] mb-3">{erro}</p>}

            <div className="flex gap-2.5">
              <button
                onClick={() => setModal(null)}
                disabled={loading}
                className="flex-1 px-4 py-2.5 rounded-[11px] text-[13.5px] font-semibold text-[#788698] border border-[#16212E]/[0.1] hover:bg-[#16212E]/[0.03] disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (modal === 'plano') executar({ tipo: 'trocar_plano', plano: novoPlano })
                  if (modal === 'status') executar({ tipo: 'alterar_status', status: novoStatus })
                  if (modal === 'trial') executar({ tipo: 'estender_trial', dias: diasTrial })
                }}
                disabled={loading}
                className="flex-1 px-4 py-2.5 rounded-[11px] text-[13.5px] font-semibold text-white disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${ADMIN_COR}, #6D28D9)` }}
              >
                {loading ? 'Aplicando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
