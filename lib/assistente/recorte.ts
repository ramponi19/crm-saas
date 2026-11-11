import type { SupabaseClient } from '@supabase/supabase-js'
import type { Acesso } from './acesso'
import { rotuloDaLoja, type Recorte } from './ferramentas'

/**
 * O RECORTE DO ASSISTENTE, DECIDIDO NO SERVIDOR (10/11/2026).
 *
 * No smoke de 10/11 o painel do ZapIntel estava em "toda a rede" e o
 * Assistente respondeu só de Mogi Guaçu: ele lia pela RLS, e a RLS segue a
 * loja escolhida no CRM (`filial_atual()`), não a do menu do ZapIntel. Pedido
 * do Lucas: o Assistente usa o recorte da tela do ZapIntel, validado no
 * servidor contra as lojas que a pessoa pode ver.
 *
 * O corpo da requisição só diz QUAL loja a tela mostra. Quem decide se ela
 * pode é o banco, com a sessão de quem pergunta:
 *   - ZapIntel → `zapintel_escopo` (a mesma trava das telas do ZapIntel: só
 *     dono, admin e suporte; empresa da sessão; loja dentro do alcance). Passou,
 *     a leitura é o service role — sempre com `empresa_id` e a loja do recorte.
 *   - CRM → `filiais_visiveis()` (a RLS de sempre); a leitura é a sessão.
 */

export interface PedidoDeRecorte { zapintel?: unknown; filial?: unknown }

export type RecorteDoServidor =
  | { recorte: Recorte; ler?: SupabaseClient; lojas: string[] }
  | { erro: string; status: number }

/** "JM Store Importados" → "Rede JM". */
export const rotuloDaRede = (empresa: string): string => `Rede ${empresa.trim().split(/\s+/)[0] || 'da empresa'}`

const PAPEIS_QUE_ESCOLHEM = new Set(['owner', 'admin', 'superadmin'])

export async function recorteDoServidor(o: {
  db: SupabaseClient
  svc: SupabaseClient
  empresaId: number
  empresaNome: string
  acesso: Acesso
  pedido: unknown
}): Promise<RecorteDoServidor> {
  const { data: lojasRaw } = await o.svc.from('filiais').select('id, nome, cidade').eq('empresa_id', o.empresaId)
  const lojas = ((lojasRaw ?? []) as { id: number; nome: string; cidade: string | null }[])
    .map((f) => ({ id: Number(f.id), rotulo: rotuloDaLoja(f) }))
  const rotuloDe = (id: number) => lojas.find((f) => f.id === id)?.rotulo ?? `loja ${id}`
  const rede = lojas.length > 1 ? rotuloDaRede(o.empresaNome) : o.empresaNome
  const nomes = (alcance: number[]) => lojas.filter((f) => alcance.includes(f.id)).map((f) => f.rotulo)

  const p = (o.pedido && typeof o.pedido === 'object' ? o.pedido : null) as PedidoDeRecorte | null
  if (p?.zapintel === true) {
    const filial = p.filial == null ? null : Number(p.filial)
    if (filial != null && !(Number.isInteger(filial) && filial > 0)) return { erro: 'Loja inválida.', status: 400 }
    const { data, error } = await o.db.rpc('zapintel_escopo', { p_filial: null, p_empresa: o.empresaId })
    const linha = (Array.isArray(data) ? data[0] : data) as { empresa: number; filiais: number[] } | null
    if (error || !linha) return { erro: 'O ZapIntel é do dono e dos administradores da empresa.', status: 403 }
    if (Number(linha.empresa) !== o.empresaId) return { erro: 'Empresa fora do seu acesso.', status: 403 }
    const alcance = (linha.filiais ?? []).map(Number)
    if (filial != null && !alcance.includes(filial)) return { erro: 'Essa loja está fora do seu alcance.', status: 403 }
    return {
      recorte: { alcance, loja: filial, rotulo: filial != null ? rotuloDe(filial) : rede, escolheLoja: true },
      ler: o.svc,
      lojas: nomes(alcance),
    }
  }

  // CRM: a RLS de sempre. Uma loja só no alcance (sem o 0 da "rede") = a loja escolhida no CRM.
  const { data: vis } = await o.db.rpc('filiais_visiveis')
  const alcance = ((vis ?? []) as number[]).map(Number)
  const reais = alcance.filter((id) => id > 0)
  const loja = reais.length === 1 && !alcance.includes(0) && lojas.length > 1 ? reais[0] : null
  return {
    recorte: {
      alcance, loja, rotulo: loja != null ? rotuloDe(loja) : rede,
      escolheLoja: PAPEIS_QUE_ESCOLHEM.has(o.acesso.papel),
    },
    lojas: nomes(alcance),
  }
}
