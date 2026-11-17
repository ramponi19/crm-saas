'use client'

import { useState } from 'react'
import { Select } from '@/components/ui'
import { APPLE_MODELOS, type AppleModelo } from '@/lib/apple-modelos'

/**
 * "Modelo Apple (opcional — preenche tudo)" no cadastro de produto — do módulo
 * Celulares. Escolher um modelo devolve nome, cores e armazenamentos para o
 * formulário do core preencher; a marca Apple, se a loja tiver, vem junto.
 */
export function SeletorModeloApple({ onEscolher }: { onEscolher: (m: AppleModelo) => void }) {
  const [valor, setValor] = useState('')
  return (
    <Select label="Modelo Apple (opcional — preenche tudo)" value={valor} onChange={e => {
      setValor(e.target.value)
      const m = APPLE_MODELOS.find((x) => x.nome === e.target.value)
      if (m) onEscolher(m)
    }}>
      <option value="">Preencher manualmente…</option>
      {(['iPhone', 'iPad', 'Mac', 'Watch'] as const).map((linha) => (
        <optgroup key={linha} label={linha}>
          {APPLE_MODELOS.filter((m) => m.linha === linha).map((m) => <option key={m.nome} value={m.nome}>{m.nome}</option>)}
        </optgroup>
      ))}
    </Select>
  )
}

/** A marca Apple entre as marcas da loja, se existir. */
export const marcaApple = (marcas: { id: number; nome: string }[]) => marcas.find((mc) => /apple/i.test(mc.nome))
