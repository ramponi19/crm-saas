'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ShieldAlert, Plus, Trash2 } from 'lucide-react'
import { Card, Button, IconButton, Input, Modal } from '@/components/ui'

const ROXO = '#6D28D9'

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
      <Card
        title={
          <span className="flex items-center gap-2">
            <ShieldAlert size={17} strokeWidth={1.7} style={{ color: ROXO }} />
            Super administradores
          </span>
        }
        actions={
          <Button
            size="sm"
            icon={<Plus size={15} strokeWidth={1.7} />}
            onClick={() => { setErro(null); setEmail(''); setModalAberto(true) }}
          >
            Adicionar
          </Button>
        }
      >
        <p className="mb-4 text-[12.5px] text-ink-2">
          Super admins têm controle total sobre a plataforma e todas as empresas.
        </p>

        <div className="space-y-2">
          {admins.map(a => (
            <div key={a.id} className="flex items-center gap-3 rounded-card border border-line-soft p-3">
              <div
                className="grid h-9 w-9 flex-none place-items-center rounded-control text-[13px] font-bold text-white"
                style={{ background: ROXO }}
              >
                {a.nome.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-ink">
                  {a.nome}
                  {a.id === currentUserId && <span className="ml-2 text-[11px] text-ink-3">(você)</span>}
                </div>
                <div className="truncate text-[12px] text-ink-3">{a.email ?? '—'}</div>
              </div>
              {a.id !== currentUserId && (
                <IconButton
                  aria-label="Revogar"
                  variant="danger"
                  size="sm"
                  onClick={() => revogar(a.id, a.nome)}
                >
                  <Trash2 size={16} strokeWidth={1.7} />
                </IconButton>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Modal
        open={modalAberto}
        onClose={() => !loading && setModalAberto(false)}
        title="Adicionar super admin"
        size="sm"
        disableOverlayClose={loading}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalAberto(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={promover} loading={loading} disabled={loading || !email}>
              {loading ? 'Adicionando...' : 'Confirmar'}
            </Button>
          </>
        }
      >
        <p className="mb-4 text-[13px] text-ink-2">
          O usuário precisa já ter conta no sistema. Informe o e-mail dele.
        </p>
        <Input
          type="email"
          placeholder="email@exemplo.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        {erro && <p className="mt-3 text-[13px] text-bad">{erro}</p>}
      </Modal>
    </>
  )
}
