import type { SupabaseClient } from '@supabase/supabase-js'
import { diaNoFuso, instanteLocal, somarDias } from '@/lib/datas'
import { semTipo } from '@/lib/posvenda/ligado'
import {
  decidirContato, descricaoDaCompra, primeiroNome, diasDesdeAVenda, grupoDoDia, montarMensagem, ordenarFila, rotuloDoPasso,
  type ConversaDoCanal, type ItemPosVenda, type TipoAcao,
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
  contato_id: number
  filial_id: number | null
  responsavel_id: string
  previsto_para: string
  tentativas: number
  contato: Embed<{ nome: string | null; telefone: string | null; dados: Record<string, unknown> | null }>
  passo: Embed<{ titulo: string; tipo_acao: TipoAcao; roteiro: string | null; dia_offset: number; modelo_id: number | null }>
  negocio: Embed<{ ganho_em: string | null; responsavel_id: string | null; produto: string | null; dados: Record<string, unknown> | null; venda: { data?: string; categoria_id?: number | null; condicao?: string } | null }>
  jornada: Embed<{ cadencia: Embed<{ nome: string }> }>
}

export const DIAS_A_FRENTE = 7
export const LIMITE_FILA = 400

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function carregarFilaPosVenda(db: SupabaseClient<any>, opcoes: {
  empresaId: number; fuso: string; rotuloUsado: string; so?: string | null; agora?: Date
  /** Categorias de modelo liberadas para o pós-venda (posvenda.categorias_modelo; padrão só Utilidade). */
  categoriasModelo?: string[]
}): Promise<{ itens: ItemPosVenda[]; hoje: string; cortado: boolean }> {
  const hoje = diaNoFuso(opcoes.agora ?? new Date(), opcoes.fuso)
  const ate = instanteLocal(somarDias(hoje, DIAS_A_FRENTE + 1), '00:00', opcoes.fuso)
  const s = semTipo(db)

  let q = s.from('posvenda_acompanhamentos')
    .select(`id, negocio_id, contato_id, filial_id, responsavel_id, previsto_para, tentativas,
      contato:contatos!contato_id(nome, telefone, dados),
      passo:posvenda_cadencia_passos!passo_id(titulo, tipo_acao, roteiro, dia_offset, modelo_id),
      negocio:negocios!negocio_id(ganho_em, responsavel_id, dados, produto:dados->>produto_interessado, venda:dados->venda),
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
  const conversa = await conversasNoWhatsAppDaLoja(s, linhas)
  const agora = opcoes.agora ?? new Date()

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
    // campos personalizados para {{campo:chave}}: os do negócio vencem os do contato
    const campos = { ...(contato?.dados ?? {}), ...(negocio?.dados ?? {}) }
    const mensagem = montarMensagem(passo?.roteiro, { nome: contato?.nome, produto: negocio?.produto?.trim() || categoria, loja, vendedor, campos })
    return {
      id: l.id,
      negocioId: l.negocio_id,
      filialId: l.filial_id,
      previsto,
      grupo,
      atraso: grupo === 'atrasados' ? diasDesdeAVenda(previsto, hoje) ?? 0 : 0,
      cliente: contato?.nome?.trim() || 'Cliente sem nome',
      telefone: contato?.telefone ?? null,
      produto,
      diasDaVenda: diasDesdeAVenda(diaVenda, hoje),
      passo: rotuloDoPasso(passo?.dia_offset, passo?.titulo ?? 'Passo'),
      tipo: passo?.tipo_acao ?? 'tarefa_interna',
      mensagem,
      regua: um(um(l.jornada)?.cadencia ?? null)?.nome ?? null,
      responsavelId: l.responsavel_id,
      responsavel: nomePessoa.get(l.responsavel_id) ?? null,
      loja,
      tentativas: l.tentativas ?? 0,
      contato: decidirContato(conversa.get(l.id) ?? null, contato?.telefone, mensagem, agora,
        { id: passo?.modelo_id ?? null, categorias: opcoes.categoriasModelo ?? ['UTILITY'],
          variaveis: [primeiroNome(contato?.nome), (negocio?.produto?.trim() || categoria || '')] }),
    }
  })
  return { itens: ordenarFila(itens), hoje, cortado: linhas.length >= LIMITE_FILA }
}

/**
 * A conversa de cada passo no WhatsApp CONECTADO da loja: do contato do passo, canal whatsapp ativo, de preferência o
 * canal da loja do passo; entre várias, a de mensagem mais recente. Pela sessão (RLS das conversas e canais).
 */
async function conversasNoWhatsAppDaLoja(s: SupabaseClient, linhas: Linha[]): Promise<Map<number, ConversaDoCanal>> {
  const out = new Map<number, ConversaDoCanal>()
  const contatos = [...new Set(linhas.map((l) => l.contato_id))]
  if (contatos.length === 0) return out
  type C = { id: number; contato_id: number; ultima_recebida_at: string | null; ultima_mensagem_at: string | null
    canal: Embed<{ tipo: string; status: string; filial_id: number | null }> }
  const { data } = await s.from('conversas')
    .select('id, contato_id, ultima_recebida_at, ultima_mensagem_at, canal:canais!canal_id(tipo, status, filial_id)')
    .in('contato_id', contatos).not('canal_id', 'is', null)
  const porContato = new Map<number, C[]>()
  for (const c of (data ?? []) as unknown as C[]) {
    const canal = um(c.canal)
    if (canal?.tipo !== 'whatsapp' || canal.status !== 'ativo') continue
    porContato.set(c.contato_id, [...(porContato.get(c.contato_id) ?? []), c])
  }
  for (const l of linhas) {
    const lista = (porContato.get(l.contato_id) ?? []).slice().sort((a, b) =>
      Number(um(b.canal)?.filial_id === l.filial_id) - Number(um(a.canal)?.filial_id === l.filial_id)
      || (b.ultima_mensagem_at ?? '').localeCompare(a.ultima_mensagem_at ?? ''))
    const c = lista[0]
    // O WhatsApp no Nexus é sempre a API oficial da Meta (lib/whatsapp/types.ts: o único provedor é 'official'): a
    // janela de 24 h vale para todo canal whatsapp, como no painel da conversa.
    if (c) out.set(l.id, { conversaId: c.id, canalTipo: 'whatsapp', oficial: true, ultimaRecebida: c.ultima_recebida_at })
  }
  return out
}
