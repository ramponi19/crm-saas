import { redirect } from 'next/navigation'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { fusoDaEmpresa } from '@/lib/fuso-empresa'
import { carregarConfigEmpresa } from '@/lib/empresa-config'
import { posvendaLigado, semTipo } from '@/lib/posvenda/ligado'
import { categoriasPermitidas } from '@/lib/posvenda/config'
import { carregarFilaPosVenda } from '@/lib/posvenda/carregar-fila'
import { envelopesDaConfig } from '@/lib/config'
import { FilaPosVenda, type AposNota } from './fila-pos-venda'

export const metadata = { title: 'Pós-venda' }

/**
 * FILA DO PÓS-VENDA (C7 bloco 2, 24/11/2026; docs/design-pos-venda.md §2.5.2).
 * Atrasados · Hoje · Próximos 7 dias. O vendedor vê os dele (RLS); dono e administrador escolhem Meus ou Todos.
 * A trava: a linha do módulo em empresa_modulos (lib/posvenda/ligado.ts); o proxy já barra a tela enquanto o módulo
 * está em preparação (só o superadmin entra).
 */
export default async function PosVendaPage({ searchParams }: { searchParams: Promise<{ ver?: string; pessoa?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const empresaId = await getEmpresaId()
  if (!empresaId) redirect('/dashboard')

  const service = createServiceClient()
  const [ligado, { data: vinc }, { data: eu }, fuso, cfg, sp, { data: cats }, cfgPv] = await Promise.all([
    posvendaLigado(service, empresaId),
    service.from('empresa_usuarios').select('role').eq('empresa_id', empresaId).eq('usuario_id', user.id).eq('ativo', true).maybeSingle(),
    supabase.from('usuarios').select('is_super_admin').eq('id', user.id).maybeSingle(),
    fusoDaEmpresa(supabase, empresaId),
    carregarConfigEmpresa(supabase, empresaId),
    searchParams,
    semTipo(service).rpc('config_valor_emp', { p_empresa: empresaId, p_modulo: 'posvenda', p_chave: 'categorias_modelo' }),
    envelopesDaConfig(service, empresaId, { chaves: ['posvenda.nps_limite_chamado', 'posvenda.link_avaliacao', 'posvenda.mensagem_promotor', 'posvenda.mensagem_neutro'] }),
  ])
  if (!ligado) return <FilaPosVenda desligado itens={[]} hoje="" podeVerTodos={false} ver="meus" cortado={false} />

  const podeVerTodos = !!eu?.is_super_admin || ['owner', 'admin'].includes(vinc?.role ?? '')
  const ver = podeVerTodos && sp.ver === 'todos' ? 'todos' : 'meus'
  // Do painel do gestor: a fila de UMA pessoa (só dono/administrador).
  const pessoa = podeVerTodos && sp.pessoa && /^[0-9a-f-]{36}$/i.test(sp.pessoa) ? sp.pessoa : null
  const { data: pessoaRow } = pessoa ? await service.from('usuarios').select('nome').eq('id', pessoa).maybeSingle() : { data: null }
  const { itens, hoje, cortado } = await carregarFilaPosVenda(supabase, {
    empresaId, fuso, rotuloUsado: cfg.vocabulario.usado ?? 'Usado', so: pessoa ?? (ver === 'meus' ? user.id : null),
    categoriasModelo: categoriasPermitidas(cats),
  })
  // Depois da nota: limite do chamado, link de avaliação (loja → empresa) e os textos da empresa.
  const valor = (k: string) => cfgPv[`posvenda.${k}`] ?? null
  const aposNota: AposNota = {
    limite: Number(valor('nps_limite_chamado')?.empresa ?? 6),
    linkEmpresa: (valor('link_avaliacao')?.empresa as string | null) ?? null,
    linkPorLoja: (valor('link_avaliacao')?.lojas ?? {}) as Record<string, string>,
    textoPromotor: (valor('mensagem_promotor')?.empresa as string | null) ?? null,
    textoNeutro: (valor('mensagem_neutro')?.empresa as string | null) ?? null,
  }
  // key: trocar Meus/Todos monta a fila de novo com os itens da outra visão (o estado local começa das props).
  return <FilaPosVenda key={`${ver}:${pessoa ?? ''}`} itens={itens} hoje={hoje} podeVerTodos={podeVerTodos} ver={ver} cortado={cortado} aposNota={aposNota}
    pessoa={pessoa ? { id: pessoa, nome: (pessoaRow as { nome: string | null } | null)?.nome?.trim() || 'Sem nome' } : null} />
}
