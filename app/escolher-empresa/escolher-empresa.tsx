'use client'

import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { Button, Card, notify } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'

export function EscolherEmpresa({ empresas }: { empresas: { id: number; nome: string }[] }) {
  const [ocupado, setOcupado] = useState<number | null>(null)
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-bg px-4">
      <Card className="w-full max-w-[420px]">
        <div className="space-y-4 p-2">
          <div>
            <h1 className="text-[18px] font-semibold text-ink">Escolha a empresa</h1>
            <p className="mt-1 text-[13px] text-ink-2">Você faz parte de mais de uma empresa. Depois dá para trocar pelo seletor no topo.</p>
          </div>
          <ul className="space-y-2">
            {empresas.map((e) => (
              <li key={e.id}>
                <Button variant="outline" className="w-full justify-start" icon={<Building2 size={15} strokeWidth={1.8} />}
                  loading={ocupado === e.id} disabled={ocupado !== null}
                  onClick={async () => {
                    setOcupado(e.id)
                    const { error } = await createClient().rpc('trocar_empresa_ativa' as never, { p_empresa: e.id } as never)
                    if (error) { setOcupado(null); notify.bad('Não foi possível entrar nesta empresa', error.message); return }
                    // recarga completa de propósito: menu, módulos e caches do navegador são da empresa anterior
                    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                    window.location.assign('/dashboard')
                  }}>
                  {e.nome}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </main>
  )
}
