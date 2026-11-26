'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { Button, Input, Select, Tabs, notify } from '@/components/ui'
import { apiFetch } from '@/lib/api-cliente'

/**
 * DISTRIBUIÇÃO POR LOJA (5b, 26/11/2026). Uma aba por loja; cada bloco salva sozinho pela rota /api/distribuicao/por-loja
 * (funções do banco: só dono/admin, só quem enxerga a loja, auditado). Ausente não sai da lista: é pulado na hora.
 */
export interface ValorLiberacao { ativo: boolean; por_vendedor: number; dias_cliente: number; pular_primeiro_dia: boolean }
interface ListaLoja { ids: string[]; configurada: boolean }
export interface DadosDistribuicao {
  lojas: { id: number; nome: string; roleta: ListaLoja; liberacao: ListaLoja; reserva: ListaLoja; liberacaoValor: ValorLiberacao }[]
  pessoas: { id: string; nome: string; papel: string; ausente: boolean; contaServico: boolean; lojas: number[]; lojaComissao: number | null }[]
}
type Pessoa = DadosDistribuicao['pessoas'][number]

const PAPEL: Record<string, string> = { owner: 'Dono', admin: 'Administrador', vendedor: 'Vendedor', tecnico: 'Técnico' }

async function salvar(corpo: object): Promise<boolean> {
  const r = await apiFetch<{ error?: string }>('/api/distribuicao/por-loja', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  })
  if (r.sessaoExpirada) return false
  if (!r.ok) { notify.bad(r.json.error ?? 'Erro ao salvar'); return false }
  notify.ok('Salvo!')
  return true
}

export function DistribuicaoPorLoja({ dados }: { dados: DadosDistribuicao }) {
  const [aba, setAba] = useState(String(dados.lojas[0]?.id ?? ''))
  const loja = dados.lojas.find((l) => String(l.id) === aba)
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Distribuição</h1>
        <p className="mt-1 text-[13px] text-ink-2">
          Quem recebe leads, o lote da liberação diária e os acompanhamentos do pós-venda, loja por loja. Só aparece para
          escolha quem enxerga a loja (Usuários › Lojas que enxerga). As regras por origem do lead ficam em{' '}
          <Link href="/distribuicao" className="text-accent underline-offset-2 hover:underline">Automações › Distribuição</Link>.
        </p>
      </header>
      {dados.lojas.length > 1 && (
        <Tabs className="mb-4" value={aba} onValueChange={setAba} items={dados.lojas.map((l) => ({ value: String(l.id), label: l.nome }))} />
      )}
      {loja && <AbaLoja key={loja.id} loja={loja} pessoas={dados.pessoas} lojas={dados.lojas} />}
    </div>
  )
}

function AbaLoja({ loja, pessoas, lojas }: { loja: DadosDistribuicao['lojas'][number]; pessoas: Pessoa[]; lojas: DadosDistribuicao['lojas'] }) {
  const daLoja = useMemo(() => pessoas.filter((p) => p.lojas.includes(loja.id) && !p.contaServico), [pessoas, loja.id])
  return (
    <div className="flex flex-col gap-4">
      <BlocoMarcar titulo="Roleta de leads e acompanhamentos" lista="roleta" loja={loja.id} inicial={loja.roleta} pessoas={daLoja}
        ajuda="Recebem, em rodízio, os leads novos desta loja e os acompanhamentos do pós-venda sem vendedor (no pós-venda, só cargo de vendedor)." />
      <BlocoLiberacao loja={loja} pessoas={daLoja} />
      <BlocoReserva loja={loja.id} inicial={loja.reserva} pessoas={daLoja} />
      <BlocoComissao loja={loja.id} pessoas={daLoja} lojas={lojas} />
    </div>
  )
}

function Secao({ titulo, ajuda, children, acao }: { titulo: string; ajuda: React.ReactNode; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-card px-4 py-3.5">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-ink">{titulo}</h2>
          <p className="mt-0.5 text-[12px] text-ink-3">{ajuda}</p>
        </div>
        {acao}
      </div>
      {children}
    </section>
  )
}

function NomePessoa({ p }: { p: Pessoa }) {
  return (
    <span className="text-[13px] text-ink-2">
      {p.nome} <span className="text-[11.5px] text-ink-3">· {PAPEL[p.papel] ?? p.papel}{p.ausente ? ' · ausente agora' : ''}</span>
    </span>
  )
}

function Marcadores({ pessoas, marcados, onChange }: { pessoas: Pessoa[]; marcados: string[]; onChange: (ids: string[]) => void }) {
  if (!pessoas.length) return <p className="text-[12.5px] text-ink-3">Ninguém enxerga esta loja ainda.</p>
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {pessoas.map((p) => (
        <label key={p.id} className="flex items-center gap-2">
          <input type="checkbox" checked={marcados.includes(p.id)}
            onChange={(e) => onChange(e.target.checked ? [...marcados, p.id] : marcados.filter((x) => x !== p.id))} />
          <NomePessoa p={p} />
        </label>
      ))}
    </div>
  )
}

function BlocoMarcar({ titulo, ajuda, lista, loja, inicial, pessoas }: {
  titulo: string; ajuda: string; lista: 'roleta' | 'liberacao'; loja: number; inicial: ListaLoja; pessoas: Pessoa[]
}) {
  const router = useRouter()
  const [marcados, setMarcados] = useState(inicial.ids)
  const [salvando, setSalvando] = useState(false)
  const mudou = [...marcados].sort().join() !== [...inicial.ids].sort().join() || !inicial.configurada
  return (
    <Secao titulo={titulo} ajuda={ajuda} acao={
      <Button size="sm" loading={salvando} disabled={!mudou} onClick={async () => {
        setSalvando(true)
        const ok = await salvar({ acao: 'lista', filialId: loja, lista, usuarios: marcados })
        setSalvando(false)
        if (ok) router.refresh()
      }}>Salvar</Button>
    }>
      {!inicial.configurada && <p className="mb-2 text-[12px] text-warn">Ainda na regra automática (quem participa da roleta nesta loja). Salve para fixar a lista.</p>}
      <Marcadores pessoas={pessoas} marcados={marcados} onChange={setMarcados} />
    </Secao>
  )
}

function BlocoLiberacao({ loja, pessoas }: { loja: DadosDistribuicao['lojas'][number]; pessoas: Pessoa[] }) {
  const router = useRouter()
  const [v, setV] = useState(loja.liberacaoValor)
  const [marcados, setMarcados] = useState(loja.liberacao.ids)
  const [salvando, setSalvando] = useState(false)
  const mudouValor = JSON.stringify(v) !== JSON.stringify(loja.liberacaoValor)
  const mudouLista = [...marcados].sort().join() !== [...loja.liberacao.ids].sort().join() || !loja.liberacao.configurada
  return (
    <Secao titulo="Liberação diária" ajuda="Uma vez por dia, depois da abertura, entrega um lote de negócios sem dono (com conversa recente) para cada pessoa da lista."
      acao={
        <Button size="sm" loading={salvando} disabled={!mudouValor && !mudouLista} onClick={async () => {
          setSalvando(true)
          let ok = true
          if (mudouValor) ok = await salvar({ acao: 'liberacao', filialId: loja.id, valor: v })
          if (ok && mudouLista) ok = await salvar({ acao: 'lista', filialId: loja.id, lista: 'liberacao', usuarios: marcados })
          setSalvando(false)
          if (ok) router.refresh()
        }}>Salvar</Button>
      }>
      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-[13px] text-ink-2 sm:col-span-3">
          <input type="checkbox" checked={v.ativo} onChange={(e) => setV({ ...v, ativo: e.target.checked })} /> Liberação diária ligada nesta loja
        </label>
        <Input label="Negócios por pessoa" type="number" min="0" max="200" value={v.por_vendedor}
          onChange={(e) => setV({ ...v, por_vendedor: Number(e.target.value) })} />
        <Input label="Conversa nos últimos (dias)" type="number" min="1" max="365" value={v.dias_cliente}
          onChange={(e) => setV({ ...v, dias_cliente: Number(e.target.value) })} />
        <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={v.pular_primeiro_dia} onChange={(e) => setV({ ...v, pular_primeiro_dia: e.target.checked })} />
          Pular o 1º dia aberto da semana
        </label>
      </div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[12px] font-medium text-ink-2">Quem recebe</span>
        <Button size="sm" variant="ghost" onClick={() => setMarcados(loja.roleta.ids.filter((id) => pessoas.some((p) => p.id === id)))}>Igual à roleta</Button>
      </div>
      {!loja.liberacao.configurada && <p className="mb-2 text-[12px] text-warn">Ainda igual à roleta (regra automática). Salve para fixar a lista.</p>}
      <Marcadores pessoas={pessoas} marcados={marcados} onChange={setMarcados} />
    </Secao>
  )
}

function BlocoReserva({ loja, inicial, pessoas }: { loja: number; inicial: ListaLoja; pessoas: Pessoa[] }) {
  const router = useRouter()
  const [ordem, setOrdem] = useState(inicial.ids)
  const [salvando, setSalvando] = useState(false)
  const nome = (id: string) => pessoas.find((p) => p.id === id)
  const fora = pessoas.filter((p) => !ordem.includes(p.id))
  const mover = (i: number, d: number) => setOrdem((o) => { const n = [...o]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n })
  return (
    <Secao titulo="Reserva do pós-venda" ajuda="Quando o acompanhamento não tem vendedor e a roleta da loja não tem ninguém livre, vai para o primeiro desta lista que estiver presente e com espaço no dia. Sem ninguém, segue para os administradores e Donos (última reserva)."
      acao={<Button size="sm" loading={salvando} disabled={ordem.join() === inicial.ids.join()} onClick={async () => {
        setSalvando(true)
        const ok = await salvar({ acao: 'lista', filialId: loja, lista: 'reserva_posvenda', usuarios: ordem })
        setSalvando(false)
        if (ok) router.refresh()
      }}>Salvar</Button>}>
      {ordem.length === 0 && <p className="mb-2 text-[12.5px] text-ink-3">Vazia: vai direto para os administradores e Donos.</p>}
      <ol className="mb-2 grid gap-1">
        {ordem.map((id, i) => {
          const p = nome(id)
          return (
            <li key={id} className="flex items-center gap-2 rounded-control border border-line-soft px-2 py-1">
              <span className="w-5 text-[12px] text-ink-3">{i + 1}.</span>
              <span className="flex-1">{p ? <NomePessoa p={p} /> : <span className="text-[12.5px] text-ink-3">pessoa que não enxerga mais a loja</span>}</span>
              <Button size="sm" variant="ghost" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)} icon={<ArrowUp size={13} />} />
              <Button size="sm" variant="ghost" aria-label="Descer" disabled={i === ordem.length - 1} onClick={() => mover(i, 1)} icon={<ArrowDown size={13} />} />
              <Button size="sm" variant="ghost" aria-label="Tirar" onClick={() => setOrdem((o) => o.filter((x) => x !== id))} icon={<X size={13} />} />
            </li>
          )
        })}
      </ol>
      {fora.length > 0 && (
        <Select label="Acrescentar" value="" onChange={(e) => e.target.value && setOrdem((o) => [...o, e.target.value])}>
          <option value="">Escolha uma pessoa…</option>
          {fora.map((p) => <option key={p.id} value={p.id}>{p.nome} · {PAPEL[p.papel] ?? p.papel}</option>)}
        </Select>
      )}
    </Secao>
  )
}

function BlocoComissao({ loja, pessoas, lojas }: { loja: number; pessoas: Pessoa[]; lojas: DadosDistribuicao['lojas'] }) {
  const router = useRouter()
  const [salvando, setSalvando] = useState<string | null>(null)
  if (lojas.length < 2) return null
  return (
    <Secao titulo="Loja da comissão" ajuda="Em que loja a pessoa aparece em Metas e Comissões. As vendas continuam com a loja em que foram feitas.">
      <div className="grid gap-1.5">
        {pessoas.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3">
            <NomePessoa p={p} />
            <select className="rounded-control border border-line bg-card px-2 py-1 text-[12.5px] text-ink-2" disabled={salvando === p.id}
              value={p.lojaComissao ?? ''} onChange={async (e) => {
                setSalvando(p.id)
                const ok = await salvar({ acao: 'comissao', usuarioId: p.id, filialId: Number(e.target.value) })
                setSalvando(null)
                if (ok) router.refresh()
              }}>
              {lojas.filter((l) => p.lojas.includes(l.id)).map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </div>
        ))}
        <p className="mt-1 text-[11.5px] text-ink-3">Mostra quem enxerga {lojas.find((l) => l.id === loja)?.nome ?? 'esta loja'}; a lista de cada pessoa traz só as lojas que ela enxerga.</p>
      </div>
    </Secao>
  )
}
