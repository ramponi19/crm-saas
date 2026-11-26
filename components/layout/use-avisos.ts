'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/components/ui'
import { NADA_GRAVADO, nadaGravado } from '@/lib/linhas-afetadas'

/**
 * AVISOS DO SISTEMA PARA A PESSOA (etapa 1.1, P2 — 26/11/2026): hoje, o "Seu cargo foi alterado" quando outro Dono muda o
 * cargo de um Dono. Moram em `usuario_avisos`; a RLS só devolve os da própria pessoa e só deixa marcar `lido_em`.
 * Lê uma vez ao montar o topo (os avisos nascem raramente) e de novo quando o sino abre.
 */
export interface AvisoDaPessoa { id: number; tipo: string; titulo: string; texto: string | null; criado_em: string }

export function useAvisos(sinoAberto: boolean) {
  const [avisos, setAvisos] = useState<AvisoDaPessoa[]>([])

  const carregar = useCallback(async () => {
    const { data } = await createClient().from('usuario_avisos' as never)
      .select('id, tipo, titulo, texto, criado_em').is('lido_em', null).order('criado_em', { ascending: false }).limit(10)
    setAvisos(((data ?? []) as unknown) as AvisoDaPessoa[])
  }, [])

  // ler ao montar e ao abrir o sino: setState só depois da resposta do banco (sistema externo)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void carregar() }, [carregar, sinoAberto])

  const marcarLido = useCallback(async (id: number) => {
    const { data, error } = await createClient().from('usuario_avisos' as never)
      .update({ lido_em: new Date().toISOString() } as never).eq('id', id).select('id')
    if (error || nadaGravado(data)) { notify.bad('Não foi possível marcar o aviso', error?.message ?? NADA_GRAVADO); return }
    setAvisos((atual) => atual.filter((a) => a.id !== id))
  }, [])

  return { avisos, marcarLido }
}
