'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ShieldAlert, Plus, X, Trash2 } from 'lucide-react'

const ADMIN_COR = '#7C3AED'

interface Admin {
  id: string
  nome: string
  email: string | null
}

export function GestaoSuperAdmins({ admins, currentUserId }: { admins: Admin[]; currentUserId: string }) {
  const router = useRouter()
  const [modalAberto, setModalAberto] = useState(false)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function promover() {
    setLoading(true)
    setErro(null)
    try {
      const res = await fetch('/api/superadmin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) { setErro(data.error ?? 'Erro'); return }
      setModalAberto(false)
      setEmail('')
      router.refresh()
    } catch {
      setErro('Erro de conexão')
    } finally {
      setLoading(false)
    }
  }

  async function revogar(id: string, nome: string) {
    if (!confirm(`Revogar acesso de super admin de ${nome}?`)) return
    const res = await fetch('/api/superadmin/admins', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const data = await res.json()
    if (!res.ok) { alert(data.error ?? 'Erro ao revogar'); return }
    router.refresh()
  }

  return (
    <>
      <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} style={{ color: ADMIN_COR }} />
            <h3 className="font-sans font-bold text-[15px] text-[#16212E]">Super administradores</h3>
          </div>
          <button
            onClick={() => { setErro(null); setEmail(''); setModalAberto(true) }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] text-[13px] font-semibold text-white"
            style={{ background: `linear-gradient(135deg, ${ADMIN_COR}, #6D28D9)` }}
          >
            <Plus size={15} /> Adicionar
          </button>
        </div>

        <p className="text-[12.5px] text-[#788698] mb-4">
          Super admins têm controle total sobre a plataforma e todas as empresas.
        </p>

        <div className="space-y-2">
          {admins.map(a => (
            <div key={a.id} className="flex items-center gap-3 p-3 rounded-[12px] border border-[#16212E]/[0.06]">
              <div
                className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center text-[13px] font-bold text-white shrink-0"
                style={{ background: `linear-gradient(135deg, ${ADMIN_COR}, #6D28D9)` }}
              >
                {a.nome.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold text-[#16212E] truncate">
                  {a.nome}
                  {a.id === currentUserId && <span className="ml-2 text-[11px] text-[#9AA7B6]">(você)</span>}
                </div>
                <div className="text-[12px] text-[#9AA7B6] truncate">{a.email ?? '—'}</div>
              </div>
              {a.id !== currentUserId && (
                <button
                  onClick={() => revogar(a.id, a.nome)}
                  className="text-[#9AA7B6] hover:text-[#DC2626] transition-colors p-1.5"
                  aria-label="Revogar"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !loading && setModalAberto(false)}>
          <div className="bg-white rounded-[18px] w-full max-w-[420px] p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-sans font-bold text-[17px] text-[#16212E]">Adicionar super admin</h3>
              <button onClick={() => !loading && setModalAberto(false)} className="text-[#9AA7B6] hover:text-[#16212E]" aria-label="Fechar">
                <X size={20} />
              </button>
            </div>
            <p className="text-[13px] text-[#788698] mb-5">
              O usuário precisa já ter conta no sistema. Informe o e-mail dele.
            </p>
            <input
              type="email"
              placeholder="email@exemplo.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-3 text-[14px] border border-[#16212E]/[0.12] rounded-[11px] outline-none focus:border-[#7C3AED]/40 mb-3"
            />
            {erro && <p className="text-[13px] text-[#DC2626] mb-3">{erro}</p>}
            <div className="flex gap-2.5">
              <button
                onClick={() => setModalAberto(false)}
                disabled={loading}
                className="flex-1 px-4 py-2.5 rounded-[11px] text-[13.5px] font-semibold text-[#788698] border border-[#16212E]/[0.1] disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={promover}
                disabled={loading || !email}
                className="flex-1 px-4 py-2.5 rounded-[11px] text-[13.5px] font-semibold text-white disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${ADMIN_COR}, #6D28D9)` }}
              >
                {loading ? 'Adicionando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
