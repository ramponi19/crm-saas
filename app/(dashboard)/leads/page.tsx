import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { LeadsView } from '@/components/modules/leads/leads-view'
import type { KanbanColumn, Motivo, Funil } from '@/components/modules/leads/types'
import { carregarConfigEmpresa, perfilDoLead, vocabulario } from '@/lib/empresa-config'
import { permsDoPapel, type PermissoesMap } from '@/lib/permissoes'
import { mergeScoreConfig, type ScoreConfig } from '@/lib/lead-score'
import { devolverLeadsSemResposta } from '@/lib/esteira'
import { after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export const metadata = {
  title: 'Leads — CRM SaaS',
}

/**
 * O QUADRO NÃO VEM MAIS DAQUI (04/11/2026).
 *
 * Até 03/11 esta página trazia TODOS os leads da empresa pela view `leads` — e
 * precisava, porque os contadores do topo eram contados sobre o que tinha sido
 * carregado (09/10: com o teto de mil linhas, a tela dizia 1.000 leads onde eram
 * 1.841, e 800 sem dono ficaram invisíveis). O preço era um documento de 5,1 MB
 * em Mogi para desenhar 5 colunas.
 *
 * Agora o servidor manda só a moldura (funis, etapas, equipe, quem pode ver o
 * quê). O navegador pede ao banco as contagens numa consulta agregada e os 50
 * mais recentes de cada etapa (lib/quadro.ts → quadro_contagens/quadro_pagina):
 * os números do topo continuam sendo da base inteira, não do que está na tela.
 */
export default async function LeadsPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const [{ data: usuarios }, { data: empresa }, { data: etapasRaw }, { data: motivosRaw }, { data: funisRaw }, cfg, { data: { user } }, { data: scoringRow }] = await Promise.all([
    supabase
      .from('empresa_usuarios')
      .select('usuario_id, role, usuarios!empresa_usuarios_usuario_public_fkey(id, nome)')
      .eq('empresa_id', empresaId)
      .eq('ativo', true),
    supabase.from('empresas').select('permissoes').eq('id', empresaId).single(),
    supabase.from('funil_etapas').select('slug, label, cor, tipo, ordem, funil_id, campos_obrigatorios').eq('empresa_id', empresaId).eq('ativo', true).order('ordem'),
    supabase.from('motivos_perda').select('id, label').eq('empresa_id', empresaId).eq('ativo', true).order('ordem'),
    supabase.from('funis').select('id, nome, padrao').eq('empresa_id', empresaId).order('padrao', { ascending: false }).order('nome'),
    carregarConfigEmpresa(supabase, empresaId ?? 0),
    supabase.auth.getUser(),
    supabase.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'lead_scoring').maybeSingle(),
  ])

  // Etapas do funil vindas do banco (fallback = funil padrão do código).
  type EtapaRow = { slug: string; label: string; cor: string; tipo: string; ordem: number; funil_id: number | null; campos_obrigatorios: unknown }
  const funilEtapas: KanbanColumn[] = ((etapasRaw ?? []) as EtapaRow[]).map((e) => ({
    id: e.slug,
    label: e.label,
    color: e.cor,
    tipo: e.tipo === 'negociacao' || e.tipo === 'ganho' || e.tipo === 'perdido' ? e.tipo : undefined,
    funilId: e.funil_id ?? undefined,
    camposObrigatorios: Array.isArray(e.campos_obrigatorios) ? (e.campos_obrigatorios as string[]) : [],
  }))

  type UsuarioVinculoRow = { usuario_id: string; role: string | null; usuarios: { id: string; nome: string } | { id: string; nome: string }[] | null }
  const usuariosMapped = ((usuarios ?? []) as unknown as UsuarioVinculoRow[]).map(eu => {
    const u = Array.isArray(eu.usuarios) ? eu.usuarios[0] : eu.usuarios
    return { id: eu.usuario_id, nome: u?.nome ?? '', role: eu.role ?? '' }
  })

  // Devolve à esteira quem passou do prazo sem responder. Roda aqui, na abertura
  // do funil, e não num cron: é exatamente quando alguém vai olhar a lista, e
  // não depende do plano da Vercel permitir cron de minuto em minuto. Tem
  // trava de 60s por empresa, então várias abas abrindo juntas não varrem em
  // duplicado. Falhar não pode derrubar a tela.
  //
  // `after()`: roda DEPOIS de a página ir para a tela. O que ela muda (lead
  // voltou para a esteira) chega pelo tempo real, que o quadro já escuta.
  after(async () => {
    try {
      await devolverLeadsSemResposta(supabase as unknown as SupabaseClient, empresaId)
    } catch (e) {
      console.error('[leads] devolução à esteira falhou:', e)
    }
  })

  // Visibilidade por permissão: só restringe quando o papel é CONHECIDO e
  // explicitamente sem "ver leads de outros". Papel desconhecido (ex.: superadmin
  // impersonando, que não está em empresa_usuarios) ou owner/admin → vê tudo.
  // Restrito vê os dele E a esteira: lead sem dono não é de ninguém, e lead novo
  // nasce sem dono — escondê-lo deixava o vendedor com o funil vazio.
  const meuRole = usuariosMapped.find((u) => u.id === user?.id)?.role ?? ''
  const restringe = !!meuRole && !permsDoPapel(meuRole, (empresa?.permissoes ?? null) as PermissoesMap | null).verLeadsOutros

  const scoreConfig = mergeScoreConfig((scoringRow?.valor ?? null) as Partial<ScoreConfig> | null)

  /**
   * Instante de referência dos tempos relativos ("há 5 min") e do score.
   * Server Component: roda uma vez por requisição — a regra de pureza não se
   * aplica aqui (mesmo caso de gestao-leads/page.tsx).
   */
  // eslint-disable-next-line react-hooks/purity
  const agora = Date.now()

  return (
    <LeadsView
      agora={agora}
      usuarios={usuariosMapped}
      empresaId={empresaId}
      perfil={perfilDoLead(cfg)}
      funilEtapas={funilEtapas}
      motivos={(motivosRaw ?? []) as Motivo[]}
      funis={(funisRaw ?? []) as Funil[]}
      scoreConfig={scoreConfig}
      restringe={restringe}
      meuId={user?.id}
      equipeLabel={vocabulario(cfg).equipe}
    />
  )
}
