'use client'
import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Usuario {
  id: string
  nome: string
  email: string | null
  role: string | null
  modulos_acesso: string[] | null
  ultimo_acesso: string | null
  created_at: string
}
interface Props { usuarios: Usuario[] }

const TABS = [
  { key: 'usuarios',  label: 'Usuários'   },
  { key: 'metas',     label: 'Metas'      },
  { key: 'comissoes', label: 'Comissões'  },
]

const ROLE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  owner:    { label: 'Proprietário', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  admin:    { label: 'Administrador',color: '#D7282F', bg: 'rgba(215,40,47,0.15)'  },
  vendedor: { label: 'Vendedor',     color: '#22C55E', bg: 'rgba(34,197,94,0.15)'  },
  tecnico:  { label: 'Técnico',      color: '#3B7DE8', bg: 'rgba(59,125,232,0.15)' },
}

function avatarColor(name: string) {
  const colors = ['#D7282F','#3B7DE8','#22C55E','#F59E0B','#8B5CF6','#EC4899','#06B6D4','#10B981']
  let hash = 0; for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function fmtAcesso(d: string | null) {
  if (!d) return '—'
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (diff < 2) return 'Agora'
  if (diff < 60) return `${diff} min`
  if (diff < 1440) return `${Math.floor(diff/60)}h`
  if (diff < 2880) return 'Ontem'
  return new Date(d).toLocaleDateString('pt-BR')
}

export default function EquipeView({ usuarios }: Props) {
  const [tab, setTab] = useState('usuarios')

  return (
    <div className="flex flex-col h-full bg-[#0A111E] overflow-hidden">
      <div className="flex items-center px-6 py-4 border-b border-white/[0.06] shrink-0">
        <div>
          <p className="text-[10px] font-mono tracking-[0.2em] text-[#5C6E84] uppercase mb-0.5">Operação</p>
          <h1 className="text-xl font-bold text-[#F4F6F9]">Equipe</h1>
        </div>
      </div>

      {/* Tabs + botão */}
      <div className="flex items-center justify-between px-6 py-4 shrink-0">
        <div className="flex items-center gap-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn('flex items-center gap-2 px-4 py-2 rounded-[8px] text-sm font-medium transition-all',
                tab === t.key ? 'text-[#F0656B]' : 'text-[#5C6E84] hover:text-[#8A9BB0]')}
              style={tab === t.key ? { backgroundColor: 'rgba(215,40,47,0.14)' } : { backgroundColor: 'rgba(255,255,255,0.04)' }}>
              {t.label}
            </button>
          ))}
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-[#D7282F] hover:bg-[#C0232A] text-white text-sm font-semibold rounded-[10px] transition-colors">
          <UserPlus size={15} /> Novo usuário
        </button>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {tab === 'usuarios' && (
          <div className="bg-[#122036] border border-white/[0.06] rounded-[16px] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['Usuário','Módulos de acesso','Perfil','Último acesso','Ação'].map(h => (
                    <th key={h} className="text-left text-[10px] font-mono tracking-[0.15em] text-[#5C6E84] uppercase px-5 py-3.5 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usuarios.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-16 text-[#4F6178] text-sm">Nenhum usuário</td></tr>
                ) : usuarios.map(u => {
                  const color = avatarColor(u.nome)
                  const initials = u.nome.trim().split(' ').filter(Boolean).map(w => w[0]).slice(0,2).join('').toUpperCase()
                  const rb = ROLE_BADGE[u.role ?? ''] ?? { label: u.role ?? '—', color: '#5C6E84', bg: 'rgba(92,110,132,0.15)' }
                  const modulos = (u.modulos_acesso ?? []).join(' · ') || 'Acesso total'
                  return (
                    <tr key={u.id} className="border-b border-white/[0.04] hover:bg-white/[0.04] transition-colors last:border-0">
                      {/* Usuário */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="relative shrink-0">
                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: color }}>{initials}</div>
                            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#22C55E] border-2 border-[#122036]" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-[#E9EEF4]">{u.nome}</div>
                            <div className="text-[11px] text-[#5C6E84]">{u.email ?? '—'}</div>
                          </div>
                        </div>
                      </td>
                      {/* Módulos */}
                      <td className="px-5 py-4"><span className="text-sm text-[#8A9BB0]">{modulos}</span></td>
                      {/* Perfil */}
                      <td className="px-5 py-4">
                        <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold" style={{ color: rb.color, backgroundColor: rb.bg }}>{rb.label}</span>
                      </td>
                      {/* Último acesso */}
                      <td className="px-5 py-4"><span className="text-sm text-[#8A9BB0]">{fmtAcesso(u.ultimo_acesso)}</span></td>
                      {/* Ação */}
                      <td className="px-5 py-4">
                        <button className="px-3 py-1.5 text-xs font-semibold text-[#8A9BB0] hover:text-[#E9EEF4] bg-white/[0.05] hover:bg-white/[0.08] rounded-[8px] transition-colors">
                          ✎ Editar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'metas' && (
          <div className="bg-[#122036] border border-white/[0.06] rounded-[16px] p-8 text-center">
            <p className="text-[#5C6E84] text-sm">Metas em desenvolvimento</p>
          </div>
        )}
        {tab === 'comissoes' && (
          <div className="bg-[#122036] border border-white/[0.06] rounded-[16px] p-8 text-center">
            <p className="text-[#5C6E84] text-sm">Comissões em desenvolvimento</p>
          </div>
        )}
      </div>
    </div>
  )
}
