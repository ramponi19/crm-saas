'use client'

import { Bell, Search, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface TopbarProps {
  eyebrow?: string
  title: string
  showPeriods?: boolean
  activePeriod?: string
  onPeriodChange?: (period: string) => void
}

const periods = [
  { value: 'hoje', label: 'Hoje'   },
  { value: '7d',   label: '7 dias' },
  { value: '30d',  label: '30 dias'},
  { value: 'mes',  label: 'Mês'    },
  { value: 'ano',  label: 'Ano'    },
]

export function Topbar({
  eyebrow,
  title,
  showPeriods = false,
  activePeriod = 'mes',
  onPeriodChange,
}: TopbarProps) {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const isDark = !mounted || resolvedTheme === 'dark'

  function toggleTheme() {
    setTheme(isDark ? 'light' : 'dark')
  }

  return (
    <header className="flex items-center gap-5 px-[30px] py-4 border-b border-white/[0.06] bg-[rgba(10,17,30,0.6)] backdrop-blur-md shrink-0 z-10">

      {/* Title */}
      <div className="min-w-0">
        {eyebrow && (
          <div className="font-mono text-[10px] tracking-[0.18em] text-[#F0353D] uppercase">
            {eyebrow}
          </div>
        )}
        <h1 className="font-serif font-normal text-[25px] tracking-[-0.02em] text-[#F4F6F9] mt-[3px] whitespace-nowrap">
          {title}
        </h1>
      </div>

      <div className="flex-1" />

      {/* Period selector */}
      {showPeriods && (
        <div className="flex gap-[3px] p-[3px] rounded-[11px] bg-white/[0.04] border border-white/[0.08]">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => onPeriodChange?.(p.value)}
              className={cn(
                'px-[13px] py-[7px] rounded-[8px] text-[12.5px] font-medium transition-all duration-150',
                activePeriod === p.value
                  ? 'bg-[#E03037] text-white font-bold shadow-[0_4px_12px_rgba(215,40,47,0.35)]'
                  : 'text-[#8A9BB0] hover:text-[#D4DEEA] hover:bg-white/[0.06]'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative flex items-center">
        <Search size={17} className="absolute left-3 text-[#46586E] pointer-events-none" />
        <input
          placeholder="Buscar produto, cliente, IMEI…"
          className="bg-white/[0.04] border border-white/[0.08] rounded-[11px] py-[10px] pl-[38px] pr-[14px] w-[280px] text-[13px] text-[#E9EEF4] placeholder:text-[#46586E] outline-none focus:border-[rgba(215,40,47,0.5)] focus:bg-white/[0.06] transition-all"
        />
      </div>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="w-[42px] h-[42px] rounded-[11px] bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[#9FB0C2] hover:bg-white/[0.08] hover:text-[#F4F6F9] transition-all"
        title={isDark ? 'Mudar para claro' : 'Mudar para escuro'}
      >
        {isDark ? <Moon size={18} /> : <Sun size={18} />}
      </button>

      {/* Notifications */}
      <div className="relative">
        <button className="relative w-[42px] h-[42px] rounded-[11px] bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[#9FB0C2] hover:bg-white/[0.08] transition-colors">
          <Bell size={19} />
          <span className="absolute top-[9px] right-[10px] w-[7px] h-[7px] rounded-full bg-[#F0353D] border-2 border-[#0A111E]" />
        </button>
      </div>
    </header>
  )
}
