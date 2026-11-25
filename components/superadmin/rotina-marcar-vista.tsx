'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, notify } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'

/** "Marcar como visto": tira a execução com erro do aviso (ela continua registrada). */
export function RotinaMarcarVista({ id }: { id: number }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)
  return (
    <Button size="sm" variant="outline" loading={ocupado} onClick={async () => {
      setOcupado(true)
      const { error } = await createClient().rpc('rotina_execucao_reconhecer' as never, { p_id: id } as never)
      setOcupado(false)
      if (error) { notify.bad('Não foi possível marcar', error.message); return }
      router.refresh()
    }}>Marcar como visto</Button>
  )
}
