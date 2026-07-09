import { createServiceClient } from '@/lib/supabase/service'

/**
 * Integração FIPE — SEM intermediário. Consulta a fonte da própria FIPE
 * (veiculos.fipe.org.br) e mantém um CACHE no nosso banco (fipe_referencia +
 * fipe_consultas). O CRM lê do nosso banco → resiliente a quedas da fonte
 * (o valor só muda 1×/mês). Refresh do mês de referência é lazy (ao consultar)
 * e também via cron/botão manual.
 *
 * Tipos FIPE: 1 = carro, 2 = moto, 3 = caminhão.
 */

const BASE = 'https://veiculos.fipe.org.br/api/veiculos'
const REF_TTL_MS = 24 * 3600 * 1000 // revalida o mês de referência 1×/dia

type Svc = ReturnType<typeof createServiceClient>
export interface Opcao { label: string; value: string }
export interface ValorFipe {
  valor: number | null
  valorTexto: string | null
  codigoFipe: string | null
  mesReferencia: string | null
  marca: string | null
  modelo: string | null
  anoModelo: number | null
}

async function fipePost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Referer: 'https://veiculos.fipe.org.br',
      'User-Agent': 'Mozilla/5.0 (compatible; NexusCRM/1.0)',
    },
    body: JSON.stringify(body),
    // sem cache do fetch: o cache é a nossa tabela
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`FIPE ${path} → HTTP ${res.status}`)
  return res.json() as Promise<T>
}

/** "R$ 68.533,00" → 68533.00 */
export function parseValor(s: string | null | undefined): number | null {
  if (!s) return null
  const limpo = s.replace(/[R$\s.]/g, '').replace(',', '.')
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

/** Busca na fonte o mês de referência mais recente e grava. */
export async function atualizarReferencia(svc: Svc = createServiceClient()): Promise<{ codigo: number | null; mes: string | null }> {
  const tabela = await fipePost<Array<{ Codigo: number; Mes: string }>>('ConsultarTabelaDeReferencia', {})
  const maisRecente = tabela.reduce((a, b) => (b.Codigo > a.Codigo ? b : a), tabela[0])
  const codigo = maisRecente?.Codigo ?? null
  const mes = maisRecente?.Mes?.trim() ?? null
  await svc.from('fipe_referencia').update({ codigo, mes, atualizado_em: new Date().toISOString() }).eq('id', 1)
  return { codigo, mes }
}

/** Mês de referência atual (revalida se estiver velho; resiliente: mantém o último se a fonte cair). */
export async function getReferenciaAtual(svc: Svc = createServiceClient()): Promise<{ codigo: number | null; mes: string | null }> {
  const { data } = await svc.from('fipe_referencia').select('codigo, mes, atualizado_em').eq('id', 1).maybeSingle()
  const velho = !data?.atualizado_em || (Date.now() - new Date(data.atualizado_em).getTime()) > REF_TTL_MS
  if (data?.codigo && !velho) return { codigo: data.codigo, mes: data.mes }
  try {
    return await atualizarReferencia(svc)
  } catch {
    // fonte indisponível → usa o último conhecido (pode ser null se nunca sincronizou)
    return { codigo: data?.codigo ?? null, mes: data?.mes ?? null }
  }
}

export async function fetchMarcas(codigo: number, tipo: number): Promise<Opcao[]> {
  const r = await fipePost<Array<{ Label: string; Value: string }>>('ConsultarMarcas', { codigoTabelaReferencia: codigo, codigoTipoVeiculo: tipo })
  return r.map((m) => ({ label: m.Label, value: String(m.Value) }))
}

export async function fetchModelos(codigo: number, tipo: number, marca: number): Promise<Opcao[]> {
  const r = await fipePost<{ Modelos: Array<{ Label: string; Value: number }> }>('ConsultarModelos', { codigoTabelaReferencia: codigo, codigoTipoVeiculo: tipo, codigoMarca: marca })
  return (r.Modelos ?? []).map((m) => ({ label: m.Label, value: String(m.Value) }))
}

export async function fetchAnos(codigo: number, tipo: number, marca: number, modelo: number): Promise<Opcao[]> {
  const r = await fipePost<Array<{ Label: string; Value: string }>>('ConsultarAnoModelo', { codigoTabelaReferencia: codigo, codigoTipoVeiculo: tipo, codigoMarca: marca, codigoModelo: modelo })
  return r.map((a) => ({ label: a.Label, value: String(a.Value) }))
}

/** Valor FIPE de um veículo. Lê do cache do mês; se faltar, busca na fonte e grava. */
export async function consultarValor(
  args: { tipo: number; marca: number; modelo: number; ano: string; marcaNome?: string; modeloNome?: string; anoLabel?: string },
  svc: Svc = createServiceClient(),
): Promise<ValorFipe> {
  const { tipo, marca, modelo, ano } = args
  const { codigo } = await getReferenciaAtual(svc)
  if (!codigo) throw new Error('Referência FIPE indisponível')

  const { data: cache } = await svc
    .from('fipe_consultas')
    .select('valor, codigo_fipe, mes_referencia, marca_nome, modelo_nome, ano')
    .eq('tipo', tipo).eq('codigo_marca', marca).eq('codigo_modelo', modelo).eq('ano', ano).eq('referencia_codigo', codigo)
    .maybeSingle()
  if (cache) {
    return {
      valor: cache.valor, valorTexto: null, codigoFipe: cache.codigo_fipe, mesReferencia: cache.mes_referencia,
      marca: cache.marca_nome, modelo: cache.modelo_nome, anoModelo: Number(cache.ano?.split('-')[0]) || null,
    }
  }

  const [anoModeloStr, combustivel] = ano.split('-')
  const r = await fipePost<{ Valor?: string; CodigoFipe?: string; MesReferencia?: string; Marca?: string; Modelo?: string; AnoModelo?: number }>(
    'ConsultarValorComTodosParametros',
    {
      codigoTabelaReferencia: codigo, codigoTipoVeiculo: tipo, codigoMarca: marca, codigoModelo: modelo,
      ano, anoModelo: Number(anoModeloStr) || null, codigoTipoCombustivel: Number(combustivel) || 1,
      tipoConsulta: 'tradicional',
    },
  )
  const valor = parseValor(r.Valor)
  const out: ValorFipe = {
    valor, valorTexto: r.Valor ?? null, codigoFipe: r.CodigoFipe ?? null, mesReferencia: r.MesReferencia?.trim() ?? null,
    marca: r.Marca ?? args.marcaNome ?? null, modelo: r.Modelo ?? args.modeloNome ?? null, anoModelo: r.AnoModelo ?? (Number(anoModeloStr) || null),
  }
  // grava no cache (idempotente por unique)
  await svc.from('fipe_consultas').upsert({
    tipo, codigo_marca: marca, codigo_modelo: modelo, ano, referencia_codigo: codigo,
    marca_nome: out.marca, modelo_nome: out.modelo, ano_label: args.anoLabel ?? null,
    valor: out.valor, codigo_fipe: out.codigoFipe, mes_referencia: out.mesReferencia,
  }, { onConflict: 'tipo,codigo_marca,codigo_modelo,ano,referencia_codigo' })
  return out
}
