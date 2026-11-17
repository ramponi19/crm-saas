'use client'

import { useEffect, useState } from 'react'
import type { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui'
import type { ModeloApple } from '@/lib/apple-modelos'

/**
 * A ENTRADA DE APARELHO NO ESTOQUE — as peças do módulo Celulares que o
 * formulário de entrada do core usa quando a categoria do produto é de aparelho
 * (lib/estoque-campos → CAMPOS_CELULAR): número de modelo Apple, IMEI 1 com a
 * consulta de aparelho impedido, IMEI 2.
 */

/** O que a busca pelo número de série/IMEI achou no histórico da própria loja. */
export type AchadoSerie =
  | { tipo: 'duplicado'; rotulo: string; status: string }
  | { tipo: 'conhecido'; rotulo: string; quando: string | null }

export type ConsultaImei = { resultado: string; motivo: string | null; quando: string }

export const TEXTOS_IMEI = {
  reprovadoTitulo: 'IMEI reprovado na consulta de aparelhos impedidos',
  reprovadoTexto: (motivo: string | null): string =>
    (motivo ? `Motivo: ${motivo}. Não cadastre este aparelho.` : 'Não cadastre este aparelho.'),
}

/**
 * Última consulta de bloqueio deste IMEI. Reprovado = aparelho impedido, e a
 * entrada é barrada: cadastrar aparelho de origem duvidosa no estoque é o
 * problema que o CRM tem de ajudar a evitar, não registrar bonitinho.
 */
export function useConsultaImei({ ativo, imei, empresaId, supabase }: {
  ativo: boolean; imei: string; empresaId: number
  supabase: ReturnType<typeof createClient>
}): ConsultaImei | null {
  const [consultaImei, setConsultaImei] = useState<ConsultaImei | null>(null)
  useEffect(() => {
    const d = imei.replace(/\D/g, '')
    if (!ativo || d.length !== 15) { setConsultaImei(null); return }
    let cancelado = false
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('estoque_imei_consultas')
        .select('resultado, motivo, consultado_em')
        .eq('empresa_id', empresaId).eq('imei', d)
        .order('consultado_em', { ascending: false }).limit(1)
      if (cancelado) return
      const c = (data ?? [])[0] as { resultado: string; motivo: string | null; consultado_em: string } | undefined
      setConsultaImei(c ? { resultado: c.resultado, motivo: c.motivo, quando: c.consultado_em } : null)
    }, 450)
    return () => { cancelado = true; clearTimeout(t) }
  }, [imei, ativo, empresaId, supabase])
  return consultaImei
}

/**
 * Número de MODELO da Apple (o "A" atrás do aparelho e em Ajustes > Geral >
 * Sobre). Diz QUAL É o aparelho: modelo, capacidades e cores possíveis.
 *
 * Não confundir com IMEI. O número de modelo é do MODELO, não da peça: todo
 * iPhone 15 Pro Max vendido aqui é A3106. Ele não identifica a unidade e não
 * serve para detectar duplicata — quem faz isso é o IMEI, no campo abaixo.
 */
export function CampoModeloApple({ valor, onChange, modelo, noCatalogo }: {
  valor: string
  onChange: (v: string) => void
  modelo: (ModeloApple & { codigo: string }) | null
  /** Há produto no catálogo com o nome do modelo reconhecido. */
  noCatalogo: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Input
        label="Número de modelo (atrás do aparelho ou em Ajustes › Geral › Sobre)"
        value={valor}
        onChange={e => onChange(e.target.value.toUpperCase())}
        placeholder="A3106 — traz modelo, capacidades e cores"
        className="num"
        autoFocus
      />
      {modelo ? (
        <span className="text-[11.5px] text-ok">
          {modelo.codigo} = <strong className="font-semibold">{modelo.modelo}</strong>
          {noCatalogo
            ? ' — produto selecionado no catálogo.'
            : ' — não há esse produto no catálogo ainda; escolha abaixo ou cadastre em Produtos.'}
        </span>
      ) : valor.trim().length >= 4 ? (
        <span className="text-[11.5px] text-ink-3">
          Número de modelo não reconhecido. Siga pelo catálogo abaixo.
        </span>
      ) : null}
    </div>
  )
}

/** IMEI 1: o campo, o que o histórico da loja já sabe dele e a consulta de bloqueio. */
export function CampoImei({ valor, onChange, buscando, achado, rotuloStatus, consulta, fmtData }: {
  valor: string
  onChange: (v: string) => void
  buscando: boolean
  achado: AchadoSerie | null
  rotuloStatus: (status: string) => string
  consulta: ConsultaImei | null
  fmtData: (iso: string) => string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Input label="IMEI 1" value={valor} onChange={e => onChange(e.target.value.replace(/\s/g, ''))} placeholder="Bipe ou digite" className="num" />
      {buscando && <span className="text-[11.5px] text-ink-3">Procurando no histórico da loja…</span>}
      {!buscando && achado?.tipo === 'duplicado' && (
        <span className="text-[11.5px] font-medium text-bad">
          Já está no estoque ({achado.rotulo} · {rotuloStatus(achado.status)}) — dois cadastros do mesmo aparelho fazem a contagem mentir.
        </span>
      )}
      {!buscando && achado?.tipo === 'conhecido' && (
        <span className="text-[11.5px] text-ok">
          Já passou pela loja{achado.quando ? ` em ${fmtData(achado.quando)}` : ''} — dados preenchidos; confira os preços.
        </span>
      )}

      {/* Bloqueio: o resultado da consulta de aparelho impedido. */}
      {(() => {
        const d = valor.replace(/\D/g, '')
        if (d.length !== 15) return null
        if (!consulta) {
          return (
            <span className="text-[11.5px] text-warn">
              IMEI não consultado na base de aparelhos impedidos.{' '}
              <a href="/estoque/imei" target="_blank" rel="noopener" className="font-medium underline">Consultar agora</a>
            </span>
          )
        }
        const quando = fmtData(consulta.quando)

        if (consulta.resultado === 'reprovado') {
          return (
            <span className="text-[11.5px] font-semibold text-bad">
              REPROVADO na consulta de {quando}
              {consulta.motivo ? ` — ${consulta.motivo}` : ''}. Aparelho impedido não deve entrar no estoque.
            </span>
          )
        }
        if (consulta.resultado === 'aprovado') {
          return <span className="text-[11.5px] text-ok">Aprovado na consulta de {quando} — sem impedimento.</span>
        }
        return <span className="text-[11.5px] text-warn">Consulta de {quando} ficou inconclusiva.</span>
      })()}
    </div>
  )
}

export function CampoImei2({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <Input label="IMEI 2 (dual SIM)" value={valor} onChange={e => onChange(e.target.value.replace(/\s/g, ''))} placeholder="Se houver" className="num" />
  )
}
