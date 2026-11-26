'use client'
import { useCallback, useEffect, useState } from 'react'
import { CircleDollarSign } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button, Card, EmptyState, Input, Table, notify, type Column } from '@/components/ui'
import { useFuso } from '@/components/fuso-provider'
import { formatarDiaMes } from '@/lib/datas'

/**
 * UNIDADES COM CUSTO PENDENTE (etapa 1.1e; docs/etapa-1.1-plano.md §4.4). Só aparece para quem tem estoque.ver_custo.
 *
 * Quem dá entrada sem a permissão (o vendedor) não vê o campo de custo: a unidade nasce com custo pendente e cai
 * aqui. Quem tem a permissão informa o custo (estoque_custo_informar). Se a unidade já foi VENDIDA com o custo
 * pendente, a venda recebe esse custo UMA vez (o banco marca e não deixa mudar de novo); as duas mudanças vão para a
 * Auditoria. Tudo pelo banco: a lista vem de estoque_custos_pendentes, que recusa quem não tem a permissão.
 */
interface Pendente {
  unidade_id: number; filial_id: number | null; produto: string; identificador: string | null
  status: string; criada_em: string; venda_id: number | null
}

const STATUS: Record<string, string> = { disponivel: 'Disponível', reservado: 'Reservada', pendente: 'Troca a receber', vendido: 'Vendida' }

export function CustoPendente({ filiais }: { filiais: { id: number; nome: string }[] }) {
  const supabase = createClient()
  const fuso = useFuso()
  const [linhas, setLinhas] = useState<Pendente[] | null>(null)
  const [custo, setCusto] = useState<Record<number, { c: string; r: string }>>({})
  const [salvando, setSalvando] = useState<number | null>(null)
  const nomeLoja = new Map(filiais.map((f) => [f.id, f.nome]))

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('estoque_custos_pendentes' as never, { p_filial: null } as never)
    if (error) { notify.bad('Não foi possível carregar os pendentes', error.message); setLinhas([]); return }
    setLinhas((data ?? []) as unknown as Pendente[])
  }, [supabase])

  // Busca no banco ao abrir a aba: o setState só acontece depois da resposta da RPC (sistema externo), não no corpo
  // do efeito. A regra não distingue o await; mesmo padrão de publicos-view e transmissao-view.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void carregar() }, [carregar])

  async function informar(l: Pendente) {
    const v = custo[l.unidade_id]
    const c = Number(v?.c)
    if (!v?.c || !Number.isFinite(c) || c < 0) { notify.warn('Informe o custo'); return }
    setSalvando(l.unidade_id)
    const { data, error } = await supabase.rpc('estoque_custo_informar' as never, {
      p_unidade: l.unidade_id, p_custo: c, p_reparo: v.r ? Number(v.r) : null, p_motivo: 'informado na lista de custo pendente',
    } as never)
    setSalvando(null)
    if (error) { notify.bad('Custo não gravado', error.message); return }
    const venda = (data as { venda_preenchida?: number | null } | null)?.venda_preenchida
    notify.ok(venda ? `Custo informado. A venda #${venda} recebeu o custo.` : 'Custo informado.')
    setLinhas((prev) => (prev ?? []).filter((x) => x.unidade_id !== l.unidade_id))
  }

  const set = (id: number, k: 'c' | 'r', valor: string) => setCusto((p) => ({ ...p, [id]: { c: p[id]?.c ?? '', r: p[id]?.r ?? '', [k]: valor } }))

  const colunas: Column<Pendente>[] = [
    { key: 'produto', header: 'Unidade', render: (l) => (
      <div><div className="font-semibold text-ink">{l.produto}</div>{l.identificador && <div className="num text-[12px] text-ink-3">{l.identificador}</div>}</div>
    ) },
    { key: 'status', header: 'Situação', render: (l) => (
      <span className="text-ink-2">{STATUS[l.status] ?? l.status}{l.venda_id ? <span className="ml-1 text-[12px] text-warn">· venda #{l.venda_id} sem custo</span> : null}</span>
    ) },
    ...(filiais.length > 1 ? [{ key: 'loja', header: 'Loja', hideOnMobile: true, render: (l: Pendente) => <span className="text-ink-2">{l.filial_id ? nomeLoja.get(l.filial_id) ?? '—' : '—'}</span> } as Column<Pendente>] : []),
    { key: 'entrada', header: 'Entrada', hideOnMobile: true, className: 'num', render: (l) => <span className="text-ink-2">{formatarDiaMes(l.criada_em, '', fuso)}</span> },
    { key: 'informar', header: '', align: 'right', render: (l) => (
      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
        <Input aria-label="Custo" type="number" min={0} placeholder="Custo" className="num w-[110px]" value={custo[l.unidade_id]?.c ?? ''} onChange={(e) => set(l.unidade_id, 'c', e.target.value)} />
        <Input aria-label="Reparo" type="number" min={0} placeholder="Reparo" className="num w-[100px]" value={custo[l.unidade_id]?.r ?? ''} onChange={(e) => set(l.unidade_id, 'r', e.target.value)} />
        <Button size="sm" loading={salvando === l.unidade_id} onClick={() => informar(l)}>Informar</Button>
      </div>
    ) },
  ]

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-ink-2">
        Unidades que entraram sem custo (entrada feita por quem não vê custo). Informe o custo aqui; se a unidade já foi
        vendida, a venda recebe o custo uma vez e isso fica na Auditoria.
      </p>
      <Card flush>
        <Table
          columns={colunas}
          rows={linhas ?? []}
          rowKey={(l) => l.unidade_id}
          empty={<EmptyState icon={<CircleDollarSign size={22} strokeWidth={1.7} />}
            title={linhas === null ? 'Carregando…' : 'Nenhuma unidade com custo pendente'}
            description={linhas === null ? '' : 'Tudo o que entrou no estoque tem custo informado.'} />}
        />
      </Card>
    </div>
  )
}
