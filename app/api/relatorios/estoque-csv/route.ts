import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { exigirPermissaoApi, temPermissao } from '@/lib/sessao'
import { JUNCAO_CUSTO_UNIDADE, custoDaUnidade } from '@/lib/custo'
import { buscarTudo } from '@/lib/zapintel/conversas'
import { carregarConfigEmpresa, ligadosDaEmpresa } from '@/lib/empresa-config'
import { HREF_CELULARES } from '@/components/modules/celulares/modulo'
import { RELATORIOS_CELULAR } from '@/components/modules/celulares/rotulos'

/**
 * CSV DE ESTOQUE DOS RELATÓRIOS, MONTADO NO SERVIDOR (etapa 1.1e, custo protegido; docs/etapa-1.1-plano.md §4.4).
 *
 * Até aqui o navegador lia `estoque_unidades.preco_custo` direto (relatorios-view), e a coluna antiga responde a
 * qualquer um da loja. Agora:
 *   - exportar exige `core.exportar` (403 sem ela, como /api/exportar);
 *   - o custo só entra com `estoque.ver_custo`, e vem do satélite (`estoque_unidades_custos`, pela junção que a
 *     RLS só abre com a permissão) — sem ela a junção nem é pedida e a coluna Custo não existe no arquivo;
 *   - custo pendente (nulo) sai em branco, nunca "0";
 *   - o IMEI só com o módulo Celulares ligado (decidido aqui, não pelo navegador);
 *   - a leitura é paginada até o fim (antes parava nas 1.000 do PostgREST, sem aviso).
 * A sessão é a de quem pede: empresa e loja continuam com a RLS.
 */

/** Texto que começa com = + - @ vira fórmula no Excel (mesma proteção de /api/exportar). */
function celula(v: unknown): string {
  if (v == null) return ''
  let s = String(v)
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

type Embed<T> = T | T[] | null
type LinhaUnidade = {
  id: number; imei: string | null; numero_serie: string | null; estado: string | null; status: string | null
  preco_venda: number | null
  produtos: Embed<{ nome: string | null }>
  custo?: Embed<{ preco_custo: number | null; custo_reparo: number | null; custo_origem: string | null }>
}

export async function GET() {
  const acesso = await exigirPermissaoApi('core.exportar')
  if (acesso.erro) return acesso.erro
  const { ctx } = acesso
  const empresaId = ctx.empresa_id!
  const verCusto = temPermissao(ctx, 'estoque.ver_custo')

  const supabase = await createClient()
  const db = supabase as unknown as SupabaseClient
  const celulares = ligadosDaEmpresa(await carregarConfigEmpresa(db, empresaId)).has(HREF_CELULARES)

  const colunas = 'id, imei, numero_serie, estado, status, preco_venda, produtos:estoque_produtos!produto_id(nome)'
    + (verCusto ? `, ${JUNCAO_CUSTO_UNIDADE}` : '')
  let unidades: LinhaUnidade[]
  try {
    unidades = await buscarTudo<LinhaUnidade>((de, ate, primeira) =>
      db.from('estoque_unidades')
        .select(colunas, primeira ? { count: 'exact' } : undefined)
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .order('id', { ascending: false })
        .range(de, ate),
    )
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Falha ao ler o estoque' }, { status: 500 })
  }

  const cabecalho = ['Produto', ...(celulares ? [RELATORIOS_CELULAR.colunaImei] : []), 'Nº Série', 'Estado', 'Status',
    ...(verCusto ? ['Custo'] : []), 'Venda']
  const linhas = unidades.map((u) => {
    const prod = Array.isArray(u.produtos) ? u.produtos[0] : u.produtos
    return [
      prod?.nome ?? '', ...(celulares ? [u.imei ?? ''] : []), u.numero_serie ?? '', u.estado ?? '', u.status ?? '',
      // Custo pendente fica em branco: "0" pareceria custo lançado.
      ...(verCusto ? [custoDaUnidade(u)?.preco_custo ?? ''] : []),
      u.preco_venda ?? 0,
    ]
  })

  // BOM para o Excel reconhecer UTF-8 (acentos). O nome do arquivo (dia da loja) é dado pela tela.
  const corpo = '﻿' + [cabecalho, ...linhas].map((r) => r.map(celula).join(',')).join('\n')
  return new Response(corpo, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="estoque.csv"',
      'Cache-Control': 'no-store',
      'X-Linhas': String(linhas.length),
    },
  })
}
