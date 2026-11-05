import type { SupabaseClient } from '@supabase/supabase-js'
import { telefoneE164 } from '@/lib/telefone-e164'
import { conferirDocumento, soDigitos } from '@/lib/documento'

/**
 * CLIENTES — a camada única sobre `contatos` (lote 8 das views, 05/11/2026).
 *
 * Cliente não é tabela: é o contato com a marca `_cliente` em `dados`. Até aqui a
 * view `clientes` tirava ~30 colunas do JSON e o gatilho `compat_clientes_iud`
 * (INSTEAD OF, SECURITY DEFINER) montava o JSON de volta. Esta camada faz as duas
 * coisas em TypeScript, sem função nova no banco:
 *
 *   ler       `consultaClientes` (o builder do PostgREST já filtrado), `clienteDoContato`
 *             (a forma de sempre: endereco, cidade, tipo_cliente...), `lerTodosOsClientes`
 *   gravar    `criarCliente` e `atualizarCliente`, só pelo servidor (/api/clientes):
 *             a busca do contato pelo telefone precisa enxergar a empresa inteira,
 *             como o gatilho enxergava
 *
 * ONDE CADA CAMPO MORA
 *   colunas de contatos    nome, telefone, email, cpf_cnpj, instagram, observacoes, ativo
 *   contatos.endereco      logradouro (= `endereco` do cliente), numero, complemento,
 *                          bairro, cidade, estado, cep
 *   dados (campo do core)  data_nascimento, estado_civil, profissao, nacionalidade,
 *                          tipo_cliente, origem_cliente (core/campos.ts)
 *   dados (módulo Imóveis) tipo_negocio, valor_pretendido, regiao_interesse,
 *                          status_aprovacao, corretor_id, proprietario (core/modulos.ts)
 *   dados._cliente         a marca: cpf_validado, cnpj_validado, lead_id, usuario_id
 *
 * `contatos.tipo` (pessoa/empresa) e `contatos.origem` (o canal por onde o contato
 * chegou) existem mas dizem outra coisa: por isso tipo e origem DO CLIENTE são campos.
 * Campo só é gravado se a empresa o tem ativo, como o gatilho fazia — sem o módulo
 * Imóveis, os campos de imóvel não existem e não são gravados.
 *
 * Embed: quem lê o cliente de uma venda, garantia ou cobrança usa
 * `clientes:contatos!cliente_id(nome, telefone)` — a chave estrangeira já aponta para
 * `contatos` e o alias mantém a chave `clientes` no objeto. Só colunas, nunca `dados`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>
type Json = Record<string, unknown>

export interface Cliente {
  id: number
  empresa_id: number
  filial_id: number | null
  nome: string | null
  email: string | null
  telefone: string | null
  cpf_cnpj: string | null
  instagram: string | null
  observacoes: string | null
  ativo: boolean
  created_at: string
  cpf_validado: boolean
  cnpj_validado: boolean
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  data_nascimento: string | null
  estado_civil: string | null
  profissao: string | null
  nacionalidade: string | null
  tipo_cliente: string | null
  origem_cliente: string | null
  lead_id: number | null
  usuario_id: string | null
  tipo_negocio: string | null
  valor_pretendido: number | null
  regiao_interesse: string | null
  status_aprovacao: string
  corretor_id: string | null
  proprietario: boolean
}

/** O que a tela manda para criar ou mudar um cliente (campos ausentes = sem mudança). */
export type EntradaCliente = Partial<Omit<Cliente, 'id' | 'empresa_id' | 'created_at' | 'cpf_validado' | 'cnpj_validado'>>

/** Colunas de `contatos` que `clienteDoContato` precisa. */
export const COLUNAS_CLIENTE = 'id, empresa_id, filial_id, nome, email, telefone, cpf_cnpj, instagram, observacoes, ativo, created_at, endereco, dados'

const CHAVES_ENDERECO = { endereco: 'logradouro', numero: 'numero', complemento: 'complemento', bairro: 'bairro', cidade: 'cidade', estado: 'estado', cep: 'cep' } as const
/** Chaves do cliente que vivem em `dados` como campo personalizado (do core ou do módulo). */
const CHAVES_EM_DADOS = ['data_nascimento', 'estado_civil', 'profissao', 'nacionalidade', 'tipo_cliente', 'origem_cliente',
  'tipo_negocio', 'valor_pretendido', 'regiao_interesse', 'status_aprovacao', 'corretor_id', 'proprietario'] as const
/** O que o gatilho preenchia quando vinha vazio. */
const PADRAO: Partial<Record<(typeof CHAVES_EM_DADOS)[number], unknown>> = {
  tipo_cliente: 'Novo', origem_cliente: 'Loja física', status_aprovacao: 'pendente', proprietario: false,
}

const texto = (v: unknown): string | null => (v == null || v === '' ? null : String(v))
const numero = (v: unknown): number | null => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const vazioFora = (o: Json): Json => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ''))

/**
 * Os clientes, como builder do PostgREST: o chamador escolhe colunas de `contatos`
 * e encadeia os filtros (`.eq('ativo', true)`, `.ilike('nome', ...)`, `.in('id', ...)`).
 * Colunas que não são de `contatos` (cidade, tipo_cliente...) pedem `COLUNAS_CLIENTE`
 * e `clienteDoContato`.
 */
export function consultaClientes(db: Db, colunas: string = COLUNAS_CLIENTE, opcoes?: { count?: 'exact'; head?: boolean }) {
  // `as '*'`: as colunas são escolhidas por quem chama; a linha volta sem tipo (as telas já a tipam).
  return db.from('contatos').select(colunas as '*', opcoes).not('dados->_cliente', 'is', null)
}

/** Quantos clientes a empresa tem (`ativos`: só os ativos). */
export async function contarClientes(db: Db, empresaId: number, { ativos = false } = {}): Promise<number> {
  let q = consultaClientes(db, 'id', { count: 'exact', head: true }).eq('empresa_id', empresaId)
  if (ativos) q = q.eq('ativo', true)
  const { count } = await q
  return count ?? 0
}

/** Linha de `contatos` (com `COLUNAS_CLIENTE`) na forma do cliente. */
export function clienteDoContato(r: Json): Cliente {
  const d = (r.dados ?? {}) as Json
  const m = (d._cliente ?? {}) as Json
  const e = (r.endereco ?? {}) as Json
  return {
    id: Number(r.id),
    empresa_id: Number(r.empresa_id),
    filial_id: numero(r.filial_id),
    nome: texto(r.nome),
    email: texto(r.email),
    telefone: texto(r.telefone),
    cpf_cnpj: texto(r.cpf_cnpj),
    instagram: texto(r.instagram),
    observacoes: texto(r.observacoes),
    ativo: r.ativo !== false,
    created_at: String(r.created_at ?? ''),
    cpf_validado: m.cpf_validado === true,
    cnpj_validado: m.cnpj_validado === true,
    endereco: texto(e.logradouro),
    numero: texto(e.numero),
    complemento: texto(e.complemento),
    bairro: texto(e.bairro),
    cidade: texto(e.cidade),
    estado: texto(e.estado),
    cep: texto(e.cep),
    data_nascimento: texto(d.data_nascimento)?.slice(0, 10) ?? null,
    estado_civil: texto(d.estado_civil),
    profissao: texto(d.profissao),
    nacionalidade: texto(d.nacionalidade),
    tipo_cliente: texto(d.tipo_cliente),
    origem_cliente: texto(d.origem_cliente),
    lead_id: numero(m.lead_id),
    usuario_id: texto(m.usuario_id),
    tipo_negocio: texto(d.tipo_negocio),
    valor_pretendido: numero(d.valor_pretendido),
    regiao_interesse: texto(d.regiao_interesse),
    status_aprovacao: texto(d.status_aprovacao) ?? 'pendente',
    corretor_id: texto(d.corretor_id),
    proprietario: d.proprietario === true,
  }
}

/** Um cliente pelo id (nulo se não existe, não é cliente ou a RLS não mostra). */
export async function lerCliente(db: Db, id: number): Promise<Cliente | null> {
  const { data } = await consultaClientes(db).eq('id', id).maybeSingle()
  return data ? clienteDoContato(data as Json) : null
}

/** Todos os clientes da empresa, de mil em mil (o PostgREST corta em mil), por nome. */
export async function lerTodosOsClientes(db: Db, empresaId: number): Promise<Cliente[]> {
  const out: Cliente[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consultaClientes(db).eq('empresa_id', empresaId)
      .order('nome').order('id').range(de, de + 999)
    if (error) throw new Error(`clientes: ${error.message}`)
    const lote = (data ?? []) as Json[]
    out.push(...lote.map(clienteDoContato))
    if (lote.length < 1000) return out
  }
}

// ---------------------------------------------------------------- gravação (servidor)

/** As chaves de contato que a empresa tem como campo ativo. */
async function camposAtivos(svc: Db, empresaId: number): Promise<Set<string>> {
  const { data } = await svc.from('campos_personalizados').select('chave')
    .eq('empresa_id', empresaId).eq('entidade', 'contato').eq('ativo', true)
  return new Set(((data ?? []) as { chave: string }[]).map((c) => c.chave))
}

/** Os campos de `dados` a gravar: só os que a empresa tem, no tipo que o banco confere. */
function camposParaDados(c: EntradaCliente, ativos: Set<string>): Json {
  const out: Json = {}
  for (const k of CHAVES_EM_DADOS) {
    if (!ativos.has(k)) continue
    let v: unknown = c[k] ?? PADRAO[k]
    if (v == null || v === '') continue
    if (k === 'valor_pretendido') v = numero(v)
    else if (k === 'proprietario') v = v === true
    else if (k === 'data_nascimento') v = String(v).slice(0, 10)
    else v = String(v)
    if (v != null) out[k] = v
  }
  return out
}

function enderecoDe(c: EntradaCliente): Json {
  return vazioFora(Object.fromEntries(Object.entries(CHAVES_ENDERECO).map(([de, para]) => [para, texto(c[de as keyof typeof CHAVES_ENDERECO])])))
}

/** A marca `_cliente`: o que havia nela (fora o que virou campo) + validação e vínculos. */
function marcaDe(anterior: Json | undefined, c: EntradaCliente, doc: { cpf: boolean; cnpj: boolean }): Json {
  const base = Object.fromEntries(Object.entries(anterior ?? {}).filter(([k]) => !(CHAVES_EM_DADOS as readonly string[]).includes(k)))
  return vazioFora({ ...base, cpf_validado: doc.cpf, cnpj_validado: doc.cnpj, lead_id: c.lead_id ?? null, usuario_id: c.usuario_id ?? null })
}

/** As chaves que a tela pode mandar para gravar; o resto do corpo é ignorado. */
const CHAVES_DA_ENTRADA: (keyof EntradaCliente)[] = [
  'nome', 'email', 'telefone', 'cpf_cnpj', 'instagram', 'observacoes', 'ativo', 'filial_id',
  'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'estado', 'cep',
  'data_nascimento', 'estado_civil', 'profissao', 'nacionalidade', 'tipo_cliente', 'origem_cliente',
  'lead_id', 'usuario_id', 'tipo_negocio', 'valor_pretendido', 'regiao_interesse', 'status_aprovacao', 'corretor_id', 'proprietario',
]

export function entradaDoCorpo(b: unknown): EntradaCliente {
  const o = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>
  return Object.fromEntries(CHAVES_DA_ENTRADA.filter((k) => k in o).map((k) => [k, o[k]])) as EntradaCliente
}

export type ResultadoGravacao = { cliente: Cliente; error?: never; status?: never } | { error: string; status: number; cliente?: never }

/**
 * CRIA o cliente — ou marca como cliente o contato que já existe com o mesmo telefone
 * (ou o do lead informado), como o gatilho fazia: o contato que já existe vence nos
 * campos que tem preenchidos. `svc` é o cliente de serviço: a busca pelo telefone tem
 * de achar o contato de outra loja da mesma empresa, senão o índice único recusa.
 * `filialId` = a loja de gravação de quem cadastra (`filial_gravacao`).
 */
export async function criarCliente(svc: Db, empresaId: number, filialId: number | null, c: EntradaCliente): Promise<ResultadoGravacao> {
  const doc = conferirDocumento(c.cpf_cnpj)
  if (!doc.ok) return { error: doc.erro, status: 400 }
  if (!texto(c.nome)) return { error: 'Informe o nome', status: 400 }

  const e164 = telefoneE164(c.telefone)
  const ativos = await camposAtivos(svc, empresaId)
  const campos = camposParaDados(c, ativos)
  const endereco = enderecoDe(c)

  let existente: Json | null = null
  if (e164) {
    const { data } = await svc.from('contatos').select('*').eq('empresa_id', empresaId).eq('telefone_e164', e164).maybeSingle()
    existente = data
  }
  if (!existente && c.lead_id != null) {
    const { data: neg } = await svc.from('negocios').select('contato_id').eq('id', c.lead_id).eq('empresa_id', empresaId).maybeSingle()
    if (neg) existente = (await svc.from('contatos').select('*').eq('id', neg.contato_id).maybeSingle()).data
  }

  let id: number
  if (!existente) {
    const { data, error } = await svc.from('contatos').insert({
      empresa_id: empresaId, filial_id: c.filial_id ?? filialId, nome: texto(c.nome), telefone: texto(c.telefone),
      telefone_e164: e164, email: texto(c.email), cpf_cnpj: texto(c.cpf_cnpj), instagram: texto(c.instagram),
      origem: texto(c.origem_cliente), tipo: soDigitos(c.cpf_cnpj).length === 14 ? 'empresa' : 'pessoa',
      ativo: c.ativo ?? true, observacoes: texto(c.observacoes), endereco,
      dados: { ...campos, _cliente: marcaDe(undefined, c, doc) },
    }).select('id').single()
    if (error || !data) return { error: error?.message ?? 'Não foi possível cadastrar', status: 500 }
    id = data.id
  } else {
    const x = existente
    const dadosAntes = (x.dados ?? {}) as Json
    const { error } = await svc.from('contatos').update({
      nome: x.nome ?? texto(c.nome), email: x.email ?? texto(c.email), cpf_cnpj: x.cpf_cnpj ?? texto(c.cpf_cnpj),
      instagram: x.instagram ?? texto(c.instagram), telefone: x.telefone ?? texto(c.telefone),
      telefone_e164: x.telefone_e164 ?? e164,
      endereco: { ...endereco, ...((x.endereco ?? {}) as Json) },
      dados: { ...campos, ...dadosAntes, _cliente: marcaDe(dadosAntes._cliente as Json | undefined, c, doc) },
    }).eq('id', x.id as number)
    if (error) return { error: error.message, status: 500 }
    id = x.id as number
  }
  const cliente = await lerCliente(svc, id)
  return cliente ? { cliente } : { error: 'Cadastrado, mas não consegui reler o cliente', status: 500 }
}

/**
 * MUDA o cliente `id`. `db` é o cliente da sessão: se a RLS não mostra o contato,
 * a pessoa não pode mexer nele (era o que a view com `security_invoker` garantia).
 * A gravação vai pelo `svc`, como ia pelo gatilho SECURITY DEFINER.
 *
 * A loja do contato NÃO é regravada: o gatilho a reescrevia em toda edição, e
 * `contatos_propagar_filial` (AFTER UPDATE OF filial_id) levava junto os negócios e
 * as conversas das outras lojas para a loja do contato.
 */
export async function atualizarCliente(db: Db, svc: Db, empresaId: number, id: number, patch: EntradaCliente): Promise<ResultadoGravacao> {
  const { data: linha } = await consultaClientes(db, '*').eq('id', id).eq('empresa_id', empresaId).maybeSingle()
  if (!linha) return { error: 'Cliente não encontrado', status: 404 }
  const row = linha as Json
  const atual = clienteDoContato(row)
  const novo: EntradaCliente = { ...atual, ...patch }

  // O documento é conferido quando a tela o manda; desativar não depende dele.
  const doc = 'cpf_cnpj' in patch
    ? conferirDocumento(novo.cpf_cnpj)
    : { ok: true as const, cpf: atual.cpf_validado, cnpj: atual.cnpj_validado }
  if (!doc.ok) return { error: doc.erro, status: 400 }
  if (!texto(novo.nome)) return { error: 'Informe o nome', status: 400 }

  // Telefone novo que já é de outro contato: grava o texto e mantém a chave antiga (o gatilho fazia igual).
  let e164 = telefoneE164(novo.telefone)
  if (e164 && e164 !== row.telefone_e164) {
    const { count } = await svc.from('contatos').select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId).eq('telefone_e164', e164).neq('id', id)
    if (count) e164 = (row.telefone_e164 as string | null) ?? null
  }

  const ativos = await camposAtivos(svc, empresaId)
  const dadosAntes = (row.dados ?? {}) as Json
  const dadosFora = Object.fromEntries(Object.entries(dadosAntes).filter(([k]) => !(CHAVES_EM_DADOS as readonly string[]).includes(k) && k !== '_cliente'))
  const { error } = await svc.from('contatos').update({
    nome: texto(novo.nome), email: texto(novo.email), telefone: texto(novo.telefone), telefone_e164: e164,
    cpf_cnpj: texto(novo.cpf_cnpj), instagram: texto(novo.instagram), ativo: novo.ativo ?? true,
    observacoes: texto(novo.observacoes), endereco: enderecoDe(novo),
    dados: { ...dadosFora, ...camposParaDados(novo, ativos), _cliente: marcaDe(dadosAntes._cliente as Json | undefined, novo, doc) },
  }).eq('id', id).eq('empresa_id', empresaId)
  if (error) return { error: error.message, status: 500 }
  const cliente = await lerCliente(svc, id)
  return cliente ? { cliente } : { error: 'Salvo, mas não consegui reler o cliente', status: 500 }
}
