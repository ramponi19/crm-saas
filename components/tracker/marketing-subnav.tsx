'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Eye, Route, ShieldCheck, BarChart3, Megaphone } from 'lucide-react'

const C = { card: '#ffffff', ink: '#111e26', ink2: '#3a4b57', ink3: '#6b7680', line: '#e2e8ec', teal: '#00a884', tealDark: '#007e5f' }

const SUB = [
  { href: '/tracker/rastreamento', label: 'Leads (detalhe)', icon: Eye, exact: true },
  { href: '/tracker/rastreamento/como-chegam', label: 'Como chegam', icon: Route },
  { href: '/tracker/rastreamento/qualidade-capi', label: 'Qualidade & CAPI', icon: ShieldCheck },
  { href: '/tracker/rastreamento/atribuicao', label: 'Atribuição', icon: BarChart3 },
  { href: '/tracker/rastreamento/campanhas', label: 'Campanhas da Página', icon: Megaphone },
]

export function MarketingSubnav() {
  const pathname = usePathname()
  return (
    <nav className="w-[210px] shrink-0 space-y-0.5 border-r p-3" style={{ borderColor: C.line, background: C.card }}>
      {SUB.map((s) => {
        const active = s.exact ? pathname === s.href : pathname === s.href || pathname.startsWith(s.href + '/')
        const Icon = s.icon
        return (
          <Link key={s.href} href={s.href}
            className="flex items-center gap-2.5 rounded-[9px] px-3 py-[9px] text-[13px] font-medium transition-colors"
            style={active ? { background: 'rgba(0,168,132,0.10)', color: C.tealDark, fontWeight: 600 } : { color: C.ink2 }}>
            <Icon size={16} strokeWidth={1.8} style={{ opacity: active ? 1 : 0.8 }} />
            <span className="flex-1 truncate">{s.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
