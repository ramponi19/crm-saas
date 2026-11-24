import type { SupabaseClient } from '@supabase/supabase-js'
import { diaNoFuso, instanteLocal, somarDias } from '@/lib/datas'
import { semTipo } from '@/lib/posvenda/ligado'
import {
  descricaoDaCompra, diasDesdeAVenda, grupoDoDia, montarMensagem, ordenarFila, rotuloDoPasso,
  type ItemPosVenda, type TipoAcao,
} from '@/lib/posvenda/fila'

/**
 * OS ITENS DA FILA DO PÓS-VENDA (C7 bloco 2). Passos pendentes até o fim dos próximos 7 dias (os atrasados entram
 * todos), pela sessão: a RLS da C1 já limita o vendedor aos dele e deixa o dono/admin ver todos. `so` filtra por
 * responsável (o "Meus" do dono/admin).
 */
type Embed<T> = T | T[] | null
const um = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

interface Linha {
  id: number
  negocio_id: number | null
  filial_id: number | null
  responsavel_id: string
  previsto_para: string
  tentativas: number
  contato: Embed<{ nome: string | null; telefone: string | null }>
  passo: Embed<{ titulo: string; tipo_acao: TipoAcao; roteiro: string | null; dia_offset: number }>
  negocio: Embed<{ ganho_em: string | null; responsavel_id: string | null; produto: string | null; venda: { data?: string; categoria_id?: number | null; condicao?: string } | null }>
  jornada: Embed<{ cadencia: Embed<{ nome: string }> }>
}

export const DIAS_A_FRENTE = 7
export const LIMITE_FILA = 400

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function carregarFilaPosVenda(db: SupabaseClient<any>, opcoes: {
  empresaId: number; fuso: string; rotuloUsado: string; so?: string | null; agora?: Date
}): Promise<{ itens: ItemPosVenda[]; hoje: string; cortado: boolean }> {
  const hoje = diaNoFuso(opcoes.agora ?? new Date(), opcoes.fuso)
  const ate = instanteLocal(somarDias(hoje, DIAS_A_FRENTE + 1), '00:00', opcoes.fuso)
  const s = semTipo(db)

  let q = s.from('posvenda_acompanhamentos')
    .select(`id, negocio_id, filial_id, responsavel_id, previsto_para, tentativas,
      contato:contatos!contato_id(nome, telefone),
      passo:posvenda_cadencia_passos!passo_id(titulo, tipo_acao, roteiro, dia_offset),
      negocio:negocios!negocio_id(ganho_em, responsavel_id, produto:dados->>produto_interessado, venda:dados->venda),
      jornada:posvenda_jornadas!jornada_id(cadencia:posvenda_cadencias!cadencia_id(nome))`)
    .eq('empresa_id', opcoes.empresaId).eq('status', 'pendente')
    .lt('previsto_para', ate.toISOString())
    .order('previsto_para', { ascending: true }).order('id', { ascending: true })
    .limit(LIMITE_FILA)
  if (opcoes.so) q = q.eq('responsavel_id', opcoes.so)
  const { data, error } = await q
  if (error) throw new Error(`fila do pós-venda: ${error.message}`)
  const linhas = (data ?? []) as unknown as Linha[]

  const catIds = [...new Set(linhas.map((l) => um(l.negocio)?.venda?.categoria_id).filter((x): x is number => typeof x === 'number'))]
  const pessoas = [...new Set(linhas.flatMap((l) => [l.responsavel_id, um(l.negocio)?.responsavel_id ?? null]).filter((x): x is string => !!x))]
  const lojas = [...new Set(linhas.map((l) => l.filial_id).filter((x): x is number => x != null))]
  const [{ data: cats }, { data: users }, { data: fils }] = await Promise.all([
    catIds.length ? s.from('estoque_categorias').select('id, nome').in('id', catIds) : Promise.resolve({ data: [] }),
    pessoas.length ? s.from('usuarios').select('id, nome').in('id', pessoas) : Promise.resolve({ data: [] }),
    lojas.length ? s.from('filiais').select('id, nome').in('id', lojas) : Promise.resolve({ data: [] }),
  ])
  const nomeCat = new Map(((cats ?? []) as { id: number; nome: string }[]).map((c) => [c.id, c.nome]))
  const nomePessoa = new Map(((users ?? []) as { id: string; nome: string | null }[]).map((u) => [u.id, u.nome]))
  const nomeLoja = new Map(((fils ?? []) as { id: number; nome: string }[]).map((f) => [f.id, f.nome]))

  const itens: ItemPosVenda[] = linhas.map((l) => {
    const contato = um(l.contato)
    const passo = um(l.passo)
    const negocio = um(l.negocio)
    const previsto = diaNoFuso(new Date(l.previsto_para), opcoes.fuso)
    const grupo = grupoDoDia(previsto, hoje)
    const diaVenda = negocio?.venda?.data ?? (negocio?.ganho_em ? diaNoFuso(new Date(negocio.ganho_em), opcoes.fuso) : null)
    const categoria = negocio?.venda?.categoria_id != null ? nomeCat.get(negocio.venda.categoria_id) ?? null : null
    const produto = descricaoDaCompra(negocio?.produto, categoria, negocio?.venda?.condicao, opcoes.rotuloUsado)
    const loja = l.filial_id != null ? nomeLoja.get(l.filial_id) ?? null : null
    const vendedor = negocio?.responsavel_id ? nomePessoa.get(negocio.responsavel_id) ?? null : null
    return {
      id: l.id,
      negocioId: l.negocio_id,
      previsto,
      grupo,
      atraso: grupo === 'atrasados' ? diasDesdeAVenda(previsto, hoje) ?? 0 : 0,
      cliente: contato?.nome?.trim() || 'Cliente sem nome',
      telefone: contato?.telefone ?? null,
      produto,
      diasDaVenda: diasDesdeAVenda(diaVenda, hoje),
      passo: rotuloDoPasso(passo?.dia_offset, passo?.titulo ?? 'Passo'),
      tipo: passo?.tipo_acao ?? 'tarefa_interna',
      mensagem: montarMensagem(passo?.roteiro, { nome: contato?.nome, produto: negocio?.produto?.trim() || categoria, loja, vendedor }),
      regua: um(um(l.jornada)?.cadencia ?? null)?.nome ?? null,
      responsavelId: l.responsavel_id,
      responsavel: nomePessoa.get(l.responsavel_id) ?? null,
      loja,
      tentativas: l.tentativas ?? 0,
    }
  })
  return { itens: ordenarFila(itens), hoje, cortado: linhas.length >= LIMITE_FILA }
}
