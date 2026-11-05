/**
 * Prova que REABRIR não apaga ganho nem perda dos relatórios (regra "um card por contato por
 * loja", 05/11/2026). SÓ NO SUPABASE LOCAL.
 *
 * Cria um negócio ganho há 40 dias e outro perdido (com motivo) num contato de teste, lê os
 * relatórios como o DONO (RLS dele) — fechamentos, funil do painel e diagnóstico de conversão —,
 * reabre os dois pela própria core_negocio_do_canal (como a mensagem do cliente faria) e lê de
 * novo: os números têm de ser iguais. Apaga o que criou.
 *
 *   SUPABASE_URL=http://127.0.0.1:54321 ANON_KEY=... SERVICE_ROLE_KEY=... npx tsx scripts/provar-fechamentos.mts
 */
import { createClient } from '@supabase/supabase-js'
import { lerFechamentos } from '@/lib/fechamentos'
import { contagensDoPainel } from '@/lib/painel/metricas'
import { calcularConversao } from '@/lib/conversao'

const URL = process.env.SUPABASE_URL ?? ''
if (!/127\.0\.0\.1|localhost/.test(URL)) { console.error('RECUSADO: só no Supabase local'); process.exit(1) }
const svc = createClient(URL, process.env.SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const dono = createClient(URL, process.env.ANON_KEY!, { auth: { persistSession: false } })
const { error: eLogin } = await dono.auth.signInWithPassword({ email: 'storejmimportados@gmail.com', password: 'teste-local-22' })
if (eLogin) throw eLogin

const EMPRESA = 1, LOJA = 3, T = Date.now()
const falhas: string[] = []
const confere = (ok: boolean, m: string) => { console.log(ok ? 'ok  ' : 'FALHA', m); if (!ok) falhas.push(m) }

async function retrato() {
  const f = await lerFechamentos(dono, EMPRESA)
  const painel = await contagensDoPainel(dono as never, EMPRESA, { soMeu: false, userId: null, papel: 'owner', motivo: 'teste' })
  const conv = await calcularConversao(dono as never, EMPRESA)
  const ganhoConv = conv.funil.find((e) => /convertido|ganho/.test(e.slug))
  return {
    ganhos: f.filter((x) => x.status === 'ganho').length,
    perdas: f.filter((x) => x.status === 'perdido').length,
    painelConvertido: painel.funil.convertido,
    painelPerdido: painel.funil.perdido,
    conversaoGanho: ganhoConv?.naEtapa ?? -1,
  }
}

const { data: funil } = await svc.from('funis').select('id').eq('empresa_id', EMPRESA).eq('padrao', true).eq('interno', false).order('id').limit(1).single()
const { data: etapas } = await svc.from('funil_etapas').select('id, tipo, ordem').eq('funil_id', funil!.id).order('ordem')
const etGanho = etapas!.find((e) => e.tipo === 'ganho')!.id, etPerdido = etapas!.find((e) => e.tipo === 'perdido')?.id ?? null
const { data: motivo } = await svc.from('motivos_perda').select('id').eq('empresa_id', EMPRESA).limit(1).maybeSingle()

const contatos: number[] = []
const negocios: number[] = []
try {
  for (const k of ['g', 'p']) {
    const { data: c } = await svc.from('contatos').insert({ empresa_id: EMPRESA, filial_id: LOJA, nome: `TESTE FECH ${k} ${T}`, ativo: true }).select('id').single()
    contatos.push(c!.id)
  }
  const { data: ng } = await svc.from('negocios').insert({
    empresa_id: EMPRESA, filial_id: LOJA, contato_id: contatos[0], funil_id: funil!.id, etapa_id: etGanho, status: 'ganho',
    ganho_em: new Date(Date.now() - 40 * 86400000).toISOString(), valor_estimado: 3200, dados: { _lead: { ativo: true } },
  }).select('id').single()
  const { data: np } = await svc.from('negocios').insert({
    empresa_id: EMPRESA, filial_id: LOJA, contato_id: contatos[1], funil_id: funil!.id, etapa_id: etPerdido, status: 'perdido',
    perdido_em: new Date(Date.now() - 2 * 86400000).toISOString(), motivo_perda_id: motivo?.id ?? null, dados: { _lead: { ativo: true } },
  }).select('id').single()
  negocios.push(ng!.id, np!.id)

  const antes = await retrato()
  console.log('antes ', JSON.stringify(antes))
  for (const c of contatos) {
    const { data, error } = await svc.rpc('core_negocio_do_canal', { p_empresa: EMPRESA, p_contato: c, p_filial: LOJA, p_primeira_msg: 'voltei', p_so_existente: false })
    if (error) throw error
    confere(negocios.includes(data as number), `reabriu o MESMO negócio (${data})`)
  }
  const { data: depoisNeg } = await svc.from('negocios').select('id, status, ganho_em, perdido_em, motivo_perda_id').in('id', negocios)
  confere((depoisNeg ?? []).every((n) => n.status === 'aberto' && !n.ganho_em && !n.perdido_em && !n.motivo_perda_id), 'os dois voltaram abertos, sem os campos de fechamento')
  const depois = await retrato()
  console.log('depois', JSON.stringify(depois))
  for (const k of Object.keys(antes) as (keyof typeof antes)[]) confere(antes[k] === depois[k], `${k}: ${antes[k]} = ${depois[k]}`)
} finally {
  if (negocios.length) { await svc.from('negocio_historico').delete().in('negocio_id', negocios); await svc.from('negocios').delete().in('id', negocios) }
  if (contatos.length) await svc.from('contatos').delete().in('id', contatos)
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
