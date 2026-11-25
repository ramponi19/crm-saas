'use client'

import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { notify } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'

/**
 * Seletor de empresa (etapa 1.1b): só aparece para quem tem vínculo ativo com mais de uma empresa. Trocar é uma
 * RPC auditada (trocar_empresa_ativa), que também volta a loja para "Rede"; depois a página recarrega inteira,
 * porque menu, módulos e caches são da empresa.
 */
export function SeletorEmpresa({ empresas, atual }: { empresas: { id: number; nome: string }[]; atual: number | null }) {
  const [ocupado, setOcupado] = useState(false)
  return (
    <div className="flex items-center gap-2 border-b border-line bg-card px-4 py-1.5 text-[12.5px] text-ink-2">
      <Building2 size={14} strokeWidth={1.8} className="shrink-0" />
      <label htmlFor="seletor-empresa">Empresa:</label>
      <select
        id="seletor-empresa"
        value={atual ?? ''}
        disabled={ocupado}
        onChange={async (e) => {
          const id = Number(e.target.value)
          if (!id || id === atual) return
          setOcupado(true)
          const { error } = await createClient().rpc('trocar_empresa_ativa' as never, { p_empresa: id } as never)
          if (error) { setOcupado(false); notify.bad('Não foi possível trocar de empresa', error.message); return }
          // recarga completa de propósito: menu, módulos e caches do navegador são da empresa anterior
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign('/dashboard')
        }}
        className="h-7 rounded-control border border-line bg-card px-2 text-[12.5px] text-ink"
      >
        {empresas.map((emp) => <option key={emp.id} value={emp.id}>{emp.nome}</option>)}
      </select>
    </div>
  )
}
