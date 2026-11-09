// ANTES × DEPOIS do fuso da empresa, com números (10/11/2026). Banco LOCAL, empresa 1.
//   node --import ./tests/alias.mjs tests/e2e/fuso-antes-depois.mts
// "Antes" = o código de 09/11 rodando como na Vercel (processo em UTC); "depois" = lib/datas no
// fuso da empresa (Brasília). As vendas e os lançamentos do teste levam a marca PROVA FUSO e são
// apagados no fim, passe ou falhe. As vendas reais da cópia local entram nas contas também.
import { execFileSync } from 'node:child_process'
import { inicioDosPeriodos } from '@/lib/painel/metricas'
import { formatarData, mesNoFuso } from '@/lib/datas'

const sql = (q: string) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe',
  ['host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-F', '|', '-c', q],
  { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim().replace(/\r/g, '')
const SP = 'America/Sao_Paulo'
const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

/** inicioDosPeriodos de ANTES (09/11), com o "agora" injetado; roda no fuso do processo. */
function periodosAntigos(now: Date): Record<string, Date> {
  const hoje = new Date(now); hoje.setHours(0, 0, 0, 0)
  const mes = new Date(now.getFullYear(), now.getMonth(), 1)
  return { hoje, mes }
}

const MARCA = 'PROVA FUSO'
const limpar = () => {
  sql(`delete from vendas_vendas where empresa_id=1 and observacoes = '${MARCA}'`)
  sql(`delete from financeiro_lancamentos where empresa_id=1 and descricao like '${MARCA}%'`)
}
let falhas = 0
try {
  limpar()
  // Vendas à noite: 05/11 às 22h30 (antes das 9h do dia 06 ela "vira" de dia) e 30/11 às 22h40.
  sql(`insert into vendas_vendas (empresa_id, valor_venda, status, data_venda, observacoes) values
    (1, 1000, 'concluida', '2026-11-05 22:30-03', '${MARCA}'),
    (1, 2500, 'concluida', '2026-11-30 22:40-03', '${MARCA}'),
    (1, 800,  'concluida', '2026-11-30 15:00-03', '${MARCA}')`)
  sql(`insert into financeiro_lancamentos (empresa_id, tipo, descricao, valor, data_venc, status) values
    (1, 'despesa', '${MARCA} aluguel', 3500, '2026-11-10', 'pendente'),
    (1, 'despesa', '${MARCA} fornecedor', 1200, '2026-11-30', 'pendente'),
    (1, 'receita', '${MARCA} cliente', 900, '2026-12-01', 'pendente')`)

  // O instante em ms (o texto do psql vem com `+00`, sem minutos, que o JavaScript não lê).
  const vendas = sql(`select (extract(epoch from data_venda) * 1000)::bigint, valor_venda from vendas_vendas where empresa_id=1 and status='concluida' and data_venda >= '2026-10-01'`)
    .split('\n').filter(Boolean).map((l) => { const [ms, v] = l.split('|'); return { em: new Date(Number(ms)), v: Number(v) } })
  // Até o "agora" simulado: as vendas do teste em 30/11 estão no futuro de quem olha em 07/11.
  const somar = (de: Date, ate?: Date) => {
    const x = vendas.filter((s) => s.em >= de && (!ate || s.em < ate))
    return { n: x.length, v: x.reduce((a, s) => a + s.v, 0) }
  }

  console.log('\n── KPI "Hoje" do painel ─────────────────────────────────────────')
  for (const [rotulo, quando] of [
    ['07/11 (sábado) às 21h30', '2026-11-07T21:30:00-03:00'],
    ['06/11 às 09h00', '2026-11-06T09:00:00-03:00'],
  ] as const) {
    const agora = new Date(quando)
    process.env.TZ = 'UTC'
    const antes = somar(periodosAntigos(agora).hoje, agora)
    process.env.TZ = SP
    const depois = somar(inicioDosPeriodos(agora, SP).hoje, agora)
    console.log(`${rotulo}: antes ${antes.n} vendas / ${brl(antes.v)}  →  depois ${depois.n} vendas / ${brl(depois.v)}`)
  }

  console.log('\n── Vendas do mês na virada ──────────────────────────────────────')
  for (const [rotulo, quando] of [
    ['30/11 às 21h01', '2026-11-30T21:01:00-03:00'],
    ['30/11 às 23h00 (depois da venda das 22h40)', '2026-11-30T23:00:00-03:00'],
    ['01/12 às 00h01', '2026-12-01T00:01:00-03:00'],
  ] as const) {
    const agora = new Date(quando)
    process.env.TZ = 'UTC'
    const pa = periodosAntigos(agora)
    const antes = somar(pa.mes, agora)
    const mesAntes = pa.mes.toISOString().slice(0, 7)
    process.env.TZ = SP
    const pn = inicioDosPeriodos(agora, SP)
    const depois = somar(pn.mes, agora)
    console.log(`${rotulo}: antes mês ${mesAntes} = ${antes.n} vendas / ${brl(antes.v)}  →  depois mês ${mesNoFuso(agora, SP)} = ${depois.n} vendas / ${brl(depois.v)}`)
  }

  console.log('\n── Vencimentos no CSV financeiro (navegador em Brasília) ────────')
  const lanc = sql(`select descricao, data_venc from financeiro_lancamentos where empresa_id=1 and descricao like '${MARCA}%' order by data_venc`)
    .split('\n').filter(Boolean).map((l) => l.split('|'))
  process.env.TZ = SP
  let errados = 0
  for (const [desc, venc] of lanc) {
    const antes = new Date(venc).toLocaleDateString('pt-BR') // o código de antes
    const depois = formatarData(venc)
    if (antes !== depois) errados++
    console.log(`${desc.replace(MARCA + ' ', '')}: vencimento ${venc} → antes "${antes}", depois "${depois}"`)
  }
  console.log(`CSV antes: ${errados} de ${lanc.length} vencimentos com um dia a menos; depois: 0`)
  if (errados !== lanc.length) { falhas++; console.log('FALHA: esperava todos errados no código antigo') }
} catch (e) {
  falhas++; console.log('FALHA', e)
} finally {
  limpar()
  console.log(`\nlinhas do teste apagadas: vendas ${sql(`select count(*) from vendas_vendas where observacoes='${MARCA}'`)}, lançamentos ${sql(`select count(*) from financeiro_lancamentos where descricao like '${MARCA}%'`)}`)
  process.exit(falhas ? 1 : 0)
}
